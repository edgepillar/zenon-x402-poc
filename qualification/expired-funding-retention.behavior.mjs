// SOURCE CANDIDATE. These cases have not been executed. Ports below are
// declared memory DATA; no SDK, application SQLite, keys, network or native run.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createIssuedExpiredFundingRetention } from '../src/issued-expired-funding-retention.js';
import {
  captureOfficialFundingPostCustodyContext, createOfficialFundingPostEnteredRecord,
  createOfficialFundingPostOutcomeRecord, inspectOfficialFundingPostCustodyRecord,
  createOfficialFundingPostObservationRecord, requireOfficialFundingPostCustodyTransition,
  createOfficialFundingPostExpiredRecord, inspectOfficialFundingPostExpiredReceipt,
  requireOfficialFundingPostRetainedExtension, projectOfficialFundingPostExpiredReceipt,
  officialFundingPostCustodyRecordDigest,
} from '../src/official-funding-post-custody-record.js';
import { createOfficialFundingPostOutcomeCustody } from '../src/official-funding-post-outcome-custody.js';
import { createIssuedFundingPostSdkResourceBinding } from '../src/x402-issued-funding-post-sdk-resource.js';
import { officialOutcomeCustodyDataFixture } from './official-outcome-custody.behavior.mjs';
import { verificationExpiryFixture, deep, deferred, flush } from './verification-expiry.fixture.mjs';

const F = Object.freeze, checks = [];
function check(id, run) { checks.push(F({ id, run })); }
function receipt(pins) {
  return F({ expiredFundingVersion: 1, status: 'FUNDED_NO_NEW_GRANT', ...pins,
    sourceSettlementId: 'settlement_' + '6'.repeat(64), eligibilityObservedAt: pins.expiresAt + 1, paymentAt: null,
    grantActivation: 'NOT_ENTERED_THIS_OPERATION', grantExistence: 'NOT_QUERIED', deliveryLiability: 'RECONCILIATION_REQUIRED',
    serviceDelivery: 'NOT_ESTABLISHED', compensation: 'NOT_ESTABLISHED', verification: 'SELECTED_ORIGINAL_VERIFIER',
    mayStartPayment: false, maySignPayment: false, mayDispatchService: false, mayActivateGrant: false,
    mayStartCompensation: false, authority: 'NONE' });
}
function fixture(options = {}) {
  const d = officialOutcomeCustodyDataFixture();
  const selected = createIssuedFundingPostSdkResourceBinding(d.config.issuedFrame, d.config.resourceUrl).selection();
  const pins = F({ transactionHash: d.bound.transactionHash,
    fundingCommitment: 'sha256:' + selected.resource.tags[1] + selected.resource.tags[2], expiresAt: 20000 });
  const entered = createOfficialFundingPostEnteredRecord(d.selected, d.header, d.bound);
  const raw = createOfficialFundingPostOutcomeRecord(entered, d.result());
  const value = receipt(pins), s = { raw, reads: 0, writes: 0, commits: 0, live: true, guards: 0, trace: [] };
  const port = F({ read: F(() => { s.reads++; s.trace.push('read'); return options.read ? options.read(s) : s.raw; }),
    compareAndSwap: F((expected, next) => {
      s.writes++; s.trace.push('cas'); if (options.cas) return options.cas(s, expected, next);
      requireOfficialFundingPostCustodyTransition(expected, next); assert.equal(s.raw, expected);
      s.raw = next; s.commits++; return next;
    }) });
  const guard = F(() => { s.guards++; s.trace.push('guard'); if (options.guard) options.guard(s); assert.equal(s.live, true); });
  const owner = createIssuedExpiredFundingRetention({ officialRecordJson: raw, context: pins, port });
  return { d, pins, entered, raw, value, s, port, guard, owner,
    retained: () => createOfficialFundingPostExpiredRecord(raw, value, pins),
    run() { owner.claim(guard); return owner.retain(value); } };
}

