"""Source-only funding-response-loss selection, with no native execute flag.

Reuse exact V5 runtime/package inputs and replace only four qualification rows.
Native execution needs a separate source-bound host and fresh finite authority.
No controller main, old allowance, source transform, installation or copy follows.
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

SELF = 'qualification/run-sdk105-issued-command-application-v7.local.py'
MANIFEST = 'qualification/sdk105-issued-command-application-v7.inputs.json'
ENTRY = 'qualification/sdk105-issued-command-application-v7.case.mjs'
PRELOAD = 'qualification/sdk105-issued-command-application-v7.preload.mjs'
PROFILE = 'qualification/node_file_url_profile.py'
BASE = 'qualification/run-sdk105-issued-command-application-v5.local.py'
BASE_SHA = 'd2abb4960ce8e84fc2bf0dd88b44c82f143655614820fcc0f625f097af40dac4'
BASE_SELECTION_SHA = '087df3b143f1802f75e7bbaaf295371bc32ef82eba2f75f8ee7a644a5b3ceb24'
KIND = 'SDK105_ISSUED_COMMAND_APPLICATION_NODE24_V7'
ALLOWED_MODES = ['funding-response-loss']
PROJECT = 'x402-sdk105-issued-command-application-v7-funding-loss'
STARTUP = {
    'PATH': '/usr/bin:/bin', 'LANG': 'C', 'NODE_DISABLE_COMPILE_CACHE': '1',
    'WS_NO_BUFFER_UTIL': '1', 'WS_NO_UTF_8_VALIDATE': '1',
    'X402_SDK105_ISSUED_COMMAND_SELECTION': 'sdk105-issued-command-application-v7',
    'X402_SDK105_ISSUED_COMMAND_RUN_SCOPE': 'one-sdk105-issued-command-application-v7',
    'X402_SDK105_ISSUED_COMMAND_MODE': 'funding-response-loss',
    'X402_ISSUED_CLOSE_NATIVE_SELECTION': 'current-native-issued-close-source-v4',
}
DROPPED = [
    'app/qualification/sdk105-issued-command-application-v5.case.mjs',
    'app/qualification/sdk105-issued-command-application-v5.preload.mjs',
    'app/qualification/committed-response-loss-gate.mjs',
    'app/qualification/native-committed-response-loss.fixture.mjs',
]
ADDED = [
    'app/' + ENTRY, 'app/' + PRELOAD,
    'app/qualification/funding-bound-response-loss-gate.mjs',
    'app/qualification/native-funding-bound-response-loss.fixture.mjs',
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


def checked_base(repo):
    path = repo / BASE
    require(repo.is_absolute() and os.path.normpath(repo) == str(repo), 'CANONICAL_SOURCE_ROOT')
    for at in (path, *path.parents):
        require(not at.is_symlink(), 'PRESERVED_CONTROLLER_LINK')
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
        and before.st_nlink == 1 and before.st_size <= 65536, 'PRESERVED_CONTROLLER_IDENTITY')
    raw = path.read_bytes()
    require(sha(raw) == BASE_SHA, 'PRESERVED_V5_CONTROLLER_BYTES')
    base = definitions(path, 'funding_loss_preserved_v5', raw)
    selected = base.source_selection(repo, BASE_SELECTION_SHA)
    old = selected[0]
    require(old.read(path) == (raw, old.identity(before)), 'PRESERVED_CONTROLLER_STABLE')
    return base, selected


def effects_from(base):
    effects = dict(base['effectsCeiling'])
    for key in ('maximumCommittedResponseLossStops', 'additionalCompoundCommitReads', 'maximumDeferredCommitProbes'):
        del effects[key]
    effects.update(newSqlitePaths=4, independentPinFiles=1, syntheticEd25519Keys=2,
        transactionSignatures=1, capabilitySignatures=0, providerSignatures=0,
        ownedStreamCommands=3, ownedStreamResults=3, expectedTotalConnections=92,
        maximumFundingBoundResponseLossStops=1, additionalIntakeBoundReads=1,
        additionalServiceLedgerReads=2, serviceExecutions=0, grantActivations=0,
        pendingReconciliations=0, borrowedStoreForcedCloses=0)
    return effects


def source_selection(repo, expected):
    require(type(expected) is str and re.fullmatch('[0-9a-f]{64}', expected), 'EXPLICIT_V7_MANIFEST')
    base, parent = checked_base(repo)
    old, profile, _prior_delta, prior, prior_rows, _inputs, _caps, prior_stable, _edges = parent
    raw, manifest_identity = old.read(repo / MANIFEST, 524288)
    require(sha(raw) == expected, 'V7_MANIFEST_DIGEST')
    selected = json.loads(raw)
    require(set(selected) == set(prior), 'CLOSED_V7_SELECTION')
    require(selected['kind'] == KIND and type(selected['version']) is int and selected['version'] == 1
        and selected['baseSelection'] == {'path': base.MANIFEST, 'sha256': BASE_SELECTION_SHA}
        and selected['entry'] == 'app/' + ENTRY and selected['preload'] == 'app/' + PRELOAD
        and selected['nativeAuthority'] == 'NONE' and type(selected['nativeCasesExecuted']) is int
        and selected['nativeCasesExecuted'] == 0 and selected['allowedModes'] == ALLOWED_MODES
        and selected['startupExpected'] == STARTUP, 'EXACT_FUNDING_LOSS_ONLY_SCOPE')
    require(selected['removedApplicationRows'] == DROPPED, 'ONLY_FOUR_OLD_QUALIFICATION_ROWS')
    indexed = {row['path']: row for row in prior_rows}
    for name in DROPPED:
        require(name in indexed, 'PRESERVED_ROW_PRESENT')
        del indexed[name]
    additions = selected['addedApplicationRows']
    require(type(additions) is list and [row['path'] for row in additions] == ADDED, 'ONLY_FOUR_NEW_QUALIFICATION_ROWS')
    for row in additions:
        name = profile.row(row)
        require(name not in indexed, 'DISTINCT_FUNDING_QUALIFICATION_ROW')
        indexed[name] = row
    rows = [indexed[name] for name in sorted(indexed)]
    app = [row for row in rows if row['path'].startswith('app/')]
    packages = [row for row in rows if row['path'].startswith('packages/')]
    require(len(app) == selected['resolvedApplicationFiles'] == prior['resolvedApplicationFiles'] == 135
        and len(packages) == selected['packageFiles'] == 404
        and sha(canonical(packages)) == selected['packageRowsSha256'] == prior['packageRowsSha256']
        and sha(canonical(rows)) == selected['resolvedSourceRowsSha256']
        and sum(row['bytes'] for row in rows) == selected['resolvedSourceBytes'] <= 6291456,
        'COMPLETE_V7_INPUT_GRAPH')
    require(selected['packageVersions'] == prior['packageVersions'] and selected['taskPolicy'] == prior['taskPolicy']
        and selected['allowedBuiltins'] == prior['allowedBuiltins']
        and selected['effectsCeiling'] == effects_from(prior), 'PRESERVED_RUNTIME_REDUCED_CASE_EFFECTS')
    runtime = {row['path']: row for row in rows if row['path'].startswith('app/src/')}
    require(runtime == {row['path']: row for row in prior_rows if row['path'].startswith('app/src/')},
        'ALL_APPLICATION_RUNTIME_SOURCE_UNCHANGED')
    edges = [dict(edge, parent='app/' + ENTRY) if edge['parent'] == 'app/' + base.ENTRY else edge
        for edge in prior['bareBindings']]
    key = lambda edge: (edge['parent'], edge['specifier'])
    require(sorted(selected['bareBindings'], key=key) == sorted(edges, key=key), 'EXACT_NINE_PRESERVED_PACKAGE_EDGES')
    captures, app_inputs, texts = [], [], {}
    for row in app:
        path = repo / row['path'][4:]
        value, identity = old.read(path)
        require(old.pin(row['path'], value) == row, 'V7_SOURCE_INPUT')
        captures.append((str(path), tuple(identity)))
        app_inputs.append(dict(logicalPath=row['path'], url=path.as_uri(), bytes=len(value), sha256=row['sha256'], identity=identity))
        if path.suffix in ('.js', '.mjs'):
            texts[row['path']] = value.decode('ascii')
    controls = selected['controlInputs']
    require(type(controls) is list and [row['path'] for row in controls] == [SELF, PROFILE], 'EXACT_SOURCE_CONTROLS')
    for row in controls:
        value, identity = old.read(repo / row['path'])
        require(old.pin(row['path'], value) == row, 'V7_CONTROL_SOURCE')
        captures.append((str(repo / row['path']), tuple(identity)))
    require(Path(__file__).absolute() == repo / SELF, 'V7_CONTROLLER_LOCATION')
    for text in (texts['app/' + ENTRY], texts['app/' + PRELOAD]):
        require("!['funding-response-loss'].includes(E.X402_SDK105_ISSUED_COMMAND_MODE)" in text, 'ONE_ALLOWED_MODE')
        for name in ('X402_SDK105_ISSUED_COMMAND_SELECTION', 'X402_SDK105_ISSUED_COMMAND_RUN_SCOPE', 'X402_ISSUED_CLOSE_NATIVE_SELECTION'):
            require('E.' + name + " !== '" + STARTUP[name] + "'" in text, 'EXACT_ENTRY_ROLE_GUARD')
    old_preload = old.read(repo / base.PRELOAD)[0].decode('ascii')
    previous_fixed = dict(json.loads(re.search(r'const FIXED = new Map\((\[.*?\])\);', old_preload, re.S)[1]))
    fixed = {name: digest for name, digest in previous_fixed.items() if name not in DROPPED}
    for row in additions:
        if row['path'] != 'app/' + PRELOAD:
            fixed[row['path']] = row['sha256']
    actual = json.loads(re.search(r'const FIXED = new Map\((\[.*?\])\);', texts['app/' + PRELOAD], re.S)[1])
    require(len(actual) == len(fixed) and dict(actual) == fixed
        and 'const APP_FILES = 135, PACKAGE_FILES = 404' in texts['app/' + PRELOAD], 'EXACT_FIXED_PRELOAD_GRAPH')
    edge_map = {(edge['parent'], edge['specifier']): edge['target'] for edge in edges}
    reviewed_edges = 0
    for parent_name, text in texts.items():
        specs = re.findall(r'\bfrom\s*[\'\"]([^\'\"]+)[\'\"]|\bimport\s*\(\s*[\'\"]([^\'\"]+)[\'\"]\s*\)', text)
        for pair in specs:
            specifier = pair[0] or pair[1]
            reviewed_edges += 1
            if specifier.startswith('node:'):
                require(specifier in selected['allowedBuiltins'], 'V7_BUILTIN_EDGE')
            elif specifier.startswith('.'):
                require(os.path.normpath(str(Path(parent_name).parent / specifier)) in indexed, 'V7_RELATIVE_EDGE')
            else:
                require(edge_map.get((parent_name, specifier)) in indexed, 'V7_BARE_EDGE')
    def unchanged():
        prior_stable()
        require(old.read(repo / MANIFEST, 524288) == (raw, manifest_identity), 'V7_SELECTION_CHANGED')
        profile.recheck_captured_files(tuple(captures))
    unchanged()
    return old, profile, prior, selected, rows, app_inputs, tuple(captures), unchanged, reviewed_edges


def build_profile(repo, packages, old, legacy_profile, selected, rows, mode):
    require(mode in ALLOWED_MODES, 'EXACT_FUNDING_LOSS_MODE')
    raw, _identity = old.read(repo / PROFILE)
    pin = next(row for row in selected['controlInputs'] if row['path'] == PROFILE)
    require(old.pin(PROFILE, raw) == pin, 'CANONICAL_PROFILE_PRODUCER')
    producer = definitions(repo / PROFILE, 'funding_loss_canonical_profile', raw)
    return producer.build_profile(repo, packages, old, legacy_profile, selected, rows, mode,
        kind=KIND, entry=ENTRY, allowed_modes=ALLOWED_MODES)


def native_result(stdout, stderr, receipt, selected, mode):
    require(mode in ALLOWED_MODES and type(stdout) is bytes and type(stderr) is bytes
        and len(stdout) <= 65536 and len(stderr) <= 65536, 'BOUNDED_FUNDING_LOSS_CAPTURE')
    require(receipt['state'] == 'COMPLETE' and receipt['output_complete'] is True
        and type(receipt['actual_exit']) is int and receipt['actual_exit'] == 0, 'NATIVE_FAILED_OR_UNKNOWN')
    lines = stdout.decode('utf8', 'strict').splitlines()
    def footer(prefix):
        values = [json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix)]
        require(len(values) == 1, 'EXACT_V7_FOOTER')
        return values[0]
    case = footer('# actual-sdk105-issued-command-application-v7 ')
    namespace = footer('# pinned-sdk105-issued-command-application-v7-namespace ')
    require(case['mode'] == mode and all(case[k] is True for k in ('caseCompleted', 'actualExistingSdk105KeyPair',
        'actualOwnedCommandHost', 'actualApplication', 'actualNativeHTTPS', 'actualOfficialCore', 'sameV6File', 'expectedHeldCommandOwner')),
        'ACTUAL_NATIVE_FUNDING_COMPOSITION')
    expected = dict(walletKeys=1, operatorAddressReads=1, observedSignedTransactions=1, handoffAfterOwnedKeyClose=False,
        capabilityKeys=0, capabilitySignatures=0, independentPinFiles=1, verify=1, firstSettle=1, pendingObserve=0,
        executions=0, rawClientStarts=1, rawAuthenticated=1, rawCleanCloses=1, originalClientRepeatRefusals=1,
        backendExactReplays=0, foreignGrantRefusals=0, sameFileInitialCloses=1, borrowedSqlCloses=0,
        commandStarts=3, commandResults=3)
    require(all(type(case['counts'][k]) is type(v) and case['counts'][k] == v for k, v in expected.items()), 'EXACT_NATIVE_COUNTERS')
    require(case['actualStreamCommands'] == case['actualStreamResults'] == 3 and case['fundingPosts'] == 1
        and case['actualClientServiceRequests'] == 0 and case['providerKeys'] == 1
        and case['providerSignatures'] == case['capabilitySignatures'] == case['capabilityKeys'] == 0
        and case['officialSettlementPhase'] in (None, 'PENDING') and case['grantActivation'] == 'NOT_REQUESTED_FUNDING_UNKNOWN'
        and case['sdkPrepareBlock'] is False and case['realPayment'] is False and case['productionQualified'] is False
        and case['sourceTransforms'] == case['nativeModuleAliases'] == 0, 'NO_SECOND_ECONOMIC_OPERATION')
    proof, close, gate = case['fundingProof'], case['closeProof'], case['responseLoss']
    require(proof['serverIntake'] == 'BOUND_MATCHED_ORIGINAL' and proof['clientIntake'] == 'OUTCOME_UNKNOWN'
        and proof['clientPhase'] == 'SUBMISSION_OUTCOME_UNKNOWN'
        and all(proof[k] is True for k in ('originalPacketUnchanged', 'originalHashMatched', 'sameV6File', 'serverRetainsOriginal', 'serviceLedgerUnchanged'))
        and proof['intakeAttempts'] == 1 and proof['grants'] == proof['requests'] == 0
        and proof['newFundingOrGrantAuthority'] == 'NONE' and proof['freshProcessRecovery'] == proof['backendWireReplay'] == 'NOT_EXECUTED',
        'BOUND_UNKNOWN_ORIGINAL_CUSTODY')
    require(close['sessionLifecycle'] == 'HELD' and close['sessionHeld'] is True and close['fundingOutcomeUnknown'] is True
        and close['outputOutcomeUnknown'] is False and close['clientClose'] == 'UNKNOWN' and close['channelClose'] == 'CLOSED'
        and close['currentOwnersClosed'] is False and close['executionDone'] is True
        and close['repeatedRun'] == 'REJECTED_RETAINED_RUN' and close['applicationAdmissionRevoked'] is True
        and close['applicationPhase'] in ('CLOSED', 'CLOSE_UNCERTAIN')
        and close['borrowedStores'] == 'NOT_CLOSED_OR_REOPENED', 'HONEST_HELD_OWNER_AND_CLOSE')
    require(gate['phase'] == 'BOUND_STOP_REQUESTED' and gate['unknown'] is False and gate['boundMatched'] is True
        and gate['readAttempts'] == gate['callbackEntries'] == gate['stopAttempts'] == 1
        and gate['stopVoidObserved'] is True and gate['nativeDeliveryLoss'] == 'NOT_ESTABLISHED'
        and gate['physicalResourceRelease'] == close['actualV6PhysicalRelease'] == case['nativePhysicalDrain'] == 'NOT_QUALIFIED',
        'MATCHED_BOUND_THEN_ONE_KNOWN_SOCKET_STOP')
    require(case['counts']['commandInputBytes'] <= 262144 and case['counts']['commandOutputBytes'] <= 262144
        and 1 <= case['counts']['referenceCandidates'] <= 32768 and 1 <= case['counts']['referenceWindows'] <= 8
        and case['aggregateCandidateReservation'] == case['counts']['referenceCandidates'] + 4096 + 16384 <= 65536,
        'BOUNDED_ORIGINAL_WORK')
    require(namespace['mode'] == mode and namespace['profileKind'] == KIND and namespace['profileVersion'] == 1
        and namespace['applicationFiles'] == selected['resolvedApplicationFiles'] == 135 and namespace['packageFiles'] == 404
        and namespace['inputsVerifiedBeforeCase'] == 539 and namespace['sourceRowsSha256'] == selected['resolvedSourceRowsSha256']
        and namespace['sourceTransforms'] == namespace['nativeBuiltinAliases'] == 0 and namespace['nativeOsNetworkSandbox'] is False,
        'EXACT_NATIVE_NAMESPACE')
    require(all(line in lines for line in ('# tests 1', '# pass 1', '# fail 0', '# cancelled 0', '# skipped 0', '# todo 0')),
        'ONE_ACTUAL_TEST_WITHOUT_SKIP')
    return dict(case=case, namespace=namespace, fullP1Acceptance='NOT_ESTABLISHED', nativePhysicalDrain='NOT_QUALIFIED', productionQualified=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--mode', choices=ALLOWED_MODES, default='funding-response-loss')
    parser.add_argument('--source-only', action='store_true')
    args = parser.parse_args()
    require(sys.dont_write_bytecode, 'BYTECODE_DISABLED')
    selected = source_selection(Path(args.repo), args.manifest_sha256)
    print(json.dumps(dict(event='SDK105_FUNDING_LOSS_V7_SOURCE_ADMITTED', selectedMode=args.mode,
        applicationFiles=135, packageFilesDeclared=404, packageFilesRead=0, reviewedLiteralEdges=selected[-1],
        sourceRowsSha256=selected[3]['resolvedSourceRowsSha256'], allRuntimeRowsUnchanged=True,
        effectsCeiling=selected[3]['effectsCeiling'], nativeAuthority='NONE', nativeCasesExecuted=0)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
