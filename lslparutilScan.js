var BigDecimal = require('big.js');
var PerfContainer = require("./perfContainer.js");


// IMPORTANT
// All date objects are in UTC !!!!!!


function LslparutilScan(file, slots) {
  if (! (this instanceof LslparutilScan) ) {
    return new LslparutilScan(file, slots);
  }
  this.file = file;


  var MAXPOOL = 256;		// skip all samples with more than this value

  var lines = 0;

  var mySlots;			// number of data slots

  var time_stack = [];		// [0] = previous sample time in Date format, [1] = current sample time in Date format.

  var prevPool = {};  		// system pool
  var prevProcPool = [];  	// processor pool indexed by id. Array of objects
  var prevLpar = [];  		// LPAR indexed by id. Array of objects

  var limits = {};  		// start and end
  var lparData = [];  		// one object for each LPAR
  var procPool = [];  		// processor pool indexed by id
  var sysPool = {};  		// system pool
  var system = {};  		// system data

  var parsed = false;  		// set true when parsed

  limits.start = undefined;
  limits.end = undefined;

  if (slots === undefined)
    mySlots = 500;
  else
    mySlots = slots;



  // Log on console with timestamp and name
  var log = function log(s) {
	var d = new Date();
	var result = d.getFullYear();
        var v = d.getMonth()+1;
        if (v<10) v = '0'+v;
        result += v;
	v = d.getDate();
        if (v<10) v = '0'+v;
        result += v;
	v = d.getHours();
        if (v<10) v = '0'+v;
        result += v;
	v = d.getMinutes();
        if (v<10) v = '0'+v;
        result += v;
	v = d.getSeconds();
        if (v<10) v = '0'+v;
        result += v;
	result = result + ' ' + file + "> " + s;
	console.log(result);
  }



  // 
  // Get time tag from line into a Date object. Update limits structure accordingly
  // No value returned
  //
  var scanDate = function scanDate(line) {
    // Skip if no data is present or is not valid
    if (line.startsWith("HSC") || 
        line.startsWith("The managed system") ||
        line.startsWith("No results were found") ||
          line.startsWith("state=Standby") )
    return;

    var item = parseDate(getValue(line,"time"));
    if (item == null) {
      log("Skipping line without valid date");
      log(line);
      return;
    }

    if ( limits.start === undefined  || 
        item.getTime() < limits.start.getTime() )
      limits.start = item;

    if ( limits.end === undefined  || 
        item.getTime() > limits.end.getTime() )
      limits.end = item;

  }






  //
  // Read line looking for sample data and execute function to manage sys, pool, lpar data
  // No value returned
  //
  var parseLine = function parseLine(line) {

    // Skip if no data is present or is not valid
    if (line.startsWith("HSC") || 
        line.startsWith("The managed system") ||
        line.startsWith("No results were found") ||
          line.startsWith("state=Standby") )
    return;


    var item; 
  
    item = getValue(line,"event_type");
    if ( item == null || item != "sample" ) {
      return;
    }

    item = getValue(line,"resource_type");
    if (item == null) {
      log("Skipping line with invalid resource_type");
      log(line);
      return;
    }

    // manage time stack
    var sampleTime = parseDate(getValue(line,"time"));
    if ( time_stack.length == 0 ) {
      // This is the very first time sample
      time_stack.push(sampleTime);
      //log("Very first time: " + sampleTime.toString());
    } else if ( time_stack.length == 1 ) {
      if (time_stack[0].getTime() != sampleTime.getTime() ) {
        // This is the very second time sample
        time_stack.push(sampleTime);
        //log("Very second time: " + sampleTime.toString());
      }
    } else {
      if (time_stack[1].getTime() != sampleTime.getTime() ) {
        // This is a new time sample
        time_stack.push(sampleTime);
        time_stack.shift();
        //log("New time: " + sampleTime.toString());
      }
    }

    if ( item === "sys" )
      manageSys(line);

    if ( item === "pool" )
      managePool(line);

    if ( item === "procpool" )
      manageProcPool(line);

    if ( item === "lpar" )
      manageLpar(line);

  }


  // 
  // XXXXX  manca gestione dedicated LPAR !!!!!!!
  //
  // Line is a sample related to LPAR
  // Get data, compare with previous line (that was earlier in time) and update LPAR data
  // No value returned
  //
  var manageLpar = function manageLpar(line) {
    var currLpar = {};

    var item = parseDate(getValue(line,"time"));
    if (item == null) {
      log("Skipping line without valid date");
      log(line);
      return;
    }


    var id   = parseInt(getValue(line,"lpar_id"));
    var name = getValue(line,"lpar_name");
    var lpar = getLpar(name);	// lpar opject with data related to this name

    lpar.ent.addValue(item, parseFloat(getValue(line,"curr_proc_units")));
    lpar.vp.addValue(item, parseInt(getValue(line,"curr_procs")));

    //result.cpumode = getValue(line,"curr_proc_mode");
    //result.sharing = getValue(line,"curr_sharing_mode");
    //result.poolid = getValue(line,"curr_shared_proc_pool_id");

    currLpar.time = item;
    currLpar.name = name;
    currLpar.capped_cycles 	=   new BigDecimal(getValue(line,"capped_cycles"));
    currLpar.uncapped_cycles 	=   new BigDecimal(getValue(line,"uncapped_cycles"));
    currLpar.time_cycles 	=   new BigDecimal(getValue(line,"time_cycles"));
    currLpar.entitled_cycles 	=   new BigDecimal(getValue(line,"entitled_cycles"));

    if (time_stack.length == 2 &&
        prevLpar[id] != null &&
	prevLpar[id].time.getTime() == time_stack[0].getTime() &&
	prevLpar[id].name.localeCompare(name)==0 &&
        prevLpar[id].capped_cycles != undefined &&
        prevLpar[id].uncapped_cycles != undefined &&
        prevLpar[id].time_cycles != undefined &&
        currLpar.capped_cycles != undefined &&
        currLpar.uncapped_cycles != undefined &&
        currLpar.time_cycles != undefined &&
        prevLpar[id].time_cycles.gt(currLpar.time_cycles) &&
	currLpar.entitled_cycles.gt(0) ) {

      var a,b,c,d;

      a = prevLpar[id].capped_cycles.minus(currLpar.capped_cycles);
      b = prevLpar[id].time_cycles.minus(currLpar.time_cycles);
      c = prevLpar[id].uncapped_cycles.minus(currLpar.uncapped_cycles);

      d = a.plus(c).div(b);

      if (d.gt(MAXPOOL)) {
	      console.log("SKIP LPAR=" + name + " with pc="+d.toFixed(2));
	      console.log(line);
      } else
      	lpar.pc.addValue(time_stack[0], parseFloat(d.toFixed(2)));

    } else {
      //log("Just storing LPAR data: " + item.toString() + ":" + name);
      if (time_stack.length != 2 ) {
	      //log("--> time_stack.length = " + time_stack.length);
	      ;
      } else if (prevLpar[id] == null) {
	      log("LPAR " + id + " name " + name + "disappears after " + item);
      } else if (prevLpar[id].name.localeCompare(name)!=0) {
	      log("LPAR " + id + " name " + name + " becomes " + prevLpar[id].name + " after " + item);
      } else if (prevLpar[id].time.getTime() != time_stack[0].getTime()) {
	      //log("LPAR " + id + " name " + name + " in " + item + " appears later in " + prevLpar[id].time.toString());
	      ;
      } else if (!prevLpar[id].time_cycles.gt(currLpar.time_cycles)) {
	      log("LPAR " + id + " name " + name + " in " + item + " has next item with less time cycles");
      } else if (!currLpar.entitled_cycles.gt(0))
	      log("LPAR " + id + " name " + name + " in " + item + " has zero entitled_cycles");
      else
      {
	      log ("UNKNOWN! LPAR id " + id + " name " + name + " time " + item);
      }
	      
    }

    prevLpar[id] = currLpar;
  }  





  var manageProcPool = function manageProcPool(line) {
    var currPool = {};

    var item = parseDate(getValue(line,"time"));
  
    if (item == null) {
      log("Skipping line without valid date");
      log(line);
      return;
    }

    var id = parseInt(getValue(line,"shared_proc_pool_id"));
    var pool = getProcPool(id);

    // register only oldest name
    if (pool.name === undefined)
      pool.name = getValue(line,"shared_proc_pool_name");

    currPool.time = item;
    currPool.total_pool_cycles =    new BigDecimal(getValue(line,"total_pool_cycles"));
    currPool.utilized_pool_cycles = new BigDecimal(getValue(line,"utilized_pool_cycles"));
    currPool.time_cycles =    new BigDecimal(getValue(line,"time_cycles"));

    if (time_stack.length == 2 &&
        prevProcPool[id] != null &&
        prevProcPool[id].total_pool_cycles != undefined &&
        prevProcPool[id].utilized_pool_cycles != undefined &&
        prevProcPool[id].time_cycles != undefined &&
        currPool.total_pool_cycles != undefined &&
        currPool.utilized_pool_cycles != undefined &&
        currPool.time_cycles != undefined &&
        prevProcPool[id].time_cycles != undefined &&
        prevProcPool[id].time_cycles.gt(currPool.time_cycles) &&
        prevProcPool[id].utilized_pool_cycles.gt(currPool.utilized_pool_cycles)) {

      var a,b,c,d;

      a = prevProcPool[id].total_pool_cycles.minus(currPool.total_pool_cycles);
      b = prevProcPool[id].time_cycles.minus(currPool.time_cycles);
      c = prevProcPool[id].utilized_pool_cycles.minus(currPool.utilized_pool_cycles);

      d = a.div(b);
      pool.size.addValue(time_stack[0], parseFloat(d.toFixed(2)));

      d = c.div(b);
      pool.used.addValue(time_stack[0], parseFloat(d.toFixed(2)));
  
    } else {
      //log("Just storing POOL_" + id + " Data: " + item.toString() + ":" + pool.name);
      if (time_stack.length != 2) {
	      //log("--> time_stack.length = " + time_stack.length);
	      ;
      } else if (prevProcPool[id] == null) 
	      log("POOL " + id + " disappears after " + item);
      else if (!prevProcPool[id].time_cycles.gt(currPool.time_cycles)) {
	      log("POOL " + id + " time cycles reset after " + item);
      } else if (!prevProcPool[id].utilized_pool_cycles.gt(currPool.utilized_pool_cycles)) {
	      log("POOL " + id + " utilized cycles reset after " + item);
      } else {
	      log("UNKNOWN! POOL " + id + " time " + item);
      }
    }

    prevProcPool[id] = currPool;
  }



  var managePool = function managePool(line, result) {
    var currPool = {};

    var item = parseDate(getValue(line,"time"));
    if (item == null) {
      log("Skipping line without valid date");
      log(line);
      return;
    }

    if (sysPool.availunits === undefined)
      sysPool.availunits = PerfContainer(limits.start, limits.end, mySlots, 0.1);
    sysPool.availunits.addValue(item, parseFloat(getValue(line,"curr_avail_pool_proc_units")));

    currPool.time = item;
    currPool.total_pool_cycles =    new BigDecimal(getValue(line,"total_pool_cycles"));
    currPool.utilized_pool_cycles = new BigDecimal(getValue(line,"utilized_pool_cycles"));
    currPool.time_cycles =    new BigDecimal(getValue(line,"time_cycles"));

    if (time_stack.length == 2 &&
        prevPool.total_pool_cycles != undefined &&
        prevPool.utilized_pool_cycles != undefined &&
        prevPool.time_cycles != undefined &&
        currPool.total_pool_cycles != undefined &&
        currPool.utilized_pool_cycles != undefined &&
        currPool.time_cycles != undefined &&
        prevPool.time_cycles != undefined &&
        prevPool.time_cycles.gt(currPool.time_cycles) &&
        prevPool.utilized_pool_cycles.gt(currPool.utilized_pool_cycles)) {

      var a,b,c,d;

      a = prevPool.utilized_pool_cycles.minus(currPool.utilized_pool_cycles);
      b = prevPool.time_cycles.minus(currPool.time_cycles);
      c = prevPool.total_pool_cycles.minus(currPool.total_pool_cycles);

      d = a.div(b);
      if (sysPool.usedcpu === undefined)
        sysPool.usedcpu = PerfContainer(limits.start, limits.end, mySlots, 0.1);

      if (d.gt(MAXPOOL))
        console.log("SKIP system pool with usedcpu="+d.toFixed(2));
      else
      	sysPool.usedcpu.addValue(time_stack[0],parseFloat(d.toFixed(2)));

      d = c.div(b);
      if (sysPool.size === undefined)
        sysPool.size = PerfContainer(limits.start, limits.end, mySlots, 1);
      sysPool.size.addValue(time_stack[0],parseFloat(d.toFixed(2)));
    } else {
      //log("Just storing SysPool data: " + item.toString());
      ;
    }

    prevPool = currPool;
  }


  var manageSys = function manageSys(line, result) {

    var item = getValue(line,"state");
    if (item == null)
      item = getValue(line,"primary_state");
    if (item == null) {
      log("Skipping sys line with no state");
      log(line);
    }

    if ( item != "Operating" && item != "Started" )
      return;

    item = parseDate(getValue(line,"time"));
    if (item == null) {
      log("Skipping line without valid date");
      log(line);
      return;
    }


    if (system.ram === undefined)
      system.ram = PerfContainer(limits.start, limits.end, mySlots, 1);
    system.ram.addValue(item, getValue(line,"configurable_sys_mem") / 1024);

    if (system.ramfree === undefined)
      system.ramfree = PerfContainer(limits.start, limits.end, mySlots, 1);
    system.ramfree.addValue(item, getValue(line,"curr_avail_sys_mem") / 1024);
  }




  var getValue = function getValue(line, variable) {
    var pos = line.indexOf(variable);
    if (pos<0)
      return null;

    var start = pos + variable.length + 1;
    var end = line.indexOf(',',start);

    if (end<0)
      return line.substring(start);
  
    return line.substring(start,end);
  }  



  // "02/16/2016 00:00:01"
  var parseDate = function(str) {
    if ( str == null)
      return null;

    var s = str.split(/[\/ :]/);
    return new Date(Date.UTC(s[2],s[0]-1,s[1],s[3],s[4],s[5]));
  }    



  
  // Scan procPool data based on name and return the corresponding object
  var getProcPool = function getProcPool(id) {

    if (procPool[id] != undefined)
      return procPool[id];

    var l = {};
    l.size = PerfContainer(limits.start, limits.end, mySlots, 1);
    l.used = PerfContainer(limits.start, limits.end, mySlots, 0.1);
    procPool[id] = l;
    return l;
  }




  
  // Scan LPAR data based on name and return the corresponding object
  var getLpar = function getLpar(name) {
    var i;

    for (i=0; i<lparData.length; i++)
      if (lparData[i].name != undefined && lparData[i].name == name)
        return lparData[i];

    var l = {};
    l.name=name;
    l.pc = PerfContainer(limits.start, limits.end, mySlots, 0.1);
    l.ent = PerfContainer(limits.start, limits.end, mySlots, 0.1);
    l.vp = PerfContainer(limits.start, limits.end, mySlots, 1);
    lparData.push(l);
    return l;
  }












  // Get limits
  this.getLimits = function getLimits() {
    return limits;
  }


  // Scan the entire file to detect start-end dates
  this.scanLimits = function scanLimits(callback) {

    var fs = require("fs");
        var readline = require('readline');
        var stream = require('stream');
    var zlib = require('zlib');


    var instream ;
    if (this.file.endsWith(".gz")) 
      instream = fs.createReadStream(this.file).pipe(zlib.createGunzip());
    else
      instream = fs.createReadStream(this.file);


    var rl = readline.createInterface({
           input: instream,
           terminal: false
    });

  
    rl.on('line', function(line) {
        scanDate(line);
    });

    rl.on('close', function() {
      //log(this.file+" "+limits.start+" "+limits.end);
      callback();
    });

  }


  // Start parsing of file, execute manageData on each valid data
  // Use callback when done.
  this.parse = function parse(callback) {

    if (parsed) {
      callback();
      return;
    }


    /*
    if (limits.start === undefined) {
      log("Please run scanLimits first");
      return;
    }
    */

    if (limits.start == undefined) {

      // We need to scanLimits first
      var self = this;
      this.scanLimits( function() {
        parse.call(self,callback);
      });
      return;
    }


    var fs = require("fs");
        var readline = require('readline');
        var stream = require('stream');
    var zlib = require('zlib');


    var instream ;
    if (this.file.endsWith(".gz")) 
      instream = fs.createReadStream(this.file).pipe(zlib.createGunzip());
    else
      instream = fs.createReadStream(this.file);


    var rl = readline.createInterface({
           input: instream,
           terminal: false
    });
  
    rl.on('line', function(line) {
        parseLine(line);
	lines++;
	if (lines % 10000 == 0)
	    log(lines + " read");
    });

    rl.on('close', function() {
      parsed=true;
      computeSysPoolVP();
      callback();
    });
  }




  


  this.getLparObjects = function getLparObjects() {
    return lparData;
  }

  this.getProcPoolObjects = function getProcPoolObjects() {
    return procPool;
  }

  this.getSysPoolObject = function getSysPoolObject() {
    return sysPool;
  }

  this.getSystemObject = function getSystemObject() {
    return system;
  }

  this.getParsed = function getParsed() {
    return parsed;
  }

  this.getStart     = function getStart() { return new Date(limits.start.getTime()) };
  this.getEnd     = function getEnd() { return new Date(limits.end.getTime()) };
  this.getSlots     = function getSlots() { return mySlots; }; 


  this.getLparByName = function getLparByName(name) {
    var i;
    for (i=0; i<lparData.length; i++)
	    if (lparData[i].name.localeCompare(name)==0)
		    return(lparData[i]);
  }





  var computeSysPoolVP = function computeSysPoolVP() {
	  sysPool.vp = new PerfContainer(limits.start, limits.end, mySlots, 1);
	  var time = new Date(limits.start.getTime());
	  var vp;
	  var num;
	  var i,j;

	  for (i=0; i<mySlots; i++) {
	  	vp=0;
		num=0;
		lparData.forEach(function (l) {
			var s = l.vp.getSample(time);
			if (s !== undefined) {
				vp += s.getAvg();
				num++;
			}
		});
		if (num>0)
			sysPool.vp.addValue(time,vp);
		time = new Date(limits.start.getTime() + (limits.end.getTime()-limits.start.getTime())/mySlots*i);
	  }
  }








}


module.exports = LslparutilScan;
