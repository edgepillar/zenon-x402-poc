/*
 * Unexecuted actual full native local application selection: three cases only.
 * No injected read/fetch/material/owner, no source transforms, no store close
 * substitute. Actual loopback TLS, bounded producer, SDK preflight/signing and
 * new V6 files require separate full-graph authority; narrow TLS is not enough.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
if (process.argv.length !== 3 || process.argv[2] !== process.env.SPV_TASK_SCRATCH
    || process.env.X402_DP_FULL_LOCAL_SELECTION !== 'three-full-native-loopback-cases-only'
    || process.env.X402_DP_FULL_LOCAL_NATIVE_MODE !== 'reviewed-native-fchmod'
    || !/^[0-9a-f]{64}$/.test(process.env.X402_DP_FULL_LOCAL_PROFILE_SHA256 || '')) {
  throw new TypeError('X402_FULL_LOCAL_BODY_REJECTED_BEFORE_EFFECT_IMPORTS');
}
const [
  { createFullNativeLoopbackFixtureHarness: FIXTURE },
  { createZenonDynamicPlasmaNativeHttpsOriginalFundingSubmissionForLocalQualification: APP },
  { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_V6 },
  { encodeOriginalPaymentCheckpoint: ENCODE },
] = await Promise.all([
  import('./dynamic-plasma-full-native-loopback.fixture.draft.mjs'),
  import('../src/zenon/dynamic-plasma-native-https-original-funding-submission.js'),
  import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js'),
  import('../src/service-credit-pilot-original-payment-checkpoint.js'),
]);
const h = await FIXTURE(process.argv[2]), HELD_STORES = [];
const OPTIONS = { timeout: 30000, concurrency: false };
const counts = { casesEntered: 0, casesCompleted: 0, createAttempts: 0, normalCloses: 0,
  expectedHeldStores: 0, unexpectedHeldStores: 0, secondaryCleanupFailures: 0 };
const appError = kind => error => error instanceof TypeError && Object.isFrozen(error)
  && error.code === 'zenon_dynamic_plasma_original_funding_submission_' + kind;
const closeUnknown = error => error instanceof TypeError && Object.isFrozen(error)
  && error.code === 'original_funding_bounded_read_close_close_unknown';
function original(store, f, status = 'PREPARED', revision = 1) {
  const row = store.load();
  assert.equal(row.status, status); assert.equal(row.revision, revision);
  assert.equal(row.ambiguityLatched, status === 'OUTCOME_UNKNOWN');
  assert.equal(row.paymentHeader, f.packet.pair.paymentSignatureHeader);
  assert.equal(row.challengeHeader, f.packet.pair.challenge.paymentRequiredHeader);
  assert.equal(ENCODE(store.getOriginalPaymentCheckpoint(f.pins)), f.packet.serializedCheckpoint);
}
function inspect(owner, f, phase) {
  const value = owner.inspectOriginalFunding();
  assert.equal(value.originalFundingSubmissionInspectionVersion, 4);
  assert.equal(value.phase, phase); assert.equal(value.preparation.packet, f.packet);
  assert.equal(value.preparation.candidate.candidate.accountBlock.hash, f.packet.transactionHash);
  assert.equal(value.prepareAttempts, 1); assert.equal(value.commitAttempts, 1);
  assert.equal(value.authority, 'NONE'); assert.equal(value.automaticReplay, false);
  return value;
}
function retainHeld(store, expected) {
  if (HELD_STORES.includes(store)) return;
  HELD_STORES.push(store);
  counts[expected ? 'expectedHeldStores' : 'unexpectedHeldStores']++;
}
async function prepared(c) {
  const result = await c.owner.prepareOriginalFunding(c.f.input);
  assert.equal(result.originalFundingPreparationVersion, 2);
  assert.equal(result.phase, 'AWAITING_INDEPENDENT_PINS');
  assert.equal(result.preflight, 'ACTUAL_LOCAL_PREFLIGHT_RETURNED');
  assert.equal(c.store.load(), null);
  c.f.packet = result.packet; c.f.pins = h.retainPins(c.f, result.packet.expectedPins);
  assert.equal(c.f.accountCalls, 15); assert.deepEqual(c.f.positions, [30, 30]);
  assert.equal(c.f.unsigned.difficulty, 3000); assert.equal(c.f.unsigned.fusedPlasma, 25409);
  assert.equal(c.f.unsigned.nonce, c.f.expected.nonce);
  assert.equal(c.f.unsigned.hash, result.packet.transactionHash);
  c.originalBlock = JSON.stringify(c.f.unsigned); c.originalPacket = JSON.stringify(result.packet);
}
function unchanged(c) {
  assert.equal(JSON.stringify(c.f.unsigned), c.originalBlock);
  assert.equal(JSON.stringify(c.f.packet), c.originalPacket);
  assert.equal(c.f.signatures, 1); assert.equal(c.f.addresses, 1);
}
async function committed(c) {
  const result = await c.owner.commitOriginalFunding({ expectedPins: c.f.pins });
  assert.equal(result.originalFundingCommitVersion, 2);
  assert.equal(result.preCustodyRevalidation, 'SAME_ORIGINAL_CURRENT_READ_VALIDATED');
  assert.equal(result.phase, 'LOCAL_STORE_READBACK_MATCHED');
  assert.equal(c.f.accountCalls, 18); assert.deepEqual(c.f.positions, [36, 36]);
  original(c.store, c.f); unchanged(c);
}
async function closed(c) {
  const p = c.owner.close(); assert.equal(c.owner.close(), p);
  const value = await p;
  assert.equal(value.originalFundingReadCloseVersion, 1); assert.equal(value.lifecycle, 'CLOSED');
  assert.equal(value.operationOutcome, 'NOT_ESTABLISHED');
  assert.equal(value.nativeResourceCleanup, 'NOT_QUALIFIED');
  const view = c.owner.inspectOriginalFunding();
  assert.equal(view.lifecycle, 'CLOSED');
  assert.equal(view.nativeResourceClose.nativeCloseStage, 'CLOSED');
  assert.equal(view.nativeResourceClose.storeCloseCallEntered, true);
  assert.equal(view.nativeResourceClose.storeCloseCallReturned, true);
  assert.throws(() => c.store.load(), { code: 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CLOSED' });
  c.closeAsserted = true; counts.normalCloses++;
}
async function withFixture(label, run) {
  assert.ok(++counts.casesEntered <= 3);
  const f = h.fixture(label);
  assert.ok(++counts.createAttempts <= 3);
  const store = CREATE_V6(f.storeOptions);
  let owner = null, primary = null;
  const c = { f, store, closeAsserted: false, expectedHeld: false, get owner() { return owner; } };
  try { owner = APP(h.ownerOptions(f, store)); await run(c); }
  catch (error) { primary = error; }
  finally {
    // Ask only the actual owner to close. Construction/close uncertainty never
    // authorizes a direct store.close, reopening, replay or replacement.
    if (owner === null) retainHeld(store, false);
    else if (!c.closeAsserted) {
      try {
        await owner.close();
        if (c.expectedHeld) throw new Error('EXPECTED_HELD_OWNER_CLOSED');
      } catch (error) {
        retainHeld(store, c.expectedHeld);
        if (!c.expectedHeld || !closeUnknown(error)) {
          counts.secondaryCleanupFailures++; if (primary === null) primary = error;
        }
      }
    }
  }
  if (primary !== null) throw primary;
  await h.completeFixture(f); counts.casesCompleted++;
}
let failure = null;
try {
  await test('actual native reads positive work SDK V6 and one exact original HTTPS POST bind then close', OPTIONS, async () => {
    await withFixture('bound', async c => {
      await prepared(c); await committed(c);
      assert.deepEqual(c.f.observedAges.slice(0, 24), Array(24).fill(0));
      assert.deepEqual(c.f.observedAges.slice(24), Array(48).fill(2));
      const result = await c.owner.submitOriginalFunding({ expectedPins: c.f.pins });
      assert.equal(result.originalFundingSubmissionVersion, 4);
      assert.equal(result.phase, 'FUNDING_INTAKE_BOUND'); assert.equal(result.fundingIntakeStatus, 'BOUND');
      original(c.store, c.f, 'BOUND', 3); unchanged(c);
      assert.equal(c.f.fundingRequests, 1); await closed(c);
      assert.equal(inspect(c.owner, c.f, 'FUNDING_INTAKE_BOUND').lifecycle, 'CLOSED');
    });
  });
  await test('lost native funding ACK preserves the same V6 original and vetoes actual store close without replay', OPTIONS, async () => {
    await withFixture('lost-ack', async c => {
      await prepared(c); await committed(c);
      const result = await c.owner.submitOriginalFunding({ expectedPins: c.f.pins });
      assert.equal(result.originalFundingSubmissionVersion, 4);
      assert.equal(result.phase, 'SUBMISSION_OUTCOME_UNKNOWN');
      assert.equal(result.fundingIntakeStatus, 'OUTCOME_UNKNOWN');
      original(c.store, c.f, 'OUTCOME_UNKNOWN', 3); unchanged(c);
      const p = c.owner.close(); assert.equal(c.owner.close(), p);
      await assert.rejects(p, closeUnknown);
      const view = inspect(c.owner, c.f, 'SUBMISSION_OUTCOME_UNKNOWN');
      assert.equal(view.lifecycle, 'CLOSE_OUTCOME_UNKNOWN');
      assert.equal(view.joinedReadClose.held, true);
      assert.equal(view.nativeResourceClose.storeCloseCallEntered, false);
      assert.equal(view.nativeResourceClose.storeCloseCallReturned, false);
      original(c.store, c.f, 'OUTCOME_UNKNOWN', 3);
      assert.equal(c.f.fundingRequests, 1);
      c.expectedHeld = true; retainHeld(c.store, true); c.closeAsserted = true;
    });
  });
  await test('horizon expiry after real signing refuses before V6 custody or native funding POST', OPTIONS, async () => {
    await withFixture('expired-horizon', async c => {
      await prepared(c);
      await assert.rejects(c.owner.commitOriginalFunding({ expectedPins: c.f.pins }), appError('commit_unknown_or_refused'));
      const view = inspect(c.owner, c.f, 'COMMIT_OUTCOME_UNKNOWN_OR_REFUSED');
      assert.equal(view.preparation.storeEntered, false);
      assert.equal(view.preparation.preCustodyRevalidationPassed, false);
      assert.equal(c.store.load(), null); unchanged(c);
      assert.deepEqual(c.f.observedAges.slice(0, 24), Array(24).fill(0));
      assert.deepEqual(c.f.observedAges.slice(24, 60), Array(36).fill(2));
      assert.deepEqual(c.f.observedAges.slice(60), Array(12).fill(3));
      assert.equal(c.f.fundingRequests, 0); await closed(c);
    });
  });
  assert.equal(counts.casesEntered, 3); assert.equal(counts.casesCompleted, 3);
  assert.equal(counts.createAttempts, 3); assert.equal(counts.normalCloses, 2);
  assert.equal(counts.expectedHeldStores, 1); assert.equal(counts.unexpectedHeldStores, 0);
  assert.equal(counts.secondaryCleanupFailures, 0);
} catch (error) { failure = error; }
finally {
  try { await h.close(); } catch (error) { if (failure === null) failure = error; }
}
if (failure !== null) throw failure;
const fixture = h.counts();
assert.equal(fixture.tcpConnections, 272); assert.equal(fixture.tlsConnections, 272);
assert.equal(fixture.rpcRequests, 270); assert.equal(fixture.fundingRequests, 2);
assert.equal(fixture.lostAcks, 1); assert.equal(fixture.signatures, 3); assert.equal(fixture.uniqueSignedHashes, 3);
assert.equal(fixture.pinFiles, 3); assert.equal(fixture.asyncFailures, 0);
assert.equal(fixture.forcedServerSocketDestructions, 0);
assert.equal(fixture.ownedRawSockets, 0); assert.equal(fixture.ownedTlsSockets, 0);
assert.ok(fixture.aggregateCandidateReservation <= 65536);
console.log('# full-native-loopback-application-fixture ' + JSON.stringify({
  ...counts, fixture, actualFullBoundedHttpsFactoryImported: true, actualNativeHTTPS: true,
  injectedReadFetchMaterialOrOwner: false, newV6Databases: 3, newIndependentPinFiles: 3,
  syntheticKeys: 1, maximumSignatures: 3, normalReopens: 0, heldStoreNotForceClosed: true,
  expectedLoopbackConnections: 272, maximumLoopbackConnections: 524,
  maximumCandidatesPerSearch: 4096, maximumAggregateCandidates: 65536,
  actualProducerCandidateCount: 'NOT_INSTRUMENTED', sourceTransforms: 0,
  nativeOsNetworkSandbox: false, chainPublication: 'NOT_ESTABLISHED', liveOrProduction: false,
}));
