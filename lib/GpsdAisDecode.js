/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 * 
 * References:
 *  Gpsd   : http://catb.org/gpsd/AIVDM.html [best doc]
 *  OpenCPN: https://github.com/OpenCPN/OpenCPN [file: AIS_Bitstring.cpp]
 *  http://fossies.org/linux/misc/gpsd-3.11.tar.gz/gpsd-3.11/test/sample.aivdm
 *  online AIS decoder http://www.maritec.co.za/aisvdmvdodecoding/
 */

var fs       = require('fs');


var MSG_TYPE = {
   01:  "Position Report Class A",
   02:  "Position Report Class A (Assigned schedule)",
   03:  "Position Report Class A (Response to interrogation)",
   04:  "Base Station Report",
   05:  "Static and Voyage Related Data",
   06:  "Binary Addressed Message",
   07:  "Binary Acknowledge",
   08:  "Binary Broadcast Message",
   09:  "Standard SAR Aircraft Position Report",
   10:  "UTC and Date Inquiry",
   11:  "UTC and Date Response",
   12:  "Addressed Safety Related Message",
   13:  "Safety Related Acknowledgement",
   14:  "Safety Related Broadcast Message",
   15:  "Interrogation",
   16:  "Assignment Mode Command",
   17:  "DGNSS Binary Broadcast Message",
   18:  "Standard Class B CS Position Report",
   19:  "Extended Class B Equipment Position Report",
   20:  "Data Link Management",
   21:  "Aid-to-Navigation Report",
   22:  "Channel Management",
   23:  "Group Assignment Command",
   24:  "Static Data Report",
   25:  "Single Slot Binary Message,",
   26:  "Multiple Slot Binary Message With Communications State",
   27:  "Position Report For Long-Range Applications"
};

var NAV_STATUS = {
    0:  "Under way using engine",
    1:  "At anchor",
    2:  "Not under command",
    3:  "Restricted manoeuverability",
    4:  "Constrained by her draught",
    5:  "Moored",
    6:  "Aground",
    7:  "Engaged in Fishing",
    8:  "Under way sailing",
    9:  "Reserved for future amendment of Navigational Status for HSC",
   10: "Reserved for future amendment of Navigational Status for WIG",
   11: "Reserved for future use",
   12: "Reserved for future use",
   13: "Reserved for future use",
   14: "AIS-SART is active",
   15: "Not defined (default)"
};

