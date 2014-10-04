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
 * GpsdSimulator simulate a GPS. It takes input from gpx route/track file.
 * It support OpenCPN/VisuGPX export format, and hopefully while not tested
 * many other GPX format may work.
 * 
 * GpsdSimulator can either send its NMEA feed as a client, or server to consumer.
 *  - server: configure OpenCPN or other client to consume a network nmea feed on your selected port
 *  - client: send TCP feed to GpsdTrack nmea183 adapter or to linux gpsd daemon using tcp://locahost:xxxx
 *  
 * GpsdSimulator generate intermediary points automatically. It takes each subsegment
 * of your route and track. Computes intermediary points depending on your selected
 * speed and tic. Sends nmea paquets at your selected tic rate. Stop at file end.
 * 
 * syntax:  handle= new GpsdSimulator(opt);
 * 
 * opts={ file: xxxx GPX file exported from OpenCPN or other GPX compliant tools
 *  speed: xxx --tic=xxx --hostname=xxx --srvmod --port=xxx ]
 *     --file=none        exported route from OpenCPN or any other valid gpx file
 *     --speed=20         knts at witch fake tracker moves from one point to an other
 *     --tic=180          period in sec in between gps data update
 *     --hostname=xxx     host to connect in client mode
 *     --servernode=true  enter servermove [incompatible with connect]
 *     --port=5000        port for either server or client connection
 *     --debug=1          debuglevel from 0-9
 *     --dumpfile=file    copy nmea messages out to fileout
 *     --loopwait=timeout loop on gpx file after timeout (in s)
 *     
 *  you can generate GPX files with:
 *  - opencpn or any other navigation software
 *  - upload gpx file from most GPS devices
 *  - create oneline with http://www.visugpx.com/editgpx/
 *  - http://events.paudax.com/content/planning-your-diy-perm-route-google-maps
 *  
 * 
 */

var util     = require("util");
var fs       = require('fs');
var path     = require('path');
var net      = require('net');
var async    = require("async");
var sgeo     = require('sgeo');   // https://www.npmjs.org/package/sgeo
var xml2js   = require('xml2js'); // https://github.com/Leonidas-from-XIV/node-xml2js
var AisEncode= require('./GpsdAisEncode');   // used only when --proto=ais is activated
var EventEmitter    = require("events").EventEmitter;

var RECONNECT_TIMEOUT=10*1000;    // client reconnection timeout 10s

// small object structure to passe through Job queue we also apply some 
// randomization to provide mode live to char
QJob = function (simulator, lon, lat, speed, bearing, count) {
    this.simulator   = simulator;
    this.lon         = lon;
    this.lat         = lat;
    this.bearing     = parseInt ((parseFloat(bearing)+ (Math.random()*5)-2.5)*10)/10;
    this.speed       = parseInt ((parseFloat(speed)  + (Math.random()*5)-2.5)*100)/100;
    this.count       = count;
};

