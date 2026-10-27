"""Current SDK105 command/native qualification. Source-only by default.

The execute flag is not human authority. A separate finite approval is required.
Reuse checked historical definitions/inventories, never their main or allowance.
No installed package is read in source-only mode. No source is transformed,
copied or rebound; no root, reservation, policy or historical evidence is edited.
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

SELF = 'qualification/run-sdk105-issued-command-clean-v1.local.py'
MANIFEST = 'qualification/sdk105-issued-command-clean-v1.inputs.json'
ENTRY = 'qualification/sdk105-issued-command-clean-v1.case.mjs'
PRELOAD = 'qualification/sdk105-issued-command-clean-v1.preload.mjs'
BASE = 'qualification/run-issued-current-close-v6.local.py'
BASE_SHA = '8545e1eb622aacf395b4eb4ec22d5c3d39b00273ec9795b8bb8a131ef4f10f59'
BASE_SELECTION_SHA = '9f5801a55c3a5a520ba1cc458bbc04c9e9118044cb0acee50def5b3289146bbd'
PROJECT = 'x402-sdk105-issued-command-clean-v1-once'
KIND = 'SDK105_ISSUED_COMMAND_ONE_CLEAN_NODE24_V1'
QUOTA, FLOOR = 4194304, 10737418240
STARTUP = {
    'PATH': '/usr/bin:/bin', 'LANG': 'C', 'NODE_DISABLE_COMPILE_CACHE': '1',
    'WS_NO_BUFFER_UTIL': '1', 'WS_NO_UTF_8_VALIDATE': '1',
    'X402_SDK105_ISSUED_COMMAND_SELECTION': 'sdk105-issued-command-clean-v1',
    'X402_SDK105_ISSUED_COMMAND_RUN_SCOPE': 'one-sdk105-issued-command-clean-v1',
    'X402_SDK105_ISSUED_COMMAND_MODE': 'clean',
    # These two unchanged support factories have their own historical role flag.
    'X402_ISSUED_CLOSE_NATIVE_SELECTION': 'current-native-issued-close-source-v4',
}
DROPPED = [
    'app/qualification/issued-current-close-v6.case.mjs',
    'app/qualification/issued-current-close-v6.preload.mjs',
    'app/qualification/issued-funding-post-native-vertical.case.draft.mjs',
    'app/qualification/issued-funding-post-native-vertical.preload.draft.mjs',
]


def require(value, code):
    if not value:
        raise ValueError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')


def definitions(path, name, raw):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    exec(compile(raw, str(path), 'exec'), value.__dict__)
    return value


def source_selection(repo, expected):
    require(type(expected) is str and re.fullmatch('[0-9a-f]{64}', expected), 'EXPLICIT_CURRENT_MANIFEST')
    require(repo.is_absolute() and os.path.normpath(repo) == str(repo), 'ABSOLUTE_CURRENT_SOURCE')
    path = repo / BASE
    for at in (path, *path.parents):
        require(not at.is_symlink(), 'BASE_SOURCE_LINK')
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
        and before.st_size <= 65536, 'OWNED_BASE_SOURCE')
    raw = path.read_bytes()
    require(sha(raw) == BASE_SHA, 'UNCHANGED_BASE_DEFINITIONS')
    old = definitions(path, 'sdk105_preserved_v6_definitions', raw)
    require(old.read(path) == (raw, old.identity(before)), 'STABLE_BASE_DEFINITIONS')
    delta, _raw, _controls, profile, old_unchanged = old.source_admission(repo, BASE_SELECTION_SHA)
    raw, manifest_id = old.read(repo / MANIFEST, 524288)
    require(sha(raw) == expected, 'CURRENT_MANIFEST_DIGEST')
    selected = json.loads(raw)
    require(set(selected) == {'kind', 'version', 'baseSelection', 'removedApplicationRows', 'addedApplicationRows',
        'resolvedApplicationFiles', 'packageFiles', 'resolvedSourceRowsSha256', 'resolvedSourceBytes', 'packageRowsSha256',
        'entry', 'preload', 'bareBindings', 'allowedBuiltins', 'packageVersions', 'effectsCeiling', 'taskPolicy',
        'startupExpected', 'controlInputs', 'nativeAuthority', 'nativeCasesExecuted'}, 'CLOSED_CURRENT_SELECTION')
    require(selected['kind'] == KIND and type(selected['version']) is int and selected['version'] == 1
        and selected['baseSelection'] == {'path': old.MANIFEST, 'sha256': BASE_SELECTION_SHA}
        and selected['entry'] == 'app/' + ENTRY and selected['preload'] == 'app/' + PRELOAD
        and selected['nativeAuthority'] == 'NONE' and type(selected['nativeCasesExecuted']) is int
        and selected['nativeCasesExecuted'] == 0 and selected['startupExpected'] == STARTUP,
        'EXACT_CURRENT_SOURCE_SELECTION')
    require(selected['removedApplicationRows'] == DROPPED, 'ONLY_UNUSED_HISTORICAL_CASE_ROWS_REMOVED')
    _app, _ident, _base, baseline_rows = profile.load_selection(str(repo), delta)
    indexed = {row['path']: row for row in baseline_rows}
    for name in DROPPED:
        require(name in indexed, 'PRESERVED_BASE_ROW'); del indexed[name]
    additions = selected['addedApplicationRows']
    require(type(additions) is list and 2 <= len(additions) <= 64, 'BOUNDED_CURRENT_ADDITIONS')
    for row in additions:
        name = profile.row(row)
        require(name.startswith('app/') and name not in indexed and name not in DROPPED, 'DISTINCT_NEW_APPLICATION_ROW')
        indexed[name] = row
    rows = [indexed[name] for name in sorted(indexed)]
    packages = [row for row in rows if row['path'].startswith('packages/')]
    app_rows = [row for row in rows if row['path'].startswith('app/')]
    require(len(packages) == selected['packageFiles'] == 404 and len(app_rows) == selected['resolvedApplicationFiles']
        and sha(canonical(packages)) == selected['packageRowsSha256'] == delta['packageRowsSha256']
        and sha(canonical(rows)) == selected['resolvedSourceRowsSha256']
        and sum(row['bytes'] for row in rows) == selected['resolvedSourceBytes'] <= 6291456,
        'COMPLETE_CURRENT_APPLICATION_AND_UNCHANGED_PACKAGES')
    require(selected['packageVersions'] == delta['packageVersions'] and selected['taskPolicy'] == delta['taskPolicy'],
        'UNCHANGED_EXISTING_PACKAGE_VERSIONS_AND_STORAGE_POLICY')
    effects = dict(delta['effectsCeiling'], ownedStreamCommands=8, ownedStreamResults=7,
        maximumCommandInputBytes=262144, maximumCommandOutputBytes=262144, commandResultWaitMs=7000)
    require(selected['effectsCeiling'] == effects, 'FIXED_CURRENT_EFFECT_CEILING')
    builtins = sorted(set(delta['allowedBuiltins'] + ['node:process']))
    require(selected['allowedBuiltins'] == builtins, 'CLOSED_CURRENT_BUILTINS')
    edges = [edge for edge in delta['bareBindings'] if edge['parent'] not in DROPPED]
    for specifier, target in [('znn-typescript-sdk', 'packages/znn-typescript-sdk/dist/index.js'),
        ('@noble/ed25519', 'packages/@noble/ed25519/index.js'), ('@noble/hashes/sha2', 'packages/@noble/hashes/esm/sha2.js')]:
        edges.append(dict(parent='app/' + ENTRY, specifier=specifier, target=target))
    key = lambda edge: (edge['parent'], edge['specifier'])
    require(sorted(selected['bareBindings'], key=key) == sorted(edges, key=key), 'ONLY_EXACT_REAL_PACKAGE_EDGES')
    captures, app_inputs, source_text = [], [], {}
    for row in app_rows:
        path = repo / row['path'][4:]
        data, identity = old.read(path)
        require(old.pin(row['path'], data) == row, 'CURRENT_APPLICATION_INPUT')
        captures.append((str(path), tuple(identity)))
        app_inputs.append(dict(logicalPath=row['path'], url=path.as_uri(), bytes=len(data), sha256=row['sha256'], identity=identity))
        if path.suffix in ('.js', '.mjs'):
            source_text[row['path']] = data.decode('ascii')
    controls = selected['controlInputs']
    require(type(controls) is list and [row['path'] for row in controls] == [SELF], 'EXACT_CURRENT_CONTROLLER')
    for row in controls:
        data, identity = old.read(repo / row['path'])
        require(old.pin(row['path'], data) == row, 'CONTROLLER_SOURCE_PIN')
        captures.append((str(repo / row['path']), tuple(identity)))
    require(Path(__file__).absolute() == repo / SELF, 'CURRENT_CONTROLLER_LOCATION')
    # Check the actual case, preload AND both unchanged fixture role guards.
    for text in (source_text['app/' + ENTRY], source_text['app/' + PRELOAD]):
        for name in ('X402_SDK105_ISSUED_COMMAND_SELECTION', 'X402_SDK105_ISSUED_COMMAND_RUN_SCOPE',
            'X402_SDK105_ISSUED_COMMAND_MODE', 'X402_ISSUED_CLOSE_NATIVE_SELECTION'):
            require('E.' + name + " !== '" + STARTUP[name] + "'" in text, 'CURRENT_ENTRY_STARTUP_GUARD')
    for fixture in ('issued-current-close-v4-rpc.fixture.mjs', 'issued-current-close-v4-grant.fixture.mjs'):
        text = source_text['app/qualification/' + fixture]
        require("process.env.X402_ISSUED_CLOSE_NATIVE_SELECTION,'" + STARTUP['X402_ISSUED_CLOSE_NATIVE_SELECTION'] + "'" in text,
            'SHARED_FIXTURE_ROLE_GUARD')
    count = re.search(r'const APP_FILES = ([0-9]+), PACKAGE_FILES = 404', source_text['app/' + PRELOAD])
    require(count is not None and int(count[1]) == len(app_rows), 'ACTUAL_PRELOAD_INVENTORY_COUNT')
    edge_map = {(edge['parent'], edge['specifier']): edge['target'] for edge in edges}
    # Conservative literal-edge source review, not a JavaScript parser or runtime claim.
    reviewed_edges = 0
    for parent, text in source_text.items():
        specs = re.findall(r'\bfrom\s*[\'\"]([^\'\"]+)[\'\"]|\bimport\s*\(\s*[\'\"]([^\'\"]+)[\'\"]\s*\)', text)
        for pair in specs:
            specifier = pair[0] or pair[1]; reviewed_edges += 1
            if specifier.startswith('node:'):
                require(specifier in builtins, 'CURRENT_BUILTIN_EDGE')
            elif specifier.startswith('.'):
                target = os.path.normpath(str(Path(parent).parent / specifier))
                require(target in indexed, 'CURRENT_RELATIVE_SOURCE_EDGE')
            else:
                require(edge_map.get((parent, specifier)) in indexed, 'CURRENT_BARE_SOURCE_EDGE')
    def unchanged():
        old_unchanged()
        require(old.read(repo / MANIFEST, 524288) == (raw, manifest_id), 'CURRENT_SELECTION_CHANGED')
        profile.recheck_captured_files(tuple(captures))
    unchanged()
    return old, profile, delta, selected, rows, app_inputs, tuple(captures), unchanged, reviewed_edges


def build_profile(repo, packages, old, legacy_profile, selected, rows):
    _path, app_id = legacy_profile.root(str(repo))
    _path, package_id = legacy_profile.root(str(packages))
    require(app_id[:2] != package_id[:2], 'INDEPENDENT_EXISTING_SOURCE_ROOTS')
    captures = [(str(repo), tuple(app_id)), (str(packages), tuple(package_id))]
    inputs, indexed, physical, versions = [], {}, set(), {}
    for row in rows:
        name = row['path']; path = repo / name[4:] if name.startswith('app/') else packages / name[9:]
        raw, identity = old.read(path)
        require(old.pin(name, raw) == row and tuple(identity[:2]) not in physical, 'EXACT_UNALIASED_EXISTING_INPUT')
        physical.add(tuple(identity[:2])); captures.append((str(path), tuple(identity)))
        value = dict(logicalPath=name, url=path.as_uri(), bytes=len(raw), sha256=row['sha256'], identity=identity)
        inputs.append(value); indexed[name] = value
        if name in selected['packageVersions']:
            versions[name] = json.loads(raw)['version']
    require(versions == selected['packageVersions'], 'EXACT_EXISTING_PACKAGE_VERSIONS')
    bindings = [dict(parentURL=indexed[edge['parent']]['url'], specifier=edge['specifier'], targetURL=indexed[edge['target']]['url'])
        for edge in selected['bareBindings']]
    value = dict(profileVersion=1, profileKind=KIND, runtime=dict(node='24.19.0', platform='darwin', arch='arm64'),
        mode='clean', entryURL=indexed['app/' + ENTRY]['url'], inputs=inputs, bareBindings=bindings,
        allowedBuiltins=selected['allowedBuiltins'], sourceRowsSha256=selected['resolvedSourceRowsSha256'],
        sourceTransform=False, ordinaryInstalledNamespace=False)
    encoded = canonical(value) + b'\n'
    require(len(encoded) <= 524288, 'BOUNDED_CURRENT_PRIVATE_PROFILE')
    legacy_profile.recheck_captured_files(tuple(captures))
    return dict(profileBytes=encoded, profileSha256=sha(encoded), _captures=tuple(captures))


def native_result(stdout, stderr, receipt, selected):
    require(type(stdout) is bytes and type(stderr) is bytes and len(stdout) <= 65536 and len(stderr) <= 65536,
        'BOUNDED_NATIVE_CAPTURE')
    require(receipt['state'] == 'COMPLETE' and receipt['output_complete'] is True
        and type(receipt['actual_exit']) is int and receipt['actual_exit'] == 0, 'NATIVE_FAILED_OR_UNKNOWN')
    lines = stdout.decode('utf8').splitlines()
    def footer(prefix):
        found = [json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix)]
        require(len(found) == 1, 'EXACT_CURRENT_NATIVE_FOOTER'); return found[0]
    case = footer('# actual-sdk105-issued-command-clean-v1 ')
    namespace = footer('# pinned-sdk105-issued-command-clean-v1-namespace ')
    for field in ('caseCompleted', 'actualExistingSdk105KeyPair', 'actualOwnedCommandHost', 'actualApplication',
        'actualNativeHTTPS', 'actualOfficialCore', 'sameV6File'):
        require(case[field] is True, 'ACTUAL_CURRENT_COMPOSITION_REQUIRED')
    expected = dict(walletKeys=1, operatorAddressReads=1, observedSignedTransactions=1,
        handoffAfterOwnedKeyClose=True, capabilityKeys=2, capabilitySignatures=3, independentPinFiles=2,
        verify=1, firstSettle=1, pendingObserve=2, executions=2, rawClientStarts=3, rawAuthenticated=3,
        rawCleanCloses=3, originalClientRepeatRefusals=0, backendExactReplays=1, foreignGrantRefusals=1,
        sameFileInitialCloses=1, borrowedSqlCloses=2, commandStarts=8, commandResults=7)
    require(all(type(case['counts'][name]) is type(value) and case['counts'][name] == value for name, value in expected.items()),
        'EXACT_ACTUAL_CURRENT_COUNTERS')
    require(case['actualStreamCommands'] == 8 and case['actualStreamResults'] == 7 and case['fundingPosts'] == 1
        and case['actualClientServiceRequests'] == 2 and case['expectedHeldV6'] is False
        and case['realPayment'] is False and case['sdkPrepareBlock'] is False and case['productionQualified'] is False
        and case['sourceTransforms'] == case['nativeModuleAliases'] == 0, 'NO_IMPLICIT_AUTHORITY_OR_REPLACEMENT')
    require(case['counts']['commandInputBytes'] <= 262144 and case['counts']['commandOutputBytes'] <= 262144
        and 1 <= case['counts']['referenceWindows'] <= 8 and 1 <= case['counts']['referenceCandidates'] <= 32768
        and case['aggregateCandidateReservation'] == case['counts']['referenceCandidates'] + 4096 + 16384 <= 65536,
        'FINITE_ACTUAL_COMMAND_AND_NONCE_BUDGETS')
    require(case['closeProof']['currentOwnersClosed'] is True
        and case['closeProof']['clientClose'] == case['closeProof']['channelClose'] == 'CLOSED'
        and case['closeProof']['nativePhysicalDrain'] == 'NOT_QUALIFIED', 'ACTUAL_OWNER_CLOSE_WITHOUT_PHYSICAL_CLAIM')
    require(namespace['profileKind'] == KIND and namespace['profileVersion'] == 1
        and namespace['applicationFiles'] == selected['resolvedApplicationFiles'] and namespace['packageFiles'] == 404
        and namespace['inputsVerifiedBeforeCase'] == selected['resolvedApplicationFiles'] + 404
        and namespace['sourceRowsSha256'] == selected['resolvedSourceRowsSha256']
        and namespace['sourceTransforms'] == namespace['nativeBuiltinAliases'] == 0
        and namespace['nativeOsNetworkSandbox'] is False, 'CURRENT_ACTUAL_NAMESPACE')
    require(all(line in lines for line in ('# tests 1', '# pass 1', '# fail 0', '# cancelled 0', '# skipped 0', '# todo 0')),
        'ONE_ACTUAL_NATIVE_TEST_NO_SKIP')
    return dict(case=case, namespace=namespace, nativePhysicalDrain='NOT_QUALIFIED', productionQualified=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True); parser.add_argument('--manifest-sha256', required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--source-only', action='store_true'); modes.add_argument('--pre-native-plan', action='store_true')
    modes.add_argument('--execute-sdk105-issued-command-clean-v1', action='store_true')
    for name in ('packages', 'manager', 'node', 'root', 'store-id', 'volume', 'volume-uuid'):
        parser.add_argument('--' + name)
    parser.add_argument('--previous-root', action='append')
    args = parser.parse_args(); require(sys.dont_write_bytecode, 'BYTECODE_DISABLED_REQUIRED')
    repo = Path(args.repo)
    old, profile, _delta, selected, rows, _inputs, _captures, unchanged, edges = source_selection(repo, args.manifest_sha256)
    print(json.dumps(dict(event='SDK105_ISSUED_COMMAND_SOURCE_ADMITTED', applicationFiles=selected['resolvedApplicationFiles'],
        packageFilesDeclared=404, packageFilesRead=0, reviewedLiteralEdges=edges, startupMatches=True,
        sourceTransforms=False, nativeAuthority='NONE', nativeCasesExecuted=0)), flush=True)
    if not args.pre_native_plan and not args.execute_sdk105_issued_command_clean_v1:
        return 0
    require(all(getattr(args, name) is not None for name in ('packages', 'manager', 'node', 'root', 'store_id', 'volume', 'volume_uuid')),
        'EXPLICIT_APPROVED_NATIVE_PATHS')
    packages, manager, node, root, volume = map(Path, (args.packages, args.manager, args.node, args.root, args.volume))
    require(all(path.is_absolute() and os.path.normpath(path) == str(path) for path in (packages, manager, node, root, volume)),
        'CANONICAL_NATIVE_PATHS')
    old.reservation_scope(root, args.previous_root)
    legacy = old.module(repo / old.CONTROLS[3], 'sdk105_preserved_capacity')
    legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
    old.reservation_scope(root, args.previous_root, old.discover_reservation_roots(root.parent))
    root_raw, root_id = old.read(root / 'storage.json', 65536); root_identity = old.identity(root.lstat())
    built = build_profile(repo, packages, old, profile, selected, rows)
    manager_raw, manager_id = old.read(manager / 'storage.py', 262144); cli_raw, cli_id = old.read(manager / 'cli.py', 65536)
    require(sha(manager_raw) == legacy.STORAGE_SHA and sha(cli_raw) == legacy.CLI_SHA, 'UNCHANGED_APPROVED_MANAGER')
    node_id = legacy.binary(node, legacy.NODE_SHA, os.getuid(), 121304480)
    openssl = Path('/usr/bin/openssl'); openssl_id = legacy.binary(openssl, legacy.OPENSSL_SHA, 0)
    storage = old.module(manager / 'storage.py', 'storage'); store = storage.Store(root, metadata_lock_timeout=5)
    require(store.id == args.store_id and store.policy.min_free_bytes >= FLOOR, 'APPROVED_EXISTING_ROOT_AND_FLOOR')
    def before_native():
        unchanged(); profile.recheck_captured_files(built['_captures'])
        require(old.identity(root.lstat()) == root_identity and old.read(root / 'storage.json', 65536) == (root_raw, root_id), 'ROOT_IDENTITY_CHANGED')
        require(old.identity(node.lstat()) == node_id and old.identity(openssl.lstat()) == openssl_id
            and old.identity((manager / 'storage.py').lstat()) == manager_id and old.identity((manager / 'cli.py').lstat()) == cli_id,
            'TOOL_IDENTITY_CHANGED')
        old.reservation_scope(root, args.previous_root, old.discover_reservation_roots(root.parent))
        result = legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
        extra = max(0, max(store.policy.min_free_bytes, store.policy.safety_margin_bytes) - FLOOR)
        require(result['availableBytes'] >= result['requiredBytes'] + extra, 'EXISTING_LARGER_FLOOR_WITH_RESERVATIONS')
        return dict(result, requiredBytes=result['requiredBytes'] + extra)
    capacity = before_native()
    print(json.dumps(dict(event='SDK105_ISSUED_COMMAND_PRE_NATIVE_PLAN', capacity=capacity, packageFilesRead=404,
        nativeAuthority='NONE', nativeCasesExecuted=0)), flush=True)
    if not args.execute_sdk105_issued_command_clean_v1:
        return 0
    os.umask(0o077)
    with storage.Lock(root / 'locks' / (PROJECT + '.lease')):
        with store.locked():
            require(not any(row['project'] == PROJECT for _, row in store._capacity(QUOTA)), 'CURRENT_NATIVE_ATTEMPT_ALREADY_CONSUMED')
        before_native(); os.environ.clear(); os.environ.update(STARTUP)
        with store.task(PROJECT, expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
            task.record('current-sdk105-scope.json', dict(selection=selected, existingSourcesRecopied=False, nativeOsNetworkSandbox=False))
            file = task.write('sdk105-issued-command-native-profile.json', built['profileBytes'])
            retained = task.preserve(file, built['profileSha256'], len(built['profileBytes']))
            profile_file = store.object(retained['sha256'], retained['bytes'])
            os.environ.update(X402_SDK105_ISSUED_COMMAND_PROFILE_PATH=str(profile_file),
                X402_SDK105_ISSUED_COMMAND_PROFILE_SHA256=built['profileSha256'])
            config = task.write('tls.cnf', old.TLS_CONFIG); before_native()
            tls = task.run([str(openssl), 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
                '-keyout', '/dev/stdout', '-config', str(config)], cwd=task.scratch, timeout=20, stdout_limit=65536, retain_argv=False)
            task.record('test-tls-generation.json', tls)
            require(tls['state'] == 'COMPLETE' and tls['output_complete'] is True
                and type(tls['actual_exit']) is int and tls['actual_exit'] == 0, 'TEST_TLS_FAILED_OR_UNKNOWN')
            gate = old.module(repo / old.CONTROLS[2], 'sdk105_preserved_tls_framing')
            parts = gate.split_test_tls_stdout(store.object(tls['stdout']['sha256'], tls['stdout']['bytes']).read_bytes())
            for name, data in parts.items():
                file = task.write(name, data); require(old.read(file, 16384)[0] == data, 'PRIVATE_TEST_TLS_INPUT')
            parts = None; before_native()
            actual = task.run([str(node), '--no-addons', '--disallow-code-generation-from-strings', '--disable-proto=throw',
                '--unhandled-rejections=strict', '--test-reporter=tap', '--import=' + str(repo / PRELOAD),
                str(repo / ENTRY), str(task.scratch)], cwd=repo, timeout=90, stdout_limit=65536, retain_argv=False)
            task.record('actual-native-command.json', actual); unchanged()
            stdout = store.object(actual['stdout']['sha256'], actual['stdout']['bytes']).read_bytes()
            stderr = store.object(actual['stderr']['sha256'], actual['stderr']['bytes']).read_bytes()
            result = native_result(stdout, stderr, actual, selected)
            task.record('selected-current-native-result.json', dict(selectedNativeStatus='PASS', result=result, taskCleanup='SEPARATE_NOT_ESTABLISHED'))
            for name in ('tls.cnf', 'tls-key.pem', 'tls-cert.pem'):
                data, _identity = old.read(task.scratch / name, 16384)
                task.preserve(task.scratch / name, sha(data), len(data))
        closed = json.loads(old.read(task.directory / 'task.json', 4194304)[0])
        cleanup = json.loads(old.read(task.evidence / 'cleanup.json', 262144)[0])
        require(closed['state'] == 'CLOSED', 'OWNED_TASK_CLOSE_UNKNOWN_NO_NATIVE_REPLAY')
        print(json.dumps(dict(event='SDK105_ISSUED_COMMAND_NATIVE_CAPTURE_COMPLETE', selectedNativeStatus='PASS',
            taskState=closed['state'], taskOutcome=closed['outcome'], cleanup=cleanup,
            childFilesPreservedNotDisposable=True, productionQualified=False)), flush=True)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        code = str(error) if type(error) is ValueError and re.fullmatch('[A-Z0-9_]+', str(error)) else 'REVIEW_PRIVATE_RECEIPTS'
        print(json.dumps(dict(event='SDK105_ISSUED_COMMAND_REFUSED_OR_FAILED', code=code, nativeReplayAuthorized=False)),
            file=sys.stderr, flush=True)
        sys.exit(1)
