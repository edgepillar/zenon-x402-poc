"""Eight current-opening controls over provided anonymous OS pipes.

No files/sockets/packages/SDK/SQL/keys/signatures/nonce work. Every child is the
one owned Node process for its selected case; Node creates no child. Source
selection is closed and reread before/after each actual bounded command.
"""
import argparse
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import time

SELF = 'scripts/run-current-buyer-recovery-opening-guard.py'
ENTRY = 'qualification/buyer-recovery-opening-guard.control.mjs'
VECTOR = 'qualification/buyer-original-backend-recovery-pipe.fixture.json'
SCENARIOS = ('PAYER_LOAD_EXPIRES', 'BACKEND_LOAD_EXPIRES', 'PAYER_AFTER_BACKEND_LOAD_EXPIRES',
    'PAYER_SYNC_LOAD_EXPIRES', 'BACKEND_SYNC_LOAD_EXPIRES', 'GUARD_SUCCESS_AND_RETIRED',
    'BACKEND_GUARD_CANNOT_OPEN_PAYER', 'GUARD_ARGUMENTS_REFUSED')
ENV = {'TZ': 'UTC', 'LANG': 'C', 'LC_ALL': 'C', 'NODE_DISABLE_COMPILE_CACHE': '1',
    'X402_ORIGINAL_RECOVERY_PIPE_CONTROL': 'current-opening-guard-declared-native-only'}
CAPS = {'stdout': 32768, 'stderr': 16384, 'commandOutput': 16384}