// Adapter is an object own by a given device controler that handle data connection
GpsdSimulator = function(opts) {
    this.error=false;
    
    /* JobQueuexxx are handlers called by Async. Calls append
     * within async context or completly outside of any context. I use a hack to
     * pass Simulator object as a reference inside each queued jobs. This in order
     * async not to get confused, when using multiple instance of simulator
     * within a single node.js process.
     * 
     * While I'm not happy with this solution, it looks working.
     * If anyone, has a better solution, please let me know
     * 
     */
    
    
    // push a dummy job in queue to force activation
    var JobQueueEmpty = function () {
        this.simulator.ProcessSegment.call (this.simulator);
    };
    
    // This routine is called to notify Async APi that current job is processed
    var JobQueueCallback = function () {};
    
    // Notice method is called by async within unknow context !!!!
    var JobQueuePost  = function (job, callback) {
        // dummy job to activate jobqueue
        if (job === null) {
            callback ();
            return;
        } else {
            job.simulator.ProcessWaypts.call (job.simulator, job);
        }
        // wait tic time before sending next message
        job.simulator.queue.pause (); 
        // provide some randomization on tic with a 50% fluxtuation
        var nexttic = parseInt (job.simulator.ticms * (1+ Math.random()/2));
        setTimeout(function () {job.simulator.queue.resume();}, nexttic);
        callback (); 
    };
    
    // provide some default values 
    this.opts= {
            gpxfile    : opts.gpxfile  || null,           // no default for gpxfile
            mmsi       : opts.mmsi     || 123456789,      // default fake mmsi
            speed      : opts.speed    || 12,             // m/s = 8knts  
            tic        : opts.tic      || 10,             // 10s
            proto      : opts.proto    || "gprmc",        // packet formating 
            host       : opts.host     || "localhost",    // default connect
            port       : opts.port     || 0,              // default tcp NMEA port
            srvmod     : opts.srvmod   || false,          // default is client mode
            debug      : opts.debug    || 3,              // default no debug
            testparser : opts.testpar  || false,          // do no test parser
            cargo      : opts.cargo    || 36,             // default sailing vessel
            uway       : opts.uway     || 8,              // default sailing 
            len        : opts.len      || 15,             // Ship length
            wid        : opts.wid      || 4,              // Ship width
            loopwait   : opts.loopwait || 0,              // Sleep time before restating route
            dumpfile   : opts.dumpfile || null,           // filename for log file or NMEA generated commands
            shipname   : opts.shipname || "Gpsd"+ opts.mmsi,
            callsign   : opts.callsign || "FX"+ opts.port,
            class      : opts.class    || "B", // AIS class A|B
            randomize  : opts.randomize|| 0    // +-Math.Random/opts.randomize to Longitude/Latitude
    }; 
    // check proto values
    switch (this.opts.proto) {
        case 'gprmc': this.opts.gprmcmod=true; break;
        case 'aivdm' : this.opts.aismod =true;  break;
        default:
          console.log ("--proto=%s invalid value [should be aivdm|gprmc]", this.opts.proto);
          this.error=true;
    };
    // check proto values
    switch (this.opts.class) {
        case 'A':  this.opts.classA=true; break;
        case 'B':  this.opts.classB=true; break;
        default:
          console.log ("--class=%s invalid value [should be A|B]", this.opts.class);
          this.error=true;
    };
    
    // user should provide a tcpport
    if (this.opts.port === 0 || this.opts.port <= -2) { // -1 is a reserved value for no network operation
        console.log ("--port=%s invalid value [should be a valid tcpport number]", this.opts.port);
        this.error=true;
    } else { // port=0 is a special value for not using socket
        if (this.opts.port === -1) {
            this.opts.cltmod=false;
            this.opts.srvmod=false;
        } else if (!this.opts.srvmod) this.opts.cltmod=true;
    }
    
    this.Debug (7, "Main Options: gpxfile=%s speed=%d tic=%d proto=%s hostname=%s port:%d shipname=%s srvmod=%s, cltmod=%s", this.opts.gpxfile
               , this.opts.speed, this.opts.tic, this.opts.proto, this.opts.host, this.opts.port, this.opts.shipname, this.opts.srvmod, this.opts.cltmod);

    
    // check --gpxfile is present and filename exite
    if (this.opts.gpxfile === null) {
        console.log ("Error: --gpxfile=xxxx [xxx must be a valid gpx file]");
        this.error=true;
    } else {
        this.opts.basename = path.basename (this.opts.gpxfile);
        try {!fs.statSync (this.opts.gpxfile).isFile();}
        catch (err) {
            console.log ("Error: --gpxfile=%s err=%s", this.opts.gpxfile, err);
            this.error=true;
        }
    };
            
    // openfile and read store it in a buffer string
    try {
        this.xmlData = fs.readFileSync (this.opts.gpxfile, "utf-8");
    } catch (err) {
        this.Debug (0, "Hoops gpxfile=%s err=%s", this.opts.gpxfile, err);
        this.error=true;
    }
    
    // if needed check dumpfile can be create
    if (this.opts.dumpfile !== null) {
        try {
            this.dumpfd= fs.openSync (this.opts.dumpfile, "w+");
        } catch (err) {
            console.log ("hoops file to open [%s] err=[%s]",this.opts.dumpfile, err);
            return;
        }
    }
    
    // if error within options, stop here
    if (this.error) {
        console.log ('## GpsdSimulator Exit [invalid options] ##');
        return;
    }
    this.uid = "GpsdSimulator//" + this.opts.proto + ':' + this.opts.port + "/" + this.opts.mmsi;

    // Process XLM/GPX route/track File (result in this.route)
    this.route = this.ProcessGPX();
    
    // Create an event handler for user apps
    this.event = new EventEmitter();
    
    // migh want to check your waypoint before moving any further
    this.Debug (2, "Gpx Route=[%s] Waypts=[%d]", this.route.name, this.route.count);
    for (var pts in this.route.waypts) {
        this.Debug (3, "GPX waypts %d -- name: %s  Lon: %s Lat:%s Date:%s", pts, this.route.waypts [pts].name, this.route.waypts [pts].lat, this.route.waypts [pts].lon, this.route.waypts [pts].date);
    };
    
    // in not in server mode let start a socket
    if (this.opts.srvmod) {
        this.clientCount= 0;       // index tcp clients socket
        this.clientSock = [];      // array tcp clients socket
        this.TcpServer (); // start a server waiting on --port/localhost
    }; 
    
    if (this.opts.cltmod) {
        this.TcpClient();  // when connected will enter ClientListener() event handler
    };
  
    // NMEA segement are process each time job queue is empty
    this.queue           = async.queue  (JobQueuePost, 1); 
    this.queue.uid       = "JobQueue" + this.opts.svcport;
    this.queue.simulator = this;
    this.segment         = 0;                    // next segment to process counter
    this.count           = 0;                    // stat on NMEA packets
    this.ticms           = this.opts.tic * 1000; // node.js timer are in ms
    this.queue.drain     = JobQueueEmpty;        // empty queue callback
    
    // Push a 1st dummy job to initialise queuing process
    this.Debug (0,"Simulation Start in 5s waiting for connection on port %s", this.opts.port);
    this.queue.push (null, JobQueueCallback, 5000);
};

