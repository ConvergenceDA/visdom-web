# MDA (Meter Data Analytics) JavaScript


## Conventions


### <a name="file-structure">#</a> File Structure
This directory contains all of the files necessary to connect to the data API,
render individual charts, and instantiate multi-chart applications. The "root"
JavaScript namespace is [mda](#mda), and is defined in `mda.js`. This means
that you *must* include `mda.js` before including any of the other `mda.*.js`
files.

Several other commonly used namespaces are defined in `mda.js`, reducing the
number of JavaScript files needed to perform basic tasks. All other namespaces
are defined in their own JavaScript files, using the naming convention
`mda.{namespace}.js`.


### <a name="classes">#</a> Classes
All traditional OOP classes are denoted by CamelCaps names, and are defined
using the [mda.Class](#mda.Class) meta-constructor. Some other conventions that
most classes follow:

* Public properties that do not affect state are accessed directly.
* Public accessor methods (for properties that do affect state) are prefixed
  with `get` and `set` (e.g. `.getFoo()`, `.setFoo(x)`).
* Asynchronous setters take an optional callback function as their last
  argument.
* Private and protected members are prefixed with `_`, since there are no good
  ways to define private functions without closures. (There are no specifically
  "protected" members, really: methods with the `_` prefix are considered
  private or "internal", and not part of the public API.)


### <a name="getter-setters">#</a> Getter-Setter Methods
This convention is based on the behavior of most of [D3]'s modules: functions
that return *configurable functions* with one or more inline accessor methods
that behave as both getters (when called without any arguments, which return
the value) and setters (when called with one or more arguments, which set the
value and return the configurable function for chaining). All of the
[mda.render](#mda.render) functions and many of the [mda.ui](#mda.ui) functions
follow this convention. You can recognize them in the code by the following
signature:

```js
mda.foo.bar = function() {
  var bar = {},
      baz = "baz";

  // getter-setter
  bar.baz = function(x) {
    if (!arguments.length) return baz;
    baz = x;
    return bar;
  };

  return bar;
};
```

**Note:** The [mda.api()](#mda.api_) and [mda.model()](#mda.model_) "classes"
do not return callable functions, but otherwise adhere to this convention by
returning objects with D3-style accessors.


## <a name="api">#</a> API Reference

* [mda.api](#mda.api) - Data API connector
* [mda.app](#mda.app) - Application classes
* [mda.cmp](#mda.cmp) - Data filter comparators: `mda.cmp.in()`, `notIn()`
* [mda.data](#mda.data) - Data transformations, e.g. `mda.data.table()`
* [mda.dom](#mda.dom) - DOM utility functions, e.g. `mda.dom.selectAncestor()`
* [mda.charts](#mda.charts) - Chart classes
* [mda.color](#mda.color) - Color scheme and scale definitions and classes
* [mda.filter](#mda.filter) - Data filter UI classes
* [mda.model](#mda.model) - Data model functions and classes
* [mda.render](#mda.render) - Low-level chart rendering functions
* [mda.storage](#mda.storage) - Client-side persistent storage drivers and classes
* [mda.ui](#mda.ui) - Common UI components and functions
* [mda.unit](#mda.unit) - Physical unit formatting and conversion functions
* [mda.util](#mda.util) - Async, browser, and other assorted utility functions

### <a name="mda">#</a> mda
The `mda` namespace is the root off which all of the MDA common functions and
classes hang, and is defined in [mda.js](mda.js).

See the [Simple Query API docs](https://bitbucket.org/sssllab/analytics_website/wiki/Simple%20query%20API)
for the server-side API.

### <a name="mda.api">#</a> mda.api
The `mda.api` namespace is a [function](#mda.api_), but also defines
API-specific functions.

#### <a name="mda.api_">#</a> mda.api()
The `mda.api()` function returns an API object that can be configured then used
to query the HTTP data API using the following [getter-setter](#getter-setters)
methods:

* **api.base(** [*baseUrl*] **)** returns the current API base URL (string,
  default: `/`) without any arguments, or sets it to *baseURL* and returns
  **api**.
* **api.dataSource(** [*source*] **)** returns the current data source (string,
  default: `basics160k`) without any arguments, or sets it to *source* and
  returns **api**.
* **api.get(** *uri*, *callback* **)** asynchronously fetches the URI *uri*
  (prepended with the current base URL) and calls the *callback* function when
  finished with a
  [error-first](http://fredkschott.com/post/2014/03/understanding-error-first-callbacks-in-node-js/)
  signature: `callback(error, response)`.
* **api.queryUri(** *query* **)** returns the full URI for the provided *query*
  object, according to the base URL.
* **api.query(** *query*, *callback* **)** performs an API query using the
  *query* object (or string) and calls `callback(error, response)` when
  finished.
* **api.query.shapes(** *query*, *callback* **)** performs a load shapes query
  using the *query* object (or string) and calls `callback(error, response)`
  when finished.
* **api.getColumns(** [*dataSource*,] *callback* **)** fetches the column
  listing for either the current data source or *dataSource* if provided, and
  calls `callback(error, columns)` when finished.
* **api.getColumnInfo(** [*dataSource*,] *callback* **)** fetches the column
  info (including data types and statistics) for either the current data source
  or *dataSource* if provided, and calls `callback(error, columnInfo)` when
  finished.
* **api.logger(** [*logger*] **)** gets or sets the current
  [logger](#mda.logger) instance for debugging API calls.

Some examples:

```js
// note: the default data source is "basics160k"
var api = mda.api();

// get the "basics" data source's column info
api.get("/query?/s/basics/colInfo", function(error, columns) {
  if (error) return console.error("couldn't get column info:", error);
  console.log("got column info:", columns);
});

// or:
api
  .dataSource("basics")
  .getColumnInfo(function(error, columns) { /* ... */ });

// get the cumulative sum data of the number of observations
api.query({
  columns: "nObs",
  sampling: {
    type: "thin",
    count: 100
  },
  cum: true
}, function(error, data) {
  if (error) return console.error("error:", error);
  var rows = mda.data.table(data);
});
```

*Tip:* See each of the [Chart](#mda.charts.Chart) subclasses's `fetch()` methods for
the API queries that they execute to get the data for specific views.

#### <a name="mda.api.filter">#</a> mda.api.filter
The `mda.api.filter` namespace contains utility functions for working with data
filters. There are two versioned filter formats; the "active" filter format is
determined by [mda.api.query.version()](#mda.api.query.version).

#### <a name="mda.api.query">#</a> mda.api.query
The `mda.api.query` namespace contains formatting functions for use with the
HTTP data API.

##### <a name="mda.api.query.format">#</a> mda.api.query.format( *query* )
Formats the *query* object as a string for use in data API URIs. The *query*
object is expected to have the structure:

```js
{
  source:   "dataSource", // default: "basics"
  columns:  [ /* array of column names */ ],
  filter:   { /* filter expression */ },
  agg:      { /* aggregate expression */ },
  cum:      true | false, // calculate the cumulative sum
  sampling: { /* resampling expression */ },
  asc:      "ascending expression", // ???
  desc:     "descending expression", // ???
  fmt:      "format expression", // ???
}
```

###### Filter Expressions
The `filter` key of a *query* object may either be a string (expected to adhere
to the API's filter format), an Array or an Object in the forms:

```js
[
  {column: "column1", value: "expr"},
  {column: "column2", value: ["expr", "expr"]}
  ...
]
// or
{
  column1: "expr",
  column2: ["expr", "expr"]
}
```

where `expr` is a valid filter expression, such as `>1.5` or `=5.0`.

###### Aggregate Expressions
Aggregate expressions in the `agg` key of a *query* object may either be a
string or an Object with a single key: the column on which to aggregate, the
value of which is the aggregation function. E.g.:

```js
{
  columns: ["foo", "bar"],
  agg: {foo: "sum"}
}
```

In the above example, `agg` could also be specified in string form as
`foo|sum`.

##### <a name="mda.api.query.version">#</a> mda.api.query.version( *version* )
Set the data API version, which determines how query and filter objects are
formatted in [mda.api.filter.format()](#mda.api.filter.format) and
[mda.api.query.format()](#mda.api.query.format). Acceptable versions are `1`
and `2`, the default is `2`. **Note: The version 1 API is deprecated, and
available only in git revisions before August, 2014.**

#### <a name="mda.Class">#</a> mda.Class
The Class function is a meta-constructor for defining traditional (OOP)
classes. Usage:

```js
var MyClass = mda.Class(ParentClass, {
  statics: {
    /* anything in here gets attached to MyClass as a "static" member */
  },

  mixins: [
    /* classes listed here have their prototype methods copied into
       MyClass.prototype */
  ],

  getFoo: function() { return this._foo; },
  setFoo: function(foo) { this._foo = foo; return this; },
  /* ... */
});
```

The *ParentClass* argument is optional; if only one argument is provided, it is
assumed to be the class definition object. Class definition objects may have
two special properties:

- **statics** is an object whose properties will be copied directly to the
  constructor function, and *not* to the prototype.
- **mixins** is an array of classes whose prototype methods should be copied to
  the new class's prototype.

All other properties in the class definition will be copied directly to the
class prototype.


#### <a name="mda.EventDispatch">#</a> mda.EventDispatch
The EventDispatch class is intended for use as a mixin with other classes. It
provides a simple event dispatching interface using [d3.dispatch](https://github.com/mbostock/d3/wiki/Internals#d3_dispatch).
Usage:

```js
var dispatch = new mda.EventDispatch("update", "error");
dispatch.on("error", handleError);
dispatch.on("update", onUpdate);
dispatch.off("error"); // stop listening to all "error" events
```

To use it as a mixin for another class, do this:

```js
// the "events" member in a prototype gets passed down to the EventDispatch
// class, which lazily creates a d3.dispatch()
var MyClass = mda.Class({
  mixins: [mda.EventDispatch],
  events: ["error", "update"]
});

var instance = new MyClass();
// here, "foo" is the optional listener namespace
instance.on("error.foo", function(error) {
  console.error("error:", error);
});

// internally, the instance may call this.trigger() to dispatch an event,
// or it can be done publicly:
instance.trigger("error", "bar");
// calls: console.error("error:", "bar");
```

Having to declare which event types will be dispatched ahead of time is
required by D3, but it's also good practice!

*NOTE:* One major caveat to D3's implementation is that listeners are
*exclusive* unless you "namespace" your event type by appending `.{namespace}`
to it in your calls to **dispatch.on()** and **dispatch.off()**. This means
that listeners without a namespace will likely be overwritten if other pieces
of code want to be notified, so most UI components listen for events that are
namespaced accordingly.

### <a name="mda.app">#</a> mda.app
The `mda.app` namespace is primarily the home of the `mda.app.MultiChartApp`
class, which is used to instantiate the fully interactive multi-chart web
application, and all of its associated configuration utilities.

#### <a name="mda.app.MultiChartApp">#</a> mda.app.MultiChartApp
The MultiChartApp class provides the full user interface for a single-page
JavaScript application that hosts multiple chart types, an interactive
filtering UI, and other components generally referred to together as the
*Feature Browser*. Usage:

```js
var app = new mda.app.MultiChartApp(root, options);
app.start();
```

See [js/charts.js](charts.js) for real-world usage. **app** instances have the
following public methods:

* **app.start()** - kick off the URL hash checks and model initialization to
  start the app. Nothing will be displayed until you call this method.
* **app.getState()** - get the current app state
* **app.setState(** *state* [, *callback*] **)** - set the app's *state*,
  overwriting any other state properties, and optionally call the *callback*
  function when finished updating.
* **app.mergeState(** *state* [, *callback*] **)** - merge properties of the
  *state* object into the current app state, and optionally call the *callback*
  function when finished updating.
* **app.debugState(** [*logger*] **)** - debug the current app state,
  optionally providing a *logger* object with a console-like API, a la
  *logger.debug(\*args)*.

###### Useful App Properties
An **app** instance also has the following properties, which can be inspected
in the console:

* **app.api** - an [mda.api](#mda.api_) instance.
* **app.model** - the [Model](#mda.model.Model) instance, which can be queried
  for column metadata (e.g. `app.model.column("column_id")`).
* **app._state** - the ("private") app state, which *should* always be reflected
  in the URL.
* **app.selectedChart** - the selected chart *type* (among **app._charts**)
* **app.selectedChart.instance** - if **app.selectedChart** is not `null`, it
  will have a [Chart](#mda.charts.Chart) instance.
* **app.filters** - the [FilterList](#mda.filters.FilterList) instance used to
  display and control data filters.
* **app.hash** - the [hashable.hash()](http://shawnbot.github.io/hashable/api/#hashable.hash)
  instance used to save and restore state in the URL hash.

###### MultiChartApp Options
In the constructor, the *root* argument is a string or object that can be coerced into a D3 selection by [mda.dom.coerceSelection](#mda.dom.coerceSelection). The optional *options* object may contain the following keys:

* **charts** - an array of chart types, as in `mda.app.MultiChartApp.types`
* **chartTypes** - a selector for the chart types listing, assumed to be a `ul` or `ol` element
* **chartRoots** - a selector for the DOM root at which `div` elements for each chart will be attached
* **state** - the (optional) initial app state, as an object
* **filters** - an optional object containing [mda.filter.FilterList](#mda.filter.FilterList) options. If this isn't provided, no filter list UI will be initialized.
* **filterStore** - an optional [mda.storage.FilterStore](#mda.storage.FilterStore) instance to use for persisting custom filters
* **hashFormat** - the hash format as used by [hashable](http://shawnbot.github.io/hashable/), which defaults to `{source}/{chart}?` (this is how app state is saved and restored in the URL, via the #hash)
* **dataSourceInput** - a selector (or [coerceable](#mda.dom.coerceSelection)) for the data source input
* **api** - an optional [mda.api](#mda.api) instance
* **logger** - an optional [mda.logger](#mda.logger) instance

Note: **app** objects have lots of *technically* public methods, but none were
intended to be called externally. MultiChartApp instances are intended to run
themselves, and do not dispatch events of their own.

##### App Event Flow
Events flow between several classes during both the initialization of and
interaction with MultiChartApp's visual interface. You can track events in the
Chrome dev tools console by either filtering on the string "events" or looking
at only the debug messages.

###### Initialization
Here is an approximate timeline of events during the MultiChartApp
initialization phase:

1. The app queries the API for data sources, and sets the defaults for its
   state according to whichever data source is first in the list.
1. The app performs its first URL check (via [hashable](http://shawnbot.github.io/hashable/))
   and sets the model's data source, which kicks off the loading of column
   info. This also results (also via hashable) in a call to
   `MultiChartApp#onHashChange()`, which updates the app's state according to
   the URL hash. Most importantly, the side effects of this function are that:
   * The model's data source may be changed again, if the value parsed
     from the URL differs (which it won't the first time).
   * The selected chart may change, which will result in the creation of a
     new [Chart](#mda.charts.Chart) if the named chart hasn't been created
     yet. Otherwise, DOM elements will simply be shuffled around to bring
     the selected chart's container to the foreground.
1. The [model](#mda.model.Model) triggers an `invalidate` event to let its
   listeners know that the previous data source is invalid.
1. Once the column metadata is loaded via the [api](#mda.api), the model
   fires off a `change` event, which:
   1. calls `MultiChartApp#onModelChange()`, which *clears the filters* and, if
      there is a selected chart, unsets the `filter` property of its state and
      updates its form's column selectors; and
   1. calls `FilterList#onModelChange()`, which updates the list of available
      columns in its "staged" filter column selector (the drop-down menu).
1. The app then performs its first update (via `MultiChartApp#update()`), and
   performs some additional checks to revert the chart's state to its default
   if there was an error. The resulting state is then serialized to the URL
   hash.
   1. App updates call the selected [chart](#mda.charts.Chart)'s `setState()`
      and `update()` methods.

###### State Updates
Updates to the application (and shared) state can happen in a number of ways:

1. The user interacts with the filter UI or chart controls
1. The user changes the data source
1. The URL hash changes (either via the [URLStore](#mda.storage.URLStore) or the browser history)

In theory, all of these mechanisms should result in a shared state between the
various components: the model's data source and column metadata should match
the state's `source` property, the filter UI should reflect the state's
`filter` property, the selected chart should reflect the `chart` property, and
so on.

See `MultiChartApp#update()` to get a better sense of what happens during state
updates. You should be able to call **app.setState()** or **app.mergeState()**
from the dev tools console, then **app.debugState()** when the process finishes
to ensure that everything was committed properly.

### <a name="mda.charts">#</a> mda.charts
This is where all of the chart-specific classes live. Each of these subclasses
the [mda.charts.Chart](#mda.charts.Chart) class.

#### <a name="mda.charts.Chart">#</a> mda.charts.Chart
The abstract `mda.charts.Chart` class, and each of its subclasses, has the
following constructor signature:

```js
var chart = new mda.charts.Chart(root, options);
```

###### <a name="mda.charts.Chart.options">#</a> Chart Options
Common chart options include:

- **api** is an optional [mda.api](#mda.api) instance; the default is to create a new one for each chart
- **model** is an optional [mda.model](#mda.model) instance; the default is to create a new one for each chart
- **width** and **height** determine the rendered width and height of the chart in a fixed layout, or the *aspect ratio* in a flexible width layout.
- **padding** is typically defined as a 4-element array: `[top, right, bottom, left]`, which determines the amount of space around the chart's content (or, in many cases, the amount of space dedicated to axis labels)
- **tooltip** (an object) is passed along as the options to a chart's [mda.ui.Tooltip](#mda.ui.Tooltip) instance, where applicable
- **state** determines the initial state of the chart. Subclasses are responsible for defining state-specific functionality, such as symbology and axis labeling. Furthermore, most charts also pass along the following state keys to data API calls:
    - **filter** - the data filter

###### Chart Methods
Public methods for all Chart (and subclass) instances include:

* **chart.resize()** - resize the chart's graphics according to the available area
* **chart.getState()** - get the chart's state as an object
* **chart.setState(** *state* **)** - set the chart's state, synchronously
* **chart.load(** *callback* **)** - load data by calling **chart.fetch()** and toggle display classes on the chart's root element (`loading` while loading) and triggering events (`load` on success, `error` on error) as necessary.
* **chart.getData()** - get the chart's dat
* **chart.setData(** *data* **)** - set the chart's data, synchronously. The input *data* is expected to be in the form that it would appear when fetched via the HTTP data API. Subclasses *should* override this method to perform any necessary transformations.
* **chart.render()** - render the chart with its current data, synchronously. Subclasses *must* implement this method, otherwise an exception is thrown.
* **chart.fetch(** *callback* **)** - asynchronously load the chart's data according to its current state, and call the *callback* function when finished. Subclasses *must* implement this method, otherwise an exception is thrown.
* **chart.update(** *callback* **)** - update the chart by fetching and setting its data, then rendering when finished. The order of operations is: **chart.load()**, then **chart.setData()**, then finally **chart.render()**.

#### <a name="mda.charts.CumSum">#</a> mda.charts.CumSum
The CumSum chart is a line chart that shows *cumulative sums* of values across a population. Usage:

```js
var chart = new mda.charts.CumSum(root, options);
```

See the [standalone chart prototype](../test/cumsum.html) for example usage.

###### CumSum Options
The following options are available in addition to the [common chart options](#mda.charts.Chart.options):

- **chart** (element) - optionally defines the parent element onto which the chart's SVG element should be attached. The default is to create a new `<svg>` element and append it to the chart's container.
- **table** (element) - optionally defines the parent element of the quantile table display. The default is to create a new `<table>` element and append it to the chart's container.
- **cursor** (Boolean, default: `true`) - determines whether the interactive cursor should be shown and the table updated on mouse move
- **positionTable** (Boolean, default: `true`) - toggles the absolute positioning of the quantile table. The **padding** option's right and bottom components will be used to position the table in the lower right corner of the container.

###### CumSum State
- **samples** (Number, default: 100) - the number of steps in the cumulative sum. The default of 100 ensures that each step corresponds to a single percentage point.
- **y** (String, default: `nObs`) - the column id of the y-axis value. The column reference is obtained via the chart instance's [model](#mda.model) instance.
- **pct** (Boolean, default: `false`) - toggles the display of y-axis values in relative percentages, rather than the **y** column's native units.

#### <a name="mda.charts.Histogram">#</a> mda.charts.Histogram
The Histogram chart is a bar chart that shows the distribution of values in a population. Usage:

```js
var chart = new mda.charts.Histogram(root, options);
```

See the [standalone histogram prototype](../test/histogram.html) for example usage.

###### Histogram Options
The following options are available in addition to the [common chart options](#mda.charts.Chart.options):

- **chart** (element) - optionally defines the parent element onto which the chart's SVG element should be attached. The default is to create a new `svg` element and append it to the chart's container.

###### Histogram State
- **bins** (Number, default: 50) - the number of bins to display on the x-axis.
- **x** (String, default: `nObs`) - the column id of the x-axis value. The column reference is obtained via the chart instance's [model](#mda.model) instance.
- **cum** (Boolean, default: `false`) - whether to display bars with cumulative values (increasing from left to right)
- **area** (Boolean, default: `false`) - whether to display an additional area chart on top of the bars
- **interp** (String, default: `none`) - the D3 [line interpolation] to use when rendering the area chart

#### <a name="mda.charts.ScatterPlot">#</a> mda.charts.ScatterPlot
The Scatter Plot chart plots a variable number of samples on two linear axes (*x* and *y*), and can optionally color each sample using a third aspect of the data. Usage:

```js
var chart = new mda.charts.ScatterPlot(root, options);
```

See the [standalone scatter plot prototype](../test/scatter.html) for example usage.

###### ScatterPlot Options
The following options are available in addition to the [common chart options](#mda.charts.Chart.options):

- **chart** (element) - optionally defines the parent element onto which the chart's SVG element should be attached. The default is to create a new `svg` element and append it to the chart's container.
- **legend** (mixed, default: `true`) - whether to display the legend; alternately, this may be an instance of [mda.charts.Legend](#mda.charts.Legend) or an element (a CSS selector, element reference or D3 selection). If falsy, no legend will be rendered.
- **fill** (mixed, default: none) - an optional fill value or function for the [scatter plot renderer](#mda.render.scatter), *used only if no **color** state variable is set*.

###### ScatterPlot State
- **x** (String, default: none) - the id of the x-axis column
- **y** (String, default: none) - the id of the y-axis column
- **color** (String, default: none) - the id of the data source column to be used for coloring each sample point
- **scheme** (String, default: `divergent`) - the color scheme to use; permissible values are `divergent`, `linearBkRd`, `linearWtRd`, `category`, `greens`, `oranges`, or `spectral` (as defined in `mda.charts.ScatterPlot.colorSchemes`).
- **samples** (Number, default: 300) - the number of samples to display, chosen at random via the data API.

#### <a name="mda.charts.LoadShapes">#</a> mda.charts.LoadShapes
The Load Shapes chart is a small multiples display that arranges multiple load shape charts in a rectangular area. Usage:

```js
var chart = new mda.charts.LoadShapes(root, options);
```

See the [standalone chart prototype](../test/load-shapes.html) for example usage.

###### LoadShapes Options
The following options are available in addition to the [common chart options](#mda.charts.Chart.options):

- **legend** (element) - the optional parent element on which the legend will be attached
- **legendTitle** (String, default: `Categories`) - the legend title

###### LoadShapes State
- **sort** (String, default: `kwh`) - the dimension on which to sort, either `kwh` or `members`
- **count** (Number, default: 9) - the number of load shapes to show

#### <a name="mda.charts.Map">#</a> mda.charts.Map
The Map chart displays geographically aggregated data on a map using [Leaflet](http://leafletjs.com). Usage:

```js
var map = new mda.charts.Map(root, options);
```

The Map requires two additional data sources to display shapes: a collection of geographic features (boundary shapes), and a lookup that maps Zip Code Tabulation Area (ZCTA) codes to zip codes. The Map class provides methods for loading both of these by URL and for setting them directly:

See the [standalone map prototype](../test/map.html) for example usage.

- **map.setFeatures(** *collection* **)** - sets the list of geographic features to display on the map as a [GeoJSON FeatureCollection]
- **map.loadFeatures(** *url* [, *callback* ] **)** - load the list of geographic features from *url*, set them with **map.setFeatures()**, then call the optional *callback* function when finished
- **map.setZctaLookup(** *lookup* **)** - set the Zip Code Tabulation Area lookup table (ZCTA to zip)
- **map.loadZctaLookup(** *url* [, *callback* ] **)** - load the ZCTA lookup from *url*, set it with **map.setZctaLookup()**, and call the optional *callback* function when finished

*Note: if Leaflet is not available via the global `L` JavaScript variable at runtime, this class will not be defined.*

###### Map Options
The following options are available in addition to the [common chart options](#mda.charts.Chart.options):

- **map** defines additional options to Leaflet's [L.map() constructor](http://leafletjs.com/reference.html#map-l.map)
- **legend**, if provided, triggers the creation of a [legend](#mda.charts.Legend) with this object as it options

###### Map State
- **column** (String, default: none) - the id of the column to map
- **agg** (String, default: `mean`) - the aggregation method: `sum`, `mean` or `count`
- **color** (String, default: `GnBu`) - the color scheme identifier, as passed to [mda.color.scheme()](#mda.color.scheme)
- **steps** (Number, default: 7) - the number of discrete steps (bins) in the color scale

#### <a name="mda.charts.SortedValues">#</a> mda.charts.SortedValues
*TODO*

#### <a name="mda.charts.TabularValues">#</a> mda.charts.TabularValues
*TODO*

#### <a name="mda.charts.Legend">#</a> mda.charts.Legend
The Legend class is used by several charts to describe the numeric boundaries of colors and color ranges. It is *not* a subclass of [mda.charts.Chart](#mda.charts.Chart), but does dispatch events. Usage:

```js
var legend = new mda.charts.Legend(root, options);
```

Legend instances have the following methods:

- **legend.on(** *event*, *callback* **)** - register a listener for `hilite` events, e.g. `legend.on('hilite', function() { ... });`
- **legend.update(** *state* **)** - update the legend with the *state* object, which is assumed to have the following properties:
    - **state.scheme** - the [color scheme](#mda.color.Scheme) instance
    - **state.column** - a reference to a data column object, which is assumed to have a **format()** function, **type** and **units**. (Other column types may require additional properties, but these are set automatically by [mda.model](#mda.model) instances.
    - **state.values** - two or more values to display as legend items. These will be passed to **state.scheme.getSteps()** to generate display items.
    - **state.steps** - the number of distinct color steps ("stops"), which act as the second argument to **state.scheme.getScale()**.
    - **state.agg** - the aggregation method, which determines how values are formatted.


###### Legend Options
- **title** (String, default: `legend`) - the legend title


### <a name="mda.color">#</a> mda.color
Includes the [colorbrewer](http://colorbrewer.org/) color schemes (modified
slightly), and defines color scheme classes such as the `mda.color.Scheme`, a
quantized color scheme constructor on which the linear, divergent and
categorical schemes are based.

#### <a name="mda.color.brewer">#</a> mda.color.brewer
The `mda.color.brewer` namespace contains all of D3's [Color Brewer] schemes,
minus "Paired", which is not relevant for the Feature Browser.

#### <a name="mda.color.scheme">#</a> mda.color.scheme
The shorthand `mda.color.scheme()` function returns an
[mda.color.Scheme](#mda.color.Scheme) instance based on its arguments:

```js
var scheme = mda.color.scheme(colors, type, options);
```

- *colors* is either a string (e.g., `GnBu` or `Set1`) or an array of color values
- the optional *type* is one of `linear`, `category`, `quantize` or undefined
- the optional *options* object is passed through to the scheme's constructor

#### <a name="mda.color.Scheme">#</a> mda.color.Scheme
The base `mda.color.Scheme` class represents a quantized color scale with
custom colors. Usage:

```js
var scheme = new mda.color.Scheme(colors, options);
```

Where *colors* is an array of color values (CSS color strings, including named
colors) and *options* is an optional object to store in the instance's
`options` member.

Some examples:

```js
// the base class represents a quantized color scheme, with no interpolation
// between color values
var quantize = new mda.color.Scheme(["red", "white", "blue"]),
    scale = quantize.getScale([-100, 0, 100]);

scale(-100); // "red"
scale(-50); // "red"
scale(0); // "white"
scale(50); // "blue"
scale(100); // "blue"

// linear color scales, though, are interpolated, and will produce hex colors
var linear = new mda.color.LinearScheme(["red", "white", "blue"]),
    scale = linear.getScale([-100, 0, 100]);

scale(-100); // "#ff0000"
scale(-50); // "#ffbfbf"
scale(0); // "#ffffff"
scale(50); // "#8080ff"
scale(100); // "#0000ff"

// divergent scales are really just linear scales with the added ability to
// define a fixed "midpoint", the default of which is the median of the values
// provided to getScale():
var divergent = new mda.color.DivergentScheme(["red", "white", "blue"], {
  midpoint: d3.functor(0) // always set 0 as the midpoint
});
var scale = divergent.getScale([-100, 10]);

scale.range(); // ["#ff0000", "#ffffff", "#0000ff"]
scale.domain(); // [-100, 0, 10]
```

##### Color Scheme Methods
- **scheme.getScale(** *values* **)** - get a scale function that returns a
  color for a given value based on the extent of the *values* array
- **scheme.getSteps(** *values* [, *steps* ] **)** - get an array of discrete
  steps (for a legend, for instance) along the scale of this color scheme,
  based on an array of numeric *values* and an optional number of *steps*. If
  *steps* is not provided, the constructor's *colors* array is used.
- **scheme.splitExtent(** *extent*, *steps* **)** - this is a utility function
  for subclasses used to generate a range of values within a 2-element numeric
  *extent* that is exactly *steps* elements long.
- **scheme.splitColors(** *colors*, *steps* **)** - like **splitExtent()**, but
  this utility function returns a range of *colors* (rather than values).

#### <a name="mda.color.LinearScheme">#</a> mda.color.LinearScheme
A linear scheme creates scales that interpolate colors between the values of
the domain. So, while the quantized scale returned by `mda.color.Scheme` will
always return one of the colors in its constructor array, a linear scale will
always return an interpolated hex color.

#### <a name="mda.color.DivergentScheme">#</a> mda.color.DivergentScheme
A divergent scheme is simply a linear scheme with a configurable midpoint, the
default of which is the median of the provided values. The **midpoint**
constructor option should be either a number (e.g., 0) or a function.

```js
var div1 = new mda.color.DivergentScheme(["red", "white", "blue"], {
  midpoint: 0
});

var div2 = new mda.color.DivergentScheme(["red", "white", "blue"], {
  midpoint: function(values) {
    return d3.mean(values);
  }
});
```

#### <a name="mda.color.CategoricalScheme">#</a> mda.color.CategoricalScheme
A categorical scheme creates scales that return a unique value in the colors
array provided to the constructor for each unique value. In other words, it's a
thin wrapper around [D3's ordinal scales](https://github.com/mbostock/d3/wiki/Ordinal-Scales).


### <a name="mda.filter">#</a> mda.filter
Defines the `mda.filter.FilterList` class, which drives the UI for adding and
removing chart- and application-wide filters. The constructor is called like
so:

```js
var filterList = new mda.filter.FilterList(root, options);
```

*TODO: example*

### <a name="mda.model">#</a> mda.model
For mainly historical reasons, this module is also a function. The
[mda.model()](#mda.model_) function returns a "low-level" data model, whereas the more
user-friendly (and OOP-styled) [mda.model.Model](#mda.model.Model) class can asynchronously update its own column listings and dispatch events whenever its data source is changed.

#### <a name="mda.model_">#</a> mda.model()
Low-level data models are containers for data source-specific column metadata.

*TODO: explain where column metadata gets created and how to get it*

#### <a name="mda.model.Model">#</a> mda.model.Model
*TODO*

### <a name="mda.render">#</a> mda.render
All of the rendering functions in this namespace are designed to be
[called](https://github.com/mbostock/d3/wiki/Selections#call) on D3 selections
(or transitions) using either static or [bound data](https://github.com/mbostock/d3/wiki/Selections#data),
hence their lowercase names (a D3 convention).

*TODO: explain how charts delegate rendering to these functions*

#### <a name="mda.render.axis">#</a> mda.render.axis()
The `mda.render.axis()` generator is a drop-in replacement for `d3.svg.axis()`
with added support for axis labeling. **axis** functions have the following
additional methods:

- **axis.label(** [*label*] **)** - get or set the axis label text (or function)
- **axis.margin(** [*margin*] **)** - get or set the axis margin in pixels

#### <a name="mda.render.cumsum">#</a> mda.render.cumsum()
Creates a cumulative sum rendering function for use with a D3 selection or transition.

*TODO*

#### <a name="mda.render.cumsum.cursor">#</a> mda.render.cumsum.cursor()
Creates a cumulative sum **cursor** rendering function for use with a D3 selection or transition.

*TODO*

#### <a name="mda.render.scatter">#</a> mda.render.scatter()
Creates a scatter plot rendering function for use with a D3 selection or transition.

*TODO*

#### <a name="mda.render.histogram">#</a> mda.render.histogram()
Creates a histogram rendering function for use with a D3 selection or transition.

*TODO*

#### <a name="mda.render.loadShape">#</a> mda.render.loadShape()
Creates a load shape rendering function for use with a D3 selection or transition.

*TODO*

#### <a name="mda.render.loadShape">#</a> mda.render.loadShape()
Creates a load shape rendering function for use with a D3 selection or transition.

*TODO*



### <a name="mda.storage">#</a> mda.storage
This namespace defines client-side storage drivers for persistent user
preferences, such as custom filters.

### <a name="mda.ui">#</a> mda.ui
This namespace defines common UI functions in a D3 style.

#### <a name="mda.ui.select">#</a> mda.ui.select()
Creates a D3 selection operator that updates a `<select>` input to contain the
relevant options. The returned **select** function has the following accessor
methods:

* **select.options(** [*options*] **)** gets or sets the list of `<option>`
  values.
* **select.groups(** [*groups*] **)** gets or sets the list of `<optgroup>`
  values, and supercedes options.
* **select.label(** [*accessor*] **)** gets or sets the label *accessor*
  function for each option.
* **select.value(** [*accessor*] **)** gets or sets the value *accessor*
  function for each option.
* selection.call( **select.set**, *value* ) sets the `selected` attribute on
  the appropriate `<option>`, according to the *value* function or literal.

#### <a name="mda.ui.element">#</a> mda.ui.element( *selection* [, *element* [, *before* ] ] )
Convenience method for sub-selecting *element* from *selection* and creating it
if the subselection is empty. *element* should be either an element name or CSS
selector in the form `element.class`. The optional *before* selector causes the
subselection to be inserted before the specified element (using
`selection.insert(element, before)`); if not provided, the element is appended
to the end of *selection*.

#### <a name="mda.ui.form">#</a> mda.ui.form()
Returns a low-level HTML form helper function that can be used to sync data
values between an object and one or more DOM elements. Example:

```js
var form = mda.ui.form()
  .on("change", function(data) {
    console.log("form data:", data);
  });

// calling on a selection sets input values
d3.select("form")
  .call(form);

// set any input with name="foo" to value "bar"
selection.call(form.set, "foo", "bar");

// alternately:
form.set(selection, "foo", "bar");

// or, just set data.foo = "bar" without applying changes to the DOM:
form.set("foo", "bar");
```

The **form** function maintains its own *data* object internally, and has the following methods:

* **form(** *selection* **)** (i.e. `selection.call(form)`) sets all of the form input values according to the current data
* **form.get(** *key* **)** gets the current value of the named data *key*
* **form.set(** *key*, *value* **)** sets the value of the named data *key*; or, if *key* is an object, copies values from that object to the data
* **form.data(** [*data*] **)** gets or sets the current *data*
* **form.read(** *selection* **)** (i.e. `selection.call(form.read)`) reads the values of all of the form fields from *selection* into the data object

#### <a name="mda.ui.Form">#</a> mda.ui.Form
The Form class renders an HTML form with custom fields, dispatches events when
changed, and can get and set its form values programmatically.

```js
var form = new mda.ui.Form({
  fields: [
    {name: "foo", type: "text"},
    {name: "bar", type: "select", options: [1, 2, 3]},
    ...
  ]
});

form.on("change", function(data, key, value) {
  console.log("form changed:", key, "=", value);
});
```

Form instances have the following public methods:

* **form.get(** *key* **)** gets the current value of the named data *key*
* **form.set(** *key*, *value* **)** sets the value of the named data *key*;
  or, if *key* is an object, copies values from that object to the data
* **form.updateVisibleFields()** updates each field's visibility according to
  its `visible` property

#### <a name="mda.ui.Tooltip">#</a> mda.ui.Tooltip
The Tooltip class displays an HTML tooltip. Usage:

```js
var tooltip = new mda.ui.Tooltip(options);
```

Tooltip *options* may include:

- **position** defines the position of the tooltip relative to the element it's
  describing: `top`, `bottom` (the default), `left` or `right`
- **offset** defines the pixel distance between the content element and the
  tooltip's triangular "nub"
- **klass** optionally adds a class to the tooltip's container element

Tooltip instances have the following methods:

- **tooltip.show()** - shows the tooltip
- **tooltip.hide()** - hides it
- **tooltip.attachTo(** *parent* **)** - attaches the tooltip's container
  element to *parent*, provided as a CSS selector, element reference or D3
  selection
- **tooltip.remove()** - removes the tooltip's container from the DOM
- **tooltip.moveTo(** *x*, *y* [, *relativeTo*] **)** - sets the tooltip's
  position on screen using pixel coordinates *x* and *y*, optionally relative
  to the provided *relativeTo* element
- **tooltip.visible()** - returns `true` or `false` to indicate its current
  visibility
- **tooltip.toggle()** - toggles the tooltip's visibility
- **tooltip.setContent(** *content* [, *isHTML* ] **)** - set the tooltip's
  *content* text (or HTML, if *isHTML* is truthy), and update its position
- **tooltip.updatePosition()** - update the tooltip's absolute position based
  on its orientation and the most recent call to **tooltip.moveTo()**

### <a name="mda.unit">#</a> mda.unit
This namespace provides functions for converting and displaying (formatting)
physical units, such as kilowatt-hours (kWh).

#### <a name="mda.unit.format">#</a> mda.unit.format( [*format*] )
This is the general-purpose unit format generator, which takes an optional
*format* function or specifier a la [d3.format()](https://github.com/mbostock/d3/wiki/Formatting#d3_format).
**format** functions have the following getter-setter methods:

- **format.suffix(** [*suffix*] **)** - get or set the format suffix string
- **format.scale(** [*scale*] **)** - get or set the format SI scale, as in
  [d3.formatPrefix()](https://github.com/mbostock/d3/wiki/Formatting#d3_formatPrefix)
- **format.multiply(** [*factor*] **)** - get or set the fixed factor by which
  input values should be multiplied before displaying
- **format.round(** [*function*] **)** - get or set the rounding *function*,
  or use `Math.round()` if *function* is `true`
- **format.space(** [*space*] **)** - get or set the space separator string
  between the formatted value and its SI prefix.
- **format.copy()** - copy the formatting function

#### <a name="mda.unit.wattFormat">#</a> mda.unit.wattFormat( [*format*] )
Create a formatting function for watt values with the `W` suffix.

#### <a name="mda.unit.kilowattFormat">#</a> mda.unit.kilowattFormat( [*format*] )
Create a formatting function for watt values that reformats them as kilowatts.

#### <a name="mda.unit.percentFormat">#</a> mda.unit.percentFormat( [*format*] )
Create a formatting function for numeric values with a `%` suffix.

#### <a name="mda.unit.coerce">#</a> mda.unit.percentFormat( *unit* )
Get the named *unit* spec by looking it up in `mda.unit.types`.

#### <a name="mda.unit.rangeFormat">#</a> mda.unit.rangeFormat( [*format*] )
Create a formatting function for a range of values, provided as a 2-element
array:

```js
var format = mda.unit.rangeFormat(".2f");
format([0.5, 0.1]) // -> "0.50 - 0.10"
```

**rangeFormat** functions have the following getter-setter methods:

- **rangeFormat.left(** [*format*] **)** - get or set the left-hand (minimum)
  format specifier or function.
- **rangeFormat.right(** [*format*] **)** - get or set the right-hand
  (maximum) format specifier or function.
- **rangeFormat.glue(** [*glue*] **)** - get or set the glue string placed
  between the formatted left and right values, the default of which is `" - "`.

### <a name="mda.util">#</a> mda.util
This namespace includes miscellaneous utility functions:

#### <a name="mda.util.debounce">#</a> mda.util.debounce( *function*, *wait* )
Returns a [debounced](http://davidwalsh.name/javascript-debounce-function)
version of *function* that executes after *wait* milliseconds and cancels the
previous call. This is useful for async functions with side affects that would
cause problems if multiple calls would produce an inconsistent state.

```js
var updateStatus = mda.util.debounce(function(url, callback) {
  return d3.json("status.json", callback);
}, 100);

updateStatus();
updateStatus();
// the anonymous function will only be called once after 100ms
```

#### <a name="mda.util.extend">#</a> mda.util.extend( *object*, [, *extension* [, ... ] ] )
Extend an *object* by copying properties from one or more *extension* objects.
This is often used to preserve class option defaults.

#### <a name="mda.util.rebind">#</a> mda.util.rebind( *child*, *parent* [, *methodNames* ] )
Transparently copy d3-style [getter/setter methods](#getter-setters) from
*parent* to *child*, optionally providing a whitelist of *methodNames* as an
array.

#### <a name="mda.util.configure">#</a> mda.util.configure( *object*, *config* )
Configure an *object* with [d3-style getter-setter methods](#getter-setters)
using a *config* object whose keys map to accessor method names.

#### <a name="mda.util.getVendorSymbol">#</a> mda.util.getVendorSymbol( *obj*, *method* )
Get the browser vendor-specific symbol (property) name for *obj* that
implements a specific W3C *method*.

#### <a name="mda.util.diff">#</a> mda.util.diff( *a*, *b* )
Compute the difference between keys (properties) in two objects *a* and *b*.
The return value is an object with a key for each one that differs, the value
of which describes the difference.

#### <a name="mda.util.deepEqual">#</a> mda.util.deepEqual( *a*, *b* )
Compare two objects, *a* and *b*, and return `true` if and only if all of
*b*'s keys compare equally (calling recursively) with *a*'s, otherwise
`false`.

#### <a name="mda.util.abortable">#</a> mda.util.abortable( *function* [, *abortFunction* ] )
Create an abortable version of *function*, which will call the optional
*abort* function before subsequent calls. This allows you to create async
functions (such as JSON requests) that are guaranteed not to overlap.

#### <a name="mda.util.monkeyPatchHashable">#</a> mda.util.monkeyPatchHashable( *hashable* )
This function monkey-patches [hashable] so that spaces escape sequences
(`%20`) aren't replaced with `+`, and augments its query string parsing
function to pre-encode literal `+` characters as `%2B`. This is for Firefox
compatibility.

#### <a name="mda.util.unformat">#</a> mda.util.unformat( *format* )
Create a wrapped version of formatting function *format* that has no suffix
and strips non-numeric characters from the end of the formatted string.

[D3]: http://d3js.org
[line interpolation]: https://github.com/mbostock/d3/wiki/SVG-Shapes#line_interpolate
[GeoJSON FeatureCollection]: http://geojson.org/geojson-spec.html#feature-collection-objects
[API docs]: https://bitbucket.org/sssllab/analytics_website/wiki/Simple%20query%20API
[Color Brewer]: http://colorbrewer2.org/
[hashable]: http://shawnbot.github.io/hashable/
