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

mysql   = require('mysql'); // https://www.npmjs.org/package/mysql
Debug   = require("../GpsdDebug");

MYSQL_RECONNECT_TIMER=10*1000; // 10s timeout in bewteen two MYSQL reconnects

// Independant utilities to be used from asynchronous SQL "on" event
NormalizeDate =function(date) {
    traccarDate= date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
    
    return (traccarDate);
};

// ConnectDB is done on at creation time and asynchronously on PROTOCOL_CONNECTION_LOST
var CreateConnection =function (backend) {

    backend.Debug (4, "MySQL creating connection [%s]", backend.uid);
    backend.base = mysql.createConnection(backend.opts);
    backend.count ++;
      
    // register event for asynchronous server errors
    backend.base.on('error', function(err) {
        backend.Debug (1, "MySQL server error=[%s]", err);
        // Sever was restarted or network connection was lost let restart connection
        if(err.code === 'PROTOCOL_CONNECTION_LOST') {
             backend.Debug (4, "MySQL connection lost [%s/%d] automatic connect retry in 10s]", backend.uid, backend.count);
             setTimeout(function () {CreateConnection (backend);}, MYSQL_RECONNECT_TIMER);  
             
        } else { 
            throw err;  // server variable configures this)
        };
    });
    
    // force an initial connectiion at object construction time
    backend.base.connect (function(err) {
        if (err) {
             backend.Debug (4, "MySQL connection fail [%s/%d] automatic connect retry in 10s]", backend.uid, backend.count);
             setTimeout(function () {CreateConnection (backend);}, MYSQL_RECONNECT_TIMER);  
            
        } else {
            backend.Debug (5,"MySQL Connect Done [%s]",  backend.uid);
        }
    });
};

// Create MySQL Backend object
function BackendStorage (gpsd, opts){
    
    // prepare ourself to make debug possible
    this.uid ="mysql:" + opts.mysql.username + "@" + opts.mysql.hostname + "/" + opts.mysql.basename;
    this.debug=opts.debug;
    this.gpsd =gpsd;
    this.count=0;  // stat for connection retry
    
    this.opts= {
            host     : opts.mysql.hostname || "localhost",
            user     : opts.mysql.username,
            password : opts.mysql.password,
            database : opts.mysql.basename || opts.username
    };  
    
    // create initial connection handler to database
    CreateConnection (this);  
};

// Import debug method 
BackendStorage.prototype.Debug = Debug;

// Create table in case we start from scratch
// Warning: this create table but not database
BackendStorage.prototype.CheckTablesExits = function () {
    var gpsd=this.gpsd;
    var error='OK';
    
    var sqlQuery= {
         Devices: 'CREATE TABLE IF NOT EXISTS devices ('
         + 'id INT NOT NULL AUTO_INCREMENT,'
         + 'name CHAR(30) NOT NULL,' 
         + 'latestPosition_id INT,' 
         + 'uniqueID CHAR(20) NOT NULL,'
         + 'PRIMARY KEY (id ),'
         + 'UNIQUE INDEX imei (uniqueID)'
         + ') DEFAULT CHARSET=utf8;'
 
        ,Positions: 'CREATE TABLE IF NOT EXISTS positions ('
         + 'id        INT NOT NULL AUTO_INCREMENT,'
         + 'device_id INT,' 
         + 'address   VARCHAR(255),' 
         + 'altitude  DOUBLE,'
         + 'course    DOUBLE,'
         + 'latitude  DOUBLE,'
         + 'longitude DOUBLE,'
         + 'other     DOUBLE,'
         + 'power     DOUBLE,'
         + 'speed     DOUBLE,'
         + 'time      DATETIME,'
         + 'INDEX route (device_id, time),'
         + 'valid     INT,'
         + 'PRIMARY KEY (id )'
         + ') DEFAULT CHARSET=utf8;'
    };
    
    
    // loop on table creation queries
    for (table in sqlQuery) {
        this.base.query (sqlQuery[table] , function (err) {
            if (err) {
                error="FX";
                gpsd.event.emit ("notice", "MySQL ERROR","CreateTable",table ,err);
            }
        });
    };
 return (error);
};

