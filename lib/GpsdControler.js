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

util        = require("util");
eventEmitter= require("events").EventEmitter;
net         = require('net');
fs          = require('fs');
path        = require('path');
http        = require("http");  

SockClient  = require('./GpsdSockClient');
HttpClient  = require('./GpsdHttpClient');
Debug       = require("./GpsdDebug");

// Build adapters list directly from directory contend
var availableAdapters =[]; {
    var adaptersDir =  __dirname  +  "/adapters/";
    var directory   = fs.readdirSync(adaptersDir);
    for (var i in directory) {
        var filename = directory [i];
        var adapter  = path.basename (filename,"-adapter.js");
        var name = adaptersDir + adapter + "-adapter.js";
        try {
            if (fs.statSync(name).isFile()) {
                availableAdapters [adapter] = name;
                console.log ("Registering: " + adapter + " file: " + availableAdapters [adapter]);
            }
        } catch (err) {/* ignore errors */};    
    }
};   


// [Must be known] TcpConnect handler extend net.createServer object
// This method is executed at each a client hit TcpServer listening port
TcpConnect = function (socket) {
    this.count ++;    // increment client count inside this server
    var controler= this.controler;
    
    socket.uid = "Socket://" + socket.remoteAddress +":" + socket.remotePort;
    controler.Debug(5, "N°:%d Server=[%s] Client: [%s]"
             ,this.count,this.uid,socket.uid);            
        
    // attach new device object to client socket
    socket.device = new SockClient (this, socket); 
				
    // send any received data to device parser
    socket.on("data", function(buffer) {
	controler.Debug(7, "%s Data=[%s]", socket.device.uid, buffer);
        socket.device.ProcessData (socket, buffer);  // send data to tracker specific adaptater function
    });

    // On error close socket
    socket.on('error', function (err) {
        controler.Debug(5, "%s ERROR=[%s]", socket.device.uid, err);
        socket.end();
    });
        
    // Remove the device from gpsd active device list and notify adapter for eventual cleanup
    socket.on('end', function () {
        var gpsd = socket.device.controler.gpsd;
	controler.Debug(5, "SockClient Quit imei=%s uid=%s", socket.device.imei, socket.device.uid); 
        socket.device.RequestAction ("LOGOUT");
    });
};

// Let's send posted data directly to device adapter
HttpRequest= function (request, response) {
   
    data= this.controler.adapter.ProcessData (request);
    response.writeHeader(200, {"Content-Type": "text/plain"});  
    response.write(data);
    response.end();  
};

TcpSvrListenOk= function () {
    this.controler.Debug (3,"TcpServer [%s] listening", this.uid);
};

// Server fail to listen on port [probably busy]
TcpSvrListenFx = function  (err) {
    this.controler.Debug (0,"Hoop fail to listen port: %d ==> %s", this.service.port, err);
    console.log ("### GPSd process abort ###");
    process.exit (-1);
};
    
// Client suceded connected to remote server
TcpStreamConnect = function  () {
    this.controler.Debug (3,"[%s] connected", this.uid);
    data= this.controler.adapter.StreamLogin (this);
};
    
// Client receive data from server
TcpStreamData = function  (buffer) {
    // Send Data for processing directy to adapter
    this.controler.Debug(7, "[%s] Data=[%s]", this.uid, buffer);
    data= this.controler.adapter.ProcessData (this, buffer);
};

// Remote server close connection
TcpStreamEnd = function  () {
    var service   = this.service;  // make objec info visible inside timer handler
    var controler = this.controler;
    var gpsd      = this.controler.gpsd;
    var svc       = this.controler.svc;
        
    controler.Debug (3,"[%s] connection ended", this.uid);
    data= this.controler.adapter.StreamLogout (this);
    setTimeout (function(){ // wait for timeout and recreate a new Object from scratch
        gpsd.controlers [svc] = new GpsdControler (gpsd, gpsd.opts.services[svc], svc);
    }, this.service.timeout*1000);
};
// Remote server close connection
TcpStreamError = function  (err) {
    var controler = this.controler;
    var gpsd      = this.controler.gpsd;
    var svc       = this.controler.svc;
    
    this.controler.Debug (3,"[%s] connection err=%s", this.uid, err);
    this.end();
    data= this.controler.adapter.StreamLogout (this);
    setTimeout (function(){ // wait for timeout and recreate a new Object from scratch
        gpsd.controlers [svc] = new GpsdControler (gpsd, gpsd.opts.services[svc], svc);
    }, this.service.timeout*1000);
};
    
