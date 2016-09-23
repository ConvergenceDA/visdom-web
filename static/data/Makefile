topojson ?= topojson
projection ?= "d3.geo.mercator().center([-117,39.5]).scale(3500)"
simplify ?= 1e-8

all: \
	zcta.topo.json \
	zcta.topo.svg

zcta.topo.json: ../CA.geojson
	$(topojson) \
		--id-property ZCTA \
		--properties AREA \
		--simplify $(simplify) \
		-- $< > $@
	perl -pi -e 's/{"CA"/{"zcta"/' $@
	du -h $< $@

%.topo.svg: %.topo.json
	$(topojson) \
		--projection $(projection) \
		-- $< > tmp.topo.json
	$(topojson)-svg \
		--width 700 \
		--height 850 \
		-- tmp.topo.json > $@
	rm -f tmp.topo.json

clean:
	rm -f *.topo.json
	rm -f *.topo.svg
