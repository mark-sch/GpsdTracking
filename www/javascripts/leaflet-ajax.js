
/* this javascript is call from list-in-table.html
 * it resquest GpsdTracking GeoJsonRest adapter to get
 * the list of active devices and push on page table.
 * 
 * Refrences: 
 * https://github.com/lvoogdt/Leaflet.awesome-markers
 * http://leafletjs.com/examples/geojson.html
 * http://leafletjs.com/examples/sample-geojson.js
 * http://bcdcspatial.blogspot.fr/2012/01/onlineoffline-mapping-map-tiles-and.html
 * 
 */


/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 * 
 * Refrence: https://gist.github.com/ejh/2935327#file-leaflet-button-control-js
 */
 

// sample of GeoJson structure as returned by server. For validation http://geojsonlint.com/
/*var sampleResponseList=
    {"type":"FeatureCollection"
    ,"features":[
        {"type":"Feature"
        ,"geometry":{"type":"Point","coordinates":[-2.956468656997125,47.39691989478658],"sog":10.3,"cog":175.1,"age":33}
        ,"properties":{"type":"Properties","id":"123456789","name":"Fulup-HR37","title":"Position (-2.9565,47.3969)","url":"localhost:4080/geojson.rest?&key=123456789&cmd=track&devid=123456789&llist=10&"},"device":{"type":"Device","class":"Sailer","model":1,"call":"1-123456789","img":"http://www.sinagot.net/gpsdtracking/demo/images/Fulup-HR37x250.jpg","url":"http://www.sinagot.net/gpsdtracking/demo/devices/Fulup-HR37.html"}},{"type":"Feature","id":"147258369","geometry":{"type":"Point","coordinates":[-3.1057866666666665,47.36420833333333],"sog":35.5,"cog":347.70000000000005,"age":1},"properties":{"type":"Properties","name":"Momo-Yatch","title":"Position (-3.1058,47.3642)","url":"localhost:4080/geojson.rest?&key=123456789&cmd=track&devid=147258369&llist=10&"},"device":{"type":"Device","class":"Yatch","model":3,"call":"3-147258369","img":"http://www.sinagot.net/gpsdtracking/demo/images/Momo-Yatchx250.jpg","url":"http://www.sinagot.net/gpsdtracking/demo/devices/Momo-Yatch.html"}},{"type":"Feature","id":"159847387","geometry":{"type":"Point","coordinates":[-2.894015,47.51636833333333],"sog":10.5,"cog":337.8,"age":5},"properties":{"type":"Properties","name":"Xavier-Ferry","title":"Position (-2.8940,47.5164)","url":"localhost:4080/geojson.rest?&key=123456789&cmd=track&devid=159847387&llist=10&"},"device":{"type":"Device","class":"Speeder","model":6,"call":"6-159847387","img":"http://www.sinagot.net/gpsdtracking/demo/images/Xavier-Ferryx250.jpg","url":"http://www.sinagot.net/gpsdtracking/demo/devices/Xavier-Ferry.html"}},{"type":"Feature","id":"179346827","geometry":{"type":"Point","coordinates":[-2.94171,47.279175],"sog":22.8,"cog":32.4,"age":0},"properties":{"type":"Properties","name":"Sinagot-Pesketour","title":"Position (-2.9417,47.2792)","url":"localhost:4080/geojson.rest?&key=123456789&cmd=track&devid=179346827&llist=10&"},"device":{"type":"Device","class":"Fisher","model":2,"call":"2-179346827","img":"http://www.sinagot.net/gpsdtracking/demo/images/Sinagot-Pesketourx250.jpg","url":"http://www.sinagot.net/gpsdtracking/demo/devices/Sinagot-Pesketour.html"}},{"type":"Feature","id":"258369147","geometry":{"type":"Point","coordinates":[-2.9942366666666667,47.468783333333334],"sog":17.2,"cog":167.5,"age":7},"properties":{"type":"Properties","name":"Mael-Ferry","title":"Position (-2.9942,47.4688)","url":"localhost:4080/geojson.rest?&key=123456789&cmd=track&devid=258369147&llist=10&"},"device":{"type":"Device","class":"Ferry","model":4,"call":"4-258369147","img":"http://www.sinagot.net/gpsdtracking/demo/images/Mael-Ferryx250.jpg","url":"http://www.sinagot.net/gpsdtracking/demo/devices/Mael-Ferry.html"}},{"type":"Feature","id":"321654987","geometry":{"type":"Point","coordinates":[-2.91836,47.38233833333334],"sog":9.700000000000001,"cog":321.6,"age":13},"properties":{"type":"Properties","name":"Vero-Cargo","title":"Position (-2.9184,47.3823)","url":"localhost:4080/geojson.rest?&key=123456789&cmd=track&devid=321654987&llist=10&"},"device":{"type":"Device","class":"Cargo","model":5,"call":"5-321654987","img":"http://www.sinagot.net/gpsdtracking/demo/images/Vero-Cargox250.jpg","url":"http://www.sinagot.net/gpsdtracking/demo/devices/Vero-Cargo.html"}
       },{"type":"Feature","id":"456789012","geometry": "......blablabla ...."}]};
*/