var VESSEL_TYPE= {
     0: "Not available (default)",
    // 1-19 Reserved for future usage 
    20: "Wing in ground (WIG), all ships of this type",
    21: "Wing in ground (WIG), Hazardous category A",
    22: "Wing in ground (WIG), Hazardous category B",
    23: "Wing in ground (WIG), Hazardous category C",
    24: "Wing in ground (WIG), Hazardous category D",
    25: "Wing in ground (WIG), Reserved for future use",
    26: "Wing in ground (WIG), Reserved for future use",
    27: "Wing in ground (WIG), Reserved for future use",
    28: "Wing in ground (WIG), Reserved for future use",
    29: "Wing in ground (WIG), Reserved for future use",
    30: "Fishing",
    31: "Towing",
    32: "Towing: length exceeds 200m or breadth exceeds 25m",
    33: "Dredging or underwater ops",
    34: "Diving ops",
    35: "Military ops",
    36: "Sailing",
    37: "Pleasure Craft",
    38: "Reserved",
    39: "Reserved",
    40: "High speed craft (HSC), all ships of this type",
    41: "High speed craft (HSC), Hazardous category A",
    42: "High speed craft (HSC), Hazardous category B",
    43: "High speed craft (HSC), Hazardous category C",
    44: "High speed craft (HSC), Hazardous category D",
    45: "High speed craft (HSC), Reserved for future use",
    46: "High speed craft (HSC), Reserved for future use",
    47: "High speed craft (HSC), Reserved for future use",
    48: "High speed craft (HSC), Reserved for future use",
    49: "High speed craft (HSC), No additional information",
    50: "Pilot Vessel",
    51: "Search and Rescue vessel",
    52: "Tug",
    53: "Port Tender",
    54: "Anti-pollution equipment",
    55: "Law Enforcement",
    56: "Spare - Local Vessel",
    57: "Spare - Local Vessel",
    58: "Medical Transport",
    59: "Noncombatant ship according to RR Resolution No. 18",
    60: "Passenger, all ships of this type",
    61: "Passenger, Hazardous category A",
    62: "Passenger, Hazardous category B",
    63: "Passenger, Hazardous category C",
    64: "Passenger, Hazardous category D",
    65: "Passenger, Reserved for future use",
    66: "Passenger, Reserved for future use",
    67: "Passenger, Reserved for future use",
    68: "Passenger, Reserved for future use",
    69: "Passenger, No additional information",
    70: "Cargo, all ships of this type",
    71: "Cargo, Hazardous category A",
    72: "Cargo, Hazardous category B",
    73: "Cargo, Hazardous category C",
    74: "Cargo, Hazardous category D",
    75: "Cargo, Reserved for future use",
    76: "Cargo, Reserved for future use",
    77: "Cargo, Reserved for future use",
    78: "Cargo, Reserved for future use",
    79: "Cargo, No additional information",
    80: "Tanker, all ships of this type",
    81: "Tanker, Hazardous category A",
    82: "Tanker, Hazardous category B",
    83: "Tanker, Hazardous category C",
    84: "Tanker, Hazardous category D",
    85: "Tanker, Reserved for future use",
    86: "Tanker, Reserved for future use",
    87: "Tanker, Reserved for future use",
    88: "Tanker, Reserved for future use",
    89: "Tanker, No additional information",
    90: "Other Type, all ships of this type",
    91: "Other Type, Hazardous category A",
    92: "Other Type, Hazardous category B",
    93: "Other Type, Hazardous category C",
    94: "Other Type, Hazardous category D",
    95: "Other Type, Reserved for future use",
    96: "Other Type, Reserved for future use",
    97: "Other Type, Reserved for future use",
    98: "Other Type, Reserved for future use",
    99: "Other Type, no additional information"
};   


