#!/usr/bin/env node

/* 
 * Copyright 2014 Fulup Ar Foll
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 * This backend is a pure sample for developpers. Its has not real value
 * from an application point of view !!!
 * 
 * 1) $NODE apps/GpsdFlatFileSample.js
 * 2) $NODE ./apps/DeviceSimulator.js --gpxfile=./samples/gpx-files/opencpn-sample.gpx --port=6001 --tic=2 
 * 3) telnet localhost 6000
 *    > dev list
 *    > dev info
 * 4) look for produces GPX files in samples/tracks-store
 *    > application create one GPX per IMEI
 * 
 */
GpsDaemon = require("../lib/GpsdDaemon"); 


// Sample of FlatFile Backend
var FileSample = {
    backend  : "FlatFile",      // backend file ==> file-backend.js
    name     : "GpsdFile",      // friendly service name
    mindist  : 200,             // dont store data if device move less than 200m
    maxtime  : 3600,            // force data store every 3600s even if device does not move
    debug    : 1,               // debug level 0=none 9=everything
    
    "services"    :  {   // Label: "friendly name" "adapter" "tcp server port"
        telnet : {info: "Telnet"    , adapter: "TelnetConsole" , port:"6000"},
        nmea183: {info: "Simulator" , adapter: "NmeaSimulator" , port:"6001"}
    },
	
    "file": { // specific FlatFile options
	store   : '../samples/tracks-store',  // where to store track files [directory must exist]
	prefix  : 'imei-',           // use this a prefix [sample-imei.gpx]
        erase   : true               // false: append gpx info to existing files
    }
};


// ----------- User Event Handler --------------------------------
ListenEvents = function (daemon) {
    var count =0;  // Simple counter to make easier to follow message flow
       
    // Events from queued jobs
    EventHandlerQueue = function (status, job){
        console.log ("#%d- Queue Status=%s DevId=%s Command=%s JobReq=%d Retry=%d", count++, status, job.devId, job.command, job.request, job.retry);
    };	
    // Events successful process by tracker adapter
    EventHandlerAccept = function (device, data){
        console.log ("#%d- Action Imei:[%s] Name:[%s] Cmd:[%s] Lat:%d Lon:%d Speed=%d", count++, device.imei, device.name, data.cmd, data.lat, data.lon, data.speed);
    };
     // Events on action refused by tracker adapter
    EventHandlerError = function(status, info, id, msg){
        console.log ("#%d- Notice Info=%s Data=%s Id=%s Msg:%s", count++, status, info, id, msg );       
    };

    // let's use the same event handler for all gpsdTracker
    daemon.event.on("queue",EventHandlerQueue);	
    daemon.event.on("accept",EventHandlerAccept);	
    daemon.event.on("notice",EventHandlerError);
};
       
// Start GpsdDaemon and listen to events
  gpsdFlatFile  = new GpsDaemon(FileSample);
  ListenEvents (gpsdFlatFile);

