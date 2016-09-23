(function(exports) {
  var mda = exports.mda;

  mda.require("ui", "model", "color", "charts", "filter", "storage");

  if (typeof hashable === "undefined") {
    throw new Error("Missing hashable (load: js/vendor/hashable.js)");
  }

  mda.util.monkeyPatchHashable(hashable);

  mda.app = {};

  /*
   * The MultiChartApp is the class that ties together Chart instances, a
   * FilterList and hashable.hash() into a cohesive application with its own
   * state.
   */
  mda.app.MultiChartApp = mda.Class({
    statics: {
      defaults: {
        charts: [],
        state: null,
        filters: null,
        hashFormat: "{source}/{chart}?",
        // selector for the data source input
        dataSourceInput: null,
        // selector for the chart types list (<ul> or <ol>)
        chartTypes: null,
        // selector for the chart div container
        chartRoots: null,
        // logger
        logger: null
      }
    },

    initialize: function(root, options) {
      // alternate form: initialize(options)
      if (arguments.length === 1) {
        options = root;
        root = "body";
      }

      var that = this;
      this.root = mda.dom.coerceSelection(root)
        .classed("chart-app", true);

      this.options = mda.util.extend({}, mda.app.MultiChartApp.defaults, options);

      // set up logging functions with d3.rebind()
      var logger = this.options.logger || new mda.Logger(mda.Logger.LOG, "[app]");
      d3.rebind(this, logger, "debug", "log", "info", "warn", "error");
      this.logger = logger;

      this._charts = this.options.charts || [];
      // this.log("charts:", this._charts);
      this._chartsById = mda.data.group(this._charts, "id", true);
      this._state = {};
      this._sources = [];

      this.api = (this.options.api || mda.api())
        .logger(this.logger);

      this.model = new mda.model.Model({api: this.api});

      this.buildCharts();

      if (this.options.filters) {

        this.filters = new mda.filter.FilterList(this.options.filters, {
          api: this.api,
          model: this.model
        });

        if (this.options.filterStore) {
          this.filterStore = this.options.filterStore
            .restore()
            .on("select", this._onFilterSelect.bind(this), "MultiChartApp#_onFilterSelect")
            .on("save", function onFilterStoreSave(filter) {
              that.log("saved filter:", filter);
            });
        }
      }

      this.hash = hashable.hash()
        .format(this.options.hashFormat)
        .save(function(uri) {
          // that.log("hash.save(", uri, ")");
          location.replace("#" + uri);
        });

      /*
      // these snippets are useful for debugging where the hash update and
      // write calls originate.
      var _update = this.hash.update;
      this.hash.update = function(d) {
        this.warn("hash.update(", d, ")");
        console.trace();
        return _update(d);
      }.bind(this);

      var _write = this.hash.write;
      this.hash.write = function() {
        this.warn("hash.write(", this._state, ")");
        console.trace();
        return _write();
      }.bind(this);
      */

      this.sourceSelect = mda.ui.select()
        .value(function(d) { return d.name; })
        .label(function(d) { return d.label + " (" + d.name + ")"; });

      this.dataSourceInput = this.root
        .select(this.options.dataSourceInput);

      this.selectedChart = null;
    },

    /**
     * debug the current app state by logging it to the console
     * (or using a custom logger, which should have a console-like API)
     */
    debugState: function(logger) {
      if (!logger) logger = mda.logger;
      logger.debug("[app] app state:", this._state);
      logger.debug("[app] model.dataSource:", this.model.getDataSource());
      logger.debug("[app] hash data:", this.hash.data());
      if (this.selectedChart) {
        logger.debug("[app] chart state:", this.selectedChart.instance.getState());
        if (this.selectedChart.form) {
          logger.debug("[app] chart form state:", this.selectedChart.form.getState());
        }
      }
      if (this.filters) {
        logger.debug("[app] filters:", this.filters.getFilter());
      }
    },

    buildCharts: function() {
      this.chartTypes = this.root
        .select(this.options.chartTypes)
          .selectAll("li")
            .data(this._charts)
            .enter()
            .append("li");

      var that = this;
      this.chartTypes.append("a")
        .text(function(d) {
          return d.name;
        })
        .on("mouseover", function(d) {
          var state = mda.util.extend({}, that._state, {
            chart: d.id
          });
          this.href = that.hash.url(state);
        });

      this.chartRoots = this.root
        .select(this.options.chartRoots)
          .selectAll(".tab-pane")
            .data(this._charts)
            .enter()
            .append("div")
              .attr("class", "tab-pane")
              .attr("id", function(d) {
                return d.id;
              });
    },

    start: function() {
      this.hash.enable();

      this._updated = false;
      this.api.get("query/sources", function(error, sources) {
        if (error) {
          return that.error("unable to load data sources and/or column info:", error);
        }

        this.updateDataSources(sources);

        var sourceNames = this._sources.map(function(d) { return d.name; }),
            chartIds = this._charts.map(function(d) { return d.id; }),
            hashEvent;

        this.hash
          .default(this.options.state || {
            source: this._sources[0].name,
            chart: this._charts[0].id
          })
          .change(function(e) {
            hashEvent = e;
          })
          .check();

        var state = this._state = hashEvent.data || hash.default();
        mda.logger.warn("initial source:", state.source);
        mda.logger.warn("initial chart:", state.chart);

        this.dataSourceInput.call(this.sourceSelect.set, state.source);
        this.updateSources();

        this.model.setDataSource(state.source, function(error) {
          if (error) {
            return this.error("Unable to set data source:", error);
          }
          this.hash.change(this.onHashChange.bind(this));
          this.selectChart(state.chart);
          this.updateColumnSelectors();
          this.startListening();
        }.bind(this));
      }.bind(this));
      return this;
    },

    startListening: function() {
      // mda.logger.info("start listening!");

      // listen for model changes
      // XXX this needs to be namespaced so as not to clobber
      // other listeners
      this.model.on("change.app",
        this.onModelChange.bind(this), "MultiChartApp#onModelChange");

      if (this.filters) {
        var state = this._state;
        // this.info("applying initial filter:", state.filter);
        // apply filters the first time
        if (state.filter) {
          var filters;
          if (state.adv) {
            this.filters.showAdvancedInput(state.filter);
          } else {
            try {
              filters = mda.api.query.parseFilter(state.filter);
            } catch (err) {
              this.filters.showAdvancedInput(state.filter);
              state.adv = true;
            }
          }

          if (filters) {
            this.filters.setFilters(filters);
          }
          this.rememberCurrentFilter(filters || state.filter);
        } else if (state.adv) {
          this.filters.showAdvancedInput();
        }

        if (this.filterStore) {
          this.filterStore.updateOptionsWithModel(this.model);
        }

        // XXX only listen for change events *after*
        // setting the initial filter state!
        var debounceChange = mda.util.debounce(this.onFilterChange.bind(this), 500);
        this.filters
          .on("change.app", debounceChange, "MultiChartApp#onFilterChange")
          .on("advanced", this.onFilterAdvanced.bind(this), "MultiChartApp#onFilterAdvanced");
          // .on("clear", this.onFilterChange.bind(this));
      }
    },

    onModelChange: function() {
      this.warn("model change");

      // XXX always reset the filters
      this.filters.clear();
      if (this.selectedChart) {
        this.selectedChart.instance.setState({filter: null});
      }

      this.updateColumnSelectors();
      if (this.filterStore) {
        this.filterStore.updateOptionsWithModel(this.model);
      }
    },

    updateDataSources: function(sources) {
      var state = this._state,
          that = this;

      var list = this._sources = d3.entries(sources)
        .map(function(d) {
          return {
            name: d.key,
            label: d.value.label
          };
        });

      var input = this.dataSourceInput
        .datum(list)
        .call(this.sourceSelect)
        .on("change", function() {
          that.filters.clear();
          that.hash.update({filter: null}).write();
          that.setDataSource(this.value, true);
        });
    },

    getDataSource: function() {
      return this._state.source;
    },

    setDataSource: function(source, updateHash, callback) {
      var done = callback || mda.noop;
      if (this.selectedChart && this.selectedChart.sources) {
        if (this.selectedChart.sources.indexOf(source) === -1) {
          alert("Sorry, this chart is not available for this data source.");
          input.call(this.sourceSelect.set, state.source);
          return done(true), false;
        }
      }

      this._state.source = source;
      this.updateSources();

      var chart = this.selectedChart;
      this.model.setDataSource(source, function(error) {
        if (error) return done(error);

        // that.log("done updating column info");
        if (this.filterStore) {
          this.filterStore.updateOptionsWithModel(this.model);
        }
        if (!chart) {
          return done(null, true);
        }
        this.update(function firstChartUpdate(error) {
          if (error) {
            this.error("chart update error:", error.statusText);
            var defaults = this.getChartDefaults(chart);
            this.log("reverting to defaults:", defaults);
            var that = this;
            this.mergeState(defaults, function secondChartUpdate(error) {
              // this should never happen!
              if (error) {
                that.error("Unable to revert to defaults! (this should never happen)");
                return that.setState(defaults, done);
              } else {
                done(null, true);
              }
            });
            this.hash.data(this._state).write();
          } else {
            this.log("chart updated successfully");
          }
          done(null, true);
        }.bind(this));
      }.bind(this));

      this.dataSourceInput
        .call(this.sourceSelect.set, source);

      // this.info("clearing filters");
      // this.filters.clear();

      if (updateHash) {
        // this.log("setDataSource(", source, ")");
        this.hash.update({
          source: source,
          filter: null
        }).write();
      }
      return this;
    },

    selectChart: function(id) {
      var chart = this._chartsById[id],
          model = this.model,
          hash = this.hash,
          that = this;
      if (!chart) {
        throw new Error("no such chart: " + id);
      }

      // clean up after the old selected chart...
      var selected = this.selectedChart;
      if (selected) {
        // always unset the keys of the chart's custom fields
        if (selected.fields) {
          this.unsetState(selected.fields.map(function(d) { return d.name; }));
        }
        // then call chart.teardown() if it exists
        if (selected.teardown) {
          selected.teardown(this);
        }
      }

      this.selectedChart = chart;

      var active = function(c) {
        return c === chart;
      };
      this.chartTypes.classed("active", active);
      this.chartRoots.classed("active", active);

      // if the chart is already initialized...
      if (chart.instance) {

        this.warn("we should update the chart here; app._state = ", this._state);

        // explicitly copy the filter and source state attributes to the chart
        chart.instance
          .setState({
            filter: this._state.filter,
            source: this._state.source
          });

        // update column listings according to the model
        this.updateColumnSelectors();

      } else {

        var row = this.root.select("#" + chart.id)
              .append("div")
                .attr("class", "row"),
            left = row.append("div")
              .attr("class", "col-md-12"),
            cols = 12;

        var root = left.append("div"),
            defaults = this.getChartDefaults(chart);
        chart.root = root;
        chart.instance = chart.create(root, {
          api: this.api,
          model: this.model,
          state: mda.util.extend(defaults, this._state)
        });

        if (chart.fields && !chart.form) {

          cols = 8;
          left.attr("class", "col-md-" + cols);

          var right = row.append("div")
            .attr("class", "col-md-" + (12 - cols));

          var legend = chart.instance.getLegendRoot();
          if (legend) {
            chart.instance.addLegendHooks();
            if (!chart.formBeforeLegend) {
              right.node().appendChild(legend.node());
            }
          }

          var form = right.append("div");
          chart.fields.forEach(function(field) {
            if (field.type === "select" && field.columns === true) {
              field.select = model.getColumnSelect();
            }
          });

          if (legend && chart.formBeforeLegend) {
            right.node().appendChild(legend.node());
          }

          chart.form = new mda.ui.Form(form, {
            fields: chart.fields,
            values: mda.util.extend({}, defaults, this._state)
          })
          .on("change", function onFormChange(state, key, val) {
            // that.log("form change:", key, val);
            if (typeof chart.validateFormState === "function") {
              var valid = chart.validateFormState(state, that.model);
              if (valid === false) {
                mda.logger.log("invalidated form state:", state);
                chart.form.set(state);
              }
            }
            hash.update(state).write();
            chart.instance.setState(state)
              .update()
              .trigger("change");
          });

          chart.form.root.selectAll("select")
            .classed("column", function(d) {
              return d.columns;
            });
        }
      }

      // update the chart's state with the current state
      // (reading anything in the hash query string, for instance)
      this.log("setting chart state:", this._state);
      chart.instance
        .setState(this._state)
        .update();
      // then update the has with the chart's state keys
      // (saving the ones unique to this chart)
      // this.log("reading chart state:", chart.instance.getState());
      this.hash.update(chart.instance.getState()).write();

      return chart;
    },

    getChartDefaults: function(chart) {
      return (typeof chart.defaults === "function")
        ? chart.defaults(this.model)
        : mda.util.extend({}, chart.defaults);
    },

    updateChartDefaults: function(chart) {
      var defaults = this.getChartDefaults(chart);
      chart.instance.setState(defaults);
      return defaults;
    },

    onHashChange: function(e, force) {
      // this.log("hash change:", e, this);
      if (!e.data) {
        return this.error("bad URL:", e.url);
      }

      var state = e.data;

      this.info("setting state:", state);
      this._state = mda.util.extend({}, state);
      //console.log(e.diff);
      if (e.diff) {
        var updatedFilter = false;
        if (e.diff.source) {
          updatedFilter = true;
          // mda.logger.log("e.diff.source", state.source);
          this.setDataSource(state.source, false, function() {
            this.updateFilter();
          }.bind(this));
        }
        if (e.diff.chart) {
          // mda.logger.log("e.diff.chart", state.chart);
          this.selectChart(state.chart);
        }
        if (e.diff.filter && !updatedFilter) {
          this.updateFilter();
        }
      }
    },

    _onFilterSelect: function(filter, name) {
      // mda.logger.warn("_onFilterSelect(", filter, ")");
      this._setFilterData(filter);
    },

    _setFilterData: function(filter) {
      var expr = filter.expr,
          source = filter.source,
          wasAdvanced = this.filters.advanced(),
          advanced = !!filter.advanced,
          filters = this.filters;
      // mda.logger.warn("advanced state:", wasAdvanced, "->", advanced, filter);

      function updateFilter() {
        if (advanced && !wasAdvanced) {
          filters.showAdvancedInput(expr);
        } else if (!advanced && wasAdvanced) {
          filters.showListInput();
        }
        filters.setFilters(expr);
      }

      if (source && source != this.getDataSource()) {
        this.setDataSource(source, false, function() {
          // this.log("select filter (post-source):", expr, "->", filters);
          updateFilter();
        }.bind(this));
      } else {
        // this.log("select filter:", filter, "->", expr);
        updateFilter();
      }
    },

    updateFilter: function() {
      // mda.logger.log("updateFilter(", this._state, ")");
      this._setFilterData({
        expr:     this._state.filter,
        source:   this._state.source,
        advanced: this._state.adv
      });
    },

    getState: function() {
      return mda.util.extend({}, this._state);
    },

    setState: function(state, callback) {
      this._state = state;
      return this.update(callback);
    },

    mergeState: function(state, callback) {
      mda.util.extend(this._state, state);
      return this.update(callback);
    },

    update: function(callback) {
      var state = this._state,
          selected = this.selectedChart;
      if (selected) {
        selected.instance
          .setState(state)
          .update(callback);
        if (selected.form) {
          // this.log("setting form state:", state);
          selected.form.setState(state);
        }
      } else {
        callback && callback(null, state);
      }
      if (this.filters) {
        // TODO update filters?
      }
      return this;
    },

    rememberCurrentFilter: function(filter) {
      if (!this.filterStore) return false;
      // mda.logger.log("remembering:", filter);
      this.filterStore.setCurrent({
        expr: filter,
        advanced: this.filters.advanced(),
        source: this.getDataSource()
      });
      return true;
    },

    onFilterChange: function(info) {
      var f = this.filters.getFilter(),
          old = this.__previousFilter,
          str = mda.api.query.formatFilter(f),
          update = {filter: str};

      if (info && info.temporary) {
        // this is a temporary filter change
      } else {

        this.rememberCurrentFilter(f);
        this.updateFilterStoreOptions(f);

        // mda.logger.log("filter change:", f, str);
        if (old === str || (!old && !str)) {
           this.warn("no filter change:", old);
           return false;
        }
        // this.info("filter change from", this._state.filter, "to:", str);
        this._state.filter = str;
        this.__previousFilter = str;

        this.log("filter change:", old, "->", str);
        this.hash
          .update(update)
          .write();
      }

      if (this.selectedChart) {
        this.selectedChart.instance
          .setState(update)
          .update();
      }
    },

    updateFilterStoreOptions: function(expr) {
      if (!this.filterStore) return false;
      var source = this.model.getDataSource();
      this.filterStore.updateSelectedOption(function(d) {
        // mda.logger.log("option:", d.expr, "===", expr, "?");
        return d.source === source
            && mda.util.deepEqual(expr, d.expr);
      });
      return true;
    },

    onFilterAdvanced: function(advanced) {
      // mda.logger.log("onFilterAdvanced(", advanced, ")");
      this._state.adv = advanced;
      this.hash.update({adv: advanced}).write();
      var filter = this.filters.getFilter();
      this.rememberCurrentFilter(filter);
      this.updateFilterStoreOptions(filter);
    },

    updateSources: function() {
      var source = this.getDataSource();
      this.chartTypes
        .style("display", function(d) {
          d.disabled = (d.sources && d.sources.indexOf(source) === -1);
          return d.disabled ? "none" : null;
        });
    },

    updateColumnSelectors: function() {
      var selected = this.selectedChart;
      if (!selected || !selected.form) return;

      var select = this.model.columnSelect(),
          columns = this.model.columns()
            .map(function(d) { return d.name; }),
          updates = {},
          that = this;

      selected.form.root.selectAll("select")
        .filter(function(d) { return d.columns; })
        .each(function(d) {
          // mda.logger.debug("updating column selector:", this, d);
          var node = d3.select(this)
            .call(d.select = select);
          if (typeof d.enabled === "function") {
            node.selectAll("option")
              .attr("disabled", function(column) {
                return (d.enabled(column) === false)
                  ? "disabled"
                  : null;
              });
          }

          var value = this.value,
              index = columns.indexOf(value);
          if (index === -1) {
            that.error("bad column value:", value, index, "in", columns);
          }
        });
    },

    unsetState: function(keys) {
      var state = this._state;
      keys.forEach(function(k) {
        delete state[k];
      });
      this.hash.set(state).write();
    }

  });


  /*
   * The chart types are objects that define chart constructors (usually by
   * just calling the relevant mda.charts.* constructor, with or
   * without overriding default options) and a couple of other aspects:
   *
   * id: a unique String of the chart in an App's list
   *
   * name: the chart's name, as displayed in its navigation tab or link
   *
   * create: the creation function, which receives a root element and options
   *  as its arguments (just like the mda.charts.Chart constructors)
   *
   * fields: an Array of form field objects for configuring its control form
   *
   * form: if provided, an mda.ui.Form instance with fields already configured
   *   (instead of using the fields)
   *
   * defaults: an object (or function that returns an object) listing the
   *   default state for this chart. It gets the model as its only argument so
   *   that we can query the model for columns (e.g. model.getColumnsByType())
   *   for certain fields.
   */
  mda.app.MultiChartApp.types = {

    // Cumulative Sum chart type
    CUMULATIVE_SUM: {
      id: "cumsum",
      name: "Cumulative Sum",
      fields: [
        {title: "Y axis", name: "y", type: "select", columns: true},
        {title: "Show as percentage", name: "pct", type: "checkbox"},
      ],
      create: function(root, options) {
        return new mda.charts.CumSum(root, options);
      },
      defaults: function(model) {
        return {
          y: model.getColumnsByType("float")[0].name
        };
      },
      teardown: function(app) {
        // because samples isn't in the defaults{}
        app.unsetState(["samples"]);
      }
    },

    // Histogram chart type
    HISTOGRAM: {
      id: "histogram",
      name: "Histogram",
      fields: [
        {title: "X axis", name: "x", type: "select", columns: true},
        {title: "Bins", name: "bins", type: "text", placeholder: "10-1000"},
        {title: "Cumulative", name: "cum", type: "checkbox"},
        {title: "Show area", name: "area", type: "checkbox"},
        {
          title: "Interpolate",
          name: "interp",
          type: "select",
          select: mda.ui.select()
            .options(["none", "monotone", "basis", "cardinal"])
            .value(mda.identity)
            .label(mda.identity),
          visible: function(state) { return state.area; }
        }
      ],
      create: function(root, options) {
        return new mda.charts.Histogram(root, options);
      },
      defaults: function(model) {
        return {
          x: model.getColumnsByType("float")[0].name,
          bins: 100
        };
      },
      teardown: function(app) {
        app.unsetState(["bins"]);
      }
    },

    // Sorted Values chart type
    SORTED_VALUES: {
      id: "sorted-values",
      name: "Sorted Values",
      fields: [
        {title: "Y axis", name: "y", type: "select", columns: true,
          enabled: function(column) {
            return column.type === "int" || column.type === "float";
          }},
        {title: "Bins", name: "bins", type: "text", placeholder: "10-1000"},
        {title: "Reverse", name: "rev", type: "checkbox"}
      ],
      create: function(root, options) {
        return new mda.charts.SortedValues(root, options);
      },
      defaults: function(model) {
        return {
          y: model.getColumnsByType("float")[0].name,
          bins: 200,
          rev: false
        };
      },
      teardown: function(app) {
        //app.unsetState(["bins"]);
      }
    },
    // Tabular Values chart type
    TABULAR_VALUES: {
      id: "tabular-values",
      name: "Customer List",
      fields: [
        {title: "Display Column", name: "y", type: "select", columns: true
        //  enabled: function(column) {
        //    return column.type === "int" || column.type === "float";}
        },
        {title: "first n rows", name: "nrows", type: "text", placeholder: "10-1000"},
        {title: "Ascending?", name: "asc", type: "checkbox"}
      ],
      create: function(root, options) {
        return new mda.charts.TabularValues(root, options);
      },
      defaults: function(model) {
        return {
          y:     model.getColumnsByType("float")[0].name,
          nrows: 100,
          asc:   false
        };
      },
      teardown: function(app) {
        //app.unsetState(["bins"]);
      }
    },
    // Scatter Plot chart type
    SCATTER_PLOT: {
      id: "scatter",
      name: "Scatter Plot",
      fields: [
        {title: "X axis", name: "x", type: "select", columns: true},
        {title: "Y axis", name: "y", type: "select", columns: true},
        {title: "Color by", name: "color", type: "select", columns: true},
        {
          title: "Color scheme",
          name: "scheme",
          type: "select"
        },
        {title: "Samples", name: "samples", type: "text", placeholder: "100-2000"},
        {title: "log x?",  name: "logx",    type: "checkbox"},
        {title: "log y?",  name: "logy",    type: "checkbox"}
      ],
      validateFormState: function(state, model) {
        var column = model.column(state.color);
        if (column.type === "category" && state.scheme !== "category") {
          mda.logger.debug("scatter form validation:", column.type, "=== 'category'; setting scheme = 'category'");
          state.scheme = "category";
          return false;
        } else if (column.type !== "category" && state.scheme === "category") {
          mda.logger.debug("scatter form validation:", column.type, "!== 'category'; setting scheme = 'divergent'");
          state.scheme = "divergent";
          return false;
        }
        return true;
      },
      create: function(root, options) {
        var scatter = new mda.charts.ScatterPlot(root, options);
        this.fields
          .filter(function(d) {
            return d.name === "scheme";
          })
          .forEach(function(d) {
            var schemes = d3.entries(scatter.colorSchemes)
              .map(function(d) {
                var scheme = d.value;
                return {
                  value: d.key,
                  scheme: scheme,
                  label: scheme.options.label || d.key
                };
              });
            d.select = mda.ui.select()
              .options(schemes)
              .value(function(d) { return d.value; })
              .label(function(d) { return d.label; });
          });
        return scatter;
      },
      defaults: function(model) {
        var cols = model.getColumnsByType("float");
        return {
          x:       cols[0].name,
          y:       cols[1].name,
          color:   cols[2].name,
          samples: 1000,
          logx:    false,
          logy:    false
        };
      },
      teardown: function(app) {
        // because samples isn't in the defaults{}
        app.unsetState(["samples"]);
      }
    },

    // Map chart type
    MAP: {
      id: "map",
      name: "Map",
      fields: [
        {title: "Color by", name: "column", type: "select", columns: true,
          enabled: function(column) {
            return column.type !== "category";
          }},
        {title: "Aggregate function", name: "agg", type: "select",
          select: mda.ui.select()
            .options(["mean", "count", "sum"])
            .value(mda.identity)
            .label(mda.identity)},
        {title: "Color scheme", name: "color", type: "select",
          select: mda.ui.select()
            .options(Object.keys(mda.color.brewer)
              .filter(mda.cmp.notIn([
                "Accent", "Dark2",
                "Pastel1", "Pastel2",
                "Set1", "Set2", "Set3",
              ])))
            .value(mda.identity)
            .label(mda.identity)},
        {title: "Color steps", name: "steps", type: "select",
          select: mda.ui.select()
            .options([3, 4, 5, 6, 7, 8, 9])
            .value(mda.identity)
            .label(mda.identity)},
        {title: "Reverse color scale", name: "rev_color", type: "checkbox"}
        /* ,
        {title: "Scale colors", name: "scale", type: "select",
          select: mda.ui.select()
            .options([
              {value: "rel",      label: "Relative (to zips on the map)"},
              // {value: "rel-data", label: "Relative (to all matching data)"},
              {value: "abs",      label: "Absolute (to feature min/max)"}
            ])}
        */
      ],
      create: function(root, options) {
        return new mda.charts.Map(root, options);
      },
      defaults: function(model) {
        return {
          column: model.getColumnsByType("float")[0].name,
          color: "YlGnBu",
          agg: "mean",
          rev_color: false
        };
      },
      teardown: function(app) {
        // always unset the map x, y and z
        app.unsetState(["x", "y", "z"]);
      }
    },

    LOAD_SHAPES: {
      id: "load-shapes",
      name: "Load Shapes ",
      sources: ["basics160k","SmartAC","PGEres","ohm"],
      // put the form before the legend
      formBeforeLegend: true,
      fields: [
        {title: "Sort by", name: "sort", type: "select",
          select: mda.ui.select()
            .options(["kwh", "members"])
            .label(mda.identity)
            .value(mda.identity)},
        {title: "Shape count", name: "count", type: "text",
          help: "The number of shapes to show"}
        //{title: "Highlight peak period", name: "peak", type: "checkbox"}

      ],
      create: function(root, options) {
        return new mda.charts.LoadShapes(root, options);
      },
      defaults: function(model) {
        return {
          sort: "kwh",
          count: 9
          //peak: false
        };
      },
      teardown: function(app) {
        // nothing to unset here?
      }
    },

    RESPONSE: {
      id: "load-responses",
      name: "Ohm Responses",
      sources: ["ohm"],
      // put the form before the legend
      formBeforeLegend: true,
      fields: [
        {title: "Sort by", name: "sort", type: "select",
          select: mda.ui.select()
            .options(["savings", "pct_savings", "hour", "date", "user_count"])
            .label(mda.identity)
            .value(mda.identity)},
        {title: "Descending", name: "desc", type: "checkbox"},
        {title: "Event count", name: "count", type: "text",
          help: "The number of events to show"}

      ],
      create: function(root, options) {
        return new mda.charts.LoadResponse(root, options);
      },
      defaults: function(model) {
        return {
          sort: "savings",
          desc: true,
          count: 30
        };
      },
      teardown: function(app) {
        // nothing to unset here?
      }
    },

  };

})(this);
