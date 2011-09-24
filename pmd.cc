/*
 * pmd.cc: node add-on for taking a heap snapshot and serializing it to stdout
 */

#include <v8.h>
#include <v8-profiler.h>
#include <node.h>
#include <string.h>
#include <unistd.h>
#include <node_object_wrap.h>
#include <errno.h>

#include <string>

#include <stdio.h>

using namespace v8;
using std::string;

/*
 * Implementation of OutputStream serializer that saves to a stdio stream.
 */
class FileOutputStream : public OutputStream
{
private:
	FILE *out;

public:
	FileOutputStream(FILE *out)
	{
		this->out = out;
	}

	void EndOfStream()
	{
		fflush(out);
	}

	OutputStream::WriteResult WriteAsciiChunk(char *data, int size)
	{
		int ii, rv;

		/* remove newlines */
		for (ii = 0; ii < size; ii++)
			if (data[ii] == '\n')
				data[ii] = ' ';

		rv = write(fileno(out), data, size);

		if (rv != size)
			fprintf(stderr, "write returned %d\n", size);
	
		return (OutputStream::kContinue);
	}
};

Handle<Value> take_snapshot(const Arguments& args)
{
	HandleScope scope;
	FileOutputStream *out;
	const HeapSnapshot *hsp;

	FILE *fp = stdout;

	bool customOut = args[0]->IsString();

	if (customOut) {
		String::AsciiValue fname(args[0]);
		fp = fopen(*fname, "w");
	}

	out = new FileOutputStream(fp);
	hsp = HeapProfiler::TakeSnapshot(String::New("snap"));
	hsp->Serialize(out, HeapSnapshot::kJSON);

	if (customOut) {
		fclose(fp);
	}

	Local<Object> rv = Object::New();
	return (rv);
}

extern "C" void
init (Handle<Object> target) 
{
	HandleScope scope;
	Local<FunctionTemplate> templ = FunctionTemplate::New(take_snapshot);

	target->Set(String::NewSymbol("takeSnapshot"), templ->GetFunction());
}
