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
 * 
 * This dummy demo collects data but does not store anything on disk !!!!
 * It is only intended to demonstrate controle console capabilite. Most
 * user should probably start with GpsdFlatFile or GpsdMySql. 
 * 
 * This demo is avaliable on Internet for testing purpose
 *  console    tcp://sinagot.net 4000
 *  gps103     tcp://sinagot.net 4010
 *  celltrack  tcp://sinagot.net 4020
 * 
 * To use online demo:
 * 
 *  Connect on console with "telnet sinagot.net 4000"
 *    The demo take the AIS simulator as input, you can check vessel
 *    with "dev list" and "dev info mmsi".
 *  
 *  Push you own data to demo server: 
 *    GPS103 devices [TK102,103,...] should configure device for host:sinagot.net/tcpport:4010
 *    Android CellTrack Free; iPhone iPhone://OpenGtsCient configure for host:sinagot.net tcpport:4020
 *    
 *  If your device if accepted by GpsdTracking adapters, you should see it
 *  with the console [command: dev list; dev info iemi]. If you do not see it, it means
 *  that you should customize an adapter to support your device.
 * 
 */
GpsDaemon = require("../lib/GpsdDaemon"); 

// Sample for MySql option (Warning: you have to create your base+tables first)
var DummyDemo = {
    backend    : "Dummy",         // backend file ==> Dummy-backend.js 
    name       : "GpsdDummyDemo", // friendly service name [default Gpsd-Track]
    inactivity : 900,             // remove device from active list after xxxs inactivity [default 600s]
    jsonport   : 4030,            // server port to replay in JSON human readable incomming data
    aisport    : 4040,            // Same thing but in AIS/AIVDM format
    sockpause  : 250,             // delay in ms in beetween each replay data [0=nowait]
    storesize  : 20,              // size of postition/device kept in ram for "db search" command
    debug      : 4,               // debug level 0=none 9=everything
    
    "services"    :  {  // WARNING: NO service network port SHALL conflict
        /*
            info     : 'a friendly name for your service'
            adapter  : 'xxxx for adapter file = ./adapter/xxxx-adapter.js'
            port     : 'tcp port for both service server & client mode'
            hostname : 'remote service provider hostname  [default localhost]'
            timeout  : 'reconnection timeout for consumer of remote service [default 120s]'
            imei     : 'as standard nmea feed does not provide imei this is where user can provide a fake one'
            maxspeed : 'any thing faster is view as an invalid input [default=55m/s == 200km/h]
            mindist  : 'dont store data if device move less than xxxm [default 200m]'
            maxtime  : 'force data store every xxxxs even if device did not move [default 3600s]'
            debug    : 'allow to give a specific debug level this adapter default is global [gpsd.debug]'
        
            Note: computation of small distance in beetween two points is fast but approximative.
                  Be carefull to check you do not miss data, especially if tic is small. In case
                  of doubt increase speed and reduce min dist. You can also set debug hight enough
                  to see event on ignoring data because of distance/speed computation.
        */
               
        // following services are servers and wait for service to connect
         Telnet   : {info: "Telnet Console"  , adapter: "TelnetConsole" , port:4000}
        ,Gps103   : {info: "Tk102 Gps103"    , adapter: "Gps103Tk102"   , port:4010} 
        ,Nmea183  : {info: "Simulator Nmea"  , adapter: "NmeaSimulator" , port:4012}
        ,TR55     : {info: "Traccar Android" , adapter: "TraccarDroid"  , port:4013}
        ,Celltrac : {info: "CellTrac Android", adapter: "GtcGprmcDroid" , port:5020}

        ,AisTcp   : {info: "Ais Hub Feed"    , adapter: "AisTcpFeed"    , hostname: "sinagot.net"  , port:4001, timeout:60, mindist:100}
        ,RemGps   : {info: "Gps Over Tcp"    , adapter: "NmeaTcpFeed"   , hostname: "sinagot.net"  , port:4002, timeout:60, mmsi:111111111, mindist:100}
    }
};

// sample one using mysql as storage backend
gpsdDemo  = new GpsDaemon(DummyDemo);
 
 
