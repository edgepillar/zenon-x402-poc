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

SELF = 'qualification/run-sdk105-issued-command-application-v4.local.py'
MANIFEST = 'qualification/sdk105-issued-command-application-v4.inputs.json'
ENTRY = 'qualification/sdk105-issued-command-application-v4.case.mjs'
PRELOAD = 'qualification/sdk105-issued-command-application-v4.preload.mjs'
PROFILE = 'qualification/node_file_url_profile.py'
BASE = 'qualification/run-issued-current-close-v6.local.py'
BASE_SHA = '8545e1eb622aacf395b4eb4ec22d5c3d39b00273ec9795b8bb8a131ef4f10f59'
BASE_SELECTION_SHA = '9f5801a55c3a5a520ba1cc458bbc04c9e9118044cb0acee50def5b3289146bbd'
PROJECT = 'x402-sdk105-issued-command-application-v4'
ALLOWED_MODES = ['clean', 'pending', 'service-response-loss']
KIND = 'SDK105_ISSUED_COMMAND_APPLICATION_NODE24_V4'
QUOTA, FLOOR = 4194304, 10737418240
STARTUP = {
    'PATH': '/usr/bin:/bin', 'LANG': 'C', 'NODE_DISABLE_COMPILE_CACHE': '1',
    'WS_NO_BUFFER_UTIL': '1', 'WS_NO_UTF_8_VALIDATE': '1',
    'X402_SDK105_ISSUED_COMMAND_SELECTION': 'sdk105-issued-command-application-v4',
    'X402_SDK105_ISSUED_COMMAND_RUN_SCOPE': 'one-sdk105-issued-command-application-v4',
    'X402_SDK105_ISSUED_COMMAND_MODE': 'clean',
    # These two unchanged support factories have their own historical role flag.
    'X402_ISSUED_CLOSE_NATIVE_SELECTION': 'current-native-issued-close-source-v4',
}
DROPPED = [
    'app/qualification/issued-current-close-v6.case.mjs',
    'app/qualification/issued-current-close-v6.preload.mjs',
    'app/qualification/issued-funding-post-native-vertical.case.draft.mjs',
    'app/qualification/issued-funding-post-native-vertical.preload.draft.mjs',
    'app/src/x402-official-issued-funding-post-native-application.js',
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
        'startupExpected', 'allowedModes', 'controlInputs', 'nativeAuthority', 'nativeCasesExecuted'}, 'CLOSED_CURRENT_SELECTION')
    require(selected['kind'] == KIND and type(selected['version']) is int and selected['version'] == 1
        and selected['baseSelection'] == {'path': old.MANIFEST, 'sha256': BASE_SELECTION_SHA}
        and selected['entry'] == 'app/' + ENTRY and selected['preload'] == 'app/' + PRELOAD
        and selected['nativeAuthority'] == 'NONE' and type(selected['nativeCasesExecuted']) is int
        and selected['nativeCasesExecuted'] == 0 and selected['startupExpected'] == STARTUP
        and selected['allowedModes'] == ALLOWED_MODES,
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
        maximumCommandInputBytes=262144, maximumCommandOutputBytes=262144, commandResultWaitMs=7000,
        maximumCommittedResponseLossStops=1, additionalCompoundCommitReads=1, maximumDeferredCommitProbes=1)
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
    require(type(controls) is list and [row['path'] for row in controls] == [SELF, PROFILE], 'EXACT_CURRENT_CONTROLLER')
    for row in controls:
        data, identity = old.read(repo / row['path'])
        require(old.pin(row['path'], data) == row, 'CONTROLLER_SOURCE_PIN')
        captures.append((str(repo / row['path']), tuple(identity)))
    require(Path(__file__).absolute() == repo / SELF, 'CURRENT_CONTROLLER_LOCATION')
    # Check the actual case, preload AND both unchanged fixture role guards.
    for text in (source_text['app/' + ENTRY], source_text['app/' + PRELOAD]):
        require("!['clean', 'pending', 'service-response-loss'].includes(E.X402_SDK105_ISSUED_COMMAND_MODE)" in text,
            'CLOSED_CURRENT_MODE_GUARD')
        for name in ('X402_SDK105_ISSUED_COMMAND_SELECTION', 'X402_SDK105_ISSUED_COMMAND_RUN_SCOPE',
            'X402_ISSUED_CLOSE_NATIVE_SELECTION'):
            require('E.' + name + " !== '" + STARTUP[name] + "'" in text, 'CURRENT_ENTRY_STARTUP_GUARD')
    for fixture in ('issued-current-close-v4-rpc.fixture.mjs', 'issued-current-close-v4-grant.fixture.mjs'):
        text = source_text['app/qualification/' + fixture]
        require("process.env.X402_ISSUED_CLOSE_NATIVE_SELECTION,'" + STARTUP['X402_ISSUED_CLOSE_NATIVE_SELECTION'] + "'" in text,
            'SHARED_FIXTURE_ROLE_GUARD')
    count = re.search(r'const APP_FILES = ([0-9]+), PACKAGE_FILES = 404', source_text['app/' + PRELOAD])
    require(count is not None and int(count[1]) == len(app_rows), 'ACTUAL_PRELOAD_INVENTORY_COUNT')
    validate_preload_fixed(source_text['app/' + PRELOAD], indexed, additions)
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


