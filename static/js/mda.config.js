/**
 * Created by sam on 11/9/2016.
 */
mda.config = {
    // CA
    // map center lat, lon
    latlon : [37.5, -119.3],
    // map zoom level (higher is closer)
    zoom : 6,
    // shape file with geographies
    geojson : "CA_smaller.geojson",
    // data sources for which we should render the load shape visualization
    LOAD_SHAPE_sources : ["basics160k","SmartAC","PGEres","ohm"],
    // data source for which we should render the DR response estimate shapes
    RESPONSE_sources : ["ohm"]

    // VT
    // map center lat, lon
    //latlon : [43.8, -72.658],
    // map zoom level (higher is closer)
    //zoom : 8,
    // shape file with geographies
    //geojson : "VT_smaller.geojson"
};


