/*
 * heap-dump.js: parses serialized JSON representation of a V8 snapshot
 */

var mod_assert = require('assert');
var mod_fs = require('fs');
var mod_sys = require('sys');
var sprintf = require('sprintf').sprintf;

/*
 * Parses the serialized JSON representation of a V8 snapshot.  Note that the
 * serialized form is relatively compressed, so the resulting parsed
 * representation will take substantially more memory.
 */
function HeapDump(contents)
{
	this.load(contents);
}

HeapDump.prototype.load = function (contents)
{
	var last;

	this.hd_snapname = contents['snapshot']['title'];
	this.hd_snapid = contents['snapshot']['uid'];
	this.hd_fields = contents['nodes'][0]['fields'];
	this.hd_field_types = contents['nodes'][0]['types'];
	this.hd_type_types = this.hd_field_types[0]; /* XXX */
	this.hd_strings = contents['strings'];
	this.hd_nodes = contents['nodes'];
	this.hd_nodeidx = 1;
	this.hd_graph = {};
	this.hd_nnodes = 0;

	console.error('will read %s entries', this.hd_nodes.length - 1);

	while (this.hd_nodeidx < this.hd_nodes.length) {
		this.readNode();

		if (last === undefined || this.hd_nodeidx - last >= 5000) {
			last = this.hd_nodeidx;
			process.stderr.write(
			    sprintf('read %s entries\r', this.hd_nodeidx));
		}
	}

	console.error('read %s entries (done)', this.hd_nodeidx);
	console.error('read %s nodes', this.hd_nnodes);
	mod_assert.equal(this.hd_nodeidx, this.hd_nodes.length);
};

HeapDump.prototype.readNode = function ()
{
	var node;

	node = {};

	for (ii = 0; ii < this.hd_fields.length; ii++)
		node[this.hd_fields[ii]] = this.readRawField(node,
		    this.hd_fields[ii], this.hd_field_types[ii]);

	this.hd_graph[node['id']] = node;
	this.hd_nnodes++;
};

HeapDump.prototype.readRawField = function (obj, fieldname, type)
{
	var rawval, value, ii;

	if (fieldname == 'children') {
		mod_assert.ok('children_count' in obj);
		mod_assert.ok(typeof (obj['children_count']) == 'number');

		value = [];
		
		for (ii = 0; ii < obj['children_count']; ii++) {
			rawval = this.readRawField({}, 'child', type);
			value.push(rawval);
		}

		return (value);
	}

	if (type == 'number') {
		value = this.hd_nodes[this.hd_nodeidx++];
		mod_assert.ok(typeof (value) == 'number');
		return (value);
	}

	if (type == 'string') {
		rawval = this.hd_nodes[this.hd_nodeidx++];
		mod_assert.ok(typeof (rawval) == 'number');
		mod_assert.ok(rawval >= 0);
		mod_assert.ok(rawval < this.hd_strings.length);
		value = this.hd_strings[rawval];
		return (value);
	}

	if (type == 'string_or_number' || type == 'node') {
		value = this.hd_nodes[this.hd_nodeidx++];
		/* XXX how do we know which it is? */
		return (value);
	}

	if (Array.isArray(type)) {
		rawval = this.hd_nodes[this.hd_nodeidx++];
		mod_assert.ok(typeof (rawval) == 'number');
		mod_assert.ok(rawval >= 0);
		mod_assert.ok(rawval < type.length);
		value = type[rawval];
		return (value);
	}

	mod_assert.ok('fields' in type);
	mod_assert.ok('types' in type);

	value = {};

	for (ii = 0; ii < type['fields'].length; ii++)
		value[type['fields'][ii]] = this.readRawField(
		    value, type['fields'][ii], type['types'][ii]);

	return (value);
};

/* dumps out a summary of the whole graph. */
HeapDump.prototype.dbgdump = function (out)
{
	var id, node;

	console.error('saving summary ... ');

	for (id in this.hd_graph) {
		node = this.hd_graph[id];
		out.write(sprintf('NODE %s: %s\n', id, mod_sys.inspect(node)));
	}

	console.error('done');
}

exports.readFile = function (filename, callback)
{
	mod_fs.readFile(filename, function (err, contents) {
		var json, dump;

		if (err)
			return (callback(err));

		try {
			json = JSON.parse(contents);
			dump = new HeapDump(json);
		} catch (ex) {
			return (callback(ex));
		}

		return (callback(null, dump));
	});
}
