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
 * DOCUMENTATION
 * -------------
 * 
 * This AIS simulator sample demonstrates how to simulate multiple AIS targets
 * 
 * It scan ../samples/simulator directory, searches for .gpx files,
 * Starts one as NMEA feed and any others has AIS targets.
 * Shipname and other simulator parameters are built from filename, that have
 * to respect "shipname-mmsi-speed-tcpport.gpx" patern.
 * 
 * Ais Simulator support both server and client mode. Its simulates real life
 * AIS/GPS feed (boats navigation instruments, AIShub, MarineTraffic, ....)
 * 
 * This sample acts as GPS/AIS hub for clients applications
 *  - It starts multiple instances of GpsdSimulator
 *  - Collects events send by those simulators
 *  - Make those event avaliable over a TCP socket feed 
 *  
 * Note:
 * 
 *  - Demo feeds using this simulator are avaliable at:  
 *    tcp://sinagot.net:4000 a fake hub with one NMEA and multiple AIS targets 
 *    tcp://sinagot.net:4001 a unique NMEA feed
 *    tcp://sinagot.net:4002 a unique AIS feed
 *  - few gpx routes are avaliable in sample/simulator directories
 *  - buid your own gpx routes with OpenCPN or one line with http://www.visugpx.com/editgpx/
 *  
 *  - If your only need on feed of AIQ data then take SimpleNmeaSimulator.
 *  - If you need to simulate multiple vessel, or want to create your own
 *    simulator application, this is the right place to start.
 * 
 */


// ------------------ Global options -------------------------------------------
   GPX_DIR= "/../samples/simulator/"; //where to find GPX routes
   SVC_POR= 4001;                     // what ever please you
   DBG_LEV= 4;                        // from 0 to 9
   AIS_TIC= 10;                       // ais refresh status report rate
   SCK_PSE= 500;                      // wait 0.5s in between each messages
// =============================================================================

var GpsdSimulator = require("../lib/GpsdSimulator"); 

var net           = require('net');
var fs            = require('fs');
var path          = require('path');
var traceback     = require('traceback'); // https://www.npmjs.org/package/traceback
var util          = require("util");
var async         = require("async");


// static global variables
var globalcount=0;     // number of gpx route
var activeClients=[];  // global array for clients
var QJhandle;          // push data to client 0.5s sleep time in between messages
var CLsockid=0;        // provide a unique id to socket for cleaning activeClients

function Debug (level, format) {  //+ arguments
    if (level <= DBG_LEV) {

        args = [].slice.call(arguments, 1); // copy argument in a real array leaving out level
        trace=traceback()[1];               // get trace up to previous calling function
        this.message=util.format.apply (null, args);
        if (DBG_LEV >7) console.log ("-%d- %s/%s:%d -- %j", level, trace.file, trace.name, trace.line, this.message);
           else console.log ("-- %s -- %j", level, trace.name, this.message);
    };
};

// provide automatic default values for AIS vessel 
MakeDefaults = function (route, args) {
    this.route = route;
    this.args  = args;
    this.count = globalcount++;  // counter for dummy mmsi
};

MakeDefaults.prototype.Shipname = function () {
    // use filename 1st part 
    this.shipname = this.args[0];
    return (this.shipname);
};

MakeDefaults.prototype.Tic = function () {
    // 2s for gprmc that emulate a GPS and not an AIS transpondeur
    if (this.mmsi === 0)  return (1);
    return (AIS_TIC);
};

MakeDefaults.prototype.Mmsi = function () {
    var mmsi;
    if (this.args[1] !== 'undefined') {
       mmsi =  parseInt (this.args[1]);
    } else {
       if (this.count === 0)  mmsi = 0;
       else mmsi = parseInt ('1000000' + this.count);
    }
    this.mmsi= mmsi;
    return (mmsi);
};

MakeDefaults.prototype.Callsign = function () {
    this.callsign = 'SIM00' + this.count; 
    return (this.callsign);
};

MakeDefaults.prototype.Speed = function () {
    var speed;
    if (this.args[2] !== undefined) {
       speed =  parseInt (this.args[2]);
       if (speed === 0)  speed = 5 + Math.random() * 30;
    } else {
        speed = 5 + Math.random() * 30;
    }
    this.speed=speed;
    return (speed);
};
MakeDefaults.prototype.Proto = function () {
    if (this.mmsi === 0) {
        proto = "gprmc";
    } else {
        proto = "aivdm";
    }
    return (proto);
};
MakeDefaults.prototype.Len = function () {
    var len;
    if (this.speed <  20) len = 10 + Math.random() * 20;
    if (this.speed >= 20) len = 20 + Math.random() * 100;
    this.len=len;
    return (len);
};
MakeDefaults.prototype.Wid = function () {
    var wid;
    if (this.len <   30)  wid = this.len / 3; 
    if (this.len >=  30)  wid = this.len / 3; 
    this.wid=0;
    return (wid);
};

