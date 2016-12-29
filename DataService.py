from __future__ import absolute_import
from __future__ import print_function
import numpy as np
import pandas as pd
import pandas.io.sql
import logging
import random, re
import sys
import sqlite3
import traceback

#logging.basicConfig(filename='example.log',level=logging.DEBUG)
#logging.debug('This message should go to the log file')
#logging.info('So should this')
#logging.warning('And this, too')

from timeit import default_timer as currentTime
import six
from six.moves import range
def timefn(func): 
  def wrapper(*arg, **kw):
      '''source: http://www.daniweb.com/code/snippet368.html'''
      _start = currentTime()
      res = func(*arg, **kw)
      print('%s took %0.3f seconds' % (func.__name__,currentTime() - _start))
      return res
  return wrapper

def loadData(filePath,varName):
  return pd.read_hdf(filePath,varName)

def colNames(df):
    return df.columns.values.tolist()
 
def filterdf(df,filterList):
  filtered = df
  for f in filterList: # apply filters in order
    filtered = f.runFilter(filtered)
  return filtered

def aggregate(df,aggCol,aggFns=['count','mean']):
  agg = df.groupby(aggCol).agg(aggFns)
  # process for JSON serialization
  #remove is fields
  #zipMeans = zipMeans.where((pd.notnull(zipMeans)), None) # map NaNs to Nones
  #zd = zipMeans[col]['mean'].to_dict()                    # convert to dict entries
  return agg

def pull(pieces,prefix):
  val = None
  try:
    idx = pieces.index(prefix)
    val = pieces[idx]
  except ValueError:
    pass
  return val
  
def pullNext(pieces,prefix):
  nxt = None
  try:
    idx  = pieces.index(prefix)
    nxt = pieces[idx + 1]
  except ValueError:
    pass # we will return None
  return nxt

def parseArgs(argStr):
  ''' Parse 'name1+name2|arg1+arg2' into {'name1':'arg1','name2':'arg2'}, where args are optional '''
  if argStr is None: return None
  raise ValueError('parseArgs is deprecated because it is only used for /f/ filters, which have been replaced by /f2/')
  #argDict = {}
  #nt = argStr.split('|')
  #names   = nt[0].split('+')
  #if(len(nt) == 1): targets = [None] 
  #else:             
  #  targets = nt[1].split('+')
  #  targets = [tuple( re.split('&|\^|\+',x) ) for x in targets] # split target criteria on & or ^
  # repeat the last target to pair with all names
  #if(len(targets) < len(names)):
  #  targets.extend( [targets[-1]] * (len(names) - len(targets)) )
  #return dict( zip(names,targets) )

def parseSource(argStr):
  ''' Parse 'source|col1+col2' into {'source':['col1','col2']} and 'source|col1' into {'source':['col1']} '''
  if argStr is None: return None
  argDict = {}
  nt = argStr.split('|')
  name = nt[0]
  if(len(nt) == 1): cols = [None] 
  else:             
    cols = re.split( '&|\^|\+',nt[1] ) # split col names on any of & ^ +

  return {name:cols}

def parseFilters(fStr,expandFilters=False):
  if fStr is None: return None
  parenSections = re.split('(\(|\))',fStr)
  # get rid of emptys created by leading, trailing nad sequential matching elements 
  parenSections = [x for x in parenSections if x != '']
  parenSections.insert(0,'(')
  parenSections.append(')')
  #print parenSections
  i,filters = processFilterGroup(parenSections,1) # skip the first paren and start at the first value
  #print filters
  return filters

def parseFilter(fStr):
  # operators include >,>=,<,<=,'in','isnull',= and can all be negated with !
  #print( re.split("(!?=?=|!?<=?|!?>=?|!?'isnull'|!?'in')",fStr) )
  (featureName,opr,val) = re.split("(!?=?=|!?<=?|!?>=?|!?'isnull'|!?'in')",fStr)
  inverseSelection = opr[0] == '!'    
  if inverseSelection: opr = opr[1:]
  return { 'featureName' : featureName, 'operator' : opr, 'value' : val, 'negate' : inverseSelection }


