
var LslparutilScan = require("./lslparutilScan.js");
var PerfContainer = require("./perfContainer.js");
var StatManager = require("./statManager.js")




function Vodafone(dir,slots,cb) {
	if (! (this instanceof Vodafone) ) {
		return new Vodafone(dir);
	}

	var ms = [];		// managed system performance: array of LslparUtilScan
	var clusterLoad = [];	// clusterLoad[system][failed]: array of PerfContainer representing load added to system due to failed	
	var extCallback = cb;
	
	
	
	this.dir = dir;
	
	if (slots === undefined)
		this.slots = 500;
	else
		this.slots = slots;








	this.getClusterLoad = function getClusterLoad() { return clusterLoad; }
	this.getMS = function getMS() { return ms; }




	var loadManagedSystems = function loadManagedSystems(dir, slots, callback) {
		var filesystem = require("fs");
    		var results = [];
		var runningScans=0;

    		filesystem.readdirSync(dir).forEach(function(file) {

        		file = dir+'/'+file;
	        	var stat = filesystem.statSync(file);

        		if (stat && !stat.isDirectory()) 
        			results.push(file);

	    	});

		results.forEach(function(e) {
			var scanner = new LslparutilScan(e,slots);
			ms.push(scanner);
			runningScans++;
			console.log("Start: " + e);
			scanner.parse(function() {
					runningScans--;
					console.log("#scanning = " + runningScans);
					if (runningScans==0)
					 callback();
				});
		});
	}



	// Identify the load that is added to a system when another fails
	var computeClusterLoad = function computeClusterLoad() {

		console.log("Starting to compute cluster load");

		var prefixes = getClusterPrefixes();
		if (prefixes === undefined) {
			console.log("No cluster identified");
			if (extCallback !== undefined) {
				console.log("Calling external callback");
				extCallback();
			}
			return;
		}

		var failed;
		var lpar;
		var i,j;
		for (failed=0; failed<ms.length; failed++) {
			console.log("Simulating failure of system #" + failed + ": " + ms[failed].file);
			lpar = ms[failed].getLparObjects();
			if (lpar === undefined) {
				console.log("No LPARs in " + ms[failed].file);
				continue;
			}
			for (i=0; i<lpar.length; i++)
				if (isClustered(lpar[i].name, prefixes))
					addClusterLoad(lpar[i],failed);
				//else
				//	console.log("LPAR " + lpar[i].name + " on " + ms[failed].file + " is not clustered");
		}


		// Add system load to cluster load
		console.log("Adding pool load to each cluster load");
		for (i=0; i<ms.length; i++)
			for (j=0; clusterLoad[i] !== undefined && j<clusterLoad[i].length; j++)
				if (clusterLoad[i][j] !== undefined)
					clusterLoad[i][j].addContainer(ms[i].getSysPoolObject().usedcpu);

		if (extCallback !== undefined) {
			console.log("Calling external callback");
			extCallback();
		}
	}


	// Add the load of a given lpar to all systems that have the clustered lpar
	var addClusterLoad = function addClusterLoad(lpar, failed) {
		var i;
		var clusterName;
		var cLpar;

		//console.log("LPAR " + lpar.name + " failed on system " + ms[failed].file);

		if (lpar.name.endsWith("aia"))
			clusterName = lpar.name.substring(0,lpar.name.length-3) + "bia";
		else
			clusterName = lpar.name.substring(0,lpar.name.length-3) + "aia";

		for (i=0; i<ms.length; i++) {
			if (i==failed)
				continue;
			cLpar = ms[i].getLparByName(clusterName);
			if (cLpar === undefined) {
				//console.log("There is no " + clusterName + " on " + ms[i].file);
				continue;
			 }
			addLoad(i,failed,lpar,cLpar);
		}

	}



	// Add the load of the cluster to a system
	var addLoad = function addLoad(id,failed,src,dst) {
		if (clusterLoad[id] === undefined) 
			clusterLoad[id] = [];

		if (clusterLoad[id][failed] === undefined)
			clusterLoad[id][failed] = new PerfContainer(ms[id].getStart(),ms[id].getEnd(),ms[id].getSlots(),1);

		var time = ms[id].getStart();
		var delta = Math.trunc((ms[id].getEnd().getTime()-ms[id].getStart().getTime())/ms[id].getSlots());
		var s,d,t,v;
		var currValue;
		var added = false;

		while (time.getTime() < ms[id].getEnd().getTime()) {
			s = src.pc.getSample(time);
			d = dst.pc.getSample(time);
			if ( s !== undefined && d !== undefined && s.getAvg()!== undefined && d.getAvg()!==undefined) {
				t = clusterLoad[id][failed].getSample(time);
				if (t === undefined)
					currValue = 0;
				else {
					currValue = t.getAvg();
					if (currValue === undefined)
						currValue = 0;
				}
				v = currValue + s.getAvg();
				if (v>0)
					clusterLoad[id][failed].setValue(time,v);
				added = true;
			}
			time = new Date(time.getTime() + delta);
			//console.log(time);
		}
		/*
		if (added)
			console.log("Added data on " + id + " due to failure on " + ms[failed].file + " : src=" + src.name + " dst=" + dst.name);
		else
			console.log("NO data on " + id + " due to failure on " + ms[failed].file + " : src=" + src.name + " dst=" + dst.name);
		*/
	}



	// Check if the given name is in a cluster
	var isClustered = function isClustered(name, list) {
		var n=0;
		var v;
		var s = name.substring(0,name.length-3);

		while (n<list.length) {
		       v=s.localeCompare(list[n]);
		       if (v==0) {
			       //console.log(name + " is in " + list.toString());
			       return true;
			}
		       if (v<0) {
			       //console.log(name + " is NOT in " + list.toString() + " > " + s + ":" + list[n]);
			       return false;
			}
		       n++;
		}
	        //console.log(name + " is *NOT* in " + list.toString());
		return false;
	}



	// return an array of LPAR prefixes that are in aia-bia cluster withour a cia
	var getClusterPrefixes = function getClusterPrefixes() {

		// get all lpar objects
		var all = [];
		ms.forEach(function(scanner) {
			scanner.getLparObjects().forEach(function(lpar) {
				all.push(lpar.name);
			});
		});

		// sort the array
		all.sort(function(a,b){
			return a.localeCompare(b);
		});

		// remove duplicates
		//console.log("====== BEFORE ======");
		//console.log(all.toString());
		var i = 0;
		while (i<all.length) {
			if (i+1 < all.length && all[i].localeCompare(all[i+1])==0) {
				all.splice(i+1,1);
			} else
				i++;
		}
		//console.log("====== AFTER ======");
		//console.log(all.toString());



		var result = [];
		all.forEach(function(name,i,array) {

				// Skip everyting that is not "bia"
				if (!name.endsWith("bia"))
					return;

				
				var prefix = name.substring(0,name.length-3);
				if (i>0 && array[i-1].localeCompare(prefix+"aia")==0) {
					// We have a aia-bia couple: check if there is cia
					if (i+1<array.length && array[i+1].localeCompare(prefix+"cia")==0)
						return; // we have aia-bia-cia, skip it
					// There is no cia!
					result.push(prefix);
				}
		});

		//console.log("====== CLUSTER  ======");
		//console.log(result.toString());

		if (result.length == 0)
			return;
		return result;
	}



	loadManagedSystems(dir,slots,computeClusterLoad);

}








module.exports = Vodafone;