// devServer object embed TcpServer and SockClient objects
GpsdControler =function (gpsd, svcopts, svc) {
    // Add DebugTool to log messages
    this.uid   = "GpsdControler://" + svcopts.info + "/" + svcopts.adapter + ":" + svcopts.port;
    this.debug  = gpsd.debug;
    this.opts   = svcopts;
    this.gpsd   = gpsd;
    this.svc    = svc;
    
    // take care or default adapter opts
    if (this.opts.mindist  === undefined) this.opts.mindist=200; // in m
    if (this.opts.maxtime  === undefined) this.opts.maxtime=3600;// in s == 1h
    if (this.opts.maxspeed === undefined) this.opts.maxspeed=55;  // in meter/s ==200km/h
    if (this.opts.debug    === undefined) this.opts.debug=gpsd.debug;
    
    
    // load device adapter as described within svcopts option from user application
    try {
        var  adapter  =  require(availableAdapters [svcopts.adapter]);  
    } catch (err) {
        this.Debug (0, 'Invalid adapter name : [%s]', svcopts.adapter);
        console.log ("Gpsd aborted");
        process.exit();
    }
    this.adapter           =  new adapter (this);
    this.adapter.controler =  this;
    
    // finish object initialisation
    this.GpsdControler (gpsd, svcopts);
};

// import debug method 
GpsdControler.prototype.Debug = Debug;

// finish object initialisation
GpsdControler.prototype.GpsdControler = function (gpsd, service) {

    // Depending on adapter's control type logic for handling tcp socket change
    switch (this.adapter.control) {
    case 'tcpsock':
        // in tcpsock mode gpsd uses tcp session to track a given device.
        // Each time a new client raises, it creates a new TcpConnect and attaches
        // a SockClient object to it. Device handler is then called from SockClient.
        this.tcpServer           = net.createServer(TcpConnect);
        this.tcpServer.uid       = "TcpServer://" + service.adapter + ':' + service.port;
        this.tcpServer.service   = service;
        this.tcpServer.controler = this;
        this.tcpServer.count     = 0;           // number of active tcp clients 
        this.tcpServer.listen(service.port, TcpSvrListenOk); 
        this.tcpServer.on('error', TcpSvrListenFx);
        break;
    case 'http':
        // in http mode, gpsd cannot use tcp session to handle device, and deviceID
        // has to be present in each http/post. HttpRequest function calls
        // device adapter specific functions directly. The adapter creates
        // an HttpClient object based on devID present within each http/post request.
        this.tcpServer           = http.createServer(HttpRequest);
        this.tcpServer.uid      = "HttpServer://" + service.adapter + ':' + service.port;
        this.tcpServer.controler = this;
        this.tcpServer.service   = service;
        this.tcpServer.listen(service.port, TcpSvrListenOk); 
        this.tcpServer.on('error', TcpSvrListenFx);
        break;
    case 'tcpfeed':
        // in tcpfeed, gpsd is a client of a remote server. And only one service is
        // attached to a given instance of an adapter. Connected being unique it
        // is directly handled at adapter level.
        if (service.hostname === undefined) service.hostname='localhost';
        if (service.timeout  === undefined) service.timeout=60;
        this.tcpStream           =  net.createConnection(service.port, service.hostname);
        this.tcpStream.uid       = "TcpStream://" + service.adapter + ':' + service.port;
        this.tcpStream.controler = this;
        this.tcpStream.service   = service;
        this.tcpStream.setKeepAlive(enable=true, 1000);
        this.tcpStream.on('connect', TcpStreamConnect);
        this.tcpStream.on('data'   , TcpStreamData); 
        this.tcpStream.on('end'    , TcpStreamEnd);
        this.tcpStream.on('error'  , TcpStreamError);
        break;
    default:
        this.Debug (0,"Hoops Invalid class [%s] adapter [%s] class", adapter.control, availableAdapters [service.adapter]);
    }
    
};


module.exports = GpsdControler; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/

