(function(exports) {

  var mda = exports.mda || (exports.mda = {});

  mda.ui = {};

  mda.ui.select = function() {
    var options = function(d) {
          return mda.data.coerceArray(d, "value");
        },
        groups,
        value = function(d) {
          return d.value;
        },
        label = function(d) {
          return d.label || d.name;
        };

    function select(selection) {
      if (groups) {
        var group = selection.selectAll("optgroup")
          .data(groups, label);
        group.enter()
          .append("optgroup");
        group.exit()
          .remove();
        group
          .attr("label", label)
          .sort(function(a, b) {
            return d3.ascending(a.sort, b.sort);
          })
          .order();
        selection = group;
      }

      var option = selection.selectAll("option")
        .data(options, value);
      option.enter()
        .append("option");
      option.exit()
        .remove();
      option
        .attr("value", value)
        .text(label);
    }

    select.options = function(d) {
      if (!arguments.length) return options;
      options = d3.functor(d);
      return select;
    };

    select.groups = function(d) {
      if (!arguments.length) return groups;
      groups = d3.functor(d);
      return select;
    };

    select.label = function(fn) {
      if (!arguments.length) return label;
      label = d3.functor(fn);
      return select;
    };

    select.value = function(fn) {
      if (!arguments.length) return value;
      value = d3.functor(fn);
      return select;
    };

    select.set = function(selection, val, strict) {
      val = d3.functor(val);
      return selection.each(function() {
        var v1 = val.apply(this, arguments);
        d3.select(this).selectAll("option")
          .attr("selected", function() {
            var v0 = value.apply(this, arguments),
                selected = strict
                  ? v0 === v1
                  : v0 == v1;
            return selected ? "selected" : null;
          });
      });
    };

    return select;
  };

  mda.ui.element = function(selection, el, before) {
    var name = el, klass;
    if (el.indexOf(".") > -1) {
      var bits = name.split(".", 2);
      name = bits[0];
      klass = bits[1].replace(/\./g, " ");
    }
    var node = selection.select(el);
    if (node.empty()) {
      node = before
        ? selection.insert(name, before)
        : selection.append(name);
      return node.attr("class", klass);
    }
    return node;
  };

  mda.ui.form = function() {
    var data = {},
        dispatch = d3.dispatch("change"),
        parse = function(value) {
          if (!value) return "";
          var n = +value;
          return isNaN(n) ? value : n;
        },
        format = function(v) {
          return v ? String(v) : "";
        };

    function form(selection) {
      selection.on("change.form", null);

      var input = selection.selectAll("input[name]");

      input.filter(function() {
        return this.type === "text";
      }).attr("value", function() {
        return format(data[this.name]);
      });

      input.filter(function() {
          return this.type === "checkbox";
        })
        .property("checked", function() {
          return !!data[this.name];
        });

      input.filter(function() {
          return this.type === "radio";
        })
        .property("checked", function() {
          return data[this.name] == this.value;
        });

      selection.selectAll("select[name]")
        .property("value", function() {
          return data[this.name];
        });

      selection.selectAll("textarea[name]")
        .text(function() {
          return format(data[this.name]);
        });

      selection.on("change.form", change);
    }

    form.get = function(name) {
      return data[name];
    };

    form.set = function(name, value, x) {
      if (name instanceof d3.selection) {
        set(value, x);
        name.call(form);
      } else if (arguments.length === 2) {
        set(name, value);
      } else {
        set(name);
      }
      return form;
    };

    form.data = function(key, val) {
      if (!arguments.length) return data;
      set(key, val);
      return form;
    };

    form.read = function(selection) {
      selection.selectAll("input, select, textarea")
        .filter(function() {
          return this.name;
        })
        .each(function() {
          var name = this.name,
              value = parse(this.value);
          switch (this.type) {
            case "checkbox":
              value = this.checked;
              return;
          }
          data[name] = value;
        });
    };

    function set(key, val) {
      var changed = false;
      if (typeof key === "object") {
        for (var k in key) {
          var c = set(k, key[k]);
          changed = c || changed;
        }
      } else if (data[key] != val) {
        changed = true;
        data[key] = val;
      }
      return changed;
    }

    function change() {
      var el = d3.event.target,
          name = el.name,
          value = parse(el.value);
      switch (el.type) {
        case "checkbox":
          value = el.checked;
          break;
      }
      if (set(name, value)) {
        dispatch.change(data, name, value);
      }
    }

    return d3.rebind(form, dispatch, "on");
  };

  mda.ui.Tooltip = mda.Class({
    statics: {
      options: {
        position: "bottom",
        offset: 6,
        klass: null
      }
    },

    initialize: function(options) {
      this.options = mda.util.extend({}, mda.ui.Tooltip.options, options);
      this.container = d3.select(document.createElement("div"))
        .attr("class", "mda-tooltip");
      if (this.options.klass) {
        this.container.classed(this.options.klass, true);
      }
      if (this.options.position) {
        this.container.classed(this.options.position, true);
      }
      this.content = this.container.append("div")
        .attr("class", "content");
      this.position = {x: 0, y: 0};
      this._visible = false;
      this.hide();
    },

    style: function(name, value) {
      switch (arguments.length) {
        case 1:
          this.content.style(name);
          break;
        case 2:
          this.content.style(name, value);
          break;
      }
      return this;
    },

    attachTo: function(nodeOrSelector) {
      mda.dom.coerceSelection(nodeOrSelector)
        .node()
        .appendChild(this.container.node());
      return this.updatePosition();
    },

    remove: function() {
      this.container.remove();
      return this;
    },

    moveTo: function(x, y, relativeTo) {
      this.position = {x: x, y: y, relativeTo: relativeTo};
      this.updatePosition();
      return this;
    },

    setContent: function(content, isHTML) {
      if (isHTML) this.content.html(content);
      else this.content.text(content);
      return this.updatePosition();
    },

    updateContent: function(data) {
      this.content.selectAll("[data-key]")
        .text(function() {
          return data[this.getAttribute("data-key")] || "";
        });
      return this;
    },

    show: function() {
      this._visible = true;
      this.container.style("display", null);
      return this.updatePosition();
    },

    hide: function() {
      this._visible = false;
      this.container.style("display", "none");
      return this;
    },

    toggle: function() {
      if (this._visible) return this.hide();
      return this.show();
    },

    visible: function() { return this._visible; },

    updatePosition: function() {
      if (!this._visible) return this;

      var position = this.position,
          x = position.x,
          y = position.y,
          relativeTo = position.relativeTo,
          width = this.container.property("offsetWidth"),
          height = this.container.property("offsetHeight");
      if (relativeTo) {
        if (relativeTo.offsetParent) {
          x += relativeTo.offsetLeft;
          y += relativeTo.offsetTop;
        } else {
          // FIXME curse you, Firefox
        }
      }
      var style = {
        left: Math.round(x) + "px",
        top: Math.round(y) + "px",
        "margin-top": null,
        "margin-right": null,
        "margin-bottom": null,
        "margin-left": null,
      };
      var offset = this.options.offset || 0;
      switch (this.options.position) {
        case "left":
          style["margin-top"] = Math.round(-height / 2) + "px";
          style["margin-left"] = -(width + offset) + "px";
          break;
        case "right":
          style["margin-top"] = Math.round(-height / 2) + "px";
          style["margin-left"] = offset + "px";
          break;
        case "top":
          style["margin-top"] = Math.round(-height - offset) + "px";
          style["margin-left"] = Math.round(-width / 2) + "px";
          break;
        case "bottom":
          style["margin-left"] = Math.round(-width / 2) + "px";
          style["margin-top"] = offset + "px";
          break;
      }
      this.container.style(style);
      return this;
    },
  });

  mda.ui.Form = mda.Class({
    mixins: [
      mda.EventDispatch,
    ],

    events: ["change"],
    eventLabel: "Form",

    statics: {
      fields: []
    },

    initialize: function(root, options) {
      this.options = mda.util.extend({}, mda.ui.Form.defaults, options);

      this.root = mda.dom.coerceSelection(root)
        .classed("ui-form", true)
        .attr("role", "form")
        .on("submit", function() {
          d3.event.preventDefault();
        });

      this._values = {};

      this._fields = this.options.fields || [];
      this.build();

      this.form = mda.ui.form()
        .data(this._values = {})
        .on("change", this._onChange.bind(this));

      if (this.options.values) {
        this.set(this.options.values);
      } else {
        this.root.call(this.form);
        this.updateVisibleFields();
      }
    },

    _onChange: function(d, key, value) {
      this.trigger("change", this._values = d, key, value);
      this.updateVisibleFields();
    },

    build: function() {
      var that = this,
          container = this.root.append("div")
            .attr("class", "fields"),
          field = container.selectAll(".field")
            .data(this._fields)
            .enter()
            .append("div")
              .attr("class", "field form-group");

      var label = field.append("label");

      field.filter(function(d) {
          return d.type === "checkbox" || d.type === "radio";
        })
        .classed("checkbox", function(d) { return d.type === "checkbox"; })
        .classed("radio", function(d) { return d.type === "radio"; })
        .select("label")
          .insert("input", "*");

      label.append("span")
        .attr("class", "title")
        .text(function(d) { return d.title; });

      var input = field
        .filter(function(d) {
          return d.type !== "checkbox" && d.type !== "radio";
        })
        .append(function(d) {
          var el = "input";
          switch (d.type) {
            case "select":
            case "textarea":
              el = d.type;
              break;
          }
          return document.createElement(el);
        })
        .classed("form-control", true)
        .classed("input-sm", function(d) {
          switch (d.type) {
            case "select":
            case "textarea":
            case "text":
              return true;
          }
          return false;
        })
        .attr("name", function(d) {
          return d.name;
        });

      field.select("input")
        .attr("type", function(d) { return d.type; })
        .attr("name", function(d) { return d.name; })
        .attr("value", function(d) { return d.value; });

      input.filter("input")
        .attr("placeholder", function(d) { return d.placeholder; });

      input.filter("textarea")
        .text(function(d) { return d.value; });

      input.filter("select")
        .each(function(d) {
          var select = d.select;
          if (!select) {
            select = d.select = mda.ui.select();
            mda.util.configure(select, d);
          }
          d3.select(this)
            .call(select)
            .call(select.set, d.value);
        });

      field.filter(function(d) { return d.help; })
        .append("p")
          .attr("class", "help-block")
          .html(function(d) { return d.help; });
    },

    get: function(name) {
      return this.form.get(name);
    },

    set: function(name, value) {
      if (arguments.length > 1) {
        this.root.call(this.form.set, name, value);
      } else {
        this.root.call(this.form.set, name);
      }
      this.updateVisibleFields();
      return this;
    },

    getState: function() {
      return mda.util.extend({}, this._values);
    },

    setState: function(state) {
      return this.set(state);
    },

    updateVisibleFields: function() {
      var state = this._values;
      this.root.selectAll(".field")
        .filter(function(d) { return typeof d.visible !== "undefined"; })
        .style("display", function(d) {
          var visible = (typeof d.visible === "function")
            ? d.visible(state)
            : d.visible;
          return visible ? null : "none";
        });
    }
  });

})(this);
