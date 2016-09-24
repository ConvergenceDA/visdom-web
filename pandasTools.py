'''upgrade to numpy 1.8.1
instal pyper # bridge to R
install numexpr # http://code.google.com/p/numexpr/downloads/detail?name=numexpr-2.1.win32-py2.7.exe
install pytables aka tables 3.1.1 # http://www.lfd.uci.edu/~gohlke/pythonlibs/
easy_install pandas
# IN R do this to install rhdf5:
>  source("http://bioconductor.org/biocLite.R")
> biocLite("rhdf5")

Usage:
# convert RData file to HDF5 format
 RdataToHDF5('smart_efficiency/RData/resultBasics.RData','basics')
 basics = pd.read_hdf('smart_efficiency/RData/resultBasics.RData.h5','basics')
'''

from __future__ import absolute_import
from __future__ import print_function
import pyper
import pandas as pd
from six.moves import map
from six.moves import zip

def RdataToHDF5(fileName,variableName,path=None):
  r = pyper.R()
  if path is not None:
    r["setwd('%s')" % path]
  r['load("%s")' % fileName]
  r['library(rhdf5)']
  try:
    r['h5createFile("%s.h5")' % fileName]
  except pyper.RError:
    pass # typically this is because the file already exists
    # TODO: determine if something else went wrong
  r['h5write(%s, "%s.h5","%s")' % (variableName,fileName,variableName)]

def loadHDF5(fileName,variableName):
  return pd.read_hdf(fileName,variableName)


if __name__ == "__main__":
  import numpy as np
  print('Testing pandasTools')
  print('Using R to convert RData into HDF5 data')
  f = 'RData/resultBasics.RData'
  var = 'basics'
  #RdataToHDF5(f,var)
  print('Loading hdf5 data into python DataFrame (via Pandas)')
  basics = loadHDF5('%s.h5' % f,var)
  zipCounts = basics.groupby('zip5').size()
  zipMeans  = basics.groupby('zip5').mean()
  zd = zipCounts.to_dict()
  zdd = dict(list(zip(list(map(int,list(zd.keys()))),list(map(int,list(zd.values()))))))
  #zd = zipCounts.to_dict()
  print((zdd[94611]))
  #print(dir(basics))
  
