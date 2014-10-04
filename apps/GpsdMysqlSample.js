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
    backend    : "MySql",         // backend file ==> mysql-backend.js [default file]
    name       : "GpsdMySQL",     // friendly service name [default Gpsd-Track]
    inactivity : 900,             // remove device from active list after xxxs inactivity [default 600s]
    debug      : 4,               // debug level 0=none 9=everything
    
    "services"    :  {  // WARNING: service network port MUST NOT conflict
        /*
            info     : 'a friendly name for your service'
            adapter  : 'xxxx for adapter file = ./adapter/xxxx-adapter.js'
            port     : 'tcp port for both service provider|consumer'
            hostname : 'remote service provider hostname  [default localhost]'
            timeout  : 'reconnection timeout for consumer of remote service [default 120s]'
            imei     : 'as standard nmea feed does not provide imei this is where user can provide it'
            maxspeed : 'any thing faster is view as an invalid input [default=55m/s == 200km/h]
            mindist  : 'dont store data if device move less than xxxm [default 200m]'
            maxtime  : 'force data store every xxxxs even if device did not move [default 3600s]'
            debug    : 'allow to give a specific debug level this adapter default is [gpsd.debug]'
        */
               
        // following services are servers and wait for service to connect
          Telnet   : {info: "Telnet Console"  , adapter: "TelnetConsole" , port:5000}
         ,Gps103   : {info: "Tk102 Gps103"    , adapter: "Gps103Tk102"   , port:5001}
         ,Nmea183  : {info: "Simulator Nmea"  , adapter: "NmeaSimulator" , port:5002}
         ,Traccar  : {info: "Traccar Client"  , adapter: "TraccarDroid"  , port:5006}
         ,Celltrac : {info: "CellTrac Android", adapter: "GtcGprmcDroid" , port:5007}
        
    },
	
    "mysql": { // Specific MySql options [should reflect your configuration]
	hostname:"10.10.100.101",
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