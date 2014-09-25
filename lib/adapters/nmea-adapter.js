/* 
 * Copyright 2014 fulup.
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
 * This adapter handle NMEA183 messages
 * Reference: http://fr.wikipedia.org/wiki/NMEA_0183
 * http://www.gpspassion.com/forumsen/topic.asp?TOPIC_ID=17661
 * http://rietman.wordpress.com/2008/09/25/how-to-calculate-the-nmea-checksum/
 * 
 */

var Debug  = require("../GpsdDebug");
var util   = require("util");

// Adapter is an object own by a given device controler that handle data connection
DevAdapter = function(controler) {
    this.uuid      = "DevAdaptater:" + "NMEA183";
    this.debug     = controler.debug;  // inherit debug from controler
    this.controler = controler;  // keep a link to device controler and TCP socket
    
    this.Debug (1,"New  DevAdapter: %s", this.uuid);    
};
       
// NMEA183 is so basic that Jison grammar is not usefull
DevAdapter.prototype.ParseNmea = function (inputpaquet) {
    result=[];
    nmea = inputpaquet.split(",");
    
    switch (nmea[0]) {
        case "\r\n":
            result.cmd="EMPTY";
            break;
        case "$GPRID":  // fake device IMEI login
            // $GPRID,123456789,DummyRouteName*05
            result.cmd="LOGIN";
            imei = nmea[1].split ('*');
            result.imei=imei[0];
            name = nmea[2].split ('*');
            result.name=name[0];
            break;
        case "$GPRMC":  // position with speed and eventually no altitude
            // $GPRMC,225446.00,A,4916.45,N,12311.12,W,000.5,054.7,191194,020.3,E*68
            result.cmd="TRACKER";
            result.imei=0;
            if (nmea[2] === 'A') result.valid=1; else  result.valid=0;
            result.time = nmea[1];
            result.lat  =[nmea[3], nmea[4]];
            result.lon  =[nmea[5], nmea[6]];
            result.speed= nmea[7];
            result.crs  = nmea[8];
            result.date = nmea[9];
            result.alt  = nmea[10];
            break;
        case "$GPGGA":  // position with altitude and no speed
             // $GPGGA,064036.289,4836.5375,N,00740.9373,E,1,04,3.2,200.2,M,,,,0000*0E
            result.cmd ="TRACKER";
            result.imei=0; 
            result.time = nmea [1];
            result.lat  =[nmea[2], nmea[3]];
            result.lon  =[nmea[4], nmea[5]];
            result.valid= nmea[6];
            result.speed= nmea[7];
            result.crs  = nmea[8];
            result.alt  = nmea[9];
            result.date= null;   // only time in GPGGA
            break;
        default: 
            result.command="UNKNOWN";
            return (-1);
    }
    return (result);
};

// Clean up GPS data to make them device independant
DevAdapter.prototype.GpsNormalize =function(data) {
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
    data.lat = Minute2Dec (data.lat);
    data.lon = Minute2Dec (data.lon);
    
    // // $GPGGA provide time but no date
    if (data.date === undefined) {
        data.date  = new Date();        
    } else { 
        // $GPRMC 100106=10-jan-2006 053740.000=5h37m40s
        d=data.date.substring (0,2);
        m=data.date.substring (2,4)-1;  //warning january=0 !!!
        y='20' + data.date.substring (4,6);
        h=data.time.substring (0,2);
        n=data.time.substring (2,4);
        s=data.time.substring (4,6);
        data.date = new Date (y,m,d,h,n,s);
    }
    
    if (data.alt   === "") result.alt=0;
    if (data.speed === "") result.speed=0;
    if (data.crs   === "") result.crs=0;

};


// Jison is quite picky, heavy testing is more than recommended
DevAdapter.prototype.TestParser = function(data) {
    //var code = new Generator (grammar, options).generate();
    // console.log(code);
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
                device.controler.gpsd.event.emit ("notice", "HELP", listcmd, this.uuid, socket.uuid);
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
        var line =  buffer.toString('utf8');  // socket buffer are not string
        
        // if parsing abort then force line as invalid
        try {var data =  this.ParseNmea(line);}
        catch (err) {data = -1};
        
        if (data === -1) return (-1);
         
        // final processing of data return from parser
        switch (data.cmd) {
            case "EMPTY": // just a promt for checking service
                socket.write ("gpsd-tracking: " +this.uuid + " running\n");
                break;       
            case "LOGIN": {
                socket.write ("NMEA accepted imei=[" + data.imei + "] route=[" + data.name + "]\n");
                break;
          };
   
          default: {
            // Clean up date and move Cardinal from degre to decimal 
            this.GpsNormalize (data);               
            break;     
          };
        };
    // return pre-process data to DevClient 
    device.data=data;
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
