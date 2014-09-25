# Spherical coordinate library

This library lets you compute distance, bearing, interpolations (mid points), and many other functions from a set of latitude / longitude pairs. 
Original code comes from http://www.movable-type.co.uk/scripts/latlong.html by Chris Veness 

## Installation
    npm install sgeo

## Usage


### parseDMS

Parses string representing degrees/minutes/seconds into numeric degrees.

This is very flexible on formats, allowing signed decimal degrees, or deg-min-sec optionally
suffixed by compass direction (NSEW). A variety of separators are accepted (eg 3º 37' 09"W) 
or fixed-width format without separators (eg 0033709W). Seconds and minutes may be omitted. 
(Note minimal validation is done).

```javascript
var sgeo = require('sgeo');

var lat = sgeo.parseDMS('51 28 40.12 N');
var lon = sgeo.parseDMS('00 00 05.31 W');
```

### toDMS

Convert decimal degrees to deg/min/sec format.

degree, prime, double-prime symbols are added, but sign is discarded, though no compass direction is added

```
var dms = sgeo.toDMS(12.34544, 'dms', 2);
```

### latlon

Provides various functionalities for geodesy calculations.

Initializing coordinates

```javascript
var sgeo = require('sgeo');
var p1 = new sgeo.latlon(51.0, -5.5);
var p2 = new sgeo.latlon(58.4778, -3.01);

console.log(p1.lat); //display latitude
console.log(p1.lng); //display longitude
console.log(p1); //toString()
```

Calculate distance (in km)

```javascript
var dist = p1.distanceTo(p2);      
console.log(dist);
```

```
846.6
```

Calculate bearing (in degress clockwise from north 0 - 360)

```javascript
var brng = p1.bearingTo(p2);       
console.log(brng);
```

```
9.871855132189069
```

Calculate midpoint

```javascript
var pm = p1.midpointTo(p2);       
console.log(pm);
```

```
{ lat: 54.74522196955371, lng: -4.3700915168517 }
```

midpoint of multiple locations

```javascript
var pm = sgeo.migpoint([p1, p2, p3]);
console.log(pm);
```

Interpolate points between p1 and p2

```javascript
var inp = p1.interpolate(p2, 5);
console.dir(inp);
```

```
[ { lat: 51, lng: -5.499999999999999 },
  { lat: 52.87394889826373, lng: -4.959445475316697 },
  { lat: 54.74522196955371, lng: -4.370091516851731 },
  { lat: 56.613360847919104, lng: -3.7236677522713766 },
  { lat: 58.47780000000001, lng: -3.0099999999999985 } ]

```

#### latlon.finalBeearingTo

Returns final bearing arriving at supplied destination point from this point; the final bearing 
will differ from the initial bearing by varying degrees according to distance and latitude

#### latlon.destinationPoint

Returns the destination point from this point having traveled the given distance (in km) on the
given initial bearing (bearing may vary before destination is reached)

#### latlon.intersection

Returns the point of intersection of two paths defined by point and bearing

#### latlon.rhumbDistanceTo

Returns the distance from this point to the supplied point, in km, travelling along a rhumb line

#### latlon.rhumbBearingTo

Returns the bearing from this point to the supplied point along a rhumb line, in degrees

#### latlon.rhumbDestinationPoint

Returns the destination point from this point having traveled the given distance (in km) on the given bearing along a rhumb line

#### latlon.rhumbMidpointTo

Returns the loxodromic midpoint (along a rhumb line) between this point and the supplied point.

#### sgeo.toLat 

Convert numeric degrees to deg/min/sec latitude (suffixed with N/S)

#### sgeo.toLon 

Convert numeric degrees to deg/min/sec longitude (suffixed with E/W)

#### sgeo.toBrng 

Convert numeric degrees to deg/min/sec as a bearing

## Attribution

Most of the code was originally written by Chris Veness at http://www.movable-type.co.uk/scripts/latlong.html

