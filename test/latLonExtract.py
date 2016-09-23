from __future__ import absolute_import
from __future__ import print_function
import sys
import ijson # streaming json for large files
import json 
import csv
from six.moves import map

if __name__ == "__main__":

  
  zctaGeom_json   = 'us-maps/geojson/zcta5.json'
  stateCodes_json = 'us-maps/reference/state-codes.json'
  stateZips_json  = 'us-maps/reference/zips-by_state.json'
  xwalk_csv       = 'us-maps/reference/Zip_to_ZCTA_Crosswalk_2011_JSI.csv'
  
  state = 'CA'
  # convert crosswalk file to json lookup
  with open(xwalk_csv,'r') as xwalk:
    xread = csv.DictReader(xwalk)
    zctaToZip = {}
    zipToZcta = {}
    for o in xread:
      if o['StateAbbr'] != state: continue
      zctaToZip[o['ZCTA_USE']] = o['ZIP']
      zipToZcta[o['ZIP']]      = o['ZCTA_USE']
    with open('static/zctaToZip_%s.json' % state, 'w') as outfile: # forward lookup
      json.dump(zctaToZip, outfile)
    with open('static/zipToZcta_%s.json' % state, 'w') as outfile: # reverse lookup
      json.dump(zipToZcta, outfile)

  # use geojson reference data to generate a list of zip codes in CA
  stateCodes = {}
  stateZips  = {}
  with open(stateCodes_json,'r') as f:
    codeList = json.load(f)
    for key in codeList:
      stateAbbr = codeList[key]['stateAbbr']
      stateCodes[stateAbbr] = key
  with open(stateZips_json,'r') as f:
    stateZips = json.load(f)
  subZcta = stateZips[stateCodes[state]]

  # confirm that there are mappings for all relevant entries
  zctas = list(zctaToZip.keys())
  for z in subZcta:
    assert str(z) in zctas

  #sys.exit()

  # create simple dict json file with zcta and lat/lon coordinates for its boundaries
  with open(zctaGeom_json,'rb') as geojson:
    features = ijson.items(geojson,'features.item')
    #print objects
    #features = (o for o in objects if o['type'] == 'Feature')
    #zips     = (o for o in featues if o['type'] == 'Feature')
    i = 0
    geom = {}
    for o in features:
      i = i + 1
      zcta = o['properties']['ZCTA5CE10']
      if(zcta in subZcta):
        coords  = o['geometry']['coordinates'][0]
        if len(coords) == 1: coords = coords[0] # sometimes the coords are nested 2 deep
        try:
          geom[zcta] = [list(map(float,x)) for x in coords]
        except TypeError as te: 
          print(coords)
          print(zcta)
      if(i % 100 == 1): 
        print(i, zcta) 
    print(i)
    with open('static/zctaGeom_%s.json' % state, 'w') as outfile:
      json.dump(geom, outfile)
