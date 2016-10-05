#!/usr/bin/python
# vim:ts=2 sw=2

"""CherryPy server that runs R processes and loads, filters, and visualizes Rdata files"""
from __future__ import absolute_import
from __future__ import print_function
import os, re
import json
import urllib
try: 
  import urlparse
  from urllib import unquote
except ImportError:
  import urllib.parse as urlparse
  from urllib.parse import unquote
import logging
import mimetypes
# this is a new dependency
import cachetools # pip install cachetools
import numpy as np
import pandas as pd

import cherrypy

from cherrypy.lib.static import serve_file
from cherrypy.lib.static import serve_download

from jinja2        import Environment, FileSystemLoader
from jinja2support import Jinja2TemplatePlugin, Jinja2Tool

import DataService as ds
from six.moves import range

code_dir = os.path.dirname(os.path.abspath(__file__))
mimetypes.types_map[".xml"]="application/xml"

'''
r['getwd()']
#r['a<-5;a+3'] # doesn't return. Implies parsing or execution error, but would run as a one liner in the GUI
r = R()
r['data(trees)']
a = r.trees
type(a)
a[:4]
a[3:40]
a.loc[a.loc[:,'Girth'] > 12,:]
'''

# Jinja2 renders templates to html (or other text formats)
# Hat tip to: https://bitbucket.org/Lawouach/cherrypy-recipes/src/c399b40a3251/web/templating/jinja2_templating?at=default
# Register the Jinja2 plugin
env = Environment(loader=FileSystemLoader(os.path.join(code_dir,"template")))
Jinja2TemplatePlugin(cherrypy.engine, env=env).subscribe()

# Register the Jinja2 tool
cherrypy.tools.template = Jinja2Tool()

# This function checks if the user is connected via https and if not redirects to it
# In case users are worried about privacy, we want to make sure uploads are not done 
# in the clear!
def force_https():
    secure = cherrypy.request.scheme == 'https'
    if not secure:
        url = urlparse.urlparse(cherrypy.url())
        secure_url = urlparse.urlunsplit(('https', url[1], url[2], url[3], url[4]))
        raise cherrypy.HTTPRedirect(secure_url)

# check for https on every request cherrypy handles
cherrypy.tools.force_https = cherrypy.Tool('before_handler', force_https)

class Root: # the root serves (mostly) static site content

  # home/landing/welcome page
  @cherrypy.expose
  def index(self):
    count = cherrypy.session.get("count", 0) + 1
    cherrypy.session["count"] = count
    template = env.get_template("index.html")
    response_dict = {} #"foo":"hi", "bar":"there"}
    return template.render(**response_dict)

  @cherrypy.expose
  def jsdoc(self):
    import markdown
    count = cherrypy.session.get("count", 0) + 1
    cherrypy.session["count"] = count
    template = env.get_template("index.html")
    response_dict = {} #"foo":"hi", "bar":"there"}
    input_file = open('static/js/README.md','r')
    text = input_file.read()
    return markdown.markdown(text)

  # home/landing/welcome page
  @cherrypy.expose
  def charts(self):
    count = cherrypy.session.get("count", 0) + 1
    cherrypy.session["count"] = count
    template = env.get_template("charts.html")
    response_dict = {}
    return template.render(**response_dict)

