/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 * 
 * References:
 *  Gpsd   : http://catb.org/gpsd/AIVDM.html
 *  OpenCPN: https://github.com/OpenCPN/OpenCPN [AIS_Bitstring.cpp]
 *  http://fossies.org/linux/misc/gpsd-3.11.tar.gz/gpsd-3.11/test/sample.aivdm
 *  Online AIS decoder http://www.maritec.co.za/aisvdmvdodecoding/
 *  Danish Maritime Authority https://github.com/dma-ais/AisLib (dma/ais/message)
 */

var fs       = require('fs');

// Ais payload is represented in a 6bits encoded string !(
// This method is a direct transcription in nodejs of C++ ais-decoder code
// Danish Maritime Authority AisLib encoding/decoding java library
AisEncode = function (msg) {
    this.payload = new Buffer(425); // make a buffer force it 6bit/zero 
    this.payload.fill (0x0);        // init to 6bits encoded zero value
    this.payloadSize =0;            // Payload size depend on messages
    this.nmea =[];

    /* try {
    if (msg.mmsi=== 456789012 || msg.mmsi===  785412369)  console.log ('***** mmsi=%s  lat=%s lon=%s sog=%s cog=%s, hdg=%s', msg.mmsi, msg.lat.toFixed(4), msg.lon.toFixed(4), msg.sog.toFixed(1), msg.cog.toFixed(1), msg.hdg.toFixed(1));
    } catch (e) {} */
    
    this.PutInt (msg.msgtype  ,0,6);
    this.PutInt (msg.repeat   ,6,2);
    this.PutInt (msg.mmsi     ,8,30);
    var lat; var lon; var sog; var hdg;
    
    switch (msg.msgtype) {
        case 1:
        case 2:
        case 3: // class A position report
            this.class      = 'A';
            this.PutInt(msg.navstatus, 38, 4 );
            
            // move lat to integer and take care of negative value
            lon = parseInt (msg.lon * 600000);
            if (lon < 0) lon |= 0x08000000;    // on 28 bits
            this.PutInt(lon, 61, 28 );

            lat = parseInt (msg.lat * 600000); // on 27 bits
            if (lat < 0) lat |= 0x04000000;
            this.PutInt(lat, 89, 27 );
      
            sog=parseInt (msg.sog *10);  //speed over ground
            this.PutInt (sog,  50, 10 );
            

            cog=parseInt (msg.cog *10);  //course over ground
            this.PutInt (cog,  116, 12 );

            hdg=parseInt (msg.hdg) || parseInt (msg.cog); //magnetic heading 
            this.PutInt (hdg,  128, 9 );

            this.PutInt  (60,  137, 6 );  // 60 if time stamp is not available
            this.payloadSize=168;   // pad with zero non used flags
                                  
            break;
        case 18: // class B position report
            this.class  = 'B';

            sog=parseInt (msg.sog *10);  //speed over ground
            this.PutInt (sog,  46, 10 );
            
            // move lat to integer and take care of negative value
            lon = parseInt (msg.lon * 600000); //Long 1/10000 minute
            if (lon < 0) lon |= 0x08000000;
            this.PutInt(lon, 57, 28 );

            lat = parseInt (msg.lat * 600000); //Lat 1/10000 minute
            if (lat < 0) lat |= 0x04000000;
            this.PutInt(lat, 85, 27 );
            
            cog=parseInt (msg.cog *10);  //course over ground
            this.PutInt (cog,  112, 12 );
      
            hdg=parseInt (msg.hdg)|| parseInt (msg.cog);      //magnetic heading 
            this.PutInt (hdg,  124, 9 );
            
            this.PutInt  (60,  133, 6 );  // 60 [time stamp is not available]
                  
            this.payloadSize=168;   // pad with zero non used flags
            break;
        case 5:
            this.class  = 'A';
//          Get the AIS Version indicator
//          0 = station compliant with Recommendation ITU-R M.1371-1
//          1 = station compliant with Recommendation ITU-R M.1371-3
//          2-3 = station compliant with future editions
            
            this.PutInt (1,38, 2); // version station =1
            this.PutInt (msg.imo     ,40, 30);
            this.PutStr (msg.callsign,70, 42);
            this.PutStr (msg.shipname,112, 120);
            this.PutInt (msg.cargo   ,232, 8);
            this.PutInt (msg.dimA    ,240, 9);
            this.PutInt (msg.dimB    ,249, 9);
            this.PutInt (msg.dimC    ,258, 6);
            this.PutInt (msg.dimD    ,264, 6);
            this.PutInt (msg.etaMo   ,274, 4);
            this.PutInt (msg.etaDay  ,278, 5);
            this.PutInt (msg.etaHr   ,283, 5);
            this.PutInt (msg.etaMin  ,288, 6);
            draught = parseInt (msg.draught*10);
            this.PutInt((parseInt(draught*10)), 294, 8);
            this.PutStr(msg.destination,302,120);
             this.payloadSize=422
            break;
        case 24:  // Vesel static information
            this.class='B';
            this.PutInt(msg.part, 38, 2 );
            if (msg.part===0) {
                this.PutStr(msg.shipname, 40, 120);
                this.payloadSize=160;
            } else if ( msg.part === 1) {
                this.PutInt(msg.cargo   , 40, 8 );
                this.PutStr(msg.callsign, 90, 42);
                this.PutInt (msg.dimA, 132, 9 );
                this.PutInt (msg.dimB, 141, 9 );
                this.PutInt (msg.dimC, 150, 6 );
                this.PutInt (msg.dimD, 156, 6 );
                this.payloadSize=168; // ignore last flags
            }
            break;
        default:
            // not implemented
            this.valid=false;
            return;
    }
    
    // Make sure we finish on a byte boundary
    size= parseInt(this.payloadSize/6) +1;  
    for(var i = 0; i < size ; i++) {
        var chr = this.payload[i];

        // move to printable char from wacky AIS/IEC 6 bit representation
        if (chr < 40) {
            this.payload[i] = chr +48;
        } else {
            this.payload[i] = chr +56;
        }
    };
   
    // Finish nmea message !AIVDM,1,1,,B,B69>7mh0?J<:>05B0`0e;wq2PHI8,0*3D'
    // this.fragcnt = nmea[1];  // fragment total count for this message
    // this.fragnum = nmea[2];  // fragment number 
    // this.fragid  = nmea[3];  // fragment sequential index for multipart message
    // this.pading  = nmea[6].split ('*')[0];
    var nmea=[];
    nmea [0] = '!AIVDM';  // ! is added after checksum
    nmea [1]  = '1';     // ignore multipart extention messages
    nmea [2]  = '1'; 
    nmea [3]  = ''; 
    nmea [4]  = 'A';     // this is VHF channel and not AIS class
    nmea [5]  = this.payload.toString("utf8", 0, size);
    nmea [6]  = 0;
    paquet = nmea.toString();

    var checksum = 0; // http://rietman.wordpress.com/2008/09/25/how-to-calculate-the-nmea-checksum/
    for(var i = 1; i < paquet.length; i++) {
        checksum = checksum ^ paquet.charCodeAt(i);
    }
    var trailer= "*" + checksum.toString(16).toUpperCase() + "\r\n";
    this.nmea =  paquet + trailer;
    this.valid=  true;
};


