(function(exports) {
  var mda = exports.mda;

  mda.storage = {};

  /*
   * The API for a storage engine is:
   *
   * engine():
   *   .key(string) set the storage key
   *   .key(): get the storage key
   *   .read(): read the stored value as a String
   *   .write(data): write data to the named key
   *   .clear(): remove/unset the stored key
   *
   * TODO: future engines may be asynchronous, in which
   * case all of the above functions will need to work
   * with callbacks.
   */

  mda.storage.getEngine = function(engine) {
    if (engine in this.engines) {
      return this.engines[engine]();
    } else if (typeof engine === "object") {
      return engine;
    }
    throw new Error("Bad storage engine: " + engine);
  };

  mda.storage.engines = {};

  var engines = mda.storage.engines.localStorage = function() {
    var key,
        storage = window.localStorage;
    return {
      key: function(str) {
        if (!arguments.length) return key;
        if (key) this.clear();
        key = str;
        return this;
      },
      read: function() {
        var data = JSON.parse(storage.getItem(key) || "null");
        // mda.logger.debug("[storage] read:", key, "=", data);
        return data;
      },
      write: function(data) {
        // mda.logger.debug("[storage] write:", key, "=", data);
        storage.setItem(key, JSON.stringify(data || null));
        return this;
      },
      clear: function() {
        storage.removeItem(key);
        return this;
      }
    };
  };

  var GenericStore = mda.storage.GenericStore = mda.Class({
    mixins: [
      mda.EventDispatch
    ],

    events: ["select", "save"],
    eventLabel: "GenericStore",

    statics: {
      defaults: {
        engine: "localStorage",
        storageKey: "XXX",
        promptLabel: "select a preset:",
        savePromptText: "What would you like to call this preset?",
        replaceConfirmText: "Are you sure that you want to replace the preset '{name}'?"
      }
    },

    initialize: function(options) {
      this.options = mda.util.extend({}, this.constructor.defaults, options);

      this.engine = mda.storage.getEngine(this.options.engine)
        .key(this.options.storageKey);

      var that = this;
      this.selector = mda.dom.coerceSelection(this.options.selector)
        .on("change", function() {
          that.selectByName(this.value);
        });

      if (this.options.saveButton) {
        this.saveButton = mda.dom.coerceSelection(this.options.saveButton)
          .on("click", this.save.bind(this));
      }

      if (this.options.removeButton) {
        this.removeButton = mda.dom.coerceSelection(this.options.removeButton)
          .on("click", this._removePreset.bind(this));
      }

      this.presets = {};
    },

    restore: function() {
      this.presets = this.engine.read() || {};
      for (var name in this.presets) {
        this.presets[name].name = name;
      }
      // mda.logger.debug("[generic store] restored:", this.presets);
      this._updateOptions();
      return this;
    },

    _presetEquals: function(preset, data) {
      return mda.util.deepEqual(preset, data);
    },

    _removePreset: function() {
      if (!this._current) {
        return mda.logger.warn("_removePreset() called without current filter set");
      }

      var preset = this._current;
          name = preset.name;
      mda.logger.debug("removing preset:", preset);
      if (!this.presets[name]) {
        mda.logger.warn("no name for filter:", preset, "; looking...");
        var found = false;
        for (var key in this.presets) {
          if (this._presetEquals(preset, this.presets[key])) {
            name = key;
            found = true;
            break;
          }
        }
        if (!found) {
          return mda.logger.warn("couldn't find preset:", preset, "in", this.presets);
        }
      }
      delete this.presets[name];
      this.engine.write(this.presets);
      this._updateOptions();
      this.selector.property("selectedIndex", 0);
      this._current = null;
    },

    _updateOptions: function() {
      var options = [{
        name: this.options.promptLabel
      }];
      for (var name in this.presets) {
        options.push(this.presets[name]);
      }

      var select = mda.ui.select()
        .options(options)
        .value(function(d) { return d.name; })
        .label(function(d) { return d.name; });
      this.selector.call(select);
      if (this._current) {
        this.selector.call(select.set, this._current.name);
      } else {
        this.selector.property("selectedIndex", 0);
      }
    },

    updateSelectedOption: function(selected) {
      if (!selected) {
        var current = this._current;
        selected = function(d) {
          return this._presetEquals(current, d);
        }.bind(this);
      }
      this.selector
        .property("selectedIndex", 0)
        .selectAll("option")
          .filter(function(d, i) { return i > 0; })
          .attr("selected", function(d) {
            return selected(d) ? "selected" : null;
          });
      return this;
    },

    selectByName: function(name) {
      var preset = this.presets[name];
      if (preset) {
        preset.name = name;
        this.trigger("select", preset, name);
      } else {
        mda.logger.warn("no preset selected:", name);
      }
    },

    setCurrent: function(data) {
      this._current = data;
      this.updateSelectedOption();
      return this;
    },

    save: function(preset) {
      mda.logger.log("[generic store] save:", preset);
      if (!preset) preset = this._current;
      if (!preset) {
        mda.logger.warn("[generic store] No current preset! Did you call setCurrent() yet?");
        return false;
      }

      var name = prompt(this.options.savePromptText);
      if (!name || name === "null") {
        mda.logger.warn("[generic store] preset naming canceled.");
        return;
      }

      var saved;
      if (this.presets.hasOwnProperty(name)) {
        var replace = confirm(this.options.replaceConfirmText.replace(/{name}/g, name));
        if (!replace) return false;
      }

      this._save(preset, name);
      this.trigger("save", preset, name);
      return saved;
    },

    _save: function(preset, name) {
      if (!preset.id) preset.id = "f" + Date.now();
      if (!name) name = preset.id;
      preset.name = name;
      this.presets[name] = preset;
      this.engine.write(this.presets);
      this._updateOptions();
    },

    get: function(name) {
      return this.presets[name];
    },

    remove: function(name) {
      delete this.presets[name];
      this.storage.write(this.presets);
      return this;
    },

    clear: function() {
      this.engine.clear();
      return this;
    }
  });


  var FilterStore = mda.storage.FilterStore = GenericStore.extend({
    events: ["select", "save"],
    eventLabel: "FilterStore",

    statics: {
      defaults: mda.util.extend({}, GenericStore.defaults, {
        storageKey: "visdom.filters",
        promptLabel: "select a preset:",
        replaceConfirmText: "Are you sure that you want to replace the filter preset '{name}'?",
      })
    },

    _presetEquals: function(preset, data) {
      // mda.logger.info("[filter store] compare:", preset, "===", data);
      return preset.source === data.source
          && mda.util.deepEqual(preset.expr, data.expr);
    },

    updateOptionsWithModel: function(model) {
      var source = model.getDataSource(),
          enabled = function(d) {
            return d.source === source;
          };

      this.selector
        .selectAll("option")
          .filter(function(d) { return d.expr; })
          .attr("disabled", function(d) {
            return enabled(d) ? null : "disabled";
          });

      var select = this.selector.node();
      if (select.options[select.selectedIndex].disabled) {
        select.selectedIndex = 0;
      }
    }
  });


  var URLStore = mda.storage.URLStore = GenericStore.extend({
    eventLabel: "URLStore",
    statics: {
      defaults: mda.util.extend({}, GenericStore.defaults, {
        storageKey: "visdom.app.presets",
        promptLabel: "select a view:",
        replaceConfirmText: "Are you sure that you want to replace the preset '{name}'?",
      })
    }
  });

})(this);