// Ais payload is represented in a 6bits encoded string !(
// This method is a direct transcription in nodejs of C++ ais-decoder code
AisDecode = function (input) {
    this.bitarray=[];
    this.valid= false; // will move to 'true' if parsing succeed
    
    // split nmea message !AIVDM,1,1,,B,B69>7mh0?J<:>05B0`0e;wq2PHI8,0*3D'
    var nmea = input.split (",");
    
    // make sure we are facing a supported AIS message
    if (nmea [0] !== '!AIVDM') return;
    
    
    // this.fragcnt = nmea[1];  // fragment total count for this message
    // this.fragnum = nmea[2];  // fragment number 
    // this.fragid  = nmea[3];  // fragment sequential index for multipart message
    // this.pading  = nmea[6].split ('*')[0];
    
    if (nmea[2]  !== '1') { // ignore multipart extention messages
        // console.log ("MultiPart Message Ignored [%s]", nmea);
        return;
    } 

    // extract binary payload and other usefull information from nmea paquet
    var payload  = new Buffer (nmea [5]);
    this.length  = payload.length;
    this.channel = nmea[4];  // vhf channel A/B
    // console.log ("payload=%s", payload.toString ('utf8'));
    
    // decode printable 6bit AIS/IEC binary format
    for(var i = 0; i < this.length; i++) {
        var byte = payload[i];

        // check byte is not out of range
        if ((byte < 0x30) || (byte > 0x77))  return -1;
        if ((0x57 < byte) && (byte < 0x60))  return -1;
   
        // move from printable char to wacky AIS/IEC 6 bit representation
        byte += 0x28;
        if(byte > 0x80)  byte += 0x20;
        else             byte += 0x28;
        this.bitarray[i]=byte;
    }
    
    this.msgtype   = this.GetInt (0,6);
    this.repeat    = this.GetInt (6,2);
    this.mmsi      = this.GetInt (8,30);

    
    switch (this.msgtype) {
        case 1:
        case 2:
        case 3: // class A position report
            this.class      = 'A';
            this.navstatus  = this.GetInt( 38, 4);
            var lon         = this.GetInt(61, 28);
            if (lon & 0x08000000 ) lon |= 0xf0000000;
            lon = parseFloat (lon / 600000);

            var lat = this.GetInt(89, 27);
            if( lat & 0x04000000 ) lat |= 0xf8000000;
            lat = parseFloat (lat / 600000);

            if( ( lon <= 180. ) && ( lat <= 90. ) ) {
                this.lon = lon;
                this.lat = lat;
                this.valid = true;  
            } else this.valid = false;
            
            this.sog = parseFloat (0.1 * this.GetInt(  50, 10 )); //speed over ground
            this.cog = parseFloat (0.1 * this.GetInt( 116, 12)); //course over ground
            this.hdg = parseFloat (1.0 * this.GetInt( 128,  9)); //magnetic heading 
            this.utc = this.GetInt( 137, 6 );
            //if (parseInt (this.mmsi)=== 456789012 )  console.log ('**dec3*** emei=%s  lat=%s lon=%s sog=%s cog=%s hdg=%s', this.mmsi, this.lat.toFixed(4), this.lon.toFixed(4), this.sog.toFixed(1), this.cog.toFixed(1),this.hdg.toFixed(1));

            break;
        case 18: // class B position report
            this.class  = 'B';
            this.status = -1;  // Class B targets have no status.  Enforce this...
            var lon = this.GetInt(57, 28 );
            if (lon & 0x08000000 ) lon |= 0xf0000000;
            lon = parseFloat (lon / 600000);

            var lat = this.GetInt(85, 27 );
            if( lat & 0x04000000 ) lat |= 0xf8000000;
            lat = parseFloat (lat / 600000);

            if( ( lon <= 180. ) && ( lat <= 90. ) ) {
                this.lon = lon;
                this.lat = lat;
                this.valid = true;  
            } else this.valid = false;
            
            this.sog = parseFloat (0.1 * this.GetInt( 46, 10 )); //speed over ground
            this.cog = parseFloat (0.1 * this.GetInt( 112, 12)); //course over ground
            this.hdg = parseFloat (1.0 * this.GetInt( 124,  9)); //magnetic heading 
            this.utc = this.GetInt( 134, 6 );
 
            //if (parseInt (this.mmsi)=== 785412369)  console.log ('**dec18*** emei=%s  lat=%s lon=%s sog=%s cog=%s hdg=%s', this.mmsi, this.lat.toFixed(4), this.lon.toFixed(4), this.sog.toFixed(1), this.cog.toFixed(1),this.hdg.toFixed(1) );


            break;
        case 5:
            this.class  = 'A';
//          Get the AIS Version indicator
//          0 = station compliant with Recommendation ITU-R M.1371-1
//          1 = station compliant with Recommendation ITU-R M.1371-3
//          2-3 = station compliant with future editions
            AIS_version_indicator = this.GetInt(38,2);
            if( AIS_version_indicator < 2 ) {
                this.imo = this.GetInt(40,30);
                this.callsign    = this.GetStr(70,42);
                this.shipname    = this.GetStr(112,120);
                this.cargo       = this.GetInt(232,8);
                this.dimA        = this.GetInt(240,9);
                this.dimB        = this.GetInt(249,9);
                this.dimC        = this.GetInt(258,6);
                this.dimD        = this.GetInt(264,6);
                this.etaMo       = this.GetInt(274,4);
                this.etaDay      = this.GetInt(278,5);
                this.etaHr       = this.GetInt(283,5);
                this.etaMin      = this.GetInt(288,6);
                this.draught     = parseFloat (this.GetInt(294, 8 ) / 10.0);
                this.destination = this.GetStr(302, 120);
                this.length      = this.dimA + this.dimB;
                this.width       = this.dimC + this.dimD;
                this.valid       = true;
            }

            break;
        case 24:  // Vesel static information
            this.class='B';
            this.part = this.GetInt(38, 2 );
            if (0 === this.part ) {
                this.shipname = this.GetStr(40, 120);
                this.valid    = true;
            } else if ( this.part === 1) {
                this.cargo    = this.GetInt(40, 8 );
                this.callsign = this.GetStr(90, 42);

                this.dimA  = this.GetInt(132, 9 );
                this.dimB  = this.GetInt(141, 9 );
                this.dimC  = this.GetInt(150, 6 );
                this.dimD  = this.GetInt(156, 6 );
                this.valid = true;
            }
            break;
        default:
    }
};