// Warning: a bug remaims, if you invert order of placing in between
// cog and hdg then cog value is broken. Not an issue for now, but
// should be fixed in order to encode others AIS messages
AisEncode.prototype.PutInt = function (number, start, len) {
    if (number  === undefined) return; // nothing garantie that will have a valid number
    
    // keep track of payload size
    if ((start+len) > this.payloadSize) this.payloadSize= start+len;

    for (var i=0; i < len; i++)  {
        // search the right bit within our tempry number
        c0 = (number >> i) & 1;   // bit at byte/bit index
            
        if (c0 !== 0) { // if null nothing to do as we filled up output number with zero 
            // place out bit within destination output number
            tp = parseInt ((start + len - i -1) / 6);    // byte index within destination target
            ti = len - i -1;
            ts = 5 - (start + ti) % 6;                   // bit index to set within targeted byte
            t0 = 1 << ts;                                // shift bit to the right destination
            this.payload[tp] |= t0;                            // update output target
        }
    };
};
   
// Extract a string from payload [1st bits is index 0]
AisEncode.prototype.PutStr = function (string, start, len) {
    //console.log ('PutStr string=%s start=%d len=%d', string, start, len);
    if (string === undefined) return; // nothing garantie that will have a valid string
    string=string.toUpperCase();
    
    // keep track of payload size
    if ((start+len) > this.payloadSize) this.payloadSize= start+len;

    // give priority to provided bit/len but reduce it is string is smaller
    var len = parseInt (len/6);
    if (len > string.length) len=string.length;
    var bitidx=start;
    
    // loop on every string string characters until 1st len limit
    for (var idx=0; idx < len; idx++)  {
        cx  = string.charCodeAt (idx);  // current char to work with
         
        // loop on each character bit
        for (j=5; j >= 0; j--) {
            c0 = (cx >> j) & 1;    // get bit value
            
            if (c0 !== 0) { // if null nothing to do as we filled up output buffer with zero 
                // place out bit within destination output string
                tp = parseInt (bitidx/6);                  // byte index at target
                ts = 5 - (bitidx % 6);                     // bit index to set within targeted byte
                t0 = 1 << ts;                              // shift bit to the right destination
                this.payload[tp] |= t0;                          // update output target

            }
            bitidx++; // next bit possition in target 
        }
    };
};