// JobQueue is empty let's process next segment
GpsdSimulator.prototype.ProcessSegment = function () {
    // push a dummy job in queue to force activation
    var JobQueueActivate = function (queue, callback, timeout) {
        setTimeout(function () {queue.push (null, callback);}, timeout); // wait 5S before start
    };
    
    // each time job queue is empty we process a new segment
    if (this.segment < this.route.count-1) {
        
        // this is working segment
        var segstart = this.route.waypts  [this.segment];
        var segstop  = this.route.waypts  [this.segment+1];
        
        // compute segment distance
        var p1   = new sgeo.latlon(segstart.lat, segstart.lon);
        var p2   = new sgeo.latlon(segstop.lat, segstop.lon);
        var distance = p2.distanceTo(p1);

        // compute intemediary point speed/distance ration
        var speedms = this.opts.speed * 1.852/ 3600;  // speed from knts to meter/second
        var tmmsins = distance/speedms;               // time in second for this segment
        var inter   = Math.round (tmmsins / this.opts.tic);  // number of intemediary segments
        
        this.Debug (5, "segment %d -- from:%s to:%s distance=%dnm midsegment=%d", this.segment, segstart.name, segstop.name, distance/1.852, inter);
        if (this.opts.aismod) { // let's send static messages
            
            // class A send only one paquet when B send two !!!
            PushNmeaAis2Sock = function (simulator, sock, reqt, resp) {
                for (var i=0; i < resp.length; i++) {
                if (resp [i] !== undefined) {
                    if (sock != null) sock.write (resp[i].nmea); // --port=-1 [simulator hub]
                    if (simulator.dumpfd !== undefined) fs.writeSync (simulator.dumpfd, resp[i].nmea);
                    simulator.event.emit ("aivdm", reqt[i], resp[i].nmea);
                    }    
                };
            };
            
            var aisout1;
            var aisout2;
            var aisin1;
            var aisin2;
        
            if (this.opts.classA) {
                aisin1=  { // class A static info
                    msgtype    : 5,
                    mmsi       : this.opts.mmsi,
                    shipname   : this.opts.shipname,
                    cargo      : this.opts.cargo, 
                    callsign   : this.opts.callsign,
                    draught    : this.opts.wid*2,
                    imo        : this.opts.mmsi,
                    dimA       : 0,     
                    dimB       : this.opts.len,
                    dimC       : 0,     
                    dimD       : this.opts.wid
                    //not implemented draught, etaMo, etaDay, etaHr, etaMin, destination302
                };
                aisout1 = new AisEncode (aisin1);
                aisou2  = null; // only one message in classA
 
            } else { // classB
                // we send ais static info to every segment [hopefully should be acceptable for most clients]
                aisin1 =  { // class B static info type 24A
                    msgtype    : 24,
                    part       : 0,
                    mmsi       : this.opts.mmsi,
                    shipname   : this.opts.shipname
                };
                aisout1 = new AisEncode (aisin1);

                aisin2   = { // class B static info type 24B
                    msgtype    : 24,
                    part       : 1,
                    mmsi       : this.opts.mmsi,
                    cargo      : this.opts.cargo, 
                    callsign   : this.opts.callsign,
                    dimA       : 0,     
                    dimB       : this.opts.len,
                    dimC       : 0,     
                    dimD       : this.opts.wid
                };
                aisout2 = new AisEncode (aisin2);
            }
            
            // if running in no server/client mode check for dumpfile and events
            if (!this.opts.srvmod && !this.opts.cltmod) {
                PushNmeaAis2Sock (this, null, [aisin1, aisin2], [aisout1, aisout2]);
            }
             
            // send paquet onto socket
            if (this.opts.srvmod) {  // server mode broadcast paquet to every active clients
                for (var sock in this.clientSock) {
                    PushNmeaAis2Sock (this, this.clientSock [sock], [aisin1, aisin2], [aisout1, aisout2]);
                }
            } 
            if (this.opts.cltmod) {// we send NMEA paquet to our destination server
                 PushNmeaAis2Sock (this, this.socket,[aisin1, aisin2], [aisout1, aisout2]);
            }
        }
        
        // calculate intermediary waypoint and push them onto NMEA job queue
        var interpolated = p1.interpolate(p2, inter);
        inter1= interpolated[0];
        this.Debug (6, "Computing [%s] segment [%d/%d] ", this.route.name, this.segment, this.route.count);
        if (this.dumpfd !== undefined) {
            fs.writeSync (this.dumpfd, "\n$ROUTE:[" +this.route.name +"] SEGMENT:[" + this.segment + "/" + this.route.count +"]\n");
        }
        for (var inter=1; inter < interpolated.length; inter ++) {
            this.count ++;
            inter2 = interpolated[inter];
            // push waypoint to the queue
            var job = new QJob (this, inter1.lng, inter1.lat, this.opts.speed, inter1.bearingTo(inter2).toFixed(2), this.count);
            this.Debug (6, "Queue Intermediary WayPts N°%d %s bearing: %s", this.count, inter1, job.bearing);
            this.queue.push (job, this.JobCallback);
            inter1 = interpolated[inter];
            inter ++;
        };
    this.segment ++; // next time process next segment
    } else {
        this.Debug (6, "All [%d] segment from [%s] processed  [loop in %ss]", this.segment, this.opts.basename, this.opts.loopwait/1000);
        // if loop selected wait timeout and restart operation
        if (this.opts.loopwait > 0) {
            this.Debug (6, "Restarting route [%s]", this.opts.basename);
            this.segment = 0;
            JobQueueActivate (this.queue, this.callback, this.opts.loopwait);
        }
    }
};


