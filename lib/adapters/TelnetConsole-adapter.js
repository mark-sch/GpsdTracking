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
 * Telnet-Adapter is a dummy adapter for debug purdev.stampe. 
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
            ,['ctrl\\b'             , "return 'CTRL';"]
            ,['back\\b'             , "return 'BACK';"]
            
            ,['evt\\b'              , "return 'EVTS';"]
            ,['start\\b'            , "return 'STAR';"]
            ,['on\\b'               , "return 'STAR';"]
            ,['stop\\b'             , "return 'STOP';"]
            ,['off\\b'              , "return 'STOP';"]
            
            ,['dev\\b'              , "return 'DEV';"]
            ,['list\\b'             , "return 'LIS';"]
            ,['login\\b'            , "return 'LOG';" ]
            ,['logout\\b'           , "return 'OUT';" ]
            ,['info\\b'             , "return 'INF';" ]
            ,['track\\b'            , "return 'TRK';" ]
            
            ,['snd\\b'              , "return 'SEND';"]
            ,['all\\b'              , "return 'ALL';" ]

            ,['db\\b'               , "return 'BASE';"]
            ,['create\\b'           , "return 'CREA';"]
            ,['remove\\b'           , "return 'DROP';"]
            ,['search\\b'           , "return 'SEAR';"]
            ,['show\\b'             , "return 'SEAR';"]
            ,['init\\b'             , "return 'INIT';"]
            
            ,['[^ ]+\\b'            , "return 'TXT';" ]
            ,['\\n'                 , "return 'EOL';" ]
            ,[';'                   , "return 'EOL';" ]
            ,['$'                   , "return 'EOL';" ]
        ]
    },  // end Lex rules
    
    "bnf": { // WARNING: only one space in between TOKEN ex: "STOP EOF"
        'data': [["EOL"        ,"this.cmd='EMPTY'; return (this);"]
                ,["QUIT EOL"   ,"this.cmd='QUIT'   ; return (this);"]
                ,["HELP EOL"   ,"this.cmd='HELP'   ; return (this);"]
                ,["CTRL EOL"   ,"this.cmd='CONTROL'; return (this);"]
                ,["BACK EOL"   ,"this.cmd='BACKEND'; return (this);"]
                ,["COMMD EOL"  ,"return (this);"]
                
                ,["DEV LIS EOL"  ,"this.cmd='DEVLIST' ; return (this);"]
                ,["DEV ALL EOL"  ,"this.cmd='DEVALL' ; return (this);"]
                ,["DEV LOG TXT EOL"   ,"this.cmd='DEVIN'  ; this.imei=$3; return (this);"]
                ,["DEV OUT TXT EOL"   ,"this.cmd='DEVOUT' ; this.imei=$3; return (this);"]
                ,["DEV OUT ALL EOL"   ,"this.cmd='DEVOUT' ; this.imei=0;  return (this);"]
                ,["DEV TRK TXT EOL"   ,"this.cmd='DEVTRCK'; this.imei=$3; return (this);"]
                ,["DEV TRK ALL EOL"   ,"this.cmd='DEVTRCK'; this.imei=0;  return (this);"]
                ,["DEV INF TXT EOL"   ,"this.cmd='DEVINFO'; this.imei=$3; return (this);"]
                
                ,["BASE INIT EOL"     ,"this.cmd='DBINIT' ;return (this);"]
                ,["BASE DROP TXT EOL" ,"this.cmd='DBDROP' ; this.imei=$3;return (this);"]
                ,["BASE SEAR TXT EOL" ,"this.cmd='DBSEAR' ; this.imei=$3; this.args=5; return (this);"]
                ,["BASE SEAR TXT TXT EOL" ,"this.cmd='DBSEAR' ; this.imei=$3; this.args=parseInt($4); return (this);"]
                ,["BASE CREA ARGS EOL","this.cmd='DBCREA' ; this.imei=$3;return (this);"]
                
                ,["EVTS STAR EOL" ,"this.cmd='EVTSTART' ; return (this);"]
                ,["EVTS STOP EOL" ,"this.cmd='EVTSTOP'  ; return (this);"]
           ] 
        ,'COMMD':[
            ,["SEND TXT ALL ARGS"     , "this.cmd='SEND'; this.action=$2; this.imei=0;"]
            ,["SEND TXT TXT ARGS"     , "this.cmd='SEND'; this.action=$2; this.imei=$3;"]
            ,["SEND TXT ALL"          , "this.cmd='SEND'; this.action=$2; this.imei=0;"]
            ,["SEND TXT TXT"          , "this.cmd='SEND'; this.action=$2; this.imei=$3;"]
            ,["SEND HELP TXT"         , "this.cmd='SEND' ; this.imei=$3; this.action='help';"]
        ]
        ,'ARGS':[
             ["TXT"                   , "this.args=[$1];"]
            ,["ARGS TXT"              , "this.args.push ($2);"]
        ]
    }};

    this.uid      = "DevAdapter:" + "Telnet";
    this.control   = "tcpsock";
    this.info      = "Telnet";
    this.debug     = controler.svcopts.debug;  // inherit debug from controler
    this.Debug (1,"New  DevAdapter: %s", this.uid);    
    this.controler = controler;  // keep a link to device controler and TCP socket
    this.parser    = new Jison(grammar);
    this.request   = 0; // job request number for gpsd queue
    try {
        this.prompt    = controler.gpsd.opts.name +"> ";
    } catch (err) {
        this.prompt    = "GpsdTracker> ";
    }
};