function largeOriginal(f, note) {
  const value = f.d.result();
  return createOfficialFundingPostOutcomeRecord(f.entered, F({ ...value,
    official: F({ ...value.official, settlement: F({ ...value.official.settlement, note }) }) }));
}
function retainingOriginal(f, original) {
  const s = { raw: original, writes: 0 };
  const owner = createIssuedExpiredFundingRetention({ officialRecordJson: original, context: f.pins,
    port: F({ read: F(() => s.raw), compareAndSwap: F((expected, next) => {
      s.writes++; assert.equal(s.raw, expected); requireOfficialFundingPostCustodyTransition(expected, next);
      s.raw = next; return next;
    }) }) });
  return { s, owner };
}

check('retained-expiry-large-valid-official-result-fits-without-double-encoding', () => {
  const f = fixture(), raw = largeOriginal(f, '"'.repeat(9000));
  assert.equal(inspectOfficialFundingPostCustodyRecord(raw).phase, 'SETTLED');
  assert.ok(canonicalJson({ version: 2, officialRecordJson: raw, expiredFundingJson: canonicalJson(f.value) }).length > 65536);
  const r = retainingOriginal(f, raw); r.owner.claim(f.guard); assert.equal(r.owner.retain(f.value), undefined);
  assert.ok(r.s.raw.length <= 65536); assert.equal(r.s.writes, 1); assert.equal(r.owner.snapshot().completed, true);
  assert.equal(canonicalJson(JSON.parse(r.s.raw).officialRecord), raw);
  assert.equal(inspectOfficialFundingPostCustodyRecord(r.s.raw).outcomeJson, JSON.parse(raw).outcomeJson);
  assert.deepEqual(inspectOfficialFundingPostExpiredReceipt(r.s.raw, f.pins), f.value);
});
check('retention-pre-cas-size-refusal-keeps-candidate-held-without-writing-or-retrying', () => {
  const f = fixture(); let low = 0, high = 16384, raw = largeOriginal(f, '');
  for (let i = 0; i < 15 && low < high; i++) {
    const count = Math.ceil((low + high) / 2);
    try { raw = largeOriginal(f, '"'.repeat(count)); low = count; } catch { high = count - 1; }
  }
  assert.equal(low, high); raw = largeOriginal(f, '"'.repeat(low));
  assert.equal(inspectOfficialFundingPostCustodyRecord(raw).phase, 'SETTLED');
  assert.throws(() => createOfficialFundingPostExpiredRecord(raw, f.value, f.pins));
  const r = retainingOriginal(f, raw); r.owner.claim(f.guard); assert.throws(() => r.owner.retain(f.value));
  const view = r.owner.snapshot(); assert.equal(view.held, true); assert.equal(view.completed, false);
  assert.equal(view.candidateReceiptRetained, true); assert.equal(view.proposedWriteRetained, false);
  assert.equal(view.writeAcknowledged, false); assert.equal(r.s.raw, raw); assert.equal(r.s.writes, 0);
  assert.throws(() => r.owner.retain(f.value)); assert.equal(r.s.writes, 0);
});
check('retained-expiry-reconstructs-canonical-v1-escape-and-unicode-bytes-exactly', () => {
  const f = fixture(), raw = largeOriginal(f, '\\"\n\u0000\ud83d\ude00');
  const next = createOfficialFundingPostExpiredRecord(raw, f.value, f.pins);
  assert.equal(canonicalJson(JSON.parse(next).officialRecord), raw);
  assert.deepEqual(inspectOfficialFundingPostCustodyRecord(next), inspectOfficialFundingPostCustodyRecord(raw));
  assert.notEqual(officialFundingPostCustodyRecordDigest(next), officialFundingPostCustodyRecordDigest(raw));
});
check('retained-expiry-refuses-the-unpublished-string-envelope-draft', () => {
  const f = fixture(), draft = canonicalJson({ version: 2, officialRecordJson: f.raw, expiredFundingJson: canonicalJson(f.value) });
  assert.throws(() => inspectOfficialFundingPostCustodyRecord(draft));
  assert.throws(() => requireOfficialFundingPostCustodyTransition(f.raw, draft));
});
check('retention-invalid-candidate-does-not-create-a-receipt-or-cas', () => {
  const f = fixture(); f.owner.claim(f.guard);
  assert.throws(() => f.owner.retain(F({ ...f.value, mayActivateGrant: true })));
  assert.equal(f.owner.snapshot().candidateReceiptRetained, false); assert.equal(f.owner.snapshot().held, true);
  assert.equal(f.s.writes, 0);
});