// Notice method is caller within queue context
GpsdSimulator.prototype.ProcessWaypts  = function (job) {
    
    // move from decimal notation to NMEA formating
    var Dec2Min = function(cardinal){
        // NMEA 4737.1024,N for 47°37'.1024 
        if (cardinal<0) cardinal=cardinal*-1;
        var deg    = parseInt (cardinal); 
        var mindec = (cardinal-deg)*60;
        var min    = parseInt (mindec);
        var secdec = mindec-min;
        var card=deg*100+min+secdec;

        return (card);
    };
    
    // Build an NMEA compliant date 100106=10-jan-2006 053740=5h37m40s
    var NmeaDate = function () {
        var date= new Date();
        var stringDate= date.toISOString().replace(/T/, ' ').replace(/\..+/, '').replace(/\-/g, '').replace(/\:/g, '');
        var time=stringDate.split (" ");
        var nmeatime=[time[0].substring (2,8), time[1]];
        return (nmeatime);
    };
    
    var NmeaPaquet = function (simulator) {
        // build NMEA 
        //    $GPRMC,083559.00,A,4717.11437,N,00833.91522,E,0.004,77.52,091202,,,A*57\n
        //    $GPRMC,112311.00,A,4732.33   ,N,  253.49   ,W,12   ,43.44,140923,,,A*00
        //
        // provide some life to our boat
                
        if (job.lat < 0) lato="S";
            else lato='N';
        if (job.lon < 0) lono="W";
            else lono="E";
        nowdate=NmeaDate();
        paquet=util.format ("$GPRMC,%s.00,A,%s,%s,%s,%s,%s,%s,%s,,,A", nowdate[1],Dec2Min(job.lat),lato, Dec2Min(job.lon), lono, job.speed, job.bearing, nowdate[0]);
    
        // paquet='$GPRMC,083559.00,A,4717.11437,N,00833.91522,E,0.004,77.52,091202,,,A'
        var checksum = 0; // http://rietman.wordpress.com/2008/09/25/how-to-calculate-the-nmea-checksum/
        for(var i = 1; i < paquet.length; i++) {
            checksum = checksum ^ paquet.charCodeAt(i);
        }
        var trailer=util.format ("*%s\r\n", checksum.toString(16)).toUpperCase();
        var nmeapkt= paquet + trailer;
        simulator.Debug (4, "Waypts:%s ==> [%s]", job.count, nmeapkt);
        return (nmeapkt);
    };
    
    // if nmea let's buit the paquet here
    if (this.opts.gprmcmod)  {
        this.nmeamsg = NmeaPaquet (this);
        this.event.emit ("gprmc", job, this.nmeamsg);
    }
      
    // if ais let's send request to AisEncoder module
    if (this.opts.aismod)  {
        var aisrqt=[];
        
         if (this.opts.classA) {
            aisrqt= { // standard class A Position report
                msgtype    : 3,
                cog        : job.bearing,
                hdg        : job.bearing,
                sog        : job.speed,
                navstatus  : 0, // underway using engine
                dsc        : false,
                repeat     : false,
                accuracy   : true,
                lat        : job.lat, 	
                lon        : job.lon,
                second     : 60,
                mmsi       : this.opts.mmsi
            };
         } else {
            aisrqt= { // standard class B Position report
                msgtype    : 18,
                cog        : job.bearing,
                hdg        : job.bearing,
                sog        : job.speed,
                dsc        : false,
                repeat     : false,
                accuracy   : true,
                lat        : job.lat, 	
                lon        : job.lon,
                second     : 60,
                mmsi       : this.opts.mmsi
            };
        }
                                  
        // encode AIS nmeamsg and get NMEA paquet ready to go
        var ais = new AisEncode (aisrqt);
        if (!ais.valid) {
            console.log ("Fail to Encode AisMessage:%s", aisrqt);
            nmeamsg= 'AisEncoding Invalid input:' + JSON.stringify(aisrqt) + '\n';
        } else {
            this.nmeamsg =ais.nmea;
            this.event.emit ("aivdm", aisrqt, ais.nmea);
        }
    }
    
    if (this.dumpfd !== undefined) {
        fs.writeSync (this.dumpfd, this.nmeamsg);
    }    
    
    try {
        // send paquet onto socket
        if (this.opts.srvmod) {  // server mode broadcast paquet to every active clients
            for (var sock in this.clientSock) {           
                this.clientSock [sock].write (this.nmeamsg);
            }
        } 
        
        if (this.opts.cltmod) { // we send NMEA paquet to our destination server
            this.socket.write (this.nmeamsg); 
        }
    } catch (err) {
        console.log ("Hooos fail to send on socket err:%s", err);
    }
};

