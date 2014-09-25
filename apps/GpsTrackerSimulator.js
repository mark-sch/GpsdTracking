#!/usr/bin/env node

/* 
 * Copyright 2014 Fulup Ar Foll
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
 * GpsTrackerSimulator simulate a GPS. It takes input from gpx route/track file.
 * It support OpenCPN/VisuGPX export format, and hopefully while not tested
 * many other GPX format may work.
 * 
 * GpsTrackerSimulator can either send its NMEA feed as a client, or server to consumer.
 *  - server: configure OpenCPN or other client to consume a network nmea feed on your selected port
 *  - client: send TCP feed to GpsdTrack nmea183 adapter or to linux gpsd daemon using tcp://locahost:xxxx
 *  
 * GpsTrackerSimulator generate intermediary points automatically. It takes each subsegment
 * of your route and track. Computes intermediary points depending on your selected
 * speed and tic. Sends nmea paquets at your selected tic rate. Stop at file end.
 * 
 * syntax:  node GpsTrackerSimulator --file=xxxxxx [--speed=xxx --tic=xxx --hostname=xxx --servermode --port=xxx ]
 *     --file=none      exported route from OpenCPN or any other valid gpx file
 *     --speed=20       knts at witch fake tracker moves from one point to an other
 *     --tic=180        period in sec in between gps data update
 *     --hostname=xxx   host to connect in client mode
 *     --servernode     enter servermove [incompatible with connect]
 *     --port=5000      port for either server or client connection
 *     --debug=1        debuglevel from 0-9
 *     
 *  you can generate GPX files with:
 *  - opencpn or any other navigation software
 *  - upload gpx file from most GPS devices
 *  - create oneline with http://www.visugpx.com/editgpx/
 *  - http://events.paudax.com/content/planning-your-diy-perm-route-google-maps
 *  
 *  Installation (requirer node.js)
 *      npm install sgeo
 *      npm install jison
 *      npm install xml2js
 *      
 *      node GpsTrackerSimulator --help
 * 
 */

var util     = require("util");
var fs       = require('fs');
var path     = require('path');
var jison    = require("jison").Parser;
var fs       = require('fs');
var net      = require('net');
var async    = require("async");
var sgeo     = require('sgeo');   // https://www.npmjs.org/package/sgeo
var xml2js   = require('xml2js'); // https://github.com/Leonidas-from-XIV/node-xml2js


// [Must be known] TcpConnect handler extend net.createServer object
// This method is executed at each time a client hit TcpServer listening port
var ServerConnect = function (socket) {
    simulator= this.simulator;     // make our coding life easier
    
    socket.uuid = "Socket://" + socket.remoteAddress +":" + socket.remotePort;
    simulator.Debug(3, "New TcpClient Id-%d Server=[%s] Client: [%s]"
             ,simulator.clientCount,this.uuid,socket.uuid);
    
    // keep track of active clients inside TCP server
    socket.countid      = "id-" + simulator.clientCount;
    simulator.clientSock[socket.countid] = socket;
    simulator.clientCount ++;      // increment for next incomming client

    // Normaly gpsd client does not talk to server
    socket.on("data", function(buffer) {
	simulator.Debug(1, "%s Data=[%s]", socket.uuid, buffer);
    });

    // On error close socket
    socket.on('error', function (err) {
        simulator.Debug(1, "%s ERROR=[%s]", socket.uuid, err);
        delete simulator.clientSock[socket.countid];
        socket.end();
    });
        
    // Remove the device from daemon active device list and notify adapter for eventual cleanup
    socket.on('end', function () {
	simulator.Debug(3, "TcpClient Quit %s/%d uuid=%s", socket.countid, simulator.clientCount, socket.uuid);
        delete simulator.clientSock[socket.countid];
    });
};

// this method is call after TCP server start listening
var ServerListen= function () {
    this.simulator.Debug (2,"TcpServer listening port:%d", this.simulator.opts.port);
};
   
