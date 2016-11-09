## Static Data
This directory contains static data files that will be used on the front-end,
such as geographic data for California. 

The Make process depends on Node.js (https://nodejs.org/en/download/), with topojson installed:
`npm install topojson`

To rebuild these files, just run:

```sh
$ make clean all
```

The `.topo.json` files are built using
[TopoJSON](https://github.com/mbostock/topojson/) files (in JSON format) and
consist of JSON that's much smaller than their GeoJSON equivalents.
Corresponding `.topo.svg` files are SVG files for visual reference, to confirm
that we're using the appropriate
[simplification](https://github.com/mbostock/topojson/wiki/Command-Line-Reference#simplification)
values.
