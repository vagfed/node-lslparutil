var express = require('express');
var bodyParser = require('body-parser');

var app = express();
app.use( bodyParser.json() );		// support of JSON-encoded bodies
app.use( bodyParser.urlencoded());	// support of URL-encoded bodies


var VS = require("./vodafone-simulation.js");


var dir = "data";				// CHANGE THIS !!!!
var ready = false;				// when true, data is ready
var simSlots = 500;



// Callback when simulation has finished
function scanIsFinished() {
	setManagedSystemNames();
	console.log("Simulation is ended");
	ready = true;
}



function getLparNames(server) {
	var ms = simulation.getMS();
	var result = [];
	ms.forEach(function(e) {
		if (e.name.localeCompare(server) == 0) {
			var lpars = e.getLparObjects();
			lpars.forEach(function(l) {
				result.push(l.name);
			});
		}
	});
	return result;
}

function setManagedSystemNames() {
	var ms = simulation.getMS();
	var result = [];
	ms.forEach(function(e) {
		var start = e.file.lastIndexOf('/');
		start++;
		var end = e.file.indexOf("_lslparutil");
		if (end == -1)
			e.name = e.file.substring(start);
		else
			e.name = e.file.substring(start,end);
	});
}


function getManagedSystemNames() {
	var ms = simulation.getMS();
	var result = [];
	ms.forEach(function(e) {
		result.push(e.name);
	});
	return result;
}



function getSysUsageJSON(id) {
	var ms = simulation.getMS()[id];
	return produceJSON(ms.getSysPoolObject().usedcpu);
}

function getSysVPJSON(id) {
	var ms = simulation.getMS()[id];
	return produceJSON(ms.getSysPoolObject().vp);
}


function getClusterLoadJSON(sys,failed) {
	var cl = simulation.getClusterLoad();
	return produceJSON(cl[sys][failed]);
}


function produceJSONfunc(obj, func) {

	if ( obj === undefined )
		return {};

	if ( obj.getStart === undefined || 
			obj.getEnd === undefined ||
			obj.getSlots === undefined ||
			obj.getSample === undefined)
		return {};

	var result = [];
	var value;

	var start = obj.getStart();
	var end = obj.getEnd();
	var slots = obj.getSlots();
	var step = (end.getTime() - start.getTime())/slots;

	var day = new Date(start.getTime());

	while (day.getTime() < end.getTime()) {
		value = obj.getSample(day);
		if (value != undefined)
			result.push( { 'x' : day , 'y' : func(value) } );
		day = new Date (day.getTime() + step );
	}

	return result;
}


function produceJSONhour(obj) {


	if ( obj === undefined )
		return {};

	var result = [];
	var i;
	var v;

	for (i=0; i<24; i++) {
		v = obj.getHour(i);
		if (v !== undefined)
			result.push( { 'x' : new Date(i*60000), 'y' : v.getAvg() } );
		else
			result.push( { 'x' : new Date(i*60000), 'y' : "NAN" } );
	}

	console.log(JSON.stringify(result));

	return result;
}






function produceJSON(obj) {

	if ( obj === undefined )
		return {};

	if ( obj.getStart === undefined || 
			obj.getEnd === undefined ||
			obj.getSlots === undefined ||
			obj.getSample === undefined)
		return {};

	var result = [];
	var value;

	var start = obj.getStart();
	var end = obj.getEnd();
	var slots = obj.getSlots();
	var step = (end.getTime() - start.getTime())/slots;

	var day = new Date(start.getTime());

	while (day.getTime() < end.getTime()) {
		value = obj.getSample(day);
		if (value != undefined)
			result.push( { 'x' : day , 'y' : value.getAvg() } );
		day = new Date (day.getTime() + step );
	}

	return result;
}