def validate_preload_fixed(text, indexed, additions):
    # Admission must bind the preload's own literal pins, not just its row count.
    found = re.search(r'const FIXED = new Map\((\[[\s\S]*?\])\);\nconst EDGES', text)
    require(found is not None, 'ACTUAL_PRELOAD_FIXED_MAP')
    rows = json.loads(found[1])
    expected = {row['path']: row['sha256'] for row in additions if row['path'] != 'app/' + PRELOAD}
    for name in ('issued-current-close-v4-grant.fixture.mjs', 'issued-current-close-v4-rpc.fixture.mjs'):
        path = 'app/qualification/' + name; expected[path] = indexed[path]['sha256']
    require(type(rows) is list and all(type(row) is list and len(row) == 2 and all(type(x) is str for x in row) for row in rows)
        and len(rows) == len(expected) and len({row[0] for row in rows}) == len(rows)
        and dict(rows) == expected, 'EXACT_CURRENT_PRELOAD_FIXED_PINS')


def build_profile(repo, packages, old, legacy_profile, selected, rows, mode):
    # The published and DATA-qualified producer emits Node's canonical URLs.
    # Source admission captured this exact helper alongside the controller.
    require(mode in ALLOWED_MODES, 'EXACT_SELECTED_MODE')
    raw, _identity = old.read(repo / PROFILE)
    expected = next(row for row in selected['controlInputs'] if row['path'] == PROFILE)
    require(old.pin(PROFILE, raw) == expected, 'PINNED_CANONICAL_PROFILE_PRODUCER')
    producer = definitions(repo / PROFILE, 'sdk105_v4_canonical_profile_producer', raw)
    return producer.build_profile(repo, packages, old, legacy_profile, selected, rows, mode,
        kind=KIND, entry=ENTRY, allowed_modes=ALLOWED_MODES)


