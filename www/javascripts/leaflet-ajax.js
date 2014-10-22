
/* this javascript is call from list-in-table.html
 * it resquest GpsdTracking GeoJsonRest adapter to get
 * the list of active devices and push on page table.
 * 
 * Refrences: 
 * https://github.com/lvoogdt/Leaflet.awesome-markers
 * http://leafletjs.com/examples/geojson.html
 * http://leafletjs.com/examples/sample-geojson.js
 * http://bcdcspatial.blogspot.fr/2012/01/onlineoffline-mapping-map-tiles-and.html
 * https://gist.github.com/ejh/2935327#file-leaflet-button-control-js
 * 
 * This file propose 3 independant routines.
 *  - GetDevList:  Ajax/GeoJson FeaturesCollection query request all loged devices
 *  - GetDevTrack: Ajax/GeoJson GeometriesCollection request current track for a given device
 *  - GetDevMov:   WebSock/Json display and move device on the map dynamically
 *  The tree fonctions are called from the same HTML page leaflet-map.html
 *  selection if done from query cmd=xxxx value.
 * 
 */


/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
 

var TRACE_SIZE=20;  // number of points in trace
var VECTOR_SIZE=4;  // speed/heading direction vector length

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
  if (HTTP_AJAX_CONFIG.JSONP)  var gpsdApi = 'http://sinagot.net:4080/ajax/geojson.rest?jsoncallback=?';
  else  var gpsdApi = "/ajax/geojson.rest";
  
  var gpsdRqt = 
      {format:'json'       // json ou pjson with ?jsoncallback=?
      ,key   : HTTP_AJAX_CONFIG.GPSD_API_KEY // user authentication key
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
    var backIcon = L.icon({iconUrl: '../images/button-backx75.png',iconSize: [50, 50]});
    backButton= L.marker(map.containerPointToLatLng (point), 
                {title: 'back to global view'
                ,icon:  backIcon,draggable: true
                ,clickable: true,opacity:0.8}).addTo(map);
     backButton.on('click',  GetDevList);
     map.on('moveend', function(){backButton.setLatLng (map.containerPointToLatLng (point));});
     
  }  // end DevRouteCB
    
  // Select direct Ajax/Json profile if using GpsdTracking/HttpAjax server otherwise use JsonP
  if (HTTP_AJAX_CONFIG.JSONP)  var gpsdApi = 'http://sinagot.net:4080/ajax/geojson.rest?jsoncallback=?';
  else  var gpsdApi = "/ajax/geojson.rest";
      
  var gpsdRqt = 
      {key   : HTTP_AJAX_CONFIG.GPSD_API_KEY // user authentication key
      ,cmd   :'track'       // rest command
      ,devid : devid        // device to track
      ,llist : 20
   };
   // warning: this may fail if your http server does not handle Cross Origin Request Security. 
   $.getJSON(gpsdApi,gpsdRqt, DevTrackCB);   
}


// this object hold device on map parameters
DeviceOnMap = function(devid) {
      this.trace=[];  // keep trace of device trace on xx positions
      this.count=0;   // number of points created for this device
}; // end device on Map
  
DeviceOnMap.prototype.SetDeco= function () {
        switch (this.model) {
        case 01: 
            this.color= 'purple';
            this.icon = 'anchor';
            break;
        case 02:
            this.icon = 'anchor';
            this.color= 'orange';
            break;
        case 03: 
            this.icon = 'cab';
            this.color= 'red';
            break;
        case 04: 
            this.icon = 'anchor';
            this.color= 'green';
            break;
        case 05:
            this.icon = 'plus-square';
            this.color= 'cadetblue';
            break;
        case 06:
            this.icon = 'anchor';
            this.color= 'darkpuple';
            break;
        default: 
            this.color= 'darkred';
            this.icon = 'flag';
            break;
       }
};
  
    // Create an icon based on device color
DeviceOnMap.prototype.GetIcon=function () {
        // http://fortawesome.github.io/Font-Awesome/icons/
        var redIcon = L.AwesomeMarkers.icon(
            {icon: this.icon
            ,title:  'Name=' + this.name + ' [' + this.devid + ']'       
            ,markerColor: this.color
            ,iconSize: [19, 52]
            ,prefix: 'fa'
            ,spin: false
        });
        return (redIcon);
};
    
    // Create a marker from device object and plate in on the map