function getClusterData(base,failed) {
	var i;
	var base_id = -1;
	var failed_id = -1;
	var ms = simulation.getMS();

	ms.forEach(function(e,n) {
		if (e.name.localeCompare(base)==0)
			base_id = n;
		if (e.name.localeCompare(failed)==0)
			failed_id = n;
	});

	if (base_id<0 || failed_id<0) {
		console.log("Invalid data in getClusterData: " + base + " " + failed);
		return;
	}

	console.log(base + " has id=" + base_id);
	console.log(failed + " has id=" + failed_id);
	
	var cd = simulation.getClusterLoad();
	if (cd === undefined)
		return;
	if (cd[base_id] === undefined || cd[base_id][failed_id] === undefined)
		return;
	return cd[base_id][failed_id];
}







console.log("Starting simulation");
var simulation = new VS(dir,simSlots,scanIsFinished);


app.post('/hmc', function (req, res) {

	console.log(req.body);

	if (! ready) {
		console.log("Not ready yet!");
		return;
	}

	var result;
	if (req.body.base !== undefined && req.body.failed !== undefined) {
		result = produceJSON(getClusterData(req.body.base, req.body.failed));
	}

	//result = produceJSON(getSumPC(req.body));
	res.json(result);

});


app.get('/hmc', function (req, res) {


	console.log(req.query);

	if (! ready) {
		console.log("Not ready yet!");
		return;
	}

	var  list;

	
	// system name list: /hmc?serverlist
	if (req.query.serverlist != undefined) {
		list = getManagedSystemNames();	
		res.json(list);
		return;
	}

	// lpar names for a given server: /hmc?lparlist=<server>
	if (req.query.lparlist != undefined) {
		list = getLparNames(req.query.lparlist);
		res.json(list);
		return;
	}

	if (req.query.getmspool != undefined) {
		var ms = simulation.getMS();
		var i;
		for (i=0; i<ms.length; i++)
			if (ms[i].name.localeCompare(req.query.getmspool)==0)
				res.json(produceJSON(ms[i].getSysPoolObject().usedcpu));
		return;
	}

	if (req.query.getmspoolhour != undefined) {
		var ms = simulation.getMS();
		var i;
		for (i=0; i<ms.length; i++)
			if (ms[i].name.localeCompare(req.query.getmspoolhour)==0)
				res.json(produceJSONhour(ms[i].getSysPoolObject().usedcpu));
		return;
	}

	if (req.query.getmsvp != undefined) {
		var ms = simulation.getMS();
		var i;
		for (i=0; i<ms.length; i++)
			if (ms[i].name.localeCompare(req.query.getmsvp)==0)
				res.json(produceJSON(ms[i].getSysPoolObject().vp));
		return;
	}


/*

	if (req.query.getmsname != undefined) {
		var ms = vodafone.getMS();
		if (req.query.getmsname >= ms.length)
			return;
		res.json(ms[req.query.getmsname].file);
		return;
	}

	if (req.query.getmspool != undefined) {
		var ms = vodafone.getMS();
		if (req.query.getmspool >= ms.length)
			return;
		res.json(produceJSON(ms[req.query.getmspool].getSysPoolObject().usedcpu));
		return;
	}

	if (req.query.getbase != undefined && req.query.getfailed != undefined) {
		var ms = vodafone.getMS();
		var load = vodafone.getClusterLoad();

		if (req.query.getbase >= ms.length || req.query.getfailed >= load.length)
			return;

		console.log("sending ...");
		res.json(produceJSON(load[req.query.getfailed][req.query.getbase]));
		return;
	}
*/

});


app.get('/html', function (req,res) {
	res.sendfile('vodafone-simulation.html');
});


app.set('json spaces', 2);		// remove me
//app.use(express.static(path.join(__dirname, 'html')));
app.use(express.static(__dirname));
app.listen(3000);


// ================================ END
// 




