"""Closed actual command/lifecycle/recovery controls with declared native data.

No installed packages, SQL, sockets, keys, crypto signatures or managed scratch.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

SELF = 'scripts/run-current-sdk105-command-uncertainty.py'
ENTRY = 'qualification/sdk105-command-uncertainty.control.mjs'
SCENARIOS = ('DIRECT_ASYNC_REJECT', 'DIRECT_PRECONDITION_REFUSAL', 'DIRECT_REJECT_DURING_CLOSE',
    'DIRECT_LATE_VOID_DURING_CLOSE', 'DIRECT_NONVOID_REJECT', 'COMMAND_PENDING_UNKNOWN',
    'COMMAND_SERVICE_REJECT', 'COMMAND_OUTPUT_LOSS', 'COMMAND_PENDING_SERVICE_CLOSE', 'COMMAND_RECOVERY_UNKNOWN')


def require(value, code):
    if not value:
        raise RuntimeError(code)


def identity(s):
    return [str(getattr(s, k)) for k in ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')]


def source_selection(repo):
    repo = Path(repo)
    require(repo == repo.resolve(), 'PHYSICAL_SOURCE_ROOT')
    todo, rows, edges, builtins = [SELF, ENTRY, 'package.json'], {}, {}, set()
    while todo:
        name = todo.pop()
        if name in rows:
            continue
        p = repo / name; s = p.lstat()
        require(p == p.resolve() and stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid()
                and s.st_nlink == 1 and s.st_size <= 262144, 'SOURCE_IDENTITY_CAP')
        raw = p.read_bytes()
        require(len(raw) == s.st_size and identity(p.lstat()) == identity(s), 'SOURCE_STABLE')
        children = []
        if name.endswith(('.js', '.mjs')):
            for spec in re.findall(r"(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)[\"']([^\"']+)[\"']", raw.decode()):
                if spec.startswith('.'):
                    child = (p.parent / spec).resolve().relative_to(repo).as_posix(); children.append(child); todo.append(child)
                else:
                    require(spec.startswith('node:'), 'EXTERNAL_PACKAGE_REFUSED'); builtins.add(spec)
        edges[name] = children
        rows[name] = {'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                     'gitBlob': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(), 'identity': identity(s)}
    return {'inputs': [rows[k] for k in sorted(rows)], 'relativeClosure': edges, 'builtinImports': sorted(builtins)}


def run_case(node, repo, selected, scenario):
    require(scenario in SCENARIOS, 'CLOSED_SCENARIO'); require(source_selection(repo) == selected, 'SOURCE_CHANGED_BEFORE')
    argv = [str(node), '--permission', *['--allow-fs-read=' + str(Path(repo) / r['path']) for r in selected['inputs']],
            '--no-addons', '--disallow-code-generation-from-strings', '--unhandled-rejections=strict', ENTRY, scenario]
    env = {'TZ': 'UTC', 'LANG': 'C', 'LC_ALL': 'C', 'NODE_DISABLE_COMPILE_CACHE': '1',
           'X402_SDK105_COMMAND_UNCERTAINTY': 'declared-native-exact-original'}
    p = subprocess.run(argv, cwd=repo, env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=5)
    require(len(p.stdout) <= 32768 and len(p.stderr) <= 16384, 'OUTPUT_CAP')
    return {'scenario': scenario, 'actualExit': p.returncode, 'stdout': p.stdout.decode(), 'stderr': p.stderr.decode(),
            'sourceUnchanged': source_selection(repo) == selected}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True); parser.add_argument('--node', required=True)
    parser.add_argument('--source-sha256', required=True); args = parser.parse_args()
    selected = source_selection(args.repo)
    digest = hashlib.sha256(json.dumps(selected, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    require(digest == args.source_sha256, 'EXACT_REVIEWED_SELECTION')
    for scenario in SCENARIOS:
        row = run_case(args.node, args.repo, selected, scenario); print(json.dumps(row), flush=True)
        require(row['actualExit'] == 0 and row['sourceUnchanged'] and json.loads(row['stdout'])['passed'], 'CURRENT_CONTROL_FAILED')
    print(json.dumps({'status': 'PASS', 'cases': len(SCENARIOS), 'sourceSha256': digest,
                     'nativeAndStoreCallbacks': 'DECLARED', 'SDK': 0, 'SQLite': 0, 'sockets': 0, 'filesystemScratch': 0}), flush=True)


if __name__ == '__main__':
    main()
