GpsdTracking
==============

GpsdTracking is an open source server for various GPS tracking devices. 
Its provides data acquisition and storage on database for trackers and
phone-apps, as well as an AIS/NMEA simulator.

Main features are:
 - multiple storage backends: MySql, FlatFile, etc..
 - support tcp/socket tracker devices: gps103,traccar,nmea, ....
 - support http/gprmc android/iphone: CellTrac, OpenGTSClient, GerGTSTracker
 - support tcp/client mode request AIShub, MarineTraffic, Gpsd/Jason, ....
 - support full set of commands [reset alarm, upload SD, etc ...]
 - global vision of every active devices independently of adapter/protocols
 - support broadcast mode to send a global commands [ie: track all]
 - <telnet console> for remote supervision
 - commands queue with automatic retry when device not present
 - provide save storage space mode. No waypoints store when target move less than xxxx
 - provide a GpsSimulator to emulate NMEA/AIS devices from GPX route files
 - support AIS 6bit encoding decoding for static vessel and navigation report
 - simulator for multiple AIS target
 - flatfile backend generates standard GPX files from input tracking feeds
 Etc.

GpsdTracking is designed to make as simple as possible integration of new
tracking devices/backends. All specific parts or devices/backend are exported
to dedicated files. User only need to start from a sample, copy and customise.
 - to add a new backend start "flatfile-backend"
 - to add a new device use start from "nmea-adapter/gps103tk102"

Warning: Ubuntu/Debian user should exec following command to make "node"
visible as a standard command. If not they should use 'nodejs' in place of 'node'
      sudo cd ln -s /usr/bin/node /usr/bin/nodejs

Dependencies [use: npm install gpsd-tracking]
------------
       https://www.npmjs.org/package/sgeo
       https://github.com/Leonidas-from-XIV/node-xml2js
       https://www.npmjs.org/package/jison
       https://www.npmjs.org/package/mysql
       https://www.npmjs.org/package/traceback
       https://github.com/caolan/async

References
-----------
    Took lot of nice ideas from:
    - http://www.traccar.org
    - https://github.com/freshworkstudio/gps-tracking-nodejs
    - http://www.catb.org/gpsd/
    ...
                        
  # Install with npm
    npm install gpsdtracking
    cd  node_modules/gpsdtracking
    NODE=node | NODE=nodejs [ubuntu/debian 'nodejs' everywhere else "node" !!!]

  # Start a flatfile server
    $NODE apps/GpsdFlatFileSample.js

  # Simulate a gpstracker
    $NODE ./apps/DeviceSimulator.js --gpxfile=./samples/gpx-files/opencpn-sample.gpx --port=6001 --tic=2 --debug=4

  # Check control console
    telnet local 6000
    [enter] evt
  
------------------------
  FlatFile backend 
------------------------
   * edit FlatFileSample
      -- verify devices port and track-store directory [path & prefix]

   * look in track-store
      -- you should find a file name sample-123456789.gpx under construction.
 
---------------------
- With MySQL backend 
---------------------
   * edit MySqlSample 
      -- verify database name/user/password
      -- check network port for nmea and telnet adapters

   * create MySQL base with mysql command line [GpsdTrack can create tables, but base should exist]

   * start  Server  $NODE ./apps/GpsdMySqlSample.js 
      -- verify that it successfully connect onto mysql

   * connect telnet console  [telnet localhost 5000] by default for MySQL sample app.
      -- type help to get console command list
      -- register to listen to event [evt]
      -- create MySQL tables [db init] This create tables if they do not exist
      -- create a fake tracking device in MySQL [command: create 123456789 My Fake Device]
      [note: user HAVE TO create device in DB before server push received data to DB]
      
   * start DeviceSimulator
      -- $NODE ./apps/DeviceSimulator.js --gpxfile=./samples/gpx-files/opencpn-sample.gpx --imei=123456789 --port=5001 --tic=2 --speed=10 --debug=1

   * look for position in DB
      -- select * from devices;
      -- select * from positions;

