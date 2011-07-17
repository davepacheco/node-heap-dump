/*
 * heapexplorer.js: uses heap-dump to read in a heap dump and explore it
 */

var mod_heap = require('./heap-dump');

function main(argv)
{
	if (argv.length != 1) {
		console.error('usage: node heapexplorer.js heapfile');
		process.exit(1);
	}

	mod_heap.readFile(argv[0], function (err, dump) {
		if (err)
			throw (err);

		dump.explore();
	});
}

main(process.argv.slice(2));