// ------- Public Methods --------------
GpsdSimulator.prototype.Debug = function(level, format) {  //+ arguments
    if (this.opts.debug >= level) {

        var args = [].slice.call(arguments, 1); // copy argument in a real array leaving out level
        this.message=util.format.apply (null, args);
        console.log ("-%d- %j", level, this.message);
    };
};

// Callback notify Async API that curent JobQueue processing is done
GpsdSimulator.prototype.JobCallback = function (job, callback) {
    // Nothing to do
};

// Process GPX file parse and send NMEA paquet
GpsdSimulator.prototype.ProcessGPX= function () {
    var route = {
        name  : "", // this.route name from gpx file
        count : 0,  // number of waypts/trackpts
        waypts:[]   // list of waypoint lat/lon
    };
    
    var opts= this.opts; // provide acces to opts during parsing.
    // process data return by XML2JSON
    var ParseGPX= function(err, result) {
        var data=[];
    
        // default route name if not present in XML
        var now=new Date();
        data.name= 'ParseGPX' + now.toISOString(); 
    
        // search for gpx tag
        if (result['gpx'] === undefined) {
            console.log ("Fatal: Not a GPX route/track file [no <gpx></gpx> tag]");
            return (-1);
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
           return (-1);
        }
    
        // provide a default name if nothing found in gpxfile
        if (data.name === undefined) {
            now= new Date();
            route.name = 'GpsdSimulator://' + opts.gpxfile + "/" + now.toISOString();
        } else {
            route.name = 'GpsdSimulator://' + data.name;
        }
    
        switch (data.mode) {
        case "track":
            for (trackpts in data.segment)  {
                // console.log ("trackpts[%s]=%s", trackpts, JSON.stringify(data.segment[trackpts]));
                if (data.segment[trackpts]['name'] === undefined) nam= 'TrackPts-' + trackpts; 
                    else nam=data.segment[trackpts]['name'];
                
                lat=parseFloat (data.segment[trackpts]["$"].lat);
                lon=parseFloat (data.segment[trackpts]["$"].lon);
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
                lat=parseFloat (data.segment[routepts]["$"].lat);
                lon=parseFloat (data.segment[routepts]["$"].lon);
                // console.log ("name=%s  lat=%s lon=%s", nam, lat, lon);
                route.waypts.push ({name: nam, lat: lat, lon: lon});
                route.count++;
            }
            break;
        };
    };

    // Create GPX parser and send file for parsing
    this.parser = new xml2js.Parser();
    this.parser.parseString(this.xmlData, ParseGPX);
    // this.route=this.parser.route;  // store result in simulator for jobqueue to process them    
    this.Debug (8,"XML parsed route=%s", route.name);
    return (route);
};

