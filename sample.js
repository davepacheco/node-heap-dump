/*
 * sample.js: sample program that takes a heap snapshot and sends it to stdout
 */

var pmd = require('pmd');

/* We put this particular object in the heap to try to find it in the dump. */
var stuff = {
	somekey: 'someval',
	someotherkey: 15,
	whoa: {
		hello: [ 'compost', 'mortem' ]
	}
};

pmd.takeSnapshot();
