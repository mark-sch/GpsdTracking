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

/*
 * This adaptateur wait in server mode for NMEA feed. As NMEA does not provide
 * vessel MMSI, the client should provide through a custum implementation an MMSI
 * at initialisation of the connection [cf: GpsdFlatFileSample].
 * 
 * If you're looking to consumer a remote NMEA-feed then check for Nmea-Tcp-Feed
 * 
 * GpsNmeaDecode implement a fake $GPRID Nmea command to resolve this. Depending
 * on your device, you may want to add your own "fake" NMEA authentication schema. 
 * 
 * Reference: http://fr.wikipedia.org/wiki/NMEA_0183
 * http://www.gpspassion.com/forumsen/topic.asp?TOPIC_ID=17661
 * http://rietman.wordpress.com/2008/09/25/how-to-calculate-the-nmea-checksum/
 * 
 */

var Debug       = require("../GpsdDebug");
var NmeaDecode  = require("../GpsdNmeaDecode");
var util   = require("util");

// Adapter is an object own by a given device controler that handle data connection
DevAdapter = function(controler) {
    this.uid       = "adapter:NMEA183//"  + controler.svcopts.port;
    this.info      = 'Nmea-183';
    this.debug     =  controler.svcopts.debug;  // inherit debug from controler
    this.controler = controler;  // keep a link to device controler and TCP socket
    this.control   = 'tcpsock';
    this.debug     = controler.svcopts.debug;  // inherit debug from controler
    this.Debug (1,"%s", this.uid);    

};

// Import debug method 
DevAdapter.prototype.Debug = Debug;
// Method is called each time a new client connect

// send a commant to activate GPS tracker
DevAdapter.prototype.SendCommand = function(socket, action, arg1) {
        switch (action) {
        case "WELLCOME": break;
        case "LOGOUT":   // warning at this point socket is not valid
            // force socket closing
            socket.end ();
            break;
        case "HELP":  // return supported commands by this adapter
                listcmd=["LOGOUT", "HELP"];  
                // push a notice HELP action event to gpsd
                device.controler.gpsd.event.emit ("notice", "HELP", listcmd, this.uid, socket.uid);
                break;
        default: 
            this.Debug (1,"Hoops NMEA has no command=[%s]", action);
            return (-1);     
        };
    // return OK status 
    this.Debug (5,"buffer=[%s]", this.packet);
    return (0);
};

 // Method is called each time a new client connect
DevAdapter.prototype.ClientConnect = function (socket) {
    // let's use TCP session to keep track of device
    socket.device = new GpsdTcpClient (socket);
     
    // attach line counter and tempry buffer to socket session 
    socket.lineidx   = 0;                       // index within buffer
    socket.linebuf   = new Buffer (256);        // intermediary buffer
    socket.count     = 0;

    // Sharing one unique parser for all clients looks OK 
    // socket.parser =  this.GetParser();
};

// Method is called each time a client quit
DevAdapter.prototype.ClientQuit = function (socket) {
    socket.device.RequestAction ('LOGOUT');
};

DevAdapter.prototype.ParseBuffer = function(socket, buffer) {
    this.Debug  (9, "request=[%s]", buffer);
    
    // split buffer multiple lines if any and remove \r\n
    for (var idx=0; idx < buffer.length; idx++) {
        switch (buffer [idx]) {
            // ; is like a \n except that we include it in line for parsing
            case 0x0A:  // new line \n
                var status = this.ParseLine (socket, socket.linebuf.toString ('ascii',0, socket.lineidx));
                socket.lineidx=0;
                break;
            case 0x0D: break;  // cariage return \r
            default: 
                socket.linebuf[socket.lineidx] = buffer [idx];
                socket.lineidx++;
            }
    }
};

// This routine is call from DevClient each time a new line arrive on socket
DevAdapter.prototype.ParseLine = function(socket, line) {
    var device=socket.device;
  
     var data = new NmeaDecode (line);
    if (!data.valid) return (-1);
    data.count= socket.count ++; // message count for debug/stat
         
    // final processing of this.data return from parser
    switch (data.cmd) {
        case "EMPTY": // just a promt for checking service
            socket.write ("gpsd-tracking: " + device.uid + " running\n");
            break;       
        case "LOGIN":
            socket.write ("NMEA accepted imei=[" + device.imei + "] route=[" + device.name + "]\n");
            break;
        default: // just nothing to do this is a normal GPRMC packet
            break;     
    };
    // ask device to process data
    socket.device.ProcessData (data);
    return (0);
};

// Import debug method 
DevAdapter.prototype.Debug = Debug;

module.exports = DevAdapter; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/