class QueryService(object):
  
  META_CACHE = {}
  def metaDataResponse(self,qs):
    if type(qs) == str:
      queryObj = ds.parseDesc(qs)
    else: queryObj = qs
    #print json.dumps(queryObj, indent=2)
    if queryObj['colList'] or queryObj['colInfo']:
      # todo: what to do when there is more than one source?
      dataSourceName = list(queryObj['dataSource'].keys())[0] # note that this is a hack to return just the first one
      # todo: what to do with data sources that are too big?
      if queryObj['colList']:
        df = ds.restQuery('/s/' + dataSourceName) # get the full set of data
        return json.dumps(df.columns.values.tolist()).encode('utf-8')
      if queryObj['colInfo']: 
        if dataSourceName in self.META_CACHE: # check for and use the cache
          print('Metadata from memory cache for %s' % (dataSourceName))
          meta = self.META_CACHE[dataSourceName]
        else:
          df = ds.restQuery('/s/' + dataSourceName) # get the full set of data
          desc = df.describe().transpose() # get basic stats for numerical columns
          meta = ds.DataSource().getMetaData(dataSourceName) # get manual column metadata
          if(meta is None): meta = pd.DataFrame(df.columns.values,index=df.columns.values,columns=['label'])
          #meta = meta.join(desc)           # join on feature names, which are the indices
          meta = pd.merge(meta, desc, left_index=True, right_index=True, how='left') # alternate join approach is more flexible
          self.META_CACHE[dataSourceName] = meta
        print(meta.head())
        print('That was the head of the column metadata')
        # must convert mixed data types (NaNs are considered floats or float64s)
        # to single str dtype due to bug in pandas. the JS lient doesn't care whether strings or 
        # mixed values are provided, so this work around is OK.
        # see: https://github.com/pydata/pandas/issues/10289
        return meta.astype(str).to_json(orient='index').encode('utf-8')
    else: return None
 
  @cherrypy.expose
  def default(self,*args,**kwargs):
    # accept json structured query objects via post
    if cherrypy.request.method == 'POST':
      cl       = cherrypy.request.headers['Content-Length']
      rawbody  = cherrypy.request.body.read(int(cl))
      queryObj = json.loads(rawbody)
    else: 
      qs = unquote(cherrypy.request.query_string) # decode < and > symbols
      queryObj = ds.parseDesc(qs)
    cherrypy.response.headers['Content-Type'] = 'application/json'
    mdr = self.metaDataResponse(queryObj)
    if mdr: return mdr
    # TODO: deprecate the use of ExpiringDict as it doesn't support Python 3 (md5 is gone)
    # Use cachetools.TTLCache(maxsize=20, ttl=30*60)
    # Note that memory isn't freed for expired items until a mutating set/delete operation is called.
    # https://pythonhosted.org/cachetools/

    expiringFilterCache = cherrypy.session.setdefault('EXPIRING_FILTER_CACHE', cachetools.TTLCache(maxsize=20, ttl=30*60))
    # ExpiringDict is a fisrt in first out
    #expiringFilterCache = cherrypy.session.setdefault('EXPIRING_FILTER_CACHE', ExpiringDict(max_len=20, max_age_seconds=30*60))
    # OR non-expiring version which would leak memory
    #expiringFilterCache = cherrypy.session.setdefault('EXPIRING_FILTER_CACHE', dict())
    
    df = ds.executeQuery(queryObj, expiringFilterCache) # pass in the session to allow query result caching
    if (queryObj['fmt'] == 'csv'): 
      cherrypy.response.headers['Content-Type']        = 'text/csv'
      cherrypy.response.headers["Content-Disposition"] = "attachment; filename=VISDOM_export.csv"
      cherrypy.response.headers["Pragma"]              = "no-cache"
      cherrypy.response.headers["Expires"]             = "0"
      return df.to_csv().encode('utf-8')
    return df.to_json(orient='split').encode('utf-8')
  
  @cherrypy.expose
  def sources(self):
    cherrypy.response.headers['Content-Type'] = 'application/json'
    return json.dumps(ds.publicSources()).encode('utf-8')

  @cherrypy.expose
  def parse(self,**kwargs):
    cherrypy.response.headers['Content-Type'] = 'application/json'
    qs = unquote(cherrypy.request.query_string) # decode < and > symbols
    print(ds.pretty(ds.parseDesc(qs)))
    return ds.pretty(ds.parseDesc(qs)).encode('utf-8')

  @cherrypy.expose
  def shape(self,*args,**kwargs):
    cherrypy.response.headers['Content-Type'] = 'application/json'
    # query string
    qs = unquote(cherrypy.request.query_string) # decode < and > symbols
    mdr = self.metaDataResponse(qs)
    if mdr: return mdr
    pieces = qs.split('/')
    print(pieces)
    sourceName = pieces[2]
    sourceCfg = ds.DataSource().getCfg(sourceName)
    if sourceCfg is None: 
      raise ValueError("no config info available for %s" % sourceName)
    sourcePrefix = sourceCfg.get('prefix',None)
    if sourcePrefix is None: sourcePrefix = sourceName
    sortType = pieces[3]  # 'counts' or 'kwh'
    topN = int(pieces[4])
    qs = '/' + '/'.join(pieces[5:])
    #print sortType, topN, qs
    #/counts/10 or /kwh/10
    ids = ds.restQuery('/s/' + sourceName + '|id' + qs) # find the list of unique ids filtered using the /f/etc. query 
    # load the counts of shapes per customer per dict shape
    dictMembers = ds.restQuery('/s/%sDictMembers' % sourcePrefix)
    dictKwh     = ds.restQuery('/s/%sDictKwh' % sourcePrefix)
    firstDataColIdx = 1
    idName = 'id'
    filteredDataColIdx = 1
    # TODO: hack to support hand coded pgeres data along side standardized new VISDOM-R encoded data
    if sourcePrefix == 'pgeres':
      firstDataColIdx = 3
      filteredDataColIdx = 4
      idName = 'sp_id'

    # total all the cluster members (total # of shapes) and all the kwh
    totalMembers  = float(dictMembers.iloc[:,firstDataColIdx:].sum().sum()) # sum both dimensions, ensuring float outcome
    totalKwh      = dictKwh.iloc[:,firstDataColIdx:].sum().sum()            # sum both dimensions
    print('Total: Members: %d, kWh: %0.1f' % (totalMembers, totalKwh))
    filteredCounts = pd.merge(ids, dictMembers, left_on='id', right_on=idName, how='inner')
    # load the kwh sums of shapes per customer per dict shape
    filteredKwh    = pd.merge(ids, dictKwh,     left_on='id', right_on=idName, how='inner')

    
    print('Filtered customer count: %d' % len(ids))
    print('Filtered customers with shape data: %d' % len(filteredCounts.index))
    # load the dictionary shapes
    shapes = ds.restQuery('/s/%sDictCenters' % sourcePrefix)
    if topN > len(shapes.index): topN = len(shapes.index)
    countSum = filteredCounts.iloc[:,filteredDataColIdx:].sum(axis=0) # sum the cluster membership count columns
    kwhSum   =    filteredKwh.iloc[:,filteredDataColIdx:].sum(axis=0) # sum the cluster kwh total columns

    # compute the membership counts and total energy for each of the qualitative categories 
    categoryMap = ds.restQuery('/s/%sCategoryMapping'  % sourcePrefix) # load shapes to qualitative categories
    categoryMap['total_members'] = countSum.tolist() # strip the index so they match
    categoryMap['total_kwh']     = kwhSum.tolist()   # strip the index so they match
    categoryGroups = categoryMap[['name','total_members','total_kwh']].groupby('name')
    
    categoryStats                         = categoryGroups.sum()
    categoryStats['pct_kwh']              = categoryStats.total_kwh     / totalKwh
    categoryStats['pct_members']          = categoryStats.total_members / totalMembers
    categoryStats['pct_filtered_kwh']     = categoryStats.total_kwh     / categoryMap['total_kwh'].sum()
    categoryStats['pct_filtered_members'] = categoryStats.total_members / categoryMap['total_members'].sum()
    categoryStats['name']                 = categoryStats.index # add the index as a regular column, so the json format can be records.
    print(categoryStats)
    if sortType == 'members':
      sortIdx = np.argsort(countSum)[::-1] # note that [::-1] reverses the array
    elif sortType == 'kwh':
      sortIdx = np.argsort(  kwhSum)[::-1]
    else: 
      raise ValueError('Bad sortType=%s from query %s' % (sortType,qs))
    
    topIdx = sortIdx[list(range(topN))].as_matrix()

    topShapes = shapes.iloc[topIdx,:]
    #print pd.Series(kwhSum[topIdx].as_matrix(), index=topShapes.index)
    print('Filtered: Members: %d, kWh: %0.1f' % (kwhSum[topIdx].sum(), countSum[topIdx].sum()))

    topShapes['total_kwh']            = pd.Series(  kwhSum[topIdx].as_matrix(),                               index=topShapes.index)
    topShapes['total_members']        = pd.Series(countSum[topIdx].as_matrix(),                               index=topShapes.index)
    topShapes['pct_kwh']              = pd.Series(  kwhSum[topIdx].as_matrix() * 100 / totalKwh,              index=topShapes.index)
    topShapes['pct_members']          = pd.Series(countSum[topIdx].as_matrix() * 100 / totalMembers,          index=topShapes.index)
    topShapes['pct_filtered_kwh']     = pd.Series(  kwhSum[topIdx].as_matrix() * 100 / kwhSum.sum(),          index=topShapes.index)
    topShapes['pct_filtered_members'] = pd.Series(countSum[topIdx].as_matrix() * 100 / float(countSum.sum()), index=topShapes.index)
    
    # building a json format map with the top shapes under "top" and the categorical totals under "categories"
    out = '{"top":%s,"categories":%s}' % (topShapes.to_json(orient='split'),categoryStats.to_json(orient='records'))
    return out.encode('utf-8')

  @cherrypy.expose
  def response(self,*args,**kwargs):
    cherrypy.response.headers['Content-Type'] = 'application/json'
    # query string
    qs = unquote(cherrypy.request.query_string) # decode < and > symbols
    mdr = self.metaDataResponse(qs)
    if mdr: return mdr
    pieces = qs.split('/')
    print(pieces)
    sourceName = pieces[2]
    sourceCfg = ds.DataSource().getCfg(sourceName)
    if sourceCfg is None: 
      raise ValueError("no config info available for %s" % sourceName)
    sourcePrefix = sourceCfg.get('prefix',None)
    if sourcePrefix is None: sourcePrefix = sourceName
    sortType = pieces[3]  # 'savings' or 'pct_savings'
    desc = pieces[4] == 'true'
    topN = int(pieces[5])
    qs = '/' + '/'.join(pieces[6:])
    #print sortType, topN, qs
    #/counts/10 or /kwh/10
    ids = ds.restQuery('/s/' + sourceName + '|id' + qs) # find the list of unique ids filtered using the /f/etc. query 
    # load the counts of shapes per customer per dict shape
    custResponse  = ds.restQuery('/s/%sResponseCustomer' % sourcePrefix)
    eventResponse = ds.restQuery('/s/%sResponseEvent' % sourcePrefix)
    firstFcst = eventResponse.columns.get_loc('hkw1_fcst')
    firstObs  = eventResponse.columns.get_loc('hkw1_obs')
    forecast = np.array( [ float( row[ firstFcst - 1 + row['hour']] + 0.0000001 ) # prevent divide by zero
                            for index, row in eventResponse.iterrows() ] )
    actual   = np.array( [ float( row[ firstObs  - 1 + row['hour']] + 0.0000001 ) # prevent imbalance from / 0
                            for index, row in eventResponse.iterrows() ] )
    eventResponse['pct_savings'] = (forecast - actual) / forecast
    eventResponse['savings']     = forecast - actual
    eventResponse['forecast']    = forecast
    eventResponse['actual']      = actual
    # sort using the specified sort order
    eventResponse = eventResponse.sort(sortType,ascending=(not desc))
    
    # building a json format map with the top shapes under "top" and the categorical totals under "categories"
    #return '{"top":%s,"categories":%s}' % (topShapes.to_json(orient='split'),categoryStats.to_json(orient='records')) 
    out = '{"top":%s}' % (eventResponse.head(topN).to_json(orient='split'))
    return out.encode('utf-8')

