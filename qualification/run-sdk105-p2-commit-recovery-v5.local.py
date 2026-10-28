"""Current SDK105 command/native qualification. Source-only by default.

This command admits source DATA only. It exposes no native execution flag.
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

SELF = 'qualification/run-sdk105-p2-commit-recovery-v5.local.py'
MANIFEST = 'qualification/sdk105-p2-commit-recovery-v5.inputs.json'
ENTRY = 'qualification/sdk105-p2-commit-recovery-v5.parent.mjs'
PRELOAD = 'qualification/sdk105-p2-commit-recovery-v5.preload.mjs'
BASE = 'qualification/run-sdk105-issued-command-application-v5.local.py'
BASE_SHA = 'd2abb4960ce8e84fc2bf0dd88b44c82f143655614820fcc0f625f097af40dac4'
BASE_SELECTION_SHA = '087df3b143f1802f75e7bbaaf295371bc32ef82eba2f75f8ee7a644a5b3ceb24'
PROJECT = 'x402-sdk105-p2-commit-recovery-v5'
ALLOWED_MODES = ['commit-kill-recover']
ROLE_ENTRIES = {'parent': 'qualification/sdk105-p2-commit-recovery-v5.parent.mjs', 'funding-child': 'qualification/sdk105-p2-funding-child-v5.case.mjs', 'recovery-child': 'qualification/sdk105-p2-recovery-child-v5.case.mjs'}
KIND = 'SDK105_P2_COMMIT_KILL_RECOVERY_NODE24_V5'
QUOTA, FLOOR = 4194304, 10737418240
STARTUP = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'NODE_DISABLE_COMPILE_CACHE': '1', 'WS_NO_BUFFER_UTIL': '1', 'WS_NO_UTF_8_VALIDATE': '1', 'X402_SDK105_ISSUED_COMMAND_SELECTION': 'sdk105-p2-commit-recovery-v5', 'X402_SDK105_ISSUED_COMMAND_RUN_SCOPE': 'one-sdk105-p2-commit-recovery-v5', 'X402_SDK105_ISSUED_COMMAND_MODE': 'commit-kill-recover', 'X402_ISSUED_CLOSE_NATIVE_SELECTION': 'current-native-issued-close-source-v4', 'X402_P2_COMMIT_RECOVERY_ROLE': 'parent'}
CURRENT_BASE = None
CURRENT_CAPTURE_DATA = None
CAPTURE_CODEC = 'qualification/sdk105_p2_child_capture_data.py'
PROFILE = 'qualification/node_file_url_profile.py'
BUNDLE = 'qualification/sdk105_p2_role_profile_bundle.py'


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
    global CURRENT_BASE, CURRENT_CAPTURE_DATA
    require(type(expected) is str and re.fullmatch('[0-9a-f]{64}', expected), 'EXPLICIT_CURRENT_MANIFEST')
    require(repo.is_absolute() and os.path.normpath(repo) == str(repo), 'PHYSICAL_SOURCE_ROOT')
    b = (repo / BASE).read_bytes(); require(sha(b) == BASE_SHA, 'UNCHANGED_V5_SOURCE_DEFINITIONS')
    parent = definitions(repo / BASE, 'p2_preserved_v5_definitions', b); CURRENT_BASE = parent
    old, profile, delta, prior, baseline, _app, _ids, prior_unchanged, _edges = parent.source_selection(repo, BASE_SELECTION_SHA)
    raw, manifest_id = old.read(repo / MANIFEST, 524288); require(sha(raw) == expected, 'CURRENT_P2_MANIFEST_DIGEST')
    selected = json.loads(raw)
    require(set(selected) == {'kind','version','baseSelection','removedApplicationRows','addedApplicationRows',
        'resolvedApplicationFiles','packageFiles','resolvedSourceRowsSha256','resolvedSourceBytes','packageRowsSha256',
        'entry','preload','bareBindings','allowedBuiltins','packageVersions','effectsCeiling','taskPolicy','startupExpected',
        'roles','controlInputs','nativeAuthority','nativeCasesExecuted'}, 'CLOSED_P2_SELECTION')
    require(selected['kind'] == KIND and selected['version'] == 1 and selected['roles'] == ROLE_ENTRIES
        and selected['baseSelection'] == {'path':parent.MANIFEST,'sha256':BASE_SELECTION_SHA}
        and selected['entry'] == 'app/' + ENTRY and selected['preload'] == 'app/' + PRELOAD
        and selected['startupExpected'] == STARTUP and selected['nativeAuthority'] == 'NONE'
        and selected['nativeCasesExecuted'] == 0
        and selected['removedApplicationRows'] == ['app/' + parent.ENTRY, 'app/' + parent.PRELOAD], 'EXACT_P2_SELECTION')
    indexed = {row['path']:row for row in baseline}
    for name in selected['removedApplicationRows']:
        require(name in indexed, 'EXACT_UNUSED_P1_ENTRY_ROW'); del indexed[name]
    additions = selected['addedApplicationRows']
    require(type(additions) is list and 7 <= len(additions) <= 64, 'BOUNDED_P2_ADDITIONS')
    for row in additions:
        name = profile.row(row); require(name.startswith('app/') and name not in indexed, 'DISTINCT_P2_SOURCE_ROW'); indexed[name] = row
    rows = [indexed[name] for name in sorted(indexed)]; app_rows = [row for row in rows if row['path'].startswith('app/')]
    packages = [row for row in rows if row['path'].startswith('packages/')]
    require(len(app_rows) == selected['resolvedApplicationFiles'] and len(packages) == selected['packageFiles'] == 404
        and sha(canonical(packages)) == selected['packageRowsSha256'] == prior['packageRowsSha256']
        and sha(canonical(rows)) == selected['resolvedSourceRowsSha256']
        and sum(row['bytes'] for row in rows) == selected['resolvedSourceBytes'] <= 6291456, 'COMPLETE_P2_INVENTORY')
    require(selected['packageVersions'] == prior['packageVersions'] and selected['taskPolicy'] == prior['taskPolicy'], 'UNCHANGED_PACKAGE_AND_STORAGE_POLICY')
    effects = dict(prior['effectsCeiling'], expectedTotalConnections=93, nodeChildren=2, plannedChildSigkills=1, maximumFailureChildSigkills=2,
        maximumFailureChildSelfExits=1, childParkTimeoutMs=5000, existingPayerRecoveryOpens=1, existingBackendRecoveryOpens=1,
        roleProfiles=3, childProfileTables=1, maximumChildCaptureBytes=65536, maximumParentCaptureBytes=524288,
        maximumPrivateChildTranscriptBytes=458752, privateChildCaptureVersion=1, rawChildBytesRetained=True,
        maximumParentStderrCaptureBytes=1048576,
        maximumParentCommandSeconds=90, recoveryServiceDispatches=0, recoveryFundingPosts=0, recoverySignatures=0)
    require(selected['effectsCeiling'] == effects, 'EXACT_P2_EFFECT_CEILING')
    builtins = sorted(set(prior['allowedBuiltins'] + ['node:child_process']))
    edges = [edge for edge in prior['bareBindings'] if edge['parent'] not in selected['removedApplicationRows']]
    for specifier, target in [('znn-typescript-sdk','packages/znn-typescript-sdk/dist/index.js'),
        ('@noble/ed25519','packages/@noble/ed25519/index.js'),('@noble/hashes/sha2','packages/@noble/hashes/esm/sha2.js')]:
        edges.append(dict(parent='app/' + ROLE_ENTRIES['funding-child'],specifier=specifier,target=target))
    require(selected['allowedBuiltins'] == builtins and selected['bareBindings'] == edges, 'EXACT_P2_IMPORT_CAPABILITIES')
    captures, inputs, texts = [], [], {}
    for row in app_rows:
        file = repo / row['path'][4:]; data, identity = old.read(file); require(old.pin(row['path'],data) == row, 'CURRENT_P2_SOURCE_INPUT')
        captures.append((str(file),tuple(identity))); inputs.append(dict(logicalPath=row['path'],url=file.as_uri(),bytes=len(data),sha256=row['sha256'],identity=identity))
        if file.suffix in ('.js','.mjs'): texts[row['path']] = data.decode('ascii')
    require([row['path'] for row in selected['controlInputs']] == [SELF,CAPTURE_CODEC,PROFILE,BUNDLE], 'EXACT_P2_CONTROLLER_CODEC_AND_PROFILE_DATA')
    for row in selected['controlInputs']:
        data, control_id = old.read(repo / row['path']); require(old.pin(row['path'],data) == row, 'CURRENT_P2_CONTROL_PIN')
        captures.append((str(repo / row['path']),tuple(control_id)))
        if row['path'] == CAPTURE_CODEC:
            CURRENT_CAPTURE_DATA = definitions(repo / CAPTURE_CODEC,'p2_current_private_capture_data',data)
    require(Path(__file__).absolute() == repo / SELF, 'P2_CONTROLLER_LOCATION')
    for role, name in ROLE_ENTRIES.items():
        text = texts['app/' + name]
        require("E.X402_P2_COMMIT_RECOVERY_ROLE !== '" + role + "'" in text, 'EXACT_P2_ROLE_GUARD')
        for key in ('X402_SDK105_ISSUED_COMMAND_SELECTION','X402_SDK105_ISSUED_COMMAND_RUN_SCOPE','X402_SDK105_ISSUED_COMMAND_MODE'):
            require('E.' + key + " !== '" + STARTUP[key] + "'" in text, 'EXACT_P2_STARTUP_GUARD')
    preload = texts['app/' + PRELOAD]
    count = re.search(r'const APP_FILES = ([0-9]+), PACKAGE_FILES = 404',preload)
    require(count is not None and int(count[1]) == len(app_rows), 'P2_PRELOAD_APPLICATION_COUNT')
    prior_preload = (repo / parent.PRELOAD).read_text('ascii')
    parse = lambda text: dict(json.loads(re.search(r'const FIXED = new Map\((\[[\s\S]*?\])\);\nconst EDGES',text)[1]))
    fixed = {name:digest for name,digest in parse(prior_preload).items() if name not in selected['removedApplicationRows']}
    fixed.update({row['path']:row['sha256'] for row in additions if row['path'] != 'app/' + PRELOAD})
    require(parse(preload) == fixed, 'EXACT_P2_PRELOAD_FIXED_PINS')
    edge_map = {(edge['parent'],edge['specifier']):edge['target'] for edge in edges}; reviewed = 0
    for name, text in texts.items():
        for pair in re.findall(r'\bfrom\s*[\'\"]([^\'\"]+)[\'\"]|\bimport\s*\(\s*[\'\"]([^\'\"]+)[\'\"]\s*\)',text):
            spec = pair[0] or pair[1]; reviewed += 1
            if spec.startswith('node:'): require(spec in builtins, 'CLOSED_P2_BUILTIN')
            elif spec.startswith('.'): require(os.path.normpath(str(Path(name).parent / spec)) in indexed, 'CLOSED_P2_RELATIVE_EDGE')
            else: require(edge_map.get((name,spec)) in indexed, 'CLOSED_P2_BARE_EDGE')
    def unchanged():
        prior_unchanged(); require(old.read(repo / MANIFEST,524288) == (raw,manifest_id), 'P2_MANIFEST_CHANGED')
        profile.recheck_captured_files(tuple(captures))
    require(reviewed >= 601, 'P2_FULL_LITERAL_EDGE_REVIEW')
    unchanged(); return old,profile,delta,selected,rows,inputs,tuple(captures),unchanged,reviewed


def build_profile(repo, packages, old, legacy_profile, selected, rows, mode):
    require(mode == 'commit-kill-recover' and CURRENT_BASE is not None, 'EXACT_P2_MODE')
    admitted = {}
    for name in (PROFILE, BUNDLE):
        raw, _identity = old.read(repo / name)
        row = next(row for row in selected['controlInputs'] if row['path'] == name)
        require(old.pin(name, raw) == row, 'EXACT_P2_PROFILE_DATA_SOURCE')
        admitted[name] = definitions(repo / name, 'p2_v5_profile_' + str(len(admitted)), raw)
    return admitted[BUNDLE].build_role_profile_bundle(
        repo, packages, old, legacy_profile, selected, rows, mode,
        producer=admitted[PROFILE], kind=KIND, entries=ROLE_ENTRIES)


def child_capture_data(stdout):
    require(CURRENT_CAPTURE_DATA is not None, 'CURRENT_P2_CAPTURE_CODEC_NOT_ADMITTED')
    return CURRENT_CAPTURE_DATA.child_capture_data(stdout)


def native_result(stdout, stderr, receipt, selected, mode):
    require(mode == 'commit-kill-recover' and type(stdout) is bytes and type(stderr) is bytes
        and len(stdout) <= 524288 and len(stderr) <= 1048576, 'BOUNDED_P2_CAPTURE')
    require(receipt['state'] == 'COMPLETE' and receipt['output_complete'] is True
        and type(receipt['actual_exit']) is int and receipt['actual_exit'] == 0, 'P2_NATIVE_FAILED_OR_UNKNOWN')
    lines = stdout.decode('utf8').splitlines()
    def footer(prefix):
        found = [json.loads(line[len(prefix):]) for line in lines if line.startswith(prefix)]
        require(len(found) == 1, 'ONE_ACTUAL_P2_FOOTER'); return found[0]
    case = footer('# actual-sdk105-p2-commit-recovery-v5 ')
    namespace = footer('# pinned-sdk105-p2-commit-recovery-v5-namespace ')
    retained = child_capture_data(stdout)
    require(case['privateChildCaptureVersion'] == 1 and case['privateChildCaptureBytes'] == retained['outputBytes'],
        'RETAINED_PRIVATE_CHILD_BYTES_REQUIRED')
    for field in ('caseCompleted','boundaryObserved','actualSigkillExitObserved','actualChildCloseObservedBeforeReopen',
        'distinctFreshRecoveryProcess','originalCheckpointMatched','independentPinsUnchanged','sameFiveSqliteFileIdentities',
        'readerClosed','backendClosed','noDispatchSurface'):
        require(case[field] is True, 'ACTUAL_P2_BOUNDARY_AND_RECOVERY_REQUIRED')
    require(case['childProcesses'] == 2 and case['plannedKillCalls'] == 1 and case['failureStopCalls'] == 0
        and case['existingBackendExecutions'] == 1 and case['consumedUnits'] == 2 and case['responseObservationPresent'] is False
        and case['clientStatus'] == 'CLIENT_RECONCILIATION_REQUIRED' and case['backendStatus'] == 'CACHED_SUCCESS'
        and case['recoveryDispatches'] == case['recoveryFundingPosts'] == case['recoverySignatures'] == 0
        and case['deliveryConfirmed'] is False and case['authority'] == 'NONE' and case['productionQualified'] is False
        and case['physicalResourceRelease'] == 'NOT_QUALIFIED', 'NO_DUPLICATE_DISPATCH_OR_FALSE_AUTHORITY')
    children = case['childCaptures']; require(len(children) == 2 and children[0]['role'] == 'funding-child'
        and children[0]['code'] is None and children[0]['signal'] == 'SIGKILL'
        and children[1]['role'] == 'recovery-child' and children[1]['code'] == 0 and children[1]['signal'] is None
        and all(row['stdoutBytes'] <= 65536 and row['stderrBytes'] <= 65536 for row in children), 'OBSERVED_CHILD_EXITS_AND_CAPTURE')
    for child in children:
        raw = retained['roles'][child['role']]
        for stream in ('stdout','stderr'):
            require(type(child[stream+'Bytes']) is int and child[stream+'Bytes'] == len(raw[stream])
                and child[stream+'Sha256'] == sha(raw[stream]), 'ORIGINAL_CHILD_CAPTURE_DIGEST')
    require(namespace['profileKind'] == KIND and namespace['role'] == 'parent' and namespace['mode'] == mode
        and namespace['applicationFiles'] == selected['resolvedApplicationFiles'] and namespace['packageFiles'] == 404
        and namespace['inputsVerifiedBeforeCase'] == selected['resolvedApplicationFiles'] + 404
        and namespace['sourceRowsSha256'] == selected['resolvedSourceRowsSha256']
        and namespace['sourceTransforms'] == namespace['nativeBuiltinAliases'] == 0
        and namespace['nativeOsNetworkSandbox'] is False, 'ACTUAL_P2_PARENT_NAMESPACE')
    return dict(case=case,namespace=namespace,privateChildBytesRetainedInParentStdout=True,
        nativePhysicalDrain='NOT_QUALIFIED',productionQualified=False)


def main():
    # This public entry is deliberately source-only. A separate reviewed host
    # must own current tool/root accounting and fresh finite native authority.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--source-only', action='store_true')
    parser.add_argument('--mode', choices=ALLOWED_MODES, default='commit-kill-recover')
    args = parser.parse_args(); require(sys.dont_write_bytecode, 'BYTECODE_DISABLED_REQUIRED')
    old, profile, delta, selected, rows, inputs, captures, unchanged, edges = source_selection(
        Path(args.repo), args.manifest_sha256)
    unchanged()
    print(json.dumps(dict(event='SDK105_P2_V5_SOURCE_ADMITTED',
        applicationFiles=selected['resolvedApplicationFiles'], packageFilesDeclared=404,
        packageFilesRead=0, reviewedLiteralEdges=edges, selectedMode=args.mode,
        roles=ROLE_ENTRIES, preloadFixedPinsMatched=True, canonicalProducerPinned=True,
        sourceTransforms=False, nativeAuthority='NONE', nativeCasesExecuted=0)), flush=True)
    return 0


if __name__ == '__main__':
    try: sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        code = str(error) if type(error) is ValueError and re.fullmatch('[A-Z0-9_]+', str(error)) else 'REVIEW_PRIVATE_SOURCE_RECEIPTS'
        print(json.dumps(dict(event='SDK105_P2_V5_SOURCE_REFUSED', code=code,
            nativeAuthority='NONE', nativeExecutions=0)), file=sys.stderr, flush=True)
        sys.exit(1)
