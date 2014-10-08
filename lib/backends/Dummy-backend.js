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


/* 
 * This backend ignore any data it received. It is only design to support
 * the online demo for device adapter test. It does not store anything on disk
 * and have no value for real applications.
 * 
 * It:
 * 1) keeps in RAM the 20 last possitions of any devices for demo apps.
 * 2) provides a copy of positions input to an JSON feed on opts.jsonport
 * 3) provides a copy of positions input in AIS/AIVDM on opts.aisport
 * 
 */

var async         = require("async");
var net           = require('net');

var Debug    = require("../GpsdDebug");
var AisEncode= require('../GpsdAisEncode');  

// few static variables [hugly but simple]
var  TcpJsonSv;
var  TcpAisSv;
var  QJhandle; 
var  SockPause;
var  CLsockid;

// This routine is called to notify Async APi that current job is processed
var QJcallback = function () {};
    
// Notice method is called by async within unknow context !!!!
var QJpost  = function (job, callback) {
    
    // decode AIS message NOW
    var ais = new AisEncode (job);
    
    // Some cleanup to make JSON/AIS more human readable
    job.lon = (parseInt(job.lon * 10000))/10000;
    job.lat = (parseInt(job.lat * 10000))/10000;
    job.sog = (parseInt(job.sog * 10))/10;
    job.cog = (parseInt(job.cog * 10))/10;

    // push data to JSON clients if any
    for (var sock in  TcpJsonSv.clients) {           
        TcpJsonSv.clients[sock].write (JSON.stringify (job) + "\n");
    }
    
    // push data to AIS clients if any
    for (var sock in  TcpAisSv.clients) {           
        TcpAisSv.clients[sock].write (ais.nmea);
    }
    
    // we're done wait SCK_PAUSE to send next message
    if (SockPause > 0) {
        QJhandle.pause ();
        setTimeout(function () {QJhandle.resume();}, SockPause);
        callback (); 
    }

};

// This method is executed at each a client hit TcpServer listening port
function TcpConnect (socket) {
    server= this;
    
    // new client push it to active list
    socket.uid=CLsockid ++;
    this.clients[socket.uid] = socket;
        
    // ignore & echo back any received data to client
    socket.on("data", function(buffer) {
        socket.write ("## DummyBackend ignoring -->"+ buffer); // a small prompt to make user happy when testing
    });

    // On error close socket
    socket.on('error', function (err) {
        delete server.clients[socket.uid];
        socket.end();
    });
        
    // Remove the device from gpsd active device list and notify adapter for eventual cleanup
    socket.on('end', function () {
        delete server.clients[socket.uid];  // remove client from active list
    });
};

function TcpSvrListenOk() {
    console.log ("------------------------------------------------"); 
    console.log ("--- DummyBackend listening tcp://%d", this.port);
    console.log ("------------------------------------------------"); 
}

// Server fail to listen on port [probably busy]
function TcpSvrListenFx (err) {
    console.log ("#### Hoops Dummy Backend fail to listen %s", err);
};

function BackendStorage (gpsd, opts){
    
    // prepare ourself to make debug possible
    this.uid="Dummy@nothing";
    this.gpsd =gpsd;
    this.debug=opts.debug;
    this.count=0;
    
    this.storesize= 20 +1;  // number of position slot/devices
    SockPause = opts.sockpause;
    
    // start our TCP server for json
    TcpJsonSv  = net.createServer(TcpConnect);
    TcpJsonSv.port= opts.jsonport;
    TcpJsonSv.clients=[];
    TcpJsonSv.listen(opts.jsonport, TcpSvrListenOk); 
    TcpJsonSv.on    ('error', TcpSvrListenFx);
 
    // start our TCP server for AIS/OpenCPN
    TcpAisSv  = net.createServer(TcpConnect);
    TcpAisSv.port = opts.aisport;
    TcpAisSv.clients=[];
    TcpAisSv.listen(opts.aisport, TcpSvrListenOk); 
    TcpAisSv.on    ('error', TcpSvrListenFx);

    QJhandle = async.queue  (QJpost, 1); // try to advoid two ais report at the same time

};  


// import debug method 
BackendStorage.prototype.Debug = Debug;