------------------------------------------------
Typical scenario from telnet console using MySQL
------------------------------------------------
    telnet localhost 5000
    Connected to localhost.
    Escape character is '^]'.
    > type: help for support [evt to receive events]

    GpsdMySQL>  evt
     --> Hook On [Listening for gpsd [queue|acept|error] events

    GpsdMySQL>  db init  // check/create tables in mysql
     --> OK  [check for errors on daemon log]

    GpsdMySQL> dev all  // use GpsdSimulator if you don't have a tracer
     --> List active devices 
     --> - no active device [retry later]

    GpsdMySQL> dev list  // use GpsdSimulator if you don't have a tracer
     --> List loged devices 
     --> - no active device [try list all]

    GpsdMySQL>  dev  all   
     --> List active devices 
     --> - 1 - imei: 359710043551135 Name:"false" uid=GpsdClient://10.10.95.1:25508

    GpsdMySQL>  db create 359710043551135 My First Tracker in DB
     --> create:OK  

    GpsdMySQL>  dev logout 359710043551135      // force device reconnection
     --> queue:0 --> [job:0] command=LOGOUT imei=359710043551135 [sent]

    GpsdMySQL>  dev list
     --> List active devices 
     --> 1 - imei: 359710043551135 Name:"Fulup GPS103" uid=GpsdClient://10.10.95.1:25509

    GpsdMySQL> dev track 359710043551135
     --> queue:1#-1 Queue Status=ACCEPT DevId=359710043551135 Command=GET_POS JobReq=1 Retry=0
     --> [job:1] command=GET_POS imei=359710043551135 [sent]

    GpsdTracker> dev info 359710043551135
     -->  Imei: 359710043551135 Name:[Fulup GPS103] Loged:true Adapter:Tk102-Gps103
     --> Lat: 0 Lon: 0 Speed:undefined TimeStamp:Fri Oct 03 2014 22:34:14 GMT+0000 (UTC)

    GpsdMySQL> dev track all // broadcast tracking command to every active devices
    --> queue:0 --> [job:[object Object],2] command=Broadcast imei=undefined [sent]
    --> [job:1] command=GET_POS imei=359710043551134 [sent]
    --> [job:2] command=GET_POS imei=359710043551111 [sent]
    --> [job:3] command=GET_POS imei=123510043552222 [sent]
    --> [job:4] command=GET_POS imei=359710043553333 [sent]
    etc...

    GpsdMySQL> db show 359710043551135
    --> -0- Lat:47.6184 Lon:-2.7609 Speed:0 Alt:23713 Crs:0 Time:2014-10-05T02:37:00.000Z
    --> -1- Lat:47.6131 Lon:-2.7367 Speed:26.7 Alt:201154 Crs:0 Time:2014-10-04T20:11:00.000Z
    --> -2- Lat:47.6205 Lon:-2.7332 Speed:0 Alt:200854 Crs:0 Time:2014-10-04T20:08:00.000Z
    --> -3- Lat:47.6301 Lon:-2.7346 Speed:15 Alt:200555 Crs:0 Time:2014-10-04T20:05:00.000Z
    etc...


    GpsdMySQL> quit
    --> Connection closed by foreign host.

---------------------------------------------------------------------
    On line demo:  [does not save anything on disk]
---------------------------------------------------------------------

       tcp://sinagot.net:4000  Telnet control console

       tcp://sinagot.net:4001  Ais Hub Simulator
       tcp://sinagot.net:4002  NMEA single GPRMC feed
       tcp://sinagot.net:4003  NMEA single vessel AIVDM feed

       tcp://sinagot.net:4010    Adapter waiting for GPS103    tracker
       http://sinagot.net:4020/  Adapter waiting for OpenGPRMC phone apps
       Note: OpenGPRMC support both CellTrac Free & Pro version in theory
       any other GPRMC over HTTP. Pro version support group and device map.
       demo URL 'http://sinagot.net:4020/' [don't forget last /]

--------------------------------------------------------------------
   AIS users
     Vessel are view as devices
     MMSI is used in place of IMEI
--------------------------------------------------------------------
Simulation
  Make your GPX route with OpenCPN or any other application your like
  play your route with AISHubsimulator and check for result open OpenCPN

Debug:
  Check with Ais2Json if your AIS feed are valid
  Check with Demo Server debug port for data input to storage
    - Port 4030 provides a JSON human readable copy of data input to storage backend
    - Port 4040 same thing but with AIS/AIVDM format for OpenCPN type of application
  
Traffic storage:
    point your server onto your AIShub,MarineTraffic,... feeds
    - check for device [vessel are view as devices] with "dev all" command. 
    - select the device MMSI [view as iemi] you want to track.
    - create en entry in your DB with "dev create xxxx MyVesselName".
    - force reauthentication of device§vessel with "dev logout xxxx"
  
  For developers, GpsdTracking, embedded an Encode/Decode AIS library
  written in JavaScript. Thanks to OpenCpn, Gpsd and Danish Marine authority
  who did the hard work of documenting and providing the AIS nasty 6bits encoding mechanism.

GpsdTracking is written in node.js

