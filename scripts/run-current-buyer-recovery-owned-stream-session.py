"""Closed recovery stream-opening controls; no native packages or filesystem scratch.

The actual native binding is evaluated only behind resolve refusals for its two
effectful edges. No source/load/format substitution or native effect emulation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

SELF = 'scripts/run-current-buyer-recovery-owned-stream-session.py'
ENTRY = 'qualification/buyer-recovery-owned-stream-session.control.mjs'
DENIED = {'src/x402-native-v6-funding-post-client.js', 'src/service-credit-backend-original-outcome-reader.js'}
NATIVE_ENTRY = 'src/zenon/native-original-recovery-command-session.js'
SCENARIOS = ('LOCAL_SUCCESS', 'BACKEND_SUCCESS', 'INVALID_STREAMS', 'ALREADY_OWNED', 'BAD_SELECTION',
    'BAD_BUDGET', 'PAYER_REJECTS', 'BACKEND_REJECTS', 'PAYER_LOAD_EXPIRES', 'BACKEND_LOAD_EXPIRES',
    'SHARED_BUDGET', 'PAYER_SYNC_EXPIRES', 'BACKEND_SYNC_EXPIRES', 'PAYER_LATE_OWNER', 'BACKEND_LATE_OWNER',
    'BACKEND_STOP_THROWS', 'NATIVE_STOP_REJECTS', 'SETUP_EXPIRES', 'GUARD_ARGUMENTS', 'CROSS_LEG_GUARD',
    'CHANNEL_REVOKED_AFTER_LOAD', 'BAD_OPEN_RECEIPT', 'NATIVE_CLOSE_NONVOID', 'BACKEND_STOP_VOID',
    'BINDING_INVALID_STREAMS', 'BINDING_ALREADY_OWNED', 'BINDING_BACKEND_ALREADY_OWNED')
ENV = {'TZ': 'UTC', 'LANG': 'C', 'LC_ALL': 'C', 'NODE_DISABLE_COMPILE_CACHE': '1',
       'X402_RECOVERY_OWNED_STREAM_CONTROL': 'declared-native-no-effects'}


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def identity(s):
    return [str(getattr(s, key)) for key in ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')]


def source_selection(repo, profile='LOCAL'):
    repo = Path(repo)
    require(profile in ('LOCAL', 'ENTRY', 'ALL'), 'CLOSED_CONTROL_PROFILE')
    require(repo == repo.resolve(), 'PHYSICAL_SOURCE_ROOT')
    todo, rows, edges, builtins, refused = [SELF, ENTRY, 'package.json'], {}, {}, set(), set()
    while todo:
        name = todo.pop()
        if name in rows:
            continue
        require(name not in DENIED, 'EFFECTFUL_SOURCE_NOT_SELECTED')
        p = repo / name
        require(p == p.resolve(), 'SOURCE_LINK_REFUSED')
        s = p.lstat()
        require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and s.st_nlink == 1 and s.st_size <= 262144, 'SOURCE_IDENTITY_CAP')
        raw = p.read_bytes()
        require(len(raw) == s.st_size and identity(p.lstat()) == identity(s), 'SOURCE_STABLE')
        children = []
        if name.endswith(('.js', '.mjs')):
            for spec in re.findall(r"(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)[\"']([^\"']+)[\"']", raw.decode()):
                if spec.startswith('.'):
                    child = (p.parent / spec).resolve().relative_to(repo).as_posix()
                    if child in DENIED or profile == 'LOCAL' and child == NATIVE_ENTRY:
                        refused.add(child)
                    else:
                        children.append(child)
                        todo.append(child)
                else:
                    require(spec.startswith('node:'), 'EXTERNAL_PACKAGE_REFUSED')
                    builtins.add(spec)
        edges[name] = children
        rows[name] = {'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                     'gitBlob': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(), 'identity': identity(s)}
    require(refused == ({NATIVE_ENTRY} if profile == 'LOCAL' else DENIED), 'EXACT_REFUSED_EDGES')
    return {'profile': profile, 'inputs': [rows[k] for k in sorted(rows)], 'relativeClosure': edges,
            'builtinImports': sorted(builtins), 'refusedEffectfulEdges': sorted(refused)}


def run_case(node, repo, selection, scenario):
    profile = selection['profile']
    require(scenario in selected_cases(profile), 'CLOSED_SCENARIO')
    require(source_selection(repo, profile) == selection, 'SOURCE_CHANGED_BEFORE_CASE')
    argv = [str(node), '--permission', *['--allow-fs-read=' + str(Path(repo) / row['path']) for row in selection['inputs']],
            '--no-addons', '--disallow-code-generation-from-strings', '--unhandled-rejections=strict', ENTRY, scenario]
    # The selected sources have no child/sockets/fs-write entry. Bounded capture
    # remains a controller limit, not a claim of an OS/network sandbox.
    p = subprocess.run(argv, cwd=repo, env=ENV, stdin=subprocess.DEVNULL, capture_output=True, timeout=5)
    require(len(p.stdout) <= 32768 and len(p.stderr) <= 16384, 'OUTPUT_CAP')
    result = {'scenario': scenario, 'actualExit': p.returncode, 'stdout': p.stdout.decode(),
              'stderr': p.stderr.decode(), 'stdoutSha256': hashlib.sha256(p.stdout).hexdigest(),
              'stderrSha256': hashlib.sha256(p.stderr).hexdigest(), 'sourceUnchanged': source_selection(repo, profile) == selection}
    return result


def selected_cases(profile):
    require(profile in ('LOCAL', 'ENTRY', 'ALL'), 'CLOSED_CONTROL_PROFILE')
    return tuple(s for s in SCENARIOS if profile == 'ALL' or s.startswith('BINDING_') == (profile == 'ENTRY'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', required=True)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--source-sha256', required=True)
    parser.add_argument('--profile', choices=('LOCAL', 'ENTRY', 'ALL'), default='LOCAL')
    args = parser.parse_args()
    selection = source_selection(args.repo, args.profile)
    seal = hashlib.sha256(json.dumps(selection, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    require(seal == args.source_sha256, 'EXACT_REVIEWED_SELECTION')
    results = []
    for scenario in selected_cases(args.profile):
        r = run_case(args.node, args.repo, selection, scenario)
        results.append(r)
        print(json.dumps(r), flush=True)
        require(r['actualExit'] == 0 and r['sourceUnchanged'] and json.loads(r['stdout'])['passed'] is True, 'ACTUAL_CONTROL_FAILED')
    print(json.dumps({'status': 'PASS', 'cases': len(results), 'sourceSha256': seal, 'nativeCallbacks': 'DECLARED',
                      'sdk': 0, 'sql': 0, 'ipConnections': 0, 'filesystemScratch': 0}), flush=True)


if __name__ == '__main__':
    main()
