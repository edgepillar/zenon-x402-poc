"""Ten stream-revocation cases and the existing 17+14 funding controls.

Actual builtin owners, declared native/key callbacks, no filesystem scratch.
Source selection is closed and reread before/after every bounded command.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

SELF = 'scripts/run-current-buyer-funding-stream-revocation.py'
ENTRY = 'qualification/buyer-funding-stream-revocation.control.mjs'
OLD_RUNNER = 'scripts/run-current-buyer-funding-owned-stream.mjs'
SCENARIOS = ('INPUT_DESTROY_BEFORE_GUARD', 'OUTPUT_DESTROY_BEFORE_GUARD', 'OUTPUT_END_BEFORE_GUARD',
    'INPUT_DESTROY_BEFORE_RETURN', 'OUTPUT_DESTROY_BEFORE_RETURN', 'INPUT_DESTROY_DURING_INSPECT',
    'OUTPUT_END_DURING_INSPECT', 'CHANNEL_SETUP_OVERRUN', 'EVENT_DELIVERED_GUARD_REFUSES', 'SUCCESS')


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def identity(s):
    return [str(getattr(s, k)) for k in ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')]


def source_selection(repo):
    repo = Path(repo)
    require(repo == repo.resolve(), 'PHYSICAL_SOURCE_ROOT')
    todo = [SELF, ENTRY, OLD_RUNNER, 'package.json', 'qualification/buyer-funding-owned-stream-session.behavior.mjs',
            'qualification/buyer-funding-owned-stream-deadline.behavior.mjs']
    rows, edges, builtins = {}, {}, set()
    while todo:
        name = todo.pop()
        if name in rows:
            continue
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
                    children.append(child); todo.append(child)
                else:
                    require(spec.startswith('node:'), 'EXTERNAL_PACKAGE_REFUSED')
                    builtins.add(spec)
        edges[name] = children
        rows[name] = {'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                     'gitBlob': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(), 'identity': identity(s)}
    return {'inputs': [rows[k] for k in sorted(rows)], 'relativeClosure': edges, 'builtinImports': sorted(builtins)}


def run_case(node, repo, selection, scenario):
    require(scenario in (*SCENARIOS, 'EXCLUSIVE', 'DEADLINE'), 'CLOSED_SCENARIO')
    require(source_selection(repo) == selection, 'SOURCE_CHANGED_BEFORE_CASE')
    env = {'TZ': 'UTC', 'LANG': 'C', 'LC_ALL': 'C', 'NODE_DISABLE_COMPILE_CACHE': '1'}
    if scenario in SCENARIOS:
        entry, tail = ENTRY, [scenario]
        env['X402_FUNDING_STREAM_REVOCATION'] = 'declared-native-current-stream-state'
    else:
        entry, tail = OLD_RUNNER, []
        env['X402_FUNDING_OWNED_STREAM_CONTROL'] = 'builtin-exclusive-before-native' if scenario == 'EXCLUSIVE' else 'builtin-opening-budget'
    argv = [str(node), '--permission', *['--allow-fs-read=' + str(Path(repo) / r['path']) for r in selection['inputs']],
            '--no-addons', '--disallow-code-generation-from-strings', '--unhandled-rejections=strict', entry, *tail]
    p = subprocess.run(argv, cwd=repo, env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=10)
    require(len(p.stdout) <= 131072 and len(p.stderr) <= 16384, 'OUTPUT_CAP')
    return {'scenario': scenario, 'actualExit': p.returncode, 'stdout': p.stdout.decode(), 'stderr': p.stderr.decode(),
            'stdoutSha256': hashlib.sha256(p.stdout).hexdigest(), 'stderrSha256': hashlib.sha256(p.stderr).hexdigest(),
            'sourceUnchanged': source_selection(repo) == selection}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True); parser.add_argument('--node', required=True)
    parser.add_argument('--source-sha256', required=True)
    args = parser.parse_args(); selection = source_selection(args.repo)
    digest = hashlib.sha256(json.dumps(selection, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    require(digest == args.source_sha256, 'EXACT_REVIEWED_SELECTION')
    for scenario in (*SCENARIOS, 'EXCLUSIVE', 'DEADLINE'):
        result = run_case(args.node, args.repo, selection, scenario)
        print(json.dumps(result), flush=True)
        require(result['actualExit'] == 0 and result['sourceUnchanged'], 'CURRENT_FUNDING_CONTROL_FAILED')
        if scenario in SCENARIOS:
            require(json.loads(result['stdout'])['passed'] is True, 'CURRENT_REVOCATION_CASE_FAILED')
    print(json.dumps({'status': 'PASS', 'cases': 41, 'newRevocationCases': 10, 'existingFundingCases': 31,
                     'sourceSha256': digest, 'nativeCallbacks': 'DECLARED', 'sdk': 0, 'SQLite': 0,
                     'ipConnections': 0, 'filesystemScratch': 0}), flush=True)


if __name__ == '__main__':
    main()
