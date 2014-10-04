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
 * This adapter consumes NMEA183 messages from a TCP feed as exported by Gpsd, AisHub, ...
 *      - gpsd    http://www.catb.org/gpsd
 *      - aishub  http://www.aishub.net/
 *      - check  tcp://sinagot.net:4001 for testing data
 * Note: uses only  GPRMC/GPGGA and make a fake imei from global adapter user opts    
 * Reference: http://www.catb.org/gpsd/client-howto.html
 */

var Debug       = require("../GpsdDebug");
var Vessel      = require('../GpsdTcpFeed'); // make each tcpfeed a fake imei device

var registermmsi=[];  // keep track of nmea MMSI for uniqueness

// Adapter is an object own by a given device controler that handle data connection
DevAdapter = function(controler) {
    this.mmsi      = controler.opts.mmsi;
    this.uid       = "DevAdaptater/" + "nmeatcp/mmsi:" + this.mmsi;
    this.info      = 'nmeatcp';
    this.control   = 'tcpfeed';
    this.debug     = controler.debug;    // inherit debug from controler
    this.controler = controler;          // keep a link to device controler and TCP socket
    this.lineidx   = 0;                  // index within buffer
    this.linebuf   = new Buffer (1024);  // intermediary buffer
    
    gpsd=controler.gpsd;
    
    
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
    var gpsd=this.controler.gpsd; 
    var data=[];
    var nmea = line.split(",");

    this.Debug  (8, "line=[%s]", line);
    
    switch (nmea[0]) {
        case "\r\n":
            data.cmd="EMPTY";
            break;
        case "$GPRMC":  // position with speed and eventually no altitude
            // $GPRMC,225446.00,A,4916.45,N,12311.12,W,000.5,054.7,191194,020.3,E*68
            data.cmd="TRACKER";
            data.imei=0;
            if (nmea[2] === 'A') data.valid=1; else  data.valid=0;
            data.time = nmea[1];
            data.lat  =[nmea[3], nmea[4]];
            data.lon  =[nmea[5], nmea[6]];
            data.speed= nmea[7];
            data.crs  = nmea[8];
            data.date = nmea[9];
            data.alt  = nmea[10];
            break;
        case "$GPGGA":  // position with altitude and no speed
             // $GPGGA,064036.289,4836.5375,N,00740.9373,E,1,04,3.2,200.2,M,,,,0000*0E
            data.cmd ="TRACKER";
            data.imei=0; 
            data.time = nmea [1];
            data.lat  =[nmea[2], nmea[3]];
            data.lon  =[nmea[4], nmea[5]];
            data.valid= nmea[6];
            data.speed= nmea[7];
            data.crs  = nmea[8];
            data.alt  = nmea[9];
            data.date= null;   // only time in GPGGA
            break;
        default: 
            data.command="UNKNOWN";
            return (-1);
    }
   
    // tcpfeed has sent its static info
    if (sockclient.tcpfeed.loged) {            // tcpfeed is known from DB
        sockclient.tcpfeed.ProcessData (data); // update ship position in DB
    }
    return (0); // NMEA adapter is happy
};

// NMEA does not provide imei/mmsi, let's use the one provided by user's app opts 
DevAdapter.prototype.StreamLogin = function (sockclient) {
    // create a fake vessel for our NMEA stream
    sockclient.tcpfeed = new Vessel (this , this.mmsi, sockclient);

    // process login in DB & active client list
    data = {imei : this.mmsi, cmd  : "LOGIN" };           
    sockclient.tcpfeed.ProcessData (data);
    this.controler.gpsd.activeClients [this.mmsi]= sockclient.tcpfeed;
    sockclient.write ('?WATCH={"enable":true,"nmea":true}');
};

// NMEA does not provide imei/mmsi, let's use the one provided by user's app opts 
DevAdapter.prototype.StreamLogout = function (sockclient) {
    if (registermmsi [this.mmsi] !== undefined)  {
        delete registermmsi [this.mmsi]; // allow this feed to reconnect
    }
};
    
// send a command to activate GPSd service
DevAdapter.prototype.SendCommand = function(tcpfeed, action, arg1) {
        switch (action) {
        case 'LOGOUT':  // active client is update at GpsdTcpFeed level
             try { // not obvious that at this point socket is still valid
                tcpfeed.sockclient.write ("## Logout: "+ this.controler.uid + '##\n');
                tcpfeed.sockclient.end (); // force socket termination
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