BackendStorage.prototype.PostToQueue = function (device) {
    
    
    // is this is the 1st post initiatte counter
    if (device.tcpcount === undefined) {
        device.tcpcount = 0;
    } else {
        device.tcpcount= (device.tcpcount +1 ) % 20;
    }
    
    // we repost shipname every 20 messages
    if (device.tcpcount === 0) {
        var ais24 =  { // class B static info type 24A
            msgtype    : 24,
            mmsi       : device.imei,
            shipname   : device.name,
            part       : 0
        };
        QJhandle.push (ais24, QJcallback);
    };    
        
    ais18= { // standard class B Position report
        msgtype    : 18,
        mmsi       : device.stamp.imei,
        lat        : device.stamp.lat, 	
        lon        : device.stamp.lon,
        sog        : device.stamp.speed,
        cog        : device.stamp.crs,
        hdg        : device.stamp.crs,
        moved      : device.stamp.moved,
        elapse     : device.stamp.elapse,
        date       : parseInt(device.stamp.date.getTime()/1000)
        };
   
    QJhandle.push (ais18, QJcallback);
};

BackendStorage.prototype.Connect = function (gpsd) {
    this.Debug (3,"Connect device:%s", device.uid);
};

// Typically would create an entry inside device database table
BackendStorage.prototype.CreateDev = function (devid, args) {
    this.Debug (3,"Create entry in DB for device:%s", device.uid);
};
// Typically would drop an entry inside device database table
BackendStorage.prototype.RemoveDev = function (devid, args) {
    this.Debug (3,"Drop entry in DB for device:%s", device.uid);
};

// Write last X positions on Telnet/Console
BackendStorage.prototype.LookupDev = function (callback, devid, args) {
    var device= this.gpsd.activeClients [devid];
    this.Debug (3,"Track entry in DB for device:%s", device.uid);
    var result=[];
    
    // start from last [most recent position]
    var pos=device.posIdx;
    // loop on fifo position storage
    for (var idx = 0; (idx < args && idx < this.storesize); idx ++) {
        // no [more] positions exit before end
        if  (device.posSto[pos] === undefined) break;

        // push position from new to old [fifo order]
        result.push (device.posSto[pos]);
        // if bottom of array restart from top
        pos --;  if (pos < 0) {pos = this.storesize -1;};
    }
    // let callback application with result
    callback (result);
};


BackendStorage.prototype.UpdateDev = function (device, command) {
    this.Debug (3,"UpdateDev File device:%s Command:%s", device.uid, command);
    
    // we have a fix set of request to make any backend transparent to the app
    switch (command) {
        
      case "AUTH_IMEI": 
            
            this.Debug (3,"Autentication accepted for device=%s", device.uid);
            device.loged   = true;
            
            // If default name not provided by the adapter, create one now
            if (device.name === undefined || device.name === false || device.name === null) device.name = "Test-Dev-" + this.count;
            
            // Create Ram storage array for tracking this.storesize positions
            if (device.posIdx === undefined) {
                device.posIdx = this.storesize-1;
                device.posSto = [];
            }
            
            this.count++;
            break;
                      
        case "UPDATE_POS" :
            if (device.loged !== true) return (-1);
            if (device.stamp.lat === 0 && device.stamp.lon === 0) return (-1);
            
            // post data to tcp sockets [ais and console]
            this.PostToQueue (device);

            // move to next avaliable position slot
            device.posIdx  = (device.posIdx + 1) % this.storesize;
            device.posSto [device.posIdx]=device.stamp; // stamp is already a position object
            // mark future position as empty [end if storage]
            device.posSto [(device.posIdx + 1) % this.storesize] = undefined;
            break;
        
       case "LOGOUT" :
            // change device status to logout
            device.loged = false;
            break;
            
      default:
          device.Debug (0,"uid=%s Query Unknown %s", device.uid, command);
          return -1;
    };
    return (0);
};


// if started as a main and not as module, then process test.
if (process.argv[1] === __filename)  {
    opts = {debug:9};
    console.log ("### Routine Test Backend finished");
    bck=new BackendStorage(null, opts);
 }
 
 
// export the class
module.exports = BackendStorage; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/