// Extract an integer sign or unsigned from payload
AisDecode.prototype.GetInt= function (start, len, signed) {
    var acc = 0;
    var cp, cx,c0;

    for(var i=0 ; i<len ; i++)
    {
        acc  = acc << 1;
        cp = parseInt ((start + i) / 6);
        cx = this.bitarray[cp]; 
        cs = 5 - ((start + i) % 6);
        c0 = (cx >> cs) & 1;
        // if(i === 0 && signed && c0) // if signed value and first bit is 1, pad with 1's
        //   acc = ~acc;
        acc |= c0;
        
        //console.log ('**** bitarray[%d]=cx=%s i=%d cs=%d  co=%s acc=%s'
        //,cp , this.bitarray[cp].toString(2), i, cs,  c0.toString(2),acc.toString(2));
    }
    //console.log ('---- start=%d len=%d acc=%s acc=%d', start, len ,  acc.toString(2), acc);
    return acc;
},

// Extract a string from payload [1st bits is index 0]
AisDecode.prototype.GetStr= function(start, len) {
    
    // extended message are not supported
    if (this.bitarray.length < (start + len) /6) {
        //console.log ("AisDecode: ext msg not implemented GetStr(%d,%d)", start, len);
        return;
    }

    //char temp_str[85];
    var buffer = new Buffer(20);
    var cp, cx, cs,c0;
    var acc = 0;
    var k   = 0;
    var i   = 0;
    while(i < len)
    {
         acc=0;
         for(var j=0 ; j<6 ; j++)
         {
            acc  = acc << 1;
            cp =  parseInt ((start + i) / 6);
            cx = this.bitarray[cp]; 
            cs = 5 - ((start + i) % 6);
            c0 = (cx >> (5 - ((start + i) % 6))) & 1;
            acc |= c0;
            i++;
         }
         buffer[k] = acc; // opencpn 
         if(acc < 0x20)  buffer[k] += 0x40;
         else          buffer[k] = acc;  // opencpn enfoce (acc & 0x3f) ???
         if ( buffer[k] === 0x40) break; // name end with '@'
         k++;
    }
    return (buffer.toString ('utf8',0, k));
};

AisDecode.prototype.GetNavStatus =function () {
    return (NAV_STATUS [this.navstatus]);
};

AisDecode.prototype.GetMsgType =function () {
    return (MSG_TYPE [this.msgtype]);
};

AisDecode.prototype.GetVesselType =function () {
    return (VESSEL_TYPE [this.cargo]);
};

// compare input with decoded outputs
AisDecode.prototype.CheckResult = function (test, aisin, controls) {
        var slot; 
        var count=0;
        console.log ("\nChecking: [%s] --> [%s]", test, aisin.nmea);
        for (var element in controls){
            slot = controls[element];
            if (aisout[slot] !== aisin[slot]) {
                count ++;
                console.log ("--> FX (%s) in:[%s] != out:[%s]", slot, aisin[slot], this [slot]);
            } else {
                console.log ("--> OK (%s) in:[%s] == out:[%s]", slot, aisin[slot], this [slot]);
            }
        }

        if (count > 0)  console.log ("** FX Test [%s] Count=%d **", test, count);
        else console.log ("## OK Test [%s] ##", test);
    };
    
AisDecode.prototype.CheckDecode = function (test,aisin) {    
        if (this.valid !== true) {
            console.log ("[%s] invalide AIS payload", test);
        } else {
            switch (this.msgtype) {
            case 18:
                this.CheckResult (test, aisin, ["mmsi", 'lon', 'lat', 'cog', "sog"]);
                break;
            case 24:
                    this.CheckResult (test, aisin, ["shipname", 'callsign', 'cargo', 'dimA', 'dimB', "dimC", 'dimD']);
                break;
            case  5:
                    this.CheckResult (test, aisin, ["shipname", 'callsign', 'cargo', 'destination', 'draught', 'dimA', 'dimB', "dimC", 'dimD']);
                break;
            default:
                console.log ("hoop test=[%s] message type=[%d] not implemented", test, this.type);
            }
        }
};