// implement a gps server compatible with OpenCPN/GPSd
GpsdSimulator.prototype.TcpServer = function () {

    
    // [Must be known] TcpConnect handler extend net.createServer object
    // This method is executed at each time a client hit TcpServer listening port
    var ServerConnect = function (socket) {
        simulator= this.simulator;     // make our coding life easier
    
        socket.uid = "Socket://" + socket.remoteAddress +":" + socket.remotePort;
        simulator.Debug(3, "New Tcp-Client Id-%d Server=[%s] Client: [%s]"
             ,simulator.clientCount,this.uid,socket.uid);
    
        // keep track of active clients inside TCP server
        socket.countid      = "id-" + simulator.clientCount;
        simulator.clientSock[socket] = socket;
        simulator.clientCount ++;      // increment for next incomming client

        // Normaly gpsd client does not talk to server
        socket.on("data", function(buffer) {
            simulator.Debug(1, "%s Data=[%s]", socket.uid, buffer);
        });

        // On error close socket
        socket.on('error', function (err) {
            simulator.Debug(1, "%s ERROR=[%s]", socket.uid, err);
            socket.end();
        });
        
        // Remove the device from daemon active device list and notify adapter for eventual cleanup
        socket.on('end', function () {
            simulator.Debug(3, "Tcp-Client Quit %s/%d uid=%s", socket.countid, simulator.clientCount, socket.uid);
            delete simulator.clientSock[socket];
        });
    };

    // this method is call after TCP server start listening
    var ServerListen= function () {
        this.simulator.Debug (2,"TcpServer listening port:%d", this.simulator.opts.port);
    };
   
    // Launch Server and use it handler to store informations needed within tcpConnect handler
    this.tcpServer           = net.createServer(ServerConnect);
    this.tcpServer.uid      = "TcpServer://localhost:" + this.opts.port;
    this.tcpServer.simulator = this;

    // Activate server to listern on its TCP port
    this.tcpServer.listen(this.opts.port, ServerListen);
};