DeviceOnMap.prototype.CreateMarker= function (data) {
        this.SetDeco();
        var marker=L.marker([data.lat,data.lon],
            {icon: this.GetIcon()
            ,title:  'Name=' + this.name + ' [' + this.devid + ']'
            ,clickable: true
            ,opacity: 0.8
        }).addTo(map);
    
        var info=  "devid=" +data.devid+"<br>Name=" + this.name +"</b><img src="+data.img+" width='250' >";  
        marker.bindPopup("<center>"+info+"</center>");
        
        return (marker);
};
   
DeviceOnMap.prototype.CreateCircle= function () {
      var marker= L.circleMarker([this.lat, this.lon], 
         {radius: 2
         ,fillColor: this.color
         ,color: '#000'
         ,weight: 1
         ,opacity: 1
         ,riseOnHover: true
         ,fillOpacity: 0.8
    	 }).addTo(map);
      var info= "devid="+this.devid +" name=" +this.name+"<br>lat:"+this.lat.toFixed(4) +" lon:" +this.lon.toFixed(4)
              + " spd:" + this.sog.toFixed(2)+ " hdg:"+ this.cog.toFixed(2)+"<br>" +  new Date();
      marker.bindPopup("<center>"+info+"</center>");
      return (marker);
};
  
   // build a vector base on device heading & speed
DeviceOnMap.prototype.CreateVector =function () {
       if (this.vector !== undefined) map.removeLayer (this.vector);
      
       // Create a vector lenght from this speed
       var len=VECTOR_SIZE*this.sog; 

       // compute x/y direction depending on device heading
       if (this.cog < 180)  sinDir=1; else sinDir=-1;
       if (this.cog > 270 && this.cog < 90 )   cosDir=1; else cosDir=-1;
       // pts (0.0) is left uppercorner
       var pts= map.latLngToContainerPoint ([this.lat, this.lon]);
       var newx= parseInt (pts.x + (Math.sin(this.cog / 180)*len*sinDir));
       var newy= parseInt (pts.y + (Math.cos(this.cog* Math.PI / 180)*len*cosDir));
       
       this.vector=L.polyline ([[this.lat, this.lon], map.containerPointToLatLng(L.point(newx,newy))]
                  , {clickable:false, color: this.color, opacity:0.7, dashArray:[3, 10]}).addTo(map);
       
};
    
    // if no marker create on, else move it and update trace
DeviceOnMap.prototype.UpdatePos = function (data) {
        
        if (this.marker === undefined) {
            this.marker = this.CreateMarker(data);
        } else {
            // move data marker to new location
            this.marker.setLatLng ([data.lat, data.lon]);
            // add a new point to trace
            var current= this.count; 
            var next   = ++this.count % TRACE_SIZE;
            this.trace[current]= this.CreateCircle ();
            // clear old trace point if needed
            if (this.trace[next] !== undefined) map.removeLayer (this.trace[next]);  
        }
        for (var slot in data) (this[slot] = data[slot]);
        
        var info= "devid=<b>" + data.devid + "</b><br>Name=<b>" + this.name + "</b><img src=" + this.img + " width='250' >"
                + "pos:<b>" + this.lat.toFixed(4) + "</b>,<b>" + this.lon.toFixed(4) 
                + "</b> sog:<b>" + this.sog.toFixed(2)+ "</b> hdg<b>:"+ this.cog.toFixed(2) + "</b>";
      
        this.marker.bindPopup("<center>"+info+"</center>");

        this.CreateVector();
};
    
DeviceOnMap.prototype.UpdateInfo= function(data) {
        for (var slot in data) (this[slot] = data[slot]);
};
    
DeviceOnMap.prototype.CleanTrace=function () {
        for (var slot in this.trace) {
            if (this.trace [slot] !== undefined) {
                map.removeLayer(this.trace [slot]);
            }
        }
};
  