AisEncode.prototype.GetNavStatus =function () {
    return (NAV_STATUS [this.navstatus]);
};

AisEncode.prototype.GetMsgType =function () {
    return (MSG_TYPE [this.msgtype]);
};

AisEncode.prototype.GetVesselType =function () {
    return (VESSEL_TYPE [this.cargo]);
};

// compare input with decoded outputs
AisEncode.prototype.CheckResult = function (test, aisin, controls) {
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
    
// Testing AIS message samples
var TestingData = {
    msg18a: { // standard class B Position report
        msgtype    : 18,
        nmea       : '!AIVDM,1,1,,B,B69>7mh0?B<:>05B0`0e80N0,0*25',
        cog        : 72.2,
        sog        : 6.1000000000000005,
        dsc        : false,
        repeat     : false,
        accuracy   : true,
        lon        : 122.47338666666667, // 122*28.4032'E 	
        lat        : 36.91968, // 36*55.1808'N 	
        second     : 50,
        mmsi       : 412321751
     }
    ,msg3: { // standard class A position report
        msgtype    : 3,
        nmea       : '!AIVDM,1,1,,B,369>7mh05:O`0n1uRQp7201p,0*18',
        navstatus  : 0, // underway using engine
        cog        : 180,
        sog        : 33,
        dsc        : false,
        repeat     : false,
        accuracy   : true,
        lon        : -5.24,
        lat        : -4.3,
        second     : 50,
        mmsi       : 412321751
     }
    ,msg24a: {// class AB static info
        msgtype    : 24,
        part       : 0,
        nmea       : "!AIVDM,1,1,,B,H42O55i18tMET00000000000000,0*6C",
        mmsi       : 271041815,
        shipname   : "PROGUY"
    }
    ,msg24b: {// class AB static info
        msgtype    : 24,
        part       : 1,
        nmea       : "!AIVDM,1,1,,B,H42O55lt0000000D3nink000?050,0*43",
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
        nmea       : "!AIVDM,1,1,,B,55?MbV42;H;s<HtKR20EHE:0@T4@Dn2222222216L961O0000NP,0*69",
        mmsi       : 351759000,
        imo        : 9134270,
        callsign   : "3FOF8  ",  
        shipname   : "Ever DIADEM         ",         
        cargo      : 70,
        dimA       : 225,
        dimB       : 70,
        dimC       :  1,
        dimD       : 31,
        fixmsgtype :  1,
        etamn      :  0,
        etaho      : 16,
        etaday     : 15,
        etamonth   :  5,
        draught    : 12.2,
        destination: "NEW YORK  "            
}};
    
TestEncode = function (TestingData) {
   
    // make sure we get expected output from reference messages
    for (var test in TestingData) {
        aisin = TestingData [test];
        aisout = new AisEncode (aisin);
        console.log ("\nTEST=%s  --> http://www.maritec.co.za/ais", test);
        console.log (" --in=%s", aisin.nmea);
        console.log (" --ou=%s", aisout.nmea);
        
        var error=0;
        for (var i=0; i< aisin.nmea.length; i++) {
            if (aisin.nmea [i] !== aisout.nmea [i]) {
                error=1;
                console.log ('  ** idx=%d in:%s != out:%s', i, aisin.nmea [i],  aisout.nmea [i]);
            }
        }
        
        if (error === 0 )console.log ("  ## OK ##");
        else console.log ("  ** ERROR **");
    }
};



// if started as a main and not as module, then process test.
if (process.argv[1] === __filename)  {
 TestEncode (TestingData);
 }

module.exports = AisEncode; // http://openmymind.net/2012/2/3/Node-Require-and-Exports/

