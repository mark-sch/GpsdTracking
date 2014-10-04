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
 * This adapter handle AIS feed over TCP as provided by
 *    AISHUB http://www.aishub.net
 *    GPSd   http://www.catb.org/gpsd/
 *    check  tcp://sinagot.net:4001 for testing data
 * Reference: http://www.catb.org/gpsd/client-howto.html
 */

var Debug       = require("../GpsdDebug");
var Vessel      = require('../GpsdTcpFeed');   // make each tcpfeed a fake imei device
var AisDecode   = require('../GpsdAisDecode'); // node.js AIS binary decoding

// Adapter is an object own by a given device controler that handle data connection
DevAdapter = function(controler) {
    this.uid      = "DevAdaptater:" + "aistcp";
    this.info      = 'TcpAis';
    this.control   = 'tcpfeed';
    this.debug     = controler.debug;    // inherit debug from controler
    this.controler = controler;          // keep a link to device controler and TCP socket
    this.lineidx   = 0;                  // index within buffer
    this.linebuf   = new Buffer (1024);  // intermediary buffer    
};

// Import debug method 
DevAdapter.prototype.Debug = Debug;

// This routine is called from GpsdControler each time a new buffer popup
// it splits buffer in full line, and keep remainding buffer for next
// round if ever line was not complete.
DevAdapter.prototype.ProcessData = function(sockclient, bufferin) {
    
    this.Debug  (9, "request=[%s]", bufferin);
    
    // split buffer multiple lines if any and remove \r\n
    for (var idx=0; idx < bufferin.length; idx++) {
        switch (bufferin [idx]) {
            case 0x0A: // new line \n
                this.ProcessLine (sockclient, this.linebuf.toString ('ascii',0, this.lineidx));
                this.lineidx=0;
                break;
            case 0x0D: break;  // cariage return \r
            default: 
                this.linebuf[this.lineidx] = bufferin [idx];
                this.lineidx++;
            }
    }
};
    
// Process a full line Gpsd/Json send one object per line 
DevAdapter.prototype.ProcessLine = function(sockclient, line) {
    var data=[];
    var gpsd=this.controler.gpsd; 
    
    this.Debug  (8, "line=[%s]", line);

    // send AIS message to parser
    ais= new AisDecode (line);
    
    // check if message was valid
    if (!ais.valid) return;
 
    /* we handle static AIS message type 5,24 as authentication request
     * and message 1,2,3,18 and position update resquest
     * check ../GpsdAisDecode for more information on message types  */
    switch (ais.msgtype) {
        case 1:
        case 2:
        case 3:
        case 18:
            data.cmd= "TRACKER";
            data.imei = ais.mmsi;   // make a fake imei for tcpfeed mmsi
            data.lat  = ais.lat;
            data.lon  = ais.lon;
            data.speed= ais.sog;
            data.crs  = ais.cog;
            data.alt  = 0;          // this is a boat it does not hick mountains!!! 
            data.date = new Date(); // use computer time 
            
            // if we exist in active client and we're log then update position now
            tcpfeed = gpsd.activeClients [ais.mmsi];
            if (tcpfeed !== undefined) {        // tcpfeed has sent its static info
                // even is device is not present in DB we keep a minimal set of info
                this.lonstamp  =ais.lon;
                this.latstamp  =ais.lat;
                this.speedstamp=ais.speed;
                
                if (tcpfeed.loged) {            // tcpfeed is known from DB
                    tcpfeed.ProcessData (data); // update ship position in DB
                }
            }
            break;
        
        // 1st time when we get a tcpfeed static info we check its authentication
        case 5:  // static information class A
        case 24: // static information class B
            data.cmd  ="LOGIN";
            data.imei = ais.mmsi;     // make a fake imei for tcpfeed mmsi
            data.name = ais.shipname;
            
            // if device is not in active list we force a new object to keep track of it
            if (gpsd.activeClients [ais.mmsi] === undefined) {
                var tcpfeed = new Vessel (this ,ais.mmsi, sockclient);
                
                // if we have shipname update tcpfeed even is unknown from DB
                if (ais.shipname !== undefined) tcpfeed.name = ais.shipname;
                // force authent [due to DB delay we ignore first AIS paquets]
                data = {
                    imei : ais.mmsi,
                    cmd  : "LOGIN"
                };
                tcpfeed.ProcessData (data);
                gpsd.activeClients [ais.mmsi]= tcpfeed;
            }
            break;
        default: // anything else is not supported
            return (-1);            
    }
    return (0); // NMEA adapter is happy
};

// This fonction is call when connect on remote server succeed
DevAdapter.prototype.StreamLogin = function (sockclient) {
    sockclient.write ('?WATCH={"enable":true,"nmea":true}');
};

// This function is called when remote server close connection
DevAdapter.prototype.StreamLogout = function (sockclient) {
    
};

// send a command to activate GPSd service
DevAdapter.prototype.SendCommand = function(tcpfeed, action, arg1) {
        switch (action) {
        case 'LOGOUT': break; // everthing was take care at TcpFeed level
        default: 
            this.Debug (1,"Hoops %s UNKN_CMD=[%s]", this.uid, action);
            return (-1);     
        };
    // return OK status 
    this.Debug (5,"buffer=[%s]", this.packet);
    return (0);
};

module.exports = DevAdapter; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/
