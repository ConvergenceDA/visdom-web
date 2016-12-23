(function(exports) {

  var mda = exports.mda;

  mda.require("render", "ui", "color"); 

  mda.charts = {};

  var colorbrewer = mda.color.brewer;

  var Chart = mda.charts.Chart = mda.Class({
    mixins: [
      mda.EventDispatch,
    ],

    /*
     * These are the events that Chart instances dispatch.
     *
     * XXX if you wish to dispatch other events in a Chart class
     * you'll need to provide an "events" key like this in the
     * prototype
     */
    events: ["change", "loading", "load", "error", "render"],
    eventLabel: "Chart",

    statics: {
      options: {
        transition: 1000,
        autoSize: true,
        width: 500,
        height: 500
      }
    },

    /*
     * The Chart constructor merges options (note: these are different from
     * the state) into this.options, intializes this.model and this.api, and
     * creates this.root as a d3 selection with a "chart" class.
     */
    initialize: function(root, options) {
      if (arguments.length === 1) {
        options = root;
        root = options.root;
      }

      this.options = mda.util.extend({}, Chart.options, this.constructor.options, options);
      this.model = this.options.model || new mda.model.Model();
      this.api = this.options.api || mda.api();

      this._data = [];
      this._state = this.constructor.options
        ? mda.util.extend({}, this.constructor.options.state)
        : {};
      this._diff = {};

      this.root = mda.dom.coerceSelection(root)
        .classed("chart", true);

      this.loading = false;
      this._updated = false;

      // set the initial state
      this.setState(this.options.state);

      if (this.options.autoSize === true) {
        var resizeBound = this.resize.bind(this);
        window.addEventListener("resize", resizeBound);
        this.on("render.resize", resizeBound, "Chart#resize");
      }
    },

    resize: function() {
      // do nothing
    },

    // utility function for resizing SVG using a viewBox
    resizeSVG: function(svg, outerWidth) {
      if (outerWidth > 0) {
        var aspect = this.options.width / this.options.height;
        this.chart
          .attr("width", outerWidth)
          .attr("height", Math.ceil(outerWidth / aspect))
          .attr("viewBox", [0, 0, this.options.width, this.options.height].join(" "));
      } else {
        this.chart
          .attr("width", this.options.width)
          .attr("height", this.options.height)
          .attr("viewBox", null);
      }
    },

    /*
     * get the current chart state as an object literal
     */
    getState: function() {
      return mda.util.extend({}, this._state);
    },

    /*
     * set the current chart state as an object literal by
     * merging keys from the provided object into the current state
     * (in order to preserve defaults)
     */
    setState: function(state) {
      var old = mda.util.extend({}, this._state);
      mda.util.extend(this._state, state);
      this._diff = mda.util.diff(old, this._state);
      return this;
    },

    /*
     * setData() assigns the fetched data, applying any necessary
     * transformations, such as passing query results through mda.data.table()
     */
    setData: function(data) {
      this._data = data;
      return this;
    },

    // and getData() returns the fetched data
    getData: function() {
      return this._data;
    },

    // charts need to implement a synchronous render() method
    render: function() {
      throw "Chart.render() not implemented";
    },

    /*
     * charts need to implement a  fetch() method with the following
     * signature:
     *
     * fetch(callback) -> callback(error, data)
     */
    fetch: function() {
      throw "Chart.fetch() not implemented";
    },

    /*
     * charts have an async update method that performs the following:
     *
     * update([callback]) ->
     *   load() ->
     *     setData()
     *     render()
     *     callback(null, transformedData)
     *
     */
    update: function(callback) {
      var done = (callback || mda.noop).bind(this);
      this.load(function(error, data) {
        if (error) return done(error);
        this.setData(data);
        this.render();
        this._updated = true;
        return done(null, this.getData());
      });
      return this;
    },

    // load([callback]) -> callback(error, data)
    load: function(callback) {
      if (this._request) {
        this._request.abort();
        this._request = null;
      }
      this.root.classed("loading", this.loading = true);
      var done = (callback || noop).bind(this);
      this._request = this.fetch(function(error, data) {
        this._request = null;
        this.root.classed("loading", this.loading = false);
        if (error) {
          this.trigger("error", error);
        } else {
          this.trigger("load", data);
        }
        return done(error, data);
      }.bind(this));
      this.trigger("loading", this._request);
      return this;
    },

    /*
     * A handy method for conditionally transitioning a selection based on the
     * _updated flag, which will be false until update() has finished its round
     * trip.
     */
    getTransition: function(selection, options) {
      return mda.transition(selection, this._updated
        ? options || this.options.transition
        : null);
    },

    hasLegend: function() {
      return this.legend && this.legend.root;
    },

    getLegendRoot: function() {
      return this.hasLegend() ? this.legend.root : null;
    },

    /*
     * Add loading/loaded hooks to set the "loading" class on the legend,
     * if there is one.
     */
    addLegendHooks: function() {
      if (!this.hasLegend()) return false;

      var legendRoot = this.legend.root;
      this
        .on("loading.legend", function() {
          legendRoot.classed("loading", true);
        })
        .on("load.legend", function() {
          legendRoot.classed("loading", false);
        });

      return true;
    }

  });

  /*
   * Cumulative Sum chart
   */
  mda.charts.CumSum = Chart.extend({
    statics: {
      options: {
        width: 550,
        height: 500,
        padding: [20, 20, 50, 80],
        cursor: true,
        positionTable: true,
        state: {
          // # of samples
          samples:  100,
          // y-axis feature (column) name
          y:        "nObs",
          // show y-axis values as %
          pct:      false,
          // data query filter
          filter:   null
        }
      }
    },

    initialize: function() {
      Chart.prototype.initialize.apply(this, arguments);

      this.container = this.root.append("div")
        .classed("cumsum", true);

      this.chart = mda.dom.coerceSelection(this.options.chart || this.container.append("svg"))
        .call(this.setupChart.bind(this));

      this.table = mda.dom.coerceSelection(this.options.table || this.container.append("table"))
        .call(this.setupTable.bind(this));

      this.cumsum = mda.render.cumsum()
        .size([this.options.width, this.options.height])
        .padding(this.options.padding);

      if (this.options.cursor) {
        this.cursor = mda.render.cumsum.cursor()
          .cumsum(this.cumsum);
      }
    },

    resize: function() {
      this.root
        .style("width", null)
        .style("height", null);

      var width = this.root.property("offsetWidth");
      this.resizeSVG(this.chart, width);
      this.root.style("height", this.root.property("offsetHeight") + "px");

      if (this.options.positionTable) {
        var scale = width / this.options.width,
            inset = 15;
        this.table.style({
          position: "absolute",
          right: ~~((inset + this.options.padding[1]) * scale) + "px",
          bottom: ~~((inset + this.options.padding[2]) * scale) + "px"
        });
      }
    },

    setupChart: function(svg) {
      svg.append("rect")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("fill", "transparent");
    },

    setupTable: function(table) {
      table.classed("percentiles", true);
      var thead = table.append("thead"),
          tr = thead.append("tr");
      tr.append("th")
        .attr("colspan", 2)
        .text("Percentile");
      tr.append("th")
        .attr("colspan", 2)
        .text("Ratio");
    },

    getState: function() {
      return mda.util.extend({}, this._state);
    },

    render: function() {
      var cumsum = this.cumsum,
          cursor = this.cursor,
          chart = this.chart,
          rows = this.getData(),
          y = this._state.y,
          column = this.model.column(y),
          label = column.label || column.name,
          getX = function(d) { return d.x; },
          getY = function(d) { return d.y; },
          values = rows.map(getY),
          last = values[values.length - 1],
          domain = [0, last],
          units = column.units;

      /*
      // this is an attempt to fix #45 that causes other issues
      var px = d3.scale.linear()
        .domain([0, rows.length - 1])
        .range([0, 100]);
      rows.forEach(function(d) {
        d.x = px(d.x);
      });
      */

      if (this._state.pct) {
        var yScale = d3.scale.linear()
          .domain(domain)
          .range([0, 100]);
        values = values.map(yScale);
        getY = function(d) { return yScale(d.y); };
        cumsum.yAxis.tickFormat(function(d) {
          return d + "%";
        });
        cumsum.yScale().domain([0, 100]);
        cumsum.yAxis.label("% of " + label);
        units = "%";
      } else {
        cumsum.yAxis.tickFormat(column.format || String);
        cumsum.yScale().domain(domain);
        cumsum.yAxis.label(column.axisLabel);
      }

      cumsum.yAxis.margin(this.options.padding[3] - 15);

      this.chart
        .datum([rows]);

      var t = this.getTransition(this.chart)
        .call(cumsum
          .x(getX)
          .y(getY));
      if (cursor) {
        t.call(cursor);
      }

      var that = this;
      chart.selectAll("rect.region")
        .on("mouseover", function(d, i) {
          if (that._fixedPercent) return;
          that.setHighlight(d.x0, false);
        })
        .on("mousedown", function(d, i) {
          that._fixedPercent = null;
          that.setHighlight(d.x0, false);
          d3.event.preventDefault();
        })
        .on("click", function(d, i) {
          that.setHighlight(d.x0, true);
        })
        .on("mouseup", function(d, i) {
          that.setHighlight(d.x0, true);
        })
        .on("mouseout", function(d) {
          if (that._fixedPercent) return;
          that.clearHighlight(false);
        });

      var scale = d3.scale.linear()
            .domain(cumsum.yScale().domain())
            .range([0, 100]),
          ys = values.map(scale);
      this.table
        .datum(ys)
        .call(this.updateTable.bind(this));

      this.trigger("render");
    },

    fetch: function(callback) {
      return this.api.query({
        columns: [this._state.y],
        sampling: {
          type: "thin",
          count: this._state.samples
        },
        cum: true,
        filter: this._state.filter
      }, callback);
    },

    setData: function(data) {
      var y = this._state.y,
          rows = mda.data.table(data);
      rows.forEach(function(d, i) {
        d.x = i + 1;
        d.y = d[y + "_cumsum"];
      });
      rows.unshift({
        x: 0,
        y: 0
      });
      // we actually want 101 points, so that each represents a round
      // percentage
      this._data = this.interpolate(rows, 101);
      return this;
    },

    interpolate: function(points, length) {
      if (points.length === length) {
        return points.slice();
      }

      // get the x- and y- values as separate arrays
      var xs = points.map(function(d) { return d.x; }),
          ys = points.map(function(d) { return d.y; });

      // our x-scale converts an index in the desired range [0, length - 1]
      // to an index in the range [0, points.length - 1]
      var xScale = d3.scale.linear()
        .domain([0, length - 1])
        .range([0, points.length - 1]);

      // and our y-scale interpolates (linearly) a y-value for a given x-value
      // *in the original set of points*
      var yScale = d3.scale.linear()
        .domain(xs)
        .range(ys);

      /*
       * now, map those points into objects {x, y} by:
       * 1. converting an index in the output range to an x-value in the input
       * 2. interpolating the x-value with the y-scale
       *    (and using this as the y value)
       * 3. using the output index as the output x value
       */
      return d3.range(0, length).map(function(i) {
        var x = xScale(i),
            y = yScale(x);
        return {
          x: i,
          y: y
        };
      });
    },

    updateTable: function(table) {
      var ys = table.datum(),
          cumsum = this.cumsum,
          percents = [this._highlightPercent || 0, 10, 25, 50, 75, 90]
            .map(function(x, i) {
              var y0 = x,
                  y1 = cumsum.getYForXPercent(x, ys),
                  ratio = y1 / y0 || 0;
              return {
                hover: i === 0,
                x: x,
                y0: y0,
                y1: y1,
                ratio: ratio
              };
            });

      var percentFormat = d3.format(".1f"),
          xFormat = d3.format(".1f");

      table.each(function() {
        var that = d3.select(this),
            tbody = that.select("tbody");
        if (tbody.empty()) {
          tbody = that.append("tbody");
        }
        var tr = tbody.selectAll("tr")
          .data(percents);
        tr.exit().remove();
        var enter = tr.enter()
          .append("tr")
            .attr("class", "percentile");
        enter.append("td")
          .attr("class", "clear");
        enter.append("th")
          .append("a");
        enter.append("td")
          .attr("class", "bars");
        enter.append("td")
          .attr("class", "ratio");
        tr.classed("hover", function(d, i) {
          return d.hover;
        });
      });

      var tr = table.selectAll("tr.percentile")
        .each(function(d, i) {
          d3.select(this).classed("disabled", i === 0 && !d.x);
        });
      tr.select("th > a")
        .text(function(d) { return Math.round(d.x) + "%"; });

      tr.each(function(d) {
        var bar = d3.select(this)
          .select("td.bars")
            .selectAll("div.bar")
              .data([
                  {type: "untargeted", y: d.y0},
                  {type: "targeted", y: d.y1}
              ]);
        bar.exit().remove();
        bar.enter().append("div")
          .attr("class", "bar")
          .style("width", "0%");
        bar.attr("class", function(d) {
          return ["bar", d.type].join(" ");
        });
      })
      .selectAll(".bar")
        .style("width", function(d) {
          return percentFormat(d.y) + "%";
        });

      tr.select("td.ratio")
        .text(function(d) { return xFormat(d.ratio) + "x"; });

      var that = this;
      table.selectAll("tr.percentile:not(.hover) a")
        .attr("href", function(d) {
          return "#?xp=" + d.x;
        })
        .on("click", function(d) {
          d3.event.preventDefault();
          that.setHighlight(d.x, true);
        });

      var clearLink = table.select("tr.hover td:first-child a.clear");
      if (clearLink.empty()) {
        table.select("tr.hover td:first-child")
          .append("a")
            .attr("class", "clear")
            .html("&times;")
            .attr("href", "#clear")
            .style("visibility", "hidden")
            .on("click", function() {
              d3.event.preventDefault();
              that.clearHighlight(true);
            });
      }

      if (this.cursor && this._highlightPercent) {
        this.getTransition(this.chart)
          .call(this.cursor);
      }
    },

    setHighlight: function(percent, fixed) {
      if (!this.cursor) return this;

      this.chart.call(this.cursor
        .visible(true)
        .index(percent));

      if (fixed) this._fixedPercent = percent;
      this._highlightPercent = percent;
      this.table.call(this.updateTable.bind(this));
      clearTimeout(this._highlightTimeout);
      if (this._fixedPercent) {
        this.table.select("a.clear")
          .style("visibility", null);
      }
      return this;
    },

    clearHighlight: function(immediate) {
      if (!this.cursor) return this;

      this._fixedPercent = null;
      this.chart.call(this.cursor
        .visible(false)
        .index(null));
      clearTimeout(this._highlightTimeout);
      if (immediate) {
        this._highlightPercent = null;
        this.table.call(this.updateTable.bind(this));
      } else {
        this._highlightTimeout = setTimeout(function() {
          this._highlightPercent = null;
          this.table.call(this.updateTable.bind(this));
        }.bind(this), 50);
      }
      this.table.select("a.clear")
        .style("visibility", "hidden");
      return this;
    }

  });


  /*
   * Histogram chart
   */
  mda.charts.Histogram = Chart.extend({
    statics: {
      options: {
        width: 550,
        height: 400,
        padding: [20, 20, 50, 80],
        tooltip: {
          position: "top"
        },
        state: {
          bins: 50,
          x: "nObs",
          cum: false,
          area: false,
          filter: null
        }
      }
    },

    initialize: function(root, options) {
      Chart.prototype.initialize.apply(this, arguments);

      this.chart = mda.dom.coerceSelection(this.options.chart || this.root.append("svg"))
        .classed("histogram", true)
        .call(this.setupChart.bind(this));

      this.histo = mda.render.histogram()
        .size([this.options.width, this.options.height])
        .padding(this.options.padding);

      this.tooltip = new mda.ui.Tooltip(this.options.tooltip);
    },

    resize: function() {
      this.resizeSVG(this.chart, this.root.property("offsetWidth"));
    },

    fetch: function(callback) {
      return this.api.query({
        columns: [this._state.x],
        sampling: {
          type: "hist",
          count: this._state.bins
        },
        filter: this._state.filter
      }, callback);
    },

    setData: function(data) {
      this._data = mda.data.table(data);
      return this;
    },

    setupChart: function(chart) {
      // XXX Firefox needs this background rect to calculate the correct
      // bounding rect
      chart.append("rect")
        .attr("fill", "transparent")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("pointer-events", "none");
    },

    render: function() {
      var rows = this._data,
          histo = this.histo,
          chart = this.chart,
          x = this._state.x,
          column = this.model.column(x);

      if (this._state.cum) {
        rows.reduce(function(mem, d) {
          mem += d.counts || 0;
          d.counts = mem;
          return mem;
        }, 0);
      }

      var xFormat = column.format || d3.format(".2f"),
          yFormat = histo.yAxis.tickFormat();
      histo.xAxis
        .tickFormat(xFormat || String)
        .label(column.axisLabel);
      histo.yAxis
        .margin(this.options.padding[3] - 15)
        .label("count");

      histo
        .x0(function(d) { return d.bin_min; })
        .x1(function(d) { return d.bin_max; })
        .y(function(d) { return d.counts; });

      chart.datum(rows);

      var t = this.getTransition(chart)
        .call(histo);

      if (this._state.area) {
        var x = histo.xScale(),
            y = histo.yScale(),
            first = rows[0],
            last = rows[rows.length - 1],
            points = rows.map(function(d) {
              return {
                x: d.bin_min + (d.bin_max - d.bin_min) / 2,
                y: d.counts
              };
            });
        points.unshift({
          x: first.bin_min,
          y: first.counts
        });
        points.push({
          x: last.bin_max,
          y: last.counts
        });

        var path = mda.ui.element(chart, "path.area")
          .datum(points)
          .attr("pointer-events", "none")
          .each(mda.dom.bringToFront);

        var area = d3.svg.area()
          .interpolate(this._state.interp || "none")
          .x(function(d) { return x(d.x); })
          .y0(y(y.domain()[0]))
          .y1(function(d) { return y(d.y); });

        var p = this._transitionArea
          ? t.select("path.area")
          : path;

        p.attr("d", area(points))
          .attr("opacity", 1);

      } else {
        t.select("path.area")
          .attr("opacity", 0);
      }

      var chartNode = chart.node(),
          tooltip = this.tooltip.attachTo(chartNode.parentNode)
            .style("text-align", "center")
            .setContent([
              '<var>y</var> = <b data-key="count">count</b><br>',
              '<b data-key="min">min</b> &#8804; <var>x</var> ',
              '&#8804; <b data-key="max">max</b>'
            ].join(""), true)
            .hide();

      chart.on("mousemove", function() {
        if (!tooltip.visible()) return;

        var rect = this.getBoundingClientRect(),
            e = d3.event,
            x = Math.floor(e.clientX - rect.left),
            y = Math.floor(e.clientY - rect.top) - 4;
        tooltip.moveTo(x, y, chartNode);
      });

      chart.selectAll("g.slice")
        .on("mouseover", function(d) {
          this.classList.add("hilite");
          tooltip
            .updateContent({
              count: yFormat(d.counts),
              min: xFormat(d.bin_min),
              max: xFormat(d.bin_max)
            })
            .show();
        })
        .on("mouseout", function(d) {
          this.classList.remove("hilite");
          tooltip.hide();
        });

      this.trigger("render");
    },

    setState: function(state) {
      Chart.prototype.setState.call(this, state);
      this._transitionArea = !!this._diff.interp;
      return this;
    }

  });


  mda.charts.Legend = mda.EventDispatch.extend({
    statics: {
      options: {
        title: "Legend"
      }
    },

    events: ["hilite"],
    eventLabel: "Legend",

    initialize: function(root, options) {
      this.root = mda.dom.coerceSelection(root)
        .classed("legend", true);

      this.options = mda.util.extend({}, mda.charts.Legend.options, options);

      if (this.options.title) {
        this.root.append("h4")
          .attr("class", "title")
          .text(this.options.title);
      }

      this.steps = this.root.append("ol")
        .attr("class", "steps");
    },

    update: function(state) {
      if (!state) throw new Error("Legend#update() needs a state object");

      var scheme = state.scheme,
          column = state.column,
          values = state.values;
      if (!scheme) throw new Error("Legend#update() needs a color scheme (state.scheme)");
      if (!values) throw new Error("Legend#update() needs a values array (state.values)");
      if (!column) throw new Error("Legend#update() needs a column object (state.column)");

      var steps = scheme.getSteps(values),
          colorScale = scheme.getScale(values, state.steps || 0),
          format = column.format,
          agg = state.agg,
          isCount = (agg === "count"),
          units = isCount
            ? "obs."
            : column.units;

      if (state.agg === "count") {
        format = mda.unit.format(",").round(true);
      } else {
        switch (column.type) {
          case "date":
            var dateFormat = column.format,
                convertDate = column.convert;
            format = function(t) {
              return dateFormat(convertDate(t));
            };
            break;
        }
      }

      var rangeFormat = mda.unit.rangeFormat(format)
        .glue(" &mdash; ");
      switch (scheme.type) {
        case "category":
          rangeFormat = function(extent) {
            return extent.join(", ");
          };
          break;
      }

      var that = this;

      if (scheme.type === "linear") {

        this.steps.selectAll(".step")
          .remove();

        var palette = mda.ui.element(this.root, "div.palette"),
            width = palette.property("offsetWidth"),
            height = palette.property("offsetHeight"),
            canvas = mda.ui.element(palette, "canvas")
              .attr("width", width)
              .attr("height", height)
              .node(),
            labels = mda.ui.element(palette, "div.labels"),
            regions = mda.ui.element(palette, "div.regions"),
            values = state.values;

        var context = canvas.getContext("2d"),
            gradient = context.createLinearGradient(0, 0, 0, height),
            stops = scheme.getSteps(values, height);
        stops.forEach(function(d, i) {
          try {
            gradient.addColorStop(i / height || 0, d.color);
          } catch (err) {
            mda.logger.warn("unable to add color stop @", i / height, d.color, ":", err);
          }
        });
        context.clearRect(0, 0, width, height);
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);

        var extent = d3.extent(values),
            median = d3.median(values),
            labelValues = [
              extent[0],
              median,
              extent[1],
              null
            ];

        var label = labels.selectAll(".label")
          .data(labelValues);
        label.enter().append("div")
          .attr("class", "label")
          .append("span");
        label.exit().remove();
        label
          .style("top", function(d, i) {
            return i / 2 * 100 + "%";
          })
          .select("span")
            .text(format);

        var hilite = label.filter(":last-child")
          .classed("hilite", true)
          .style("display", "none");

        var region = regions.selectAll(".region")
          .data(stops);
        region.exit().remove();
        region.enter().append("div")
          .attr("class", "region");
        region.style({
          height: "1px",
          top: function(d, i) {
            return i + "px";
          }
        })
        .on("mouseover", function(d, i) {
          hilite.style({
            top: i + "px",
            display: null
          })
          .select("span")
            .text(format(d.value));
          that.trigger("hilite", d);
        })
        .on("mouseout", function(d) {
          hilite.style("display", "none");
          that.trigger("hilite", null);
        });

      } else {

        this.root.select(".palette").remove();

        var step = this.steps
          .selectAll(".step")
          .data(steps);

        var enter = step.enter()
          .append("li")
            .attr("class", "step");
        enter.append("span")
          .attr("class", "swatch");
        enter.append("span")
          .attr("class", "value");
        step.exit()
          .remove();

        step.select(".swatch")
          .style("background-color", function(d) {
            return d.color;
          })
          .on("mouseover", function(d) {
            that.trigger("hilite", d);
          })
          .on("mouseout", function(d) {
            that.trigger("hilite", null);
          });

        step.select(".value")
          .html(function(d, i) {
            return rangeFormat(d.extent);
            var range = d.extent.map(format).join(glue);
            return (i === 0 || i === (steps.length - 1))
              ? [range, units].join(" ")
              : range;
          });
      }

      return this;
    }
  });

  /*
   * Scatter Plot chart
   */
  mda.charts.ScatterPlot = Chart.extend({
    statics: {
      options: {
        width: 550,
        height: 520,
        padding: [20, 20, 50, 80],
        tooltip: {
          position: "top",
          offset: 10
        },
        legend: true,
        state: {
          x: null,
          y: null,
          color: null,
          scheme: "divergent",
          samples: 3000
        }
      }
    },

    colorSchemes: {
      "divergent": new mda.color.DivergentScheme([
        d3.hsl(240, 1, .5),
        d3.hsl(0, 0, .9),
        d3.hsl(0, 1, .5)
      ], {
        label: "Divergent (Rd-Wt-Bu)"
      }),

      "linearBkRd": new mda.color.LinearScheme([
        d3.hsl(0, 0, 0),
        d3.hsl(0, 1, .55)
      ], {
        label: "Linear (Bk-Rd)"
      }),

      "linearWtRd": new mda.color.LinearScheme([
        d3.hsl(0, 0, 1),
        d3.hsl(255, 1, .5)
      ], {
        label: "Linear (Wh-Pu)"
      }),

      "category": new mda.color.CategoricalScheme(colorbrewer.Set3[12], {
        label: "Categorical"
      }),

      // some other schemes to whet the appetite...

      "greens": mda.color.scheme("Greens", 7, {
        label: "Greens"
      }),

      "oranges": mda.color.scheme("Oranges", 7, {
        label: "Oranges"
      }),

      "spectral": mda.color.scheme("Spectral", 9, {
        label: "Spectral"
      }),
    },

    initialize: function(root, options) {
      Chart.prototype.initialize.apply(this, arguments);

      this.chart = mda.dom.coerceSelection(this.options.chart || this.root.append("svg"))
        .call(this.setupChart.bind(this));

      // copy colorSchemes from the prototype
      var schemes = this.colorSchemes = mda.util.extend({}, this.colorSchemes);
      this._defaultColorScheme = schemes[Object.keys(schemes)[0]];

      this.scatter = mda.render.scatter()
        .size([this.options.width, this.options.height]);
      mda.util.configure(this.scatter, this.options);

      this.tooltip = new mda.ui.Tooltip(this.options.tooltip);

      if (this.options.legend) {
        if (this.options.legend instanceof mda.charts.Legend) {
          this.legend = this.options.legend;
        } else {
          var legend = (this.options.legend === true) 
            ? this.root.append("div")
            : mda.dom.coerceSelection(this.options.legend);
          this.legend = new mda.charts.Legend(legend);
        }
        this.legend.on("hilite", this.setHighlight.bind(this), "ScatterPlot#setHighlight");
      }
    },

    resize: function() {
      this.resizeSVG(this.chart, this.root.property("offsetWidth"));
    },

    fetch: function(callback) {
      var columns = [this._state.x, this._state.y];
      if (this._state.color && columns.indexOf(this._state.color) === -1) {
        columns.push(this._state.color);
      }
      return this.api.query({
        columns: columns,
        sampling: {
          type: "rnd",
          count: this._state.samples
        },
        filter: this._state.filter
      }, callback);
    },

    setData: function(data) {
      this._data = mda.data.table(data);
      return this;
    },

    setupChart: function(chart) {
      return;
      // XXX Firefox needs this background rect to calculate the correct
      // bounding rect
      chart.append("rect")
        .attr("fill", "transparent")
        .attr("width", "100%")
        .attr("height", "100%");
    },

    setHighlight: function(d) {
      var points = this.chart.selectAll(".point")
            .each(function(d, i) {
              d._index = i;
            }),
          klass = "hilite";
      if (d) {
        var extent = d.extent,
            categorical = extent.length < 2 || typeof extent[0] === "string",
            key = this._state.color;
        points.classed(klass, categorical
          ? function(d, i) {
            var val = d[key];
            return extent.indexOf(val) > -1;
          }
          : function(d, i) {
            var val = d[key];
            return val >= extent[0] && val <= extent[1];
          })
          .each(function(d, i) {
            d._hilite = this.classList.contains(klass);
          })
          .sort(function(a, b) {
            return d3.ascending(a._hilite, b._hilite);
          })
          .order();
      } else {
        points.classed(klass, false)
          .sort(function(a, b) {
            return d3.ascending(a._index, b._index);
          })
          .order();
      }
    },

    render: function() {
      var scatter = this.scatter,
          chart   = this.chart,
          x       = this._state.x,
          y       = this._state.y,
          z       = this._state.color,
          logx    = this._state.logx,
          logy    = this._state.logy,
          xcol    = this.model.column(x),
          ycol    = this.model.column(y),
          rows    = this.getData();

      /*
      rows.sort(function(a, b) {
        return d3.descending(a[y], b[y]) || d3.descending(a[x], b[x]);
      });
      */
    
      mda.logger.info(scatter.yScale().domain());
      if(logx) { scatter.xScale(d3.scale.pow().exponent(0.5).clamp(true)); }
      else     { scatter.xScale(d3.scale.linear().clamp(true)); }
      if(logy) { scatter.yScale(d3.scale.pow().exponent(0.5).clamp(true)); }
      else     { scatter.yScale(d3.scale.linear().clamp(true)); }

      scatter.xAxis
        .tickFormat(xcol.format || String)
        .label(xcol.axisLabel);
      scatter.yAxis
        .margin(this.options.padding[3] - 15)
        .tickFormat(ycol.format || String)
        .label(ycol.axisLabel);

      scatter
        .x(function(d) { return d[x]; })
        .y(function(d) { return d[y]; });

      chart.datum(rows);

      if (this._state.color) {
        var colorKey   = this._state.color,
            scheme     = this.colorSchemes[this._state.scheme] || this._defaultColorScheme,
            getValue   = function(d) { return d[colorKey]; },
            values     = rows.map(getValue),
            colorScale = scheme.getScale(values);
        /*
        mda.logger.debug("color scale:",
            colorScale.domain(),
            "->",
            colorScale.range().map(String));
        */
        scatter.fill(function(d) {
          var v = getValue(d),
              c = colorScale(v);
          // mda.logger.debug("color:", v, c);
          return c;
        });

        if (this.legend) {
          this.legend.update({
            scheme: scheme,
            values: values,
            column: this.model.getColumn(colorKey),
            agg: null
          });
        }
      } else {
        scatter.fill(this.options.fill);
      }

      var t = this.getTransition(chart)
        .call(scatter);

      var contentTemplate = [
        '<var>x</var> = <b data-key="x">x</b><br>',
        '<var>y</var> = <b data-key="y">y</b><br>'
      ];

      if (z) {
        var zcol = this.model.column(z);
        contentTemplate.push('<var>z</var> = <b data-key="z">z</b>');
      }
      var chartNode = chart.node(),
          tooltip = this.tooltip
            .attachTo(chartNode.parentNode)
            .setContent(contentTemplate.join(""), true)
            .hide();

      chart.selectAll(".point")
        .on("mouseover", function(d) {
          var p1 = chartNode.createSVGPoint(),
              mat = this.getCTM(),
              p2 = mat ? p1.matrixTransform(mat) : p1;
          tooltip
            .moveTo(p2.x, p2.y, chartNode)
            .updateContent({
              x: d[x],
              y: d[y],
              z: d[z]
            })
            .show();
          this.classList.add("hilite");
          this._nextSibling = this.nextSibling;
          this.parentNode.appendChild(this);
        })
        .on("mouseout", function(d) {
          tooltip.hide();
          this.classList.remove("hilite");
          this.parentNode.insertBefore(this, this._nextSibling);
          delete this._nextSibling;
        });

      this.trigger("render");
    },

    setState: function(state) {
      Chart.prototype.setState.call(this, state);
      // XXX update color scheme here?
      return this;
    },

    setSchemeDefaultColors: function(name, colors) {
      var scheme = this.colorSchemes[name];
      if (!scheme) throw new Error("No such color scheme: " + name);
      scheme.colors = colors;
      return this;
    },
  });


  /*
   * Load Shapes chart
   */
  mda.charts.LoadShapes = Chart.extend({
    statics: {
      options: {
        width: 200,
        height: 160,
        padding: [5, 10, 20, 30],
        legendTitle: "Categories",
        state: {
          count: 9,
          sort: "kwh",
          peak: true
        }
      }
    },

    initialize: function(root, options) {
      Chart.prototype.initialize.apply(this, arguments);

      this.container = this.root.append("div")
        .classed("row", true);

      this.loadShape = mda.render.loadShape()
        .size([this.options.width, this.options.height]);
      mda.util.configure(this.loadShape, this.options);

      this._legend = mda.dom.coerceSelection(this.options.legend || this.container.append("div"))
        .classed("legend load-shapes-legend", true);

      this._legend.append("h4")
        .attr("class", "title")
        .text(this.options.legendTitle);

      // expose legend as an object with a root property,
      // for compliance with MultiChartApp
      this.legend = {root: this._legend};
    },

    resize: function() {
      // TODO
    },

    fetch: function(callback) {
      return this.api.query.shapes({
        sort:   this._state.sort,
        count:  this._state.count,
        filter: this._state.filter
      }, callback);
    },

    setData: function(data) {
      mda.logger.log("[load shapes] data:", data);
      var hours = d3.range(1, 25); // 1-24
      this._data = mda.data.table(data.top)
        .map(function(row) {
          row.hours = hours.map(function(h) {
            var k = "hkw" + h,
                v = row[k];
            delete row[k];
            return v;
          });
          return row;
        });
      this._categories = data.categories;
      return this;
    },

    render: function() {
      var loadShape = this.loadShape,
          root = this.container,
          rows = this.getData();

      var shapes = root.selectAll(".plot")
        .data(rows);

      var enter = shapes.enter().append("div")
        .attr("class", "col-md-4 plot")
        .append("div")
          .attr("class", "shape");

      enter.append("span")
        .attr("class", "rank");

      var meta = enter.append("div")
        .attr("class", "meta");

      var display = enter.append("div")
        .attr("class", "display");

      var members = meta.append("h5")
        .attr("class", "figure members");
      members.append("span")
        .attr("class", "percent");
      members.append("span")
        .attr("class", "divider")
        .text(" / ");
      members.append("span")
        .attr("class", "total");
      var energy = meta.append("h5")
        .attr("class", "figure energy");
      energy.append("span")
        .attr("class", "percent");
      energy.append("span")
        .attr("class", "divider")
        .text(" / ");
      energy.append("span")
        .attr("class", "total");

      display.append("svg")
        .attr("class", "chart");

      shapes.exit().remove();

      shapes.select(".class")
        .text(function(d) {
          return d["class"] || "???";
        });

      shapes.select(".rank")
        .text(function(d, i) {
          return i + 1;
        });

      var formatCount = d3.format(","),
          formatPercent = (function() {
            var fmt = d3.format(".2r");
            return function(n) {
              return fmt(n).replace(/\.0+$/, "") + "%";
            };
          })(),
          formatEnergy = mda.unit.coerce("kWh").format;

      shapes.select(".members .total")
        .text(function(d) {
          return formatCount(d["total_members"]);
        });
      shapes.select(".members .percent")
        .text(function(d) {
          //return formatPercent(d["pct_members"] || 0);
          return formatPercent(d["pct_filtered_members"] || 0);
        });

      shapes.select(".energy .total")
        .text(function(d) {
          return formatEnergy(d["total_kwh"] * 1000); // todo.. not sure how to properly format kWh values
        });
      shapes.select(".energy .percent")
        .text(function(d) {
          //return formatPercent(d["pct_kwh"] || 0);
          return formatPercent(d["pct_filtered_kwh"] || 0);
        });

      var chart = shapes.select("svg.chart");

      this.getTransition(chart)
        .call(loadShape);

      var slice = chart.selectAll(".slice");
      slice.on("mouseover", function(d, i) {
        slice.classed("over", function(e, j) {
          return j === i;
        });
        chart.select(".axis.x")
          .classed("over", true)
          .selectAll(".tick")
            .classed("over", function(h, j) {
              return h === i;
            });
      });
      slice.on("mouseout", function() {
        slice.classed("over", false);
        chart.select(".axis.x")
          .classed("over", false)
          .selectAll(".tick")
            .classed("over", false);
      });

      var key = this._legend.select("div.key");
      if (key.empty()) {
        this._legend.append("div")
          .attr("class", "key")
          .selectAll(".bar")
            .data([
              {type: "members", title: "Members"},
              {type: "kwh", title: "KWh"}
            ])
            .enter()
            .append("div")
              .attr("class", function(d) {
                return ["bar", d.type].join(" ");
              })
              .append("span")
                .attr("class", "value")
                .text(function(d) { return d.title; });
      }

      var list = mda.ui.element(this._legend, "ul.categories"),
          categories = list.selectAll("li")
            .data(this._categories);

      categories.enter()
        .append("li")
          .attr("class", "category")
          .append("h5")
            .attr("class", "name");

      categories.exit().remove();

      categories.select(".name")
        .text(function(d) { return d.name; });

      var bars = categories.selectAll(".bar")
        .data(function(category) {
          return [
            //{type: "kwh",      value: category.pct_kwh},
            //{type: "members",  value: category.pct_members}
            {type: "kwh",      value: category.pct_filtered_kwh},
            {type: "members",  value: category.pct_filtered_members}
          ];
        });

      var enter = bars.enter().append("div")
        .attr("class", "bar");
      enter.append("span")
        .attr("class", "value");

      var domain = [];
      bars.each(function(d) {
        domain.push(d.value);
        this.classList.add(d.type);
      })
      .attr("title", function(d) {
        return (d.value * 100).toFixed(0) + "% of " + d.type;
      });

      var scale = d3.scale.linear()
        .domain([0, d3.max(domain)])
        .rangeRound([0, 100]);

      bars.select(".value")
        .text(function(d) {
          return (d.value * 100).toFixed(0) + "%";
        });

      var t = this.getTransition(categories);
      t.selectAll(".bar")
        .call(mda.dom.styleTween()
          .property("width")
          .value(function(d) {
            return scale(d.value);
          })
          .units("%"));

      this.trigger("render");
    },
  });

  /*
   * Load Response chart
   */
  mda.charts.LoadResponse = Chart.extend({
    statics: {
      options: {
        width: 200,
        height: 160,
        padding: [5, 10, 20, 30],
        state: {
          count: 9,
          sort: "savings",
          desc: true
        }
      }
    },

    initialize: function(root, options) {
      Chart.prototype.initialize.apply(this, arguments);

      this.container = this.root.append("div")
        .classed("row", true);

      this.loadResponse = mda.render.loadResponse()
        .size([this.options.width, this.options.height]);
      mda.util.configure(this.loadResponse, this.options);

      //this._legend = mda.dom.coerceSelection(this.options.legend || this.container.append("div"))
      //  .classed("legend load-shapes-legend", true);

      //this._legend.append("h4")
      //  .attr("class", "title")
      //  .text(this.options.legendTitle);

      // expose legend as an object with a root property,
      // for compliance with MultiChartApp
      //this.legend = {root: this._legend};
    },

    resize: function() {
      // TODO
    },

    fetch: function(callback) {
      return this.api.query.responses({
        sort:   this._state.sort,
        count:  this._state.count,
        desc:   this._state.desc,
        filter: this._state.filter
      }, callback);
    },

    setData: function(data) {
      //mda.logger.log("[load response] data:", data);
      var hours = d3.range(1, 25); // 1-24
      this._data = mda.data.table(data.top)
        .map(function(row) {
          row.forecast = hours.map(function(h) {
            var k = "hkw" + h + '_fcst',
                v = row[k];
            delete row[k];
            return v;
          });
          
          row.hours = hours.map(function(h) {
            var k = "hkw" + h + '_obs',
                v = row[k];
            delete row[k];
            return v;
          });
          return row;
        });
      //mda.logger.log("[load response] obs:",this._data);
      //this._categories = data.categories;
      return this;
    },

    render: function() {
      var loadResponse = this.loadResponse,
          root         = this.container,
          obs          = this.getData();

      var responses = root.selectAll(".plot")
        .data(obs);

      var enter = responses.enter().append("div")
        .attr("class", "col-md-4 plot")
        .append("div")
          .attr("class", "shape");

      enter.append("span")
        .attr("class", "rank");

      var meta = enter.append("div")
        .attr("class", "meta");

      var display = enter.append("div")
        .attr("class", "display");

      var timing = meta.append("h5")
        .attr("class", "figure meta");
      timing.append("span")
        .attr("class", "date");
      timing.append("span")
        .attr("class", "hour");
      timing.append("span")
        .attr("class", "cust_count");

      var energy = meta.append("h5")
        .attr("class", "figure energy");
      energy.append("span")
        .attr("class", "percent");
      energy.append("span")
        .attr("class", "divider")
        .text(" / ");
      energy.append("span")
        .attr("class", "total");

      display.append("svg")
        .attr("class", "chart");

      responses.exit().remove();

      responses.select(".class")
        .text(function(d) {
          return d["class"] || "???";
        });

      responses.select(".rank")
        .text(function(d, i) {
          return i + 1;
        });

      var formatCount = d3.format(","),
          formatPercent = (function() {
            var fmt = d3.format(".2r");
            return function(n) {
              return fmt(n).replace(/\.0+$/, "") + "%";
            };
          })(),
          formatPower  = mda.unit.coerce("kW").format,
          formatEnergy = mda.unit.coerce("kWh").format;

      responses.select(".meta .date")
        .text(function(d) {
          return d["date"];
        });

      responses.select(".meta .hour")
        .text(function(d) {
          return ' ' + d["hour"] + ':00';
        });
      responses.select(".meta .cust_count")
        .text(function(d) {
          return ' (' + d["user_count"] + ')';
        });
      responses.select(".energy .total")
        .text(function(d) {
          return formatPower(d["savings"]*1000);
        });
      responses.select(".energy .percent")
        .text(function(d) {
          //return formatPercent(d["pct_kwh"] || 0);
          return formatPercent(d["pct_savings"]*100 || 0);
        });

      var chart = responses.select("svg.chart");

      this.getTransition(chart)
        .call(loadResponse);

      var slice = chart.selectAll(".slice");
      slice.on("mouseover", function(d, i) {
        slice.classed("over", function(e, j) {
          return j === i;
        });
        chart.select(".axis.x")
          .classed("over", true)
          .selectAll(".tick")
            .classed("over", function(h, j) {
              return h === i;
            });
      });
      slice.on("mouseout", function() {
        slice.classed("over", false);
        chart.select(".axis.x")
          .classed("over", false)
          .selectAll(".tick")
            .classed("over", false);
      });


      this.trigger("render");
    },
  });
  /*
   * We only define the Map chart if Leaflet is loaded (which exports a global
   * "L" namespace).
   */
  if (typeof exports.L === "object") {
    /*
     * The Map chart
     */
    mda.charts.Map = Chart.extend({
      statics: {
        options: {
          width: 500,
          height: 600,
          tooltip: {
            position: "left",
            offset: -6
          },
          map: {
            trackResize: false
          },
          legend: true,
          state: {
            column: null,
            agg:    "mean",
            color:  "GnBu",
            steps:  7,
            rev_color: false
          }
        }
      },

      events: ["hashchange", "change", "loading", "load", "error", "render"],

      nullFill: "#aaa",

      _mapPassthroughMethods: [
        "addLayer",
        "removeLayer",
        "getCenter",
        "getZoom",
        "setZoom",
        "setView"
      ],

      initialize: function() {
        Chart.prototype.initialize.apply(this, arguments);

        this.root.classed("map", true);

        var that = this;

        var mapRoot = mda.dom.coerceSelection(this.options.mapRoot || this.root.append("div"))
          .node();

        // Map charts have a "map" property that is an L.Map instance
        this.map = L.map(mapRoot, this.options.map)
          // Note: The lat, lon and zoom level should be configured my mda.config.latlon and mda.config.zoom
          // If they aren't this setView will fail.
          //alert('latlon: ' + mda.config.latlon + ', zoom: ' + mda.config.zoom)
          // example values for CA
          //.setView([37.5, -119.3], 6)
          .setView(mda.config.latlon, mda.config.zoom)
          .addLayer(L.tileLayer("http://{s}.tile.stamen.com/toner-lite/{z}/{x}/{y}.png", {
            attribution: [
              'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>.',
              'Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://creativecommons.org/licenses/by-sa/3.0">CC BY SA</a>.'
            ].join("<br>"),
            maxZoom: 20
          }))
          .on("mousedown", function() {
            that.tooltip.hide();
            that._mousedown = true;
            var win = d3.select(window)
              .on("mouseup.map", function() {
                that._mousedown = false;
                win.on("mouseup.map", null);
                win = null;
              });
          })
          .on("zoomstart", function() {
            that.tooltip.hide();
          })
          .on("hashchange", function(e) {
            that.trigger("hashchange", e);
          });

        // move the attribution to the lower left corner
        this.map.attributionControl.setPosition("bottomleft");

        this.tooltip = new mda.ui.Tooltip(this.options.tooltip)
          .attachTo(this.root.node());

        // and a geoJson (L.GeoJSON) instance
        this.geoJson = L.geoJson(null, {
            style: this.getDefaultStyle.bind(this),
            onEachFeature: function(feature, layer) {
              layer.on({
                mouseover: that.highlightFeature.bind(that),
                mouseout: that.resetHighlight.bind(that),
                click: that.zoomToFeature.bind(that)
              });
            }
          })
          .addTo(this.map);

        // initialize the _values array (for building color scales)
        this._values = [0];

        /*
        this.info = new mda.charts.Map.InfoControl({
          position: "topright",
          model: this.model
        })
        .addTo(this.map);
        */

        if (this.options.legend) {
          var legend = this.root.append("div");
          this.legend = new mda.charts.Legend(legend, this.options.legend);
        }

        this.zctaToZip = {};
        this.featuresByZcta = {};
        this.featuresByZip = {};
        this.features = [];

        // expose addLayer() interface via L.map
        this._mapPassthroughMethods.forEach(function(method) {
          if (!that.map[method]) {
            return mda.logger.warn("invalid passthrough method:", method);
          }
          that[method] = that.map[method].bind(that.map);
        });

        // this.resize();
      },

      resize: function() {
        var width = this.map.getContainer().offsetWidth,
            aspect = this.options.width / this.options.height,
            height = Math.ceil(width / aspect);
        d3.select(this.map.getContainer())
          .style("width", width + "px")
          .style("height", height + "px");
        this.map.invalidateSize(false);
      },

      getDefaultStyle: function(feature) {
        return {
          fillColor: this.nullFill,
          fillOpacity: .7,
          weight: .5,
          color: "#999",
          opacity: 1
        };
      },

      getStyle: function(feature) {
        var value = feature.properties.data
              ? feature.properties.data[this._state.column]
              : null,
            defined = !isNaN(value) && value !== null,
            color = defined ? this.colorScale(value) : this.nullFill;
        // if (defined) console.log(value, "->", color);
        return {
          fillColor: color,
          fillOpacity: .9
        };
      },

      setFeatures: function(collection) {
        if ( Object.keys(this.zctaToZip).length != 0) {
          console.info('why here')
          var features = this.features = collection.features;

          var zctaToZip = this.zctaToZip,
              featuresByZcta = this.featuresByZcta = {},
              featuresByZip = this.featuresByZip = {};

          features.forEach(function (feature) {
            var zcta = feature.properties.ZCTA,
                zip = zctaToZip[zcta];
            featuresByZcta[zcta] = feature;
            if (zip) {
              featuresByZip[zip] = feature;
            }
          })
          this.geoJson.addData(collection);
          return this;
        }
        else {
          alert('trying to get zcta data');
          setTimeout(this.setFeatures, 250, collection);
        }
      },

      setZctaLookup: function(lookup) {
        this.zctaToZip = lookup;
        return this;
      },

      loadFeatures: function(url, callback) {
        return d3.json(url, function(error, collection) {
          if (error) return callback && callback(error);
          this.setFeatures(collection);
          this.update();
          if (callback) callback(null, collection);
        }.bind(this));
      },

      loadZctaLookup: function(url, callback) {
        return d3.json(url, function(error, lookup) {
          if (error) return callback && callback(error);
          this.zctaToZip = lookup;
          this.update();
          if (callback) callback(null, lookup);
        }.bind(this));
      },

      setData: function(data) {
        var rows = mda.data.table(data, "zip5");
        this._data = rows;
        this._dataByZip = mda.data.group(rows, "zip5", true);
        return this;
      },

      fetch: function(callback) {
        return this.api.query({
          columns: [this._state.column],
          agg: "zip5|" + this._state.agg,
          filter: this._state.filter
        }, callback);
      },

      render: function() {
        var rows = [],
            allRows = this.getData();
        for (var zip in this.featuresByZip) {
          var feature = this.featuresByZip[zip],
              data = this._dataByZip[zip];
          feature.properties.data = data;
          if (data) rows.push(data);
        }

        var key = this._state.column,
            column = this.model.getColumn(key),
            getValue = function(d) {
              return d[key];
            };

        if (rows.length < allRows.length) {
          mda.logger.warn("failed to match", allRows.length - rows.length, "zip codes:");
          var superset = Object.keys(this._dataByZip),
              missing = Object.keys(this._dataByZip)
                .filter(function(zip) {
                  return !this[zip];
                }, this.featuresByZip);
          /*
          console.table(missing.sort(d3.ascending).map(function(zip) {
            return {zip: zip, data: this[zip][key]};
          }, this._dataByZip));
          */
        }

        switch (this._state.scale) {
          // absolute (using the column min and max)
          case "abs":
            this._values = [
              column.min,
              column.mean,
              column.max
            ];
            break;

          // relative to all data (even non-matching zip codes)
          case "rel-data":
            this._values = this.getData().map(getValue);
            break;

          case "rel":
          default:
            this._values = rows.map(getValue);
            break;
        }

        // console.log("extent:", d3.extent(this._values));

        this.updateColors();
        this.updateFeatures();

        this.trigger("render");
      },

      updateColors: function() {
        var color = this._state.color,
            steps = +this._state.steps,
            column = this.model.getColumn(this._state.column);
        switch (column.type) {
          case "category":
            color = "Set3";
            steps = 12;
            break;
        }
        this.colorScheme = mda.color.scheme(color, steps, 
                              {reverse: this._state.rev_color});
        console.log(this.colorScheme)
        this.colorScale = this.colorScheme.getScale(this._values);
        this.updateLegend();
        return this;
      },

      updateLegend: function() {
        if (!this.legend) return;
        var column = this.model.column(this._state.column);
        this.legend.update({
          column: column,
          scheme: this.colorScheme,
          values: this._values,
          steps: this._state.steps,
          agg: this._state.agg,
          rev_color: this._state.rev_color
        });
        return this;
      },

      updateFeatures: function() {
        this.geoJson.setStyle(this.getStyle.bind(this));
      },

      update: function(callback) {
        var keys = Object.keys(this._diff || {});
        if (this._updated && keys.length === 1) {
          switch (keys[0]) {
            case "color":
            case "steps":
              // console.info("colors changed");
              this.updateColors();
              this.updateFeatures();
              if (callback) callback(null);
              return this;

            case "scale":
              // console.info("scale changed");
              this.render();
              if (callback) callback(null);
              return this;
          }
        }
        // console.info("anything else changed");
        return Chart.prototype.update.call(this, callback);
      },

      getState: function() {
        var state = Chart.prototype.getState.call(this),
            zoom = this.map.getZoom(),
            center = this.map.getCenter();
        return state;
        /*
        return mda.util.extend(state, {
          z: zoom,
          x: center.lng,
          y: center.lat
        });
        */
      },

      highlightFeature: function(e) {
        if (this._mousedown) return;

        var feature = e.target.feature,
            centroid = d3.geo.centroid(feature).reverse(),
            point = this.map.latLngToContainerPoint(centroid);

        // keep the point in bounds
        point.x = Math.max(0, Math.min(point.x, this.options.width));
        point.y = Math.max(0, Math.min(point.y, this.options.height));

        var column = this.model.column(this._state.column),
            title = feature.properties.ZCTA, // FIXME
            valueText = this.getValueText(feature, column);

        // console.log("tooltip @", centroid, point);
        this.tooltip
          .moveTo(point.x, point.y)
          .setContent([
            '<span>', title, '</span>: ',
            '<b>', valueText, '</b> ',
            '<span class="color"></span>'
          ].join(""), true)
          .show();

        this.tooltip.content.select(".color")
          .classed("empty", !feature.properties.data)
          .style("background", feature.properties.data
            ? this.getStyle(feature).fillColor
            : null);

        // this.info.update(title, valueText);
      },

      resetHighlight: function(e) {
        this.tooltip.hide();
        // this.info.reset();
      },

      zoomToFeature: function(e) {
        this.map.fitBounds(e.target.getBounds());
      },

      getValueText: function(feature, column) {
        var floatFormat = d3.format(".1f"),
            intFormat   = d3.format(","),
            format = function(n) {
              return n > 100 ? intFormat(~~n) : floatFormat(n);
            };

        var name = column.label || column.name,
            units = column.units;
        return feature.properties.data
          ? [format(feature.properties.data[column.name]), units].join(" ")
          : "(no value)";
      }

    });

    mda.charts.Map.LegendControl = L.Control.extend({
      onAdd: function(map) {
        var div = this._div = document.createElement("div"),
            content = d3.select(div)
              .attr("class", "custom-control legend");
        this._legend = new mda.charts.Legend(content);
        return div;
      },
      update: function(state) {
        this._legend.update(state);
        return this;
      }
    });

    /*
    mda.charts.Map.InfoControl = L.Control.extend({
      onAdd: function() {
        var div = this._div = document.createElement("div"),
            content = d3.select(div)
              .attr("class", "custom-control info")
              .datum({text: "Zip Code"});
        content.append("h4")
          .attr("class", "title")
          .text(function(d) { return d.text; });
        content.append("p")
          .datum({text: "Select a region"})
          .text(function(d) { return d.text; });
        return div;
      },

      update: function(title, text) {
        var content = d3.select(this._div)
          .classed("has-zip", !!title);
        if (!title) {
          content.selectAll(".title, p")
            .text(function(d) { return d.text; });
          return this;
        }
        content.select(".title").text(title);
        content.select("p").text(text);
        return this;
      },

      reset: function() {
        return this.update(null);
      }
    });
    */

  }


  mda.charts.SortedValues = Chart.extend({
    statics: {
      options: {
        width: 600,
        height: 550,
        padding: [20, 15, 50, 80],
        tooltip: {
          position: "top"
        },
        state: {
          bins: 50,
          y: "kw_mean",
          rev: false,
          filter: null
        }
      }
    },

    initialize : function(root,options) {
      Chart.prototype.initialize.apply(this, arguments); // super class init
      // d3 selection that is the SVG element to be rendered is this.chart
      // coerceSelection allows you to either provide a pointer to the chart node or render off the root
      // os the default is to append to the root
      this.chart = mda.dom.coerceSelection(this.options.chart || this.root.append("svg"))
        .classed("sorted-values", true)       // adds sorted-values to the class list of the target div
        .call(this.setupChart.bind(this));    // returns a new function that sets the "this" in the functipon to the chart
                                              // does the same as same as this.setupChart(this.chart)
      this.tooltip = new mda.ui.Tooltip(this.options.tooltip);
    },

    resize: function() {
      this.resizeSVG(this.chart, this.root.property("offsetWidth"));
    },

    fetch: function(callback) {    // fetch is call automatically after chart.update gets called
      return this.api.query({
        columns: [this._state.y],
        sampling: {
          type: "bin",
          count: this._state.bins
        },
        filter: this._state.filter
      }, callback);
    },

    setData: function(data) {
      this._data = mda.data.table(data); // returns an array of objects (maps) with the col names as keys
      cum = 0;
      this._data.forEach(function(d, i) {
        d.cumCountMin = cum;
        cum = cum + d.count;
        d.cumCountMax = cum;
      });
      return this;
    },

    setupChart: function(chart) {
      // XXX Firefox needs this background rect to calculate the correct
      // bounding rect
      chart.append("rect")
        .attr("fill", "transparent")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("pointer-events", "none");
    },

    update: function(callback) {
      var keys = Object.keys(this._diff || {});
      if (keys.length === 1 && keys[0] === "rev") {
        this.render();
        if (callback) callback(null);
        return this;
      } else {
        return Chart.prototype.update.call(this, callback);
      }
    },

    render: function() {
      var data       = this.getData();  // keys: count, index, min, max, cumCountMin, cumCountMax
      var totalCount = data[data.length-1].cumCountMax    // count of the total number of values
      var column     = this.model.column(this._state.y);  // get the column metadata object
      var yFormat    = column.format || d3.format(".2f");

      var width      = this.options.width;
      var height     = this.options.height;

      var padding = this.options.padding;
      var top     = padding[0];
      var right   = width  - padding[1];
      var bottom  = height - padding[2];
      var left    = padding[3];

      this.chart.attr("width",  width);    // chart is the svg element
      this.chart.attr("height", height);

      // create/update the x&y-axis svg group elements
      var ya = this.chart.select("g.axis.y");
      if (ya.empty()) {
        ya = this.chart.append("g")
          .attr("class", "axis y");
      }
      var xa = this.chart.select("g.axis.x");
      if (xa.empty()) {
        xa = this.chart.append("g")
          .attr("class", "axis x");
      }

      // console.log(data);
      var bins = this.chart
        .selectAll("g.bin")   // css selector for the svg elements (d3 makes placeholders if necessary)
        .data(data);          // <g class="bin">

      var chartNode = this.chart.node();

      /*
      var xscale = d3.scale.ordinal()
        .domain(d3.range(0,data.length))  // integers
        .rangeBands(this._state.rev
          ? [right, left]
          : [left, right]);        // output max/min
                                   // bins are ordinal */
      /**/

      var reverse = this._state.rev;

      var xscale = d3.scale.linear()
        .domain([0,1])
        .range(reverse
          ? [right, left]
          : [left, right]);    /**/

      var yscale = d3.scale.linear()
        .domain([data[0].min,data[data.length-1].max])  // input min/max
        .range([bottom, top]);                          // output min/max

      // console.log(yscale.domain());
      // console.log(xscale.domain());
      // console.log([top,right,bottom,left,width,height]);

      var yaxis = mda.render.axis()  // function that renders the axis in svg elements
        .scale(yscale)
        .orient("left")
        .innerTickSize(-(right - left))
        .tickPadding(8)
        .tickFormat(column.format || String)
        .margin(this.options.padding[3] - 15)
        .label(column.axisLabel);

     var xaxis = mda.render.axis()  // function that renders the axis in svg elements
        .scale(xscale)
        .orient("bottom")
        //.innerTickSize(-(bottom - top))
        .tickPadding(8)
        .tickFormat(String)
        .label("percentile")
        .tickFormat( function(d) { // format the numbers as percentages
                return Math.floor(d * 100) + '%';
              } )
        .ticks(10); // ticks in deciles

      var enter = bins.enter() // enter is the selection of all the new elements created for this call
        .append("g")
        .attr("class","bin"); // assign bin class

      // create a rect node under each g element: <rect>
      enter.append("rect")
        .attr("class", "range")
        .call(updateRangeBars);

      // create a line in the middle of min & max
      enter.append("line")
        .attr("class", "midline")
        .call(updateMidLines);

      enter.append("rect")         // add transparent rects to recieve mouse events - this is a Firefox fix
        .attr("class", "hover")
        .attr("fill", "transparent")
        .call(updateHoverBars);

      bins.exit().remove();  // drop all the invalid dom elements after update

      // update bound data
      bins.selectAll("*")
        .each(function() {
          this.__data__ = this.parentNode.__data__;
        });

      var tooltip = this.tooltip
        .attachTo(chartNode.parentNode)
        .setContent([
          // '<var>y</var> = <b data-key="count">count</b><br>',
          '<b data-key="min">min</b> &#8804; <var>',
          "x",
          '</var> ',
          '&#8804; <b data-key="max">max</b>'
        ].join(""), true)
      bins.on("mousemove", function(d, i) {
        this.classList.add("hilite");

        // get the bounding box of the range rectangle
        // in the form: {x, y, width, height}
        var rect = this.querySelector("rect.range"),
            bbox = rect.getBBox();

        var mouse = d3.mouse(chartNode),
            p1 = chartNode.createSVGPoint();
        // if you want bbbox alignment, try e.g.:
        // p1.x = bbox.x + bbox.width / 2;
        // p1.y = bbox.y + bbox.height;
        // (and remember to set options.tooltip to "bottom")
        p1.x = mouse[0];
        p1.y = mouse[1];
        var mat = chartNode.getCTM(),
            p2 = mat ? p1.matrixTransform(mat) : p1;
        tooltip
          .updateContent({
            min: yFormat(d.min),
            max: yFormat(d.max)
          })
          .moveTo(p2.x, p2.y, chartNode)
          .show();
      })
      .on("mouseout", function() {
        this.classList.remove("hilite");
        tooltip.hide();
      });

      var transition = this.getTransition(this.chart);

      transition.select("g.axis.y") // render the axis in the right svg group
        .attr("transform", "translate(" + [left,0] + ")" )
        .call(yaxis)
      transition.select("g.axis.x") // render the axis in the right svg group
        .attr("transform", "translate(" + [0,height-padding[2]] + ")" )
        .call(xaxis)
        //.call(setAxisLabel, d3.functor('percentile'))

      /*bins = transition.selectAll("g.bin")
        .attr("transform", function(d, i) {
          var x = xscale(i);
          return "translate(" + [x, 0] + ")";
        });*/

      bins = this.getTransition(bins);

      bins.select("rect.hover")
        .call(updateHoverBars);

      bins.select("rect.range")
        .call(updateRangeBars);

      bins.selectAll("line.midline")
        .call(updateMidLines);

      this.trigger("render");

      function barX(d) {
        return reverse
          ? xscale(d.cumCountMax/totalCount)
          : xscale(d.cumCountMin/totalCount);
      }

      function barWidth(d) {
        return Math.abs(xscale(d.count/totalCount) - xscale(0));
      }

      function updateHoverBars(selection) {
        selection
          .attr("x", barX)
          .attr("y", top)
          .attr("width", barWidth)
          .attr("height", bottom - top);
      }

      function updateRangeBars(selection) {
        selection
          .attr( "x",  barX)
          .attr( "y", function(d) {
            var y0 = yscale(d.min),
                y1 = yscale(d.max);
            d.y = Math.min(y0, y1);
            d.height = Math.max(y0, y1) - d.y;
            return d.y;
          })
          .attr("width", barWidth)
          //.attr( "width", xscale.rangeBand )
          .attr("height", function(d, i) {
            return d.height;
          });
      }

      function updateMidLines(selection) {
        selection
          .attr("transform", function(d, i) {
            return "translate(" + [xscale(d.cumCountMin/totalCount), d.y + d.height / 2] + ")";
          })
          .attr("x2", function(d,i) { return xscale(d.count/totalCount)-xscale(0) } );
      }
    }
  });

  mda.charts.TabularValues = Chart.extend({
    statics: {
      options: {
        width: 600,
        //height: 550,
        padding: [20, 15, 50, 80],
        tooltip: {
          position: "top"
        },
        state: {
          nrows: 50,
          y: "kw_mean",
          asc: false,
          filter: null
        }
      }
    },

    initialize : function(root,options) {
      this._columns = [];
      Chart.prototype.initialize.apply(this, arguments); // super class init
      // d3 selection that is the table tag element to be rendered is this.chart
      // coerceSelection allows you to either provide a pointer to the chart node or render off the root
      // os the default is to append to the root
      this.linkDiv = this.root.append("div").attr('class','dl_link');
      this.chart = mda.dom.coerceSelection(this.options.chart || this.root.append("table"))
        .classed("tabular-values", true)      // adds tabular-values to the class list of the target div
        .call(this.setupChart.bind(this));    // returns a new function that sets the "this" in the functipon to the chart
                                              // does the same as same as this.setupChart(this.chart)
    },

    resize: function() {
      var outerWidth = this.root.property("offsetWidth");
      if (outerWidth > 0) {
        var aspect = this.options.width / this.options.height;
        this.chart.attr("width", outerWidth);
      } else {
        this.chart.attr("width", this.options.width);
      }
    },

    downloadUri: function() {
      return this.api.queryUri({
        columns: ["id","zip5",this._state.y],
        //sampling: {
        //  type: "head",
        //  count: this._state.nrows
        //},
        asc:  (  this._state.asc) ? this._state.y : null,
        desc: (! this._state.asc) ? this._state.y : null,
        fmt:  'csv',
        filter: this._state.filter
      });
    },

    fetch: function(callback) {    // fetch is call automatically after chart.update gets called
      return this.api.query({
        columns: ["id","zip5",this._state.y],
        sampling: {
          type: "head",
          count: this._state.nrows
        },
        asc:  (  this._state.asc) ? this._state.y : null,
        desc: (! this._state.asc) ? this._state.y : null,
        filter: this._state.filter
      }, callback);
    },

    getColumns: function() {
      return this._columns;
    },

    setData: function(data) {
      this._data = mda.data.table(data); // returns an array of objects (maps) with the col names as keys
      this._columns = [];
      for(var k in this._data[0]) this._columns.push(k);
      //console.log(this._data);
      //console.log(this._columns);
      return this;
    },

    setupChart: function(chart) { // no sizing rect for tables
    },

    update: function(callback) {
      var keys = Object.keys(this._diff || {});
      if (keys.length === 1 && keys[0] === "rev") {
        this.render();
        if (callback) callback(null);
        return this;
      } else {
        return Chart.prototype.update.call(this, callback);
      }
    },

    render: function() {
      var data       = this.getData();
      var columns    = this.getColumns();
      var idIdx      = columns.indexOf("id");
      var rowCount   = data.length;

      //var totalCount = data[data.length-1].cumCountMax    // count of the total number of values
      //var column     = this.model.column(this._state.y);  // get the column metadata object
      //var yFormat    = column.format || d3.format(".2f");

      var width      = this.options.width;
      var height     = this.options.height;

      var padding = this.options.padding;
      var top     = padding[0];
      var right   = width  - padding[1];
      var bottom  = height - padding[2];
      var left    = padding[3];
      
      this.linkDiv.selectAll("a").remove();
      var dlLink = this.linkDiv.append('a')
        .attr('href','/'+this.downloadUri())
        .text('Download CSV');
      
      
      this.chart.attr("width",  width);    // chart is the div element ?
      //this.chart.attr("height", height);

      var table = this.chart
            .attr("style", "margin-left: 10px");
      table.selectAll("thead").remove();  // clear the table to start over.
      table.selectAll("tbody").remove();

      var thead = table.append("thead"),
          tbody = table.append("tbody");
      
      // create the header row
      var headers = thead.append("tr")
        .selectAll("th")
        .data(columns)
        .enter()
        .append("th")
            .attr("class","tabular-head")
            .text(function(column) { return column; });

      // create a table row for each row of data
      var rows = tbody
        .selectAll("tr")   // css selector for the svg elements (d3 makes placeholders if necessary)
        .data(data); 
      
      var enter = rows.enter() // enter is the selection of all the new elements created for this call
        .append("tr")
        .attr("class", function(d,i) { return (i % 2 == 1) ? "even" : "odd" }); // row numbers are 0 based

      var cells = rows.selectAll("td")
        .data(function(row) {
            return columns.map(function(column) {
                return {column: column, value: row[column]};
            });
        })

      cells.enter()
        .append("td")
        .html(function(d,i) { 
          return ( idIdx == i ) ? "<a href='/summary/" + d.value + "' target='customer'>" +d.value+ "</a>" : d.value; 
        });

      this.trigger("render");

    }
  });


})(this);  // this is the window object here. We are passing the window into a function that gets called right away
           // so we can export our own stuff
