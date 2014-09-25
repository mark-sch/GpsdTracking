/* 
 * Copyright 2014 Fulup Ar Foll.
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
process.env['TZ'] = 'UTC'; // Update Daemon internal time to UTC

var util            = require("util");
var fs              = require('fs');
var path            = require('path');
var async           = require("async");
var EventEmitter    = require("events").EventEmitter;
var DevControler    = require("./GpsdControler");
var DebugTools      = require("./GpsdDebug");

// timer in ms in between two commands to devices
var JOB_QUEUE_TIMER= 3* 1000; // 3s  in between each commands
var JOB_RETRY_TIMER=30* 1000; // 30s in between two retry

// Build database backend list directly from directory contend
var availableBackends =[]; {
    var backendsDir = __dirname  + "/backends/";
    var directory   = fs.readdirSync(backendsDir);
    for (var i in directory) {
        var filename = directory [i];
        var backend  = path.basename (filename,"-backend.js");
        var name = backendsDir + directory[i];
        if (fs.statSync(name).isFile()) {
            availableBackends [backend] = name;
        } 
        console.log ("Registering: " + backend + " file: " + availableBackends [backend]);
}}   

// Callback notify Async API that curent JobQueue processing is done
function JobCallback (job) {
    if (job !== null) {
       job.gpsd.Debug (6,"Queued Request:%s command=%s imei=%s [done]", job.request, job.command, job.devId);
    }
}

// Pop jon from queue is called outside of gpsd object context
function JobQueue (job, callback) {
     // ignore null job but notify the queue.
    if (job === null) {
         callback (null);
         return;
    }
    
    var gpsd = job.gpsd;
    var status = 0;
    
    // set few defaults
    if (job.timeout === undefined) job.timeout=0;  // no retry
    if (job.retry   === undefined) job.retry  =0;  // retry counter
    if (job.args    === undefined) job.args   =""; // optional arguments
    
    gpsd.Debug (5,"Queue Request=%s DevId=%s Command=%s Retry=%d", job.request, job.devId, job.command, job.retry);
    
    // broadcast command loop on active device list to split commands
    if (parseInt (job.devId) === 0) {
        var subrqst=1;
        for (var devid in gpsd.activeClients) {
            var request = {
                gpsd : job.gpsd,
                devId  : gpsd.activeClients[devid].device.imei,
                command: job.command,
                request: [job.request, subrqst++],
                retry  : job.retry, 
                timeout: job.timeout
            };
            gpsd.queue.push (request, JobCallback); // broadcast to all active devices
        }
        var broadcast = {
            gpsd  : job.gpsd,
            command : 'Broadcast',
            request : [request, subrqst++]
        };
        callback (broadcast);
        return;
    };
    
    // search for devId withing global active devices list
    if (gpsd.activeClients [job.devId] !== undefined) {
        // device is present check if it is loged
        gpsd.Debug (5,"Queue Request=%s DevId=%s Command=%s args=%s Sent", job.request, job.devId, job.command, job.args);
        socket  = gpsd.activeClients [job.devId];
        device  = socket.device;
        status  = device.RequestAction (job.command, job.args);
    } else {
        gpsd.event.emit ("queue","NOTLOG",job);
        status = 1; // device not present in active list
    }

    // process status result and notify callback function
    switch (status) {
        case 0 : // command was accepted by device
            // wait JOB_QUEUE_PAUSE time before processing Job next request
            gpsd.queue.pause ();
            setTimeout(function () {gpsd.queue.resume();}, JOB_QUEUE_TIMER);
            gpsd.event.emit ("queue", "ACCEPT", job);
            break;
            
        case 1: // device not present command will be retry later  
            if (job.timeout === 0) break;     // no retry
            if (job.timeout >= new Date()) {  // check time out and either push or notify users
                job.retry ++;
                gpsd.event.emit ("queue", "RETRY", job);
                setTimeout(function () {gpsd.queue.push (job, JobCallback);}, JOB_RETRY_TIMER);
            } else {
                gpsd.event.emit ("queue", "TIMEOUT", job);
            }                
            break;
               
        case -1 : // device exits but command was refused
            gpsd.event.emit ("queue", "REFUSED", job);
            break;
            
        case -2 : // device does not exist in active device list
            gpsd.event.emit ("queue", "UNKNOWN", job);
            break;
               
        default:
            gpsd.Debug (2,"Hoops invalid status code: Device DevId=%s Status=%s", job.devId, status);
            break;
    }
    callback (job);
};

// Main user entry point to create gpstracking service
function GpsDaemon(options) {

    this.controlers = []; // Hold controler objectHandler by device name
    this.activeClients = []; // Hold all active clients sort by UUID

    // Add DebugTool to log messages
    this.uuid  = "GpsDaemon:" + options.name;
    this.debug =  options.debug;   
    
    // simple counter for job queue
    this.request = 1;
    
    // Database backend and user event handler are shared amont all servers
    this.event = new EventEmitter();
    this.options     = options;
    
    // Compute some options and provide some defaults
    this.options.name    = options.name         || "Gps-Track-Test";
    this.options.debug   = options.debug        || 1;      // default 1
    this.options.backend = options.backend      || "file"; // file-backend.js
    this.options.mindist = options.mindist      || 200;    // default 200m
    this.options.mintime = options.mintime      || 3600;   // default 1h
      
    // Call constructor
    this.GpsDaemon (options);
};

// Import debug method 
GpsDaemon.prototype.Debug = Debug;

// Attache database backend and start one DevControler for each selected device
GpsDaemon.prototype.GpsDaemon=function(options) {

    console.log ("\nGpsDaemon Start: " + options.name );
   
    //  Create databaseObj and attach it to GpsDaemon
    try {
        var dbBackend = require(availableBackends[options.backend]);      
    } catch (err) {
        this.Debug (0, "Fail loading: %s file=%s", options.backend, availableBackends[options.backend]);
        console.log ("Gpsd stop");
        process.exit(-1);
    }
    
    // this.backend.connect (options);
    this.backend = new dbBackend (this, options);
    if (this.backend.error) {
        this.Debug (0, "Fail conecting dbBackend: %s", this.backend.info);
        console.log ("Gpsd stop");
        process.exit(-1);
    }
    
    // Queue handler to process sendcmd to device in serial mode 
    this.queue  =  async.queue  (JobQueue, 1);

    // For each adapter start a dedicated device server
    for (var svc in options.services) {

        this.controlers [svc] = new DevControler (this, options.services[svc]);
    }
    return (this);
};

// send a command to a tracker from its IMEI
GpsDaemon.prototype.CmdToDev = function(devId, timeout, cmd) {
        
    job = {
        gpsd  : this,
        request : this.request++,  // provide access to  GpsDaemon from callback 
        devId   : devId,           // imei
        command : cmd,             // command to device
        timeout : new Date()       // need current time to process timeout
    };
  
    //compute timeout and push job in queue
    job.timeout.setSeconds(job.timeout.getSeconds() + timeout);

    // Send to imei device or if imei=0 broacast to every active devices.
    this.queue.push (job, JobCallback); // push to queue 

};


// export the class
module.exports = GpsDaemon; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/


