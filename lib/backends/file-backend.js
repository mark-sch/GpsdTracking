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
 * This backend is very basic and only design as a sample for developers.
 * it creates a file per device and store information as GPX format
 * Warning: each time the server is restarted it erease existing files
*/


path   = require('path');
fs     = require('fs');
Debug  = require("../GpsdDebug");

/*
 * 
 * File backend contrustor, only extract data from option object
 * and provide acceptable default if needed.
 * 
 * In real life, backend contructor should create all needed environement
 * to access targeted datebase. See File backend for a more standard
 * backend.
 * 
 */
function BackendStorage (device, opts){
    
    // prepare ourself to make debug possible
    this.uuid="flatfile@" + opts.file.store +'/'+ opts.file.prefix + '*';
    this.debug=opts.debug;

    this.opts= { // default option is erease old files
            store  : opts.file.store   || "./gps-tracks",
            prefix : opts.file.prefix  || "track-",
            erase  : opts.file.erase   || true
    };
    
    // backend must have a connect function
    this.Connect (device);
};  

// import debug method 
BackendStorage.prototype.Debug = Debug;

/* 
 * Backend Connect will typically log application to the data base. 
 * 
 * File backend "connect" only check if prefix own valid directory, 
 * and if process has permition for creating files in that directory.
 * 
 * Note: In MySql context connect call is done asynchroosly on demand by database
 * driver. It is executed within database context and not withing backend context.
 * Nevertheless in order to keep this sample backend as simple as possible. All
 * calls are donc synchronously and within backend object. But user should
 * understand but it should not be the case with smarter backend controler.
 * 
 */

BackendStorage.prototype.Connect = function (device) {
    this.Debug (3,"Connect device:%s", device.uuid);
   
    
    try {  // check if directory exist and exit if not
        stat=fs.statSync (this.opts.store);
        if (stat.isDirectory() !== true)  throw "Not a directory";
    } catch (err) {
        this.Debug (0, "Hoops %s not valid directory err=[%s]", this.opts.store, err);
        console.log ("### GPSd Process abort ###");
        process.exit (err);
    }
   
    try { // create log file for authenticated devices
        filename= path.join (this.opts.store, this.opts.prefix + "authen.log");
        utcdate=new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        if (this.opts.erase)this.logfd= fs.openSync (filename, "w+");
                       else this.logfd= fs.openSync (filename, "a+");
        buffer = "GpsTracking File Backend start: "+ utcdate + "(UTC)\n\n";
        fs.writeSync (this.logfd, buffer);
    } catch (err) {
        this.Debug (0,"Hoops fail to create [%s] ERROR=[%s]", filename, err);
        console.log ("***** Application was aborted *****");
        process.exit (err);
    }      
};

// Typically would create an entry inside device database table
BackendStorage.prototype.CreateDev = function (devId, args) {
    this.Debug (3,"Create entry in DB for device:%s", device.uuid);
};

/*
 *  Most databases handle Query asynchronously, and user should understand
 *  that function will generally return before action is OK or fail.
 *  
 *  Independantly of used DB Query method should support following commands
 *    AUTH_IMEI:  checks in DB if the IMEI is knowned
 *    UPDATE_POS: update position for this device in DB
 *    LOGOUT:     exectes when client disconnect from server
 *  
 *  With File sample backend:
 *    AUTH_IMEI create a file named opts.prefix+imei.dat
 *    UPDATE_POS add a line in the device.
 *  
 */