// Import debug method 
DevAdapter.prototype.Debug = Debug;



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
        gpsd.Debug(7, "Remove Telnet gpsd event listener [%s]", gpsd.uid);
        gpsd.event.removeListener("queue" ,EventHandlerQueue);	
        gpsd.event.removeListener("accept",EventHandlerAccept);	
        gpsd.event.removeListener("error" ,EventHandlerError);	
    } else {
        // Events from queued jobs
        message=util.format ("> Hook On [Listening for gpsd [queue|acept|error] events\n");
        socket.write (message);
        // note: in order to make removal of listener dev.stampsible function should have a static name
        gpsd.event.on("queue" ,EventHandlerQueue);	
        gpsd.event.on("accept",EventHandlerAccept);	
        gpsd.event.on("notice",EventHandlerError);
    }
};

// Method is called each time a new client connect
DevAdapter.prototype.ClientConnect = function (socket) {
    socket.write ("> type: help for support [evt to receive events]\n");
    socket.write (this.prompt);
};

// Method is called when a client quit a TcpClient adapter
DevAdapter.prototype.ClientQuit = function (socket) {
};

// Command received from TCP server
DevAdapter.prototype.SendCommand = function(socket, action, arg1) {
    var gpsd = this.controler.gpsd;
    
    switch (action) {
        case "LOGOUT": // warning at this point socket is not valid !!!
            this.HookEventHandler (null, gpsd);
            break;
        case "HELP":  // return supported commands by this adapter
            listcmd=["try: [help] command directly"];  
            // push a notice HELP action event to gpsd
            device.controler.gpsd.event.emit ("notice", "HELP", listcmd, this.uid, socket.uid);
            break;
        default: 
            this.Debug (1,"Telnet ignored Command=[%s]", action);
            return (-1);
    }
    return (0);
};


