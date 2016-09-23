(function(exports) {
  var mda = exports.mda;

  mda.require("model");

  if (typeof queue === "undefined") {
    throw new Error("Missing queue (load: js/vendor/queue.v1.min.js)");
  }

  mda.filter = {};

  /*
   * The FilterList is the visual interface for managing a list of filters
   * or an "advanced" text input.
   */
  mda.filter.FilterList = mda.Class({
    mixins: [
      mda.EventDispatch,
    ],

    events: ["change", "stage", "clear", "update", "advanced"],
    eventLabel: "FilterList",

    statics: {
      defaults: {
        histogramBins: 100,
        rangeSize: [250, 75],
        dataSource: "basics",
        columnSelectorLabel: "select a feature:",
        addFilterLabel: "+ filter",
        advanced: true,
        advancedHelpText: "Enter a filter expression here and click &ldquo;Submit&rdquo;."
      }
    },

    initialize: function(root, options) {
      this.root = mda.dom.coerceSelection(root);
      this.options = mda.util.extend({}, mda.filter.FilterList.defaults, options);

      this.model = this.options.model || new mda.model.Model();
      this.api = this.model.api;

      // update the histograms (debounced) after every 'change' or 'stage'
      var debounceUpdate = mda.util.debounce(function() {
        this.updateHistograms();
      }.bind(this), 200);
      this.on("change.histo", debounceUpdate, "FilterList#updateHistograms");
      this.on("stage.histo",  debounceUpdate, "FilterList#updateHistograms");

      this.model
        .on("change.invalidate", this.onModelInvalidate.bind(this), "FilterList#onModelInvalidate")
        .on("change.filter", this.onModelChange.bind(this), "FilterList#onModelChange");

      this._filters = [];

      var root = this.root;
      if (this.options.advanced) {
        this.nav = this.root.append("ul")
          .attr("class", "nav nav-tabs")
          .attr("role", "tablist");

        this.nav.append("li")
          .attr("class", "list active")
          .append("a")
            .attr("href", "#list")
            .text("List")
            .on("click", function() {
              d3.event.preventDefault();
              this.showListInput();
            }.bind(this));

        this.nav.append("li")
          .attr("class", "advanced")
          .append("a")
            .attr("href", "#advanced")
            .text("Advanced")
            .on("click", function() {
              d3.event.preventDefault();
              this.showAdvancedInput();
            }.bind(this));

        var tabs = this.root.append("div")
          .attr("class", "tab-content panel");

        root = tabs.append("div")
          .attr("class", "tab-list tab-pane active");

        var form = tabs.append("form")
          .attr("class", "tab-advanced tab-pane")
          .on("submit", function() {
            mda.logger.warn("[filters] submit advanced");
            d3.event.preventDefault();
            this._submitAdvancedFilter();
          }.bind(this))
          .on("reset", function() {
            this._resetAdvancedFilter();
            this.trigger("change");
          }.bind(this));

        form.append("p")
          .html(this.options.advancedHelpText);

        this.advancedInput = form.append("textarea")
          .attr("class", "form-control advanced")
          .attr("cols", 8);

        var p = form.append("p");
        p.append("input")
          .attr("type", "submit")
          .attr("class", "btn btn-primary")
          .attr("value", "Submit");
        p.append("input")
          .attr("type", "reset")
          .attr("class", "btn btn-default")
          .attr("value", "Reset");
      }

      this.stage = root.append("form")
        .attr("class", "stage")
        .call(this.setupStage.bind(this));

      this.list = root.append("ol")
        .attr("class", "filters list-unstyled");

      this.sentence = mda.dom.coerceSelection(this.options.sentence || root.append("div"))
        .attr("class", "lead sentence");

      this.loaded = this.loading = false;
    },

    advanced: function() {
      return !!this._advanced;
    },

    showListInput: function() {
      // console.warn("FilterList#showListInput()");
      // console.trace();
      if (!this._advanced) return this;

      this._advanced = false;
      this._updateTabs();

      // XXX compare filter before triggering change?
      this.trigger("change");
      this.trigger("advanced", false);
      return this;
    },

    showAdvancedInput: function(expr) {
      if (this._advanced) return this;

      this._advanced = true;
      this._updateTabs();
      if (expr) {
        // mda.logger.debug("setting advanced filter:", expr);
        this.advancedInput
          .text(expr)
          .property("value", expr);
        // this.trigger("change");
      } else {
        this._resetAdvancedFilter();
      }
      this.trigger("advanced", true);
      return this;
    },

    _submitAdvancedFilter: function() {
      this.trigger("change");
    },

    _resetAdvancedFilter: function() {
      var list = this.getFilterList(),
          text = mda.api.query.formatFilter(list);
      // mda.logger.debug("[filters] reset advanced:", list, "->", text);
      // XXX sometimes we have to do both of these things...
      this.advancedInput
        .text(text)
        .property("value", text);
      return this;
    },

    _updateTabs: function() {
      this.root.selectAll(".nav-tabs .list, .tab-list")
        .classed("active", !this._advanced);
      this.root.selectAll(".nav-tabs .advanced, .tab-advanced")
        .classed("active", this._advanced);
    },

    onModelInvalidate: function() {
      this.clear();
    },

    onModelChange: function() {
      this.updateModel();
    },

    clear: function() {
      if (this.advancedInput) {
        this.advancedInput
          .text("")
          .property("value", "");
      }

      if (this._filters.length === 0) return false;

      this._filters = [];
      this.stage.selectAll("select.column optgroup")
        .remove();
      this._clearStage();
      this.list.selectAll(".filter")
        .remove();
      this.sentence.html("");
      this.trigger("clear");
      return true;
    },

    updateModel: function() {
      this.stage.call(this.updateStage.bind(this));
      // finally apply filters from options
      if (this.options.filters) {
        this.applyFilterValues(this.options.filters);
        this.options.filters = null;
      }
    },

    setupStage: function(stage) {
      // stage.classed("panel panel-default", true);

      var heading = stage.append("div")
        .attr("class", "heading row");

      var body = stage.append("div")
        .attr("class", "body");

      body.append("div")
        .attr("class", "filter");

      var input = heading
        .append("div")
          .attr("class", "col-xs-8")
            .append("select")
              .attr("class", "column form-control");
      input.append("option")
        .attr("class", "none")
        .attr("value", "")
        .text(this.options.columnSelectorLabel);

      heading
        .append("div")
          .attr("class", "col-xs-4")
          .append("input")
            .attr("class", "submit btn btn-primary form-control")
            .attr("type", "submit")
            .attr("value", this.options.addFilterLabel)
            .attr("disabled", "disabled");

      var filter = {};
      stage
        .datum(filter)
        .classed("empty", true)
        .on("submit", this._onStageSubmit.bind(this));
    },

    updateStage: function(stage) {
      var select = this.model.getColumnSelect(),
          that = this;

      stage.select("option.none")
        .text(this.options.columnSelectorLabel);

      stage.select("select.column")
        .on("change", null)
        .call(select)
        .on("change", function() {
          var name = this.value,
              column = that.model.getColumn(name);
          that._onColumnSelect(column);
        });
    },

    applyFilterValues: function(filters, done) {
      var len = 0;
      this.list.selectAll(".filter").each(function(f, i) {
        var e = filters[i];
        if (e != f) {
          // mda.logger.log("applying filter criteria:", e.value, "to:", f);
          f.render.expression(e.value);
          f.value = f.render.value();
          // mda.logger.log("new value:", f.value);
          d3.select(this)
            .select("form")
              .call(f.render);
        }
        len++;
      });

      var q = queue()
        .awaitAll(function(error) {
          if (error) {
            return mda.logger.error("[filters] filter apply error:", error);
          }
          // mda.logger.log("[filters] all filters applied!");
          done && done(error);
        });

      while (len < filters.length) {
        // XXX we do this in a closure so that our col and filter
        // variables aren't overwritten on every iteration
        q.defer(function(callback) {

          var f = filters[len++];

          var col = this.model.getColumn(f.column),
              filter = {
                column: col
              };

          var div = this.list.append("li")
            .attr("class", "filter")
            .datum(filter)
            .classed("loading", true);

          this.loadColumnMeta(col, function loaded(error) {
            div.classed("loading", false);

            if (error) {
              callback(error);
              return mda.logger.warn("[filters] error with column meta:", error);
            }

            filter.render = this.getColumnRenderer(col);
            if (!filter.render) {
              mda.logger.error("[filters] no renderer for:", col);
              return;
            }
            filter.render.expression(f.value);
            filter.value = filter.render.value();

            this._addScaleListener(filter, div);

            if (col.superset) {
              filter.render.superset(col.superset);
            }

            // mda.logger.log("[filters] created filter:", filter);
            div.call(this.setupFilter.bind(this));
            // FIXME for some reason we have to call this again...
            div.select("form")
              .call(filter.render);

            this.updateFilters();

            callback(null);

          }.bind(this));

          // keep the right context!
        }.bind(this));
      }

      return this;
    },

    updateFilters: function() {
      this._filters = this.list.selectAll(".filter").data();
      return this;
    },

    updateSentence: function() {
      var clauses = this._filters.filter(function(f) {
        return !f.disabled && f.render.value();
      }).map(function(f) {
        var col = f.column,
            val = f.render.value(),
            fmt = f.render.format ? f.render.format() : mda.identity;
        // mda.logger.log("[filters] column:", col, val);
        if (col.numeric) {
          var bits = [col.label, "is"];
          if (val[0] > col.domain[0]) {
            if (val[1] < col.domain[1]) {
              bits.push("between", val.map(col.format).join(" and "));
            } else {
              bits.push("greater than", col.format(val[0]));
            }
          } else if (val[1] < col.domain[1]) {
            bits.push("less than", col.format(val[1]));
          }
          return bits.join(" ");
        } else if (col.type === "date") {
          var bits = [col.label, "is"];
          if (val[0] > col.domain[0]) {
            if (val[1] < col.domain[1]) {
              bits.push("between", val.map(col.format).join(" and "));
            } else {
              bits.push("after", col.format(val[0]));
            }
          } else if (val[1] < col.domain[1]) {
            bits.push("before", col.format(val[1]));
          }
          return bits.join(" ");
        } else if (col.type === "category") {
          var bits = [col.label, "is"];
          bits.push(Array.isArray(val) ? val.join(" or ") : val);
          return bits.join(" ");
        } else {
          return [col.label, "is", val].join(" ");
        }
      });

      // mda.logger.log("[filters] filter clauses:", clauses);

      var clause = this.sentence.selectAll(".clause")
        .data(clauses);
      clause.exit().remove();
      clause.enter().append("div")
        .attr("class", "clause");
      clause.html(function(d) { return d; });
      return this;
    },

    _onStageSubmit: function(filter) {
      d3.event.preventDefault();
      if (!filter.column) return;
      // mda.logger.log("[filters] submit filter:", filter);

      this._filters.push(filter);
      var div = this.list.append("li")
        .attr("class", "filter")
        .datum(filter)
        .call(this.setupFilter.bind(this));

      this.trigger("change", filter);
      this._clearStage();
    },

    _clearStage: function() {
      var filter = {}; // "null" filter
      this.stage.datum(filter)
        .classed("empty", true)
        .select("input.submit")
          .attr("disabled", "disabled");
      this.stage.select(".filter")
        .datum(filter);
      this.stage.select("select.column")
        .property("selectedIndex", 0);
      this._onColumnSelect(filter);
    },

    setupFilter: function(item) {
      // item.classed("filter panel panel-default", true);

      var that = this,
          filter = item.datum(),
          title = item.append("h4")
            .attr("class", "title"),
          label = title.append("label");

      label.append("input")
        .attr("class", "toggle")
        .attr("type", "checkbox")
        .attr("checked", "checked")
        .attr("title", "uncheck to disable this filter")
        .on("change", function() {
          item.classed("disabled", filter.disabled = !this.checked);
          that.trigger("change", {temporary: true});
        });

      label.append("span")
        .text(" " + filter.column.label);

      title.append("button")
        .attr("class", "btn close")
        .html("&times;")
        .on("click", function() {
          d3.event.preventDefault();
          item.remove();
          that._removeFilter(filter);
        });

      filter.render.on("change", function(v) {
        // mda.logger.log("[filters] change:", v);
        filter.disabled = false;
        item.select("input.toggle").property("checked", true);
        filter.value = filter.render.value();
        that.trigger("change", filter);
      });

      this._addScaleListener(filter, item);

      var form = item.append("form")
        .classed("body", true)
        .call(filter.render);
    },

    _addScaleListener: function(filter, div) {
      if (!filter.render || !filter.render.on) return false;

      filter.render.on("scale", function() {
        // mda.logger.log("scale change:", filter.column.name);
        this.renderFilter(div, filter);
      }.bind(this));
    },

    _onColumnSelect: function(column) {
      // mda.logger.debug("[filters] select column:", column);

      var filter = this.stage.datum(),
          container = this.stage.select(".filter");
      filter.column = column;

      if (filter.render && typeof filter.render.remove === "function") {
        filter.render.on("change", null);
        container.call(filter.render.remove);
        this.stage
          .classed("empty", true)
          .select("input.submit")
            .attr("disabled", "disabled");
      }
      container.html("");

      if (!column.name) return;

      this.stage
        .classed("empty", false)
        .select("input.submit")
          .attr("disabled", null);
      container.classed("loading", true);

      this.loadColumnMeta(column, function loaded(error) {
        container.classed("loading", false);
        if (error) return mda.logger.warn("[filters] error with column meta:", error);

        var render = filter.render = this.getColumnRenderer(column)
          .on("change", function() {
            // mda.logger.log("[filters] stage change:", filter);
            filter.value = render.value();
          });

        this._addScaleListener(filter, container);

        container.call(filter.render);
        this.trigger("stage", filter);
      }.bind(this));
    },

    loadColumnMeta: function(col, callback) {
      if (col._loaded) return callback(null, col);

      var name = col.name;
      function loaded() {
        col._loaded = true;
        return callback(null, col);
      }

      var request;
      switch (col.type) {
        case "category":
          request = this.api.query({
            columns: name,
            agg: name + "|count"
          }, function(error, res) {
            col.values = res.index.map(function(d, i) {
              return {value: d, count: res.data[i][0]};
            });
            loaded();
          });
          break;

        case "int":
        case "float":
        case "date":
          request = this.api.query({
            columns: name,
            sampling: {
              type: "hist",
              count: col.bins || this.options.histogramBins,
              domain: [col.min, col.max]
            }
          }, function(error, res) {

            var hist = mda.data.table(res);
            col.superset = hist.map(function(d) {
              return {
                x: d.bin_min,
                y: d.counts
              };
            });

            if (col.type === "date") {
              col.superset.forEach(function(d) {
                d.x = col.convert(d.x);
              });
            }

            loaded();
          });
          break;
      }

      if (!request) return loaded();

      if (col._meta) {
        col._meta.abort();
        col._meta = null;
      }
      return col._meta = request;
    },

    updateHistograms: function(done) {
      if (this._advanced) {
        done && done(null, []);
        return this;
      }

      var filters = this._getFilters(),
          that = this;

      var q = queue()
        .awaitAll(function(error, updated) {
          if (error) {
            done && done(error);
            return mda.logger.warn("[filters] error updating histogram(s):", error);
          }
          // mda.logger.log("[filters] updated", updated.length, "histogram(s)");
          that.trigger("update", updated);
          done && done(null, updated);
        });

      function updateFilter(filter, callback) {
        if (filter._subset) {
          filter._subset.abort();
          filter._subset = null;
        }

        var col = filter.column,
            node = d3.select(this)
              .classed("loading", true),
            _filter = that.getFilterList(filters.filter(function(f) {
              return f !== filter;
            }));

        // mda.logger.log("filter:", filter, _filter);

        // don't hit the API if there's no filter to apply
        if (!_filter || !Object.keys(_filter).length) {
          node.classed("loading", false);
          filter.subset = filter.column.superset;
          filter.render.subset(filter.subset);
          that.renderFilter(node, filter);
          return callback(null, filter);
        }

        filter._subset = that.api.query({
          columns: col.name,
          filter: _filter,
          sampling: {
            type: "hist",
            count: col.bins || that.options.histogramBins,
            domain: [col.min, col.max]
          }
        }, function(error, res) {
          node.classed("loading", false);
          if (error) {
            callback(error);
            return mda.logger.error("[filters] histogram load error:", error);
          }

          var hist = mda.data.table(res);
          filter.subset = hist.map(function(d) {
            return {x: d.bin_min, y: d.counts};
          });

          if (filter.column.type === "date") {
            filter.subset.forEach(function(d) {
              d.x = filter.column.convert(d.x);
            });
          }

          if (filter.render) {
            filter.render.subset(filter.subset);
          }

          that.renderFilter(node, filter);
          filter._subset = null;

          callback(null, filter);
        });
      }

      this.root.selectAll(".stage, .filter")
        .filter(function hasSubset(f) {
          return f && f.column && (f.column.numeric || f.column.type === "date");
        })
        .each(function(filter) {
          q.defer(updateFilter.bind(this), filter);
        });
    },

    renderFilter: function(item, filter) {
      mda.transition(item, filter._rendered ? 250 : 0)
        .call(filter.render.areas);
      filter._rendered = true;
    },

    getColumnRenderer: function(column, value) {
      switch (column.type) {
        case "int":
        case "float":
          var domain = column.domain.slice();
          // XXX to make histograms work right
          // (see mda.model#initColumn() for the inverse)
          if (column.type === "int") domain[1] -= 1;
          return mda.filter.range()
            .size(this.options.rangeSize)
            .domain(domain)
            .superset(column.superset)
            // .round(column.type === "int")
            .format(column.type === "int"
              ? function(n) { return String(~~n); } // ~~ double bitwise NOT is the same as Math.floor
              : ".2f") // XXX how about ".3r"?
            .range(value || domain);

        case "date":
          var domain = column.domain;
          return mda.filter.date()
            .size(this.options.rangeSize)
            .superset(column.superset)
            .domain(domain)
            .range(value || domain);

        case "category":
          var filter = mda.filter.category()
            .multiple(true)
            .options(column.values || [])
            .selected(value || []);

          if (column.values && typeof column.values[0] === "object") {
            var fmt = d3.format(",");
            filter
              .value(function(d) { return d.value; })
              .label(function(d) { return d.value + " \t(" + fmt(d.count) + ")"; })
          }
          return filter;
      }
    },

    getFilter: function() {
      if (this._advanced) {
        return this.advancedInput.property("value")
          .replace(/[\n\r]/g, "");
      }
      return this.getFilterList();
    },

    getFilterList: function(filters) {
      var filter = [];
      if (!filters) filters = this._filters || [];
      filters.forEach(function(f) {
        if (f.disabled || f.removed) return;
        var col = (typeof f.column === "string")
              ? f.column
              : f.column.name,
            val = f.render
              ? f.render.expression()
              : f.value;
        // mda.logger.log(f.column, "=", val);
        if (!val) {
          mda.logger.warn("no value for filter:", f);
          return;
        }
        filter.push({column: col, value: val});
      });
      return filter.length ? filter : null;
    },

    _removeFilter: function(filter) {
      filter.removed = true;
      var i = this._filters.indexOf(filter);
      if (i === -1) {
        mda.logger.warn("attempted to remove filter not in list!", filter);
      } else {
        this._filters.splice(i, 1);
      }
      this.trigger("change", filter);
    },

    _getFilters: function() {
      return this._filters.slice();
    },

    setFilters: function(filters) {
      if (this._advanced) {
        var expr = mda.api.query.formatFilter(filters);
        if (this._filterExpr === expr) {
          mda.logger.info("no filter expression change:", this._filters);
          return this;
        }

        this._filterExpr = expr;
        this._filters = [];
        this.advancedInput
          .text(expr)
          .property("value", expr);
        this.trigger("change");
        return this;
      }

      if (typeof filters === "string") {
        try {
          var str = filters;
          filters = mda.api.query.parseFilter(str);
        } catch (error) {
          mda.logger.error("[filters] unable to parse expression:", str, error);
          return this;
        }
      }

      if (!filters && (!this._filters || !this._filters.length)) {
        mda.logger.info("no filter change from:", this._filters, "to", filters);
        return this;
      } else if (filters && this._filters && mda.util.deepEqual(filters, this._filters)) {
        mda.logger.info("no filter change from:", this._filters, "to", filters);
        return this;
      }

      this._filterExpr = null;
      this._filters = filters ? filters.slice() : [];

      this.list.selectAll(".filter").remove();
      this.applyFilterValues(this._filters, function() {
        this.updateHistograms();
        this.trigger("change");
      }.bind(this));
      return this;
    }
  });

  mda.filter.range = function() {
    var dispatch = d3.dispatch("change", "scale"),
        width = 250,
        height = 50,
        domain = [0, 100],
        domainY = [0, 100],
        range = [0, 1],
        padding = [0, 0, 0, 0],
        brush = d3.svg.brush(),
        superset = [{x: 0, y: 0}, {x: 1, y: 1}],
        subset = [{x: 0, y: 0}, {x: 1, y: 1}],
        scaleFactory = d3.scale.linear,
        parse = function(str) { return +str; },
        format = d3.format(".2f"),
        round = Number,
        inclusive = false,
        scaleBySubset = false,
        invalid = isNaN;

    function filter(selection) {
      var top = padding[0],
          right = width - padding[1],
          bottom = height - padding[2],
          left = padding[3],
          scale = scaleFactory()
            .domain(domain)
            .range([left, right])
            .clamp(true),
          _range = range.length
            ? range.slice()
            : domain.slice();

      selection.each(function() {
        d3.select(this).classed("range", true);
      });

      var p = selection.select("p.inputs");
      if (p.empty()) {
        p = selection.append("p")
          .attr("class", "inputs row");
      }

      p.each(function() {
        var parent = d3.select(this),
            label = parent
              .selectAll("span.input")
              .data([
                {name: "min", link: "&#x21E4;", value: _range[0]},
                {name: "max", link: "&#x21E5;", value: _range[1]}
              ]);

        label.exit().remove();

        var enter = label.enter().append("span")
          .attr("class", "input col-xs-4");
        enter.append("a")
          .attr("class", "snap btn btn-success btn-xs")
          .html(function(d) { return d.link; });
        enter.append("input")
          .attr("class", "text form-control input-sm")
          .attr("type", "text")
          .attr("name", function(d) { return d.name; })
          .attr("size", 6);

        var scaleSpan = parent.select("span.scale");
        if (scaleSpan.empty()) {
          scaleSpan = parent
            .insert("span", "span.input:last-child")
              .attr("class", "scale col-xs-4");
          var scaleLabel = scaleSpan.append("label");
          scaleLabel.append("input")
            .attr("type", "checkbox")
            .attr("name", "scale")
            .on("change", function() {
              scaleBySubset = this.checked;
              dispatch.scale(scaleBySubset);
            });
          scaleLabel.append("span")
            .text(" zoom");
        }

        label
          .classed("max", function(d) { return d.name === "max"; })
          .filter(".max")
            .select("a.snap")
              .each(function() {
                this.parentNode.appendChild(this);
              });
        label.select("a.snap")
          .on("click", function(d, i) {
            _range[i] = domain[i];
            update();
          });
        label.select("input")
          .on("change", null)
          .attr("value", function(d) { return format(d.value); })
          .on("keydown", function(d, i) {
            if (d3.event.keyCode === 13) {
              d3.event.preventDefault();
              var val = parse(this.value);
              if (val === null || invalid(val)) {
                mda.logger.warn("invalid value:", this.value);
                return;
              }
              _range[i] = val;
              update();
            }
          })
          .on("change", function(d, i) {
            var val = parse(this.value);
            if (val === null || invalid(val)) {
              mda.logger.warn("invalid value:", this.value);
              return;
            }
            _range[i] = val;
            update();
          });
      });

      var svg = selection.select("svg.range");
      if (svg.empty()) {
        svg = selection.append("svg")
          .attr("class", "range");
        svg.append("g")
          .attr("class", "data");
        svg.append("g")
          .attr("class", "brush");
      }
      svg.attr("viewBox", [0, 0, width, height].join(" "));

      selection.call(filter.areas);

      if (range.length) {
        brush.extent(range);
      } else {
        brush.clear();
      }
      brush
        .x(scale)
        .on("brush", function() {
          var r = brush.empty()
            ? domain.slice()
            : brush.extent();
          if (r[0] != _range[0] || r[1] != _range[1]) {
            _range = r;
            update();
          }
        });

      svg.select("g.brush")
        .call(brush)
        .selectAll("rect")
          .attr("y", 0)
          .attr("height", height);

      function update() {
        // mda.logger.log("update:", _range);
        if (invalid(_range[0]) || invalid(_range[1])) {
          mda.logger.warn("range isNaN:", range.join(","));
          return;
        }
        if (_range[0] != range[0] || _range[1] != range[1]) {
          // mda.logger.log("change:", _range);
          range[0] = round ? round(_range[0]) : _range[0];
          range[1] = round ? round(_range[1]) : _range[1];

          selection.select("input[name=min]")
            .property("value", format(range[0]));
          selection.select("input[name=max]")
            .property("value", format(range[1]));

          brush.extent(range);
          selection.select("g.brush")
            .call(brush);

          dispatch.change(range);
        } else {
          // mda.logger.info("no change:", _range, range);
        }
      }
    }

    filter.areas = function(selection) {
      var superDomain = [];
      var subDomain = [];
      var top = padding[0],
          right = width - padding[1],
          bottom = height - padding[2],
          left = padding[3],
          scale = scaleFactory()
            .domain(domain)
            .range([left, right])
            .clamp(true);
      var counts = [];
      selection.select("g.data")
        .each(function() {
          var area = d3.select(this)
            .selectAll("path.area")
            .data([
              {type: "superset", points: superset},
              {type: "subset", points: subset}
            ]);
          area.exit().remove();
          area.enter().append("path");
          area
            .attr("class", function(d) {
              return ["area", d.type].join(" ");
            });
        });
      
      var area = d3.svg.area()
        .interpolate("step-after")
        .x(function(d) { return scale(d.x); })
        .y1(function(d) { return y(d.y); });

      var points = scaleBySubset
            ? subset
            : superset,
          domainY = d3.extent(points, function(d) { return d.y; });
      // console.log("domainY:", domainY);
      // XXX we're not using d3.min() and d3.max() here because the values
      // may be Date objects. We just need a sorted array to know the min and
      // max.
      /*var sorted = counts.slice().sort(d3.ascending),
          min = sorted[0],
          max = sorted.pop();
      if (min > domainY[0]) {
        y.domain([0, min, max]);
        y.range([bottom, bottom - 2, top]);
      } else {
        y.domain([0, max]);
      }*/

      // console.log(domainY);
      var y = d3.scale.linear()
        .domain(domainY)
        .range([bottom, top]);

      area.y0(y(0));

      // mda.logger.log("counts:", counts, counts.map(y));

      selection.selectAll("path.area")
        .attr("d", function(d) {
          return d.points ? area(d.points) : null;
        });
    };

    filter.remove = function(selection) {
      selection.selectAll("input")
        .on("change", null)
        .on("keydown", null);
      selection.selectAll("a.snap")
        .on("click", null);
      brush.on("brush", null);
    };

    filter.scale = function(factory) {
      if (!arguments.length) return scaleFactory;
      scaleFactory = factory;
      return filter;
    };

    filter.round = function(r) {
      if (!arguments.length) return round;
      round = (r === true)
        ? Math.round
        : r;
      return filter;
    };

    filter.invalid = function(fn) {
      if (!arguments.length) return invalid;
      invalid = fn || d3.functor(false);
      return filter;
    };

    filter.size = function(size) {
      if (!arguments.length) return [width, height];
      width = size[0];
      height = size[1];
      return filter;
    };

    filter.width = function(w) {
      if (!arguments.length) return width;
      width = w;
      return filter;
    };

    filter.height = function(w) {
      if (!arguments.length) return height;
      height = w;
      return filter;
    };

    filter.superset = function(d) {
      if (!arguments.length) return superset;
      superset = d;
      return filter;
    };

    filter.subset = function(d) {
      if (!arguments.length) return subset;
      subset = d;
      return filter;
    };

    filter.domain = function(x) {
      if (!arguments.length) return domain.slice();
      domain = x.slice();
      return filter;
    };

    filter.range = function(x) {
      if (!arguments.length) return range.slice();
      range = x.slice();
      return filter;
    };

    filter.value = filter.range;

    filter.parse = function(fn) {
      if (!arguments.length) return parse;
      parse = fn;
      return filter;
    };

    filter.format = function(fmt) {
      if (!arguments.length) return format;
      format = (typeof fmt === "string")
        ? d3.format(fmt)
        : fmt;
      if (typeof format.parse === "function") {
        parse = format.parse;
      }
      return filter;
    };

    filter.inclusive = function(i) {
      if (!arguments.length) return inclusive;
      inclusive = !!i;
      return filter;
    };

    filter.expression = function(expr) {
      if (arguments.length) {
        var parsed = mda.filter.parseRange(expr, domain, Number);
        if (parsed) {
          range = parsed.range;
          inclusive = parsed.inclusive;
        }
        return filter;
      }

      return [
        (inclusive ? ">=" : ">") + format(range[0]),
        (inclusive ? "<=" : "<") + format(range[1])
      ];
    };

    return d3.rebind(filter, dispatch, "on");
  };

  mda.filter.parseRange = function parseRange(expr, domain, parse) {
    if (!expr || !expr.length) return null;

    if (!parse) parse = mda.identity;
    if (!Array.isArray(expr)) expr = [expr];

    var pat = /^([<>]?=?)(.+)$/,
        range = domain ? domain.slice() : [],
        inclusive = false;

    expr.forEach(function(e) {
      var match = e && String(e).match(pat);
      if (!match) {
        mda.logger.warn("mda.filter.parseRange(): unrecognized expression: '%s'", e, pat);
        return;
      }
      var op = match[1],
          val = match[2];
      if (!op) {
        mda.logger.warn("mda.filter.parseRange(): bad expression (no operator):", e);
      }
      switch (op) {
        case "=":
          inclusive = true;
          range[0] = range[1] = parse(val);
          break;
        case ">":
        case ">=":
          if (op === ">=") inclusive = true;
          range[0] = parse(val);
          break;
        case "<":
        case "<=":
          if (op === "<=") inclusive = true;
          range[1] = parse(val);
          break;
      }
    });
    return {
      range: range,
      inclusive: inclusive
    };
  };

  mda.filter.date = function() {
    var dispatch = d3.dispatch("change", "scale"),
        format = d3.time.format("%Y-%m-%d"),
        parse = function(str) {
          try {
            return format.parse(str) || new Date(+str * 1000);
          } catch (err) {
            return null;
          }
        },
        now = new Date(),
        then = d3.time.year.offset(now, -1),
        range = mda.filter.range()
          .scale(d3.time.scale)
          .domain([then, now])
          .range([then, now])
          .round(null)
          .format(format)
          .parse(parse)
          .invalid(function(d) {
            return !(d instanceof Date);
          });

    function filter(selection) {
      selection
        .call(range)
        .each(function() {
          d3.select(this).classed("date", true);
        })
        .selectAll("input.text")
          .attr("size", 11);
    }

    mda.util.rebind(filter, range);

    filter.expression = function(expr) {
      if (arguments.length) {
        var parsed = mda.filter.parseRange(expr, range.domain());
        if (parsed) {
          var r = parsed.range.map(function(t) {
            return new Date(t * 1000);
          });
          range
            .range(r)
            .inclusive(parsed.inclusive);
        }
        return filter;
      }

      var c = [],
          r = range.value(),
          d = range.domain(),
          inclusive = range.inclusive(),
          fmt = function(d) {
            return ~~(+d / 1000);
          };
      if (r[0] > d[0]) {
        c.push((inclusive ? ">=" : ">") + fmt(r[0]));
      }
      if (r[1] < d[1]) {
        c.push((inclusive ? "<=" : "<") + fmt(r[1]));
      }
      return c.length ? c : null;
    };

    return filter;
  };

  mda.filter.category = function() {
    var dispatch = d3.dispatch("change", "scale"),
        multiple = true,
        selected = [],
        size = 10,
        invert = false,
        select = mda.ui.select()
          .value(function(d) { return d.value || d; })
          .label(function(d) { return d.label || d.value || d; });

    function filter(selection) {
      var input = selection.select("select.options");
      if (input.empty()) {
        input = selection.append("select")
          .attr("class", "options form-control");
      }

      // TODO add checkbox for invert

      input
        .attr("multiple", multiple ? "multiple" : null)
        .on("change", null)
        .call(select);

      if (multiple) {
        var getValue = select.value();
        function contains(value) {
          for (var i = 0, len = selected.length; i < len; i++) {
            if (selected[i] == value) return true;
          }
          return false;
        }

        input
          .attr("size", size)
          .selectAll("option")
            .attr("selected", true
              ? function() {
                var v = getValue.apply(this, arguments);
                return contains(v) ? "selected" : null;
              } : null);
      } else {
        input.call(select.set, selected);
      }

      input.on("change", function() {
        if (multiple) {
          selected = [];
          [].forEach.call(this.options, function(option) {
            if (option.selected) selected.push(option.value);
          });
        } else {
          selected = this.value;
        }
        dispatch.change(selected);
      });
    }

    mda.util.rebind(filter, select, ["value", "label", "options"]);

    filter.size = function(x) {
      if (!arguments.length) return size;
      size = x;
      return filter;
    };

    filter.multiple = function(m) {
      if (!arguments.length) return multiple;
      multiple = !!m;
      return filter;
    };

    filter.selected = function(x) {
      if (!arguments.length) return selected;
      selected = x;
      return filter;
    };

    filter.value = filter.selected;
    
    filter.invert = function(i) {
      if (!arguments.length) return invert;
      invert = !!i;
      return filter;
    };

    filter.expression = function(expr) {
      if (arguments.length) {
        if (Array.isArray(expr)) expr = expr[0];
        if (expr) {
          if (expr.charAt(0) === "=") {
            var val = expr.substr(1);
            selected = multiple ? [val] : val;
          } else {
            if (expr.charAt(0) === "!") {
              invert = true;
              expr = expr.substr(1);
            } else {
              invert = false;
            }
            var match = expr.match(/^in\((.+)\)$/);
            if (match) {
              // XXX note that this may break if any of the values
              // contain the "," char
              selected = match[1].split(",");
            } else {
              mda.logger.warn("invalid category expression:", expr);
            }
          }
        }
        return filter;
      }

      var prefix = invert ? "!" : "";
      return multiple
        ? (selected && selected.length)
          ? prefix + "in(" + selected.join(",") + ")" // FIXME this is made up
          : null
        : selected
          ? prefix + "=" + selected
          : null;
    };

    return d3.rebind(filter, dispatch, "on");
  };

})(this);