def processFilterGroup(pieces,idx=0):
  out = []
  i = idx
  while i < len(pieces):
    if(pieces[i]) == '(': # if we are encountering a paren group, process it recursively
      i,subGroup = processFilterGroup(pieces,i+1)
      #print subGroup
      out.append(subGroup)
      i = i+1
      continue
    if(pieces[i]) == ')': # at the end of the paren group return the accumulated filters
      #print 'returning' + str(out)
      return (i,out)
    out.extend(splitFilterBoolean(pieces[i]))
    i = i+1
  raise ValueError('Unbalanced parens:' + str(pieces))

def splitFilterBoolean(fStr):
  pieces = re.split('(&|\||\^|\+)',fStr) # & or | or ^ or + where ^ + each mean the same thing as &
  pieces = [x for x in pieces if x != '']
  #print pieces
  return pieces

def runFilters(df,filters,cache=None):
  DEBUG = False
  ands = [0] + [i+1 for i, x in enumerate(filters) if x == '&' or x == '^' or x == '+']
  ors  = [i+1 for i, x in enumerate(filters) if x == '|']
  
  subset = None
  if DEBUG: print('ANDs:')
  for a in ands:
    fltr = filters[a]
    if type(fltr) == list:
      subs = runFilters(df,fltr,cache)
    else: 
      if DEBUG: print(('    ' + str(fltr)))
      subs = runFilter(df,fltr,cache)
    if subset is None: subset = subs
    else: subset = subset & subs
    
  if DEBUG: print('ORs:')
  for o in ors:
    fltr = filters[o]
    if type(fltr) == list:
      subs = runFilters(df,fltr,cache)
    else: 
      if DEBUG: print(('    ' + str(fltr)))
      subs = runFilter(df,fltr,cache)
    subset = subset | subs
  return subset

def runFilter(df,fltr,cache=None):
  DEBUG = False
  cacheKey = '%d_%s' % (id(df),fltr)
  try:    # if there is no cache, this will fail and the remaining code will execute
    cachedResult = cache.get(cacheKey)
    #print cachedResult
    if cachedResult is not None: 
      #print 'Found cached data for %s' % cacheKey
      cache[cacheKey] = cachedResult # HACK to reset the TTL for the entry in a potentially expiring cache
      return cachedResult            # guart clause returns if result was in cache
  except AttributeError as e: pass

  fMap = parseFilter(fltr)
  featureName      = fMap['featureName']
  opr              = fMap['operator']
  val              = fMap['value']
  inverseSelection = fMap['negate']
  
  feature = df[featureName]
  if   opr == '>'        : subset = feature >  float(val)
  elif opr == '>='       : subset = feature >= float(val)
  elif opr == '<'        : subset = feature <  float(val)
  elif opr == '<='       : subset = feature <= float(val)
  elif opr == '=' or opr == '==' : 
    try   :                subset = feature == val
    except:                subset = feature == float(val)
  elif opr == "'isnull'" : subset = feature.isnull()
  elif opr == "'in'"     : 
    # string ( or [ brackets and split on ',' to create a list of one or more.
    argList = re.sub('[\[\]]','',val).split(',') # note that this will produce a list of strings
    subset = feature.isin(argList)
  else: 
    raise ValueError('Unrecognized filter criteria %s' % fltr)
  if inverseSelection: subset = np.logical_not(subset)
  before = len(df.index)
  if DEBUG: print(('filter: %d -> %d' % (before,sum(subset))))
  try:    
    cache[cacheKey] = subset
    print('Cached result at %s' % cacheKey)
  except: pass
  return subset