check('retained-expiry-wraps-exact-terminal-official-bytes-without-changing-projection', () => {
  const f = fixture(), raw = f.retained(), envelope = JSON.parse(raw);
  assert.equal(envelope.version, 2); assert.equal(canonicalJson(envelope.officialRecord), f.raw);
  assert.deepEqual(inspectOfficialFundingPostCustodyRecord(raw), inspectOfficialFundingPostCustodyRecord(f.raw));
  assert.deepEqual(inspectOfficialFundingPostExpiredReceipt(raw, f.pins), f.value);
});
check('retained-expiry-v1-absence-is-not-a-new-funding-or-verification-claim', () => {
  const f = fixture(); assert.equal(inspectOfficialFundingPostExpiredReceipt(f.raw, f.pins), null);
  assert.equal(projectOfficialFundingPostExpiredReceipt(f.raw, officialFundingPostCustodyRecordDigest(f.raw), f.pins), null);
});
check('retained-expiry-requires-the-independently-selected-transaction', () => {
  const f = fixture(); assert.throws(() => createOfficialFundingPostExpiredRecord(f.raw, receipt({ ...f.pins, transactionHash: 'f'.repeat(64) }), f.pins));
});
check('retained-expiry-requires-the-original-funding-commitment', () => {
  const f = fixture(); assert.throws(() => createOfficialFundingPostExpiredRecord(f.raw, receipt({ ...f.pins, fundingCommitment: 'sha256:' + 'f'.repeat(64) }), f.pins));
});
check('retained-expiry-requires-the-independent-absolute-expiry', () => {
  const f = fixture(); assert.throws(() => createOfficialFundingPostExpiredRecord(f.raw, receipt({ ...f.pins, expiresAt: f.pins.expiresAt + 1 }), f.pins));
  assert.throws(() => inspectOfficialFundingPostExpiredReceipt(f.retained(), { ...f.pins, expiresAt: f.pins.expiresAt + 1 }));
});
check('retained-expiry-cannot-wrap-an-inflight-pending-or-exhausted-official-result', () => {
  const f = fixture(), pending = createOfficialFundingPostOutcomeRecord(f.entered, f.d.result('PENDING'));
  const reserved = createOfficialFundingPostObservationRecord(pending);
  const again = createOfficialFundingPostOutcomeRecord(reserved, f.d.result('PENDING'));
  const exhausted = createOfficialFundingPostOutcomeRecord(createOfficialFundingPostObservationRecord(again), f.d.result('EXHAUSTED'));
  for (const raw of [f.entered, pending, reserved, exhausted]) {
    assert.throws(() => createOfficialFundingPostExpiredRecord(raw, f.value, f.pins));
  }
});
check('retained-expiry-rejects-extra-envelope-fields-and-noncanonical-bytes', () => {
  const f = fixture(), raw = f.retained();
  for (const bad of [raw + '\n', canonicalJson({ ...JSON.parse(raw), extra: true }), 'x'.repeat(65537)]) {
    assert.throws(() => inspectOfficialFundingPostCustodyRecord(bad));
  }
});
check('retained-expiry-does-not-allow-nested-retention-wrappers', () => {
  const f = fixture(), raw = f.retained(); assert.throws(() => createOfficialFundingPostExpiredRecord(raw, f.value, f.pins));
  assert.throws(() => inspectOfficialFundingPostCustodyRecord(canonicalJson({ ...JSON.parse(raw), officialRecord: JSON.parse(raw) })));
});
check('retained-expiry-is-a-single-strict-cas-extension-not-a-repeatable-claim', () => {
  const f = fixture(), raw = f.retained(); assert.equal(requireOfficialFundingPostCustodyTransition(f.raw, raw).phase, 'SETTLED');
  assert.throws(() => requireOfficialFundingPostCustodyTransition(raw, raw));
  assert.throws(() => requireOfficialFundingPostCustodyTransition(null, raw));
});
check('retained-expiry-cannot-delete-or-replace-a-recorded-obligation', () => {
  const f = fixture(), raw = f.retained(); assert.throws(() => requireOfficialFundingPostCustodyTransition(raw, f.raw));
  const changed = createOfficialFundingPostExpiredRecord(f.raw, F({ ...f.value, sourceSettlementId: 'settlement_' + '9'.repeat(64) }), f.pins);
  assert.throws(() => requireOfficialFundingPostCustodyTransition(raw, changed));
});
check('retained-expiry-extension-requires-identical-original-record-bytes', () => {
  const f = fixture(), altered = canonicalJson({ ...JSON.parse(f.raw), maximumPendingReconciliations: 3 });
  const proposed = createOfficialFundingPostExpiredRecord(altered, f.value, f.pins);
  assert.throws(() => requireOfficialFundingPostRetainedExtension(f.raw, proposed));
});
check('retained-expiry-preserves-no-authority-no-delivery-and-no-compensation-flags', () => {
  const f = fixture(); for (const field of ['mayStartPayment', 'maySignPayment', 'mayDispatchService', 'mayActivateGrant', 'mayStartCompensation']) {
    assert.throws(() => createOfficialFundingPostExpiredRecord(f.raw, F({ ...f.value, [field]: true }), f.pins));
  }
  assert.equal(inspectOfficialFundingPostExpiredReceipt(f.retained(), f.pins).deliveryLiability, 'RECONCILIATION_REQUIRED');
});
check('retained-expiry-history-checks-independent-digest-before-parsing', () => {
  const original = JSON.parse; let hooks = 0; JSON.parse = () => { hooks++; throw Error(); };
  try { assert.throws(() => projectOfficialFundingPostExpiredReceipt('{bad', 'sha256:' + '0'.repeat(64), {})); assert.equal(hooks, 0); }
  finally { JSON.parse = original; }
});
check('retained-expiry-history-is-not-fresh-verification-or-service-authority', () => {
  const f = fixture(), raw = f.retained(), out = projectOfficialFundingPostExpiredReceipt(raw, officialFundingPostCustodyRecordDigest(raw), f.pins);
  assert.equal(out.verification, 'STORED_HISTORY_NOT_REVALIDATED'); assert.equal(out.authority, 'NONE');
  for (const field of ['mayEnterSdk', 'mayStartFunding', 'mayReverifyFunding', 'mayActivateGrant', 'mayDispatchService', 'mayStartCompensation']) assert.equal(out[field], false);
});
check('retention-construction-is-inert-before-explicit-owned-claim', () => {
  const f = fixture(); assert.equal(f.s.reads + f.s.writes, 0); assert.throws(() => f.owner.retain(f.value));
  assert.equal(f.s.reads + f.s.writes, 0);
});
check('retention-claim-requires-one-frozen-owner-fence-before-verifier-entry', () => {
  const f = fixture(); assert.throws(() => f.owner.claim(() => {})); assert.equal(f.s.reads, 0);
  f.owner.claim(f.guard); assert.throws(() => f.owner.claim(f.guard)); assert.equal(f.s.reads, 1);
});
check('retention-persist-and-exact-readback-precede-known-completion', () => {
  const f = fixture(); assert.equal(f.run(), undefined); const view = f.owner.snapshot();
  assert.equal(f.s.writes, 1); assert.equal(f.s.commits, 1); assert.equal(f.s.reads, 3);
  assert.equal(view.completed, true); assert.equal(view.held, false); assert.equal(view.writeAcknowledged, true); assert.equal(view.readBackObserved, true);
  assert.deepEqual(inspectOfficialFundingPostExpiredReceipt(f.s.raw, f.pins), f.value);
});
check('retention-lost-write-ack-preserves-proposal-and-candidate-without-retry', () => {
  const f = fixture({ cas(s, old, next) { s.raw = next; s.commits++; throw Error('declared lost ACK'); } });
  assert.throws(() => f.run()); const view = f.owner.snapshot();
  assert.equal(view.held, true); assert.equal(view.completed, false); assert.equal(view.candidateReceiptRetained, true); assert.equal(view.proposedWriteRetained, true);
  assert.throws(() => f.owner.retain(f.value)); assert.equal(f.s.writes, 1);
  assert.equal(projectOfficialFundingPostExpiredReceipt(f.s.raw, officialFundingPostCustodyRecordDigest(f.s.raw), f.pins).authority, 'NONE');
});
check('retention-bad-write-ack-does-not-use-a-matching-row-to-repair-it', () => {
  const f = fixture({ cas(s, old, next) { s.raw = next; return true; } }); assert.throws(() => f.run());
  assert.equal(f.s.reads, 2); assert.equal(f.owner.snapshot().held, true); assert.equal(f.owner.snapshot().readBackObserved, false);
});
check('retention-lost-readback-keeps-held-despite-a-committed-receipt', () => {
  const f = fixture({ read(s) { return s.reads === 3 ? null : s.raw; } }); assert.throws(() => f.run());
  assert.equal(f.s.commits, 1); assert.equal(f.owner.snapshot().held, true); assert.equal(f.owner.snapshot().completed, false);
});
check('retention-row-drift-is-refused-before-cas', () => {
  const f = fixture(); f.owner.claim(f.guard); f.s.raw = f.retained(); assert.throws(() => f.owner.retain(f.value));
  assert.equal(f.s.writes, 0); assert.equal(f.owner.snapshot().held, true);
});
check('retention-owner-close-during-read-is-fenced-before-cas', () => {
  const f = fixture({ read(s) { if (s.reads === 2) s.live = false; return s.raw; } }); assert.throws(() => f.run());
  assert.equal(f.s.writes, 0); assert.equal(f.owner.snapshot().held, true);
});
check('retention-owner-close-during-cas-keeps-committed-history-held', () => {
  const f = fixture({ cas(s, old, next) { s.raw = next; s.commits++; s.live = false; return next; } }); assert.throws(() => f.run());
  assert.equal(f.s.writes, 1); assert.equal(f.s.reads, 2); assert.equal(f.owner.snapshot().held, true);
  assert.deepEqual(inspectOfficialFundingPostExpiredReceipt(f.s.raw, f.pins), f.value);
});
check('retention-promise-ack-is-not-an-implicit-join-or-late-success', async () => {
  const late = deferred(), f = fixture({ cas(s, old, next) { s.raw = next; return late.promise; } });
  assert.throws(() => f.run()); late.resolve(f.s.raw); await flush(); assert.equal(f.owner.snapshot().held, true);
  assert.equal(f.owner.snapshot().completed, false); assert.equal(f.s.reads, 2); assert.equal(f.s.writes, 1);
});
check('retention-thenable-read-does-not-execute-user-hooks', () => {
  let hooks = 0; const value = Object.defineProperty({}, 'then', { get() { hooks++; throw Error(); } });
  const f = fixture({ read() { return value; } }); assert.throws(() => f.owner.claim(f.guard));
  assert.equal(hooks, 0); assert.equal(f.s.writes, 0);
});
check('retained-expiry-receipt-accessors-and-proxies-do-not-execute-hooks', () => {
  const f = fixture(); let hooks = 0; const value = { ...f.value };
  Object.defineProperty(value, 'transactionHash', { enumerable: true, get() { hooks++; throw Error(); } });
  assert.throws(() => createOfficialFundingPostExpiredRecord(f.raw, value, f.pins));
  assert.throws(() => createOfficialFundingPostExpiredRecord(f.raw, new Proxy({}, { getOwnPropertyDescriptor() { hooks++; throw Error(); } }), f.pins));
  assert.equal(hooks, 0);
});
check('retention-invalid-owner-fence-never-becomes-an-implicit-await', () => {
  const f = fixture(), guard = F(() => Promise.resolve(undefined));
  assert.throws(() => f.owner.claim(guard)); assert.equal(f.s.reads + f.s.writes, 0); assert.equal(f.owner.snapshot().held, true);
});
check('retention-existing-record-is-history-not-another-verification-claim', () => {
  const f = fixture(); f.run(); const count = f.s.reads + f.s.writes;
  assert.throws(() => createIssuedExpiredFundingRetention({ officialRecordJson: f.s.raw, context: f.pins, port: f.port }));
  assert.equal(f.s.reads + f.s.writes, count);
});
check('retention-unexpired-completion-does-not-write-a-liability-receipt', () => {
  const f = fixture(); f.owner.claim(f.guard); assert.equal(f.owner.finishUnexpired(), undefined);
  assert.equal(f.s.writes, 0); assert.equal(f.owner.snapshot().completed, true); assert.throws(() => f.owner.retain(f.value));
});
check('existing-custody-owner-accepts-only-the-exact-terminal-retention-extension', () => {
  const f = fixture(); f.s.raw = null;
  const old = createOfficialFundingPostOutcomeCustody({ context: f.d.config, port: f.port });
  old.enter(f.d.header, f.d.bound); old.record(f.d.result()); const sdkOutcome = old.exportRecordedState();
  f.s.raw = createOfficialFundingPostExpiredRecord(f.s.raw, f.value, f.pins); old.assertCurrent();
  assert.equal(old.exportRecordedState().outcomeJson, sdkOutcome.outcomeJson); assert.equal(old.snapshot().held, false);
  assert.throws(() => old.beginObservation()); assert.equal(old.snapshot().observations, 0);
});
check('existing-pending-owner-cannot-adopt-an-unobserved-settled-retention-record', () => {
  const f = fixture(); f.s.raw = null;
  const old = createOfficialFundingPostOutcomeCustody({ context: f.d.config, port: f.port });
  old.enter(f.d.header, f.d.bound); old.record(f.d.result('PENDING')); f.s.raw = f.retained();
  assert.throws(() => old.assertCurrent()); assert.equal(old.snapshot().held, true);
});

