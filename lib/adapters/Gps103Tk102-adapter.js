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

var Jison  = require("jison").Parser;
var Debug  = require("../GpsdDebug");
var util   = require("util");

// Adapter is an object own by a given device controler that handle data connection
DevAdapter = function(controler) {
    // Extract from Traccar Gps103ProtocolDecoder.java grammar
    // IMEI // Alarm // Local Date // Local Time // F - full / L - low // Time UTC (HHMMSS.SSS)  // Time UTC (HHMMSS.SSS) 
    // Validity[A/V] // Latitude (DDMM.MMMM) // NS // Longitude (DDDMM.MMMM) /EW // Speed // Course // Altitude

    this.uid       = "DevAdaptater:" + "TK103/GPS103";
    this.control   = 'tcpsock';  
    this.info      = 'Tk102-Gps103';
    this.debug     = controler.svcopts.debug;  
    this.controler = controler;     // keep a link to device controler and TCP socket
    this.parser    = this.GetParser ();
};

// As Jison might no be reentrant. Instanciate
// a private version of parser object per device
DevAdapter.prototype.GetParser = function () {
    
    // Define or LEX/Bison grammar to handle device packet
    grammar = {  
    "lex": {
        "rules" : [ ["\\s+" , "/* skip whitespace */"]
            // Lex rules==> smallest token after big/generic ones ex: 'b,'/'b', [A,C]/[a-Z], etc ...
            ,['[0-9]+\\.[0-9]+\\b'  , "return 'FLOAT';"]
            ,['[0-9]+\\b'           , "return 'INT';"]  
            ,[','                   , "return 'SEP';"]
            ,[';'                   , "return 'END';"]
            ,['##,'                 , "return 'STA';"]
            ,['imei:'               , "return 'IMEI';"]
            ,['help me,'            , "return 'HELPME';"]
            ,['door alarm,'         , "return 'DOOR';"]
            ,['acc alarm,'          , "return 'ACCON';"]
            ,['tracker,'            , "return 'TRACK';"]
            ,['it,'                 , "return 'TIMEZONE';"]
            ,['et,'                 , "return 'HELPOFF';"]
            ,['mt,'                 , "return 'PARKOFF';"]
            ,['lt,'                 , "return 'PARKON';"]
            ,['ht,'                 , "return 'SPEEDON';"]
            ,['gt,'                 , "return 'TURNON';"]
            ,['jt,'                 , "return 'ENGINEOFF';"]
            ,['kt,'                 , "return 'ENGINEON';"]
            ,['low battery,'        , "return 'BATTERY';"]
            ,['stockade,'           , "return 'STOCKAD';"]
            ,['move,'               , "return 'MOVE';"]
            ,['sensor alarm,'       , "return 'SENSOR';"]
            ,['speed,'              , "return 'SPEED';"]
            ,['A,'                  , "return 'ALL';"]
            ,['F,'                  , "return 'FULL';"]
            ,['L,'                  , "return 'NOPOS';"]
            ,['[N,S,E,W]'           , "return 'CARD';"]
            ,['A'                   , "return 'AUTH';"] 
            ,['$'                   , "return 'EOF';"]

        ]
    },  // end Lex rules
    
    "bnf": { // WARNING: only one space in between TOKEN ex: "STOP EOF"
        'data': [["EOF"      , "this.cmd='EMPTY'; return (this);"]
            
                ,["LOG EOF"  , "this.cmd='LOGIN'       ; return (this);"]
                ,["HLP EOF"  , "this.cmd='SOS_ALARM'   ; return (this);"]
                ,["PNG EOF"  , "this.cmd='PING'        ; return (this);"]
                ,["TRK EOF"  , "this.cmd='TRACKER'     ; return (this);"]
                ,["MOV EOF"  , "this.cmd='BAT_LOW'     ; return (this);"]
                ,["SPD EOF"  , "this.cmd='SPEED_ON'    ; return (this);"]
                ,["STO EOF"  , "this.cmd='STOCKAD'     ; return (this);"]
                ,["BAT EOF"  , "this.cmd='BATTERY'     ; return (this);"]
                ,["SEN EOF"  , "this.cmd='SENSOR'      ; return (this);"]
                ,["DOR EOF"  , "this.cmd='DOOR_ALARM'  ; return (this);"]
                ,["ACC EOF"  , "this.cmd='ACC_ALARM'   ; return (this);"]
                ,["TZS EOF"  , "this.cmd='TIMEZONE'    ; return (this);"]
                ,["HOF EOF"  , "this.cmd='HELP_OFF'    ; return (this);"]
                ,["POF EOF"  , "this.cmd='PARK_OFF'    ; return (this);"]
                ,["PON EOF"  , "this.cmd='PARK_ON'     ; return (this);"]
                ,["SON EOF"  , "this.cmd='SPEED_ON'    ; return (this);"]
                ,["TON EOF"  , "this.cmd='TURN_ON'     ; return (this);"]
                ,["ENF EOF"  , "this.cmd='ENGINE_OFF'  ; return (this);"]
                ,["ENO EOF"  , "this.cmd='ENGINE_ON'   ; return (this);"]
           ]
        // Because of LR reduction we have to duplicate line for each command
        ,'LOG' :  [ // ##,imei:359710043551135,A;
                    ["STA DEV AUTH END", ""]]
                
        ,'PNG' :  [ // "359710043551135;"
                    ["INT END", "this.imei=$1"]]
                
        ,'TRK' :  [ // "imei:359710043551135,tracker,1409060521,???,F,212147.000,A,4737.1076,N,00245.6561,W,0.00,0;"
                    ["DEV TRACK INTSEP INTSEP GPSDATA"      ,"this.date=$3;"],
                    ["DEV TRACK INTSEP SEP GPSDATA"         ,"this.date=$3;"],
                    ["DEV TRACK INTSEP INTSEP NOGPS"        ,"this.date=$3;"],
                    ["DEV TRACK INTSEP SEP SEP NOGPS"       ,"this.date=$3;"]
        ]
        ,'SEN' : [ // imei:359710043551135,sensor alarm,1409070008,,F,160844.000,A,4737.0465,N,00245.6099,W,21.21,306.75;
                    ["DEV SENSOR INTSEP INTSEP GPSDATA"     ,"this.date=$3;"],
                    ["DEV SENSOR INTSEP SEP GPSDATA"        ,"this.date=$3;"],
                    ["DEV SENSOR INTSEP INTSEP NOGPS"       ,"this.date=$3;"],
                    ["DEV SENSOR INTSEP SEP SEP NOGPS"      ,"this.date=$3;"]
        ]    
        ,'BAT' : [ // imei:359586015829802,low battery,000000000,13554900601,L,;
                    ["DEV BATTERY INTSEP INTSEP GPSDATA"    ,"this.date=$3;"],
                    ["DEV BATTERY INTSEP SEP GPSDATA"       ,"this.date=$3;"],
                    ["DEV BATTERY INTSEP INTSEP NOGPS"      ,"this.date=$3;"],
                    ["DEV BATTERY INTSEP SEP SEP NOGPS"     ,"this.date=$3;"]
        ]            
        ,'HLP' :  [ // "imei:359710043551135,help me,1409050559,???,F,215931.000,A,4737.1058,N,00245.6524,W,0.00,0;"
                    ["DEV HELPME INTSEP INTSEP GPSDATA"     ,"this.date=$3;"],
                    ["DEV HELPME INTSEP SEP GPSDATA"        ,"this.date=$3;"],
                    ["DEV HELPME INTSEP INTSEP NOGPS"       ,"this.date=$3;"],
                    ["DEV HELPME INTSEP SEP SEP NOGPS"      ,"this.date=$3;"]
        ]                    
        ,'DOR' :  [ // imei:012497000419790,door alarm,1010181112,00420777123456,F,101216.000,A,5004.5502,N,01426.7268,E,0.00,;
                    ["DEV DOOR INTSEP INTSEP GPSDATA"     ,"this.date=$3;"],
                    ["DEV DOOR INTSEP SEP GPSDATA"        ,"this.date=$3;"],
                    ["DEV DOOR INTSEP INTSEP NOGPS"       ,"this.date=$3;"],
                    ["DEV DOOR INTSEP SEP SEP NOGPS"      ,"this.date=$3;"]
        ]                    
        ,'ACC' :  [ // imei:012497000419790,gt,1010181046,00420777123456,F,094657.000,A,5004.5251,N,01426.7298,E,0.00,;
                    ["DEV ACCON INTSEP INTSEP GPSDATA"     ,"this.date=$3;"],
                    ["DEV ACCON INTSEP SEP GPSDATA"        ,"this.date=$3;"],
                    ["DEV ACCON INTSEP INTSEP NOGPS"       ,"this.date=$3;"],
                    ["DEV ACCON INTSEP SEP SEP NOGPS"      ,"this.date=$3;"]
        ]                    
        ,'MOV' :  [ // "imei:359586015829802,move,0809231429,13554900601,F,062947.294,A,2234.4026,N,11354.3277,E,0.00,;"
                    ["DEV MOVE INTSEP INTSEP GPSDATA"       ,"this.date=$3;"],
                    ["DEV MOVE INTSEP SEP GPSDATA"          ,"this.date=$3;"],
                    ["DEV MOVE INTSEP INTSEP NOGPS"         ,"this.date=$3;"],
                    ["DEV MOVE INTSEP SEP SEP NOGPS"        ,"this.date=$3;"]
        ]           
        ,'STO' :  [ // "imei:359586015829802,stockade,0809231429,13554900601,F,062947.294,A,2234.4026,N,11354.3277,E,0.00,; "
                    ["DEV STOCKAD INTSEP INTSEP GPSDATA"    ,"this.date=$3;"],
                    ["DEV STOCKAD INTSEP SEP GPSDATA"       ,"this.date=$3;"],
                    ["DEV STOCKAD INTSEP INTSEP NOGPS"      ,"this.date=$3;"],
                    ["DEV STOCKAD INTSEP SEP SEP NOGPS"     ,"this.date=$3;"]
        ]  
        ,'SPD' :  [ // "imei:359586015829802,speed,0809231429,13554900601,F,062947.294,A,2234.4026,N,11354.3277,E,0.00,; "
                    ["DEV SPEED INTSEP INTSEP GPSDATA"      ,"this.date=$3;"],
                    ["DEV SPEED INTSEP SEP GPSDATA"         ,"this.date=$3;"],
                    ["DEV SPEED INTSEP INTSEP NOGPS"        ,"this.date=$3;"],
                    ["DEV SPEED INTSEP SEP SEP NOGPS"       ,"this.date=$3;"]
        ]  
        ,'TZS' :  [ // "imei:359710043551135,it,1409160049,,F,194911.000,A,4737.1079,N,00245.6611,W,0.00,0;"
                    ["DEV TIMEZONE INTSEP INTSEP GPSDATA"   ,"this.date=$3;"],
                    ["DEV TIMEZONE INTSEP SEP GPSDATA"      ,"this.date=$3;"],
                    ["DEV TIMEZONE INTSEP INTSEP NOGPS"     ,"this.date=$3;"],
                    ["DEV TIMEZONE INTSEP SEP SEP NOGPS"    ,"this.date=$3;"]
        ]
        ,'HOF' :  [ // imei:012497000419790,et,1010181049,00420777123456,F,094922.000,A,5004.5335,N,01426.7305,E,0.00,;
                    ["DEV HELPOFF INTSEP INTSEP GPSDATA"    ,"this.date=$3;"],
                    ["DEV HELPOFF INTSEP SEP GPSDATA"       ,"this.date=$3;"],
                    ["DEV HELPOFF INTSEP INTSEP NOGPS"      ,"this.date=$3;"],
                    ["DEV HELPOFF INTSEP SEP SEP NOGPS"     ,"this.date=$3;"]
        ]  
        ,'POF' :  [ // imei:012497000419790,mt,1010181029,00420777123456,F,092913.000,A,5004.5392,N,01426.7344,E,0.00,;
                    ["DEV PARKOFF INTSEP INTSEP GPSDATA"    ,"this.date=$3;"],
                    ["DEV PARKOFF INTSEP SEP GPSDATA"       ,"this.date=$3;"],
                    ["DEV PARKOFF INTSEP INTSEP NOGPS"      ,"this.date=$3;"],
                    ["DEV PARKOFF INTSEP SEP SEP NOGPS"     ,"this.date=$3;"]
        ]  
        ,'PON' :  [ // imei:012497000419790,lt,1010181029,00420777123456,F,092913.000,A,5004.5392,N,01426.7344,E,0.00,;
                    ["DEV PARKON INTSEP INTSEP GPSDATA"    ,"this.date=$3;"],
                    ["DEV PARKON INTSEP SEP GPSDATA"       ,"this.date=$3;"],
                    ["DEV PARKON INTSEP INTSEP NOGPS"      ,"this.date=$3;"],
                    ["DEV PARKON INTSEP SEP SEP NOGPS"     ,"this.date=$3;"]
        ]  
        ,'SON' :  [ // imei:012497000419790,jt,1010181051,00420777123456,F,095123.000,A,5004.5234,N,01426.7295,E,0.00,;
                    ["DEV SPEEDON INTSEP INTSEP GPSDATA"    ,"this.date=$3;"],
                    ["DEV SPEEDON INTSEP SEP GPSDATA"       ,"this.date=$3;"],
                    ["DEV SPEEDON INTSEP INTSEP NOGPS"      ,"this.date=$3;"],
                    ["DEV SPEEDON INTSEP SEP SEP NOGPS"     ,"this.date=$3;"]
        ]  
        ,'TON' :  [ // imei:012497000419790,gt,1010181046,00420777123456,F,094657.000,A,5004.5251,N,01426.7298,E,0.00,;
                    ["DEV TURNON INTSEP INTSEP GPSDATA"    ,"this.date=$3;"],
                    ["DEV TURNON INTSEP SEP GPSDATA"       ,"this.date=$3;"],
                    ["DEV TURNON INTSEP INTSEP NOGPS"      ,"this.date=$3;"],
                    ["DEV TURNON INTSEP SEP SEP NOGPS"     ,"this.date=$3;"]
        ]  
        ,'ENF' :  [ // imei:012497000419790,mt,1010181029,00420777123456,F,092913.000,A,5004.5392,N,01426.7344,E,0.00,;
                    ["DEV ENGINEOFF INTSEP INTSEP GPSDATA"  ,"this.date=$3;"],
                    ["DEV ENGINEOFF INTSEP SEP GPSDATA"     ,"this.date=$3;"],
                    ["DEV ENGINEOFF INTSEP INTSEP NOGPS"    ,"this.date=$3;"],
                    ["DEV ENGINEOFF INTSEP SEP SEP NOGPS"   ,"this.date=$3;"]
        ]  
        ,'ENO' :  [ // imei:012497000419790,mt,1010181029,00420777123456,F,092913.000,A,5004.5392,N,01426.7344,E,0.00,;
                    ["DEV ENGINEON INTSEP INTSEP GPSDATA"    ,"this.date=$3;"],
                    ["DEV ENGINEON INTSEP SEP GPSDATA"       ,"this.date=$3;"],
                    ["DEV ENGINEON INTSEP INTSEP NOGPS"      ,"this.date=$3;"],
                    ["DEV ENGINEON INTSEP SEP SEP NOGPS"     ,"this.date=$3;"]
        ]  
        , 'GPSDATA' : [ // F,215931.000,A,4737.1058,N,00245.6524,W,0.00,0  [multiple end option W,0.00,0; | W,0.00,; | W,0.00;]
                ["FULL FLOATSEP ALL FLOATSEP CARDINAL FLOATSEP CARDINAL FLOATSEP FLOAT END"
                      ,"this.valid=true;this.alt=parseFloat($9); this.lat=[parseFloat($4), $5]; this.lon=[parseFloat($6), $7]; this.speed=parseFloat($8); this.course=parseFloat($9);"],
                ["FULL FLOATSEP ALL FLOATSEP CARDINAL FLOATSEP CARDINAL FLOATSEP INT END"
                      ,"this.valid=true;this.alt=parseFloat($9); this.lat=[parseFloat($4), $5]; this.lon=[parseFloat($6), $7]; this.speed=parseFloat($8); this.course=parseInt($9);"],
                ["FULL FLOATSEP ALL FLOATSEP CARDINAL FLOATSEP CARDINAL FLOATSEP END"
                      ,"this.valid=true;this.alt=parseFloat(0.0); this.lat=[parseFloat($4), $5]; this.lon=[parseFloat($6), $7]; this.speed=parseFloat($8);"],
                ["FULL FLOATSEP ALL FLOATSEP CARDINAL FLOATSEP CARDINAL FLOAT END"
                      ,"this.valid=true;this.alt=parseFloat(0.0); this.lat=[parseFloat($4), $5]; this.lon=[parseFloat($6), $7]; this.speed=parseFloat($8);"]
        ]
        , 'NOGPS'   : [
                ["NOPOS END", "this.valid=false; this.lon=[0,'X']; this.lat=[0,'Y'];"]
        ]
        , 'CARDINAL'   : [
                ["CARD SEP",  "$$=$1"]
        ]
        , 'FLOATSEP'   : [
                ["FLOAT SEP", "$$=$1"]
        ]
        , 'INTSEP'   : [
                ["INT SEP",   "$$=$1"]
        ]
        ,'DEV' : [  ["IMEI INT SEP", "this.imei= parseInt($2);"]]
    }};

    var parser = new Jison(grammar);
    return (parser);
};