def parseDesc(path,expandFilters=False):
  # first allow for escaping of queries
  pieces = path.split('/')
  queryParams = {
    'dataSource'  : parseSource( pullNext( pieces,'s' ) ),
    'filter'      : parseFilters(pullNext( pieces,'f' ),expandFilters),
    'aggregator'  : parseSource( pullNext( pieces,'a' ) ),
    'rnd'         : pullNext( pieces,'rnd' ),
    'thin'        : pullNext( pieces,'thin' ),
    'bin'         : pullNext( pieces,'bin' ),
    'head'        : pullNext( pieces,'head' ),
    'tail'        : pullNext( pieces,'tail' ),
    'asc'         : pullNext( pieces,'asc' ),
    'desc'        : pullNext( pieces,'desc' ),
    'histogram'   : histSplit( pullNext( pieces,'hist' ) ),
    'cumsum'      : pull( pieces,'cum' ),
    'colInfo'     : pull( pieces,'colInfo' ),
    'colList'     : pull( pieces,'colList' ),
    'fmt'         : pullNext( pieces,'fmt' ),   # json or csv
  }
  # backwards compatability. 
  if queryParams['filter'] is None: 
    queryParams['filter'] = parseFilters(pullNext( pieces,'f2' ),expandFilters)
    if queryParams['filter'] is not None: print('Warning: parsed filter with deprecated /f2/ name. These can be changes to /f/')
  return queryParams

import pandas.core.algorithms

def quantileStats(df,col,n):
  '''Split data into n bins with roughly equal numbers of members in each bin (i.e. split into n quantiles)
     return the min and max value of each quantile keyed by the bin range for each.'''
  # cut the column by quantile to get the boindaries of the equal sized bins
  # TODO: this chokes if there are so many values in a bin that there is more than one edge with the same value
  bins = pandas.core.algorithms.quantile(df[col],np.linspace(0, 1, n+1))
  #print bins
  #bins = pd.qcut(df[col],n,retbins=True)[1]
  bins[0] = bins[0] - 0.001 # the bins are (low,high], but we need to include the low value, 
                            # so we adjust the left edge of the first bin to include it
  bins = sorted(set(bins))  # because we are doing quantiles, it is possible to get duplicate bins
  #print bins
  groups = df.groupby(pandas.cut(df[col], bins))
  mn = groups.min()[col]
  qstats = pd.DataFrame(mn)
  qstats.index.name = 'bin_bounds'
  qstats.columns = ['min']
  qstats['max']   = groups.max()[col]
  qstats['count'] = groups.count()[col]
  qstats = qstats[~np.isnan(qstats['min'])]
  return qstats

def histSplit(s):
  if s is None: return s
  out = { 'bins' : 10, 'min' : None, 'max' : None }
  parts = re.split('[\[\]\:]',s)
  out['bins'] = int(parts[0])
  if len(parts) > 2:
    out['min'] = float(parts[1])
    out['max'] = float(parts[2])
  return out

def restQuery(qs,cache=None):
  return executeQuery(parseDesc(qs),cache)

