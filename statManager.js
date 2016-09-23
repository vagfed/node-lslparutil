

function StatManager(thisStep) {
	if (! (this instanceof StatManager) ) {
		return new StatManager(thisStep);
	}
	var step 		= thisStep;		// step for distribution calculation
	var counter 		= [];			// count entried for each step
	var maxValue 		= 0;			// no negative numbers !
	var minValue 		= Number.MAX_VALUE;
	var numValues 		= 0;			// number of values added
	var sumValues 		= 0;			// aggregate values


	// Add a number to this set for statistics
	this.addNumber = function addNumber(n) {
		if (n>maxValue)
			maxValue = n;
		if (n<minValue)
			minValue = n;
		numValues++;
		sumValues += n;
	
		var blockId = Math.trunc(n / step);
		if (counter[blockId] === undefined)
			counter[blockId]=1;
		else
			counter[blockId]++;		
	}

	// Set the number to a given value, resetting statistics
	this.setNumber = function setNumber(n) {
		maxValue = n;
		minValue = n;
		numValues = 1;
		sumValues = n;
		counter = [];
	}



	this.getMax 		= function getMax() { if (numValues > 0) return maxValue; }
	this.getMin 		= function getMax() { if (numValues > 0) return minValue; }
	this.getAvg 		= function getAvg() { if (numValues > 0) return sumValues/numValues; }


	// level is the desired percentage (e.g 0.90 for 90%)
	this.getLevel = function getLevel(level) {

		if (numValues==0)
			return 0;
		
		var target = numValues * level;
		var num = 0;
		var i;
		
		for (i=0; i<counter.length; i++) 
			if (counter[i] != undefined) {
				num += counter[i];
				if (num >= target) {
					result = step * (i+1);
					if (result > maxValue)
						result = maxValue;
					return result;
				}
			}

		console.log("StatManager This should never happen....");
		console.log("-> step="+step);
		console.log("-> level="+level);
		console.log("-> numValues="+numValues);
		console.log("-> num="+num);
		console.log(JSON.stringify(counter));
	}
}


module.exports = StatManager;
