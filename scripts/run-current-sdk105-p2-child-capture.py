"""Actual bounded child-byte encoding and DATA decoding, without native children."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

SELF = 'scripts/run-current-sdk105-p2-child-capture.py'
ENTRY = 'qualification/sdk105-p2-child-capture.control.mjs'
HELPER = 'qualification/sdk105-p2-child-capture.mjs'
CODEC = 'qualification/sdk105_p2_child_capture_data.py'
NAMES = [SELF, ENTRY, HELPER, CODEC, 'package.json']


def selection(repo):
    rows = []
    for name in NAMES:
        path = repo / name; before = path.lstat()
        assert path == path.resolve() and stat.S_ISREG(before.st_mode) and before.st_nlink == 1
        assert before.st_uid == os.getuid() and before.st_size <= 262144
        raw = path.read_bytes(); after = path.lstat()
        keys = ('st_dev','st_ino','st_uid','st_gid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns')
        identity = [str(getattr(before,k)) for k in keys]
        assert identity == [str(getattr(after,k)) for k in keys] and len(raw) == before.st_size
        rows.append(dict(path=name, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), identity=identity))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True); parser.add_argument('--node', required=True)
    parser.add_argument('--source-sha256', required=True); args = parser.parse_args()
    repo = Path(args.repo); rows = selection(repo)
    digest = hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    assert digest == args.source_sha256
    command = [args.node, '--permission', *['--allow-fs-read='+str(repo/row['path'])for row in rows],
        '--no-addons','--disallow-code-generation-from-strings','--unhandled-rejections=strict',ENTRY]
    env = dict(LANG='C',LC_ALL='C',TZ='UTC',NODE_DISABLE_COMPILE_CACHE='1',
        X402_P2_CHILD_CAPTURE_CONTROL='declared-child-stream-data')
    process = subprocess.run(command,cwd=repo,env=env,stdin=subprocess.DEVNULL,capture_output=True,timeout=8)
    print(json.dumps(dict(event='P2_DECLARED_CHILD_CAPTURE_CONTROL_COMMAND', actualExit=process.returncode,
        stdout=process.stdout.decode('utf8',errors='replace'),stderr=process.stderr.decode('utf8',errors='replace'))),flush=True)
    assert process.returncode == 0 and len(process.stdout) <= 262144 and len(process.stderr) <= 16384
    result = json.loads(process.stdout); assert result['passed'] is True and len(result['tests']) == 10
    spec = importlib.util.spec_from_file_location('reviewed_p2_capture_data_only',repo/CODEC)
    controller = importlib.util.module_from_spec(spec); sys.modules[spec.name] = controller
    exec(compile((repo/CODEC).read_bytes(),str(repo/CODEC),'exec'),controller.__dict__)
    traces = {row['name']:row['stdout'].encode()for row in result['traces']}
    decoded = controller.child_capture_data(traces['complete'])
    assert bytes(decoded['roles']['funding-child']['stdout']) == bytes([0,255,10,13,65])
    assert bytes(decoded['roles']['recovery-child']['stderr']) == b'declared diagnostic\n'
    assert controller.child_capture_data(traces['empty'])['roles']['funding-child']['stdout'] == b''
    prefix = '# sdk105-p2-private-child-capture-v1 '
    lines = traces['complete'].decode().splitlines(keepends=True)
    def altered(index, change):
        rows = list(lines); value = json.loads(rows[index][len(prefix):]); change(value)
        rows[index] = prefix+json.dumps(value,separators=(',',':'))+'\n'; return ''.join(rows).encode()
    refusals = {
        'incomplete close':traces['incomplete'], 'overflow prefix':traces['overflow'],
        'missing final close':''.join(lines[:-1]).encode(), 'truncated frame':traces['complete'][:-2],
        'changed bytes':altered(0,lambda value:value.update(base64='YWJjZA==')),
        'changed offset':altered(0,lambda value:value.update(offset=1)),
        'noncanonical base64':altered(0,lambda value:value.update(base64='AP8KDUF=')),
        'undeclared field':altered(0,lambda value:value.update(extra=True)),
        'data after EOF':''.join(lines[:3]+[lines[0]]+lines[3:]).encode(),
        'duplicate EOF':''.join(lines[:3]+[lines[2]]+lines[3:]).encode(),
    }
    for label, raw in refusals.items():
        try:controller.child_capture_data(raw)
        except (ValueError,TypeError,KeyError):pass
        else:raise AssertionError(label)
    assert selection(repo) == rows
    print(json.dumps(dict(status='PASS',javascriptCases=result['tests'],crossLanguageRoundTrips=2,
        decoderRefusals=list(refusals),sourceRows=rows,sourceSha256=digest,
        nodeExit=process.returncode,nodeStdoutBytes=len(process.stdout),nodeStderrBytes=len(process.stderr),
        nodeStdoutSha256=hashlib.sha256(process.stdout).hexdigest(),
        declaredChildEvents=True,actualApplicationChildProcesses=0,testNodeCommands=1,actualSignals=0,actualIPC=0,
        SDK=0,SQLite=0,sockets=0,generatedKeys=0,cryptographicSignatures=0,nonceSearch=0,
        filesystemScratch=0,storageManagerImported=False,physicalRelease='NOT_QUALIFIED',authority='NONE')))


if __name__ == '__main__':
    main()
