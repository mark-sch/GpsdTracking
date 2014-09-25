GpsdTracking
==============

GpsdTracking is an opensource server for various GPS tracking devices. 
Main features are:
 - multiple storage backends: MySql, FlatFile, etc..
 - multiple tracking protocols gps103,traccar,nmea, ....
 - support full set of commands's trackers
 - global vision of every active devices indepandantly of adapter/protocols
 - support of broadcast to send a global commands
 - <telnet> console for remote supervision
 - commands automatic retry on timeout
 - provide feature for save storage space. No waypoints store when target does not move
 - provide a GpsSimulator to emulate NMEA device from a GPX file
 - flatfile backend generates standard GPX files from input tacking feeds

GpsdTracking has been designed to simply integration of new
tracking devices/backends. All specific parts or devices/backend are exported
to dedicated files. User only need to start from a sample, copy and customise.
 - to add a new backend user "file-backend" as starting point
 - to add a new device user "nmea-adapter" or "gps103" as starting point.

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
    $NODE apps/FlatFileGpsdTrackingSample.js

  # Simulate a gpstracker
    $NODE ./apps/GpsTrackerSimulator.js --file=./samples/gpx-files/opencpn-sample.gpx --port=6001 --tic=2 --debug=5

  # Check control console
    telnet local 6000
    [enter] evt
  
------------------------
  FlatFile backend 
------------------------
   * edit FlatFileGpsTrackingSample and check options
      -- verify devices port and track-store directory [path & prefix]

   * look in track-store
      -- you should find a file name sample-123456789.gpx under construction.
 
---------------------
- With MySQL backend 
---------------------
   * edit MySqlGpsTrackingSample and check options
      -- verify database name/user/password
      -- check network port for nmea and telnet

   * create MySQL base with mysql command line [GpsdTrack can only create base tables]

   * start  Server  $NODE ./apps/MySqlGpsdTrackingSample.js 
      -- verify that it successfully connect onto mysql

   * connect telnet console  [telnet localhost 5000] by default for MySQL sample app.
      -- register to listen to event [command: evt]
      -- create MySQL tables [command: dbinit] This create tables if they do not exist
      -- create a fake tracking device in MySQL [command: create 123456789 My Fake Device]
      [note: user HAVE TO create device in DB before server push received data to DB]
      
   * start a GpsSimulator
      -- $NODE ./apps/GpsTrackerSimulator.js --file=./samples/gpx-files/opencpn-sample.gpx --imei=123456789 --port=5001 --tic=10 --speed=10 --debug=1

   * look in your DB
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

    GpsdMySQL>  dbinit  // check/create tables in mysql
     --> OK  [check for errors on daemon log]

    GpsdMySQL> dev // use GpsdSimulator if you don't have a tracer
     --> List active devices 
     --> - no active devices [retry later]

    GpsdMySQL>  dev     
     --> List active devices 
     --> - 1 - imei: 359710043551135 Name:"false" uuid=GpsdClient://10.10.95.1:25508

    GpsdMySQL>  create 359710043551135 My First Tracker in DB
     --> create:OK  

    GpsdMySQL>  logout 359710043551135      // force device deconnection
     --> queue:0 --> [job:0] command=LOGOUT imei=359710043551135 [sent]

    GpsdMySQL>  dev
     --> List active devices 
     --> 1 - imei: 359710043551135 Name:"Fulup GPS103" uuid=GpsdClient://10.10.95.1:25509

    GpsdMySQL> track 359710043551135
    --> queue:1#-1 Queue Status=ACCEPT DevId=359710043551135 Command=GET_POS JobReq=1 Retry=0
    --> [job:1] command=GET_POS imei=359710043551135 [sent]

    GpsdMySQL> track 0 // broadcast tracking command to every active devices
    --> queue:0 --> [job:[object Object],2] command=Broadcast imei=undefined [sent]
    --> [job:1] command=GET_POS imei=359710043551134 [sent]
    --> [job:2] command=GET_POS imei=359710043551111 [sent]
    --> [job:3] command=GET_POS imei=123510043552222 [sent]
    --> [job:4] command=GET_POS imei=359710043553333 [sent]
    etc...

    GpsdMySQL> quit
    --> Connection closed by foreign host.


GpsdTracking is written in node.js

