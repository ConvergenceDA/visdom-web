(function(exports) {

  var mda = exports.mda || (exports.mda = {});

  mda.render = {};

  mda.render.axis = function() {
    var _axis  = d3.svg.axis(),
        orient = _axis.orient(),
        margin = 40,
        label;

    function axis(selection) {
      selection.call(_axis);
      selection.each(function() {
        var label = d3.select(this)
          .select(".label");
        if (label.empty()) {
          label = d3.select(this)
            .append("text")
              .attr("class", "label")
              .attr("text-anchor", "middle");
        }
      })
      .select("text.label")
        .text(label)
        .attr("transform", labelTransform);
    }

    function labelTransform() {
      var range  = _axis.scale().range(),
          min    = d3.min(range),
          max    = d3.max(range),
          center = min + (max - min) / 2;
      switch (orient) {
        case "left":   return "translate(" + [ -margin, center ] + ") rotate(-90)";
        case "right":  return "translate(" + [ margin,  center ] + ") rotate(-90)";
        case "bottom": return "translate(" + [ center,  margin ] + ")";
        case "top":    return "translate(" + [ center, -margin ] + ")";
      }
    }

    Object.keys(_axis).forEach(function(key) {
      if (_axis.hasOwnProperty(key)) {
        axis[key] = function() {
          var result = _axis[key].apply(_axis, arguments);
          return result === _axis ? axis : result;
        };
      }
    });

    axis.orient = function(o) {
      if (!arguments.length) return orient;
      _axis.orient(orient = o);
      return axis;
    };

    axis.label = function(str) {
      if (!arguments.length) return label;
      label = str;
      return axis;
    };

    axis.margin = function(m) {
      if (!arguments.length) return margin;
      margin = m;
      return axis;
    };

    return axis;
  };

  mda.render.cumsum = function() {
    var width = 500,
        height = 460,
        padding = [10, 20, 50, 80],
        labelFormat = function(d) {
          return ~~d + "%";
        },
        xx = d3.scale.linear()
          .domain([0, 100])
          .clamp(true),
        dx = function(d) { return d[0]; },
        xAxis = createAxis("bottom")
          .scale(xx)
          .ticks(10),
        yy = d3.scale.linear()
          .domain([0, 100]),
        dy = function(d) { return d[1]; },
        yAxis = createAxis("left")
          .scale(yy),
        series  = function(d) { return d; },
        regions = function(d) {
          // FIXME this assumes d is an array!
          // (rows will be n-dimensional when we support multiple series)
          var rows = d[0],
              xmax = xx.domain()[1];
          return rows.map(function(d, i) {
            var x0 = dx(d, i),
                x1 = rows[i + 1]
                  ? dx(rows[i + 1], i + 1)
                  : xmax;
            return {
              y:  dy(d,i),
              x0: x0,
              x1: x1
            };
          });
        };

    function cumsum(selection) {
      // figure out the outermost edges in both dimensions
      var left = padding[3],
          right = width - padding[1],
          top = padding[0],
          bottom = height - padding[2],
          xd = xx.domain(),
          yd = yy.domain();

      // update the scale ranges accordingly
      xx.range([left, right]);
      yy.range([bottom, top]);

      // set the dimensions
      selection
        // [because transitions don't support .classed()]
        .each(function() {
          d3.select(this).classed("cumsum", true);
        });

      // create/update the x-axis
      var xa = selection.select("g.axis.x");
      if (xa.empty()) {
        xa = selection.append("g")
          .attr("class", "axis x");
      }
      xAxis.innerTickSize(-(bottom - top));
      xa.attr("transform", "translate(" + [0, bottom] + ")")
        .call(xAxis);

      // create/update the y-axis
      var ya = selection.select("g.axis.y");
      if (ya.empty()) {
        ya = selection.append("g")
          .attr("class", "axis y");
      }
      yAxis.innerTickSize(-(right - left));
      ya.attr("transform", "translate(" + [left, 0] + ")")
        .call(yAxis);

      // reference line from (0, 0) to (100, 100)
      var ref = selection.select("path.reference");
      if (ref.empty()) {
        ref = selection.append("path")
          .attr("class", "reference");
      }
      ref.attr("d", [
        "M", [xx(xd[0]), yy(yd[0])], "L", [xx(xd[1]), yy(yd[1])], "Z"
      ].join(""));

      // we need to do this in .each() because transitions
      // don't support the .data() interface
      selection.each(function() {
        var that = d3.select(this);
        var path = that.selectAll("path.series")
          .data(series);
        path.exit().remove();
        path.enter()
          .append("path")
            .attr("class", "series line")
            .attr("fill", "none");

        var region = that.selectAll("rect.region")
          .data(regions);
        region.exit().remove();
        region.enter()
          .append("rect")
            .attr("class", "region")
            .attr("fill", "transparent");
      });
      // but then we can set the path data in a transition
      selection.selectAll("path.series")
        .attr("d", d3.svg.line()
          .x(function(d) { return xx(dx.apply(this, arguments)); })
          .y(function(d) { return yy(dy.apply(this, arguments)); }));

      var pad = 2;
      selection.selectAll("rect.region")
        .attr("x",     function(d) { return xx(d.x0) - pad; })
        .attr("width", function(d) { return xx(d.x1) - xx(d.x0) + pad; })
        .attr("y", top)
        .attr("height", bottom - top);
    }

    cumsum.width = function(w) {
      if (!arguments.length) return width;
      width = w;
      return cumsum;
    };

    cumsum.height = function(h) {
      if (!arguments.length) return height;
      height = h;
      return cumsum;
    };

    cumsum.size = function(size) {
      if (!arguments.length) return [width, height];
      width = +size[0];
      height = +size[1];
      return cumsum;
    };

    // get/set the x scale
    cumsum.xScale = function(x) {
      if (!arguments.length) return xx;
      xAxis.scale(xx = x);
      return cumsum;
    };

    // get/set the y scale
    cumsum.yScale = function(y) {
      if (!arguments.length) return yy;
      yAxis.scale(yy = y);
      return cumsum;
    };

    // get/set the padding, either as a single number or 4-tuple
    // a la CSS: (top, right, bottom, left)
    cumsum.padding = function(pad) {
      if (!arguments.length) return padding;
      padding = coercePadding(pad);
      return cumsum;
    };

    // get/set the series data value or function, which should return an array
    // of lines, e.g. [[0, 0], ... [100, 100]]
    cumsum.series = function(d) {
      if (!arguments.length) return series;
      series = d3.functor(d);
      return cumsum;
    };

    cumsum.x = function(x) {
      if (!arguments.length) return dx;
      dx = d3.functor(x);
      return cumsum;
    };

    cumsum.y = function(y) {
      if (!arguments.length) return dy;
      dy = d3.functor(y);
      return cumsum;
    };

    // expose the x- and y-axes
    cumsum.xAxis = xAxis;
    cumsum.yAxis = yAxis;

    cumsum.getYForXPercent = function(x, values) {
      var index = Math.floor(x / 100 * values.length);
      // console.log("x:", x, "->", index, values[index]);
      return values[index];
    };

    cumsum.getRatioForXPercent = function(x, values) {
      return cumsum.getYForXPercent(x, values) / x || 0;
    };

    function createAxis(orient) {
      return mda.render.axis()
        .orient(orient)
        .tickFormat(labelFormat)
        .tickSize(4)
        .tickPadding(8);
    }

    return cumsum;
  };

  mda.render.cumsum.cursor = function() {
    var cumsum = mda.render.cumsum(),
        visible = false,
        index = null,
        radius = 4;

    function cursor(selection) {
      var xx      = cumsum.xScale(),
          xRange  = xx.range(),
          yy      = cumsum.yScale(),
          yDomain = yy.domain(),
          yRange  = yy.range().sort(d3.ascending),
          yRef    = d3.scale.linear()
                      .domain(xx.domain())
                      .range(yDomain);

      selection.each(function(d) {
        var that = d3.select(this),
            cursor = that.select("g.cursor");
        if (cursor.empty()) {
          cursor = that.append("g")
            .attr("class", "cursor")
            .attr("visibility", "hidden")
            .attr("pointer-events", "none");
          cursor.append("line")
            .attr("class", "y-rule rule reference");
          cursor.append("line")
            .attr("class", "y-rule rule value");
          cursor.append("line")
            .attr("class", "x-rule rule");
          cursor.append("circle")
            .attr("class", "reference")
            .attr("r", radius);
          cursor.append("circle")
            .attr("class", "value")
            .attr("r", radius);
          cursor.append("text")
            .attr("class", "y-delta")
            .attr("line-height", "1em")
            .attr("dy", ".4em");
        }
      });

      var cur = selection.select("g.cursor")
        .attr("visibility", visible ? null : "hidden");

      if (visible && index) {
        var d = {x0: index, y: yDomain[1]};

        selection.selectAll("rect.region")
          .filter(function(d, i) { return (i === index); })
          .each(function(_) { d = _; });

        var tx     = xx(d.x0),
            left   = -tx  + xRange[0],
            right  = left + xRange[1] - xRange[0],
            y0     = yRef(d.x0),
            y1     = d.y,
            yRatio = (y1 / y0) || 0;

        cur.attr("transform", "translate(" + [
          tx,
          0
        ] + ")");

        cur.select("circle.value")
          .attr("cy", yy(d.y));
        cur.select("circle.reference")
          .attr("cy", yy(y0));
        cur.select(".y-rule.reference")
          .attr("transform", "translate(0," + yy(y0) + ")");
        cur.select(".y-rule.value")
          .attr("transform", "translate(0," + yy(y1) + ")");

        cur.selectAll(".y-rule")
          .attr("x1", left)
          .attr("x2", 0);

        cur.select("text.y-delta")
          .attr("transform", "translate(" + [
            10,
            yy(y1)
          ] + ")")
          .text(d3.format(".1f")(yRatio) + "x");

        cur.selectAll("line.x-rule")
          .attr("y1", yy(y1))
          .attr("y2", yRange[1]);

        cur.selectAll("line.y-rule")
          .attr("x1", xRange[0] - tx)
          .attr("x2", 0);
      }
    }

    cursor.visible = function(v) {
      if (!arguments.length) return visible;
      visible = !!v;
      return cursor;
    };

    cursor.index = function(i) {
      if (!arguments.length) return index;
      index = +i;
      return cursor;
    };

    cursor.cumsum = function(cs) {
      if (!arguments.length) cumsum;
      cumsum = cs;
      return cursor;
    };

    return cursor;
  };

  mda.render.scatter = function() {
    var width       = 460,
        height      = 400,
        padding     = [10, 40, 50, 80],
        labelFormat = d3.format(","),
        xx          = d3.scale.linear().clamp(true),
        dx          = function(d) { return d[0]; },
        xAxis       = createAxis("bottom").scale(xx),
        yy          = d3.scale.linear().clamp(true),
        dy          = function(d) { return d[1]; },
        yAxis       = createAxis("left").scale(yy),
        points      = function(d) { return d; },
        radius      = 4, // controls the point size of the scatter
        fill        = null,
        autoScale   = true,
        nice        = true,
        dataKey     = function(d, i) { return i; };

    function scatter(selection) {
      // figure out the outermost edges in both dimensions
      var left   = padding[3],
          right  = width - padding[1],
          top    = padding[0],
          bottom = height - padding[2];

      // update the scale ranges accordingly
      xx.range([left, right]);
      yy.range([bottom, top]);
      // set the dimensions
      selection
        // [because transitions don't support .classed()]
        .each(function() {
          d3.select(this).classed("scatter", true);
        });

      var p = [];
      // we need to do this in .each() because transitions
      // don't support the .data() interface
      selection.each(function() {
        var point = d3.select(this)
          .selectAll("g.point")
            .data(points, dataKey);
        point.exit()
          .classed("exit", true);
        var g = point.enter()
          .append("g")
            .attr("class", "point")
            .classed("enter", true);
        g.append("circle");

        if (autoScale) {
          point.each(function(d) {
            p.push([
              dx.apply(this, arguments),
              dy.apply(this, arguments)
            ]);
          });
        }
      });

      var position = function(selection) {
        selection.attr("transform", function(d, i) {
          d._x = xx(dx.apply(this, arguments));
          d._y = yy(dy.apply(this, arguments));
          return "translate(" + [
            d._x,
            d._y
          ] + ")";
        });
      };

      selection.selectAll(".point.enter")
        .each(function() {
          d3.select(this)
            .call(position)
            .attr("opacity", 0)
            .attr("fill", fill)
            .classed("enter", false);
        });

      if (autoScale) {
        xx.domain(d3.extent(p.map(function(d) { return d[0]; })));
        yy.domain(d3.extent(p.map(function(d) { return d[1]; })));
        if (nice) {
          xx.nice();
          yy.nice();
        }
      }

      selection.selectAll(".point.exit")
        .attr("opacity", 0)
        .remove();

      // create/update the x-axis
      var xa = selection.select("g.axis.x");
      if (xa.empty()) {
        xa = selection.insert("g", ".point")
          .attr("class", "axis x");
      }
      xAxis.innerTickSize(-(bottom - top));
      xa.attr("transform", "translate(" + [0, bottom] + ")")
        .call(xAxis);

      // create/update the y-axis
      var ya = selection.select("g.axis.y");
      if (ya.empty()) {
        ya = selection.insert("g", ".point")
          .attr("class", "axis y");
      }
      yAxis.innerTickSize(-(right - left));
      ya.attr("transform", "translate(" + [left, 0] + ")")
        .call(yAxis);

      var g = selection.selectAll("g.point")
        .filter(":not(.exit)")
        .attr("opacity", 1)
        .call(position);

      g.select("circle")
        .attr("r", radius)
        .attr("fill", fill);
    }

    scatter.autoScale = function(scale) {
      if (!arguments.length) return autoScale;
      autoScale = scale;
      return scatter;
    };

    scatter.width = function(w) {
      if (!arguments.length) return width;
      width = w;
      return scatter;
    };

    scatter.height = function(h) {
      if (!arguments.length) return height;
      height = h;
      return scatter;
    };

    scatter.size = function(size) {
      if (!arguments.length) return [width, height];
      width  = +size[0];
      height = +size[1];
      return scatter;
    };

    scatter.radius = function(r) {
      if (!arguments.length) return radius;
      radius = d3.functor(r);
      return scatter;
    };

    scatter.fill = function(f) {
      if (!arguments.length) return fill;
      fill = d3.functor(f);
      return scatter;
    };

    scatter.x = function(x) {
      if (!arguments.length) return dx;
      dx = d3.functor(x);
      return scatter;
    };

    scatter.y = function(y) {
      if (!arguments.length) return dy;
      dy = d3.functor(y);
      return scatter;
    };

    // get/set the x scale
    scatter.xScale = function(x) {
      if (!arguments.length) return xx;
      xAxis.scale(xx = x);
      return scatter;
    };

    // get/set the y scale
    scatter.yScale = function(y) {
      if (!arguments.length) return yy;
      yAxis.scale(yy = y);
      return scatter;
    };

    // get/set the padding, either as a single number or 4-tuple
    // a la CSS: (top, right, bottom, left)
    scatter.padding = function(pad) {
      if (!arguments.length) return padding;
      padding = coercePadding(pad);
      return scatter;
    };

    scatter.points = function(d) {
      if (!arguments.length) return points;
      points = d3.functor(d);
      return scatter;
    };

    scatter.key = function(fn) {
      if (!arguments.length) return dataKey;
      dataKey = fn;
      return scatter;
    };

    // expose the x- and y-axes
    scatter.xAxis = xAxis;
    scatter.yAxis = yAxis;

    function createAxis(orient) {
      return mda.render.axis()
        .orient(orient)
        .ticks(5)
        .tickFormat(labelFormat)
        .tickSize(4)
        .tickPadding(8);
    }

    return scatter;
  };

  mda.render.histogram = function() {
    var width       = 600,
        height      = 400,
        padding     = [10, 40, 50, 60],
        labelFormat = d3.format(","),
        xx          = d3.scale.linear(),
        dx0         = function(d) { return d[0]; },
        dx1         = function(d) { return d[1]; },
        xAxis       = createAxis("bottom").scale(xx),
        yy          = d3.scale.linear(),
        dy          = function(d) { return d[2]; },
        yAxis       = createAxis("left").scale(yy),
        bars        = function(d) { return d; },
        radius      = 4,
        fill        = null;

    function histo(selection) {
      // figure out the outermost edges in both dimensions
      var left = padding[3],
          right = width - padding[1],
          top = padding[0],
          bottom = height - padding[2];

      // update the scale ranges accordingly
      xx.range([left, right]);
      yy.range([bottom, top]);

      // set the dimensions
      selection
        // [because transitions don't support .classed()]
        .each(function() {
          d3.select(this).classed("histo", true);
        });

      var xs = [],
          ys = [];
      // we need to do this in .each() because transitions
      // don't support the .data() interface
      selection.each(function() {
        var slice = d3.select(this)
          .selectAll("g.slice")
            .data(bars);
        slice.exit()
          .remove();
        var g = slice.enter()
          .append("g")
            .attr("class", "slice");
        g.append("rect")
          .attr("class", "bar");
        g.append("rect")
          .attr("class", "mouse")
          .attr("fill", "transparent");

        slice.each(function(d) {
          xs.push(dx0.apply(this, arguments), dx1.apply(this, arguments));
          ys.push(dy.apply(this, arguments));
        })
        .selectAll("rect")
          .call(rebind); // TODO WHY DO I HAVE TO DO THIS???
      });

      function rebind(selection) {
        selection.datum(function() {
          return d3.select(this.parentNode).datum();
        });
      }

      xx.domain(d3.extent(xs));
      yy.domain([0, d3.max(ys)]);
      // yy.nice();

      // create/update the x-axis
      var xa = selection.select("g.axis.x");
      if (xa.empty()) {
        xa = selection.insert("g", ".slice")
          .attr("class", "axis x");
      }
      xAxis.innerTickSize(-(bottom - top));
      xa.attr("transform", "translate(" + [0, bottom] + ")")
        .call(xAxis);

      // create/update the y-axis
      var ya = selection.select("g.axis.y");
      if (ya.empty()) {
        ya = selection.insert("g", ".slice")
          .attr("class", "axis y");
      }
      yAxis.innerTickSize(-(right - left));
      ya.attr("transform", "translate(" + [left, 0] + ")")
        .call(yAxis);

      // but then we can set the path data in a transition
      var slice = selection.selectAll("g.slice")
        .each(function(d) {
          d._x0 = xx(dx0.apply(this, arguments) || 0);
          d._x1 = xx(dx1.apply(this, arguments) || 0);
          d._y  = yy(dy.apply( this, arguments) || 0);
        });

      slice.selectAll("rect")
        .attr("x", function(d, i)   { return d._x0; })
        .attr("y", function(d)      { return d._y;  })
        .attr("width", function(d)  { return d._x1 - d._x0; })
        .attr("height", function(d) { return bottom - d._y; })
        .filter(".mouse")
          .attr("y", top)
          .attr("height", bottom - top);
    }

    histo.width = function(w) {
      if (!arguments.length) return width;
      width = w;
      return histo;
    };

    histo.height = function(h) {
      if (!arguments.length) return height;
      height = h;
      return histo;
    };

    histo.size = function(size) {
      if (!arguments.length) return [width, height];
      width  = +size[0];
      height = +size[1];
      return histo;
    };

    histo.x0 = function(x) {
      if (!arguments.length) return dx0;
      dx0 = d3.functor(x);
      return histo;
    };

    histo.x1 = function(x) {
      if (!arguments.length) return dx1;
      dx1 = d3.functor(x);
      return histo;
    };

    histo.y = function(y) {
      if (!arguments.length) return dy;
      dy = d3.functor(y);
      return histo;
    };

    // get/set the x scale
    histo.xScale = function(x) {
      if (!arguments.length) return xx;
      xAxis.scale(xx = x);
      return histo;
    };

    // get/set the y scale
    histo.yScale = function(y) {
      if (!arguments.length) return yy;
      yAxis.scale(yy = y);
      return histo;
    };

    // get/set the padding, either as a single number or 4-tuple
    // a la CSS: (top, right, bottom, left)
    histo.padding = function(pad) {
      if (!arguments.length) return padding;
      padding = coercePadding(pad);
      return histo;
    };

    // get/set the series data value or function, which should return an array
    // of lines, e.g. [[0, 0], ... [100, 100]]
    histo.bars = function(d) {
      if (!arguments.length) return bars;
      bars = d3.functor(d);
      return histo;
    };

    // expose the x- and y-axes
    histo.xAxis = xAxis;
    histo.yAxis = yAxis;

    function createAxis(orient) {
      return mda.render.axis()
        .orient(orient)
        .ticks(5)
        .tickFormat(labelFormat)
        .tickSize(4)
        .tickPadding(8);
    }

    return histo;
  };


  mda.render.loadShape = function() {
    var width      = 200,
        height     = 160,
        padding    = [5, 10, 20, 30],
        useViewBox = true,
        xAxis      = mda.render.axis()
          .orient("bottom")
          .ticks(24)
          .tickFormat(function(h) {
            return (h % 3 === 0) ? formatHour(h) : null;
          })
          .tickPadding(8)
          .outerTickSize(4),
        yAxis      = mda.render.axis()
          .orient("left")
          .tickSize(4)
          .tickPadding(4)
          .tickFormat(d3.format(".1r"));
    var me = this;

    function loadShape(selection) {
      var lowHighlight  = 16,
          highHighlight = 19;
      var top    = padding[0],
          right  = width  - padding[1],
          bottom = height - padding[2],
          left   = padding[3],
          x      = d3.scale.linear().domain([0, 24]).range([left, right]),
          y      = d3.scale.linear().range([bottom, top]),
          line   = d3.svg.line()
            .x(function(d, i) { return x(i+.5); })
            .y(function(d, i) { return y(d); });

      xAxis.scale(x).innerTickSize(top - bottom);
      yAxis.scale(y);

      if (useViewBox) {
        selection
          .attr("viewBox", [0, 0, width, height].join(" "));
      } else {
        selection
          .attr("width",  width)
          .attr("height", height);
      }

      selection.each(function(d, i) {
        d.domain = [0, d3.max(d.hours)];
        d.y = y.copy()
          .domain(d.domain)
          .nice();
      });

      function applyXAxis(g) {
        g.attr("transform", "translate(" + [0, bottom] + ")")
          .call(xAxis);
      }

      function applyYAxis(g) {
        g.attr("transform", "translate(" + [left, 0] + ")")
          .each(function(d) {
            d3.select(this)
              .call(yAxis
                .tickValues(d.y.domain())
                .scale(d.y));
          });
      }

      selection.each(function() {
        var node = d3.select(this);

        var xa = node.select("g.axis.x");
        if (xa.empty()) {
          xa = node.append("g")
            .attr("class", "axis x")
            .call(applyXAxis);
        }

        var ya = node.select("g.axis.y");
        if (ya.empty()) {
          ya = node.append("g")
            .attr("class", "axis y")
            .call(applyYAxis);
        }

        var g = node.select("g.data");
        if (g.empty()) {
          g = node.append("g")
            .attr("class", "data");
          g.append("path")
            .attr("class", "line");
        }
      });

      selection.select(".axis.x")
        .call(applyXAxis);

      selection.select(".axis.y")
        .call(applyYAxis);

      var g = selection.select("g.data")
        .attr("transform", "translate(" + [0, 0] + ")");

      g.select("path.line")
        .attr("d", function(d) {
          return line.y(d.y)(d.hours);
        });

      g.each(function(d) {
        var slice = d3.select(this)
          .selectAll("g.slice")
            .data(d.hours.map(function(h) {
              return {
                hour: h,
                row: d
              };
            }));
        slice.exit().remove();
        var enter = slice.enter().append("g")
          .attr("class", "slice");
        enter.append("rect")
          .attr("class", "region")
          .attr("fill", "transparent");
        enter.append("circle")
          .attr("class", "point")
          .attr("r", 3);
      });

      var slice = g.selectAll("g.slice"),
          size = 8;

      slice.select("rect.region")
        .attr("x", function(d, i) {
          return x(i); // - size / 2;
        })
        .attr("width", size-1.25)
        .attr("y", top)
        .attr("height", bottom - top)
        .attr("fill", function(p,i) { 
            if(i < lowHighlight | i > highHighlight) { return "transparent"; }
            else                                     { return "black"; }
          })
        .attr("opacity", function(p,i) { 
          if(i < lowHighlight | i > highHighlight)   { return "0"; }
          else                                       { return "0.2"; }
        });

      var point = slice.select(".point")
        .attr("cx", function(d, i) {
          return x(i+.5);
        })
        .attr("cy", function(d) {
          return d.row.y(d.hour);
        });
    }

    loadShape.xAxis = xAxis;
    loadShape.yAxis = yAxis;

    loadShape.width = function(w) {
      if (!arguments.length) return w;
      width = +w;
      return loadShape;
    };

    loadShape.height = function(h) {
      if (!arguments.length) return h;
      height = +h;
      return loadShape;
    };

    loadShape.padding = function(pad) {
      if (!arguments.length) return padding;
      padding = coercePadding(pad);
      return loadShape;
    };

    loadShape.size = function(size) {
      if (!arguments.length) return [width, height];
      width = size[0];
      height = size[1];
      return loadShape;
    };

    function formatHour(h) {
      var suffix = (h >= 12 && h < 24) ? "p" : "a",
          hour = (h > 12 ? h % 12 : h) || 12;
      return hour + suffix;
    }

    return loadShape;
  };

  mda.render.loadResponse = function() {
    var width      = 200,
        height     = 160,
        padding    = [5, 10, 20, 30],
        useViewBox = true,
        xAxis      = mda.render.axis()
          .orient("bottom")
          .ticks(24)
          .tickFormat(function(h) {
            return (h % 3 === 0) ? formatHour(h) : null;
          })
          .tickPadding(8)
          .outerTickSize(4),
        yAxis      = mda.render.axis()
          .orient("left")
          .tickSize(4)
          .tickPadding(4)
          .tickFormat(d3.format(".1r"));

    function loadResponse(selection) {
      var top    = padding[0],
          right  = width  - padding[1],
          bottom = height - padding[2],
          left   = padding[3],
          x      = d3.scale.linear().domain([0, 24]).range([left, right]),
          y      = d3.scale.linear().range([bottom, top]),
          line   = d3.svg.line()
            .x(function(d, i) { return x(i+.5); })
            .y(function(d, i) { return y(d); });
          line2  = d3.svg.line()
            .x(function(d, i) { return x(i+.5); })
            .y(function(d, i) { return y(d); });

      xAxis.scale(x).innerTickSize(top - bottom);
      yAxis.scale(y);

      if (useViewBox) {
        selection
          .attr("viewBox", [0, 0, width, height].join(" "));
      } else {
        selection
          .attr("width",  width)
          .attr("height", height);
      }

      selection.each(function(d, i) {
        d.domain = [0, d3.max(d.hours)];
        d.y = y.copy()
          .domain(d.domain)
          .nice();
      });

      function applyXAxis(g) {
        g.attr("transform", "translate(" + [0, bottom] + ")")
          .call(xAxis);
      }

      function applyYAxis(g) {
        g.attr("transform", "translate(" + [left, 0] + ")")
          .each(function(d) {
            d3.select(this)
              .call(yAxis
                .tickValues(d.y.domain())
                .scale(d.y));
          });
      }

      selection.each(function() {
        var node = d3.select(this);

        var xa = node.select("g.axis.x");
        if (xa.empty()) {
          xa = node.append("g")
            .attr("class", "axis x")
            .call(applyXAxis);
        }

        var ya = node.select("g.axis.y");
        if (ya.empty()) {
          ya = node.append("g")
            .attr("class", "axis y")
            .call(applyYAxis);
        }

        var g = node.select("g.data");
        if (g.empty()) {
          g = node.append("g")
            .attr("class", "data");
          g.append("path")
            .attr("class", "line2");
          g.append("path")
            .attr("class", "line response");
        }
      });

      selection.select(".axis.x")
        .call(applyXAxis);

      selection.select(".axis.y")
        .call(applyYAxis);

      var g = selection.select("g.data")
        .attr("transform", "translate(" + [0, 0] + ")");
      
      g.select("path.line2")
        .attr("d", function(d) {
          return line2.y(d.y)(d.forecast);
        });

      g.select("path.line")
        .attr("d", function(d) {
          return line.y(d.y)(d.hours);
        });


      g.each(function(d) {
        var slice = d3.select(this)
          .selectAll("g.slice")
            .data(d.hours.map(function(h) {
              return {
                hour: h,
                row: d
              };
            }));
        
        var newSlice = slice.enter().append("g")
          .attr("class", "slice")
        newSlice.append("rect")
          .attr("class", "region")
        newSlice.append("circle")
          .attr("r", 3);      
        slice.exit().remove();
        slice.select('rect.region')
          .attr("fill", function(p,i) { 
              if(i != p.row.hour) { return "transparent"; }
              else                { return "red"; }
            })
          .attr("opacity", function(p,i) { 
            if(i != p.row.hour) { return "0"; }
            else                { return "0.3"; }
          });
        slice.select('circle')
          .attr("class", function(p,i) { 
            if(i != p.row.hour) { return "point response"; }
            else                { return "point"; }
          });
      });

      var slice = g.selectAll("g.slice"),
          size = 8;

      slice.select("rect.region")
        .attr("x", function(d, i) {
          return x(i);// - size / 2;
        })
        .attr("width", size - 1.25)
        .attr("y", top)
        .attr("height", bottom - top);

      var point = slice.select(".point")
        .attr("cx", function(d, i) {
          return x(i+.5);
        })
        .attr("cy", function(d) {
          return d.row.y(d.hour);
        });
    }

    loadResponse.xAxis = xAxis;
    loadResponse.yAxis = yAxis;

    loadResponse.width = function(w) {
      if (!arguments.length) return w;
      width = +w;
      return loadResponse;
    };

    loadResponse.height = function(h) {
      if (!arguments.length) return h;
      height = +h;
      return loadResponse;
    };

    loadResponse.padding = function(pad) {
      if (!arguments.length) return padding;
      padding = coercePadding(pad);
      return loadResponse;
    };

    loadResponse.size = function(size) {
      if (!arguments.length) return [width, height];
      width = size[0];
      height = size[1];
      return loadResponse;
    };

    function formatHour(h) {
      var suffix = (h >= 12 && h < 24) ? "p" : "a",
          hour = (h > 12 ? h % 12 : h) || 12;
      return hour + suffix;
    }

    return loadResponse;
  };

  function coercePadding(pad) {
    if (typeof pad === "number") {
      return [pad, pad, pad, pad];
    } else if (pad.length === 2) {
      return [pad[0], pad[1], pad[0], pad[1]];
    }
    return pad;
  }

})(this);
