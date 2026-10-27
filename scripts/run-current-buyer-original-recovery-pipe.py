"""Explicit original-only bootstrap controls over provided anonymous OS pipes.

No test discovery, native package execution, file output or application network.
Python supplies externally retained fixed DATA; Node owns its one pipe pair and
executes the actual bootstrap/connector/session/host with declared native OPEN.
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

ENTRY = 'qualification/buyer-original-recovery-pipe.control.mjs'
VECTOR = 'qualification/buyer-original-recovery-pipe.fixture.json'
SCENARIOS = ('CLEAN_INSPECT', 'RESTORE_ORIGINAL', 'NONCANONICAL_BOOTSTRAP', 'MISMATCHED_GRANT', 'OUTSIDE_ROOT', 'BOOTSTRAP_ROOT_CHANGED',
             'NATIVE_OPEN_REJECTS', 'CLIENT_SETUP_REFUSED', 'CLIENT_CLOSE_REJECTS', 'FINAL_CLOSE_VIEW_DRIFT', 'OUTPUT_PEER_CLOSED',
             'FUNDING_COMMAND_REFUSED', 'NATIVE_THENABLE_REFUSED')
ENV = {'TZ': 'UTC', 'LANG': 'C', 'LC_ALL': 'C', 'X402_ORIGINAL_RECOVERY_PIPE_CONTROL': 'explicit-bootstrap-declared-native-only'}
CAPS = {'stdout': 32768, 'stderr': 16384, 'commandOutput': 16384}
BACKEND_SCENARIOS = ('BACKEND_INSPECT', 'BACKEND_RECONCILE_CACHED', 'BACKEND_RECONCILE_ABSENT', 'BACKEND_LOCAL_ABSENT', 'BACKEND_QUEUED_SERVICE_NO_REPLAY',
    'BACKEND_PRIOR_INTENT', 'BACKEND_FOREIGN_GRANT', 'BACKEND_CHANGED_CONTEXT', 'BACKEND_STORE_CLOSE_THROWS',
    'BACKEND_STORE_CLOSE_NONVOID', 'BACKEND_READER_CLOSE_THROWS', 'BACKEND_READER_CLOSE_NONCLOSED',
    'BACKEND_PAYER_CLOSE_REJECTS', 'BACKEND_PAYER_CLOSE_LATE', 'BACKEND_OPEN_REJECTS', 'BACKEND_OPEN_THENABLE',
    'BACKEND_PAYER_OPEN_REJECTS', 'BACKEND_CLIENT_SETUP_REFUSED', 'BACKEND_POST_STORE_VIEW_DRIFT',
    'BACKEND_OUTPUT_PEER_CLOSED', 'BACKEND_FORBIDDEN_FUNDING', 'BACKEND_BOOTSTRAP_OUTSIDE_ROOT',
    'BACKEND_BOOTSTRAP_ALIAS', 'BACKEND_BOOTSTRAP_SIDECAR', 'BACKEND_BOOTSTRAP_LIMIT', 'BACKEND_CAPABILITY_MISSING',
    'BACKEND_OWNER_SHAPE_REFUSED', 'BACKEND_STORE_EARLY_CLOSE', 'BACKEND_READER_REENTRANT_STOP',
    'BACKEND_STORE_CLOSE_PENDING_RECEIPT', 'BACKEND_READ_PROMISE', 'BACKEND_DOUBLE_CLOSE_GUARD', 'BACKEND_PROMISE_ACCESSOR_REFUSED')
RECONCILE_CASES = frozenset(('BACKEND_RECONCILE_CACHED', 'BACKEND_RECONCILE_ABSENT', 'BACKEND_LOCAL_ABSENT',
    'BACKEND_PRIOR_INTENT', 'BACKEND_FOREIGN_GRANT', 'BACKEND_CHANGED_CONTEXT', 'BACKEND_OUTPUT_PEER_CLOSED', 'BACKEND_QUEUED_SERVICE_NO_REPLAY',
    'BACKEND_READER_REENTRANT_STOP', 'BACKEND_READ_PROMISE'))
BACKEND_INSPECT_CASES = frozenset(('BACKEND_INSPECT', 'BACKEND_STORE_CLOSE_THROWS', 'BACKEND_STORE_CLOSE_NONVOID',
    'BACKEND_READER_CLOSE_THROWS', 'BACKEND_READER_CLOSE_NONCLOSED', 'BACKEND_PAYER_CLOSE_REJECTS',
    'BACKEND_PAYER_CLOSE_LATE', 'BACKEND_POST_STORE_VIEW_DRIFT', 'BACKEND_STORE_EARLY_CLOSE',
    'BACKEND_STORE_CLOSE_PENDING_RECEIPT', 'BACKEND_DOUBLE_CLOSE_GUARD', 'BACKEND_PROMISE_ACCESSOR_REFUSED'))
STARTUP_SCENARIOS = ('LOCAL_OPEN_PENDING', 'LOCAL_OPEN_LATE', 'LOCAL_LATE_CLOSE_REJECTS', 'LOCAL_LATE_CLOSE_PENDING',
    'LOCAL_LATE_CLOSE_THENABLE', 'LOCAL_LATE_OWNER_SHAPE', 'LOCAL_SYNC_OPEN_EXPIRES', 'BACKEND_OPEN_PENDING',
    'BACKEND_OPEN_LATE', 'BACKEND_LATE_STORE_CLOSE_REJECTS', 'BACKEND_SYNC_OPEN_EXPIRES',
    'BACKEND_PREFIX_PAYER_PENDING', 'BACKEND_PREFIX_PAYER_LATE', 'BACKEND_SHARED_BUDGET',
    'CLIENT_SETUP_BUDGET_EXPIRES', 'STARTUP_TIMER_CANCELLED')


def profile_data(profile):
    require(profile in ('LOCAL', 'BACKEND', 'STARTUP'), 'CLOSED_PROFILE')
    if profile == 'LOCAL':
        return ENTRY, VECTOR, SCENARIOS, ENV
    if profile == 'STARTUP':
        return ('qualification/buyer-original-recovery-pipe-startup.control.mjs',
                'qualification/buyer-original-backend-recovery-pipe.fixture.json', STARTUP_SCENARIOS,
                {**ENV, 'X402_ORIGINAL_RECOVERY_PIPE_CONTROL': 'explicit-whole-acquisition-declared-native-only'})
    return ('qualification/buyer-original-backend-recovery-pipe.control.mjs',
            'qualification/buyer-original-backend-recovery-pipe.fixture.json', BACKEND_SCENARIOS,
            {**ENV, 'X402_ORIGINAL_RECOVERY_PIPE_CONTROL': 'explicit-backend-store-owner-declared-native-only'})


def require(ok, code):
    if not ok:
        raise RuntimeError(code)


def identity(s):
    return [str(getattr(s, k)) for k in ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')]


def source_selection(repo, profile='LOCAL'):
    repo = Path(repo)
    entry, vector, _, _ = profile_data(profile)
    require(repo == repo.resolve(), 'PHYSICAL_SOURCE_ROOT')
    todo, rows, closure, builtins = [entry, vector, 'package.json'], {}, {}, set()
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


def case_input(repo, scenario, profile='LOCAL'):
    _, vector, scenarios, _ = profile_data(profile)
    require(scenario in scenarios, 'CLOSED_SCENARIO')
    value = json.loads((Path(repo) / vector).read_bytes())
    require(value['certificateAndSignatureDATAAreInvalid'] is True and value['authority'] == 'NONE', 'FIXED_INVALID_DATA_ONLY')
    bootstrap = copy.deepcopy(value['bootstrap'])
    if profile == 'STARTUP':
        budget = 80 if scenario in ('BACKEND_SHARED_BUDGET', 'STARTUP_TIMER_CANCELLED') else 30
        bootstrap['payerOptions']['deadlineMs'] = budget
        bootstrap['transportOptions'].update(requestDeadlineMs=budget, handshakeDeadlineMs=budget, closeGraceMs=budget)
        if not (scenario.startswith('BACKEND_') or scenario == 'STARTUP_TIMER_CANCELLED'):
            bootstrap['recoveryPipeBootstrapVersion'] = 1
            del bootstrap['backendOptions']
    if scenario == 'MISMATCHED_GRANT':
        bootstrap['payerOptions']['selectedGrantId'] = 'grant.foreign.1'
    if scenario == 'OUTSIDE_ROOT':
        bootstrap['payerOptions']['databasePath'] = '/outside/payer.sqlite'
    if scenario == 'BOOTSTRAP_ROOT_CHANGED':
        bootstrap['payerOptions']['allowedRoot'] = '/outside'
        bootstrap['payerOptions']['databasePath'] = '/outside/payer.sqlite'
    if scenario == 'BACKEND_BOOTSTRAP_OUTSIDE_ROOT':
        bootstrap['backendOptions']['databasePath'] = '/outside/backend.sqlite'
    if scenario in ('BACKEND_BOOTSTRAP_ALIAS', 'BACKEND_BOOTSTRAP_SIDECAR'):
        bootstrap['backendOptions']['databasePath'] = bootstrap['payerOptions']['databasePath'] + ('-wal' if scenario.endswith('SIDECAR') else '')
    if scenario == 'BACKEND_BOOTSTRAP_LIMIT':
        bootstrap['backendOptions']['limits']['maxStateBytes'] = 1048577
    line = json.dumps(bootstrap, separators=(',', ':')) if scenario == 'NONCANONICAL_BOOTSTRAP' else json.dumps(bootstrap, sort_keys=True, separators=(',', ':'))
    tails = {'CLEAN_INSPECT': value['inspectLine'] + value['closeLine'],
             'RESTORE_ORIGINAL': value['restoreLine'] + value['closeLine'],
             'OUTPUT_PEER_CLOSED': value['restoreLine'] + value['closeLine'],
             'FUNDING_COMMAND_REFUSED': json.dumps({'version': 1, 'id': 'forbidden', 'operation': 'prepare', 'input': {}}, sort_keys=True, separators=(',', ':')) + '\n'}
    if profile == 'BACKEND':
        for selected in BACKEND_INSPECT_CASES:
            tails[selected] = value['inspectLine'] + value['closeLine']
        for selected in RECONCILE_CASES:
            tails[selected] = value['reconcileLine'] + value['closeLine']
        tails['BACKEND_QUEUED_SERVICE_NO_REPLAY'] = value['reconcileLine'] + value['queuedServiceLine'] + value['closeLine']
        tails['BACKEND_FORBIDDEN_FUNDING'] = tails['FUNDING_COMMAND_REFUSED']
        foreign = json.loads(value['reconcileLine'])
        foreign['input']['key']['grantId'] = 'grant.foreign.1'
        tails['BACKEND_FOREIGN_GRANT'] = json.dumps(foreign, sort_keys=True, separators=(',', ':')) + '\n'
    if profile == 'STARTUP':
        tails = {scenario: value['inspectLine'] + value['closeLine']}
    payload = (line + '\n' + tails.get(scenario, '')).encode('utf-8')
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
                backend_result = scenario in BACKEND_INSPECT_CASES or scenario == 'STARTUP_TIMER_CANCELLED' or scenario in (
                    'BACKEND_RECONCILE_CACHED', 'BACKEND_RECONCILE_ABSENT', 'BACKEND_LOCAL_ABSENT', 'BACKEND_PRIOR_INTENT', 'BACKEND_QUEUED_SERVICE_NO_REPLAY')
                if scenario in ('CLEAN_INSPECT', 'RESTORE_ORIGINAL') or backend_result:
                    require(streams['commandOutput'].endswith(b'\n') and streams['commandOutput'].count(b'\n') == 1, 'EXACT_ONE_RESULT')
                    reply = json.loads(streams['commandOutput'])
                    require(reply['outcome'] == 'CALLBACK_RETURNED' and reply['result']['authority'] == 'NONE', 'EXPLICIT_RESULT')
                    if scenario == 'RESTORE_ORIGINAL':
                        require(reply['result']['paymentSignatureHeader'] == expected_header, 'EXACT_ORIGINAL_HEADER')
                    elif scenario in BACKEND_INSPECT_CASES or scenario in ('CLEAN_INSPECT', 'STARTUP_TIMER_CANCELLED'):
                        require(reply['operation'] == 'inspect', 'EXACT_INSPECTION')
                    else:
                        observed = reply['result']
                        require(reply['operation'] == 'reconcileOriginal' and observed['reconciliationRequired'] is True
                                and observed['serviceDelivery'] == 'NOT_ESTABLISHED'
                                and all(observed[k] is False for k in ('mayStartPayment', 'maySignPayment', 'mayDispatchService', 'deliveryConfirmed')),
                                'NO_BACKEND_RESULT_AUTHORITY')
                else:
                    require(not streams['commandOutput'], 'NO_REFUSAL_OR_LOST_PEER_OUTPUT')
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
    parser.add_argument('--profile', choices=('LOCAL', 'BACKEND', 'STARTUP'), default='LOCAL')
    args = parser.parse_args()
    require(args.node.is_absolute() and args.node == args.node.resolve(), 'EXPLICIT_PHYSICAL_NODE_EXECUTABLE')
    repo = Path(__file__).resolve().parent.parent
    selection = source_selection(repo, args.profile)
    _, _, scenarios, _ = profile_data(args.profile)
    rows = []
    for scenario in scenarios:
        row = run_case(args.node, repo, selection, scenario)
        rows.append({k: v for k, v in row.items() if k != 'streams'})
        if not row['passed']:
            break
    passed = len(rows) == len(scenarios) and all(r['passed'] for r in rows)
    print(json.dumps({'result': 'ORIGINAL_RECOVERY_PIPE_CONTROLS_PASS' if passed else 'INCOMPLETE_OR_FAILURE',
                      'profile': args.profile, 'rows': rows, 'selected': len(scenarios), 'nodeChildren': 0, 'ipConnections': 0,
                      'nativeCallbacks': 'DECLARED', 'SDK': False, 'SQLite': False, 'filesystemScratch': False,
                      'osOrNetworkSandbox': False, 'nativeApplicationQualified': False}))
    return 0 if passed else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('Original recovery pipe control refused or incomplete; no broader qualification is established.')
        raise SystemExit(1)
