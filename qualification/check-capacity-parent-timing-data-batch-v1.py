"""Pinned R4 offline DATA batch inspection; never native execution or authority.

Use -I -B -S and --check-parent or --check-capture with binary NDJSON stdin.
The first frame supplies independent caller expectations and a finite budget.
No input path, manager, SQL, SDK, clock, timer, key, nonce or network is opened.
Case results are provisional until the final complete-batch record and exit 0.
Input/output bounds are not an elapsed-time, physical-heap or OS sandbox bound.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import sys
import types

CONTROL = "native_capacity_managed_workload_v3.py"
CONTROL_SHA = "6d4e2d726bd600b84be387147ee7cd6555daa8b72b8940a8719861a1078b4567"
SOURCE_SHA = "d756740994aeb53ebeee47320d732583d96381dfa8c00e18a30f414e70a77027"
MAX_CASES = 8
MAX_HEADER_BYTES = 65536
MAX_PAYLOAD_BYTES = 16 * 1048576 + 65536
MAX_OUTPUT_BYTES = 24576
_cached = None
_source_reads = 0

def require(value):
    if not value:
        raise ValueError("PARENT_DATA_BATCH_REJECTED")

def identity(s):
    return (s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)

def source_identity(path):
    for at in (path,*path.parents):require(not at.is_symlink())
    s=path.lstat()
    require(stat.S_ISREG(s.st_mode)and s.st_uid==os.getuid()and s.st_nlink==1 and 0<s.st_size<=65536)
    return identity(s)

def control():
    """Compile the exact verified source bytes once, not a rewritten/source copy."""
    global _cached,_source_reads
    if _cached is None:
        path=Path(__file__).absolute().with_name(CONTROL);ident=source_identity(path)
        with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),"rb")as stream:
            require(identity(os.fstat(stream.fileno()))==ident)
            raw=stream.read(65537)
            require(len(raw)==ident[6]and identity(os.fstat(stream.fileno()))==ident)
        require(source_identity(path)==ident and hashlib.sha256(raw).hexdigest()==CONTROL_SHA)
        module=types.ModuleType("capacity_parent_batch_pinned_r4_control")
        module.__file__=str(path)
        # No source transformation, alternate implementation or cached .pyc.
        exec(compile(raw,str(path),"exec"),module.__dict__)
        require(source_identity(path)==ident and module.GRAPH_SHA==SOURCE_SHA)
        _cached=(module,path,ident);_source_reads+=1
    module,path,ident=_cached
    require(source_identity(path)==ident)
    return module

def decode_frame(raw):
    require(type(raw)is bytes and raw.endswith(b"\n")and raw.count(b"\n")==1)
    def pairs(items):
        out={}
        for key,value in items:
            require(key not in out);out[key]=value
        return out
    def floating(value):
        result=float(value);require(math.isfinite(result));return result
    def invalid(_):raise ValueError("PARENT_DATA_BATCH_REJECTED")
    value=json.loads(raw.decode("ascii"),object_pairs_hook=pairs,parse_float=floating,parse_constant=invalid)
    require(json.dumps(value,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode("ascii")+b"\n"==raw)
    return value

def line(stream,maximum):
    require(type(maximum)is int and maximum>0)
    raw=stream.readline(maximum+1)
    require(type(raw)is bytes and 0<len(raw)<=maximum and raw.endswith(b"\n"))
    return raw

def receipt_data(value):
    """Bound untrusted receipt metadata; only this subtree permits finite floats."""
    nodes=0
    def visit(v,depth):
        nonlocal nodes
        nodes+=1;require(nodes<=4096 and depth<=32)
        if type(v)is dict:
            require(len(v)<=64 and all(type(k)is str and k.isascii()and len(k)<=256 for k in v))
            for item in v.values():visit(item,depth+1)
        elif type(v)is list:
            require(len(v)<=1024)
            for item in v:visit(item,depth+1)
        elif type(v)is str:require(v.isascii()and "\0"not in v and len(v)<=65536)
        elif type(v)is int:require(-(2**128)<v<2**128)
        elif type(v)is float:require(math.isfinite(v))
        else:require(v is None or type(v)is bool)
    visit(value,0);require(type(value)is dict)

def main(argv=None,input_stream=None,output_stream=None):
    """Trusted binary streams may be supplied by DATA tests; no control injection."""
    args=sys.argv[1:]if argv is None else argv
    source=sys.stdin.buffer if input_stream is None else input_stream
    sink=sys.stdout.buffer if output_stream is None else output_stream
    emitted=0;output_bytes=0;input_bytes=0;peak_frame=0
    def emit(value):
        nonlocal output_bytes
        raw=json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode("ascii")+b"\n"
        require(len(raw)<=2048 and output_bytes+len(raw)<=MAX_OUTPUT_BYTES)
        require(sink.write(raw)==len(raw));require(sink.flush()is None);output_bytes+=len(raw)
    try:
        require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)
        require(sys.version.split()[0]=="3.12.14"and type(args)is list and all(type(a)is str for a in args)
            and args in(["--describe"],["--check-parent"],["--check-capture"]))
        m=control()
        if args==["--describe"]:
            emit(dict(kind="PARENT_DATA_BATCH_DESCRIPTION",version=1,modes=["--check-parent","--check-capture"],
                maximumCases=MAX_CASES,maximumHeaderBytes=MAX_HEADER_BYTES,maximumPayloadBytes=MAX_PAYLOAD_BYTES,
                maximumOutputBytes=MAX_OUTPUT_BYTES,sourceControlSha256=CONTROL_SHA,sourceRowsSha256=SOURCE_SHA,
                inputPathsAccepted=False,nativeExecution=False,authority="NONE"))
            return 0
        header_raw=line(source,MAX_HEADER_BYTES);input_bytes+=len(header_raw)
        header=decode_frame(header_raw);header_raw=None
        m.capture_tree_in_place(header)
        m.fields(header,("batchVersion","kind","inputBudgetBytes","expectations"),"BATCH_HEADER_FIELDS")
        m.integer(header["batchVersion"],1,1,"BATCH_VERSION")
        require(header["kind"]=="PARENT_TIMING_DATA_BATCH_EXPECTATIONS_V1")
        budget=header["inputBudgetBytes"];m.integer(budget,1,MAX_PAYLOAD_BYTES,"BATCH_PAYLOAD_BOUND")
        require(type(header["expectations"])is list and 1<=len(header["expectations"])<=MAX_CASES)
        expected=[]
        for entry in header["expectations"]:
            m.fields(entry,("expectedRunId","sourceRowsSha256","workload"),"BATCH_EXPECTATION_FIELDS")
            require(type(entry["expectedRunId"])is str and m.HASH.fullmatch(entry["expectedRunId"])
                and entry["sourceRowsSha256"]==SOURCE_SHA)
            # Detach the caller's expected workload; never infer it from a case.
            expected.append((entry["expectedRunId"],m.capture_plan(entry["workload"])))
        header=None;payload_bytes=0
        for index,(run_id,workload)in enumerate(expected,1):
            require(control()is m)
            frame=line(source,budget-payload_bytes);size=len(frame)
            payload_bytes+=size;input_bytes+=size;peak_frame=max(peak_frame,size)
            packet=decode_frame(frame);frame=None
            if args==["--check-parent"]:
                m.fields(packet,("parentTimingData","recording"),"BATCH_PARENT_FIELDS")
                result=m.validate_parent_timing_data(packet["parentTimingData"],packet["recording"],workload,run_id)
                scope="PARENT_RECORDING_DATA_ONLY"
            else:
                m.fields(packet,("capture","receipt"),"BATCH_CAPTURE_FIELDS")
                m.capture_tree_in_place(packet["capture"]);receipt_data(packet["receipt"])
                # Preserve inner key order, then drop the CLI-owned decoded
                # capture BEFORE the actual controller decodes its own tree.
                capture=packet.pop("capture")
                native_raw=json.dumps(capture,separators=(",",":"),ensure_ascii=True).encode("ascii")+b"\n"
                capture=None
                result=m.validate_capture_data(native_raw,b"",packet["receipt"],workload,run_id)
                native_raw=None;scope="FULL_CAPTURE_AND_RECEIPT_DATA_ONLY"
            packet=None
            require(control()is m)
            emit(dict(kind="MATCHING_PARENT_TIMING_DATA",case=index,scope=scope,result=result,
                callerExpectedContextAuthenticated=False,nativeEventsAuthenticated=False,authority="NONE"))
            emitted+=1
        # A missing case, trailing frame or even a trailing whitespace byte
        # withholds batch completion. No silent truncation or auto-retry.
        require(source.read(1)==b""and control()is m)
        emit(dict(kind="PARENT_DATA_BATCH_COMPLETE",version=1,cases=emitted,inputBytes=input_bytes,
            peakInputFrameBytes=peak_frame,retainedEarlierInputFrames=0,sourceControlReads=_source_reads,
            sourceControlSha256=CONTROL_SHA,sourceRowsSha256=SOURCE_SHA,callerExpectedContextAuthenticated=False,
            nativeExecution=False,nativeResourcesQualified=False,storageCleanupQualified=False,
            sustainableCapacityQualified=False,authority="NONE"))
        return 0
    except Exception:
        try:emit(dict(kind="PARENT_DATA_BATCH_REJECTED",completedCaseResults=emitted,
            code="BOUNDED_DATA_OR_SOURCE_OR_STREAM_REJECTED",batchComplete=False,
            nativeExecution=False,nativeResourcesQualified=False,storageCleanupQualified=False,authority="NONE"))
        except Exception:pass
        return 2

if __name__=="__main__":
    sys.exit(main())