// This handler is called when TcpClient connect onto server
var ClientListener = function () {
    
    simulator = this.simulator; // let's make our coding life easier
    
    simulator.Debug (3, 'GpsTrackerSimulator connected to %s:%s', simulator.opts.host, simulator.opts.port);
    this.write("$GPRID," + simulator.opts.imei + "," + simulator.route.name + "*05\r\n");
};
  
// Callback notify Async API that curent JobQueue processing is done
var JobCallback = function (job, callback) {
    // Nothing to do
};

// JobQueue is empty let's process next segment
var JobQueueEmpty = function () {
    simulator = this.simulator; 
       
    // each time job queue is empty we process a new segment
    if (simulator.segment < simulator.route.count-1) {
        
        // this is working segment
        var segstart = simulator.route.waypts  [simulator.segment];
        var segstop  =  simulator.route.waypts [simulator.segment+1];
        
        // compute segment distance
        var p1   = new sgeo.latlon(segstart.lat, segstart.lon);
        var p2   = new sgeo.latlon(segstop.lat, segstop.lon);
        var distance = p2.distanceTo(p1);

        // compute intemediary point speed/distance ration
        var speedms = simulator.opts.speed * 1.852/ 3600;  // speed from knts to meter/second
        var timeins = distance/speedms;               // time in second for this segment
        var inter   =  Math.round (timeins / simulator.opts.tic);  // number of intemediary segments
        
        simulator.Debug (5, "segment %d -- from:%s to:%s distance=%dnm midsegment=%d", simulator.segment, segstart.name, segstop.name, distance/1.852, inter);

        // calculate intermediary waypoint and push them onto NMEA job queue
        var interpolated = p1.interpolate(p2, inter);
        inter1= interpolated[0];
        for (var inter=1; inter < interpolated.length; inter ++) {
            simulator.count ++;
            inter2 = interpolated[inter];
            // push waypoint to the queue
            job = {
                waypts      : inter1,
                bearing     : inter1.bearingTo(inter2).toFixed(2),
                speed       : simulator.opts.speed,
                count       : simulator.count
            };
            simulator.Debug (6, "Queue Intermediary WatPoints N°%d %s bearing: %s", simulator.count, inter1, job.bearing);
            this.push (job, JobCallback);
            inter1 = interpolated[inter];
            inter ++;
        };
    simulator.segment ++; // next time process next segment
    } else {
        simulator.Debug (6, "All route's segments [%d] processed", simulator.segment);
        process.exit(0);
    }
};