// Import debug method 
DevAdapter.prototype.Debug = Debug;

// Clean up GPS data to make them device independant
DevAdapter.prototype.GpsNormalize =function(data) {
    
    // Convert gps coordonnates in decimal
    var Minute2Dec = function(lat){
        // TK103 sample 4737.1024,N for 47°37'.1024
        var deg= parseInt (lat[0]/100);
        var min= lat[0] - (deg*100);
        var dec= deg + (min/60);
    
        if (lat [1] === 'S' || lat [1] === 'W') dec= dec * -1;
        return (dec);
    };

    // we store lon/lat as +-/decimal
    data.lat = Minute2Dec (data.lat);
    data.lon = Minute2Dec (data.lon);
  
    // Note: process is preset globaly for UTC in GpsDaemon
    if (data.date === undefined) {
        data.date  = new Date();        
    } else { 
        // TK103 data.time format "1409152220"
        var y='20' + data.date.substring (0,2);
        var m=data.date.substring (2,4)-1;  //warning january=0 !!!
        var d=data.date.substring (4,6);
        var h=data.date.substring (6,8);
        var n=data.date.substring (8,10);
        data.date = new Date (y,m,d,h,n);
    }
};


/*
 * send a command to activate GPS tracker see protocol reference at:
 *   http://old.forum.gps-trace.com/viewtopic.php?id=4108
 *   http://old.forum.gps-trace.com/viewtopic.php?id=4092
 */
