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

SockClient  = require('./GpsdTcpClient');
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
    
    socket.uid = "Socket://" + socket.remoteAddress +":" + socket.remotePort;
    socket.controler = this.controler;
    socket.adapter   = this.adapter;
    socket.controler.Debug(5, "N°:%d Server=[%s] Client: [%s]"
             ,this.count,this.uid,socket.uid);            
        
    // attach new device object to client socket
    socket.device = new GpsdTcpClient (socket); 
    
    // notify adapter that it has a new client device connected
    socket.adapter.ClientConnect (socket);
  
    // send any received data to device parser
    socket.on("data", function(buffer) {
	socket.controler.Debug(7, "%s Data=[%s]", socket.device.uid, buffer);
        
        // call adapter specific method to process messages
        var status = socket.adapter.ParseBuffer(socket, buffer);
    });

    // On error close socket
    socket.on('error', function (err) {
        socket.controler.Debug(5, "%s ERROR=[%s]", socket.device.uid, err);
        this.adapter.ClientQuit(socket);
        socket.end();
    });
        
    // Remove the device from gpsd active device list and notify adapter for eventual cleanup
    socket.on('end', function () {
        var gpsd = socket.controler.gpsd;
	socket.controler.Debug(5, "SockClient Quit imei=%s uid=%s", socket.device.imei, socket.device.uid); 
        this.adapter.ClientQuit(socket);
    });
};

// in HTTP mode they is not initial connection concept adapter as to handle data.
HttpRequest= function (request, response) {
   
    this.controler.Debug(7, "Data=[%s]", request.url);
    var data= this.adapter.ProcessData (request, response);
    // processing of http responses is done at adapter level
};

TcpSvrListenOk= function () {
    this.controler.Debug (3,"TcpServer [%s] listening", this.uid);
};

// Server fail to listen on port [probably busy]
TcpSvrListenFx = function  (err) {
    this.controler.Debug (0,"Hoop fail to listen port: %d ==> %s", this.svcopts.port, err);
    console.log ("### GPSd process abort ###");
    process.exit (-1);
};
    
// Client suceded connected to remote server
TcpClientConnect = function  () {
    this.controler.Debug (3,"[%s] connected", this.uid);
    // notify adapter that it has a new client device connected
    this.adapter.ClientConnect (this);
};
    
// Client receive data from server
TcpClientData = function  (buffer) {
    this.controler.Debug(7, "[%s] Data=[%s]", this.uid, buffer);
    // call adapter specific routine to process messages
    var status = this.adapter.ParseBuffer(this, buffer);
   
};

// Remote server close connection
TcpClientEnd = function  () {
    var svcopts   = this.svcopts;  // make objec info visible inside timer handler
    var controler = this.controler;
    var gpsd      = this.controler.gpsd;
    var svc       = this.controler.svc;
        
    controler.Debug (3,"[%s] connection ended", this.uid);
    this.adapter.ClientQuit(this);
    setTimeout (function(){ // wait for timeout and recreate a new Object from scratch
        gpsd.controlers [svc] = new GpsdControler (gpsd, svcopts, svc);
    }, this.svcopts.timeout*1000);
};
// Remote server close connection
TcpClientError = function  (err) {
    var svcopts   = this.svcopts;  // make objec info visible inside timer handler
    var controler = this.controler;
    var gpsd      = this.controler.gpsd;
    var svc       = this.controler.svc;
    
    this.controler.Debug (2,"[%s] connection err=%s", this.uid, err);
    this.end();
    this.adapter.ClientQuit(this);
    setTimeout (function(){ // wait for timeout and recreate a new Object from scratch
        gpsd.controlers [svc] = new GpsdControler (gpsd, svcopts, svc);
    }, this.svcopts.timeout*1000);
};
    
// devServer object embed TcpServer and SockClient objects
GpsdControler =function (gpsd, svcopts, svc) {
    // Add DebugTool to log messages
    this.uid    = "GpsdControler://" + svcopts.info + "/" + svcopts.adapter + ":" + svcopts.port;
    this.debug  = gpsd.debug;
    this.svcopts= svcopts;
    this.gpsd   = gpsd;
    this.svc    = svc;
    
    // take care or default adapter svcopts
    if (this.svcopts.mindist  === undefined) this.svcopts.mindist =200; // in m
    if (this.svcopts.maxtime  === undefined) this.svcopts.maxtime =3600;// in s == 1h
    if (this.svcopts.maxspeed === undefined) this.svcopts.maxspeed=100;  // in 100m/s=~400km/h  
    if (this.svcopts.debug    === undefined) this.svcopts.debug   =gpsd.debug;
    
    
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
    
    // Depending on adapter's control type logic for handling tcp socket change
    switch (this.adapter.control) {
    case 'tcpsock':
        // in tcpsock mode gpsd uses tcp session to track a given device.
        // Each time a new client raises, it creates a new TcpConnect and attaches
        // a SockClient object to it. Device handler is then called from SockClient.
        this.tcpServer           = net.createServer(TcpConnect);
        this.tcpServer.uid       = "TcpServer://" + svcopts.adapter + ':' + svcopts.port;
        this.tcpServer.controler = this;
        this.tcpServer.adapter   = this.adapter;
        this.tcpServer.svcopts   = svcopts;
        this.tcpServer.count     = 0;           // number of active tcp clients 
        this.tcpServer.listen(svcopts.port, TcpSvrListenOk); 
        this.tcpServer.on('error', TcpSvrListenFx);
        break;
    case 'http':
        // in http mode, gpsd cannot use tcp session to handle device, and deviceID
        // has to be present in each http/post. HttpRequest function calls
        // device adapter specific functions directly. The adapter creates
        // an HttpClient object based on devID present within each http/post request.
        this.tcpServer           = http.createServer(HttpRequest);
        this.tcpServer.uid      = "HttpServer://" + svcopts.adapter + ':' + svcopts.port;
        this.tcpServer.controler = this;
        this.tcpServer.adapter   = this.adapter;
        this.tcpServer.svcopts   = svcopts;
        this.tcpServer.listen(svcopts.port, TcpSvrListenOk); 
        this.tcpServer.on('error', TcpSvrListenFx);
        break;
    case 'tcpfeed':
        // in tcpfeed, gpsd is a client of a remote server. And only one svcopts is
        // attached to a given instance of an adapter. Connected being unique it
        // is directly handled at adapter level.
        if (svcopts.hostname === undefined) svcopts.hostname='localhost';
        if (svcopts.timeout  === undefined) svcopts.timeout=60;
        this.tcpClient           =  net.createConnection(svcopts.port, svcopts.hostname);
        this.tcpClient.uid       = "TcpClient://" + svcopts.adapter + ':' + svcopts.port;
        this.tcpClient.controler = this;
        this.tcpClient.adapter   = this.adapter;
        this.tcpClient.svcopts   = svcopts;
        this.tcpClient.setKeepAlive(enable=true, 1000);
        this.tcpClient.on('connect', TcpClientConnect);
        this.tcpClient.on('data'   , TcpClientData); 
        this.tcpClient.on('end'    , TcpClientEnd);
        this.tcpClient.on('error'  , TcpClientError);
        break;
    default:
        this.Debug (0,"Hoops Invalid control class [%s] adapter [%s] class", adapter.control, availableAdapters [svcopts.adapter]);
    }
};

// import debug method 
GpsdControler.prototype.Debug = Debug;

module.exports = GpsdControler; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/

