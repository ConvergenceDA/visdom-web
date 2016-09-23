(function(exports) {

  var mda = exports.mda = {
    version: "0.0.0"
  };

  // data API wrapper
  mda.api = function() {
    var api = {},
        baseUrl = "/",
        queryUri = "query",
        dataSource = "basics160k",
        logger = mda.logger;

    // get/set the base URL (default: "/")
    api.base = function(url) {
      if (!arguments.length) return baseUrl;
      baseUrl = url;
      return api;
    };

    // get/set the base URL (default: "/")
    api.dataSource = function(ds) {
      if (!arguments.length) return dataSource;
      logger.debug("api.dataSource(", ds, ")");
      dataSource = ds;
      return api;
    };

    // send a request by URI with callback(error, data)
    api.get = function(uri, callback) {
      logger.info("api.get(", uri, ")");
      var req = d3.json(baseUrl + uri, callback),
          abort = req.abort;
      req.abort = function() {
        logger.warn("ABORT api.get(", uri, ")");
        abort.call(req);
      };
      return req;
    };

    // send a query request using data objects
    // see: mda.api.query.format()
    // also, note the callback signature:
    // callback(error, data, query)
    api.queryUri = function(query) {
      if (!query.source) query.source = dataSource;
      var q = mda.api.query.format(query),
          uri = [queryUri, q].join("?");
      return(uri);
    }

    api.query = function(query, callback) {
      uri = api.queryUri(query);
      // logger.log(uri);
      return api.get(uri, function(error, data) {
        return callback.call(this, error, data, query);
      });
    };

    api.query.shapes = function(query, callback) {
      if (!query.source) query.source = dataSource;
      var q = mda.api.query.formatShape(query),
          uri = ["query/shape", q].join("?");
      return api.get(uri, function(error, data) {
        return callback.call(this, error, data, query);
      });
    };

    api.query.responses = function(query, callback) {
      if (!query.source) query.source = dataSource;
      var q = mda.api.query.formatResponses(query),
          uri = ["query/response", q].join("?");
      return api.get(uri, function(error, data) {
        return callback.call(this, error, data, query);
      });
    };

    api.getColumns = function(ds, callback) {
      if (arguments.length === 1) {
        callback = ds;
        ds = dataSource;
      }
      return api.get(ds + "?colNames", callback);
    };

    api.getColumnInfo = function(ds, callback) {
      if (arguments.length === 1) {
        callback = ds;
        ds = dataSource;
      }
      return api.get("query?/s/" + ds + "/colInfo", callback);
    };

    api.logger = function(log) {
      if (!arguments.length) return logger;
      logger = log;
      return api;
    };

    return api;
  };

  mda.api.filter = {
    // version 1 "/f/" filter parse + format
    "1": {
      prefix: "/f/",
      parse: function(str) {
        if (!str) {
          return [];
        } else if (typeof str !== "string") {
          return str;
        }

        var prefix = this.prefix;
        if (str.indexOf(prefix) === 0) {
          str = str.substr(prefix.length);
        }
        var parts = str.split("|"),
            columns = parts[0].split("+"),
            clauses = parts[1].split("+");
        return columns.map(function(col, i) {
          var crit = clauses[i].split(mda.api.query.AND_PATTERN);
          return {
            column: col,
            value: crit
          };
        });
      },

      format: function(filter) {
        if (!filter) {
          return "";
        } else if (typeof filter === "string") {
          return filter;
        }

        if (Array.isArray(filter)) {
          var cols = filter.map(function(f) {
                return f.column;
              }),
              crit = filter.map(function(f) {
                return join(f.value, mda.api.query.AND);
              })
          if (cols.length) {
            return [cols.join("+"), "|", crit.join("+")].join("");
          }
        } else {
          var cols = Object.keys(filter),
              crit = cols.map(function(col) {
                return join(filter[col]);
              });
          if (cols.length) {
            return [cols.join("+"), "|", crit.join("+")].join("");
          }
        }
        return "";
      }
    },

    // version 2 "/f2/" filter parse + format
    "2": {
      prefix: "/f/",
      parse: function(str) {
        if (!str) {
          return [];
        } else if (typeof str !== "string") {
          return str;
        }

        var prefix = this.prefix;
        if (str.indexOf(prefix) === 0) {
          str = str.substr(prefix.length);
        }

        // sanity checks: we're looking for
        // "(" [expression [ ")" ["&" | "^"] "(" expression ]* ")"
        if (str.charAt(0) !== "(") {
          throw new Error("Expected '(' at beginning of filter expression: \"" + str + "\"");
        }
        if (str.charAt(str.length - 1) !== ")") {
          throw new Error("Expected ')' at end of filter expression: \"" + str + "\"");
        }

        var inner = str.substr(1, str.length - 2);
        if (inner.indexOf("|") > -1) {
          throw new Error("Can't parse OR'd expressions: \"" + inner + "\"");
        }
        var groups = inner.split(/\)[\&\^\+]\(/),
            columns = {};
        groups.forEach(function(group) {
          var clauses = group.split(mda.api.query.AND_PATTERN);
          clauses.forEach(function(clause) {
            if (clause.match(/[\)\(]/)) {
              throw new Error("Can't parse nested expression: \"" + clause + "\"");
            }

            // parse out the column name (any word char) from the beginning
            var match = clause.match(/^(\w+)(.+)$/);
            if (!match) throw new Error("bad clause format: " + clause);

            var col = match[1],
                val = match[2];
            // normalize "'in'[*]" to "in(*)"
            if (val.indexOf("'in'") === 0) {
              val = "in(" + val.substring(5, val.length - 1) + ")";
            }
            if (col in columns) {
              columns[col].push(val);
            } else {
              columns[col] = [val];
            }
          });
        });

        return Object.keys(columns).map(function(column) {
          return {
            column: column,
            value: columns[column]
          };
        });
      },

      format: function(filter) {
        if (!filter) {
          return "";
        } else if (typeof filter === "string") {
          return filter;
        }

        var crit = [],
            AND = "+";
        if (Array.isArray(filter)) {
          // assume that filter takes the form:
          // [
          //  {column, value}+
          // ]
          crit = filter;
        } else {
          // filter takes the form {column: value,}
          crit = Object.keys(filter)
            .map(function(col) {
              var val = filter[col];
              return {
                column: col,
                value: val
              };
            });
        }
        if (crit.length) {
          // join them with grouped ANDs
          var glue = [")", "("].join(AND);
          return "(" + crit.map(function(c) {
            var val = c.value;
            if (Array.isArray(val)) {
              var col = c.column;
              return val.map(function(v) {
                return [col, v].join("");
              }).join(AND);
            } else {
              if (typeof val !== "string") {
                throw new Error("Unexpected filter criteria (expected string): " + val);
              }
              // switch from "in(*)" to "'in'[*]"
              var match = val.match(/^in\((.+)\)$/);
              if (match) {
                val = "'in'[" + match[1] + "]";
              }
            }
            return [c.column, val].join("");
          }).join(glue) + ")";
        }
        return "";
      }
    }
  };

  // data query functions
  mda.api.query = {
    AND: "^", // "&"
    AND_PATTERN: /[\&\^\+]/,
    FILTER_PREFIX: null,

    // query data -> String
    format: function(data) {
      var source  = data.source  || "basics",
          columns = data.columns || data.column,
          filter = data.filter,
          agg = data.agg,
          cum = !!data.cum,
          sampling = data.sampling,
          uri = [];
      uri.push("/s/", source);
      if (columns) {
        uri.push("|", join(columns));
      }
      if (filter && typeof filter === "object") {
        var f = this.formatFilter(filter);
        if (f) uri.push(this.FILTER_PREFIX, f);
      } else if (filter) {
        uri.push(this.FILTER_PREFIX, join(filter));
      }
      if (agg && typeof agg === "object") {
        var col = Object.keys(agg)[0],
            fn = String(agg[col]);
        uri.push("/a/", col, "|", fn);
      } else if (agg) {
        uri.push("/a/", agg);
      }
      if (data.asc) {
        uri.push("/asc/", data.asc);
      }
      if (data.desc) {
        uri.push("/desc/", data.desc);
      }
      if (data.fmt) {
        uri.push("/fmt/", data.fmt);
      }
      if (cum) {
        uri.push("/cum");
      }
      if (typeof sampling === "object") {
        uri.push("/", sampling.type, "/", sampling.count);
        if (sampling.domain) {
          uri.push("[", join(sampling.domain, ":"), "]");
        }
      } else if (sampling) {
        uri.push("/", sampling);
      }
      return uri.join("");
    },

    formatShape: function(data) {
      var source = data.source,
          sort = data.sort || "kwh",
          topN = data.count || 1000,
          filter = data.filter,
          uri = [];
      uri.push("/s/", source);
      uri.push("/", sort, "/", topN);
      if (filter) {
        uri.push(this.FILTER_PREFIX, this.formatFilter(filter));
      }
      return uri.join("");
    },

    formatResponses: function(data) {
      var source = data.source,
          sort = data.sort || "savings",
          topN = data.count || 1000,
          desc = data.desc || false,
          filter = data.filter,
          uri = [];
      uri.push("/s/", source);
      uri.push("/", sort, "/", desc, "/", topN);
      if (filter) {
        uri.push(this.FILTER_PREFIX, this.formatFilter(filter));
      }
      return uri.join("");
    },

    version: function(version) {
      switch (version) {
        case 1:
        case 2:
          mda.logger.log("mda.api.query.version(", version, ")");
          break;
        default:
          throw new Error("Bad API version: " + version);
      }
      var filter = mda.api.filter[version];
      this.filter = filter;
      this.FILTER_PREFIX = filter.prefix;
      this.parseFilter = filter.parse.bind(filter);
      this.formatFilter = filter.format.bind(filter);
      return this;
    }
  };

  function join(d, glue) {
    return Array.isArray(d) ? d.join(glue || mda.api.query.AND) : String(d);
  }


  // data munging functions
  mda.data = {};

  mda.data.coerceArray = function(obj, key) {
    if (Array.isArray(obj)) return obj;
    if (!key) key = "key";
    return d3.entries(obj)
      .map(function(d) {
        d.value[key] = d.key;
        return d.value;
      });
  };

  mda.data.table = function(res, indexKey) {
    if (!indexKey) indexKey = "index";
    var columns = res.columns,
        clen = columns.length,
        index = res.index;
    if (columns.indexOf(indexKey) > -1) {
      mda.logger.warn("index key '%s' is a duplicate column");
    }
    return res.data.map(function(d, i) {
      var row = {};
      row[indexKey] = index[i];
      for (var j = 0; j < clen; j++) {
        row[columns[j]] = d[j];
      }
      return row;
    });
  };

  mda.data.group = function(rows, key, single) {
    if (typeof key === "string") {
      var k = key;
      key = function(d) { return d[k]; };
    }
    return d3.nest()
      .key(key)
      .rollup(single ? function(d) { return d[0]; } : null)
      .map(rows);
  };

  mda.data.map = function(rows, key) {
    return mda.data.group(rows, key, true);
  };

  // identity and index functions
  mda.identity = function identity(d) { return d; };
  mda.index = function index(d, i) { return i; };
  // noop function
  mda.noop = function noop() {};

  // property accessor
  mda.property = function(key) {
    if (typeof key === "function") return key;

    function property(d) {
      return d[key];
    }

    property.set = function(val) {
      val = d3.functor(val);
      return function(d) {
        d[key] = val.apply(this, arguments);
      };
    };

    property.toString = function() {
      return String(key);
    };

    return property;
  };

  // utility functions
  mda.util = {};

  mda.util.debounce = function(fn, wait) {
    var timeout, args, context;
    return function() {
      clearTimeout(timeout);
      args = arguments;
      context = this;
      timeout = setTimeout(function() {
        fn.apply(context, args);
      }, wait);
    };
  };

  /*
   * extend one object with the properties of one or
   * more additional objects:
   */
  mda.util.extend = function(obj, a, b) {
    if (!obj) return;
    [].slice.call(arguments, 1).forEach(function(o) {
      if (!o) return;
      for (var k in o) {
        obj[k] = o[k];
      }
    });
    return obj;
  };

  mda.util.rebind = function(child, parent, methods) {
    if (!methods) methods = Object.keys(parent);
    methods.forEach(function(name) {
      if (typeof parent[name] !== "function") return;
      child[name] = function(value) {
        if (!arguments.length) return parent[name].call(parent);
        parent[name].apply(parent, arguments);
        return child;
      };
    });
    return child;
  };

  /*
   * helper function to configure a view with either a function or an object,
   * e.g.:
   *
   * mda.util.configure(view, {
   *   foo: "bar"
   * });
   *
   * would call view.foo("bar") if (typeof view.foo === "function"). Calling it
   * with a function as the config calls the function with the view as both its
   * `this` context and first argument:
   *
   * mda.util.configure(view, function() {
   *  this.foo("bar");
   * });
   */
  mda.util.configure = function(obj, config) {
    if (typeof config === "function") {
      config.apply(obj, [].slice.call(arguments, 2));
    } else {
      for (var key in config) {
        if (typeof obj[key] === "function") {
          obj[key].call(obj, config[key]);
        } else {
          obj[key] = config[key];
        }
      }
    }
    return obj;
  };

  mda.util.getVendorSymbol = (function() {
    var prefixes = "webkit moz ie".split(" ");
    return function(obj, method) {
      if (method in obj) return method;
      var camelCased = method.charAt(0).toUpperCase() + method.substr(1);
      for (var i = 0, len = prefixes.length; i < len; i++) {
        var prefix = prefixes[i],
            name = prefix + camelCased;
        if (name in obj) return name;
      }
      return null;
    };
  })();

  mda.util.diff = function(a, b) {
    var ak = Object.keys(a || {}),
        bk = Object.keys(b || {}),
        diff = {};
    ak.forEach(function(key) {
      if (bk.indexOf(key) === -1) {
        diff[key] = {op: "remove"};
      } else if (a[key] != b[key]) {
        diff[key] = {op: "change", from: a[key]};
      }
    });
    bk.forEach(function(key) {
      if (ak.indexOf(key) === -1) {
        diff[key] = {op: "add"};
      }
    });
    return diff;
  };

  mda.util.deepEqual = function(a, b) {
    if ((a && !b) || (b && !a)) return false;

    if (typeof a === "object") {
      for (var k in a) {
        if (!mda.util.deepEqual(a[k], b[k])) {
          return false;
        }
      }
      return true;
    }
    return a === b;
  };

  mda.util.abortable = function(fn, abort) {
    var req;
    if (!abort) {
      abort = function(d) {
        try {
          return d.abort();
        } catch (e) {
          mda.logger.warn("unable to abort", d, ":", e)
        }
      };
    }
    return function() {
      if (req) {
        abort(req);
        req = null;
      }
      return req = fn.apply(this, arguments);
    };
  };

  /*
   * These hashable tweaks fix potential issues related to the way that filter
   * expressions are parsed and formatted, specifically ensuring that "+"
   * characters don't get decoded as " ".
   */
  mda.util.monkeyPatchHashable = function(hashable) {
    // don't let hashable replace "%20" with "+"
    delete hashable.qs.replacements["%20"];
    // monkey patch hashable.qs.parse() to replace "+" with "%2B" before parsing
    var qparse = hashable.qs.parse;
    hashable.qs.parse = function(str) {
      if (typeof str !== "string") return null;
      str = str.replace(/\+/g, "%2B");
      return qparse.call(hashable.qs, str);
    };
  };

  mda.util.unformat = function(format) {
    if (typeof format.copy === "function" && typeof format.suffix === "function") {
      return format.copy().suffix("");
    }
    return function(n) {
      return format(n).replace(/[^\d]+$/, "");
    };
  };

  mda.dom = {};

  mda.dom.coerceSelection = function(d) {
    if (!d) throw "Invalid selector: " + d;
    if (d instanceof d3.selection) {
      return d;
    }
    return d3.select(d);
  };

  mda.dom.selectorMatcher = function(selector) {
    var symbol = mda.util.getVendorSymbol(document.body, "matchesSelector");
    return function(node) {
      return node[symbol].call(node, selector);
    };
  };

  mda.dom.matchesSelector = function(node, selector) {
    var symbol = mda.util.getVendorSymbol(node, "matchesSelector");
    return node[symbol].call(node, selector);
  };

  mda.dom.selectAncestor = function(node, selector) {
    var matches = mda.dom.selectorMatcher(selector);
    while (node) {
      if (matches(node)) break;
      node = node.parentNode;
    }
    return d3.select(node);
  };

  mda.dom.bringToFront = function(node) {
    if (!(node instanceof Node)) node = this;
    return node.parentNode && node.parentNode.appendChild(node);
  };

  /*
   * a CSS unit-aware style tweening function that defaults lengths to
   * zero and interpolates numerically.
   */
  mda.dom.styleTween = function(selection, name, value, units) {
    value = d3.functor(value);
    if (!units) units = "px";
    if (selection instanceof d3.transition) {
      selection.styleTween("width", function(d) {
          var start = this.style.getPropertyValue(name);
          start = start ? +start.replace(units, "") : 0;
          var end = value.apply(this, arguments),
              i = d3.interpolate(start, end);
          return function(t) {
            return i(t) + units;
          };
      });
    } else {
      return selection.style(name, function() {
        return value.apply(this, arguments) + units;
      });
    }
  };

  mda.dom.styleTween = function() {
    var property = "width",
        value = d3.functor(0),
        start = 0,
        units = "px",
        round = Number;

    function tween(selection) {
      if (!(selection instanceof d3.transition)) {
        return selection.style(property, function() {
          return round(value.apply(this, arguments)) + units;
        });
      }
      selection.styleTween(property, function(d) {
        var v = this.style.getPropertyValue(property),
            v0 = v ? +v.replace(units, "") : start,
            v1 = value.apply(this, arguments),
            i = d3.interpolate(v0, v1);
        return function(t) {
          return round(i(t)) + units;
        };
      });
    }

    tween.property = function(prop) {
      if (!arguments.length) return property;
      property = prop;
      return tween;
    };

    tween.value = function(v) {
      if (!arguments.length) return value;
      value = d3.functor(v);
      return tween;
    };

    tween.units = function(unit) {
      if (!arguments.length) return units;
      units = unit;
      return tween;
    };

    tween.round = function(fn) {
      if (!arguments.length) return round;
      round = (fn === true) ? Math.round : fn;
      return tween;
    };

    return tween;
  };

  mda.transition = function(selection, options) {
    if (!options) return selection;
    switch (typeof options) {
      case "number":
        var duration = options;
        options = {duration: duration};
        break;
      case "object":
        break;
      default:
        return selection;
    }
    return options.duration > 0
      ? mda.util.configure(selection.transition(), options)
      : selection;
  };

  mda.cmp = {};

  mda.cmp.in = function(list) {
    return function(value) {
      return list.indexOf(value) > -1;
    };
  };

  mda.cmp.notIn = function(list) {
    return function(value) {
      return list.indexOf(value) === -1;
    };
  };

  // unit formatting and conversion functions
  mda.unit = {};

  mda.unit.format = function(f) {
    var fmt = (typeof f === "function") ? f : d3.format(f || ".1f"),
        suffix = "",
        space = " ",
        scale,
        round = false,
        multiply = 1;

    function format(n) {
      n *= multiply;
      if (round) n = round(n);
      var prefix = d3.formatPrefix(scale || n),
          watts = prefix.scale(n);
      // XXX if (watts < .4) d3.format("d")(watts) === "" 
      return [
        fmt(watts) || "0",
        space,
        prefix.symbol,
        suffix
      ].join("");
    }

    format.suffix = function(str) {
      if (!arguments.length) return suffix;
      suffix = str;
      return format;
    };

    format.scale = function(x) {
      if (!arguments.length) return scale;
      scale = x;
      return format;
    };

    format.multiply = function(x) {
      if (!arguments.length) return multiply;
      multiply = x;
      return format;
    };

    format.round = function(x) {
      if (!arguments.length) return round;
      round = (typeof x === "boolean")
        ? (x ? Math.round : false)
        : d3.functor(round);
      return format;
    };

    format.space = function(x) {
      if (!arguments.length) return space;
      space = x;
      return format;
    };

    format.copy = function() {
      return mda.unit.format(fmt)
        .multiply(multiply)
        .round(round)
        .scale(scale)
        .space(space)
        .suffix(suffix);
    };

    return format;
  };

  mda.unit.wattFormat = function(fmt) {
    return mda.unit.format(fmt)
      .suffix("W");
  };

  mda.unit.kilowattFormat = function(fmt) {
    return mda.unit.wattFormat(fmt)
      .multiply(1e3);
  };

  mda.unit.percentFormat = function(fmt) {
    return mda.unit.format(fmt)
      //.multiply(100)
      .suffix("%");
  };

  mda.unit.coerce = function(u) {
    return (typeof u === "object")
      ? u
      : mda.unit.types[u];
  };

  mda.unit.rangeFormat = function(fmt) {
    var left = fmt || mda.unit.format(fmt),
        right = left,
        glue = " - ",
        suffix = /[^\d]+$/;

    function format(range) {
      var a = left(range[0]),
          b = right(range[1]);
      if (!suffix) {
        return [a, b].join(glue);
      }
      var am = (a.match(suffix) || "")[0],
          bm = (b.match(suffix) || "")[0];
      if (am === bm) {
        a = a.replace(am, "");
      }
      return [a, b].join(glue);
    }

    format.left = function(fmt) {
      if (!arguments.length) return left;
      left = d3.functor(fmt);
      return format;
    };

    format.right = function(fmt) {
      if (!arguments.length) return right;
      right = d3.functor(fmt);
      return format;
    };

    format.glue = function(str) {
      if (!arguments.length) return glue;
      glue = str;
      return format;
    };

    return format;
  };

  (function() {

    mda.unit.types = {
      // watts
      W:  makeWattUnit("W", 1),
      kW: makeWattUnit("kW", 1e3),
      MW: makeWattUnit("MW", 1e6),
      GW: makeWattUnit("GW", 1e9),

      // watts * hour
      Wh: makeWattUnit("Wh", 1, "Wh"),
      kWh: makeWattUnit("kWh", 1e3, "Wh"),
      MWh: makeWattUnit("MWh", 1e6, "Wh"),
      GWh: makeWattUnit("GWh", 1e9, "Wh"),

      // therms
      therms: {
        name: "thm",
        alias: ["thm", "therm"],
        format: mda.unit.format(".1f")
          .scale(1)
          .suffix("thm"),
        formatFixed: mda.unit.format(",")
          .scale(1)
          .suffix("thm"),
        convert: function(n, other) {
          return mda.unit.convert(n, "thm", other);
        }
      }
    };

    // create lowercase aliases for all types
    (function(types) {
      for (var key in types) {
        var type = types[key],
            aliases = [key.toLowerCase(), type.name];
        if (Array.isArray(type.alias)) {
          aliases = aliases.concat(type.alias);
        }
        aliases.forEach(function(alias) {
          if (!(alias in types)) types[alias] = type;
        });
      }
    })(mda.unit.types);

    function makeWattUnit(name, scale, suffix) {
      var type = {
        name: name,
        format: mda.unit.wattFormat(".1f"),
        formatFixed: mda.unit.wattFormat(",")
          .scale(scale),
        convert: function(n, other) {
          return mda.unit.convert(n, type, other);
        }
      };
      if (suffix) {
        type.format.suffix(suffix);
        type.formatFixed.suffix(suffix);
      }
      return type;
    }

  })();

  (function() {

    var UNIT_CONVERSION_GLUE = "2",
        CONVERSIONS = {
          kWh2thm: function(kWh) {
            return kWh * 0.034095106405145;
          },
          thm2kWh: function(kWh) {
            return kWh / 0.034095106405145;
          }
        };

    mda.unit.conversions = CONVERSIONS;

    mda.unit.convert = function(n, from, to) {
      from = mda.unit.coerce(from).name;
      to = mda.unit.coerce(to).name;

      // don't perform a conversion if the units are the same
      if (from === to) return n;

      var key = [from, to].join(UNIT_CONVERSION_GLUE);
      if (!(key in mda.unit.conversions)) {
        throw "No conversion defined for: " + key;
      }
      return CONVERSIONS[key].call(null, n);
    };

    (function(conversions, glue) {
      for (var key in conversions) {
        var bits = key.split(glue),
            from = bits[0],
            to = bits[1],
            convert = conversions[key],
            inverse = [to, from].join(glue);
        if (!(inverse in conversions)) {
          conversions[inverse] = function(n) {
            return 1 / convert(n);
          };
        }
      }
    })(CONVERSIONS, UNIT_CONVERSION_GLUE);

  })();

  mda.hash = function() {
    return hashable.hash();
      /*
      // TODO issue #36
      .save(function(uri) {
        history.replaceState("", "", "#" + uri);
      });
      */
  };

  /*
   * mda.Class is a factory for classes:
   *
   * var MyClass = mda.Class(ParentClass, {
   *   initialize: function() {
   *     // constructor
   *   },
   *
   *   doSomething: function() {
   *     // public class method
   *   },
   *
   *   statics: {
   *     BLAH: 42 // MyClass.BLAH
   *   },
   *
   *   // mix in other classes
   *   mixins: [
   *     mda.EventDispatch
   *   ]
   * });
   *
   * Classes created with mda.Class() will have a static extend() method
   * that can be used to extend them. E.g.:
   *
   * var BaseClass = mda.Class({
   *   initialize: function() {
   *   },
   *
   *   doSomething: function() {
   *   }
   * });
   *
   * var SubClass = BaseClass.extend({
   *   initialize: function() {
   *     BaseClass.prototype.initialize.apply(this, arguments);
   *   }
   * });
   */
  mda.Class = function(parent, methods) {
    if (arguments.length === 1) {
      methods = parent;
      parent = null;
    }

    var klass = function() {
      this.initialize && this.initialize.apply(this, arguments);
    };

    if (parent) {
      mda.util.extend(klass.prototype, parent.prototype);
    }

    klass.extend = function(proto) {
      return mda.Class(klass, proto);
    };

    if (methods.statics) {
      delete klass.prototype.statics;
      mda.util.extend(klass, methods.statics);
    }

    if (methods.mixins) {
      delete klass.prototype.mixins;
      methods.mixins.forEach(function(mixin) {
        mda.util.extend(klass.prototype, mixin.prototype);
      });
    }

    mda.util.extend(klass.prototype, methods);

    return klass;
  };

  /*
   * The EventDispatch class lazily builds a d3.dispatch() for itself
   * and exposes an interface simliar to Node's EventEmitter:
   *
   * var dispatch = mda.EventDispatch("foo", "bar");
   * dispatch.on("foo", function(foo) { console.log("foo:", foo); });
   * dispatch.trigger("foo", "bar");
   * // logs: "foo: bar"
   * dispatch.off("foo");
   * dispatch.trigger("foo", "bar");
   * // doesn't log anything
   *
   * You can use mda.EventDispatch as a mixin for other classes like so:
   *
   * var MyClass = mda.Class({
   *   mixins: [mda.EventDispatch],
   *
   *   events: ["foo", "bar"],
   *
   *   initialize: function() {
   *     // construct MyClass
   *   }
   * });
   *
   * Because EventDispatch creates the dispatcher lazily, you don't have to
   * call this._createDispatch() - just provide an "events" key in your class
   * prototype and it'll be done for you!
   */
  mda.EventDispatch = mda.Class({
    events: [],
    eventLabel: "EventDispatch",

    initialize: function(events) {
      this._createDispatch(events);
    },

    _createDispatch: function(events) {
      if (arguments.length && !Array.isArray(events)) {
        events = [].slice.call(arguments);
      }
      this._dispatch = d3.dispatch.apply(null, events || this.events);
      return d3.rebind(this, this._dispatch, "on");
    },

    on: function(event, callback, name) {
      if (!this._dispatch) this._createDispatch();
      if (this.eventLabel) {
        mda.logger.debug("events:", this.eventLabel +
          "#on(", '"' + event + '",', name || callback.name || "anonymous", ")");
      }
      try {
        //console.log(arguments);
        this.on.apply(this, arguments);
      } catch (error) {
        mda.logger.warn("unrecognized event type: '%s'; valid events are: %s", event, Object.keys(this._dispatch).join(", "));
      }
      return this;
    },

    trigger: function(event, data) {
      if (this._dispatch) {
        if (this.eventLabel) {
          mda.logger.debug("events:", this.eventLabel +
            "#trigger(", '"' + event + '",', data, ")");
        }
        var args = [].slice.call(arguments, 1);
        this._dispatch[event].apply(this, args);
      }
      return this;
    },

    off: function(event) {
      mda.logger.info(this.eventLabel, "off(", event, ")");
      return this.on(event, null);
    }
  });

  mda.Logger = mda.Class({
    statics: {
      ERROR:  0,
      WARN:   1,
      INFO:   2,
      LOG:    3,
      DEBUG:  4,
      NONE:   5
    },

    initialize: function(level, prefix) {
      this.level = isNaN(level) ? mda.Logger.ERROR : level;
      this.prefix = prefix;
    },

    debug: function() {
      if (this.level >= mda.Logger.DEBUG) {
        console.log(arguments)
        console.debug.apply(console, this._message(arguments));
      }
    },

    log: function() {
      if (this.level >= mda.Logger.LOG) {
        console.log.apply(console, this._message(arguments));
      }
    },

    info: function() {
      if (this.level >= mda.Logger.INFO) {
        console.info.apply(console, this._message(arguments));
      }
    },

    warn: function() {
      if (this.level >= mda.Logger.WARN) {
        console.warn.apply(console, this._message(arguments));
      }
    },

    error: function() {
      if (this.level >= mda.Logger.ERROR) {
        console.error.apply(console, this._message(arguments));
        // XXX throw your own errors!
      }
    },

    // append this.prefix to an Arguments list and return it as an Array
    _message: function(args) {
      args = [].slice.call(args);
      if (this.prefix) args.unshift(this.prefix);
      return args;
    }
  });

  // mda.logger is our singleton Logger instance for use globally
  mda.logger = new mda.Logger(mda.Logger.DEBUG, "");

  mda.require = function() {
    [].forEach.call(arguments, function(module) {
      if (!mda[module]) throw new Error("Missing required module: " + module);
    });
  };

  // default is API version 2
  mda.api.query.version(2);

})(this);