DevAdapter.prototype.SendCommand = function(device, action, args) {
        socket = device.socket;
        switch (action) {   
          case "WELLCOME":break; // special init sequences
          case "LOGOUT":  break; // warning: socket not valid anymore
          // Get current position (1 position only)
          case "GET_POS": // **,imei:999999999999999,B;
                this.packet= util.format ("**,imei:%s,B;", socket.device.imei);
                socket.write (this.packet);
                break;
          // Set multiple positions
          case "SET_TRACK_BY_TIME": // **,imei:999999999999999,C,##x;
                this.packet= util.format ("**,imei:%s,C,%s;", socket.device.imei,args);
                socket.write (this.packet);
                break;
          //  Stop sending positions     
          case "STOP_TRACK": // **,imei:999999999999999,d;
                this.packet= util.format ("**,imei:%s,D;", socket.device.imei,args);
                socket.write (this.packet);
                break;                
          // Stop sending alarm messages (door alarm, acc alarm, power alarm, S.O.S. alarm)    
          case "STOP_SOS": // **,imei:999999999999999,E;
                this.packet= util.format ("**,imei:%s,E;", socket.device.imei);
                socket.write (this.packet);
                break;
          // Set positioning by distance (tracker only sends position if vehicle has travelled XXXX meters)
          case "SET_BY_DISTANCE": // **,imei:999999999999999,F,XXXXm;
                this.packet= util.format ("**,imei:%s,F,%s;", socket.device.imei, args);
                socket.write (this.packet);
                break;
          // Activate mouvement alarm if move more than 200m
          case "SET_MOVE_ALARM": // **,imei:999999999999999,G;
                this.packet= util.format ("**,imei:%s,F,%s;", socket.device.imei, args);
                socket.write (this.packet);
                break;
          // Activate the speed alarm (sends SMS if speed goes above XXX km/h)      
          case "SET_SPEED_SMS": // **,imei:999999999999999,H,XXX;
                if (args < 0) {
                    this.debug.this ("Hoops: SETSPEED < 0 speed=%s", args);
                    return (-1);
                }
                if (args<100) {
                    param= util.format ("0%d", args);
                }
                if (args<10) {
                    param= util.format ("00%d", args);
                }
                if (args>100) {
                    param= util.format ("%d", args);
                } 
                // speed need to be on 3 digit
                this.packet= util.format ("**,imei:%s,H,%s", socket.device.imei, param);
                socket.write (this.packet);
                break;
          // Set the timezone to GMT+0 (this tracker only works properly on gps-trace with timezone set to +0    
          case "SET_TIMEZONE": //**,imei:999999999999999,I,0;
                this.packet= util.format ("**,imei:%s,I,%s", socket.device.imei, args);
                socket.write (this.packet);
                break;
          // Stop/block the engine 
          case "ENGINE_OFF" : //**,imei:999999999999999,J;
                this.packet= util.format ("**,imei:%s,J", socket.device.imei);
                socket.write (this.packet);
                break;
          // Resume/unblock the engine
          case "ENGINE_ON": //**,imei:999999999999999,K;
                this.packet= util.format ("**,imei:%s,K", socket.device.imei);
                socket.write (this.packet);
                break;
          // Arm alarm (door, acc, shock sensor)
          case "ALARM_ON": //**,imei:999999999999999,L;
                this.packet= util.format ("**,imei:%s,L", socket.device.imei);
                socket.write (this.packet);
                break;
          case "ALARM_OFF": //**,imei:999999999999999,M;
                // ime is formated in +x
                this.packet= util.format ("**,imei:%s,M", socket.device.imei);
                socket.write (this.packet);
                break;
          // Turn off GPRS (returns to SMS mode. This can only be undone by sending an SMS)
          case "GPRS_OFF": //**,imei:999999999999999,N;
                this.packet= util.format ("**,imei:%s,N", socket.device.imei);
                socket.write (this.packet);
                break;
          // Create a Geofence alarm between points A,B and C,D
          case "GEOFENCE": // **,imei:012497000324230,O,-30.034173,-051.167557;-30.044679,-051.146198;
                this.packet= util.format ("**,imei:%s,O,%s", socket.device.imei, args);
                socket.write (this.packet);
                break;
          //  Request upload of SD card saved points (only on trackers with sd card) 
          case "GET_SDCARD":  //**,imei:999999999999999,Q,date;
                this.packet= util.format ("**,imei:%s,Q,%s", socket.device.imei,args);
                socket.write (this.packet);
                break;
          // Activate GPRS economy mode (not sure what this does, only on trackers that support this. GPS103 does not)
          case "SET_ECOMOD":  // **,imei:999999999999999,T;
                this.packet= util.format ("**,imei:%s,T;", socket.device.imei);
                socket.write (this.packet);
                break;
          // Request a photo from camera (only on trackers that support this, GPS103 does not)
          case "GET_PHOTO":  // **,imei:012497000419790,V;
                this.packet= util.format ("**,imei:%s,V;", socket.device.imei);
                socket.write (this.packet);
                break;
          case "HELP":  // return supported commands by this adapter
                listcmd=["GET_POS", "SET_TRACK_BY_TIME", "STOP_TRACK", "STOP_SOS"
                    ,"SET_BY_DISTANCE", "SET_MOVE_ALARM", "SET_SPEED_SMS", "SET_TIMEZONE"
                    ,"ENGINE_OFF", "ENGINE_ON", "ALARM_ON", "ALARM_OFF", "GPRS_OFF"
                    ,"GEOFENCE", "GET_SDCARD", "SET_ECOMOD", "GET_PHOTO", "LOGOUT"];  

                // push a notice HELP action event to gpsd
                device.controler.gpsd.event.emit ("notice", "HELP", listcmd, this.uid, socket.uid);
                break;
          default: // ignore any other messages
             this.Debug (1,"Hoops unknow Command=[%s]", action);
             return (-1);     
         };
    // return OK status 
    this.Debug (5,"action=[%s] args=[%s]", action, args);
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
            case 0x3B : // ';' Gps103 end of command
                socket.linebuf[socket.lineidx] = buffer [idx];
                socket.lineidx++;
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
        var data;
        socket.count ++;
        try { // warning need to convert buffer to string before parsing
            data=this.parser.parse (line); // call jison parser
        } catch (err) {
            this.Debug (5, "Parsing Err:%s Line:%s", err, line );
            socket.write ('Invalid GPS103 data:' + line);
            return (-1);
        }
        
        // final processing of device.data return from parser
        data.count=socket.count++;
        switch (data.cmd) {
          case "EMPTY": // just a promt for checking service
                socket.write ("gpsd-tracking: " +this.uid + " running\n");
                break;          
 
          case "LOGIN":  // on login force tracker time to UTC
                socket.write ("LOAD");
                break;

          case "PING": // update last online time 
                socket.write ("ON");
                break;

          default:   // provide a copy of parsed device.data to device
            this.GpsNormalize(data);
            break;     
        };
        
    console.log ("gps103 data=%s", JSON.stringify (data));
    socket.device.ProcessData (data);
    
   return (0);
};

