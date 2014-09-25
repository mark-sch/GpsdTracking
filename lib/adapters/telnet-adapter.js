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
 * Telnet-Adapter is a dummy adapter for debug purpose. 
 * it waits for a telnet connect and provide very few basic commands
 *  - lst [list all active devices]
 *  - snd imei command [arg1, ...]
 *  - quit
 */

var Jison  = require("jison").Parser;
var Debug  = require("../GpsdDebug");
var util   = require("util");


// Adapter is an object own by a given device controler that handle data connection
DevAdapter = function(controler) {
    
    // Define or LEX/Bison grammar to handle device packet
    grammar = {  
    "lex": {
        "rules" : [ ["\\s+" , "/* skip whitespace */"]
            // Lex rules==> smallest token after big/generic ones ex: 'b,'/'b', [A,C]/[a-Z], etc ...
            ,['help\\b'             , "return 'HELP';"]
            ,['quit\\b'             , "return 'QUIT';"]
            ,['exit\\b'             , "return 'QUIT';"]
            ,['devices\\b'          , "return 'DEV';"]
            ,['dev\\b'              , "return 'DEV';"]
            ,['listen\\b'           , "return 'EVTS';"]
            ,['evt\\b'              , "return 'EVTS';"]
            ,['controlers\\b'       , "return 'CTRL';"]
            ,['ctrl\\b'             , "return 'CTRL';"]
            ,['backend\\b'          , "return 'BACK';"]
            ,['bck\\b'              , "return 'BACK';"]
            ,['send\\b'             , "return 'SEND';"]
            ,['snd\\b'              , "return 'SEND';"]
            ,['create\\b'           , "return 'CREA';"]
            ,['remove\\b'           , "return 'DROP';"]
            ,['dbinit\\b'           , "return 'BASE';"]
            ,['track\\b'            , "return 'TRAK';"]
            ,['trk\\b'              , "return 'TRAK';"]
            ,['all\\b'              , "return 'ALL';" ]
            ,['send\\b'             , "return 'SEND';" ]
            ,['snd\\b'              , "return 'SEND';" ]
            ,['login\\b'            , "return 'LOG';" ]
            ,['logout\\b'           , "return 'OUT';" ]
            ,['[^ ]+\\b'            , "return 'TXT';" ]
            ,['\\n'                 , "return 'EOL';" ]
            ,[';'                   , "return 'EOL';" ]
            ,['$'                   , "return 'EOL';" ]
        ]
    },  // end Lex rules
    
    "bnf": { // WARNING: only one space in between TOKEN ex: "STOP EOF"
        'data': [["EOL"        ,"this.cmd='EMPTY'; return (this);"]
                ,["TRACK EOL"  ,"return (this);"]
                ,["COMMD EOL"  ,"return (this);"]
                ,["CREAT EOL"  ,"return (this);"]
                
                ,["DEV EOL"  ,"this.cmd='DEVICE' ; return (this);"]
                ,["EVTS EOL" ,"this.cmd='LISTEN' ; return (this);"]
                ,["QUIT EOL" ,"this.cmd='QUIT'   ; return (this);"]
                ,["HELP EOL" ,"this.cmd='HELP'   ; return (this);"]
                ,["CTRL EOL" ,"this.cmd='CONTROL'; return (this);"]
                ,["BACK EOL" ,"this.cmd='BACKEND'; return (this);"]
                ,["BASE EOL" ,"this.cmd='DBINIT' ;return (this);"]
                ,["DROP TXT EOL","this.cmd='DROP' ; this.imei=$2;return (this);"]
                ,["LOG TXT EOL" ,"this.cmd='LOGIN'; this.imei=$2;return (this);"]
                ,["OUT TXT EOL" ,"this.cmd='LOGOUT';this.imei=$2;return (this);"]
           ] 
        ,'TRACK':[
             ["TRAK ALL"      , "this.cmd='TRACK'; this.imei=0;"]
            ,["TRAK TXT"      , "this.cmd='TRACK'; this.imei=$2;"]
        ]
        ,'COMMD':[
            ,["SEND ALL ARGS"   , "this.cmd='SEND'; this.imei=0;"]
            ,["SEND TXT ARGS"   , "this.cmd='SEND'; this.imei=$2;"]
            ,["SEND TXT HELP"   , "this.cmd='SEND'; this.imei=$2; this.action='help';"]
        ]
        ,'CREAT':[
             ["CREA ARGS"      , "this.cmd='CREATE'; this.imei=$2;"]
        ]
        ,'ARGS':[
             ["TXT"            , "this.action=$1; this.args=[];"]
            ,["ARGS TXT"       , "this.args.push ($2);"]
        ]
    }};

    this.uuid      = "DevAdaptater:" + "Telnet";
    this.debug     = controler.debug.level;  // inherit debug from controler
    this.controler = controler;  // keep a link to device controler and TCP socket
    this.parser    = new Jison(grammar);
    this.request   = 0; // job request number for gpsd queue
    try {
        this.prompt    = controler.gpsd.options.name +"> ";
    } catch (err) {
        this.prompt    = "GpsdTracker> ";
    }
};