var map;
var GPSD_API_KEY; // set by server at page load or set manually for demo/debug
var devListLayer=null;
var activeDevTracks=[];
var backButton=null;

function GetDevList(devid) {
        
    function DevListCB (geojsonFeature) {
    var demoselect; // use to get a preselected device during demo
    
    // check if response is a valid GeoJson object
    if (geojsonFeature.type !== 'FeatureCollection') {
      // do something
      console.log ("HOOPS: Ajax AIP did not return a GeoJson FeatureCollection");
      return;
    }
    
    // change maker color depending on device model
    function pointToLayerCB(feature, latlng) {
        var color, icon;
        switch (feature.device.model) {
            case 01: 
                color= 'purple';
                icon = 'anchor';
                break;
            case 02:
                icon = 'anchor';
                color= 'orange';
                break;
            case 03: 
                icon = 'cab';
                color= 'red';
                break;
            case 04: 
                icon = 'anchor';
                color= 'green';
                break;
            case 05:
                icon = 'plus-square';
                color= 'cadetblue';
                break;
            case 06:
                icon = 'anchor';
                color= 'darkpuple';
                break;
            default: 
                color= 'darkred';
                icon = 'flag';
                break;
        }
        // http://fortawesome.github.io/Font-Awesome/icons/
        var redIcon = L.AwesomeMarkers.icon(
            {icon: icon
            ,markerColor: color
            ,iconSize: [19, 52]
            ,prefix: 'fa'
            ,spin: false
        });
        
        marker=L.marker(latlng,
                {title: feature.properties.name + ' [' + feature.properties.id + ']'
                ,icon: redIcon
                ,clickable: true
                ,opacity: 0.8
                });
        var popup=marker.bindPopup('<a onclick="GetDevTrack('+ feature.properties.id +')"> <b>Devid='+feature.properties.id
            +' Name='+feature.properties.name +'</b><img src='+feature.device.img+" width='250' ><br>Current Trace [Click here]</a>");

        // small hack for demo to display a preselected device
        if (parseInt(feature.properties.id) === devid) {
            popup.openPopup();
            demoselect={latlng:latlng,marker:popup};
        };
        return marker;
     }
    
    // remove previous layer if any
    if (devListLayer !== null) map.removeLayer(devListLayer);
    if (backButton !== null)    map.removeLayer(backButton);
    for (var track in activeDevTracks) map.removeLayer(activeDevTracks[track]);

    // buit a tip as circlemarker des not implement them
      
        
    // display GeoJson data parsing them throught callback before dislay
    devListLayer = L.geoJson(geojsonFeature, {'pointToLayer':pointToLayerCB});
    devListLayer.addTo(map);
    
    // demo can display map with a pre-selected device
    if (demoselect !== undefined) {
        demoselect.marker.openPopup();
        map.setView(demoselect.latlng);
    } else {
        map.fitBounds(devListLayer.getBounds());
    }
    
  } // end DevListCB
  
  // prepare request to GpsTracking JSON REST service  
 var corsbypass = true;  
  if (location['GPSD_HTTP_AJAX']) corsbypass = false;
  if (corsbypass)  var gpsdApi = 'http://sinagot.net:4080/geojson.rest?jsoncallback=?';
  else  var gpsdApi = "geojson.rest";
  var gpsdRqt = 
      {format:'json'       // json ou pjson with ?jsoncallback=?
      ,key   :GPSD_API_KEY // user authentication key
      ,cmd   :'list'       // rest command
      ,group :'all'        // group to retreive
      };
      
    // warning: this may fail if your http server does not handle Cross Origin Request Security. 
    $.getJSON(gpsdApi,gpsdRqt, DevListCB);
};

     
function GetDevTrack(devid) {
  function DevTrackCB (geojsonFeature) {
    var firstPoint=true;
    var firstMarker;
    var trackLine;
      
    // check if response is a valid GeoJson object
    if (geojsonFeature.type !== 'GeometryCollection') {
      // do something
      console.log ("HOOPS: Ajax AIP did not return a GeoJson FeatureCollection");
      return;
    }
   
    // close any useless object we may have previous selection
    map.closePopup();  
    if (backButton !== null)    map.removeLayer(backButton);
  
    // call for each points in GeometryCollection
    function pointToLayerCB(feature, latlng) {
        if (firstPoint) {
            // center map on selected point
            map.panTo(latlng);
            
            // buid a special marker for most recent position
            firstPoint=false;
             var redIcon = L.AwesomeMarkers.icon(
            {icon: 'flag'
            ,markerColor: 'red'
            ,prefix: 'fa'
            ,spin: false
            });
        
            firstMarker=L.marker(latlng,
                {title: feature.geometry.properties.title
                ,icon: redIcon
                ,clickable: true
                ,opacity: 1
                });
            firstMarker.bindPopup("<center><b>"+feature.properties.name+'</b> ['+feature.properties.id+']<br><br>'+ feature.geometry.properties.title+"</center>");
            
            trackLine=L.polyline (latlng,
                {smoothFactor: 1.0
                ,weight:3
                ,color:'red'
                ,opacity: 0.8
                ,dashArray: [3, 10]
                ,clickable: false
                });
            trackLine.addTo(map);
            trackLine.addLatLng(latlng);
            activeDevTracks.push (trackLine);
            return (firstMarker);
        } 
        
        // mark intermediary points
        var marker= L.circleMarker(latlng, 
         {radius: 4
         ,title: feature.geometry.properties.title    
         ,fillColor: '#ff7800'
         ,color: '#000'
         ,weight: 1
         ,opacity: 1
         ,fillOpacity: 0.8
    	 });
         marker.bindPopup("<center>"+feature.geometry.properties.title+"</center>");
         
         // add current point to our trackline
         trackLine.addLatLng(latlng);
        return (marker);
     }
    activeDevTracks.push(L.geoJson(geojsonFeature, {'pointToLayer':pointToLayerCB}).addTo(map));
     
     // back button is a marker that we replace at the end of each map move  
    var point = L.point(65,35); // where to place backbutton
    var backIcon = L.icon({iconUrl: '/images/button-backx75.png',iconSize: [50, 50]});
    backButton= L.marker(map.containerPointToLatLng (point), 
                {title: 'back to global view'
                ,icon:  backIcon,draggable: true
                ,clickable: true,opacity:0.8}).addTo(map);
     backButton.on('click',  GetDevList);
     map.on('moveend', function(){backButton.setLatLng (map.containerPointToLatLng (point));});
     
  }  // end DevRouteCB
    
    // Select direct Ajax/Json profile if using GpsdTracking/HttpAjax server otherwise use JsonP
  var corsbypass = true;  
  if (location['GPSD_HTTP_AJAX']) corsbypass = false;
  if (corsbypass)  var gpsdApi = 'http://sinagot.net:4080/geojson.rest?jsoncallback=?';
  else  var gpsdApi = "geojson.rest";
      
  var gpsdRqt = 
      {key   : GPSD_API_KEY // user authentication key
      ,cmd   :'track'       // rest command
      ,devid : devid        // device to track
      ,llist : 20
   };
   // warning: this may fail if your http server does not handle Cross Origin Request Security. 
   $.getJSON(gpsdApi,gpsdRqt, DevTrackCB);   
}

