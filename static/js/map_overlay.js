colors = {
  blues    : ['rgb(247,251,255)','rgb(222,235,247)','rgb(198,219,239)','rgb(158,202,225)','rgb(107,174,214)','rgb(66,146,198)','rgb(33,113,181)','rgb(8,69,148)'],
  reds     : ['rgb(255,245,240)','rgb(254,224,210)','rgb(252,187,161)','rgb(252,146,114)','rgb(251,106,74)','rgb(239,59,44)','rgb(203,24,29)','rgb(153,0,13)'],
  greens   : ['rgb(247,252,245)','rgb(229,245,224)','rgb(199,233,192)','rgb(161,217,155)','rgb(116,196,118)','rgb(65,171,93)','rgb(35,139,69)','rgb(0,90,50)'],
  greys    : ['rgb(255,255,255)','rgb(240,240,240)','rgb(217,217,217)','rgb(189,189,189)','rgb(150,150,150)','rgb(115,115,115)','rgb(82,82,82)','rgb(37,37,37)'],
  purples  : ['rgb(252,251,253)','rgb(239,237,245)','rgb(218,218,235)','rgb(188,189,220)','rgb(158,154,200)','rgb(128,125,186)','rgb(106,81,163)','rgb(74,20,134)'],
  oranges  : ['rgb(255,245,235)','rgb(254,230,206)','rgb(253,208,162)','rgb(253,174,107)','rgb(253,141,60)','rgb(241,105,19)','rgb(217,72,1)','rgb(140,45,4)'],
  GnBu     : ['rgb(247,252,240)','rgb(224,243,219)','rgb(204,235,197)','rgb(168,221,181)','rgb(123,204,196)','rgb(78,179,211)','rgb(43,140,190)','rgb(8,88,158)'],
  RdBu     : ['rgb(178,24,43)','rgb(214,96,77)','rgb(244,165,130)','rgb(253,219,199)','rgb(209,229,240)','rgb(146,197,222)','rgb(67,147,195)','rgb(33,102,172)'],
  BuPu     : ['rgb(247,252,253)','rgb(224,236,244)','rgb(191,211,230)','rgb(158,188,218)','rgb(140,150,198)','rgb(140,107,177)','rgb(136,65,157)','rgb(110,1,107)'],
  BrBG     : ['rgb(140,81,10)','rgb(191,129,45)','rgb(223,194,125)','rgb(246,232,195)','rgb(199,234,229)','rgb(128,205,193)','rgb(53,151,143)','rgb(1,102,94)'],
  PiYG     : ['rgb(197,27,125)','rgb(222,119,174)','rgb(241,182,218)','rgb(253,224,239)','rgb(230,245,208)','rgb(184,225,134)','rgb(127,188,65)','rgb(77,146,33)'],
  PRGn     : ['rgb(118,42,131)','rgb(153,112,171)','rgb(194,165,207)','rgb(231,212,232)','rgb(217,240,211)','rgb(166,219,160)','rgb(90,174,97)','rgb(27,120,55)'],
  PuOr     : ['rgb(179,88,6)','rgb(224,130,20)','rgb(253,184,99)','rgb(254,224,182)','rgb(216,218,235)','rgb(178,171,210)','rgb(128,115,172)','rgb(84,39,136)'],
  RdGy     : ['rgb(178,24,43)','rgb(214,96,77)','rgb(244,165,130)','rgb(253,219,199)','rgb(224,224,224)','rgb(186,186,186)','rgb(135,135,135)','rgb(77,77,77)'],
  RdYlBu   : ['rgb(215,48,39)','rgb(244,109,67)','rgb(253,174,97)','rgb(254,224,144)','rgb(224,243,248)','rgb(171,217,233)','rgb(116,173,209)','rgb(69,117,180)'],
  RdYlGn   : ['rgb(215,48,39)','rgb(244,109,67)','rgb(253,174,97)','rgb(254,224,139)','rgb(217,239,139)','rgb(166,217,106)','rgb(102,189,99)','rgb(26,152,80)'],
  Spectral : ['rgb(213,62,79)','rgb(244,109,67)','rgb(253,174,97)','rgb(254,224,139)','rgb(230,245,152)','rgb(171,221,164)','rgb(102,194,165)','rgb(50,136,189)']
}

function parseKmlGeom(xml) {
  //$( ".result" ).html( data );
  var places = 0;
  var zipGeom = {};
  $(xml).find('Placemark').each( function() {
    var zip    = $(this).find('name').text();
    var points = $(this).find('coordinates').text();
    var coords = [];
    triples = points.split(/[\s]/);
    for(i=0;i<triples.length;i++) {
      var lla = triples[i].split(/[,]/); // lat,lon,alt
      coords.push(new google.maps.LatLng(lla[1],lla[0]));
    }
    zipGeom[zip] = coords;
  });
  return zipGeom;
}
            
function loadZipShapes(kml,callback) {
  $.get(kml, callback, 'xml');
}

function loadGeoJsonZcta(state) {
  $.getJSON( "static/%s.geojson" % state,
  function( data ) {
    alert(data);
  });

}

function renderZips(zipVals,map,colormap) {
  colormap = typeof colormap !== 'undefined' ? colormap : 'reds';
  cvals = colors[colormap];
  NULL_FILL_STYLE = { fillOpacity : 0.7, 
                      fillColor   : 'rgb(0,0,0)'
                      //strokeColor : 'rgb(255,0,0)',
                      //strokeWeight : 0.8             
                    }; // color used when the value is undefined
  var bads = [];
  var vals = [];
  // calibrate the scale to the max/min values
  for(zip in zipVals) {
    if(! isNaN(zipVals[zip])) {
      vals.push(zipVals[zip]);
    }
  }
  console.log(vals);
  // calculate max and min values while ignoring nulls (nulls have value 0 normally)
  var mx = Math.max.apply(Math, vals.map(function(o) {
    return o == null ? -Infinity : o;
  }));
  var mn = Math.min.apply(Math, vals.map(function(o) {
    return o == null ? Infinity : o;
  }));
  //mx = Math.max.apply(null,vals); // max value
  //mn = Math.min.apply(null,vals); // min value
  rng = mx - mn;                    // range
  console.log('max:' + mx + ' min:' + mn + ' rng:' + rng);
  for(zip in zipVals) {
    if(!zipToZcta[zip]) {
      bads.push(zip); // bad zip code
    } else {
      idx = Math.floor((zipVals[zip] - mn) / (rng*1.0001) * cvals.length);
      z = zipToZcta[zip];
      feature = map.data.zctaToFeature[z];
      if(feature) {
        feature.summaryValue = Number(zipVals[zip]).toPrecision(3);
        if(cvals[idx]) { fillStyle = { fillOpacity : 0.7, fillColor : cvals[idx] } } else { fillStyle = NULL_FILL_STYLE; }

        map.data.overrideStyle(feature, fillStyle );
      }
    }
  }
  //alert(bads);
}