MakeDefaults.prototype.Uway = function () {
    var uway=0;
    if (this.cargo === 30) uway = 7; // fishing
    if (this.cargo === 36) uway = 8; // sailling
    this.uway=uway;
    return (uway);
};

MakeDefaults.prototype.Cargo = function () {
    var cargo=70;
    if (this.len > 15  &&  this.speed <15)  cargo = 30;  // fishing
    if (this.len < 15  &&  this.speed <10)  cargo = 36;  // sailling
    if (this.len < 15  &&  this.speed <15)  cargo = 37;  // pleasure
    if (this.len >= 15 &&  this.speed >=20)  cargo = 70;  // cargo
    if (this.len >= 15 &&  this.speed >=30) cargo = 60; // passenger
    this.cargo=cargo;
    return (this.cargo);
};

MakeDefaults.prototype.Class = function () {
    if (this.len > 15)  this.class='A';
    else this.class='B';
    return (this.class);
};


// This routine is called to notify Async APi that current job is processed
var QJcallback = function () {};
    
// Notice method is called by async within unknow context !!!!
var QJpost  = function (paquet, callback) {
    if (paquet === null) {callback ();}
    
    // wait tic time before sending next message
    QJhandle.pause (); 
    
    for (var sock in activeClients) {           
        activeClients [sock].write (paquet);
    }
    
    // we're done wait SCK_PAUSE to send next message
    setTimeout(function () {QJhandle.resume();}, SCK_PSE);
    callback (); 
};
    

// This method is executed at each a client hit TcpServer listening port
function TcpConnect (socket) {
    // new client push it to active list
    socket.uid=CLsockid ++;
    activeClients[socket.uid] = socket;
    Debug(5, "New Client RemAddr:[%s] RemPort:[%s]", socket.remoteAddress,  socket.remotePort);
        
    // send any received data to device parser
    socket.on("data", function(buffer) {
	Debug(7, "Notice: %s/%s Data=[%s]", socket.remoteAddress, socket.remotePort, buffer);
        socket.write ("## GpsSimulator ignoring -->"+ buffer); // a small prompt to make user happy when testing
    });

    // On error close socket
    socket.on('error', function (err) {
        Debug(2, "***** Error: remote:[%s] port:[%s]", socket.remoteAddress,  socket.remotePort);
        delete activeClients[socket.uid];
        socket.end();
    });
        
    // Remove the device from gpsd active device list and notify adapter for eventual cleanup
    socket.on('end', function () {
        Debug(5, "Quit:  remote:[%s] port:[%s]", socket.remoteAddress,  socket.remotePort);
        delete activeClients[socket.uid];  // remove client from active list
    });
};

function TcpSvrListenOk() {
    QJhandle  = async.queue  (QJpost, 1); // try to advoid two ais report at the same time
    console.log ("------------------------------------------------"); 
    console.log ("--- AisSimulatorHub listening tcp://%d", SVC_POR);
    console.log ("------------------------------------------------"); 
    console.log ("--- Simple check with [telnet localhost %d]", SVC_POR);
    console.log ("------------------------------------------------"); 
}

// Server fail to listen on port [probably busy]
function TcpSvrListenFx (err) {
    Debug (0,"Hoop fail to listen port: %d ==> %s", this.service.port, err);
    console.log ("### GPSdSimulator process abort ###");
    process.exit (-1);
};