// Pop jon from queue is called outside of simulator object context
var JobQueue  = function (job, callback) {
    simulator = this.simulator;
    
    // dummy job to activate jobqueue
    if (job === null) {
        callback ();
        return;
    }
    
    // move from decimal notation to NMEA formating
    var Dec2Min = function(cardinal){
        // NMEA 4737.1024,N for 47°37'.1024 
        if (cardinal<0) cardinal=cardinal*-1;
        deg    = parseInt (cardinal); 
        mindec = (cardinal-deg)*60;
        min    = parseInt (mindec);
        secdec = mindec-min;
        card=deg*100+min+secdec;

        return (card);
    };
    
    // Build an NMEA compliant date 100106=10-jan-2006 053740=5h37m40s
    var NmeaDate = function () {
        date= new Date();
        stringDate= date.toISOString().replace(/T/, ' ').replace(/\..+/, '').replace(/\-/g, '').replace(/\:/g, '');
        time=stringDate.split (" ");
        nmeatime=[time[0].substring (2,8), time[1]];
        return (nmeatime);
    };
    
    // build NMEA 
    //    $GPRMC,083559.00,A,4717.11437,N,00833.91522,E,0.004,77.52,091202,,,A*57\n
    //    $GPRMC,112311.00,A,4732.33   ,N,  253.49   ,W,12   ,43.44,140923,,,A*00
    //     
    if (job.waypts.lat < 0) lato="S";
    else lato='N';
    if (job.waypts.lng < 0) lono="W";
    else lono="E";
    now=NmeaDate();
    paquet=util.format ("$GPRMC,%s.00,A,%s,%s,%s,%s,%s,%s,%s,,,A", now[1],Dec2Min(job.waypts.lat),lato, Dec2Min(job.waypts.lng), lono, job.speed, job.bearing, now[0]);
    
    // paquet='GPGLL,5300.97914,N,00259.98174,E,125926,A';
    // paquet='GPRMC,083559.00,A,4717.11437,N,00833.91522,E,0.004,77.52,091202,,,A'
    var checksum = 0; // http://rietman.wordpress.com/2008/09/25/how-to-calculate-the-nmea-checksum/
    for(var i = 1; i < paquet.length; i++) {
        checksum = checksum ^ paquet.charCodeAt(i);
    }
    trailer=util.format ("*%s\n", checksum.toString(16));
    simulator.Debug (4, "Waypts:%s ==> [%s]", job.count, paquet);
    
    // send paquet onto socket
    if (simulator.opts.srvmod) {
        // server mode we broadcast NMEA paquet to every active clients
        for (var sock in simulator.clientSock) {           
            simulator.clientSock [sock].write (paquet + trailer);
            // simulator.clientSock [sock].write ("$GPRMC,083559.00,A,4717.11437,N,00833.91522,E,0.004,77.52,091202,,,A*xx");
        }
    } else {
        // we send NMEA paquet to our destination server
        simulator.socket.write (paquet); 
    }
    

    // wait tic time before sending next NMEA command
    simulator.queue.pause ();
    setTimeout(function () {simulator.queue.resume();}, simulator.ticms);
 
    callback (); // notify async api that we're done for this waypoint
};

// Adapter is an object own by a given device controler that handle data connection
GpsTrackerSimulator = function() {
    
    // before anything else parse command line argements
    this.ParseArgs();  // result return at this.opts
    this.uuid = "GpsTrackerSimulator//imei:" + this.opts.imei +'/port' + this.opts.port;
     // opts= after parsing argement
         // gpxfile 
         // imei 
         // speed
         // tic
         // proto 
         // host
         // port 
         // servermode
         // debug
        
    // openfile and read store it in a buffer string
    try {
        this.xmlData = fs.readFileSync (this.opts.gpxfile, "utf-8");
    } catch (err) {
        this.Debug (0, "Hoops file=%s err=%s", this.opts.gpxfile, err);
        process.exit (-1);
    }
    
    // Process XLM/GPX route/track File (result in this.route)
    this.ProcessGPX();
    
    // migh want to check your waypoint before moving any further
    console.log ("Gpx Route=[%s] Waypts=[%d]", this.route.name, this.route.count);
    for (var pts in this.route.waypts) {
        this.Debug (3, "GPX waypts %d -- name: %s  Lon: %s Lat:%s Date:%s", pts, this.route.waypts [pts].name, this.route.waypts [pts].lat, this.route.waypts [pts].lon, this.route.waypts [pts].date);
    };
    
    // in not in server mode let start a socket
    if (this.opts.srvmod) {
        this.clientCount= 0;       // index tcp clients socket
        this.clientSock = [];      // array tcp clients socket
        this.server = this.TcpServer (); // start a server waiting on --port/localhost
    } else {
        this.socket = this.TcpClient();  // when connected will enter ClientListener() event handler
    }
  
    // NMEA segement are process each time job queue is empty
    this.queue           = async.queue  (JobQueue, 1); 
    this.queue.uuid      = "JobQueue:1";
    this.queue.simulator = this;                 // enable simulator context within queue handler
    this.segment         = 0;                    // next segment to process counter
    this.count           = 0;                    // stat on NMEA packets
    this.ticms           = this.opts.tic * 1000; // node.js timer are in ms
    this.queue.drain     = JobQueueEmpty;        // empty queue callback
    // this.queue.push (null, JobCallback);         // force queue activation
    var jobqueue = this.queue;
    
    
    
    setTimeout(function () {jobqueue.push (null, JobCallback);}, 5000); // wait 5S before start
};