// Import debug method 
DevAdapter.prototype.Debug = Debug;

// Jison is quite picky, heavy testing is more than recommended
DevAdapter.prototype.TestParser = function(data) {
    console.log ("\n#### Starting Test ####");
    for (var test in data) {
        line= testParser[test];
        console.log ("### %s = [%s]", test, line);
        data=this.parser.parse(line);
        console.log ("--> cmd=%s imei=%s action=%s args=%j", data.cmd, data.imei, data.action, data.args); 
    }
};

// hook user event handler to receive a copy of messages
DevAdapter.prototype.HookEventHandler = function(socket, gpsd) {
    count = 0;
    
    var EventHandlerQueue = function (status, job){
        message=util.format ("#-%d Queue Status=%s DevId=%s Command=%s JobReq=%d Retry=%d\n", count++, status, job.devId, job.command, job.request, job.retry);
        socket.write (message);
    };	
  
    // Events successful process by tracker adapter
    var EventHandlerAccept = function (device, data){
        message=util.format ("#-%d Action Imei:[%s] Name:[%s] Cmd:[%s] Lat:%d Lon:%d Speed=%d\n", count++, device.imei, device.name, data.cmd, data.lat, data.lon, data.speed);
        socket.write (message);
    };
    
     // Events on action refused by tracker adapter
    var EventHandlerError = function(status, info, adapter, client){
        message=util.format ("#-%d Notice Info=%s Data=%s Adapter=%s Client=%s\n", count++, status, info, adapter, client );       
        socket.write (message);
    };

    // socket closed let's clear event
    if (socket === null) {
        this.Debug(7, "Remove Telnet gpsd event listener [%s]", gpsd.uuid);
        gpsd.event.removeListener("queue" ,EventHandlerQueue);	
        gpsd.event.removeListener("accept",EventHandlerAccept);	
        gpsd.event.removeListener("error" ,EventHandlerError);	
    } else {
        // Events from queued jobs
        message=util.format ("> Hook On [Listening for gpsd [queue|acept|error] events\n");
        socket.write (message);
        // note: in order to make removal of listener possible function should have a static name
        gpsd.event.on("queue",EventHandlerQueue);	
        gpsd.event.on("accept",EventHandlerAccept);	
        gpsd.event.on("notice",EventHandlerError);
    }
};

// Command received from TCP server
DevAdapter.prototype.SendCommand = function(socket, action, arg1) {
    switch (action) {
        case "WELLCOME": 
            socket.write ("> type: help for support [evt to receive events]\n");
            socket.write (this.prompt);
            break;
        case "LOGOUT": // warning at this point socket is not valid !!!
            this.HookEventHandler (null, socket.device.controler.gpsd);
            break;
        case "HELP":  // return supported commands by this adapter
            listcmd=["try: [help] command directly"];  
            // push a notice HELP action event to gpsd
            device.controler.gpsd.event.emit ("notice", "HELP", listcmd, this.uuid, socket.uuid);
            break;
        default: 
            this.Debug (1,"Telnet ignored Command=[%s]", action);
            return (-1);
    }
    return (0);
};

