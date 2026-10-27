"""Closed pure fault-gate controls. Native binding is deliberately not imported."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

SELF = 'scripts/run-current-committed-response-loss-gate.py'
ENTRY = 'qualification/committed-response-loss-gate.control.mjs'
EXPECTED = ['node:assert/strict', 'node:test', 'node:util']


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
        path = repo / name; before = path.lstat()
        require(path == path.resolve() and stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
            and before.st_nlink == 1 and before.st_size <= 65536, 'OWNED_BOUNDED_SOURCE')
        raw = path.read_bytes(); require(len(raw) == before.st_size and identity(path.lstat()) == identity(before), 'SOURCE_STABLE')
        if name.endswith('.mjs'):
            for spec in re.findall(r"\bfrom\s*[\"']([^\"']+)[\"']", raw.decode('ascii')):
                if spec.startswith('.'):
                    todo.append((path.parent / spec).resolve().relative_to(repo).as_posix())
                else:
                    require(spec in EXPECTED, 'NATIVE_OR_PACKAGE_IMPORT_REFUSED'); builtins.add(spec)
        rows[name] = dict(path=name, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), identity=identity(before))
    require(len(rows) == 4 and sorted(builtins) == EXPECTED, 'CLOSED_FOUR_SOURCE_INPUTS')
    return dict(inputs=[rows[name] for name in sorted(rows)], builtinImports=sorted(builtins))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('repo', 'node', 'source-sha256'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args(); selected = source_selection(args.repo)
    digest = hashlib.sha256(json.dumps(selected, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    require(args.source_sha256 == digest, 'EXACT_REVIEWED_SELECTION')
    argv = [args.node, '--permission', *['--allow-fs-read=' + str(Path(args.repo) / row['path']) for row in selected['inputs']],
        '--no-addons', '--disallow-code-generation-from-strings', '--unhandled-rejections=strict', '--test-reporter=tap', ENTRY]
    env = dict(LANG='C', LC_ALL='C', TZ='UTC', NODE_DISABLE_COMPILE_CACHE='1',
        X402_COMMITTED_RESPONSE_LOSS='declared-commit-before-response')
    actual = subprocess.run(argv, cwd=args.repo, env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=10)
    require(len(actual.stdout) <= 65536 and len(actual.stderr) <= 16384, 'CAPTURE_LIMIT')
    unchanged = source_selection(args.repo) == selected
    print(json.dumps(dict(actualExit=actual.returncode, stdout=actual.stdout.decode(), stderr=actual.stderr.decode(), sourceUnchanged=unchanged)), flush=True)
    require(actual.returncode == 0 and unchanged, 'ACTUAL_CONTROL_FAILED')
    lines = actual.stdout.decode().splitlines(); prefix = '# committed-response-loss-gate '
    footers = [json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix)]
    require(len(footers) == 1 and footers[0]['passed'] is True and footers[0]['cases'] == 18
        and all(line in lines for line in ('# tests 18', '# pass 18', '# fail 0', '# cancelled 0', '# skipped 0', '# todo 0')),
        'EXACT_EIGHTEEN_CONTROLS_NO_SKIP')
    print(json.dumps(dict(status='PASS', cases=18, sourceSha256=digest, effects=footers[0])), flush=True)


if __name__ == '__main__':
    main()