// if started as a main and not as module, then process test.
if (process.argv[1] === __filename)  {
    
    // Add here any paquet you would like to test
    testParser = {  Empty: ""
        ,"Start     " : "##,imei:359710043551135,A;"
        ,"Ping      " : "359710043551135;"
        ,"Help-GPS1 " : "imei:359710043551135,help me,1409050559,1234,F,215931.000,A,4737.1058,N,00245.6524,W,0.00,0;"
        ,"Help-GPS2 " : "imei:359710043551135,help me,1409050559,,F,215931.000,A,4737.1058,N,00245.6524,W,0.00,0;"
        ,"Help-NOGPS" : "imei:359710043551135,help me,1409050559,13554900601,L,;"
        ,"Track1    " : "imei:359710043551135,tracker,1409060521,,F,212147.000,A,4737.1076,N,00245.6561,W,0.00,0;"
        ,"NOGPS     " : "imei:359586015829802,low battery,000000000,13554900601,L,;"
        ,"BAT       " : "imei:359586015829802,low battery,0809231429,13554900601,F,062947.294,A,2234.4026,N,11354.3277,E,0.00,;"
        ,"Stockad   " : "imei:359586015829802,stockade,0809231429,13554900601,F,062947.294,A,2234.4026,N,11354.3277,E,0.00,;"
        ,"Speed     " : "imei:359586015829802,speed,0809231429,13554900601,F,062947.294,A,2234.4026,N,11354.3277,E,0.00,;"
        ,"Move      " : "imei:359586015829802,move,0809231429,13554900601,F,062947.294,A,2234.4026,N,11354.3277,E,0.00,;"
        ,"Sensor    " : "imei:359710043551135,sensor alarm,1409070008,,F,160844.000,A,4737.0465,N,00245.6099,W,21.21,306.75;"
        ,"Door      " : "imei:012497000419790,door alarm,1010181112,00420777123456,F,101216.000,A,5004.5502,N,01426.7268,E,0.00,;"
        ,"Acc-On    " : "imei:012497000419790,acc alarm,1010181112,00420777123456,F,101256.000,A,5004.5485,N,01426.7260,E,0.00,;"
        ,"Resume Eng" : "imei:012497000419790,kt,1010181052,00420777123456,F,095256.000,A,5004.5635,N,01426.7346,E,0.58,;"
        ,"Stop Engin" : "imei:012497000419790,jt,1010181051,00420777123456,F,095123.000,A,5004.5234,N,01426.7295,E,0.00,;"
        ,"Turn Alarm" : "imei:012497000419790,gt,1010181046,00420777123456,F,094657.000,A,5004.5251,N,01426.7298,E,0.00,;"
        ,"Speed On  " : "imei:012497000419790,ht,1010181032,00420777123456,F,093203.000,A,5004.5378,N,01426.7328,E,0.00,;"
        ,"Park Off  " : "imei:012497000419790,mt,1010181029,00420777123456,F,092913.000,A,5004.5392,N,01426.7344,E,0.00,;"
        ,"Park On   " : "imei:012497000419790,lt,1010181025,00420777123456,F,092548.000,A,5004.5399,N,01426.7352,E,0.00,;"
        ,"Stop SOS  " : "imei:012497000419790,et,1010181049,00420777123456,F,094922.000,A,5004.5335,N,01426.7305,E,0.00,;"
    };
    
    
    // Jison is quite picky, heavy testing is more than recommended
    console.log ("\n#### Starting Test ####");
    // Create a dummy object controler for test
    var dummy = [];  dummy.svcopts=[];  dummy.svcopts.debug = 9;
    var adapter  = new DevAdapter (dummy);
    for (var test in testParser) {
        var line = testParser[test];
        console.log ("### %s = [%s]", test, line);
        var data= adapter.parser.parse (testParser[test]);
        console.log ("  --> Imei:%s Cmd:%s Lat:%s Lon:%s Date:%s data.speed:%d data.course:%d", data.imei, data.cmd, data.lat, data.lon, data.date, data.speed, data.course);
    }
    console.log ("**** GPS103 Parser Test Done ****");
}; // end if __filename

module.exports = DevAdapter; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/
