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
 */
GpsDaemon = require("../lib/GpsdDaemon"); 

// Sample for MySql option (Warning: you have to create your base+tables first)
var MySqlSample = {
    backend  : "mysql",         // backend file ==> mysql-backend.js
    name     : "GpsdMySQL",     // friendly service name
    mindist  : 200,             // dont store data if device move less than 200m
    maxtime  : 3600,            // force data store every 3600s even if device does not move
    debug    : 5,               // debug level 0=none 9=everything
    
    "services"    :  {   // Label: "friendly name" "adapter" "tcp server port"
        nmea183: {info: "Simulator" , adapter: "nmea"   , port:"5001"},
        telnet : {info: "Telnet"    , adapter: "telnet" , port:"5000"},
        gps103 : {info: "Boats"     , adapter: "tk103"  , port:"5002"},
        traccar: {info: "Phones"    , adapter: "traccar", port:"5006"}
    },
	
    "mysql": { // Specific MySql options [need to reflect your configuration]
	hostname:"10.10.100.101",
        // basename: "gpstrack",
        basename: "gpsdtest",
	username: "gpsdtest",
        password: "MyPasswd"
    }
};


// ----------- User Event Handler -----------------
ListenEvents = function (daemon) {
    var count =0;  // Simple counter to make easier to follow message flow
       
    // Events from queued jobs
    EventHandlerQueue = function (status, job){
        console.log ("#%d- Queue Status=%s DevId=%s Command=%s JobReq=%d Retry=%d", count, status, job.devId, job.command, job.request, job.retry);
    };	
    // Events successful process by tracker adapter
    EventHandlerAccept = function (device, data){
        console.log ("#%d- Action Imei:[%s] Name:[%s] Cmd:[%s] Lat:%d Lon:%d Speed=%d", count, device.imei, device.name, data.cmd, data.lat, data.lon, data.speed);
    };
     // Events on action refused by tracker adapter
    EventHandlerError = function(status, info, id, msg){
        console.log ("#%d- Notice Info=%s Data=%s Id=%s Msg:%s", count, status, info, id, msg );       
    };

    // let's use the same event handler for all gpsdTracker
    daemon.event.on("queue",EventHandlerQueue);	
    daemon.event.on("accept",EventHandlerAccept);	
    daemon.event.on("notice",EventHandlerError);
};
       
// Sample of testing routine for devices
SendCmds = function(daemon) {
    dev1=359710043551135;   // My boat
    dev2=352519050984578;   // My phone
    
    timer= 60;  // max timering time in second before command acceptation

    jobs = [[dev1, timer, "GET_POS"]                  // request tracker current position 
           ,[dev2, timer, "GET_POS"]                  // request tracker current position 
           ,[0000, timer, "GET_POS"]                  // broadcast to every active client   
        // ,[dev1, timer, "SET_TRACK_BY_TIME",30,5]   // request 5 position every 30s
    ];
    
    // push command to GpsDeamon job queue
    for (var task in jobs) {
       request = jobs[task];
       devId   = request[0];
       timeout = request[1];
       command = request[2];
       
       // push device command to daemon result will comme through event notification
       daemon.CmdToDev (devId, timeout, command);
    }
};

// Note: you may start mutiple GpsdDaemaon within the same application
//       util port & event does not conflict

// sample one using mysql as storage backend
  gpsdMySql     = new GpsDaemon(MySqlSample);
  ListenEvents (gpsdMySql);

 
//Wait 5 and 10s before sending testing commands
  // setTimeout(function () {SendCmds (gpsdMySql);}   , 5*1000);