var StatManager = require("./statManager.js");

function PerfContainer(start, end, slots, step) {
	if (! (this instanceof PerfContainer) ) {
		return new PerfContainer(start, end, slots, step);
	}


	var myStart;			// Date: first time slot, set to midnight
	var myEnd;			// Date: last time slot, set to 23:59
	var mySlots;			// number of data slots where data is split
	var slotMS;			// milliseconds in a slot (computed)

	var myStep;			// Performance step for StatManager

	var stats;			// StatManager: statistics of this data set
	var sample = [];		// StatManager: collected data slots. Array of up to mySlots
	var month = [];			// StatManager: statistics by month. 0-12, 0 = January
	var week = [];			// StatManager: statistics by week. 0-7, 0 = Sunday
	var hour = [];			// StatManager: statistics by hour. 0-23

	var monthEnabled = true;	// enable month var
	var weekEnabled = true;	// enable week var
	var hourEnabled = true;	// enable hour var



	myStart = new Date(Date.UTC(
			start.getFullYear(),	// year
			start.getMonth(),	// month
			start.getDate(),	// day
			0,			// midnight!
			0,
			0) );

	if (slots === undefined)
		mySlots = 500;	// default is 500 slots
	else
		mySlots = slots;

	if (end === undefined)
		myEnd = new Date(myStart.getTime() + 365 * 24 * 3600 * 1000 + (23 * 3600 + 59 * 60) * 1000 ) ;	// 1 year ahead
	else {
		myEnd = new Date(Date.UTC(
			end.getFullYear(),	// year
			end.getMonth(),		// month
			end.getDate(),		// day
			23,			// end of day!!!
			59,
			0) );
	}

	// Milliseconds in a slot
	slotMS = Math.trunc( (myEnd.getTime() - myStart.getTime()) / mySlots);




	if (step === undefined)
		myStep = 0.1;
	else
		myStep = step;


	this.getStart = 	function getStart()	 	{ return new Date(myStart.getTime()); };
	this.getEnd =		function getEnd() 		{ return new Date(myEnd.getTime()); };
	this.getSlots =		function getSlots() 		{ return slots; };
	this.getStep =		function getStep() 		{ return step; };

	this.enableMonth = 	function enableMonth(v)		{ monthEnabled = v; };
	this.enableWeek = 	function enableWeek(v)		{ weekEnabled = v; };
	this.enableHour = 	function enableHour(v)		{ hourEnabled = v; };

	this.isMonthEnabled = 	function isMonthEnabled()	{ return monthEnabled; };
	this.isWeekEnabled =	function isWeekEnabled()	{ return weekEnabled; };
	this.isHourEnabled = 	function isHourEnabled()	{ return hourEnabled; };


	// Get the sample from the provided date. Result is a StatManager object
	this.getSample =	function getSample(date) 	{ var s = getSampleID(date); if (s != undefined) return sample[s]; };

	// Get the stats related to a specific month. Result is a StatManager object
	this.getMonth = 	function getMonth(n)		{ if ( monthEnabled && n>=0 && n<12 ) return month[n]; };

	// Get the stats related to a specific week day. Result is a StatManager object
	this.getWeek = 		function getWeek(n)		{ if ( weekEnabled && n>=0 && n<7 ) return week[n]; };

	// Get the stats related to a specific hour. Result is a StatManager object
	this.getHour = 		function getHour(n)		{ if ( hourEnabled && n>=0 && n<23 ) return hour[n]; };

	// Get the stats related to the entire data set
	this.getStats = 	function getStats()		{ return stats; };




	// Return the sample ID related to the provided date
	var getSampleID = function getSampleID(date) {
		if ( ! date instanceof Date )
			return;

		if ( date.getTime() < myStart.getTime() || date.getTime() > myEnd.getTime() )
			return;

		return Math.trunc( (date.getTime() - myStart.getTime()) / slotMS );
	}


	// Set the provided value at specific data overwriting existing data
	// No statistics are updated.
	this.setValue = function setValue(date,value) {
		if (value === undefined)
			return;

		var id;

		// Set data at sample value
		id = getSampleID(date);
		if ( id === undefined )
			return;


		if (sample[id] === undefined)
			sample[id] = StatManager(myStep);
		sample[id].setNumber(value);

	}

	// Add a value on a specific date
	// The data is added on all internal values
	this.addValue = function addValue(date, value) {
		if (value === undefined)
			return;

		var id;

		// Add data at sample value
		id = getSampleID(date);
		if ( id === undefined )
			return;


		if (sample[id] === undefined)
			sample[id] = StatManager(myStep);
		sample[id].addNumber(value);

		// Update statistics
		if (stats === undefined)
			stats = StatManager(myStep);
		stats.addNumber(value);

		// Add data at month level
		if (monthEnabled) {
			id = date.getMonth();
			if (month[id] === undefined)
				month[id] = StatManager(myStep);
			month[id].addNumber(value);
		}

		// Add data at week level
		if (weekEnabled) {
			id = date.getDay();
			if (week[id] === undefined)
				week[id] = StatManager(myStep);
			week[id].addNumber(value);
		}

		// Add data at hour level
		if (hourEnabled) {
			id = date.getHours();
			if (hour[id] === undefined)
				hour[id] = StatManager(myStep);
			hour[id].addNumber(value);
		}
	}


	// Add the data from another container.
	// Only samples will be added, limited to the time period of this object
	this.addContainer = function addContainer(c) {
		if ( ( c === undefined) || ! (c instanceof PerfContainer) )
			return;

		monthEnabled = false;
		weekEnabled = false;
		hourEnabled = false;
		month = [];
		week = [];
		hour = [];

		var day ;
		var i;
		var v;

		for (i=0; i<mySlots; i++) {
			day = new Date(start.getTime() + i * slotMS) ;
			v = c.getSample(day);
			if (v === undefined || v.getAvg() === undefined)
				continue;
			if (sample[i] === undefined) {
				sample[i] = StatManager(myStep);
				sample[i].setNumber(v.getAvg());
			} else 
				sample[i].setNumber(sample[i].getAvg() + v.getAvg());
		}


	}

}



module.exports = PerfContainer;