function DisplayDevMap() {

  // For more option Check http://leaflet-extras.github.io/leaflet-providers/preview/index.html
  ActiveTiles=
   {'OpenStreet': false  // free no key, no registration
   ,'MapQuest'  : true   // no registration if not using mapquest API
   ,'NokiaRoad' : false  // registration required
   ,'NokiaSat'  : false  // registration required
   ,'MapBox'    : false  // need registration
   ,'GoogleMap' : true   // not registration but does not use Google API
   };
  
   // parse URL query for demo option selection
   var democmd;
   var demoid=123456789;  // default devid for demos
   
   var query=location.search.substring(1).split("&");
   for (slot in query) {
       var action=query[slot].split('=');
       //console.log ("action:%s %s => %s", slot, action[0], action[1]); 
       if (action[0]==='democmd') democmd=action[1];
       if (action[0]==='devid')   demoid=action[1];
   }

    // Create a map  center on Golf of Morbihan 
    map = L.map('PageMapDiv').setView ([47.501, -2.975],12);
    
    if (ActiveTiles['OpenStreet']) { // easy case no API/Key no registration
       ActiveTiles['OpenStreet'] = openstreet = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png');
       map.addLayer(ActiveTiles['OpenStreet']);
    };
       
    if (ActiveTiles['MapQuest']) {  // get a http://developer.mapquest.com
        //document.write ('<script src="http://www.mapquestapi.com/sdk/leaflet/v1.s/mq-map.js?key=Fmjtd%7Cluurnuurnu%2C8s%3Do5-9wr596"></script>');
        ActiveTiles['MapQuest'] = L.tileLayer('http://otile{s}.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.jpeg',
          {attribution: 'Tiles by <a href="http://www.mapquest.com/">MapQuest</a> & <a href="http://openstreetmap.org">OpenStreetMap</a>',subdomains: '1234'}); 
        map.addLayer(ActiveTiles['MapQuest']);
    };
       
    if (ActiveTiles['MapBox']) { // ref: https://gist.github.com/mourner/1804938
        var usermap='xxxx.yyyyy'; 
        //document.write ('<script src="http://www.mapquestapi.com/sdk/leaflet/v1.s/mq-map.js?key=Fmjtd%7Cluurnuurnu%2C8s%3Do5-9wr596"></script>');
        ActiveTiles['MapBox'] = L.tileLayer('http://{s}.tiles.mapbox.com/v3'+usermap +'/{z}/{x}/{y}.png',
          {attribution: 'Tiles by <a href="http://www.mapquest.com/">MapQuest</a> & <a href="http://openstreetmap.org">OpenStreetMap</a>'}); 
        map.addLayer(ActiveTiles['MapBox']);
    };
    
    if (ActiveTiles['GoogleMap']) { // easy but may not conform to google rules
        ActiveTiles['GoogleMap']= new L.TileLayer('http://mt{s}.google.com/vt/v=w2.106&x={x}&y={y}&z={z}&s='
        ,{ subdomains:'0123', attribution:'&copy; Google 2014'});
         map.addLayer(ActiveTiles['GoogleMap']);
    };
        
    if (ActiveTiles['NokiaSat']) { // request API Key at http://developer.here.com
       ActiveTiles['NokiaSat'] = L.tileLayer('http://{s}.{base}.maps.cit.api.here.com/maptile/2.1/maptile/{mapID}/hybrid.day/{z}/{x}/{y}/256/png8?app_id={app_id}&app_code={app_code}',
           {attribution: 'Map &copy; 1987-2014 <a href="http://developer.here.com">HERE</a>'
           ,subdomains: '1234',mapID: 'newest',base: 'aerial',minZoom: 0, maxZoom: 20
	   ,app_id: 'YourKEY', app_code: 'YourAPI'
	});
      map.addLayer(ActiveTiles['NokiaSat']);
    };
    
    if (ActiveTiles['NokiaRoad']) { // request API Key at http://developer.here.com
       ActiveTiles['NokiaRoad'] = L.tileLayer('http://{s}.{base}.maps.cit.api.here.com/maptile/2.1/maptile/{mapID}/terrain.day/{z}/{x}/{y}/256/png8?app_id={app_id}&app_code={app_code}',
           {attribution: 'Map &copy; 1987-2014 <a href="http://developer.here.com">HERE</a>'
           ,subdomains: '1234',mapID: 'newest',base: 'aerial',minZoom: 0, maxZoom: 20
	   ,app_id: 'YourKEY', app_code: 'YourAPI'
	});
      map.addLayer(ActiveTiles['NokiaRoad']);
    };
    
    // build control layer with selected maps only
    var selectedBaseMap = [];
    for (var tilename in ActiveTiles) {
        if (ActiveTiles [tilename] !== false) {
            selectedBaseMap[tilename] = ActiveTiles [tilename];
        }
    }
    
    // call our function to get Marker from GpsdYtacking GeoJson/Ajax API
    L.control.layers(selectedBaseMap)
     .setPosition('topleft')
     .addTo(map);
    
    // warning 123456789 should be an existing devices in your active list
    
    switch (democmd) { 
        case 'track':
              GetDevTrack (demoid);
              break;
        case 'select':
              GetDevList(demoid);
              break;
        default : 
            GetDevList();
    }
};

// activate demo
if (GPSD_API_KEY===undefined) GPSD_API_KEY=123456789; // should normaly be provided by web server
$(document).ready(DisplayDevMap);