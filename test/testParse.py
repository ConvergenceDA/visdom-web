#!/usr/bin/python

from __future__ import absolute_import
from __future__ import print_function
import sys
import DataService as ds


if __name__ == "__main__":
  qs = sys.argv[1]
  print('Parsing query: %s' % qs)
  print(ds.pretty(ds.parseDesc(qs)))