function application(options = {}) {
  const counts = { callbacks: 0, guards: 0 };
  const f = verificationExpiryFixture({
    verify: options.verify,
    prepare(context, state, root, activate) {
      const status = options.status ?? 'READY_WITH_RETAINED_EXPIRY_OUTCOME';
      const method = status.startsWith('VERIFY_') ? 'verify' : 'activate';
      return F({ status,
        [method]: F(guard => { counts.guards++; assert.equal(guard(), undefined); if (!options.unexpired) state.now = context.c.challenge.activationIntent.expiresAt; return activate(); }),
        retainExpiredFunding: F(value => { counts.callbacks++; assert.equal(value.transactionHash, context.c.transactionHash);
          if (options.retain) return options.retain(value, root, state); return undefined; }) });
    },
  });
  return { f, counts };
}
check('activation-owner-observes-retained-mode-before-returning-no-new-grant', async () => {
  const a = application(), out = await a.f.run(); assert.equal(out.status, 'FUNDED_NO_NEW_GRANT');
  assert.equal(a.counts.callbacks, 1); assert.equal(a.f.s.mintCalls + a.f.s.admissions, 0);
  assert.equal(a.f.root.snapshot().expiredFundingRetentionCalls, 1);
});
check('activation-owner-retention-failure-stays-held-without-reverification', async () => {
  const a = application({ retain() { throw Error('declared CAS ACK loss'); } }); await assert.rejects(a.f.run());
  assert.equal(a.f.root.snapshot().held, true); await assert.rejects(a.f.run());
  assert.equal(a.counts.callbacks, 1); assert.equal(a.f.s.verifications, 1); assert.equal(a.f.s.admissions, 0);
});
check('activation-owner-nonvoid-retention-result-is-not-success', async () => {
  const a = application({ retain() { return true; } }); await assert.rejects(a.f.run());
  assert.equal(a.f.root.snapshot().held, true); assert.equal(a.f.s.admissions, 0);
});
check('activation-owner-late-expired-verifier-result-after-close-does-not-enter-retention', async () => {
  const pending = deferred(), a = application({ verify(f) { return pending.promise; } });
  const run = a.f.run(); await flush(); const closing = a.f.root.close();
  pending.resolve(deep(JSON.parse(JSON.stringify(a.f.f.verified)))); await assert.rejects(run); await assert.rejects(closing);
  assert.equal(a.counts.callbacks, 0); assert.equal(a.f.s.mintCalls + a.f.s.admissions, 0);
});
check('activation-owner-close-during-retention-cannot-promote-a-late-receipt', async () => {
  const a = application({ retain(value, root) { root.close(); return undefined; } }); await assert.rejects(a.f.run());
  assert.equal(a.counts.callbacks, 1); assert.equal(a.f.root.snapshot().held, true); assert.equal(a.f.s.admissions, 0);
});
check('activation-owner-ordinary-unexpired-result-keeps-existing-grant-admission', async () => {
  const a = application({ unexpired: true }), out = await a.f.run(); assert.equal(out.status, 'ADMITTED');
  assert.equal(a.f.s.mintCalls, 1); assert.equal(a.f.s.admissions, 1); assert.equal(a.counts.callbacks, 0);
});
check('legacy-prepared-mode-cannot-smuggle-a-new-retention-callback', async () => {
  const a = application({ status: 'READY_WITH_EXPIRY_OUTCOME' }); await assert.rejects(a.f.run());
  assert.equal(a.f.s.verifications, 0); assert.equal(a.counts.callbacks, 0);
});
check('already-expired-owner-mode-retains-before-output-without-an-activation-entry', async () => {
  const a = application({ status: 'VERIFY_EXPIRED_FUNDING_WITH_RETENTION' }), out = await a.f.run();
  assert.equal(out.status, 'FUNDED_NO_NEW_GRANT'); assert.equal(a.counts.callbacks, 1);
  assert.equal(a.f.root.snapshot().verificationEntered, true); assert.equal(a.f.root.snapshot().activationEntered, false);
  assert.equal(a.f.s.mintCalls + a.f.s.admissions, 0);
});
check('legacy-expired-verification-mode-cannot-smuggle-a-retention-callback', async () => {
  const a = application({ status: 'VERIFY_EXPIRED_FUNDING' }); await assert.rejects(a.f.run());
  assert.equal(a.f.s.verifications, 0); assert.equal(a.counts.callbacks, 0);
});

export const expiredFundingRetentionDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = []; let current = null, reported = false;
  function report() {
    if (reported) return; reported = true; const failed = cases.filter(c => c.status !== 'PASS').length;
    console.log(JSON.stringify({ qualification: 'G1_G2_EXPIRED_FUNDING_RETENTION_DATA', passed: cases.length - failed, failed, cases,
      ports: 'DECLARED_MEMORY_ONLY', actualRecordCodecRetentionAndActivationOwners: true,
      nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0,
      nodeChildren: 0, actualPrepare: 0, payouts: 0, nativeDurability: 'NOT_ESTABLISHED',
      physicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED', G1G2: 'OPEN' }));
    if (failed) process.exitCode = 1;
  }
  function unsettled() { if (current !== null) { cases.push({ id: current, status: 'FAIL', error: 'UNSETTLED_DECLARED_DATA_PROMISE' }); report(); } }
  process.once('beforeExit', unsettled);
  for (const { id, run } of checks) {
    current = id; try { await run(); cases.push({ id, status: 'PASS' }); }
    catch (error) { cases.push({ id, status: 'FAIL', error: String(error?.message ?? 'unknown').slice(0, 256) }); }
    current = null;
  }
  process.off('beforeExit', unsettled); report();
}
