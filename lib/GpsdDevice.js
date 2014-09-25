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
Debug   = require("./GpsdDebug");

GpsdClient= function (server, socket) {
 	
        this.debug = server.debug; // inherit controler debug level
        this.uuid  = "GpsdClient://" + socket.remoteAddress +":" + socket.remotePort;
        
	this.socket        = socket;
	this.controler     = server.controler;
	this.imei          = false;    // we get UUID directly from device
 	this.name          = false;
	this.loged         = false;
        this.alarm         = 0;        // count alarm messages
        this.sensor        = 0;
        this.count         = 0;        // generic counter used by file backend
        timestamp          = new Date(); 
        this.latstamp      = 0;
        this.lonstamp      = 0;
        
        // notify adapter that it has a new client device connected
        server.controler.adapter.SendCommand (socket, "WELLCOME");
        
};

// Import debug method 
GpsdClient.prototype.Debug = Debug;

// Tracker client close socket connection with no data
GpsdClient.prototype.Logout = function (socket) {
    this.controler.gpsd.backend.Query (this, null, "LOGOUT");
};

// compute distance in between two points
GpsdClient.prototype.Distance = function (lat1, lon1, lat2, lon2) {
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

// Parse data receive from GPS from TcpConnect/socket/on 
GpsdClient.prototype.ProcessData = function(socket, buffer) {

    // make code simpler to read [retreive current adapter object]
    var adapter = this.controler.adapter;
    var gpsd  = this.controler.gpsd;
  
    // call tracker specific routine to process messages [on sucess result in this.data]
    status = adapter.ParseData(this, socket, buffer);
    
    // for telnet/json adapters we use a special return code that bypass all decoding operation
    if (status === 255) return (0);

    // Make sure we got something out of this data
    if(status === -1){ 
      	this.Debug(3, "Hoops [%s] Invalid format Ignored=[%s]", this.uuid, buffer);
        res=gpsd.event.emit ("notice", "INVALID_DATA", buffer, adapter.uuid, socket.uuid);
	return (-1);
    }

    gpsd.event.emit ("accept", this, this.data);
   
    switch (this.data.cmd) {
        // This device is not register inside GpsdClient Object
        case "LOGIN": {
            gpsd.event.emit ("notice", "LOGIN_REQUEST", this.data.imei, adapter.uuid, socket.uuid);
            // if we not logged do it now
            if (this.loged === false) {
                this.imei = this.data.imei;
                //Update/Create device socket store by UUID at gpsd level
                gpsd.activeClients [this.imei] = socket;
                // at this point we need ask backend to check and log device
                gpsd.backend.Query (this, "AUTH_IMEI");
            }

            // note if authentication fail it would make sence to send a STOP_TRACKING to device
            break;
        };
        // Device keep alive service
        case "PING":            
            break;
        
        // Helpme make sure that user was contacted before clearing alarm
        case "SOS_ALARM": 
            this.alarm ++;
            if (this.alarm > 10) {
                this.alarm = 0;
                adapter.SendCommand (socket, "STOP_ALARM");
            }
            gpsd.backend.Query (this, "UPDATE_POS", this.imei);
            break;
            
        // Sensor make sure that user was contacted before clearing alarm
        case "SENSOR": 
            this.sensor ++;
            if (this.sensor > 10) {
                this.sensor = 0;
                adapter.SendCommand (socket, "STOP_ALARM");
            }         
            gpsd.backend.Query (this, "UPDATE_POS", this.imei);
            break;
        
        // Standard tracking information
        case "TRACKER" : 
            // compute distance only update backend is distance is greater than xxxm
            moved =  parseInt (this.Distance (this.latstamp, this.lonstamp, this.data.lat, this.data.lon));
            // if device moved less than mindist check maxtime value
            if (moved < gpsd.options.mindist) {
                update = false;
                timeout = new Date();
                timeout.setSeconds(timeout.getSeconds() - gpsd.options.maxtime);
                if (timeout < this.timespam) update=true; // force db update
            } else update=true;

            // update database and store current device location in object for mindist computation
            if (update) { // update device stat in sever ram and database
                this.count ++; 
                timestamp  = new Date(); 
                this.latstamp = this.data.lat;
                this.lonstamp = this.data.lon;
                gpsd.backend.Query (this, "UPDATE_POS", this.imei);
            } else {
                this.Debug (6, "DevId=%s [%s] Update Ignored Moved only %dm", this.imei, this.name, moved);
            }
            break;
    
        // Unknow command
        default:
            this.Debug(2, "Notice: [%s] Unknow command=[%s] Ignored", this.uuid, this.data.cmd);
            return (-1);
            break;
    } // end switch
    
    this.Debug (5, "Imei:[%s] Name:[%s] Cmd:[%s] Lat:%d Lon:%d Date:%s Alarm=%d Loged=%s", this.imei, this.name, this.data.cmd, this.data.lat, this.data.lon, this.date, this.alarm, this.loged );
    return (0);
};

GpsdClient.prototype.RequestAction = function(command,args){
    
    // make code simpler to read [retreive current adapter object]
    var adapter = this.controler.adapter;
    var gpsd  = this.controler.gpsd;
 
    switch (command) {
        case "LOGOUT": // warning at this point socket is not valid !!!
            gpsd.backend.Query (this, "LOGOUT");
            break;
        default: 
            break;
    }
    // send command to adapter & backend
    status = adapter.SendCommand (this.socket, command,args);
    
    if (status !== 0) {
        gpsd.event.emit ("notice", "UNKNOW_CMD", command, adapter.uuid, socket.uuid);
    }
    return(status);
};


module.exports = GpsdClient;