// act as a tcp client like any gps tracking device
GpsdSimulator.prototype.TcpClient = function () {
  var simulator = this; // hack to access simulator object from network handler 
  // Client suceded connected to remote server
 
 
  // This handler is called when TcpClient connect onto server
  var TcpStreamConnect = function () {
      
    simulator.Debug (3, 'GpsdSimulator connected to %s:%s', simulator.opts.host, simulator.opts.port);
    this.write("$GPRID," + simulator.opts.mmsi + "," + simulator.route.name + "*05\r\n");
  };
   
  // Client receive data from server
  var TcpStreamData = function  (data) {
    // Normaly server take feed and does not talk
    simulator.Debug (1, "Server Talks =[%s]", data);
  };

    // Remote server close connection let's retry it
  var TcpStreamEnd = function  () {
               
        this.simulator.Debug (3,"TcpStream [%s:%s] connection ended", simulator.opts.host, simulator.opts.port);
        
        setTimeout (function(){ // wait for timeout and recreate a new Object from scratch
            simulator.TcpClient ();
        }, RECONNECT_TIMEOUT);
  };
  // Remote server close connection
   TcpStreamError = function  (err) {
        this.simulator.Debug (3,"TcpStream [%s:%s] connection err=%s", this.simulator.opts.host, this.simulator.opts.port, err);
        setTimeout (function(){ // wait for timeout and recreate a new Object from scratch
            simulator.TcpClient ();
        }, RECONNECT_TIMEOUT);
  };
  
    
  // connect onto server, call listerner on success
  this.socket = net.connect(this.opts.port, this.opts.hostname, TcpStreamConnect);
  this.socket.simulator = this;

  // register event handler
  this.socket.on('data'  , TcpStreamData);
  this.socket.on('end'   , TcpStreamEnd);
  this.socket.on('error' , TcpStreamError);
  
};

// if use as a main and not as a module try start test
if (process.argv[1] === __filename)  {

// simulator = new GpsdSimulator ('GpsdSimulatorTest', '--file=../samples/gpx-files/gpsdtrack-sample.gpx', '--srvmod=false', '--port=6001', '--tic=10', '--speed=80',  '--debug=4');
simulator = new GpsdSimulator ('GpsdSimulatorTest', '--file=../samples/gpx-files/opencpn-sample.gpx', '--srvmod=true','--mmsi=1234','--proto=ais','--port=4001', '--tic=10', '--debug=4');
}

module.exports = GpsdSimulator; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/
