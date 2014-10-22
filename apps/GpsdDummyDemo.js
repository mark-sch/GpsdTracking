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
var DummyDemo = 
    {backend    : "Dummy"         // backend file ==> Dummy-backend.js 
    ,name       : "GpsdDummyDemo" // friendly service name [default Gpsd-Track]
    ,rootdir    : "http://breizhme.org/gpsdtracking/" // dummy backend return device url image after fake authentication
    ,inactivity : 900             // remove device from active list after xxxs inactivity [default 600s]
    ,sockpause  : 250             // delay in ms in beetween each replay data [0=nowait]
    ,storesize  : 50              // size of postition/device kept in ram for "db search" command
    ,debug      : 1               // debug level 0=none 9=everything
    
    ,"services"    :    // WARNING: NO service network port SHALL conflict
        /*
            info     : 'a friendly name for your service'
            adapter  : 'xxxx for adapter file = ./adapter/xxxx-adapter.js'
            port     : 'tcp port for both service server'
            hostname : 'remote service provider hostname  [default localhost]'
            remport : 'remote tcp feed port'
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
        // this controle console, you probably want it hyden behind your firewall
        {Telnet   : {info: "Telnet Console"  , adapter: "TelnetConsole" , port:4000}
        ,Httpd    : {info: "Minimalist HTTPd", adapter: "HttpAjax"      , port:4080, debug:5}
        ,WebSock  : {info: "Websock service" , adapter: "WebSockTraffic", port:4081, debug:5} 
         
        // following apaters are TCP servers and wait for clients to connect
        ,Gps103   : {info: "Tk102 Gps103"    , adapter: "Gps103Tk102"   , port:4010} 
        ,Nmea183  : {info: "Simulator Nmea"  , adapter: "NmeaSimulator" , port:4011}
        ,TR55     : {info: "Traccar Android" , adapter: "TraccarDroid"  , port:4012} 
        
        // phone applications typically some form of OpenGPRMC
        ,Celltrac : {info: "CellTrac Android", adapter: "GtcGprmcDroid" , port:4020, debug:5} // OpenGPRMC

        // new adapters are clients [probably for test load generation only]
        ,AisTcp   : {info: "Ais Hub Feed"    , adapter: "AisTcpFeed"    , hostname: "sinagot.net"  , remport:4001, timeout:60, mindist:500}
        ,RemGps   : {info: "Gps Over Tcp"    , adapter: "NmeaTcpFeed"   , hostname: "sinagot.net"  , remport:4001, timeout:60, mmsi:123456789, mindist:500}
    }
};

// sample one using mysql as storage backend
gpsdDemo  = new GpsDaemon(DummyDemo);
 
 
