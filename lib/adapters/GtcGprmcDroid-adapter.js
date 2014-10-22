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
 * This adapter handle GtcFree messages For devices using HTTP/GPRMC protocol.
 * As Android://CellTrac/Geotelematic, iPhone://OpenGtsCient/TECHNOLOGYMAZE
 * iphone://GerGTSTracker; etc....
 * 
 * Reference: http://fr.wikipedia.org/wiki/NMEA_0183
 * https://sourceforge.net/p/opengts/discussion/579834/thread/f2be5bbf/
 * http://fossies.org/dox/OpenGTS_2.5.6/EventUtil_8java_source.html
 */

var Debug       = require("../GpsdDebug");
var HttpClient  = require('../GpsdHttpClient');
var NmeaDecode  = require('../GpsdNmeaDecode');

var util        = require("util");
var querystring = require("querystring");
var url         = require("url"); 

// Adapter is an object own by a given device controler that handle nmeadata connection
DevAdapter = function(controler) {
    this.uid       = "adapter:gtcfree//" +  + controler.svcopts.port;;
    this.info      = 'GtcFree';
    this.debug     =  controler.svcopts.debug;  // inherit debug from controler
    this.controler = controler;  // keep a link to device controler and TCP socket
    this.control   = 'http';
    this.Debug (1,"%s", this.uid);    
};
       

// send a commant to activate GPS tracker
DevAdapter.prototype.SendCommand = function(httpclient, action, arg1) {
        switch (action) {
        case "WELLCOME": break;
        case "LOGOUT":   break;  // active client is update at GpsdHttpClient level
        case "HELP":  // return supported commands by this adapter
                listcmd=["LOGOUT", "HELP"];  

                // push a notice HELP action event to gpsd
                httpclient.controler.gpsd.event.emit ("notice", "HELP", listcmd, this.uid, socket.uid);
                break;
        default: 
            this.Debug (1,"Hoops GtcFree has no command=[%s]", action);
            return (-1);     
        };
    // return OK status 
    this.Debug (5,"buffer=[%s]", this.packet);
    return (0);
};

/* response list dev sample
var test={"Account":"fulup-bzh","Account_desc":"Gpsd-fulup-bzh"
         ,"DeviceList":[
             {"Device":123456789,"Device_desc":"Fulup-HR37","group":"all"
             ,"EventData":[{"Device":"123456789","Timestamp":1413548798000,"StatusCode":0,"Speed":7.2,"GPSPoint_lat":47.30628596500001,"GPSPoint_lon":-2.854473555}]}
             ,{"Device":852963741,"Device_desc":"Erwan-Speedy","group":"all"
             ,"EventData":[{"Device":"852963741","Timestamp":1413548924876,"StatusCode":0,"Speed":27.400000000000002,"GPSPoint_lat":47.40000666666667,"GPSPoint_lon":-3.12891}]},{"Device":963741852,"Device_desc":"Nanar-Gazelle","group":"all","EventData":[{"Device":"963741852","Timestamp":1413548908156,"StatusCode":0,"Speed":17,"GPSPoint_lat":47.44219,"GPSPoint_lon":-2.888368333333333}]},{"Device":"352519050984577","Device_desc":"Test-Dev-1","group":"all","EventData":[{"Device":"352519050984577","Timestamp":1507983823000,"StatusCode":0,"Speed":0.2,"GPSPoint_lat":47.61851166666667,"GPSPoint_lon":-2.7612799999999997}
         ]}]} 
 */

// return a json object with device name and possition
DevAdapter.prototype.QueryDevList = function(query, response) {
    var gpsd    = this.controler.gpsd;
    var backend = gpsd.backend;

    var account = query['a'];
    var group   = query['g'];

    // start with response header
    var jsonresponse=
        {Account: account
        ,Account_desc: "Gpsd-" + account
        //,"TimeZone": "UTS"
        ,DeviceList: []
    };
     
    // loop on device list
    for (var devid in gpsd.activeClients) {
        var device= gpsd.activeClients [devid];
        
        // if device is valid and log then doit
        // if (device !== undefined && device.loged) {
        if (device !== undefined && device.stamp !== undefined) {
            jsonresponse.DeviceList.push (
                {Device     : device.imei
                ,Device_desc: device.name.replace(/ /g,'-')
                ,group      : group
                ,EventData: [
                    {Device: devid
                    ,Timestamp      : device.stamp.date.getTime()
                    ,StatusCode     : 0
                    ,Speed          : device.stamp.sog
                    ,GPSPoint_lat   : device.stamp.lat
                    ,GPSPoint_lon   : device.stamp.lon
                }]
            });
        }

    };
    //console.log ("****JSON=%s", JSON.stringify(jsonresponse))
    response.writeHeader(200, {"Content-Type": "text/plain"});  
    response.write(JSON.stringify(jsonresponse));
    response.end();  
};

/* respoonse dev track sample
var test={"Account":"fulup-bzh","Account_desc":"Gpsd-fulup-bzh"
         ,"DeviceList":[
             {"Device":123456789,"Device_desc":"Fulup-HR37"
             ,"EventData":
                 [{"Device":123456789,"Timestamp":1413548858,"StatusCode":3,"Speed":6.8,"GPSPoint_lat":47.30231124565022,"GPSPoint_lon":-2.849232474089085}
                 ,{"Device":123456789,"Timestamp":1413548907,"StatusCode":2,"Speed":5.3,"GPSPoint_lat":47.29901180590435,"GPSPoint_lon":-2.8442291685556724}
                 ,{"Device":123456789,"Timestamp":1413548956,"StatusCode":1,"Speed":5.2,"GPSPoint_lat":47.29610186222867,"GPSPoint_lon":-2.8386510988197435}
                 ,{"Device":123456789,"Timestamp":1413549037,"StatusCode":0,"Speed":7.1,"GPSPoint_lat":47.29757485673534,"GPSPoint_lon":-2.8316258978899578}
        ]}]}
*/

