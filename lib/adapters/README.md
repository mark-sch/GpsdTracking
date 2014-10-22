Under GpsdTracking adapters take care of:
  - devices network protocol
  - device specific commands

GpsdTracking Provides 3 classes of adapters

1) SockClient
In this mode device are clients and gpsdtracking is a server. When a new client popup
we instantiate a "GpsClientSock" object to handle device data. The class is widely
use by tracker devices [ie: TK102,103 GPS103, Traccar, ....]

In SockClient mode gpsdtracking authenticates client once at initialisation time 
of TCP session and later leverage network socket to keep track of device session.
When network session is close we logout device.

Most trackers hardware devices implement flavour of GPS103 protocol. Depending
on the brand you selected, you may not have to much work to integrate yours.

2) HttpClient
Like in previous case in HttpClient mode devices remain client and gpsdtracking server.
Nevertheless this time we leverage a get/post request using HTTP protocol.
In this mode devices may close TCP session in between each update. As a result
as we cannot leverage socket context to keep track of user session. We use DevID
that has to present in the header of each request.

This model is used by many Phone applications that leverage NMEA/GPRMC within
a post/get through HTTP protocol. Android CellTrackFree is a good candidate
to start test.

3) SockClient
This time GPSdtracking is client of a remote server. This model is not use by devices, but
by AIS services, like AIShub, MarineTraffic, etc ... In this model Gpsd supports
3 adapters:
 - AISjson that resquest a GPSd server, in json mode
 - AISTcp  request a remote AIS feed in NMEA through a single TCP socket [AIShub case]
 - GPRMC   request a remote NMEA/GPRMC to get a vessel position.


 