BackendStorage.prototype.Query = function (device, command) {
    
    this.Debug (3,"Query File device:%s Command:%s", device.uuid, command);
    dbhandle = this.base; // hack to keep a valid dbhandle inside asynchronous handler
    
    // we have a fix set of request to make any backend transparent to the app
    switch (command) {
        
      case "AUTH_IMEI": 
            // we use one unique file per device, and store file handle inside DevClient contect.
            filename = path.join (this.opts.store, this.opts.prefix + device.imei + ".gpx");
            this.Debug (3,"Creating GPRX File for device=%s path=%s", device.uuid, filename);
           
            // append a new line in log FD each time a new device popup
            now= new Date();
            fs.writeSync (this.logfd,"-- Login  IMEI=" + device.imei + " date=" +now.toString() + "\n");
            
            try {  // check if gpx file already exist for this device
                fs.stats (filename).isFile();
            } catch (err) { // file exists erase or append
                device.newfile = true;
            }

            // open file in create or append mode depending in erase flag
            if (device.newfile || this.opts.erase) {
                device.gpxfd = fs.openSync (filename, "w+");
                device.newfile = true;
            } else {
                device.gpxfd = fs.openSync (filename, "a+");
                device.newfile = false;
            }

            now=new Date();
            // create a dedicated file per device to store GPS data
            try {
                if (device.newfile) {
                    fs.writeSync (device.gpxfd,"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n");
                    fs.writeSync (device.gpxfd,"<gpx version=\"1.1\">\n");
                    fs.writeSync (device.gpxfd,"<name>GpsTracking File-Backend IMEI=" + device.imei + " Date=" + now.toISOString() + "</name>\n");
                    fs.writeSync (device.gpxfd,"<author>Fulup Ar Foll (GpsdTracking)</author>\n\n");
                }                
            } catch (err) {          
                this.Debug (0, "Hoops fail to create GPRX file=[%s]", filename);
                device.loged= false;
                return (-1);
            }
            device.loged   = true;
            device.name    = filename;
            device.element = 0;
            device.count++;
            utcdate=new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
            
            // build a friendly name and start a new segment new track segment 
            segmentid = util.format ("GpsTrack-%s", device.count + "-- utc=" + utcdate);
            fs.writeSync (device.gpxfd, "<trk><name>" + segmentid + "</name><number>1</number>\n<trkseg>\n");           
            
            break;
                      
        case "UPDATE_POS" :
            // if device is not log ignore request
            if (device.loged !== true) return (-1);
            device.element ++;
            speedms = device.data.speed * 1852 / 3600; // move from knts to m/s
            
            buffer = "  <trkpt lat=\"" + device.data.lat         + "\" lon=\"" + device.data.lon +"\">\n"
                    +"     <speed>"    + speedms                 + "</speed>\n"
                    +"     <course>"   + device.data.crs         + "</course>\n"
                    +"     <ele>"      + device.data.alt         + "</ele>\n"
                    +"     <time>"     + new Date().toISOString()+ "</time>\n"
                    +"     <name>trackpts-" + device.element     + "</name>\n"
                    +"     <desc>lat.="+device.data.lat+",lon.="+device.data.lon +",Alt.="+device.data.alt+ "m. Speed=" +speedms+ "m/s. Course="+device.data.crs+"</desc>\n"
                    +"  </trkpt>\n";
            
            // write asynchronously into file on reception of new gps values
            fs.write (device.gpxfd, buffer, null, null, null, function (err, len, buffer) {
                if (err) {
                    // warning this is an event handle that is called outside of backend object context
                    device.Debug (0, "Hoops UPDATE_POS fail err=[%s]", err);
                }  else {          
                    // On sucess call device call back if any
                    if (callback !== null) callback (device, null);
                }   
            });
  
            break;
        
       case "LOGOUT" :
            // close file and write gps trailer
            fs.write (device.gpxfd,"</trkseg>\n</trk>\n");
            if (this.opts.erase)  fs.write (device.gpxfd,"</gpx>\n"); 
            
            // write logout time in authentication log file
            fs.writeSync (this.logfd,"-- Logout IMEI=" + device.imei + " date=" +now.toString() + "\n");
            
            // change device status to logout
            device.loged = false;
            break;
            
      default:
          device.Debug (0,"uuid=%s Query Unknown %s", device.uuid, command);
          return -1;
    };
    
};


// export the class
module.exports = BackendStorage; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/