// Testing AIS message samples
var TestingData = {
    msg24a: {// class AB static info
        msgtype    : 24,
        part       : 1,
        nmea       : "!AIVDM,1,1,,A,H42O55i18tMET00000000000000,2*6D",
        mmsi       : 271041815,
        shipname   : "PROGUY"
    } 
    ,msg18: { // standard class B Position report
        msgtype    : 18,
        nmea       : '!AIVDM,1,1,,B,B69>7mh0?J<:>05B0`0e;wq2PHI8,0*3D',
        cog        : 72.2,
        sog        : 6.1000000000000005,
        dsc        : false,
        repeat     : false,
        accuracy   : true,
        lon        : 122.47338666666667,
        lat        : 36.91968,
        second     : 50,
        mmsi       : 412321751
     }

    ,msg24b: {// class AB static info
        msgtype    : 24,
        part       : 2,
        nmea       : "!AIVDM,1,1,,A,H42O55lti4hhhilD3nink000?050,0*40",
        mmsi       : 271041815,
        cargo      : 60,   
        callsign   : "TC6163",
        dimA       : 0,     
        dimB       : 15,    
        dimC       : 0,     
        dimD       : 5
    }
    ,msg5: { // class A static info
        msgtype    : 5, 
        nmea       : "!AIVDM,2,1,1,A,55?MbV02;H;s<HtKR20EHE:0@T4@Dn2222222216L961O5Gf0NSQEp6ClRp8,0*1C",
                 // ,"!AIVDM,2,2,1,A,88888888880,2*25"], [extentions for destination not implemented]
        mmsi       : 351759000,
        imo        : 9134270,
        callsign   : "3FOF8  ",  
        shipname   : "EVER DIADEM         ",         
        cargo      : 70,
        dimA       : 225,
        dimB       : 70,
        dimC       :  1,
        dimD       : 31,
        fixmsgtype    :  1,
        etamn      :  0,
        etaho      : 16,
        etaday     : 15,
        etamonth   :  5,
        draught    : 12.2
        //destination: "NEW YORK  " Extention message not implemented
    }};
    
TestDecode = function (TestingData) {
   
    // make sure we get expected output from reference messages
    for (var test in TestingData) {
        aisin  = TestingData [test];
        aisout = new AisDecode (aisin.nmea);
        aisout.CheckDecode (test,aisin);
    }
};

TestFile = function (filename) {
    buffer = fs.readFileSync (filename, "utf-8");
    line   = "";
    count=0;
    for (var idx=0; idx < buffer.length; idx++) {
    switch (buffer [idx]) {
        case '\n': // new line
            count ++;   
            console.log ("line[%d]=%s", count,  line);
       
            msg = {
                nmea: line
            };
        
            ais= new AisDecode (msg);
            switch (ais.msgtype) {
                case 1:
                case 2:
                case 3:
                case 18:
                    console.log (' -->msg-18 mmsi=%d Lon=%d Lat=%d Speed=%d Course=%d, NavStatus=%s/%s'
                                , ais.mmsi, ais.lon, ais.lat, ais.sog, ais.cog, ais.navstatus, ais.GetNavStatus());
                    break;
                case 24:
                    console.log (' -->msg-24 mmsi=%d shipname=%s callsign=%s cargo=%s/%s length=%d width=%d'
                                , ais.mmsi,ais.shipname, ais.callsign, ais.cargo, ais.GetVesselType(),  ais.length, ais.width);
                    break;
                case 5:
                    console.log (' -->msg-05 mmsi=%d shipname=%s callsign=%s cargo=%s/%s draught=%d length=%d width=%d'
                                , ais.mmsi,ais.shipname, ais.callsign, ais.cargo, ais.GetVesselType(),ais.draught, ais.length, ais.width);
                break;
                default:
                    console.log (" ### hoop msg-%d ==> [%s] not implemented", ais.msgtype, ais.GetMsgType());
        }
                    
        line='';
        break;
        
      case '\r': break; 
      default: 
        line += buffer [idx];
  }
 }
};

// if started as a main and not as module, then process test.
if (process.argv[1] === __filename)  {
 TestDecode (TestingData);
 //TestFile   ('../samples/nmea/aissample.nmea');
 }

module.exports = AisDecode; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/