def native_result(stdout, stderr, receipt, selected, mode):
    require(mode in ALLOWED_MODES, 'EXACT_SELECTED_MODE')
    require(type(stdout) is bytes and type(stderr) is bytes and len(stdout) <= 65536 and len(stderr) <= 65536,
        'BOUNDED_NATIVE_CAPTURE')
    require(receipt['state'] == 'COMPLETE' and receipt['output_complete'] is True
        and type(receipt['actual_exit']) is int and receipt['actual_exit'] == 0, 'NATIVE_FAILED_OR_UNKNOWN')
    lines = stdout.decode('utf8').splitlines()
    def footer(prefix):
        found = [json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix)]
        require(len(found) == 1, 'EXACT_CURRENT_NATIVE_FOOTER'); return found[0]
    case = footer('# actual-sdk105-issued-command-application-v4 ')
    namespace = footer('# pinned-sdk105-issued-command-application-v4-namespace ')
    pending, loss = mode == 'pending', mode == 'service-response-loss'
    for field in ('caseCompleted', 'actualExistingSdk105KeyPair', 'actualOwnedCommandHost', 'actualApplication',
        'actualNativeHTTPS', 'actualOfficialCore', 'sameV6File'):
        require(case[field] is True, 'ACTUAL_CURRENT_COMPOSITION_REQUIRED')
    commands, results, services = (5, 4, 0) if pending else (6, 5, 1) if loss else (8, 7, 2)
    expected = dict(walletKeys=1, operatorAddressReads=1, observedSignedTransactions=1,
        handoffAfterOwnedKeyClose=not pending, capabilityKeys=2, capabilitySignatures=0 if pending else 3,
        independentPinFiles=1 if pending else 2, verify=1, firstSettle=1, pendingObserve=2,
        executions=0 if pending else 1 if loss else 2, rawClientStarts=1 if pending else 3,
        rawAuthenticated=1 if pending else 3, rawCleanCloses=1 if pending else 3,
        originalClientRepeatRefusals=0, backendExactReplays=0 if pending else 1,
        foreignGrantRefusals=0 if pending else 1, sameFileInitialCloses=1, borrowedSqlCloses=2,
        commandStarts=commands, commandResults=results)
    require(all(type(case['counts'][name]) is type(value) and case['counts'][name] == value for name, value in expected.items()),
        'EXACT_ACTUAL_CURRENT_COUNTERS')
    require(case['mode'] == mode and case['actualStreamCommands'] == commands and case['actualStreamResults'] == results
        and case['fundingPosts'] == 1 and case['actualClientServiceRequests'] == services
        and case['expectedHeldCommandOwner'] is loss and case['actualV6PhysicalRelease'] == 'NOT_QUALIFIED'
        and case['realPayment'] is False and case['sdkPrepareBlock'] is False and case['productionQualified'] is False
        and case['sourceTransforms'] == case['nativeModuleAliases'] == 0, 'NO_IMPLICIT_AUTHORITY_OR_REPLACEMENT')
    require(case['counts']['commandInputBytes'] <= 262144 and case['counts']['commandOutputBytes'] <= 262144
        and 1 <= case['counts']['referenceWindows'] <= 8 and 1 <= case['counts']['referenceCandidates'] <= 32768
        and case['aggregateCandidateReservation'] == case['counts']['referenceCandidates'] + 4096 + 16384 <= 65536,
        'FINITE_ACTUAL_COMMAND_AND_NONCE_BUDGETS')
    close = case['closeProof']
    require(close['sessionHeld'] is loss and close['sessionLifecycle'] == ('HELD' if loss else 'CLOSED')
        and close['nativePhysicalDrain'] == close['actualV6PhysicalRelease'] == 'NOT_QUALIFIED', 'HONEST_OWNER_CLOSE')
    if loss:
        gate = case['responseLoss']
        require(gate['phase'] == 'COMMITTED_STOP_REQUESTED' and gate['unknown'] is False
            and gate['commitMatched'] is True and gate['queueAttempts'] == gate['probeEntries'] == gate['stopAttempts'] == 1
            and gate['stopVoidObserved'] is True and type(gate['revision']) is int and gate['revision'] >= 1
            and gate['nativeDeliveryLoss'] == 'NOT_ESTABLISHED' and gate['nativePhysicalDrain'] == 'NOT_QUALIFIED'
            and close['actualCommandHostClosed'] is False and close['hostStatus'] in ('CLOSE_UNKNOWN', 'OUTCOME_UNKNOWN'),
            'ACTUAL_COMMIT_THEN_STOP_AND_CLIENT_REFUSAL_REQUIRED')
    else:
        require(case['responseLoss'] is None and close['currentOwnersClosed'] is True and close['actualCommandHostClosed'] is True
            and close['hostStatus'] == close['clientClose'] == close['channelClose'] == 'CLOSED', 'ACTUAL_NORMAL_COMMAND_CLOSE')
    require(case['grantActivation'] == ('NOT_REQUESTED_PENDING' if pending else 'ACTUAL_COMPOSITION_WITH_SYNTHETIC_SIGNED_PROVIDER_ENVELOPES'),
        'NO_GRANT_FROM_PENDING')
    require(namespace['mode'] == mode and namespace['profileKind'] == KIND and namespace['profileVersion'] == 1
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
    parser.add_argument('--mode', choices=ALLOWED_MODES, default='clean')
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--source-only', action='store_true'); modes.add_argument('--pre-native-plan', action='store_true')
    modes.add_argument('--execute-sdk105-issued-command-application-v4', action='store_true')
    for name in ('packages', 'manager', 'node', 'root', 'store-id', 'volume', 'volume-uuid'):
        parser.add_argument('--' + name)
    parser.add_argument('--previous-root', action='append')
    args = parser.parse_args(); require(sys.dont_write_bytecode, 'BYTECODE_DISABLED_REQUIRED')
    repo = Path(args.repo)
    old, profile, _delta, selected, rows, _inputs, _captures, unchanged, edges = source_selection(repo, args.manifest_sha256)
    print(json.dumps(dict(event='SDK105_ISSUED_COMMAND_SOURCE_ADMITTED', applicationFiles=selected['resolvedApplicationFiles'],
        packageFilesDeclared=404, packageFilesRead=0, reviewedLiteralEdges=edges, startupMatches=True,
        selectedMode=args.mode, allowedModes=ALLOWED_MODES, preloadFixedPinsMatched=True,
        sourceTransforms=False, nativeAuthority='NONE', nativeCasesExecuted=0)), flush=True)
    if not args.pre_native_plan and not args.execute_sdk105_issued_command_application_v4:
        return 0
    require(all(getattr(args, name) is not None for name in ('packages', 'manager', 'node', 'root', 'store_id', 'volume', 'volume_uuid')),
        'EXPLICIT_APPROVED_NATIVE_PATHS')
    project = PROJECT + '-' + args.mode + '-once'
    packages, manager, node, root, volume = map(Path, (args.packages, args.manager, args.node, args.root, args.volume))
    require(all(path.is_absolute() and os.path.normpath(path) == str(path) for path in (packages, manager, node, root, volume)),
        'CANONICAL_NATIVE_PATHS')
    old.reservation_scope(root, args.previous_root)
    legacy = old.module(repo / old.CONTROLS[3], 'sdk105_preserved_capacity')
    legacy.capacity(volume, args.volume_uuid, root, args.previous_root)
    old.reservation_scope(root, args.previous_root, old.discover_reservation_roots(root.parent))
    root_raw, root_id = old.read(root / 'storage.json', 65536); root_identity = old.identity(root.lstat())
    built = build_profile(repo, packages, old, profile, selected, rows, args.mode)
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
    if not args.execute_sdk105_issued_command_application_v4:
        return 0
    os.umask(0o077)
    with storage.Lock(root / 'locks' / (project + '.lease')):
        with store.locked():
            require(not any(row['project'] == project for _, row in store._capacity(QUOTA)), 'CURRENT_NATIVE_ATTEMPT_ALREADY_CONSUMED')
        before_native(); os.environ.clear(); os.environ.update(STARTUP); os.environ['X402_SDK105_ISSUED_COMMAND_MODE'] = args.mode
        with store.task(project, expected_bytes=QUOTA, quota_bytes=QUOTA) as task:
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
            result = native_result(stdout, stderr, actual, selected, args.mode)
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
