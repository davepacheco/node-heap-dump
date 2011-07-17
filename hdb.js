/*
 * hdb.js: uses heap-dump to read in a heap dump and analyze it
 */

var mod_heap = require('./heap-dump');

var subcmds = {
    text: dbgText,
    html: dbgHtml,
    explore: dbgExplore
};

function main(argv)
{

	if (argv.length != 2 || !(argv[1] in subcmds)) {
		console.error('usage: node hdb.js heapfile command');
		console.error('   subcommands: text, html, or explore');
		process.exit(1);
	}

	mod_heap.readFile(argv[0], function (err, dump) {
		if (err)
			throw (err);

		subcmds[argv[1]](dump);
	});
}

function dbgText(dump)
{
	dump.dbgdumpText(process.stdout);
	process.stdout.end();
}

function dbgHtml(dump)
{
	dump.dbgdumpHtml(process.stdout);
	process.stdout.end();
}

function dbgExplore(dump)
{
	dump.dbgexplore(process.stdout);
}

main(process.argv.slice(2));