@timefn
def executeQuery(query,cache=None):
  #print query
  df   = None
  cols = []
  aggCols = []
  #try:
  #  print(cache.keys())
  #except AttributeError: pass
  # load data and take note of which cols of data have been requested  
  for source in query['dataSource']:
    cols = query['dataSource'][source]
    df = DataSource().getdf(source)
    # protect against Inf and -Inf values. VISDOM can handle NaNs
    df = df.replace([np.inf, -np.inf], np.nan)

    print('[DataService.executeQuery]', source, df.shape)
    print(id(df))
    # TODO: support some form of merging data sources (would require new syntax and changes to parseSource
    # df = df.mergeWith( ... )
    #pd.merge(left_frame, right_frame, on='key', how='inner')
    #pd.merge(left_frame, right_frame, left_on='left_key', right_on='right_key')
    #pd.merge(left_frame, right_frame, on='key', how='left') # or right or outer
    #pd.concat([left_frame, right_frame], axis=1) # concat dfs by column
  newdf = df
  #print df.columns.values
  # filter rows using simple criteria
  if query['filter'] is not None:
    subset = runFilters(df,query['filter'],cache) # use the original df here to ensure that cache of id(df) works
    before = len(df.index)
    newdf = newdf.loc[subset,:]
    # TODO: this could be done using the query interface...
    #newdf = newdf.query(query['filter2'],local_dict={ 'null' : np.array([None] * before) } ) #pd.Series([None] * before) } )
    print(('filter: %d -> %d' % (before,len(newdf.index))))
  if query['aggregator'] is not None:
    aggCols = list(query['aggregator'].keys())
    for agg in query['aggregator']:
      grps = newdf.groupby(agg)
      newdf = grps.agg(query['aggregator'][agg][0])
      if (agg in cols): 
        newdf[agg] =  grps.size()
  # strip down to just the cols we are interested in
  if cols is not None and cols[0] is not None:
    evalExpr = re.findall('eval\((.*)\)',cols[0])
    #print cols
    #print newdf.columns.values
    #print evalExpr
    if len(evalExpr) > 0:
      print("Dynamic column %s" % evalExpr)
      cols = ['derived']                        # set the filter columns to the derived one
      newdf[cols[0]] = newdf.eval(evalExpr[0])  # add the derived values to the data frame
    newdf = newdf[list(cols)] 
  if query['cumsum'] is not None:
    # post process - applications include cumsum, random sub sampling, and targeted sub-sampling 
    # see also inplace=True arg for sort
    #chicago.sort('salary', ascending=False, inplace=True)
    #chicago = chicago.groupby('department').apply(ranker)
    cumdf = None
    for col in cols:
      newdf = newdf.loc[newdf[col].notnull(),:] # filter out nulls before the cum sum
      colData = newdf[col].order(ascending=False)
      forcePositive = True
      if(forcePositive):
        colData[colData < 0] = 0  # force negative values to be zero
      cumcol = colData.cumsum()   # calculate the cumsum 
      cumcol.index = newdf.index  # align the indices with the original to keep the cumsum order
      newdf['%s_cumsum' % col] = cumcol
  if query['histogram'] is not None:
    n = query['histogram']['bins']
    if query['histogram']['min'] is not None: 
      rng = ( query['histogram']['min'],query['histogram']['max'] )
    else: 
      rng = None
    cumdf = None
    for col in cols:
      #print col
      #print newdf[col]
      newdf = newdf.loc[newdf[col].notnull(),:] # filter out nulls 
      histdf = newdf[col].replace([np.inf, -np.inf], np.nan) # no inf values
      histdf = histdf[~np.isnan(histdf)] # no nan values
      hist,bin_edges = np.histogram(histdf,bins=n,range=rng)
      #print hist
      newdf = pd.DataFrame(hist,columns=['counts'])
      newdf['bin_min'] = bin_edges[:len(bin_edges)-1] # the leading edge of each bin is the first through second to last of the bin edges
      newdf['bin_max'] = bin_edges[1:]                # the trailing edge of each bin is the second through last of the bin edges
      #newdf[''] = df['bin_max'].map(lambda x: 42 if x > 1 else 55)
      #cumcol = newdf[col].order(ascending=False).cumsum() # calculate the cumsum
      #cumcol.index = newdf.index           # align the indices with the original to keep the cumsum order
      #newdf['%s_cumsum' % col] = cumcol
  if query['rnd'] is not None:
    # post-process to take a random sample of n values from the full set
    n = int(query['rnd'])
    if n < len(newdf.index):
      newdf = newdf.iloc[random.sample(list(range(len(newdf.index))), n)] # n row index samples drawn at random from 0 to len(index)-1
  if query['thin'] is not None:
    # post-process to take an ordered sample of n evenly spaced values from the full set
    n = int(query['thin'])
    #print 'thinning %d' % n
    if n < len(newdf.index):
      thinidx = [(x+1) * (len(newdf.index) / n) - 1 for x in range(n)] # n evenly spaced row index samples drawn between n to len(index) - 1
      # todo: this returns int values rounded down, so if we want it, we often will need to add the final reading
      newdf = newdf.iloc[thinidx]
  if query['desc'] is not None:
    newdf = newdf.sort([query['desc']],ascending=[0])
  if query['asc'] is not None:
    newdf = newdf.sort([query['asc']],ascending=[1])
  if query['head'] is not None:
    n = int(query['head'])
    newdf = newdf.head(n)
  if query['tail'] is not None:
    n = int(query['tail'])
    newdf = newdf.tail(n)
  if query['bin'] is not None:
    newdf = quantileStats(newdf,cols[0],int(query['bin']))
    # the CategoricalIndex returned by quantile breaks to_json
    # so we convert it to str
    newdf.index = newdf.index.astype(str)
  return newdf