// ----------- User Event Handler -----------------
function ListenEvents (simulator) {
    var count =0;  // Simple counter to make easier to follow message flow
    
    var MathDec = function (number, dec) {
        var expo=Math.pow (10, dec);
        return (parseInt (number*expo)/expo);
    };
       
    // Events from queued jobs
    EventHandlerNotice = function (state, opts){ // this.event.emit ("notice","START",this.opts);
        Debug (1, "## Notice State=%s Shipname=%s Mmsi=%s", state, opts.shipname, opts.mmsi);
    };	
    // Events successful process by tracker adapter
    EventHandlerAivdm = function (aisrqt, nmea){ // this.event.emit ("aivdm", aisrqt, ais.nmea);
         // { msgtype : 3/18, cog, sog, lat, lon, mmsi}
         // { msgtype : 5, mmsi, shipname, cargo, callsign, draught, imo, dimA, dimB, dimC, dimD} 
         // { msgtype : 24 && part=0, mmsi, shipname}
         // { msgtype : 24 && part=1, mmsi, cargo, callsign, dimA, dimB, dimC, dimD}  
         // console.log ("EventHandlerAivdm type=%d", aisrqt.msgtype);
         switch (aisrqt.msgtype) {
            case 3:  // class A position report
            case 18: // class B position report
                
                Debug (3, "## Ais mmsi:type:3,18 [%s] Lon=%d Lat=%s Speed=%s Bearing=%s", aisrqt.mmsi, MathDec(aisrqt.lon,4), MathDec(aisrqt.lat) , aisrqt.sog, aisrqt.cog);
                break;
            case 5:
            case 24:
                 Debug (2,"## Ais type:5,24 mmsi:[%s] Shipname=%s", aisrqt.mmsi, aisrqt.shipname);
                 break;
            default:
                 Debug (1,"## Ais type:%s mmsi:[%s] unsupported", aisrqt.msgtyp, aisrqt.mmsi);
        }
        // post new nmea paquet to the queue
        QJhandle.push (nmea, QJcallback);
    };
     // Events on action refused by tracker adapter 
    EventHandlerGprmc = function(job, nmea){ // this.event.emit ("gprmc", job, ais.nmea);
        // job={lon=xx, lat=xx, speed=xx, bearing=xxx}
        Debug (3, "## Gprmc Lon=%d Lat=%s Speed=%s Bearing=%s", MathDec(job.lon), MathDec(job.lat), job.speed, job.bearing);
        // post new nmea paquet to the queue
        QJhandle.push (nmea, QJcallback);
    };

    // let's use the same event handler for all gpsdTracker
    simulator.event.on("gprmc",EventHandlerGprmc);	
    simulator.event.on("aivdm",EventHandlerAivdm);	
    simulator.event.on("notice",EventHandlerNotice);
};
               
// scan directory and extract all .gpx files
function ScanGpxDir (gpxdir) {
    var availableRoutes=[];
    var count=0;
    var routesDir = __dirname  + gpxdir;
    var directory = fs.readdirSync(routesDir);
    for (var i in directory) {
        var file = directory [i];
        var route  = path.basename (directory [i],".gpx");
        var name = routesDir + route + '.gpx';
        try {
            if (fs.statSync(name).isFile()) {
                count ++;
                availableRoutes [route] = name;
                console.log ("Registering: " + route + " file: " + availableRoutes [route]);
            }
        } catch (err) {/* ignore errors */};
    }
    if (count < 3) {
        console.log ("Find only [%d] GPX file in [%s] please check your directory", count, GPX_DIR);
        process.exit (-1);
    }
    return (availableRoutes); 
};

// scan gpx directory file
gpxroutes=ScanGpxDir (GPX_DIR);
    
// start one GpsSimulator instance per gpx file
var opt=[];
var simu=[];
for (ship in gpxroutes) {
    
    // buit simulator params from file name
    var args= ship.split ("-");
    var shipname = args[0];
    var mmsi     = parseInt (args[1]);
    var speed    = parseInt (args[2]);
    
    getdefault= new MakeDefaults(ship, args);
    
    opt[ship]=[];
    opt[ship].gpxfile    = gpxroutes[ship];       // gps filename path
    opt[ship].mmsi       = getdefault.Mmsi();     // from filename or getdefault
    opt[ship].shipname   = getdefault.Shipname();
    opt[ship].speed      = getdefault.Speed();    // getdefault 0 to 50knts
    opt[ship].tic        = getdefault.Tic();       // let's update AIS every xxxs
    opt[ship].debug      = DBG_LEV;               // debug level
    opt[ship].proto      = getdefault.Proto();    // Ais if MMSI set
    opt[ship].port       = -1;                    // we only register to simulator events
    opt[ship].len        = getdefault.Len();
    opt[ship].wid        = getdefault.Wid();
    opt[ship].loopwait   = 10;
    opt[ship].callsign   = getdefault.Callsign();
    opt[ship].cargo      = getdefault.Cargo();  
    opt[ship].uway       = getdefault.Uway();
    opt[ship].class      = getdefault.Class();
    
    // start one simumator per ship and register to receive its events    
    // console.log (opt[ship]);
    simu[ship] = new GpsdSimulator (opt[ship]);
    ListenEvents (simu[ship]);
}

 // start our TCP server and wait for client to popup
 tcpServer  = net.createServer(TcpConnect);
 tcpServer.listen(SVC_POR, TcpSvrListenOk); 
 tcpServer.on    ('error', TcpSvrListenFx);