// Typically would create an entry inside device database table
BackendStorage.prototype.CreateDev = function (devId, args) {
    this.Debug (3,"Create entry in DB for device:%s", devId);
    var gpsd=this.gpsd;
    
    // Traccar does handle uniqueID at MySQL level :(
    // INSERT INTO device ( id | name | uniqueId | latestPosition_id)
    queryString = "INSERT INTO devices set ?";
    var post  = {
            uniqueId : devId,
            name     : args.join(" "),
            latestPosition_id : 0
    };
    
    // added ALTER TABLE devices ADD UNIQUE INDEX imei (uniqueId);
    sqlQuery = this.base.query(queryString, post);
 
    // on sucess this command is call once per selected row [hopefully only one in this case]
    sqlQuery.on("result", function(result) {
        gpsd.event.emit ("notice", "ADD-DEVICE", "in MySQL", devId, args.join(" "));
    });
 
    sqlQuery.on("error", function(err) {
        gpsd.event.emit ("notice", "ERROR-DEVICE", "insert MySQL", devId, err);
    });
    return ('OK');
};

// Typically would create an entry inside device database table
BackendStorage.prototype.RemoveDev = function (devId) {
    this.Debug (3,"Create entry in DB for device:%s", devId);
    var gpsd=this.gpsd;
    
    // Traccar does handle uniqueID at MySQL level :(
    // INSERT INTO device ( id | name | uniqueId | latestPosition_id)
    queryString = "delete from devices where uniqueId =" + devId;
    sqlQuery = this.base.query(queryString);
 
    // on sucess this command is call once per selected row [hopefully only one in this case]
    sqlQuery.on("result", function(result) {
        gpsd.event.emit ("notice", "DROP-DEVICE", "in MySQL", devId, args.join(" "));
    });
 
    sqlQuery.on("error", function() {
        gpsd.event.emit ("notice", "ERROR DEVICE", "from to remove MySQL", devId, err);
    });
    return ('OK');
};

// Query are done asynchronously and function will return before result is knowned
BackendStorage.prototype.UpdateDev = function (device, command, data) {
    
    this.Debug (6,"Query MySQL device:%s imei=%s Command:%s", device.uid, device.imei, command);
    dbhandle = this.base; // hack to keep a valid dbhandle inside asynchronous handler
    
    // we have a fix set of request to make any backend transparent to the app
    switch (command) {
        
      case "AUTH_IMEI": 
            // selectQuery = 'SELECT * FROM devices where uniqueId = 359710043551135';
            queryString = "SELECT * From devices WHERE uniqueId = " + device.imei;
            sqlQuery = dbhandle.query(queryString);       
 
            // on sucess this command is call once per selected row [hopefully only one in this case]
            sqlQuery.on("result", function(result) {
                device.Debug (9, "sqlQuery %s", JSON.stringify(result));
                
                // update active device pool [note device.imei is set by GpsdClient before SQL login]
                device.name  = result.name; // friendly name extracted from database
                device.sqlid = result.id;   // this is MySQL unique ID and not device's IMEI
                device.loged = true;        // marked device as knowned from database
            });
 
            sqlQuery.on("error", function() {
                device.Debug (0,"#### Hoops sqlQuery.on(error)");
            });
            break;
            
        case "UPDATE_POS" :
            // if device is not log ignore request
            if (device.loged !== true) return (-1);
            
            // INSERT INTO positions (device_id, time, valid, latitude, longitude, altitude, speed, course, power)
            queryString = "INSERT INTO positions set ?";
            var post  = {
                device_id   : device.sqlid,      // unique device ID in database table (not imei)
                time        : NormalizeDate(data.date),  // traccar want date as a UTC string
                valid       : data.valid, // true if data is a gps time, wrong other wise
                latitude    : data.lat,
                longitude   : data.lon,
                speed       : data.speed,
                altitude    : data.alt,
                course      : data.crs,
                power       : data.bat    // percentage of remaining internal battery
            };
            // launch insertion of new position asynchronously
            insertQuery = dbhandle.query(queryString, post);        
                    
            // on insert success: update last position with position id asynchronously
            insertQuery.on("result", function(result) {
                
                // UPDATE devices SET latestPosition_id = :id WHERE id = :device_id;
                var updateString = "UPDATE devices set ? WHERE id= " + device.sqlid;
                post  = {latestPosition_id: result.insertId};                
                updateQuery = dbhandle.query(updateString, post);
                
                // Process latest position error
                insertQuery.on("error", function(err) {
                    this.Debug (0,"#### Hoops MySQL updateQuery.on(error) %s err=%s", updateString, err);
                });
                            // process insert position error
                insertQuery.on("error", function(err) {
                    this.Debug (0,"#### Hoops MySQL sqlQuery.on(error) %s err=%s", updateString, err);
                });
            });
 
            break;
        
      case "LOGOUT" : // should be used to keep track of device online/offline time
          break;
            
      default:
          device.Debug (0,"uid=%s Query Unknown %s", device.uid, command);
          return -1;
    };
    
};


// export the class
module.exports = BackendStorage; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/


