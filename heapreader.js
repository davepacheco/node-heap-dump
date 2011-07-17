/*
 * heapreader.js: uses heap-dump to read in a heap dump and print out a summary.
 * XXX what's name_or_index?
 */

var mod_heap = require('./heap-dump');

function main(argv)
{
	if (argv.length != 1) {
		console.error('usage: node heapreader.js heapfile');
		process.exit(1);
	}

	mod_heap.readFile(argv[0], function (err, dump) {
		if (err)
			throw (err);

		dump.dbgdump(process.stdout);
	});
}

main(process.argv.slice(2));