def profile_data(profile):
    require(profile == 'GUARD', 'CLOSED_GUARD_PROFILE')
    return ENTRY, VECTOR, SCENARIOS, ENV


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def identity(s):
    return [str(getattr(s, key)) for key in ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')]


def source_selection(repo, profile='GUARD'):
    repo = Path(repo)
    entry, vector, _, _ = profile_data(profile)
    require(repo == repo.resolve(), 'PHYSICAL_SOURCE_ROOT')
    todo, rows, closure, builtins = [entry, vector, 'package.json', SELF], {}, {}, set()
    while todo:
        name = todo.pop()
        if name in rows:
            continue
        path = repo / name
        require(path == path.resolve(), 'SOURCE_LINK_REFUSED')
        before = path.lstat()
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
                and before.st_size <= (32768 if name == vector else 262144), 'SOURCE_IDENTITY_CAP')
        raw = path.read_bytes()
        require(len(raw) == before.st_size and identity(path.lstat()) == identity(before), 'SOURCE_STABLE')
        children = []
        if name.endswith(('.js', '.mjs')):
            for spec in re.findall(r"(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)[\"']([^\"']+)[\"']", raw.decode('utf-8')):
                if spec.startswith('.'):
                    child = ((repo / name).parent / spec).resolve().relative_to(repo).as_posix()
                    children.append(child)
                    todo.append(child)
                else:
                    require(spec.startswith('node:'), 'EXTERNAL_PACKAGE_REFUSED')
                    builtins.add(spec)
        closure[name] = children
        rows[name] = {'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                      'gitBlob': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(), 'identity': identity(before)}
    return {'profile': profile, 'inputs': [rows[k] for k in sorted(rows)], 'relativeClosure': closure, 'builtinImports': sorted(builtins)}


def case_input(repo, scenario, profile='GUARD'):
    require(profile == 'GUARD' and scenario in SCENARIOS, 'CLOSED_GUARD_CASE')
    value = json.loads((Path(repo) / VECTOR).read_bytes())
    require(value['certificateAndSignatureDATAAreInvalid'] is True and value['authority'] == 'NONE', 'FIXED_INVALID_DATA_ONLY')
    bootstrap = copy.deepcopy(value['bootstrap'])
    with_backend = scenario.startswith('BACKEND_') or scenario in ('PAYER_AFTER_BACKEND_LOAD_EXPIRES', 'GUARD_SUCCESS_AND_RETIRED')
    budget = 30 if scenario.endswith('EXPIRES') else 1000
    bootstrap['payerOptions']['deadlineMs'] = budget
    bootstrap['transportOptions'].update(requestDeadlineMs=budget, handshakeDeadlineMs=budget, closeGraceMs=min(250, budget))
    if not with_backend:
        bootstrap['recoveryPipeBootstrapVersion'] = 1
        del bootstrap['backendOptions']
    payload = (json.dumps(bootstrap, sort_keys=True, separators=(',', ':')) + '\n' + value['closeLine']).encode('utf8')
    require(len(payload) < 65536, 'INPUT_PAYLOAD_CAP')
    return payload, value['expectedOriginalHeader']


def run_case(node, repo, selection, scenario):
    profile = selection['profile']
    entry, _, scenarios, environment = profile_data(profile)
    require(os.name == 'posix' and scenario in scenarios, 'CLOSED_POSIX_CASE')
    require(source_selection(repo, profile) == selection, 'SOURCE_CHANGED_BEFORE_CASE')
    payload, expected_header = case_input(repo, scenario, profile)
    owned, selector, child = set(), selectors.DefaultSelector(), None
    streams = {name: bytearray() for name in CAPS}
    pending = 0
    input_complete = False
    stop = None
    started = time.monotonic()

    def pipe():
        pair = os.pipe()
        owned.update(pair)
        return pair

    def close(fd):
        if fd in owned:
            os.close(fd)
            owned.remove(fd)

    try:
        input_fd, input_write = pipe()
        output_read, output_fd = pipe()
        require(all(3 <= fd <= 1023 and stat.S_ISFIFO(os.fstat(fd).st_mode) for fd in (input_fd, output_fd)), 'EXPLICIT_FIFO_RANGE')
        if scenario in ('OUTPUT_PEER_CLOSED', 'BACKEND_OUTPUT_PEER_CLOSED'):
            close(output_read)
            output_read = None
        argv = [str(node), '--permission', *['--allow-fs-read=' + str(Path(repo) / r['path']) for r in selection['inputs']],
                '--no-addons', '--disallow-code-generation-from-strings', '--unhandled-rejections=strict', entry,
                scenario, str(input_fd), str(output_fd)]
        child = subprocess.Popen(argv, cwd=repo, env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 pass_fds=(input_fd, output_fd), start_new_session=True)
        close(input_fd)
        close(output_fd)
        os.set_blocking(input_write, False)
        selector.register(input_write, selectors.EVENT_WRITE, 'input')
        for name, fd in (('stdout', child.stdout.fileno()), ('stderr', child.stderr.fileno()), ('commandOutput', output_read)):
            if fd is not None:
                os.set_blocking(fd, False)
                selector.register(fd, selectors.EVENT_READ, name)
        deadline = started + 10
        while selector.get_map() or child.poll() is None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                stop = 'DEADLINE'
                break
            for key, _ in selector.select(min(0.1, remaining)):
                if key.data == 'input':
                    try:
                        pending += os.write(key.fd, payload[pending:pending + 4096])
                    except BlockingIOError:
                        continue
                    except BrokenPipeError:
                        selector.unregister(key.fd)
                        close(key.fd)
                        continue
                    if pending == len(payload):
                        input_complete = True
                        selector.unregister(key.fd)
                        close(key.fd)
                else:
                    try:
                        chunk = os.read(key.fd, min(65536, CAPS[key.data] + 1 - len(streams[key.data])))
                    except BlockingIOError:
                        continue
                    if not chunk:
                        selector.unregister(key.fd)
                        if key.data == 'commandOutput':
                            close(key.fd)
                    else:
                        streams[key.data].extend(chunk)
                        if len(streams[key.data]) > CAPS[key.data]:
                            stop = 'OUTPUT_CAP'
                            break
            if stop is not None:
                break
        complete = stop is None and not selector.get_map() and child.poll() is not None
        if stop is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
        exit_code = child.wait(timeout=1)
        diagnostic = None
        observation_failure = None
        if complete and exit_code == 0 and not streams['stderr']:
            try:
                diagnostic = json.loads(streams['stdout'])
                require(diagnostic['scenario'] == scenario and diagnostic['passed'] is True, 'EXACT_SCENARIO')
                require(diagnostic['ownedDescriptorsClosed'] is True and diagnostic['standardDescriptorsPreserved'] is True
                        and diagnostic['serviceCalls'] == 0 and diagnostic['ipConnections'] == 0, 'EXACT_CONTROL_SCOPE')
                require(not streams['commandOutput'], 'NO_COMMAND_OUTPUT_EXPECTED')
            except Exception:
                observation_failure = 'DIAGNOSTIC_OR_RESULT_REJECTED'
        stable = source_selection(repo, profile) == selection
        return {'scenario': scenario, 'exitCode': exit_code, 'complete': complete, 'inputComplete': input_complete,
                'inputBytes': pending, 'inputSha256': hashlib.sha256(payload).hexdigest(), 'stopReason': stop,
                'elapsedSeconds': time.monotonic() - started, 'inputsStable': stable,
                'diagnostic': diagnostic, 'observationFailure': observation_failure,
                'passed': bool(complete and input_complete and exit_code == 0 and diagnostic is not None
                               and observation_failure is None and stable),
                'streams': {k: {'bytes': len(v), 'sha256': hashlib.sha256(v).hexdigest(), 'base64': base64.b64encode(v).decode()}
                            for k, v in streams.items()}}
    finally:
        selector.close()
        if child is not None:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=0.5)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait(timeout=1)
            child.stdout.close()
            child.stderr.close()
        for fd in tuple(owned):
            close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', required=True, type=Path)
    args = parser.parse_args()
    require(args.node.is_absolute() and args.node == args.node.resolve(), 'EXPLICIT_PHYSICAL_NODE_EXECUTABLE')
    repo = Path(__file__).resolve().parent.parent
    selection = source_selection(repo, 'GUARD')
    rows = []
    for scenario in SCENARIOS:
        row = run_case(args.node, repo, selection, scenario)
        rows.append({key: value for key, value in row.items() if key != 'streams'})
        if not row['passed']:
            break
    passed = len(rows) == len(SCENARIOS) and all(row['passed'] for row in rows)
    print(json.dumps({'result': 'RECOVERY_OPENING_GUARD_CONTROLS_PASS' if passed else 'INCOMPLETE_OR_FAILURE',
        'rows': rows, 'selected': len(SCENARIOS), 'nodeChildren': 0, 'ipConnections': 0,
        'nativeCallbacks': 'DECLARED', 'SDK': False, 'SQLite': False, 'filesystemScratch': False,
        'nativeApplicationQualified': False, 'osOrNetworkSandbox': False}))
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
