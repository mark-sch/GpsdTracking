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
 * This adapter wait NMEA packet from Simumator on a TCP socket
 * Reference: http://fr.wikipedia.org/wiki/NMEA_0183
 * http://www.gpspassion.com/forumsen/topic.asp?TOPIC_ID=17661
 * http://rietman.wordpress.com/2008/09/25/how-to-calculate-the-nmea-checksum/
 * 
 */

var Debug  = require("../GpsdDebug");
var util   = require("util");

// Adapter is an object own by a given device controler that handle data connection
DevAdapter = function(controler) {
    this.uid      = "DevAdaptater:" + "NMEA183";
    this.info      = 'Nmea-183';
    this.debug     = controler.debug;  // inherit debug from controler
    this.controler = controler;  // keep a link to device controler and TCP socket
    this.control   = 'tcpsock';
    this.debug     = controler.debug.level;  // inherit debug from controler
};

// Import debug method 
DevAdapter.prototype.Debug = Debug;
       
// NMEA183 is so basic that Jison grammar is not usefull
DevAdapter.prototype.ParseNmea = function () {
    this.data=[];
    var nmea = this.line.split(",");
    
    switch (nmea[0]) {
        case "\r\n":
            this.data.cmd="EMPTY";
            break;
        case "$GPRID":  // fake device IMEI login
            // $GPRID,123456789,DummyRouteName*05
            this.data.cmd="LOGIN";
            imei = nmea[1].split ('*');
            this.data.imei=imei[0];
            name = nmea[2].split ('*');
            this.data.name=name[0];
            break;
        case "$GPRMC":  // position with speed and eventually no altitude
            // $GPRMC,225446.00,A,4916.45,N,12311.12,W,000.5,054.7,191194,020.3,E*68
            this.data.cmd="TRACKER";
            this.data.imei=0;
            if (nmea[2] === 'A') this.data.valid=1; else  this.data.valid=0;
            this.data.time = nmea[1];
            this.data.lat  =[nmea[3], nmea[4]];
            this.data.lon  =[nmea[5], nmea[6]];
            this.data.speed= nmea[7];
            this.data.crs  = nmea[8];
            this.data.date = nmea[9];
            this.data.alt  = nmea[10];
            break;
        case "$GPGGA":  // position with altitude and no speed
             // $GPGGA,064036.289,4836.5375,N,00740.9373,E,1,04,3.2,200.2,M,,,,0000*0E
            this.data.cmd ="TRACKER";
            this.data.imei=0; 
            this.data.time = nmea [1];
            this.data.lat  =[nmea[2], nmea[3]];
            this.data.lon  =[nmea[4], nmea[5]];
            this.data.valid= nmea[6];
            this.data.speed= nmea[7];
            this.data.crs  = nmea[8];
            this.data.alt  = nmea[9];
            this.data.date= null;   // only time in GPGGA
            break;
        default: 
            this.data.command="UNKNOWN";
            return (-1);
    }
    return (0);
};

// Clean up GPS data to make them device independant
DevAdapter.prototype.GpsNormalize =function() {
    // Convert gps coordonnates in decimal
    var Minute2Dec = function(lat){
        // TK103 sample 4737.1024,N for 47°37'.1024
        deg= parseInt (lat[0]/100);
        min= lat[0] - (deg*100);
        dec= deg + (min/60);
    
        if (lat [1] === 'S' || lat [1] === 'W') dec= dec * -1;
        return (dec);
    };
    
    // Convert gps altitude in meter [if ever needed]
    var Altitude2Dec = function(alt,uni){
        if (ori !== "M") return (-1);
        return (alt);
    };
    
    // we store lon/lat as +-/decimal
    this.data.lat = Minute2Dec (this.data.lat);
    this.data.lon = Minute2Dec (this.data.lon);
    
    // // $GPGGA provide time but no date
    if (this.data.date === undefined) {
        this.data.date  = new Date();        
    } else { 
        // $GPRMC 100106=10-jan-2006 053740.000=5h37m40s
        d=this.data.date.substring (0,2);
        m=this.data.date.substring (2,4)-1;  //warning january=0 !!!
        y='20' + this.data.date.substring (4,6);
        h=this.data.time.substring (0,2);
        n=this.data.time.substring (2,4);
        s=this.data.time.substring (4,6);
        this.data.date = new Date (y,m,d,h,n,s);
    }
    
    if (this.data.alt   === "") this.data.alt=0;
    if (this.data.speed === "") this.data.speed=0;
    if (this.data.crs   === "") this.data.crs=0;

};


DevAdapter.prototype.TestParser = function(data) {
    console.log ("\n#### Starting Test ####");
    for (var test in data) {
        line= testParser[test];
        console.log ("### %s = [%s]", test, line);
        data=this.ParseNmea(line);
        console.log ("  --> NMEA Emei:%s Cmd:%s Lat:%s Lon:%s Date:%s Speed:%d Course:%d Altitude:%d", data.imei, data.cmd, data.lat, data.lon, data.date, data.speed, data.crs, data.alt);
    }
};

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


// This routine is call from DevClient each time a new line arrive on socket
DevAdapter.prototype.ParseData = function(device, socket, buffer) {
        this.line =  buffer.toString('utf8');  // socket buffer are not string
        var status;
        
        // if parsing abort then force line as invalid
        try {this.ParseNmea();}
        catch (err) {
            status=-1;
        };
        
        // parsing did not found a supported NMEA Command
        if (status < 0) {
            this.Debug (5,'NMEA invalid this.data=%s', line);
            return (status);
        }
         
        // final processing of this.data return from parser
        switch (this.data.cmd) {
        case "EMPTY": // just a promt for checking service
            socket.write ("gpsd-tracking: " +this.uid + " running\n");
            break;       
        case "LOGIN":
            socket.write ("NMEA accepted imei=[" + this.data.imei + "] route=[" + this.data.name + "]\n");
            break;
              
        default:
            // Clean up date and move Cardinal from degre to decimal 
            this.GpsNormalize ();               
            break;     
        };
    // return pre-process this.data to DevClient 
    device.data=this.data;
    return (0);
};

// Import debug method 
DevAdapter.prototype.Debug = Debug;

// if started as a main and not as module, then process test.
if (process.argv[1] === __filename)  {
    // Add here any paquet you would like to test
    testParser = { Empty: ""
        ,"Start     " : "$GPRID,123456,Route Name*05"
        ,"Track0    " : "$GPRMC,081836,A,3751.65,S,14507.36,E,000.0,360.0,130998,011.3,E*62"
        ,"Track1    " : "$GPRMC,225446.00,A,4916.45,N,12311.12,W,000.5,054.7,191194,020.3,E*68"
        ,"Track3    " : "$GPGGA,064036.289,4836.5375,N,00740.9373,E,1,04,3.2,200.2,M,,,,0000*0E"
        ,"Track4    " : "$GPRMC,155123.000,A,4043.8432,N,07359.7653,W,0.15,83.25,200407,,*28"
    };
    dummy = [];  // dummy object for test
    dummy.debug = 9;
    devAdapter  = new DevAdapter (dummy);
    devAdapter.TestParser (testParser);
    console.log ("**** NMEA183 Test Done ****");
}

module.exports = DevAdapter; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/
