/*
 * heap-dump.js: parses serialized JSON representation of a V8 snapshot
 */

var mod_assert = require('assert');
var mod_fs = require('fs');
var mod_repl = require('repl');
var mod_sys = require('sys');

var sprintf = require('sprintf').sprintf;
mod_repl.writer = function (obj) { return (mod_sys.inspect(obj, false, 5, true)); };

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

	console.error('will read %s entries', this.hd_nodes.length);

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
	node['index'] = this.hd_nodeidx;

	for (ii = 0; ii < this.hd_fields.length; ii++)
		node[this.hd_fields[ii]] = this.readRawField(node,
		    this.hd_fields[ii], this.hd_field_types[ii]);

	this.hd_graph[node['index']] = node;
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

	/*
	 * The actual type of the "name_or_index" field depends on the "type" of
	 * the object we're reading.
	 */
	if (fieldname == 'name_or_index') {
		mod_assert.equal(type, 'string_or_number');

		if (obj['type'] == 'element' || obj['type'] == 'hidden')
			type = 'number';
		else
			type = 'string';
	}

	mod_assert.notEqual(type, 'string_or_number');

	if (type == 'number' || type == 'node') {
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
HeapDump.prototype.dbgdumpText = function (out)
{
	var id, node;

	console.error('saving text summary ... ');

	for (id in this.hd_graph) {
		node = this.hd_graph[id];
		out.write(sprintf('NODE %s (%s): %s\n', node['id'],
		    node['index'], mod_sys.inspect(node)));
	}

	console.error('done');
}

HeapDump.prototype.dbgdumpHtml = function (out)
{
	var id, node, prop, indent, text;

	console.error('saving HTML summary ... ');

	indent = '&nbsp;&nbsp;&nbsp;&nbsp;';
	out.write('<div style="font-family: monospace;">\n');

	for (id in this.hd_graph) {
		node = this.hd_graph[id];
		text = sprintf('<a name="node%s">NODE %s</a><br />\n',
		    node['index'], node['index']);
		for (prop in node) {
			if (prop == 'children')
				continue;

			text += sprintf('%s%s: %s<br />\n', indent, prop,
			    node[prop]);
		}

		text += sprintf('%schildren: [<br />\n', indent);
		node['children'].forEach(function (child) {
			text += sprintf('%s%s{ type: "%s", ' +
			    'name_or_index: "%s", to_node: "', indent, indent,
			    child['type'], child['name_or_index']);
			text += sprintf('<a href="#node%s">%s</a>" }<br />\n',
			    child['to_node'], child['to_node']);
		});

		text += sprintf('%s]<br />\n', indent);
		out.write(text);
	}

	out.write('</div>');

	console.error('done');
}

HeapDump.prototype.dbgexplore = function (out)
{
	var heap = this;
	var repl = mod_repl.start();
	var nodef;

	heap.computeDepths(this.hd_graph[1], 0);

	repl.context['pnode'] = function (num) {
		var node = heap.hd_graph[num];
		console.log([
			'NODE %s:',
			'    type: %s',
			'    name: %s',
			'    children: %s'
		    ].join('\n'), num, node['type'], node['name'],
		    mod_sys.inspect(node['children']));
	};

	repl.context['node'] = nodef = function (num) {
		var node = heap.hd_graph[num];
		return ({
		    index: node['index'],
		    type: node['type'],
		    name: node['name'],
		    depth: node['depth'],
		    children: node['children']
		});
	};

	repl.context['parents'] = function (num) {
		return (heap.hd_graph[num]['parents']);
	};

	repl.context['children'] = function (num) {
		var node = heap.hd_graph[num];
		return (node['children']);
	};

	repl.context['findstr'] = function (str) {
		var id, node;

		for (id in heap.hd_graph) {
			node = heap.hd_graph[id];
			if (node['type'] == 'string' && node['name'] == str)
				return (nodef(node['index']));
		}

		return (undefined);
	};

	repl.context['findrefs'] = function (id) {
		var id, node, rv, ii;

		rv = [];

		for (nid in heap.hd_graph) {
			node = heap.hd_graph[nid];
			node['children'].forEach(function (edge) {
				if (edge['to_node'] != id)
					return;

				rv.push({
					node: nid,
					node_nchildren: node['children_count'],
					node_name: node['name'],
					type: edge['type'],
					name_or_index: edge['name_or_index'],
					to_node: edge['to_node'],
				});
			});
		}

		return (rv);
	};

	repl.context['tree'] = function (nodeid, depth) {
		if (depth === undefined)
			depth = 3;

		if (nodeid === undefined)
			nodeid = 1;

		heap.dumpTree('', nodeid, out, depth, 0);
	};

	repl.context['dump'] = function (depth) {
		var rootcld;

		if (depth === undefined)
			depth = 2;

		rootcld = heap.hd_graph[1]['children'].map(function (elt) {
			return (elt['to_node']);
		});

		out.write('Global scope 1\n');
		heap.dumpTree('', rootcld[0], out, depth, 0);
		out.write('\nGlobal scope 2\n');
		heap.dumpTree('', rootcld[1], out, depth, 0);
		out.write(sprintf('\n%s\n', heap.hd_graph[rootcld[2]]['name']));
		heap.dumpTree('', rootcld[2], out, depth, 0);
	};

	repl.context['root'] = function (nodeid) {
		var path, node, func, bestnext;

		node = heap.hd_graph[nodeid];

		if (nodeid == 1)
			return ([ {
				node: nodeid,
				node_name: node['name'],
				node_nchildren: node['children_count'],
			} ]);

		func = arguments.callee;

		for (ii = 0; ii < node['parents'].length; ii++) {
			if (bestnext === undefined ||
			    bestnext['depth'] >
			    heap.hd_graph[node['parents'][ii]]['depth'])
				bestnext = heap.hd_graph[node['parents'][ii]];
		}

		mod_assert.ok(bestnext !== undefined);
		mod_assert.ok(bestnext['depth'] < node['depth']);
		path = func(bestnext['index']);
		path.push({
			node: nodeid,
			node_name: node['name'],
			node_nchildren: node['children_count'],
		});
		return (path);
	};
};

HeapDump.prototype.computeDepths = function (node, depth)
{
	var heap = this;

	if (!('depth' in node)) {
		node['depth'] = depth;
		node['parents'] = [];
	}

	node['children'].forEach(function (edge) {
		var child = heap.hd_graph[edge['to_node']];

		if ('depth' in child && child['depth'] <= depth + 1) {
			child['parents'].push(node['index']);
			return;
		}

		child['parents'] = [ node['index'] ];
		child['depth'] = depth + 1;
		heap.computeDepths(child, depth + 1);
	});
};

HeapDump.prototype.dumpTree = function (label, nodeid, out, depth, indent)
{
	var heap, node, name, indstr, ii;

	indstr = '';
	for (ii = 0; ii < indent; ii++)
		indstr += '    ';

	heap = this;
	node = this.hd_graph[nodeid];
	name = node['name'];
	if (name.length > 15)
		name = sprintf('"%s" ... ', name.substr(0, 15));

	out.write(sprintf('%s%s%s "%s" (length %s, node %s)\n', indstr, label,
	    node['type'], name, node['name'].length, node['index']));

	if (indent >= depth)
		return;

	node['children'].forEach(function (child) {
		if (child['type'] == 'hidden')
			return;

		heap.dumpTree(sprintf('%s %s: ', child['type'],
		    child['name_or_index']), child['to_node'], out, depth,
		    indent + 1);
	});
};

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
