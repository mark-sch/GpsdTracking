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
 * This adapter consumes NMEA183 messages from a remote/local TCP feed as
 * exported by Gpsd, AisHub, ...
 *      - gpsd    http://www.catb.org/gpsd
 *      - aishub  http://www.aishub.net/
 *      - check  tcp://sinagot.net:4001 for testing data
 * Note: adapter supports GPRMC/GPGGA and take a fake imei/mmsi througt
 * options, provided by user application. [cf: AisTrackerSample]
 * 
 * Reference: http://www.catb.org/gpsd/client-howto.html
 */

var Debug       = require("../GpsdDebug");
var NmeaDecode  = require("../GpsdNmeaDecode");
var Vessel      = require('../GpsdTcpClient'); // make each device a fake imei device

var registermmsi=[];  // keep track of nmea MMSI for uniqueness

// Adapter is an object own by a given device controler that handle data connection
DevAdapter = function(controler) {
    this.uid       = "DevAdapter/" + "nmeatcp/mmsi:" + controler.svcopts.mmsi;
    this.info      = 'nmeatcp';
    this.control   = 'tcpfeed';               // this adapter connect onto a remote server  
    this.debug     =  controler.svcopts.debug;         // inherit debug from controler
    this.controler =  controler;               // keep a link to device controler and TCP socket
    this.mmsi      =  controler.svcopts.mmsi;  // use fake MMSI provided by user application in service options
    
    // Check mmsi is unique
    if (registermmsi [this.mmsi] !== undefined) {
        this.Debug (0,'Fatal adapter:%s this.mmsi:%s SHOULD be unique', this.info, this.mmsi);
        console.log ("Gpsd [duplicated NMEA MMSI] application aborted [please fix your configuration]");
        process.exit (-1);
    } else {
       registermmsi [this.mmsi] = true; 
    }
};

// Import debug method 
DevAdapter.prototype.Debug = Debug;

DevAdapter.prototype.ClientConnect = function (socket) {
    // in case we are facing gpsd send nmea watch command
    socket.write ('?WATCH={"enable":true,"nmea":true}');

    // With NMEA we have one Device/Vessel per adapter instances
    // Force a fake login as nmea feed does not provide a proper Login/MMSI.
    var data = 
            {cmd  :'LOGIN'
            ,imei : this.mmsi
            ,model:'gprmc'
            ,call :'none'
            };
    socket.device = new GpsdTcpClient (socket);
    socket.device.ProcessData (data);
     
    // attach line counter and tempry buffer to socket session 
    socket.lineidx   = 0;                       // index within buffer
    socket.linebuf   = new Buffer (256);        // intermediary buffer
    socket.count     = 0;

    // Sharing one unique parser for all clients looks OK 
    // socket.parser =  this.GetParser();
};


// NMEA does not provide imei/mmsi, let's use the one provided by user's app opts 
DevAdapter.prototype.ClientQuit = function (socket) {
    if (registermmsi [this.mmsi] !== undefined)  {
        delete registermmsi [this.mmsi]; // allow this feed to reconnect
    }
};
    
DevAdapter.prototype.ParseBuffer = function(socket, buffer) {
    this.Debug  (9, "request=[%s]", buffer);
    
    // split buffer multiple lines if any and remove \r\n
    for (var idx=0; idx < buffer.length; idx++) {
        switch (buffer [idx]) {
            case 0x0A: // new line \n
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

// Process a full line Gpsd/Json send one object per line 
DevAdapter.prototype.ParseLine = function(socket, line) {
    
    // device NMEA data directly inside device object
    this.Debug  (8, "line=[%s]", line);
    var data= new NmeaDecode (line);
    if (!data.valid) return (-1);
    data.count= this.count ++; // add message number for debug
    
    // send parsed data to unique device attached to NMEA adapter
    socket.device.ProcessData (data);
};


// send a command to activate GPSd service
DevAdapter.prototype.SendCommand = function(device, action, arg1) {
        switch (action) {
        case 'LOGOUT':  // active client is update at GpsdTcpFeed level
             try { // not obvious that at this point socket is still valid
                device.socket.write ("## Logout: "+ this.controler.uid + '##\n');
                device.socket.end (); // force socket termination
            } catch (err) {};
            
            delete registermmsi [this.mmsi]; // allow this feed to reconnect
            break; 
        default: 
            this.Debug (1,"Hoops %s UNKN_CMD=[%s]", this.uid, action);
            return (-1);     
        };
    // return OK status 
    this.Debug (5,"buffer=[%s]", this.packet);
    return (0);
};

module.exports = DevAdapter; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/