def loadHDF5(fName,tblName):
  print(( 'Loading hdf5 data, %s (%s), into python DataFrame (via Pandas)' % (fName,tblName) ))
  return pd.read_hdf(fName,tblName)

def loadCSV(fName,tblName=None):
  print(( 'Loading csv data, %s, into python DataFrame (via Pandas)' % (fName) ))
  return pd.read_csv( fName, index_col=False )

def loadSQLite(fName,tblName):
  con = None
  out = None
  try:
    con = sqlite3.connect(fName)
    out = pandas.io.sql.read_sql('select * from %s' % tblName, con)
  finally:
    if con: con.close()
  return out

def loadSQL(db_uri,tblName):
  from sqlalchemy import create_engine
  connection = None
  try:
    engine = create_engine(db_uri)
    connection = engine.raw_connection()
    df = pandas.read_sql('select * from %s where runId=1' % tblName, connection)
  finally:
    if connection: connection.close()
  return df

def publicSources():
  dataSources = DataSource.directory
  out = {}
  for source in dataSources:
    dic = dataSources[source]
    externalInfo = {}
    if dic.get('public',False):
      for key in ('label','public',):
        externalInfo[key] = dic.get(key,None)
      externalInfo['metaData'] = dic.get('colMetaFile','') != '' # friendly sources have metadata
      out[source] = externalInfo
  return out

from singleton import Singleton
import data_cfg
class DataSource(six.with_metaclass(Singleton, object)):
  ''' '''
  directory = data_cfg.sources

  loadfn = {
    'hdf'    : loadHDF5,
    'hdf5'   : loadHDF5,
    'h5'     : loadHDF5,
    'sqlite' : loadSQLite,
    'csv'    : loadCSV,
    'sql'    : loadSQL,
  }

  memCache = { }

  def getCfg(self,dfName):
    return self.directory.get(dfName,None)

  def getdf(self,dfName):
    try: 
      df = self.memCache[dfName]
      #print "DataSource found cached data"
    except:
      cfg = self.directory[dfName]
      df = self.loadfn[cfg['dataFormat']]( cfg['dataIdentifier'], cfg.get('dataTable') ) # in some cases, like for csv files, dataTable can be None
      df = df.replace([ '&', '\,', '\(', '\)', '\\/', '\\\\' ],' ', regex=True)
    # /
    # ()
    # ,
    # &
      meta = self.getMetaData(dfName)
      if(meta is not None):
        formulas = meta.loc[meta['formula'].notnull(),:]
        print('[DataService.getdf] INFO: Dynamically computing values for %d derived feature(s).' % len(formulas.index))
        for i in range(len(formulas.index)):
          try:
            evalStr = formulas.index[i] + '=' + formulas.ix[i,'formula']
            print('\t %d: %s' % (i+1,evalStr))
            # if version 0.18 or after inplace can be included as an argument
            try:
              assert( int(pd.__version__.split('.')[0]) > 0 or int(pd.__version__.split('.')[1]) >= 18 )
              df.eval(evalStr, inplace=True)
            except:
              df.eval(evalStr)
          except:
            print('Eval failed')
            print("Error:", sys.exc_info()[0])
            traceback.print_exc()
        categories = meta.loc[meta['type'] == 'category',:]
        #print categories.index
        print('[DataService.getdf] INFO: Ensuring categorical values are strings.')
        for i in categories.index:
          try:
            cat = categories.loc[i,:]
            if df[i].dtypes != object: 
              print('Converting %s to strings' % i)
              if( i == 'zip5' ):
                def pad(n):
                  return( format(n,'05d') )
                df[i] = df[i].apply(pad)
              else:
                df[i] = df[i].apply(str)
          except:
            print('Category conversion failed for %s' % i)
            print("Error:", sys.exc_info()[0])
            #print err
      # TODO / HACK: this is currently a hack to prevent out of scale values
      # from interfering with normal ones in scatter and histogram views
      # the basic problem seems to be that some apartment buildings are 
      # mixed in with the regular households. Maybe there is a better way to 
      # handle this.
      if (dfName == 'basics'):
        smalls = df['kw_mean'] < 7.0
        if smalls.any():
          df = df.loc[smalls,:]
      self.memCache[dfName] = df # cache it for later
    
      #df = df.loc[df['therm.mean.annual'] < 10,:]
      #df = df.loc[df['id'] != 5272657305,:]
      #pass
    return df

  def getMetaData(self,nm): 
    cfg = self.directory[nm]
    try:
      meta = pd.DataFrame.from_csv( cfg['colMetaFile'] )
      # strip whitespace since this is a user controlled file
      for col in meta.columns.values:
        meta[col] = pd.core.strings.str_strip( meta[col])
      return meta
    except (KeyError, IOError):
      logging.debug('Could not find metadata file "%s" returning None' % cfg.get('colMetaFile','unspecified') )
      return None

  
  def mergeWith( other,myCol,theirCol ):
    pass