// ------- Public Methods --------------
GpsTrackerSimulator.prototype.Debug = function(level, format) {  //+ arguments
    if (this.opts.debug >= level) {

        args = [].slice.call(arguments, 1); // copy argument in a real array leaving out level
        this.message=util.format.apply (null, args);
        console.log ("-%d- %j", level, this.message);
    };
};

// Process GPX file parse and send NMEA paquet
GpsTrackerSimulator.prototype.ProcessGPX= function () {
    route = {
        name  : "", // route name from gpx file
        count : 0,  // number of waypts/trackpts
        waypts:[]   // list of waypoint lat/lon
    };
    
    // process data return by XML2JSON
    var ParseGPX= function(err, result) {
        var data=[];
    
        // default route name if not present in XML
        var now=new Date();
        data.name= 'ParseGPX' + now.toISOString(); 
    
        // search for gpx tag
        if (result['gpx'] === undefined) {
            console.log ("Fatal: Not a GPX route/track file [no <gpx></gpx> tag]");
            process.exit (-1);
        }
        // search for track tag
        if (result['gpx']["trk"] !== undefined) {
            //console.log ("track=%s", JSON.stringify(result['gpx']["trk"]));
            data = {
                mode    : 'track',
                name    : result['gpx']["trk"][0].name,
                segment : result['gpx']["trk"][0]["trkseg"][0]['trkpt']
            };
        };
        // search for route tag
        if (result['gpx']["rte"] !== undefined) {
            //console.log ("route=%s", JSON.stringify(result['gpx']["rte"]));
            data = {
                mode    :'route',
                name    :result['gpx']["rte"][0].name,
                segment :result['gpx']["rte"][0]["rtept"]
            };
        };
        if (data.mode === undefined) {
           console.log ("Fatal Not a valid GPX route/track file <trk>|<rte> tag");
           process.exit (-1);
        }
    
        // provide a default name if nothing found in gpxfile
        if (data.name === undefined) {
            now= new Date();
            route.name = 'GpsTrackerSimulator://' + this.opts.gpxfile + "/" + now.toISOString();
        } else {
            route.name = 'GpsTrackerSimulator://' + data.name;
        }
    
        switch (data.mode) {
        case "track":
            for (trackpts in data.segment)  {
                // console.log ("trackpts[%s]=%s", trackpts, JSON.stringify(data.segment[trackpts]));
                if (data.segment[trackpts]['name'] === undefined) nam= 'TrackPts-' + trackpts; 
                    else nam=data.segment[trackpts]['name'];
                lat=data.segment[trackpts]["$"].lat;
                lon=data.segment[trackpts]["$"].lon;
                spd=data.segment[trackpts]['speed'];
                crs=data.segment[trackpts]['course'];
                alt=data.segment[trackpts]['ele'];
                dat=data.segment[trackpts]['time'];
                //console.log ("name=%s  lat=%s lon=%s speed=%s course=%s alt=%s", nam, lat, lon, spd, crs, alt);
                route.waypts.push ({name: nam, lat: lat, lon: lon, date: dat});
                route.count++;
            }
            break;
        case 'route':
            for (routepts in data.segment)  {
                // console.log ("routepts[%s]=%s", routepts, JSON.stringify(data.segment[routepts]));
                if (data.segment[routepts]['name'] === undefined) nam= 'TrackPts-' + routepts; 
                    else nam=data.segment[routepts]['name'];
                lat=data.segment[routepts]["$"].lat;
                lon=data.segment[routepts]["$"].lon;
                // console.log ("name=%s  lat=%s lon=%s", nam, lat, lon);
                route.waypts.push ({name: nam, lat: lat, lon: lon});
                route.count++;
            }
            break;
        };
    };
    // Create GPX parser and send file for parsing
    parser = new xml2js.Parser();
    parser.parseString(this.xmlData, ParseGPX);
    this.route=route;  // store result in simulator for jobqueue to process them    
};