// return a json object with device name and possition
DevAdapter.prototype.QueryDevTrack = function(query, response) {
    var gpsd    = this.controler.gpsd;
    var backend = gpsd.backend;
    
    var account = query['a'];
    var list    = parseInt (query['l']);
    var devid   = query['d'];
    
    var device  = gpsd.activeClients [devid];
    if (device === undefined) {
            this.Debug (1,"Device %s Quit", devid);
            response.writeHeader(200, {"Content-Type": "text/plain"});  
            response.write("DEV_QUIT");
            response.end(); 
            return;
        } 
        
    // DB callback return a json object with device name and possition
    DBcallback = function(dbresult) {
        
        // start with response header
        var jsonresponse=
            {Account: account
            ,Account_desc: "Gpsd-" + account
            //"TimeZone": "UTS"
            ,DeviceList: [
                {Device     : device.imei
                ,Device_desc: device.name.replace(/ /g,'-')
                ,EventData: []    
        }]};
     
        // for Celltrack  loop is GeoJson reverse order
        var nnres = dbresult.length-1;
        if (nnres >= list-1) nnres=list-1;
        for (var i = nnres; i >= 0; i--) {    
            var pos = dbresult [i];
            jsonresponse.DeviceList[0].EventData.push (
                {Device         : device.imei
                ,Timestamp      : pos.date.getTime()/1000
                ,StatusCode     : i
                ,Speed          : pos.speed
                ,GPSPoint_lat   : pos.lat
                ,GPSPoint_lon   : pos.lon
            }); 
        };
    // call back take care of returning response to device in async mode
    response.writeHeader(200, {"Content-Type": "text/plain"});  
    response.write(JSON.stringify(jsonresponse));
    response.end(); 
    }; // end callback

   
    // loop on device last postion [warning: async mode]
    gpsd.backend.LookupDev (DBcallback, devid, list);
};

// This routine is called from GpsdControler each time a new http request popup
DevAdapter.prototype.ProcessData = function(request, response) {
    var result;
       
    // parse URL to extract DevId and NMNEA $GPRMC info
    var gpsd=this.controler.gpsd;
    var question=url.parse(request.url, true, true);
    var query=question.query;
    this.Debug (4,"Path=%s [len=%s] Query=%s", question.pathname, question.pathname.length, JSON.stringify(query));
    // Debug
    // Group:  http://localhost:4020/events/dev.json?a=fulup-bzh&u=demo-id&p=MyPasswd&g=all&l=1
    // Device: http://localhost:4020/events/dev.json?a=fulup-bzh&u=demo-id&p=MyPasswd&d=123456789&l=4
    
    // for json request celltrack does not provide query.id !!!!    
    // nasty but fast check for /events/dev.json pathname
    if (question.pathname.length === 16) { 
        // group/dev  {"?a":"fulup-bzh","u":"demo-id","p":"MyPasswd","g":"all","l":"1"}
        // devices query={"?a":"fulup-bzh","u":"demo-id","p":"MyPasswd","d":"1","l":"20"}
        // query={"?a":"fulup-bzh","u":"demo-id","p":"MyPasswd","d":"demo1","l":"20"}
                
        // this is a device query [at least this is how I hunderstant it !!!
        if (query.g !== undefined) result = JSON.stringify(this.QueryDevList (query, response));
        if (query.d !== undefined) result = JSON.stringify(this.QueryDevTrack(query, response));
        // Warning: previous call might be asynchronous and result to device appen after this return
    } else {
        // at this point we need a query ID
        if (query.id === undefined) {return ('GpsdTacking adapter: ' + this.info);}
    
        // is user is loged try it now
        if (gpsd.activeClients [query.id] === undefined) {
            var httpclient= new GpsdHttpClient(this,query.id);
            // force authent [due to DB delay we refuse first NMEA paquets]
            var logincmd = {
                imei : query.id,
                cmd  : "LOGIN"
            };
            httpclient.ProcessData (logincmd);
            gpsd.activeClients [query.id]= httpclient;
        } 
        
        // this is a position update and a synchronous call
        switch (query.cmd) { 
        case 'version':
            result = 'OK';
            break;
                  
        default:
            // we refuse packet from device until it is not log by DB backend
            if (gpsd.activeClients [query.id].loged !== true) return ("NOT_AUTH"); 
        
            // if parsing abort then force line as invalid
            var data = new NmeaDecode(query.gprmc);
            if (!data.valid) {
                this.Debug (5,'GPRMC invalid nmeadata=%s', query.gprmc);
                result = "ERR-GPRMC";
            } else {
                // Clean up date and move Cardinal from degre to decimal 
                gpsd.activeClients [query.id].ProcessData (data);
                this.Debug (7,"--> NMEA Emei:%s Cmd:%s Lat:%s Lon:%s Date:%s Speed:%d Course:%d Altitude:%d"
                       , data.imei, data.cmd, data.lat, data.lon, data.date, data.sog, data.cog, data.alt);
                result = "OK";
            }
        }
        response.writeHeader(200, {"Content-Type": "text/plain"});  
        response.write(result);
        response.end();      
    } // end if json request
};

// Import debug method 
DevAdapter.prototype.Debug = Debug;

// if started as a main and not as module, then process test.
if (process.argv[1] === __filename)  {
  console.log ("### Hoops GtcDroid-adapter no unit test");
};

module.exports = DevAdapter; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/