/*



function finished(req, res) {

	var i;
	var lparName = req.query.lpar;
	var lparData = scanner1.getLparObjects();

	console.log(req.query);

	if (lparName != undefined) {
		for (i=0; i<lparData.length; i++)
			if (lparData[i].name == lparName)
				break;

		if (i<lparData.length)
			res.json(produceJSON(lparData[i].pc));
		return;
	}

	if (req.query.getlist != undefined && req.query.getlist == "full") {
		var result = [];
		for (i=0; i<lparData.length; i++)
			if (lparData[i].name != undefined)
				result.push(lparData[i].name);
		res.json(result);
		return;
	}

	if (req.query.syspool != undefined ) {
		var result = scanner1.getSysPoolObject();
		res.json(produceJSON((result.usedcpu)));
		return;
	}
}


function produceJSON(item) {
	var i;

	var result = [];
	var value;



	//console.log("DAYLY DATA");

	var day = new Date(start.getTime());
	for (i=0; i<2160; i++) {
		value = item.getAvgSlot(day);
		if ( value != undefined) {
			//result.push( { 'x' : day.getFullYear() + "-" + (day.getMonth()+1) + "-" + day.getDate(), 'y' : value } );
			result.push( { 'x' : day, 'y' : value } );
		}
		//day.setTime(day.getTime() + 24*3600*1000);
		day = new Date(day.getTime() + 3600*1000);
	}

	//console.log(result.length);
	return result;
}

function showItem(item) {
	var i;


	console.log("DAYLY DATA");

	day = new Date(2016,0,1);
	for (i=0; i<365; i++) {
		console.log(day.getFullYear() + "/" + (day.getMonth()+1) + "/" + day.getDate() + " " +
				item.getMinDay(day) + " " +
				item.getAvgDay(day) + " " +
				item.getMaxDay(day) + " " +
				item.getLevelDay(day,.9) 
			);
		day.setTime(day.getTime() + 24*3600*1000);
	}

	console.log("MONTHLY DATA");

	for (i=0; i<12; i++) {
		console.log(	i + " " +
				item.getMinMonth(i) + " " +
				item.getAvgMonth(i) + " " +
				item.getMaxMonth(i) + " " +
				item.getLevelMonth(i,.9) 
			);
	}

	console.log("WEEKLY DATA");

	for (i=0; i<7; i++) {
		console.log(	i + " " +
				item.getMinWeek(i) + " " +
				item.getAvgWeek(i) + " " +
				item.getMaxWeek(i) + " " +
				item.getLevelWeek(i,.9) 
			);
	}


	console.log("HOURLY DATA");

	for (i=0; i<24; i++) {
		console.log(	i + " " +
				item.getMinHour(i) + " " +
				item.getAvgHour(i) + " " +
				item.getMaxHour(i) + " " +
				item.getLevelHour(i,.9) 
			);
	}
}


//scanner1.parse(manageData,finished);



app.get('/hmc', function (req, res) {


	
	console.log(req.query);


	if (req.query.getmsname != undefined) {
		var ms = vodafone.getMS();
		if (req.query.getmsname >= ms.length)
			return;
		res.json(ms[req.query.getmsname].file);
		return;
	}

	if (req.query.getmspool != undefined) {
		var ms = vodafone.getMS();
		if (req.query.getmspool >= ms.length)
			return;
		res.json(produceJSON(ms[req.query.getmspool].getSysPoolObject().usedcpu));
		return;
	}

	if (req.query.getbase != undefined && req.query.getfailed != undefined) {
		var ms = vodafone.getMS();
		var load = vodafone.getClusterLoad();

		if (req.query.getbase >= ms.length || req.query.getfailed >= load.length)
			return;

		console.log("sending ...");
		res.json(produceJSON(load[req.query.getfailed][req.query.getbase]));
		return;
	}

});

app.get('/html', function (req,res) {
	res.sendfile('vodafone.html');
});


app.set('json spaces', 2);		// remove me
//app.use(express.static(path.join(__dirname, 'html')));
app.use(express.static(__dirname));
app.listen(3000);

*/
