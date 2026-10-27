"""One closed DATA-control process; no actual child, IPC, signal or SQL."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

SELF = 'scripts/run-current-sdk105-p2-boundary-data.py'
ENTRY = 'qualification/sdk105-p2-recovery-boundary-data.control.mjs'
ALLOWED = ['node:assert/strict', 'node:util']


def require(value, code):
    if not value:
        raise ValueError(code)


def identity(s):
    return [str(getattr(s, key)) for key in ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')]


def source_selection(repo):
    repo = Path(repo); require(repo == repo.resolve(), 'PHYSICAL_SOURCE_ROOT')
    todo, rows, builtins = [SELF, ENTRY, 'package.json'], {}, set()
    while todo:
        name = todo.pop()
        if name in rows:
            continue
        path = repo / name; before = path.lstat(); raw = path.read_bytes()
        require(path == path.resolve() and stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
            and before.st_nlink == 1 and len(raw) == before.st_size <= 65536
            and identity(path.lstat()) == identity(before), 'STABLE_BOUNDED_SOURCE')
        if name.endswith('.mjs'):
            for spec in re.findall(r"\bfrom\s*[\"']([^\"']+)[\"']", raw.decode('ascii')):
                if spec.startswith('.'):
                    todo.append((path.parent / spec).resolve().relative_to(repo).as_posix())
                else:
                    require(spec in ALLOWED, 'NATIVE_IMPORT_REFUSED'); builtins.add(spec)
        rows[name] = dict(path=name, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), identity=identity(before))
    require(len(rows) == 4 and sorted(builtins) == ALLOWED, 'CLOSED_FOUR_INPUTS')
    return dict(inputs=[rows[name] for name in sorted(rows)], builtinImports=sorted(builtins))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('repo', 'node', 'source-sha256'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args(); selected = source_selection(args.repo)
    digest = hashlib.sha256(json.dumps(selected, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    require(digest == args.source_sha256, 'EXACT_SOURCE_SELECTION')
    argv = [args.node, '--permission', *['--allow-fs-read=' + str(Path(args.repo) / row['path']) for row in selected['inputs']],
        '--no-addons', '--disallow-code-generation-from-strings', '--unhandled-rejections=strict', ENTRY]
    actual = subprocess.run(argv, cwd=args.repo, stdin=subprocess.DEVNULL, capture_output=True, timeout=5,
        env=dict(LANG='C', TZ='UTC', NODE_DISABLE_COMPILE_CACHE='1', X402_P2_BOUNDARY_DATA='declared-receipts-no-native-process'))
    require(len(actual.stdout) <= 16384 and len(actual.stderr) <= 16384, 'BOUNDED_CAPTURE')
    unchanged = source_selection(args.repo) == selected
    print(json.dumps(dict(actualExit=actual.returncode, stdout=actual.stdout.decode(), stderr=actual.stderr.decode(), sourceUnchanged=unchanged)), flush=True)
    require(actual.returncode == 0 and unchanged, 'DATA_CONTROL_FAILED')
    result = json.loads(actual.stdout)
    require(result['passed'] is True and result['cases'] == 12 and result['nativeProcesses'] == result['actualSignals'] == result['nativeIPC'] == 0,
        'TWELVE_DATA_CONTROLS_WITHOUT_NATIVE_ACTIONS')
    print(json.dumps(dict(status='PASS', cases=12, sourceSha256=digest, effects=result)), flush=True)


if __name__ == '__main__':
    main()
