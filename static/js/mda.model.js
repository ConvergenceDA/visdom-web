(function(exports) {

  var mda = exports.mda || (exports.mda = {});

  mda.model = function() {
    var columns = [],
        columnsByName = {},
        columnGroups,
        model = {};

    model.columns = function(cols) {
      if (!arguments.length) return columns;
      columns = mda.data.coerceArray(cols, "name")
        .map(initColumn);
      columnsByName = mda.data.map(columns, "name");
      columnGroups = d3.entries(mda.data.group(columns, "group"))
        .sort(function(a, b) {
          return d3.ascending(a.key, b.key);
        })
        .map(function(d, i) {
          var match = d.key.match(/^(\d+)\.(.*)$/);
          if (match) {
            d.sort = +match[1];
            d.key = match[2];
          } else {
            d.sort = i;
          }
          return d;
        })
        .sort(function(a, b) {
          return d3.ascending(a.sort, b.sort)
              || d3.ascending(a.key, b.key);
        })
        .map(function(d) {
          return {
            label:    d.key,
            options:  d.value,
            sort:     d.sort
          };
        });
      return model;
    };

    model.has = function(name) {
      return columnsByName.hasOwnProperty(name);
    };

    model.column = function(name) {
      if (typeof name === "object") {
        name = name.name;
        if (!name) {
          throw new Error("getColumn() objects need a 'name' property");
        }
      }
      if (!columnsByName.hasOwnProperty(name)) {
        throw new Error("No such column: '" + name + "' in model");
        /*
        return {
          name: name,
          units: undefined,
          format: d3.format(",")
        };
        */
      }
      return columnsByName[name];
    };

    model.getColumnsByType = function(type) {
      return model.columns().filter(function(d) {
        return d.type === type;
      });
    };

    model.columnGroups = function(groups) {
      if (!arguments.length) return columnGroups;
      columnGroups = groups;
      return model;
    };

    model.columnSelect = function() {
      var select = mda.ui.select()
        .label(function(d) { return d.label || d.name; })
        .value(function(d) { return d.name; });
      if (columnGroups && columnGroups.length) {
        select
          .groups(columnGroups)
          .options(function(d) { return d.options; });
      } else {
        select.options(columns);
      }
      return select;
    };

    function initColumn(d) {
      if (!d.units) d.units = d.name;
      if (!d.label) d.label = d.name;

      if (!d.type) {
        mda.logger.warn("column '%s' has no type; assuming 'int'", d.name, d);
        d.type = "float";
      }

      d.numeric     = (d.type === "int" || d.type === "float" ); // || d.type === "%");
      //d.percentage  = (d.type === "%");
      d.categorical = d.type === "category";

      if (d.numeric) {
        d.bins = 100;
        if (d.type === "int") {
          d.min = Math.floor(d.min);
          // XXX to make histograms work right
          // (see mda.filter.FilterList#getColumnRenderer() for the inverse)
          d.max = Math.ceil(d.max) + 1;
          d.bins = Math.min(d.bins, d.max - d.min + 1);
        }
        d.domain = [d.min, d.max];
        d.scale = d3.scale.linear()
          .domain(d.domain);
      }

      if (d.type === "date") {
        d.format = d3.time.format("%Y-%m-%d");

        d.convert = function(t) {
          return new Date(t * 1000);
        };
        d.unconvert = function(d) {
          return ~~(+d / 1000);
        };

        d.domain = [d.min, d.max].map(d.convert);
        d.scale = d3.time.scale()
          .domain(d.domain);
      }

      if (typeof d.format !== "function") {
        d.format = getFormat(d);
      }

      if (typeof d.numberFormat !== "function") {
        d.rawFormat = getRawFormat(d);
      }

      if (!d.axisLabel) d.axisLabel = getAxisLabel(d);
      return d;
    }

    function getAxisLabel(col) {
      return col.label + " (" + col.units + ")";
    }

    function getRawFormat(col) {
      switch (col.units) {
        case "kW":
        case "kWh":
          return mda.unit.kilowattFormat(",")
            .scale(1)
            .round(true)
            .suffix("");
        case "F":
          return mda.unit.format(".1f");
        case "%":
          return mda.unit.format(".1f")
            .suffix("%");
      }
      return String;
    }

    function getFormat(col) {
      switch (col.units) {
        case "kW":
          return mda.unit.kilowattFormat();
        case "kWh":
          return mda.unit.kilowattFormat()
            .suffix("Wh");
        case "F":
        case "deg F":
          return mda.unit.format(".1f")
            .suffix("ºF");
        case "%":
          fmt = mda.unit.percentFormat(".0f");
          // hack to re-scale 0-1 values ot be 0-100 as percentages.
          // Unfortunately, both types of data exist.
          return (col.max && col.max <= 1) ? fmt.multiply(100) :  fmt;
        case "n2d":
        case "mn2mx":
          return d3.format(".1f");

        case "date":
          var fmt = d3.time.format("%m/%y");
          return function(t) {
            return fmt(new Date(t * 1000)).replace(/(^0| )/g, "");
          };
      }

      switch (col.type) {
        case "float":
          return mda.unit.format(".4f");

        case "int":
          return mda.unit.format(",").round(true);
      }

      return mda.unit.format(",");
    }

    return model;
  };

  mda.model.Model = mda.Class({
    mixins: [
      mda.EventDispatch
    ],

    events: ["invalidate", "change", "error"],
    eventLabel: "Model",

    defaults: {
      // any other options?
    },

    initialize: function(options) {
      this.options = mda.util.extend({}, this.defaults, options);
      this.api = this.options.api || mda.api();
      this._dataSource = this.api.dataSource();
      this._model = mda.model();
      this._loaded = false;

      // expose the underlying model methods
      // to provide the same API
      this.column = this._model.column;
      this.columns = this._model.columns;
      this.columnGroups = this._model.columnGroups;
      this.columnSelect = this._model.columnSelect;
    },

    hasColumn: function(name) {
      return this._model.has(name);
    },

    getColumn: function(name) {
      return this._model.column(name);
    },

    getColumns: function() {
      return this._model.columns();
    },

    getColumnSelect: function() {
      return this._model.columnSelect();
    },

    getColumnsByType: function(type) {
      return this._model.getColumnsByType(type);
    },

    getDataSource: function() {
      return this._dataSource;
    },

    setDataSource: function(source, callback) {
      // always set the API data source!
      this.api.dataSource(source);

      if (this._dataSource === source && this._loaded) {
        callback && callback(null, source);
        return this;
      }

      // let subscribers know that this data source is invalid
      this.trigger("invalidate", this._dataSource);

      this._loaded = false;
      this.load(function(error, columns) {
        this._dataSource = source;
        callback && callback(null, source);
      }.bind(this));
      return this;
    },

    load: function(callback) {
      if (this._dataSourceRequest) {
        this._dataSourceRequest.abort();
      }
      this._dataSourceRequest = this.api.getColumnInfo(function(error, columns) {
        this._dataSourceRequest = null;
        if (error) {
          callback && callback(error);
          return this.trigger("error", "Unable to load columns: " + error.statusText);
        }
        this._loaded = true;
        this._model.columns(columns);
        columns = this._model.columns();
        this.trigger("change", columns);
        callback && callback(null, columns);
      }.bind(this));
      return this;
    }

  });

})(this);