// This routine is call from DevClient each time a new line arrive on socket
DevAdapter.prototype.ParseBuffer = function(socket, buffer) {
    var prompt=this.prompt;  // make prompt avaliable in timer :(
    
    var JobCallback = function (job) {
        var msg = util.format (" --> [job:%s] command=%s imei=%s [sent]\n", job.request, job.command, job.devId);
        socket.write (msg);
    }; 

    // make our life simpler
    var gpsd   = socket.controler.gpsd;
    var adapter= socket.adapter;

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
            socket.write (">   dev list                          [list devices]\n");
            socket.write (">   dev track  xxxx                   [send track request to device imei=xxxx]\n");
            socket.write (">   dev info   xxxx                   [display avaliable last info from activeClient imei=xxxx]\n");
            socket.write (">   dev login  xxxx                   [simulate imei=xxxx login]\n");
            socket.write (">   dev logout xxxx                   [close client socket & force a full reconnect]\n");
            socket.write (">\n");
            socket.write (">   db init                           [if not exist create table in database]\n");
            socket.write (">   db create xxxx abcd               [create devices in database imei=xxx name=abcd]\n");
            socket.write (">   db remove xxxx                    [delete devices in database imei=xxx]\n");
            socket.write (">   db search xxxx                    [search last devices dev.stampitions in database imei=xxx]\n");
            socket.write (">\n");
            socket.write (">   snd track xxxx|all                [track device imei=xxxx]\n");
            socket.write (">   snd cmd   xxxx|all [arg1..argn]   [send command=cmd to imei=xxxx]\n");
            socket.write (">   snd help  xxxc                    [check avaliable commands for imei=xxxx]\n");
            socket.write (">\n");
            socket.write (">   evt start                         [register a listener to receive event from gpsd as user application does\n");
            socket.write (">   evt stop                          [stop event listener\n");
            socket.write (">\n");
            socket.write (">   ctrl                              [list controlers]\n");
            socket.write (">   back                              [display backend]\n");
            socket.write (">   quit                              [close connection]\n");
            break;
        case "DEVLIST": // list devices from gpsd active list
            var count = 0;
            socket.write ("> List loged active devices \n");
            for (var devId in gpsd.activeClients) {
                dev= gpsd.activeClients[devId];
                if (dev.loged) {
                    count ++;
                    var elapse= parseInt((new Date().getTime()- dev.lastshow)/1000);
                    
                    var info= util.format ("> -%d- imei/mmsi= %s Name= '%s' LastShow: %ds Adapter: %s\n"
                              , count, devId, dev.name, elapse, dev.adapter.info);
                    socket.write (info);

                }
            }
            if (count === 0) socket.write ("> - no active devices [try 'dev all']\n");
            break;
        case "DEVALL": // list devices from gpsd active list
            var count = 0;
            socket.write ("> List all active devices \n");
            for (var devId in gpsd.activeClients) {
                count ++;
                dev= gpsd.activeClients[devId];
                var elapse= parseInt((new Date().getTime()- dev.lastshow)/1000);
                var info= util.format ("> -%d- imei/mmsi= %s Name= '%s' Loged=%s LastShow: %ss Adapter: %s\n"
                        , count, devId, dev.name, dev.loged, elapse, dev.adapter.info);
                    socket.write (info);
            }
            if (count === 0) socket.write ("> - no active devices [retry later]\n");
            break;
        case "EVTSTART": // register to listen gpsd application events
            this.HookEventHandler (socket, gpsd);
            break;
        case "EVTSTOP": // register to listen gpsd application events
            socket.write ("> stop event listen\r\n");
            this.HookEventHandler (null, gpsd);
            break;
            
        case "CONTROL": // list active controler for this gpsd
            socket.write (">  List active device controler\n");
            for (var svc in gpsd.controlers) {
                ctrl= gpsd.controlers[svc];
                socket.write ("> - uid=" + ctrl.uid + "\n");
            } 
            break;
            
        case "BACKEND": // list active backend for this gpsd
            socket.write (">  Current Backend: " + gpsd.backend.uid + "\n");
            break;
            
        case 'DBSEAR':
            try {
              // Ask DB backend to display on telnet socket last X position for imei=yyyy
              var DBcallback = function (dbresult) {
                if (dbresult === null || dbresult === undefined) {
                    this.Debug (1,"Hoops: no DB info for %s", data.imei);
                    return;
                }
                
                for (var idx = 0; (idx < dbresult.length); idx ++) {
                    var posi= dbresult[idx];
                    posi.lon   = posi.lon.toFixed (4);
                    posi.lat   = posi.lat.toFixed (4);
                    posi.speed = posi.speed.toFixed (2);
                    posi.crs   = posi.crs.toFixed (2);
                    var info=util.format ("> -%d- Lat:%s Lon:%s Speed:%s Alt:%s Crs:%s Time:%s\n"
                    , idx++, posi.lat, posi.lon, posi.speed, posi.alt, posi.crs, posi.date.toJSON());
                    socket.write (info);
                 }
              };
              var lastpos = gpsd.backend.LookupDev (DBcallback, data.imei, data.args);
              } catch(err) {
                this.Debug (1,"Error: DBsearch imei:%s err=%s", data.imei, err);
                socket.write ("> - imei: " + data.imei + "error requesting DB backenddev list] %s\n");
              }
            break;
            
        case "DEVTRCK":  // track one or all active devices
            var job={command:'GET_POS'
                ,gpsd   : gpsd
                ,devId  : data.imei
                ,request: this.request++
            };
            gpsd.queue.push (job, JobCallback); // push to queue
            socket.write ("--> queue:" + job.request);
            break;
            
        case "DEVINFO":  // print info avaliable from gpsd activeClient array
              
            try {
                var dev= gpsd.activeClients [data.imei];
                var elapse= parseInt((new Date().getTime()- dev.lastshow)/1000);
                dev.lon   = dev.stamp.lon.toFixed (4);
                dev.lat   = dev.stamp.lat.toFixed (4);
                dev.speed = dev.stamp.speed.toFixed (2);
                dev.crs   = dev.stamp.crs.toFixed (2);
                dev.alt   = dev.stamp.alt.toFixed (2);
                var info= util.format ("> --- imei/mmsi= %s Name= '%s' LastShow: %ss Adapter: %s\n"
                              , devId, dev.name, elapse, dev.adapter.info);
                socket.write (info);
                info=util.format (">    Lat:%s Lon:%s Speed:%s Alt:%s Crs:%s Time:%s\n"
                             , dev.lat, dev.lon, dev.speed, dev.alt, dev.crs, dev.stamp.date.toJSON());
                 socket.write (info);
            } catch(err) {
                this.Debug (1,"Error: parsing DEVINFO:%s", err);
                socket.write ("> - imei: " + data.imei + "No Stamp Info [try dev track] %s\n");
            }
            break;
        case "DEVOUT":  // force a device to close tcp socket
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
        case "DBCREA": // create a device within database backend
            status= gpsd.backend.CreateDev (data.imei, data.args);
            socket.write ("--> create:" + status + "\n");
            break;
        case "DBDROP": // create a device within database backend
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
        
        ,"List2     " : "dev  list"
        ,"Login     " : "dev  login    123456"
        ,"Logout1   " : "dev  logout   123456"
        ,"Logout2   " : "dev  logout   all"
        
        ,"Send2     " : "snd  help    123456789"
        ,"Send4     " : "snd  command 1234567 arg1"
        ,"Send4     " : "snd  command all arg1"
        ,"Send5     " : "snd  command 1234567 arg1 arg2"
        
        ,"DBinit    " : "db init"
        ,"DBCreate  " : "db create 123456 My Friendly Name"
        ,"DBRemove  " : "db remove 123456"
        ,"DBSearch1 " : "db search 123456"
        ,"DBSearch2 " : "db search 123456 10"
     
    };
    dummy = [];  // dummy object for test
    dummy.debug = 9;
    devAdapter  = new DevAdapter (dummy);
    // Jison is quite picky, heavy testing is more than recommended
    for (var test in testParser) {
        line= testParser[test];
        console.log ("### %s = [%s]", test, line);
        data=devAdapter.parser.parse(line);
        console.log ("--> cmd=%s imei=%s subaction=%s args=%j", data.cmd, data.imei, data.action, data.args); 
    }
    console.log ("**** Telnet Parser Test Done ****");
};

module.exports = DevAdapter; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/