if __name__ == "__main__":
  CONSOLE_LOG = False
  # this controlls logging from all calls to logging anywhere in the app!
  logging.basicConfig( format='%(asctime)s %(levelname)s %(module)s.%(funcName)s[%(lineno)d]: %(message)s', 
                        datefmt='%m/%d %H:%M:%S',
                        level=logging.DEBUG, 
                        filename='log/seserver.log' )
  if(CONSOLE_LOG): # if we want to log to both the console and the file
    # define a logging handler that writes to sys.stderr
    console = logging.StreamHandler()
    console.setLevel(logging.DEBUG)
    console.setFormatter( 
        logging.Formatter(' %(asctime)s %(levelname)s %(module)s.%(funcName)s[%(lineno)d]: %(message)s', 
                           datefmt='%m/%d %H:%M:%S') ) 
    # add the handler to the root logger
    logging.getLogger('').addHandler(console)
  logging.info('Logging started')

  bft_conf = os.path.join(os.path.dirname(__file__), "se.conf")
  root          = Root()
  root.query    = QueryService()
  #root.img      = ImageService()
  #root.upload   = UploadService()
  cherrypy.server.socket_host = '0.0.0.0' # bind to all available interfaces (is this bad?)

  # HACK to get cherrypy config parsed correctly under python 3.5
  # see https://github.com/cherrypy/cherrypy/issues/1382
  from cherrypy._cpconfig import reprconf
  conf = reprconf.Parser().dict_from_file(bft_conf)
  print(conf.keys())
  static_dir = os.getcwd() # Root static dir is this file's directory.
  conf['global']['app.root'] = static_dir
  conf['global']['error_page.404'] = static_dir + "/template/404.html" 
  conf['global']['error_page.500'] = static_dir + "/template/500.html" 
  conf['/']['tools.staticdir.root'] = static_dir
  conf['/']['tools.staticfile.root'] = static_dir
  cherrypy.quickstart(root, '/', conf)

  # should work, but doesn't under 3.5
  #cherrypy.quickstart(root,config=bft_conf)
  
  #cherrypy.tree.mount(Root(),"/",bft_conf)
  #cherrypy.tree.mount(QueryService(),"/query",bft_conf)

  #if hasattr(cherrypy.engine, 'block'):
  #  # 3.1 syntax
  #  cherrypy.engine.start()
  #  cherrypy.engine.block()
  #else:
  #  # 3.0 syntax
  #  cherrypy.server.quickstart()
  #  cherrypy.engine.start()
