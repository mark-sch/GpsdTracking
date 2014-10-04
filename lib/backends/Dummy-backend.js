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
 * This backend ignore any data it received. It is only design to support
 * the online demo for device adapter test. It does not store anything on disk
 * and have no value for real applications.
 */


Debug  = require("../GpsdDebug");


function BackendStorage (device, opts){
    
    // prepare ourself to make debug possible
    this.uid="Dummy@nothing";
    this.debug=opts.debug;
    this.count=0;
    // backend must have a connect function
    this.Connect (device);
};  

// import debug method 
BackendStorage.prototype.Debug = Debug;


BackendStorage.prototype.Connect = function (device) {
    this.Debug (3,"Connect device:%s", device.uid);
};

// Typically would create an entry inside device database table
BackendStorage.prototype.CreateDev = function (devId, args) {
    this.Debug (3,"Create entry in DB for device:%s", device.uid);
};
// Typically would create an entry inside device database table
BackendStorage.prototype.RemoveDev = function (devId, args) {
    this.Debug (3,"Create entry in DB for device:%s", device.uid);
};


BackendStorage.prototype.UpdateDev = function (device, command, data) {
    this.Debug (3,"Query File device:%s Command:%s", device.uid, command);
    
    // we have a fix set of request to make any backend transparent to the app
    switch (command) {
        
      case "AUTH_IMEI": 
            
            this.Debug (3,"Autentication accepted for device=%s", device.uid);
            device.loged   = true;
            if (device.name === undefined || device.name === false || device.name === null) device.name = "Test-Dev-" + this.count;
            this.count++;
            break;
                      
        case "UPDATE_POS" :
            break;
        
       case "LOGOUT" :
            // change device status to logout
            device.loged = false;
            break;
            
      default:
          device.Debug (0,"uid=%s Query Unknown %s", device.uid, command);
          return -1;
    };
    
};


// export the class
module.exports = BackendStorage; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/

