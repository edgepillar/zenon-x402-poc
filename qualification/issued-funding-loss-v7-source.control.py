"""Read-only source selection and declared transcript refusal controls only.

Synthetic decoder input is never an actual native result. No JS application,
installed package, SQLite engine, socket, key, signature or work search runs.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--controller-sha256', required=True)
    args = parser.parse_args()
    assert sys.dont_write_bytecode
    repo = Path(args.repo)
    source = repo / 'qualification/run-sdk105-issued-command-application-v7.local.py'
    for path in (source, *source.parents):
        assert not path.is_symlink()
    before = source.lstat()
    assert stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
    raw = source.read_bytes()
    assert len(raw) <= 65536 and hashlib.sha256(raw).hexdigest() == args.controller_sha256
    module = importlib.util.module_from_spec(importlib.util.spec_from_file_location('funding_loss_v6_controlled', source))
    sys.modules[module.__name__] = module
    exec(compile(raw, str(source), 'exec'), module.__dict__)
    selected = module.source_selection(repo, args.manifest_sha256)
    original = source.lstat()
    identity = lambda s: tuple(getattr(s, k) for k in ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns'))
    assert identity(original) == identity(before) and source.read_bytes() == raw
    profile = selected[3]
    cases = []
    def check(name, work):
        work()
        cases.append(dict(id=name, status='PASS'))
    def expect_refusal(case, namespace, receipt, mode='funding-response-loss', suffix=b''):
        try:
            decode(case, namespace, receipt, mode, suffix)
        except ValueError:
            return
        raise AssertionError('UNEXPECTED_SYNTHETIC_ACCEPTANCE')
    def decode(case, namespace, receipt, mode='funding-response-loss', suffix=b''):
        stdout = ('# actual-sdk105-issued-command-application-v7 ' + json.dumps(case) + '\n'
            + '# pinned-sdk105-issued-command-application-v7-namespace ' + json.dumps(namespace) + '\n'
            + '# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n').encode() + suffix
        return module.native_result(stdout, b'', receipt, profile, mode)
    # All booleans/counters below are declared inputs to the decoder. They do
    # not attest that an application or store actually performed these actions.
    counts = dict(walletKeys=1, operatorAddressReads=1, observedSignedTransactions=1,
        handoffAfterOwnedKeyClose=False, capabilityKeys=0, capabilitySignatures=0,
        independentPinFiles=1, verify=1, firstSettle=1, pendingObserve=0, executions=0,
        rawClientStarts=1, rawAuthenticated=1, rawCleanCloses=1, originalClientRepeatRefusals=1,
        backendExactReplays=0, foreignGrantRefusals=0, sameFileInitialCloses=1, borrowedSqlCloses=0,
        commandStarts=3, commandResults=3, commandInputBytes=100, commandOutputBytes=100,
        referenceCandidates=1, referenceWindows=1)
    case = dict(mode='funding-response-loss', counts=counts, caseCompleted=True,
        actualExistingSdk105KeyPair=True, actualOwnedCommandHost=True, actualApplication=True,
        actualNativeHTTPS=True, actualOfficialCore=True, sameV6File=True, expectedHeldCommandOwner=True,
        actualStreamCommands=3, actualStreamResults=3, fundingPosts=1, actualClientServiceRequests=0,
        providerKeys=1, providerSignatures=0, capabilitySignatures=0, capabilityKeys=0,
        officialSettlementPhase='PENDING', grantActivation='NOT_REQUESTED_FUNDING_UNKNOWN',
        sdkPrepareBlock=False, realPayment=False, productionQualified=False, sourceTransforms=0, nativeModuleAliases=0,
        aggregateCandidateReservation=20481, nativePhysicalDrain='NOT_QUALIFIED',
        fundingProof=dict(serverIntake='BOUND_MATCHED_ORIGINAL', clientIntake='OUTCOME_UNKNOWN',
            clientPhase='SUBMISSION_OUTCOME_UNKNOWN', originalPacketUnchanged=True, originalHashMatched=True,
            sameV6File=True, serverRetainsOriginal=True, serviceLedgerUnchanged=True, intakeAttempts=1,
            grants=0, requests=0, newFundingOrGrantAuthority='NONE', freshProcessRecovery='NOT_EXECUTED', backendWireReplay='NOT_EXECUTED'),
        closeProof=dict(sessionLifecycle='HELD', sessionHeld=True, fundingOutcomeUnknown=True,
            outputOutcomeUnknown=False, clientClose='UNKNOWN', channelClose='CLOSED', currentOwnersClosed=False,
            executionDone=True, repeatedRun='REJECTED_RETAINED_RUN', applicationAdmissionRevoked=True,
            applicationPhase='CLOSE_UNCERTAIN', borrowedStores='NOT_CLOSED_OR_REOPENED', actualV6PhysicalRelease='NOT_QUALIFIED'),
        responseLoss=dict(phase='BOUND_STOP_REQUESTED', unknown=False, boundMatched=True, readAttempts=1,
            callbackEntries=1, stopAttempts=1, stopVoidObserved=True, nativeDeliveryLoss='NOT_ESTABLISHED', physicalResourceRelease='NOT_QUALIFIED'))
    namespace = dict(mode='funding-response-loss', profileKind=module.KIND, profileVersion=1,
        applicationFiles=135, packageFiles=404, inputsVerifiedBeforeCase=539,
        sourceRowsSha256=profile['resolvedSourceRowsSha256'], sourceTransforms=0, nativeBuiltinAliases=0, nativeOsNetworkSandbox=False)
    receipt = dict(state='COMPLETE', output_complete=True, actual_exit=0)
    def source_contract():
        assert selected[-1] == 607 and module.ALLOWED_MODES == ['funding-response-loss']
        assert profile['nativeAuthority'] == 'NONE' and profile['nativeCasesExecuted'] == 0
    check('SOURCE-ONLY-ONE-MODE-UNCHANGED-RUNTIME', source_contract)
    check('DECLARED-TRANSCRIPT-DECODES-WITHOUT-CLAIMING-NATIVE', lambda: decode(case, namespace, receipt))
    def three_issued_commands():
        import re
        text = (repo / module.ENTRY).read_text(encoding='ascii')
        assert re.findall(r"await io\.issue\('([^']+)'", text) == ['prepare', 'commit', 'submitFunding']
        assert 'io.finish()' not in text
        assert 'assert.equal(view.commands, 3)' in text
        assert profile['effectsCeiling']['ownedStreamCommands'] == profile['effectsCeiling']['ownedStreamResults'] == 3
    check('THREE-ISSUED-COMMANDS-NO-IMPLICIT-CLOSE-FRAME', three_issued_commands)
    for field in ('commandStarts', 'commandResults'):
        changed = copy.deepcopy(case); changed['counts'][field] = 4
        check('FOUR-COMMAND-COUNTER-IS-REFUSED-' + field, lambda changed=changed: expect_refusal(changed, namespace, receipt))
    for field in ('actualStreamCommands', 'actualStreamResults'):
        changed = copy.deepcopy(case); changed[field] = 4
        check('FOUR-STREAM-COUNTER-IS-REFUSED-' + field, lambda changed=changed: expect_refusal(changed, namespace, receipt))

    for key, value in [('actual_exit', 1), ('actual_exit', None), ('output_complete', False), ('state', 'UNKNOWN')]:
        check('RECEIPT-REFUSAL-' + key + '-' + str(value), lambda key=key, value=value:
            expect_refusal(case, namespace, dict(receipt, **{key: value})))
    for path, value in [
        (('counts', 'executions'), 1), (('counts', 'observedSignedTransactions'), 2),
        (('fundingProof', 'grants'), 1), (('fundingProof', 'originalPacketUnchanged'), False),
        (('closeProof', 'fundingOutcomeUnknown'), False), (('closeProof', 'sessionLifecycle'), 'CLOSED'),
        (('responseLoss', 'boundMatched'), False), (('responseLoss', 'stopAttempts'), 2),
        (('responseLoss', 'nativeDeliveryLoss'), 'ESTABLISHED'),
    ]:
        changed = copy.deepcopy(case)
        changed[path[0]][path[1]] = value
        check('TRANSCRIPT-REFUSAL-' + '.'.join(path), lambda changed=changed: expect_refusal(changed, namespace, receipt))
    check('OTHER-MODE-CANNOT-INHERIT-ALLOWANCE', lambda: expect_refusal(case, namespace, receipt, 'pending'))
    check('OTHER-SOURCE-GRAPH-IS-REFUSED', lambda: expect_refusal(case, dict(namespace, sourceRowsSha256='0' * 64), receipt))
    check('DUPLICATE-COMPLETION-FOOTER-IS-REFUSED', lambda: expect_refusal(case, namespace, receipt,
        suffix=('# actual-sdk105-issued-command-application-v7 ' + json.dumps(case) + '\n').encode()))
    selected[-2]()
    print(json.dumps(dict(qualification='FUNDING_LOSS_V7_SOURCE_AND_DECODER_DATA_ONLY', cases=cases,
        passed=len(cases), failed=0, applicationFiles=135, packageFilesDeclared=404, packageFilesRead=0,
        literalEdges=selected[-1], allApplicationRuntimeRowsUnchanged=True, nativeExecutions=0,
        syntheticDecoderInputsOnly=True, SDK=0, SQLite=0, keys=0, signatures=0, sockets=0, nonceSearches=0)))


if __name__ == '__main__':
    main()
