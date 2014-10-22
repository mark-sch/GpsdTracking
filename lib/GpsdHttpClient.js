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
 * 
 * This modele is used for HTTP like divices that do not rely on TCP session
 * typical for phone application as CellTrackGTS and others.
 */
var Debug   = require("./GpsdDebug");


// small object to keep track of last position in ram
function PositionObj (data) {
    this.lat  = data.lat;
    this.lon  = data.lon;
    this.alt  = data.alt;
    this.cog  = data.cog;
    
    this.sog  = data.sog;
    this.date = data.date;
};

// called from http class of adapter
GpsdHttpClient= function (adapter, devid) {
 	
        this.debug =  adapter.debug; // inherit controler debug level
        this.uid  = "httpclient//" + adapter.info + ":" + devid;
        
	this.adapter       = adapter;
        this.socket        = null;     // we cannot rely on socket to talk to device
	this.imei          = false;    // we get uid directly from device
 	this.name          = false;
	this.loged         = false;
        this.alarm         = 0;        // count alarm messages
        this.sensor        = 0;
        this.count         = 0;        // generic counter used by file backend
};

// Import debug method 
GpsdHttpClient.prototype.Debug = Debug;


// This method is fast but very approximative for close points
// User may expect 50% of error for distance of few 100m
// nevertheless this is more than enough to optimize storage.
GpsdHttpClient.prototype.Distance = function (old, now) {
    var R = 6371; // Radius of the earth in km
    var dLat = (now.lat - old.lat) * Math.PI / 180;  // deg2rad below
    var dLon = (now.lon - old.lon) * Math.PI / 180;
    var a = 
      0.5 - Math.cos(dLat)/2 + 
      Math.cos(old.lat * Math.PI / 180) * Math.cos(now.lat * Math.PI / 180) * 
      (1 - Math.cos(dLon))/2;
    var d= R * 2 * Math.asin(Math.sqrt(a));
    d= Math.round (d*1000);
    this.Debug (7, "Distance imei:%s [%s] moved %dm", this.imei, this.name, d);
    return (d); // return distance in meters
};

// Action depending on data parsed by the adapter 
GpsdHttpClient.prototype.ProcessData = function(data) {

    // make code simpler to read 
    var adapter   = this.adapter;
    var controler = adapter.controler;
    var gpsd      = adapter.controler.gpsd;
  
     // update lastshow to cleanup crom
    this.lastshow= new Date().getTime();
    
    switch (data.cmd) {
        // This device is not register inside GpsdHttpClient Object
        case "LOGIN": {
            gpsd.event.emit ("notice", "LOGIN_REQUEST", data.imei, adapter.uid, "");
            // if we not logged do it now
            if (this.loged === false) {
                this.imei = data.imei;
                //Update/Create device socket store by uid at gpsd level
                gpsd.activeClients [this.imei] = this;
                // at this point we need ask backend to check and log device
                gpsd.backend.UpdateDev (this, "AUTH_IMEI", null);
            }

            // note if authentication fail it would make sence to send a STOP_TRACKING to device
            break;
        };
        // Device keep alive service
        case "PING":            
            break;
        
        // Standard tracking information
        case "TRACKER" : 
            
            var update = true; // default is do the update

            // compute distance only update backend is distance is greater than xxxm
            if (this.stamp !== undefined) {
                var moved =  parseInt (this.Distance (this.stamp, data));
                //console.log ("**** pos= %s,%s Stamp=%s,%s Moved=%s", data.lat, data.lon, this.stamp.lon, this.stamp.lat, moved);
           
                // compute elapse time since last update
                var elapse  = parseInt ((data.date.getTime() - this.stamp.date.getTime()) / 1000); // in seconds
                var sogms = parseInt (moved/elapse);         // NEED TO BE KNOWN: with short tic sog is quicky overestimated by 100% !!!

                // usefull human readable info for control console
                data.moved   = moved;
                data.elapse  = elapse;
                
                // if moved less than mindist or faster than maxsog check maxtime value
                if (moved < controler.svcopts.mindist || sogms > controler.svcopts.maxsog) {
                    this.Debug(2,"Data %s/%s ignored moved %dm<%dm ?", this.count, data.count, moved, controler.svcopts.mindist);
                    // should we force a DB update because maxtime ?
                    if (elapse <  controler.svcopts.maxtime) update = false;
                }
             }

            // update database and store current device location in object for mindist computation
            if (update) { // update device last position in Ram/Database
                this.stamp = new PositionObj(data);
                gpsd.backend.UpdateDev (this,"UPDATE_POS");
            } else {
                this.Debug (6, "DevId=%s [%s] Update Ignored moved:%dm/%d sog:%dms/%d"
                           , this.imei, this.name, moved, controler.svcopts.mindist, sogms, controler.svcopts.maxsogms);
            }
            break;
    
        // Unknow command
        default:
            this.Debug(2, "Notice: [%s] Unknow command=[%s] Ignored", this.uid, data.cmd);
            return (-1);
            break;
    } // end switch

    gpsd.event.emit ("accept", this, data);
    this.Debug (5, "Imei:[%s] Name:[%s] Cmd:[%s] Lat:%d Lon:%d Date:%s Alarm=%d Loged=%s", this.imei, this.name, data.cmd, data.lat, data.lon, this.date, this.alarm, this.loged );
    return (0);
};

// ouside of logout http decice do not support action
GpsdHttpClient.prototype.RequestAction = function(command,args){
    
    // make code simpler to read 
    var adapter = this.adapter;
    var gpsd    = this.adapter.controler.gpsd;
    // send command to adapter & backend
    var status = adapter.SendCommand (this ,command,args);
    if (status !== 0) {
        gpsd.event.emit ("notice", "UNSUP_CMD", command, adapter.uid);
    }
    // extra action after command was processed by the adapter
    switch (command) {
        case "LOGOUT": // warning at this point socket may not be valid !!!
            gpsd.backend.UpdateDev (this, "LOGOUT");  // NMEA-backend must close GPX routes
            delete gpsd.activeClients [this.imei];
            break;
        default: 
            break;
    }
    
    return(status);
};


module.exports = GpsdHttpClient;