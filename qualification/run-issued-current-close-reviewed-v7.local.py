"""Reviewed controller for the preserved V6 application; NO native authority.

Default/source-only mode reads pinned sources. A new finite approval is required
for --execute-reviewed-clean-v7. The earlier frozen V6 allowance does not apply.
No old source, manifest, root, reservation, lease or evidence is rewritten.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys

MANIFEST = 'qualification/issued-current-close-reviewed-v7.inputs.json'
BASE_MANIFEST = 'qualification/issued-current-close-v6.inputs.json'
BASE_SHA = '9f5801a55c3a5a520ba1cc458bbc04c9e9118044cb0acee50def5b3289146bbd'
BASE_LAUNCHER = 'qualification/run-issued-current-close-v6.local.py'
BASE_LAUNCHER_SHA = '8545e1eb622aacf395b4eb4ec22d5c3d39b00273ec9795b8bb8a131ef4f10f59'
ENTRY = 'qualification/issued-current-close-v6.case.mjs'
PRELOAD = 'qualification/issued-current-close-v6.preload.mjs'
SELF = 'qualification/run-issued-current-close-reviewed-v7.local.py'
CONTRACT = 'qualification/issued_close_startup_contract.py'
CONTROL_NAMES = [CONTRACT, SELF]
PROJECT = 'x402-native-issued-reviewed-startup-v7-once'
QUOTA, FLOOR = 4194304, 10737418240


def require(value, code):
    if not value:
        raise ValueError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def module(path, name, raw):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    exec(compile(raw, str(path), 'exec'), value.__dict__)
    return value


def selection(repo, expected):
    require(type(expected) is str and re.fullmatch('[0-9a-f]{64}', expected), 'EXPLICIT_REVIEWED_MANIFEST')
    # The old launcher is loaded as unchanged definitions, never through main.
    require(repo.is_absolute() and os.path.normpath(repo) == str(repo), 'ABSOLUTE_SOURCE_ROOT')
    old_path = repo / BASE_LAUNCHER
    for at in (old_path, *old_path.parents):
        require(not at.is_symlink(), 'SOURCE_LINK')
    before = old_path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
        and before.st_nlink == 1 and before.st_size <= 65536, 'OWNED_FROZEN_LAUNCHER')
    fields = ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
    token = lambda value: tuple(getattr(value, name) for name in fields)
    with os.fdopen(os.open(old_path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        require(token(os.fstat(stream.fileno())) == token(before), 'FROZEN_LAUNCHER_OPEN_IDENTITY')
        old_raw = stream.read(65537)
        require(len(old_raw) == before.st_size and token(os.fstat(stream.fileno())) == token(before), 'FROZEN_LAUNCHER_READ_IDENTITY')
    require(token(old_path.lstat()) == token(before), 'FROZEN_LAUNCHER_PATH_IDENTITY')
    require(digest(old_raw) == BASE_LAUNCHER_SHA, 'PRESERVED_BASE_LAUNCHER')
    old = module(repo / BASE_LAUNCHER, 'reviewed_v7_preserved_v6_definitions', old_raw)
    raw, manifest_id = old.read(repo / MANIFEST, 524288)
    require(digest(raw) == expected, 'REVIEWED_MANIFEST_DIGEST')
    selected = json.loads(raw)
    require(set(selected) == {'kind', 'version', 'applicationVersion', 'baseSelection', 'controls',
        'effectsCeiling', 'taskPolicy', 'startupExpected', 'nativeAuthority', 'nativeCasesExecuted',
        'requiresFreshNativeApproval'}, 'CLOSED_REVIEWED_SELECTION')
    require(selected['kind'] == 'REVIEWED_ISSUED_CLOSE_STARTUP_V7_NOT_NATIVE_AUTHORITY'
        and type(selected['version']) is int and selected['version'] == 7
        and type(selected['applicationVersion']) is int and selected['applicationVersion'] == 6
        and selected['baseSelection'] == {'commit': '633d1cac0ae214571227df4ba7fc47088a78ac98',
            'path': BASE_MANIFEST, 'sha256': BASE_SHA}
        and selected['nativeAuthority'] == 'NONE' and type(selected['nativeCasesExecuted']) is int
        and selected['nativeCasesExecuted'] == 0 and selected['requiresFreshNativeApproval'] is True,
        'EXACT_REVIEWED_SELECTION')
    delta, base_raw, _old_controls, profile, old_unchanged = old.source_admission(repo, BASE_SHA)
    canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':'))
    require(canonical(selected['effectsCeiling']) == canonical(delta['effectsCeiling'])
        and canonical(selected['taskPolicy']) == canonical(delta['taskPolicy']), 'NO_EFFECT_OR_POLICY_EXPANSION')
    require(type(selected['controls']) is list and [r['path'] for r in selected['controls']] == CONTROL_NAMES,
        'EXACT_REVIEWED_CONTROL_SET')
    captures = {MANIFEST: (raw, manifest_id)}
    for row in selected['controls']:
        data, ident = old.read(repo / row['path'])
        require(old.pin(row['path'], data) == row, 'REVIEWED_CONTROL_PIN')
        captures[row['path']] = (data, ident)
    require(Path(__file__).absolute() == repo / SELF, 'REVIEWED_LAUNCHER_LOCATION')
    contract = module(repo / CONTRACT, 'reviewed_v7_startup_contract', captures[CONTRACT][0])
    review = contract.review_startup_sources(old_raw.decode('ascii'),
        old.read(repo / ENTRY)[0].decode('ascii'), old.read(repo / PRELOAD)[0].decode('ascii'))
    require(selected['startupExpected'] == contract.EXPECTED, 'FIXED_STARTUP_SELECTION')
    environment = dict(review['expectedEnvironment'])
    contract.require_startup_environment(environment, review)
    def unchanged():
        old_unchanged()
        for name, before in captures.items():
            require(old.read(repo / name) == before, 'REVIEWED_CONTROL_CHANGED')
    unchanged()
    return old, profile, delta, review, environment, unchanged


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--source-only', action='store_true')
    modes.add_argument('--pre-native-plan', action='store_true')
    modes.add_argument('--execute-reviewed-clean-v7', action='store_true')
    for name in ('packages', 'manager', 'node', 'root', 'store-id', 'volume', 'volume-uuid'):
        parser.add_argument('--' + name)
    parser.add_argument('--previous-root', action='append')
    args = parser.parse_args()
    require(sys.dont_write_bytecode, 'BYTECODE_DISABLED_REQUIRED')
    repo = Path(args.repo)
    old, profile, delta, startup, environment, unchanged = selection(repo, args.manifest_sha256)
    print(json.dumps(dict(event='REVIEWED_V7_STARTUP_SOURCE_ADMITTED', applicationFiles=123,
        packageFilesDeclared=404, packageFilesRead=0, originalStartupMatches=startup['originalStartupMatches'],
        originalMismatches=startup['mismatches'], correctedStartupMatches=True,
        sourceTransforms=False, effectsExecuted=False, nativeAuthority='NONE')), flush=True)
    if not args.pre_native_plan and not args.execute_reviewed_clean_v7:
        return 0
    require(all(getattr(args, name) is not None for name in
        ('packages', 'manager', 'node', 'root', 'store_id', 'volume', 'volume_uuid')), 'EXPLICIT_APPROVED_NATIVE_PATHS')
    packages, manager, node, root, volume = map(Path, (args.packages, args.manager, args.node, args.root, args.volume))
    require(all(p.is_absolute() and os.path.normpath(p) == str(p)
        for p in (repo, packages, manager, node, root, volume)), 'CANONICAL_NATIVE_PATHS')
    old.reservation_scope(root, args.previous_root)
    legacy = old.module(repo / old.CONTROLS[3], 'reviewed_v7_preserved_capacity')
    # Refuse capacity BEFORE installed packages, binaries, manager import/tasks.
    legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
    old.reservation_scope(root, args.previous_root, old.discover_reservation_roots(root.parent))
    root_raw, root_id = old.read(root / 'storage.json', 65536)
    root_identity = old.identity(root.lstat())
    built = profile.build_profile(str(repo), str(packages), delta, 'clean')
    manager_raw, manager_id = old.read(manager / 'storage.py', 262144)
    cli_raw, cli_id = old.read(manager / 'cli.py', 65536)
    require(digest(manager_raw) == legacy.STORAGE_SHA and digest(cli_raw) == legacy.CLI_SHA, 'UNCHANGED_APPROVED_MANAGER')
    node_id = legacy.binary(node, legacy.NODE_SHA, os.getuid(), 121304480)
    openssl = Path('/usr/bin/openssl')
    openssl_id = legacy.binary(openssl, legacy.OPENSSL_SHA, 0)
    storage = old.module(manager / 'storage.py', 'storage')
    store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and store.policy.min_free_bytes >= FLOOR, 'APPROVED_EXISTING_ROOT_AND_FLOOR')
    def before_native():
        unchanged()
        profile.recheck_captured_files(built['_captures'])
        require(old.identity(root.lstat()) == root_identity
            and old.read(root / 'storage.json', 65536) == (root_raw, root_id), 'ROOT_IDENTITY_CHANGED')
        require(old.identity(node.lstat()) == node_id and old.identity(openssl.lstat()) == openssl_id
            and old.identity((manager / 'storage.py').lstat()) == manager_id
            and old.identity((manager / 'cli.py').lstat()) == cli_id, 'TOOL_IDENTITY_CHANGED')
        old.reservation_scope(root, args.previous_root, old.discover_reservation_roots(root.parent))
        result = legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
        extra = max(0, max(store.policy.min_free_bytes, store.policy.safety_margin_bytes) - FLOOR)
        require(result['availableBytes'] >= result['requiredBytes'] + extra, 'EXISTING_LARGER_FLOOR_WITH_RESERVATIONS')
        return dict(result, requiredBytes=result['requiredBytes'] + extra)
    capacity = before_native()
    print(json.dumps(dict(event='REVIEWED_V7_PRE_NATIVE_PLAN', capacity=capacity,
        applicationFiles=123, packageFilesRead=404, correctedStartupMatches=True,
        effectsExecuted=False, nativeAuthority='NONE')), flush=True)
    if not args.execute_reviewed_clean_v7:
        return 0
    os.umask(0o077)
    # A new project/flag prevents reuse of the prior frozen one-shot marker.
    with storage.Lock(root / 'locks' / (PROJECT + '.lease')):
        with store.locked():
            require(not any(row['project'] == PROJECT for _, row in store._capacity(QUOTA)), 'REVIEWED_V7_ATTEMPT_ALREADY_CONSUMED')
        before_native()
        os.environ.clear()
        os.environ.update(environment)
        with store.task(PROJECT, expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
            task.record('reviewed-startup-scope.json', dict(controllerRevision=7, applicationVersion=6,
                startup= startup, effectsCeiling=delta['effectsCeiling'], sourceRowsSha256=delta['resolvedSourceRowsSha256'],
                sourceCopies=0, packageCopies=0, nativeOsNetworkSandbox=False))
            file = task.write('reviewed-v7-native-profile.json', built['profileBytes'])
            retained = task.preserve(file, built['profileSha256'], len(built['profileBytes']))
            profile_file = store.object(retained['sha256'], retained['bytes'])
            os.environ.update(X402_ISSUED_CLOSE_NATIVE_PROFILE_PATH=str(profile_file),
                X402_ISSUED_CLOSE_NATIVE_PROFILE_SHA256=built['profileSha256'])
            config = task.write('tls.cnf', old.TLS_CONFIG)
            before_native()
            tls = task.run([str(openssl), 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
                '-keyout', '/dev/stdout', '-config', str(config)], cwd=task.scratch, timeout=20, stdout_limit=65536, retain_argv=False)
            task.record('test-tls-generation.json', tls)
            require(tls['state'] == 'COMPLETE' and tls['output_complete'] is True
                and type(tls['actual_exit']) is int and tls['actual_exit'] == 0, 'TEST_TLS_FAILED_OR_UNKNOWN')
            gate = old.module(repo / old.CONTROLS[2], 'reviewed_v7_tls_framing')
            parts = gate.split_test_tls_stdout(store.object(tls['stdout']['sha256'], tls['stdout']['bytes']).read_bytes())
            for name, data in parts.items():
                file = task.write(name, data)
                require(old.read(file, 16384)[0] == data, 'PRIVATE_TEST_TLS_INPUT')
            parts = None
            before_native()
            argv = [str(node), '--no-addons', '--disallow-code-generation-from-strings', '--disable-proto=throw',
                '--unhandled-rejections=strict', '--test-reporter=tap', '--import=' + str(repo / PRELOAD),
                str(repo / ENTRY), str(task.scratch)]
            actual = task.run(argv, cwd=repo, timeout=90, stdout_limit=65536, retain_argv=False)
            task.record('actual-native-command.json', actual)
            unchanged()
            stdout = store.object(actual['stdout']['sha256'], actual['stdout']['bytes']).read_bytes()
            stderr = store.object(actual['stderr']['sha256'], actual['stderr']['bytes']).read_bytes()
            _, _, baseline, _ = profile.load_selection(str(repo), delta)
            result = profile.validate_native_capture(stdout, stderr, actual, delta, baseline)
            task.record('selected-native-result.json', dict(selectedNativeStatus='PASS', result=result,
                taskCloseAndCleanup='SEPARATE_NOT_ESTABLISHED'))
            for name in ('tls.cnf', 'tls-key.pem', 'tls-cert.pem'):
                data, _ = old.read(task.scratch / name, 16384)
                task.preserve(task.scratch / name, digest(data), len(data))
        closed = json.loads(old.read(task.directory / 'task.json', 4194304)[0])
        cleanup = json.loads(old.read(task.evidence / 'cleanup.json', 262144)[0])
        require(closed['state'] == 'CLOSED', 'OWNED_TASK_CLOSE_UNKNOWN_NO_NATIVE_REPLAY')
        print(json.dumps(dict(event='REVIEWED_V7_NATIVE_CAPTURE_COMPLETE', selectedNativeStatus='PASS',
            taskState=closed['state'], taskOutcome=closed['outcome'], cleanup=cleanup,
            childFilesPreservedNotDisposable=True, productionQualified=False)), flush=True)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        code = str(error) if type(error) is ValueError and re.fullmatch('[A-Z0-9_]+', str(error)) else 'REVIEW_PRIVATE_RECEIPTS'
        print(json.dumps(dict(event='REVIEWED_V7_REFUSED_OR_FAILED', code=code,
            nativeReplayAuthorized=False)), file=sys.stderr, flush=True)
        sys.exit(1)
