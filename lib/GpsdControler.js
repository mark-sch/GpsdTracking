// Modified by Fulup to support MySQL

util        = require("util");
eventEmitter= require("events").EventEmitter;
net         = require('net');
fs          = require('fs');
path        = require('path');

Device      = require('./GpsdDevice');
Debug       = require("./GpsdDebug");

// Build adapters list directly from directory contend
var availableAdapters =[]; {
    var adaptersDir =  __dirname  +  "/adapters/";
    var directory   = fs.readdirSync(adaptersDir);
    for (var i in directory) {
        var filename = directory [i];
        var adapter  = path.basename (filename,"-adapter.js");
        var name = adaptersDir + directory[i];
        if (fs.statSync(name).isFile()) {
            availableAdapters [adapter] = name;
        } 
    console.log ("Registering: " + adapter + " file: " + availableAdapters [adapter]);
    }
};   


// [Must be known] TcpConnect handler extend net.createServer object
// This method is executed at each a client hit TcpServer listening port
TcpConnect = function (socket) {
    this.count ++;    // increment client count inside this server
    var controler= this.controler;
    
    socket.uuid = "Socket://" + socket.remoteAddress +":" + socket.remotePort;
    controler.Debug(5, "N°:%d Server=[%s] Client: [%s]"
             ,this.count,this.uuid,socket.uuid);            
        
    // attach new device object to client socket
    socket.device = new Device (this, socket); 
				
    // send any received data to device parser
    socket.on("data", function(buffer) {
	controler.Debug(7, "%s Data=[%s]", socket.device.uuid, buffer);
        socket.device.ProcessData (socket, buffer);  // send data to tracker specific adaptater function
    });

    // On error close socket
    socket.on('error', function (err) {
        controler.Debug(5, "%s ERROR=[%s]", socket.device.uuid, err);
        socket.end();
    });
        
    // Remove the device from gpsd active device list and notify adapter for eventual cleanup
    socket.on('end', function () {
        var gpsd = socket.device.controler.gpsd;
	controler.Debug(5, "Device Quit imei=%s uuid=%s", socket.device.imei, socket.device.uuid); 
        socket.device.RequestAction ("LOGOUT");
        delete controler.gpsd.activeClients [socket.device.imei];
    });
	
   
};

// this method is call after TCP server start listening
TcpListen= function () {
    this.controler.Debug (3,"TcpServer [%s] listening", this.uuid);
};
    
// devServer object embed TcpServer and Device objects
GpsdControler =function (gpsd, service) {
    // Add DebugTool to log messages
    this.uuid   = "GpsdControler://" + service.info + "/" + service.adapter + ":" + service.port;
    this.debug  = gpsd.debug;
    this.service= service;
    this.gpsd   = gpsd;
    
    // load device adapter as described within service option from user application
    var DevAdapter   =  require(availableAdapters [service.adapter]);
    this.adapter  =  new DevAdapter (this);
    
    // finish object initialisation
    this.GpsdControler (gpsd, service);
};

// import debug method 
GpsdControler.prototype.Debug = Debug;

// finish object initialisation
GpsdControler.prototype.GpsdControler = function (gpsd, service) {
    // Start Server and use its handler to store informations needed within tcpConnect
    this.tcpServer           = net.createServer(TcpConnect);
    this.tcpServer.uuid      = "TcpServer://" + service.adapter + ':' + service.port;
    this.tcpServer.controler = this;
    this.tcpServer.count     = 0;           // number of active tcp clients 

    // Activate server to listern on its TCP port
    this.tcpServer.listen(service.port, TcpListen);
    
    this.tcpServer.on('error', function (err) {
        gpsd.Debug (0,"Hoop fail to listen port: %d ==> %s", service.port, err);
        console.log ("### GPSd process abort ###");
    process.exit (-1);
    });
};


module.exports = GpsdControler; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/