GpsTrackerSimulator.prototype.ParseArgs = function () {
   cmdgrammar = {  
    "lex": {
        "rules" : [ ["\\s+" , "return 'BLK';"]
            ,['--file='     , "return 'FIL';"]
            ,['--speed='    , "return 'SPD';"]
            ,['--tic='      , "return 'TIC';"]
            ,['--proto='    , "return 'PRO';"]
            ,['--hostname=' , "return 'HOS';"]
            ,['--port='     , "return 'PRT';"]
            ,['--imei='     , "return 'IME';"]
            ,['--debug='    , "return 'DEB';"]
            ,['--servermode', "return 'SRV';"]
            ,['--testparser', "return 'PAR';"]
            ,['--help'      , "return 'HLP';"]
            ,[':'           , "return 'SEP';"]
            ,[','           , "/* ignore */"]
            ,['([0-z)|[-]|[\\.]|[\\/])+'  , "return 'TEX';"]
            ,['$'           , "return 'EOL';"]
        ]
    },  // end Lex rules
    
    "bnf": { // WARNING: only one space in between TOKEN ex: "STOP EOF"
        'data':  [
            ["OPTIONS EOL" , "return (this);"]
        ]
        ,'OPTIONS': [['OPTION', ""]
           ,['OPTION BLK', ""]
           ,['OPTIONS OPTION BLK', ""]
           ,['OPTIONS OPTION', ""]
        ]
        ,'OPTION' : [["EOL"      , "return (this);"]
           ,['FIL TEX'  ,"this.file=$2;"]
           ,['SPD TEX'  ,"this.speed=$2;"]
           ,['TIC TEX'  ,"this.tic=$2;"]
           ,['PRO TEX'  ,"this.proto=$2;"]
           ,['HOS TEX'  ,"this.host=$2"]
           ,['PRT TEX'  ,"this.port=$2"]
           ,['IME TEX'  ,"this.imei=$2"]
           ,['DEB TEX'  ,"this.debug=$2"]
           ,['SRV'      ,"this.srvmod=true"]
           ,['PAR'      ,"this.testpar=true"]
           ,['HLP'      ,"this.help=true"]
           ]
    }};

    // instanciate command line parser
    var parser=new jison (cmdgrammar);
    
    // get and parse command line options
    this.cmdname= process.argv[1];
    var args = process.argv.slice(2);
    
    // data = parser.parse ("--file=./your-file.gpx --speed=20 --tic=120 --proto=nmea --hostname=localhost --servermode --port=5000 --debug=1");
    // data = parser.parse (args.toString());
    
    try {data = parser.parse (args.toString());}
     catch (err) {
        console.log ("Syntax error [please check --help]");
        process.exit (err);
    }
    
    // provide missing values with defaults
    this.opts= {
            gpxfile    : data.file    || null,        // no default for file
            imei       : data.imei    || 123456789,   // default fake imei
            speed      : data.speed   || 12,           // default 8knts  
            tic        : data.tic     || 180,
            proto      : data.proto   || "nmea",
            host       : data.host    || "localhost", // default connect
            port       : data.port    || 5001,        // default tcp NMEA port
            srvmod     : data.srvmod   || false,       // default is client mode
            debug      : data.debug   || 3,           // default no debug
            testparser : data.testpar || false,       // do no test parser
            help       : data.help    || false        // default no help
    };
    this.Debug (7, "OPTIONS: file=%s speed=%d tic=%d proto=%s hostname=%s port:%d debug=%d servermode=%s", this.opts.gpxfile
               , this.opts.speed, this.opts.tic, this.opts.proto, this.opts.host, this.opts.port, this.opts.debug, this.opts.srvmod);
    
    // if help call then display help and exit
    if (this.opts.help)  {
        console.log ("Help: node %s --file=./your-file.gpx [--speed=12] [--tic=120] [--imei=123456789] [--proto=nmea] [--servermode | --hostname=localhost] [port=5000] [--testparser] [--debug=1]", this.cmdname);
        process.exit();
    }
    
    // check --file is present and filename exite
    if (this.opts.file === null) {
        console.log ("Error: --file=xxxx [xxx must be a valid gpx file");
        process.exit();
    } else {
        try {!fs.statSync (this.opts.gpxfile).isFile();}
        catch (err) {
            console.log ("Error: --file=%s err=%s", this.opts.gpxfile, err);
            process.exit();
        }
    };
    return (this.opts);
};