def pretty(dic,ind=2):
  import json
  return json.dumps(dic, indent=ind)

if __name__ == "__main__":
  if False:
    logging.basicConfig( format='%(asctime)s %(levelname)s %(module)s.%(funcName)s[%(lineno)d]: %(message)s', 
                          datefmt='%m/%d %H:%M:%S',
                          level=logging.DEBUG  )

    logging.info('Logging started')
    sources = {  'basics' : 'RData/resultBasics.RData.h5' }
    df = loadData(sources['basics'],'basics')
    print((dir(df)))
    filters = [Filter('nObs','> 1000'), Filter('kw.mean','> 1.0')]
    d1agg = aggregate(filterdf(df,filters),'zip5',[np.mean,np.sum])
    print(colNames(d1agg))
    print((d1agg.loc[:,'therm.total'].loc[:,'sum']))

  
  if False:
    qs = '/s/basics|sp_id/f/kw.mean+therm.mean|>1.0&<5.0+>1.0/a/zip5|mean'
    print(qs)
    print(pretty(parseDesc(qs)))
    qs = '/s/basics+sws/f/kw.mean+therm.mean|>1.0&<5.0+>1.0/a/zip5|mean'
    print(qs)
    print(pretty(parseDesc(qs)))
    qs = '/s/basics+rgout|sp_id/f/kw.mean+therm.mean|>1.0&<5.0'
    print(qs)
    pretty(parseDesc(qs))
    
    qs = '/s/basics+rgout|sp_id/a/zip5|mean'
    print(qs)
    print(pretty(parseDesc(qs)))    
    qs = '/s/basics|kw.mean&therm.mean/f/kw.mean+therm.mean|>1.0&<5.0+>1.0/a/zip5|mean'
    query = parseDesc(qs)
    print(qs)
    print(pretty(query))

    qs = '/s/basics+rgout|sp_id/a/zip5|mean/cum/rnd/100'
    print(qs)
    print(pretty(parseDesc(qs))) 

    qs = '/s/basics|kw.total/cum/thin/100'
    print(qs)
    print(pretty(parseDesc(qs))) 

    qs = '/s/basics|kw.total/hist/100'
    print(qs)
    print(pretty(parseDesc(qs))) 

    qs = '/s/basics|kw.total/hist/100[1.1:54.3]'
    print(qs)
    print(pretty(parseDesc(qs))) 
    #print executeQuery(parseDesc(qs))

    qs = '/s/basics|kw.total&therm.total/f/therm.total|!isnull/rnd/100'
    print(qs)
    print(pretty(parseDesc(qs))) 
    #print restQuery(qs)

  if False:
    qs = "/s/basics|kw_mean&zip5/f/(kw_mean>5|zip5'in'[93304,94611])^zip5'in'[94611]"
    #print pretty(parseDesc(qs))
    cache = dict()
    zipData = executeQuery(parseDesc(qs),cache)
    zipData = executeQuery(parseDesc(qs),cache)
    zipData = executeQuery(parseDesc(qs),cache)
    qs = "/s/basics160k|kw_mean_winter/f/(kw_mean>0.00+kw_mean<4.37)+(cooling_energy>-9984.80+cooling_energy<11580.96)+(load_shape_entropy>0.00+load_shape_entropy<6.97)/hist/100"
    print(pretty(parseDesc(qs)))

  if False:
    df = pd.DataFrame(np.random.randn(50, 2), columns=['A', 'B'])
    print(df.shape)
    df['c'] = list(range(50))
    ret = quantileStats(df,'A',100)
    print(min(df.A))
    print(max(df.A))
    
    print(ret)
    print(type(ret))
    print(ret.shape)
    #print groups.aggregate(lambda x: np.mean(x[x > 0.5]))
  if False:
    # the quantile function returns a df with a CategoricalIndex
    # this causes a segfault in to_json in Windows with pandas 0.16.1 
    idx = pd.Categorical([1,2,3], categories=[1,2,3])
    df = pd.DataFrame({
      'count' : pd.Series(['a','b','c'],index=idx),
        } )
    print(df.index.is_unique)
    print(df.to_json(orient='split'))
  if True:
    a = executeQuery(parseDesc('/s/ohm|min_response/hist/100'))
    print(a)
    print('above should not be all nulls')
    df = executeQuery(parseDesc('/s/ohm'))
    print((df.min_response))
    print('above should not have Inf or -Inf values')
  if False:
    # the quantile function returns a df with a CategoricalIndex
    # this causes a segfault in to_json in Windows with pandas 0.16.1 
    df = executeQuery(parseDesc('/s/ohm|kw_mean/bin/200'))
    print(df.dtypes)
    print(df)
    print(df.index)
    print(type(df.index))
    #print df.to_csv()
    print(df.to_json(orient='split'))
  if False:
    print(executeQuery(parseDesc('/s/basics|kw.mean&therm.mean/a/zip5|mean')))
    print(executeQuery(parseDesc('/s/basics|kw.total/cum/thin/100')))
    print((executeQuery(parseDesc('/s/basics|kw.mean/f/kw.mean|>1.0&<5.0/a/zip5|mean'))))
    print((executeQuery(parseDesc('/s/basics|kw.mean/f/zip5|=93304'))))
  
  if False:
    ids = restQuery('/s/basics160k|id')
    filteredCounts = pd.merge(ids, restQuery('/s/dictCounts'), left_on='id', right_on='sp_id', how='inner')
    filteredKwh   = pd.merge(ids, restQuery('/s/dictSums'),   left_on='id', right_on='sp_id', how='inner')
    shapes = restQuery('/s/dictCenters')
    countSum = filteredCounts.iloc[:,4:].sum(axis=0) # sum the cluster membership count columns
    kwhSum   = filteredKwh.iloc[:,4:].sum(axis=0)    # sum the cluster kwh total columns
    topMember = False
    topKwh    = True
    n = 10
    if topMember:
      sortIdx = np.argsort(countSum)[::-1] # note that [::-1] reverses the array
    elif topKwh:
      sortIdx = np.argsort(kwhSum)[::-1]
    topIdx = sortIdx[list(range(n))].as_matrix()

    topShapes = shapes.iloc[topIdx,:]
    print(pd.Series(kwhSum[topIdx].as_matrix(), index=topShapes.index))
    topShapes['total.kwh']   = pd.Series(kwhSum[topIdx].as_matrix(), index=topShapes.index)
    topShapes['total.count'] = pd.Series(countSum[topIdx].as_matrix(), index=topShapes.index)
    print(topShapes.iloc[:,20:])

  if False:
    import json
    print("Public sources")
    print(json.dumps(publicSources(), indent=2))

