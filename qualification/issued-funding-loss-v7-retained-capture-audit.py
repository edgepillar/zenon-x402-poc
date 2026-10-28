"""Read-only audit of the exact V7 retained native case and known stale summary.

This does not change the raw transcript, original decoder, task outcome or native
source. It audits measured counters while retaining the rejected 4/4 summary as
an explicit reporting defect. No new application operation or authority follows.
"""
import json
KIND = 'SDK105_ISSUED_COMMAND_APPLICATION_NODE24_V7'
ALLOWED_MODES = ['funding-response-loss']
def require(value, code):
    if not value: raise ValueError(code)

def audit_recorded_native_case(stdout, stderr, receipt, selected, mode):
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
    require(case['counts']['commandStarts'] == case['counts']['commandResults'] == 3 and case['fundingPosts'] == 1
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

def audit_known_v7_summary_defect(stdout, stderr, receipt, selected):
    result = audit_recorded_native_case(stdout, stderr, receipt, selected, 'funding-response-loss')
    case = result['case']
    require(type(case['actualStreamCommands'])is int and case['actualStreamCommands']==4
        and type(case['actualStreamResults'])is int and case['actualStreamResults']==4,
        'EXACT_KNOWN_RAW_SUMMARY_DEFECT_ONLY')
    require(case['counts']['commandStarts']==case['counts']['commandResults']==3,
        'MEASURED_COUNTERS_MUST_BE_THREE')
    return dict(status='AUDITED_APPLICATION_CASE_WITH_RETAINED_REPORT_DEFECT',
        nativeCaseCompleted=True, nativeNodeExit=0,
        observedCommandCounters=dict(commands=3, results=3),
        recordedSummaryCounters=dict(commands=4, results=4),
        rawSummaryConsistent=False, originalQualificationStatus='REFUSED_OR_UNKNOWN',
        originalTaskOutcome='FAILURE', rawTranscriptChanged=False,
        originalDecoderChanged=False, nativeSourceChanged=False, nativeReruns=0,
        fullP1Acceptance='NOT_ESTABLISHED', physicalRelease='NOT_QUALIFIED',
        productionQualified=False, observedCase=case, observedNamespace=result['namespace'])