// This routine is call from DevClient each time a new line arrive on socket
DevAdapter.prototype.ParseData = function(device, socket, buffer) {
    var prompt=this.prompt;  // make prompt avaliable in timer :(
    
    var JobCallback = function (job) {
        var msg = util.format (" --> [job:%s] command=%s imei=%s [sent]\n", job.request, job.command, job.devId);
        socket.write (msg);
    }; 

    // make our life simpler
    var gpsd   = device.controler.gpsd;
    var adapter= device.controler.adapter;

    line =  buffer.toString('utf8');  // socket buffer are not string
    try {
        data=this.parser.parse(line); // call jison parser
    } catch (err) {
        socket.write ("??? (Hoops) Unknown Command [help ???]\n");
        // socket.write (err + "\n");
        socket.write (prompt);
        return (255); // special ignore status return code
    }
        
    // final processing of data return from parser
    switch (data.cmd) {
        case "EMPTY":  // ignore empty lines           
            break;
        case "LOGIN":  // simulate a real login [parsed by DevClient]
            device.data=data;
            socket.write (prompt);
            return (0);
        case "HELP":   // better than no documentation :)
            socket.write ("> ---- help ----\n");
            socket.write (">   devices|dev                       [list devices]\n");
            socket.write (">   create xxxx abcd                  [create devices in database imei=xxx name=abcd]\n");
            socket.write (">   remove xxxx                       [delete devices in database imei=xxx name=abcd]\n");
            socket.write (">   track xxxx|all                    [track device imei=xxxx]\n");
            socket.write (">   send|snd CMD|HELP xxx|all [arg1..argn] [send command to imei=xxxx {for commands list check backend]\n");
            socket.write (">   controlers|ctrl                   [list controlers]\n");
            socket.write (">   backend|bck                       [display backend]\n");
            socket.write (">   login xxxxxxxxx                   [simulate a imei login for telnet client]\n");
            socket.write (">   logout xxxxxxxx                   [close client socket and force a full reconnect]\n");
            socket.write (">   dbinit                            [if not exist create table in database]\n");
            socket.write (">   listen|evt                        [register a listener to receive event from gpsd as user application does\n");
            socket.write (">   quit|exit                         [close connection]\n");
            break;
        case "DEVICE": // list devices from gpsd active list
            count = 0;
            socket.write ("> List active devices \n");
            for (var devId in gpsd.activeClients) {
            count ++;
                dev= gpsd.activeClients[devId].device;
                socket.write ("> - " + count + " - imei: " + devId + " Name:\"" + dev.name + "\"" + " uuid=" + dev.uuid +"\n");
            }
            if (count === 0) socket.write ("> - no active devices [retry later]\n");
            break;
        case "LISTEN": // register to listen gpsd application events
            this.HookEventHandler (socket, gpsd);
            break;
            
        case "CONTROL": // list active controler for this gpsd
            socket.write (">  List active device controler\n");
            for (var svc in gpsd.controlers) {
                ctrl= gpsd.controlers[svc];
                socket.write ("> - uuid=" + ctrl.uuid + "\n");
            } 
            break;
        case "BACKEND": // list active backend for this gpsd
            socket.write (">  Current Backend: " + gpsd.backend.uuid + "\n");
            break;

        case "TRACK":  // track one or all active devices
            var job={command:'GET_POS'
                ,gpsd   : gpsd
                ,devId  : data.imei
                ,request: this.request++
            };
            gpsd.queue.push (job, JobCallback); // push to queue
            socket.write ("--> queue:" + job.request);
            break;
        case "LOGOUT":  // force a device to close tcp socket
            var job={command:'LOGOUT'
                ,gpsd   : gpsd
                ,devId  : data.imei
                ,request: this.request++
            };
            gpsd.queue.push (job, JobCallback); // push to queue
            socket.write ("--> queue:" + job.request);
            break;
        case "DBINIT": // Create table in database
            status= gpsd.backend.CheckTablesExits ();
            socket.write ("--> dbinit:" + status + "\n");
            break;
        case "CREATE": // create a device within database backend
            status= gpsd.backend.CreateDev (data.imei, data.args);
            socket.write ("--> create:" + status + "\n");
            break;
        case "DROP": // create a device within database backend
            status= gpsd.backend.RemoveDev (data.imei);
            socket.write ("--> drop:" + status + "\n");
            break;
        case "SEND": // request action from device
            var job={command: data.action.toUpperCase()
                ,gpsd : gpsd
                ,devId  : data.imei
                ,args   : data.args 
                ,request:  this.request++
            };
            gpsd.queue.push (job, JobCallback); // push to queue
            socket.write ("--> queue:" + job.request);
            break;
        case "QUIT": // force closing of tcp connection
            socket.end();
            return (255);
            break;
        default:   
            socket.write (prompt);
            break;     
    };
    // wait 1/4s before rewriting prompt [most command will be finished]
    setTimeout(function () {socket.write (prompt);}, 250);
    // Telnet adapter alway return special 255 status code to DevClient
    return (255);
};


// if started as a main and not as module, then process test.
if (process.argv[1] === __filename)  {
    // Add here any paquet you would like to test
    testParser = {  Empty: ""
        ,"Start     " : "ctrl"
        ,"Quit      " : "quit"
        ,"List      " : "dev"
        ,"Login     " : "login 123456"
        ,"Track1    " : "track 123456"
        ,"Track2    " : "track all"
        ,"Send1     " : "send  123456 command"
        ,"Send2     " : "send  123456789 help"
        ,"Send3     " : "send  all    command"
        ,"Send4     " : "send  123456 command arg1"
        ,"Send5     " : "send  123456 command arg1 arg2"
        ,"Create    " : "create 123456 My Friendly Name"
        ,"Logout    " : "logout 123456"
        ,"DBinit    " : "dbinit"
     
    };
    dummy = [];  // dummy object for test
    dummy.debug = 9;
    devAdapter  = new DevAdapter (dummy);
    devAdapter.TestParser (testParser);
    console.log ("**** Telnet Parser Test Done ****");
}

module.exports = DevAdapter; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/