// compute intemediary segment from two given waypoint
GpsTrackerSimulator.prototype.ProcessSegment = function (geos1, geos2) {

    var p3 = new sgeo.latlon(47.619854,-2.772128);
    var p4 = new sgeo.latlon(47.609555, 2.736765);

    var dist = p3.distanceTo(p4);

    console.log(p1.lat); //display latitude
    console.log(p1.lng); //display longitude
    console.log(p1); //toString()

    var dist = p1.distanceTo(p2);      
    var brng = p1.bearingTo(p2);       

    var inp = p1.interpolate(p2, 5);
};

// generate a valid NMEA GPRMC from gprx file
GpsTrackerSimulator.prototype.FormatNmea183 = function () {
     
  // $GPRMC,225446.00,A,4916.45,N,12311.12,W,000.5,054.7,191194,020.3,E*68
  paquet=util.format ("GPRMC,%d.00,A,%s,%s,%d,%d,%s,,", args);
  // http://www.tigoe.com/pcomp/code/Processing/127/
   
  // Write paquet with a dummy check did not found how to acheive this node.js
  this.client.write ('$' + paquet + "*00");
};

// implement a gps server compatible with OpenCPN/GPSd
GpsTrackerSimulator.prototype.TcpServer = function () {
    
    // Launch Server and use it handler to store informations needed within tcpConnect handler
    tcpServer           = net.createServer(ServerConnect);
    tcpServer.uuid      = "TcpServer://localhost:" + this.opts.port;
    tcpServer.simulator = this;

    // Activate server to listern on its TCP port
    tcpServer.listen(this.opts.port, ServerListen);
    return (tcpServer);
};

// act as a tcp client like any gps tracking device
GpsTrackerSimulator.prototype.TcpClient = function () {
   var simulator = this; // hack to access simulator object from network handler 
    
  // connect onto server, call listerner on success
  socket = net.connect(this.opts.port, this.opts.hostname, ClientListener);
  socket.simulator = this;

  // Server is talking to us
  socket.on('data', function(data) {
    console.log(data.toString());
  
  });
  
  // Server close connection
  socket.on('end', function() {
    console.log('client disconnected');
  });
  
  // Remove the device from daemon active device list and notify adapter for eventual cleanup
  socket.on('end', function () {
     console.log('server aborted connection');
     console.log('*** GpsTrackerSimulator Ended ***');
     process.exit (-1);
  });
  
  // stop client.end();
  return (socket);
};

// ****** Start Program *****
// process.argv=['node', 'GpsTrackerSimulator', '--file=../samples/gpx-files/route-cardinaux.gpx', '--servermode', '--port=4999', '--tic=2', '--speed=30',  '--debug=4'];
// process.argv=['node', 'GpsTrackerSimulator', '--file=../samples/gpx-files/track-test.gpx', '--hostname=localhost', '--port=6001', '--tic=10', '--speed=80',  '--debug=4'];
// process.argv=['node', 'GpsTrackerSimulator', '--file=../samples/gpx-files/sample-123456789.gpx', '--servermode', '--port=6001', '--tic=10', '--speed=80',  '--debug=4'];
simulator = new GpsTrackerSimulator ();
