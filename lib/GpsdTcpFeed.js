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
 * This modele is used for TcpConnect like divices that do not rely on TCP session
 * As TCP stream may push more than one device, we create a new device each time
 * a new MMSI pops up
 */
Debug   = require("./GpsdDebug");

// called from TcpFeed class of adapter
GpsdTcpFeed= function (adapter, devid, sockclient) {
 	
        this.debug =  adapter.debug; // inherit controler debug level
        this.uid  = "tcpfeed://" + adapter.info + ":" + devid;
        
	this.adapter       = adapter;
        this.socket        = null;     // we cannot rely on socket to talk to device
        this.sockclient    = sockclient; 
	this.imei          = false;    // we get uid directly from device
 	this.name          = false;
	this.loged         = false;
        this.alarm         = 0;        // count alarm messages
        this.sensor        = 0;
        this.count         = 0;        // generic counter used by file backend
        timestamp          = new Date(); 
};

// Import debug method 
GpsdTcpFeed.prototype.Debug = Debug;

// compute distance in between two points
GpsdTcpFeed.prototype.Distance = function (lat1, lon1, lat2, lon2) {
    R = 6371; // Radius of the earth in km
    dLat = (lat2 - lat1) * Math.PI / 180;  // deg2rad below
    dLon = (lon2 - lon1) * Math.PI / 180;
    a = 
      0.5 - Math.cos(dLat)/2 + 
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      (1 - Math.cos(dLon))/2;
    d= R * 2 * Math.asin(Math.sqrt(a));
    d= Math.round (d*1000);
    this.Debug (7, "Distance imei:%s [%s] moved %dm", this.imei, this.name, d);
    return (d); // return distance in meters
};

// Action depending on data parsed by the adapter 
GpsdTcpFeed.prototype.ProcessData = function(data) {
   
    // make code simpler to read 
    var adapter   = this.adapter;
    var controler = adapter.controler;
    var gpsd      = adapter.controler.gpsd;
    
    this.timestamp  = new Date(); 
    switch (data.cmd) {
        // This device is not register inside GpsdTcpFeed Object
        case "LOGIN": {
            gpsd.event.emit ("notice", "LOGIN_REQUEST", data.imei, adapter.uid, "");
            // if we not logged do it now
            if (this.loged === false) {
                this.imei = data.imei;
                //Update/Create device socket store by uid at gpsd level
                gpsd.activeClients [this.imei] = this;
                // at this point we need ask backend to check and log device
                gpsd.backend.UpdateDev (this, "AUTH_IMEI",null);
            }

            // note if authentication fail it would make sence to send a STOP_TRACKING to device
            break;
        };
        // Device keep alive service
        case "PING":            
            break;
        
        // Standard tracking information
        case "TRACKER" : 
            // compute distance only update backend is distance is greater than xxxm
            moved =  parseInt (this.Distance (this.latstamp, this.lonstamp, data.lat, data.lon));
            
            // compute time since last update
            now     = new Date();
            elapse  = now - this.timestamp*1000; // elapse time since last dbupdate
            speedms = moved/(elapse);            // speed in ms/s
                      
            // if moved less than mindist or faster than maxspeed check maxtime value
            if (moved < controler.opts.mindist || speedms > controler.opts.maxspeedms) {
                now.setSeconds(now.getSeconds() - controler.opts.maxtime);
                if (now < this.timestamp) update=true; // force db update
                   else update = false;
            } else update=true;           

            // update database and store current device location in object for mindist computation
            if (update) { // update device stat in sever ram and database
                this.count ++; 
                this.latstamp   = data.lat;
                this.lonstamp   = data.lon;
                this.speedstamp = data.speed;
                gpsd.backend.UpdateDev (this, "UPDATE_POS", data);
            } else {
                this.Debug (6, "DevId=%s [%s] Update Ignored moved:%dm/%d speed:%dms/%d"
                           , this.imei, this.name, moved, controler.opts.mindist, speedms, controler.opts.maxspeedms);
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

// Only LOGOUT command make sence with a TcpFeed
GpsdTcpFeed.prototype.RequestAction = function(command,args){
     // make code simpler to read 
    var adapter = this.adapter;
    var gpsd    = this.adapter.controler.gpsd;
    // send command to adapter & backend
    var status = adapter.SendCommand (this,command,args);
    if (status !== 0) {
        gpsd.event.emit ("notice", "UNSUP_CMD", command, adapter.uid);
    }
    
    // extra action after commande was processed by the adapter
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


module.exports = GpsdTcpFeed;