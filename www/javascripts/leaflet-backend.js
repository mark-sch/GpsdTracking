
/* this javascript is call from list-in-table.html
 * it resquest GpsdTracking GeoJsonRest adapter to get
 * the list of active devices and push on page table.
 * 
 * Refrences: 
 * https://github.com/lvoogdt/Leaflet.awesome-markers
 * http://leafletjs.com/examples/geojson.html
 * http://leafletjs.com/examples/sample-geojson.js
 * 
 */


function GetDevList(map) {
        
    function DevListCB (geojsonFeature) {
    // check if response is a valid GeoJson object
    if (geojsonFeature.type !== 'FeatureCollection') {
      // do something
      console.log ("HOOPS: Ajax AIP did not return a GeoJson FeatureCollection")
      return;
    }
    
    var redMarker = L.AwesomeMarkers.icon({
      icon: 'coffee',
      markerColor: 'orange',
      prefix: 'fa',
      iconColor: 'red'
     
    });
    
    var baseballIcon = L.icon({
	iconUrl: 'javascripts/images/baseball-marker.png',
	iconSize: [32, 37],
	iconAnchor: [16, 37],
	popupAnchor: [0, -28]
    });

    // For each position we add a popup with device name
    function onEachFeatureCB(feature, layer) {
        var popupContent='Devid='+ feature.id +' Name='+feature.properties.name +'<img src='+feature.device.img+" width='250' >";
        layer.bindPopup(popupContent);
    }
    
    // change maker color depending on device model
    function pointToLayerCB(feature, latlng) {
        var color;
        switch (feature.device.model) {
            case 01: fillcolor= '#ff7800'; break;
            case 02: fillcolor= '#FF33FF'; break;
            case 03: fillcolor= '#99FF33'; break;
            case 04: fillcolor= '#FFFF33'; break;
            case 05: fillcolor= '#3333FF'; break;
            case 06: fillcolor= '#660066'; break;
            default: fillcolor= '#FF3333'; break;
        }
        var marker= L.circleMarker(latlng, 
         {radius: 8, fillColor: fillcolor
         ,color: '#000'
         ,weight: 1
         ,opacity: 1
         ,fillOpacity: 0.8
    	 });
        return marker;
     }
    
    // display GeoJson data parsing them throught callback before dislay
    var myLayer = L.geoJson(geojsonFeature, {'pointToLayer':pointToLayerCB,'onEachFeature':onEachFeatureCB}).addTo(map);
    //myLayer.on('mouseover', function(e) {e.layer.openPopup();});
    //myLayer.on('mouseout' , function(e) {e.layer.closePopup();});
  } // end DevListCB
  
  // prepare request to GpsTracking JSON REST service  
  // var gpsdApi = 'geojson.rest?jsoncallback=?';
  var gpsdApi = '/geojson.rest';
  var gpsdRqt = 
      {format:'json'    // json ou pjson with ?jsoncallback=?
      ,key   :123456789 // user authentication key
      ,cmd   :'list'    // rest command
      ,group :'all'     // group to retreive
      ,round : true     // ask server to round numbers
      };
      
    // warning: this may fail if your http server does not handle Cross Origin Request Security. 
    $.getJSON(gpsdApi,gpsdRqt, DevListCB);
};

function GetDevTrack(map, devid) {
  function DevTrackCB (geojsonFeature) {
        // check if response is a valid GeoJson object
    if (geojsonFeature.type !== 'FeatureCollection') {
      // do something
      console.log ("HOOPS: Ajax AIP did not return a GeoJson FeatureCollection")
      return;
    }
    
    var redMarker = L.AwesomeMarkers.icon({
      icon: 'coffee',
      markerColor: 'orange',
      prefix: 'fa',
      iconColor: 'red'
     
    });
    
    var baseballIcon = L.icon({
	iconUrl: 'javascripts/images/baseball-marker.png',
	iconSize: [32, 37],
	iconAnchor: [16, 37],
	popupAnchor: [0, -28]
    });

    // For each position we add a popup with device name
    function onEachFeatureCB(feature, layer) {
        var popupContent='Devid='+ feature.id +' Name='+feature.properties.name +'<img src='+feature.device.img+" width='250' >";
        layer.bindPopup(popupContent);
    }
    
    // change maker color depending on device model
    function pointToLayerCB(feature, latlng) {
        var color;
        switch (feature.device.model) {
            case 01: fillcolor= '#ff7800'; break;
            case 02: fillcolor= '#FF33FF'; break;
            case 03: fillcolor= '#99FF33'; break;
            case 04: fillcolor= '#FFFF33'; break;
            case 05: fillcolor= '#3333FF'; break;
            case 06: fillcolor= '#660066'; break;
            default: fillcolor= '#FF3333'; break;
        }
        var marker= L.circleMarker(latlng, 
         {radius: 8, fillColor: fillcolor
         ,color: '#000'
         ,weight: 1
         ,opacity: 1
         ,fillOpacity: 0.8
    	 });
        return marker;
     }
    
    // display GeoJson data parsing them throught callback before dislay
    var myLayer = L.geoJson(geojsonFeature, {'pointToLayer':pointToLayerCB,'onEachFeature':onEachFeatureCB}).addTo(map);
    
  }  // end DevRouteCB
    
  var gpsdApi = '/geojson.rest';
  var gpsdRqt = 
      {format:'json'     // json ou pjson with ?jsoncallback=?
      ,key   : 123456789 // user authentication key
      ,cmd   :'track'    // rest command
      ,devid : devid     // device to track
      ,round : true      // ask server to round numbers
      };
      
    // warning: this may fail if your http server does not handle Cross Origin Request Security. 
    $.getJSON(gpsdApi,gpsdRqt, DevTrackCB);   
}

function ListDisplayMap() {
    
    //var map = L.map('PageMapDiv').setView ([47.501, -2.975],11);
    // Create a layer with a tile from OpenStreetMap and add it to current map
    //var openstreet = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png');
    //map.addLayer(openstreet);
    
    
    var mapLayer = MQ.mapLayer(),map;
    map=L.map('PageMapDiv',
        {layers: MQ.mapLayer()
        ,center: [47.501, -2.975]
        ,zoom: 12
        });
      
    L.control.layers(
        {'Map': mapLayer
        ,'Satellite': MQ.satelliteLayer()
        ,'Hybrid': MQ.hybridLayer()
    }).addTo(map);

    // call our function to get Marker from GpsdYtacking GeoJson/Ajax API
    GetDevList(map);
    //GetDevTrack (map, 123456789);
};

$(document).ready(ListDisplayMap);