// this routine is called to display moving devices with a websocket
function GetDevMov() {
 
  var activeDevs=[]; // hash table for devices key=devid
  var ws;
  
  function  DisplayCallback(message) {
   // console.log ("message=%s",message);  
    var data= JSON.parse (message);  
   
    switch (data.type) {
        case 0: // initial messages get both auth & position info
           activeDevs [data.devid]= new DeviceOnMap (data.devid);
           activeDevs [data.devid].UpdateInfo(data)
           activeDevs [data.devid].UpdatePos (data);
           break;
            
        case 1: // authentication 
            if (activeDevs [data.devid] === undefined) {
                activeDevs [data.devid]= new DeviceOnMap (data.devid);
            }
            activeDevs [data.devid].UpdateInfo (data);
            break;
            
        case 2: // position update
            if (activeDevs [data.devid] === undefined) {
                activeDevs [data.devid]= new DeviceOnMap (data.devid);
            }
            activeDevs [data.devid].UpdatePos (data);
            break;
            
        case 3: // data quit let's clean the place
            if (activeDevs [data.devid] !== undefined) {
                activeDevs [data.devid].CleanTrace();
                delete activeDevs [data.devid];
            }
            break;
        default:
           console.log ("HOOP: unknown message type: %s [%s]", data.type, JSON.stringify(data));
       }
    }; // end DisplayCallback
    
    // If this is not our server, jump directly to a wellknown fixed wssock provider
    if (HTTP_AJAX_CONFIG.JSONP)  var wsUri = 'ws://sinagot.net:4081/wssock?API_KEY=123456789';
    else  {
        var host = window.document.location.host.replace(/:.*/, '');
        var wsUri = "ws://" + host + "/websock?API_KEY=123456789";
    }
      
    try {
        ws = new WebSocket(wsUri);
    } catch (err) {
        console.log ("## Hoops: Websock URI=%s  Err=%s", wsUri, err);
    }
    if (ws !== undefined) ws.onmessage = function (event) {
        DisplayCallback (event.data);
    };
} // end DisplayDevMov


function DisplayDevMap() {

  // For more option Check http://leaflet-extras.github.io/leaflet-providers/preview/index.html
  var ActiveTiles=
   {'OpenStreet': true   // free no key, no registration
   ,'MapQuest'  : false  // no registration if not using mapquest API
   ,'NokiaRoad' : false  // registration required
   ,'NokiaSat'  : false  // registration required
   ,'MapBox'    : false  // need registration
   ,'GoogleMap' : true   // not registration but does not use Google API
   };
  
   // parse URL query for demo option selection
   var democmd='default';
   
   var query=location.search.substring(1).split("&");
   for (slot in query) {
       var action=query[slot].split('=');
       //console.log ("action:%s %s => %s", slot, action[0], action[1]); 
       if (action[0]==='democmd') democmd=action[1];
       if (action[0]==='devid')   demoid=action[1];
   }

   function resizeMap () {
      // compute screen size 
      var mapzone=document.getElementById('PageMapDiv');
      if (window.innerWidth > 1280) {
        mapzone.style.width=(window.innerWidth * 0.7)+'px';;
        mapzone.style.height=(window.innerHeight * 0.75)+'px';
      } else {
        mapzone.style.left='2%';
        mapzone.style.width=(window.innerWidth * 0.95)+'px';;
        mapzone.style.height=(window.innerHeight * 0.95)+'px';
      } 
    }
    resizeMap (); 
    window.onresize = resizeMap;
    
    // Create a map  center on Golf of Morbihan 
    map = L.map('PageMapDiv').setView ([47.45, -2.975],11);
    
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
    console.log ("democmd=%s", democmd);
    switch (democmd) { 
        case 'track':
              GetDevTrack (demoid);
              break;
        case 'select':
              GetDevList(demoid);
              break;
        case 'moving':
              GetDevMov();
              break;
        default : 
   
            GetDevList();
    }
};


try { // for test & debug  provide a predefined key demo key
    var key=HTTP_AJAX_CONFIG.API_KEY;
} catch (e) {
    HTTP_AJAX_CONFIG={JSONP: true, GPSD_API_KEY: 123456789};
}