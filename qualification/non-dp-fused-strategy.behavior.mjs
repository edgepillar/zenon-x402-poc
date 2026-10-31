// Actual non-DP policy/draft and shared UserSend codecs over declared DATA.
// Fixed address/checksum bytes are fixtures, not generated keys or chain proof.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { paymentIntentDigest } from '../src/canonical.js';
import { NonDpFusedPlasmaStrategy as Strategy } from '../src/zenon/non-dp-fused-plasma-strategy.js';
import { BoundedDynamicPlasmaStrategy } from '../src/zenon/bounded-dynamic-plasma-strategy.js';
import { computeZenonUnsignedUserSendHash, validateZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';

const F = Object.freeze, checks = [], copy = x => JSON.parse(JSON.stringify(x));
const H = '33'.repeat(32), NEXT = '44'.repeat(32), ZERO = '0'.repeat(64);
function address(byte) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = []; let accumulator = 0, bits = 0, checksum = 1;
  for (const value of [0, ...Array(19).fill(byte)]) { accumulator = (accumulator << 8) | value; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); } }
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) { const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [i, g] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries()) if ((top >>> i) & 1) checksum ^= g; }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(w => alphabet[w]).join('') + Array.from({ length: 6 }, (_, i) => alphabet[(checksum >>> (5 * (5 - i))) & 31]).join('');
}
const A = address(17), B = address(34);
export function nonDpFusedDataContext() {
  const accepted = { scheme: 'exact', network: 'zenon:testnet', asset: 'zts1znnxxxxxxxxxxxxx9z4ulx', amount: '5', payTo: B, maxTimeoutSeconds: 60,
    extra: { poc: true, settlement: 'account-block', paymentFlow: 'upfront', zenonChain: { version: 1, chainIdentifier: '73404', genesisMomentumHash: '11'.repeat(32) } } };
  const paymentRequired = { x402Version: 2, resource: { url: 'https://resource.invalid/paid', description: 'Synthetic resource.', mimeType: 'application/json', tags: ['synthetic'] }, accepts: [copy(accepted)] };
  const subject = { subjectVersion: 1, version: 1, chainIdentifier: 73404, blockType: 2, previousHash: '66'.repeat(32), height: 7,
    momentumAcknowledged: { hash: H, height: 100 }, address: A, toAddress: B, amount: '5', tokenStandard: accepted.asset, fromBlockHash: ZERO,
    data: Buffer.from(paymentIntentDigest(paymentRequired, accepted), 'hex').toString('base64') };
  const frontier = { height: 100, hash: H, version: 1, nextFusionPrice: 0, nextWorkPrice: 0 };
  return { phase: 'UNSIGNED', subject, paymentRequired, accepted, payerAddress: A,
    compiledSporkIds: { dynamicPlasmaId: '02'.repeat(32), libp2pId: '01'.repeat(32) },
    observation: { chainProfileMatch: { classification: 'MATCH' }, beforeFrontier: copy(frontier),
      rpcObservation: { availablePlasma: 30000, basePlasma: 21000, requiredDifficulty: 0 }, afterFrontier: copy(frontier) },
    observedQuoteRequest: { address: A, blockType: 2, toAddress: B, data: subject.data },
    policy: { policyVersion: 1, maxFusedPlasma: 30000, maxMomentumAdvances: 2 }, runtimeContextDigest: 'sha256:' + 'b'.repeat(64) };
}
function advance(c, height = 102, hash = NEXT) { c.observation.beforeFrontier.height = c.observation.afterFrontier.height = height;
  c.observation.beforeFrontier.hash = c.observation.afterFrontier.hash = hash; return c; }
function activate(c) { for (const k of ['beforeFrontier', 'afterFrontier']) Object.assign(c.observation[k], { version: 2, nextFusionPrice: 1000, nextWorkPrice: 1000 }); return c; }
function check(id, run) { checks.push(F({ id, run })); }
async function refused(edit) { const c = nonDpFusedDataContext(); edit(c); await assert.rejects(new Strategy().quote(c), /NON_DP_FUSED_PLASMA/); }

check('non-dp-quote-selects-the-existing-sdk105-legacy-rpc-request-shape', async () => {
  const c = nonDpFusedDataContext(), q = await new Strategy().quote(c);
  assert.equal(q.rpcMethod, 'embedded.plasma.getRequiredPoWForAccountBlock');
  assert.deepEqual(q.quoteRequest, c.observedQuoteRequest); assert.equal(q.quoteRequest.data, c.subject.data);
  assert.equal(q.authority, 'NONE'); assert.equal(q.chainAuthentication, 'NOT_ESTABLISHED');
});
check('non-dp-apply-uses-only-required-base-fusion-with-zero-difficulty', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), q = await s.quote(c);
  assert.deepEqual(await s.apply(c, q), { fusedPlasma: 21000, difficulty: 0 }); assert.equal(q.selected.fusedPlasma < c.observation.rpcObservation.availablePlasma, true);
});
check('non-dp-draft-keeps-original-intent-fields-and-uncomputed-material', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), before = JSON.stringify(c), q = await s.quote(c), d = await s.createUnsignedUserSendDraft(c, q);
  for (const k of Object.keys(c.subject).filter(k => k !== 'subjectVersion')) assert.deepEqual(d.accountBlock[k], c.subject[k]);
  assert.equal(d.accountBlock.fusedPlasma, 21000); assert.equal(d.accountBlock.difficulty, 0);
  assert.equal(d.accountBlock.hash, ZERO); assert.equal(d.accountBlock.nonce, '0'.repeat(16));
  assert.equal(d.accountBlock.publicKey, ''); assert.equal(d.accountBlock.signature, ''); assert.equal(d.hashStatus, 'UNCOMPUTED');
  assert.equal(JSON.stringify(c), before); assert.equal(Object.isFrozen(d.accountBlock), true);
});
check('non-dp-draft-composes-with-the-existing-306-byte-hash-codec', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), d = await s.createUnsignedUserSendDraft(c, await s.quote(c));
  const block = { ...d.accountBlock, hash: computeZenonUnsignedUserSendHash(d.accountBlock) }, checked = validateZenonUnsignedUserSendHash(block);
  assert.equal(checked.preimageBytes, 306); assert.equal(checked.computedHash, block.hash); assert.equal(checked.workValidation, 'NOT_PERFORMED');
});
check('non-dp-rejects-positive-work-and-insufficient-fused-resource-without-fallback', async () => {
  await refused(c => { c.observation.rpcObservation.requiredDifficulty = 1500; });
  await refused(c => { c.observation.rpcObservation.availablePlasma = 20999; });
  await refused(c => { c.observation.rpcObservation.availablePlasma = 0; c.observation.rpcObservation.requiredDifficulty = 31500000; });
});
check('non-dp-fusion-cap-is-enforced-at-the-exact-base-plasma-boundary', async () => {
  const c = nonDpFusedDataContext(); c.policy.maxFusedPlasma = 21000;
  assert.equal((await new Strategy().quote(c)).selected.fusedPlasma, 21000); c.policy.maxFusedPlasma--;
  await assert.rejects(new Strategy().quote(c));
});
check('non-dp-origin-momentum-must-match-the-unsigned-subject', async () => {
  await refused(c => { c.subject.momentumAcknowledged.hash = NEXT; });
  await refused(c => { c.subject.momentumAcknowledged.height++; });
});
check('non-dp-rejects-unstable-before-after-frontier-observations', async () => {
  await refused(c => { c.observation.afterFrontier.hash = NEXT; });
  await refused(c => { c.observation.afterFrontier.height++; });
  await refused(c => { c.observation.afterFrontier.version = 2; });
});
check('non-dp-rejects-active-dp-even-with-zero-required-difficulty', async () => { await refused(activate); });
check('non-dp-rejects-incoherent-or-unsupported-frontier-prices-and-version', async () => {
  await refused(c => { c.observation.beforeFrontier.nextFusionPrice = c.observation.afterFrontier.nextFusionPrice = 1000; });
  await refused(c => { c.observation.beforeFrontier.version = c.observation.afterFrontier.version = 3; });
});
check('non-dp-unavailable-or-mismatched-chain-observations-are-not-legacy-permission', async () => {
  for (const classification of ['MISMATCH', 'UNAVAILABLE']) await refused(c => { c.observation.chainProfileMatch.classification = classification; });
  for (const key of ['beforeFrontier', 'afterFrontier', 'rpcObservation']) await refused(c => { c.observation[key] = null; });
});
check('non-dp-rpc-request-must-match-the-independent-full-user-send-subject', async () => {
  for (const change of [{ address: B }, { toAddress: A }, { blockType: 3 }, { data: '' }]) await refused(c => { Object.assign(c.observedQuoteRequest, change); });
});
check('non-dp-copied-and-cross-owner-quotes-cannot-select-material', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), q = await s.quote(c);
  await assert.rejects(s.apply(c, F({ ...q }))); await assert.rejects(s.apply(c, copy(q)));
  await assert.rejects(new Strategy().apply(c, q)); await assert.rejects(s.createUnsignedUserSendDraft(c, F({ ...q })));
});
check('non-dp-final-read-advances-keep-the-original-acknowledgement-and-allocation', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), q = await s.quote(c), now = advance(copy(c));
  now.observation.rpcObservation.availablePlasma = 25000;
  assert.deepEqual(await s.apply(now, q), q.selected); const d = await s.createUnsignedUserSendDraft(now, q);
  assert.deepEqual(d.accountBlock.momentumAcknowledged, { hash: H, height: 100 }); assert.equal(d.accountBlock.fusedPlasma, 21000);
});
check('non-dp-final-read-refuses-window-overflow-rollback-and-same-height-fork', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), q = await s.quote(c);
  for (const [height, hash] of [[103, NEXT], [99, NEXT], [100, NEXT]]) await assert.rejects(s.apply(advance(copy(c), height, hash), q));
});
check('non-dp-final-read-refuses-resource-loss-or-base-cost-change', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), q = await s.quote(c);
  for (const change of [{ availablePlasma: 20999 }, { basePlasma: 21001 }, { requiredDifficulty: 1 }]) {
    const now = copy(c); Object.assign(now.observation.rpcObservation, change); await assert.rejects(s.apply(now, q));
  }
});
check('non-dp-final-read-refuses-dp-activation-without-replanning', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), q = await s.quote(c); await assert.rejects(s.apply(activate(advance(copy(c))), q));
});
check('non-dp-quote-does-not-authorize-changed-intent-policy-or-runtime', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), q = await s.quote(c);
  for (const edit of [v => { v.runtimeContextDigest = 'sha256:' + 'a'.repeat(64); }, v => { v.policy.maxFusedPlasma++; },
    v => { v.subject.height++; }, v => { v.subject.amount = '6'; }]) { const now = copy(c); edit(now); await assert.rejects(s.apply(now, q)); }
});
check('non-dp-rejects-accessors-and-value-hooks-without-entering-them', async () => {
  let entries = 0;
  await refused(c => { Object.defineProperty(c.observation.rpcObservation, 'basePlasma', { enumerable: true, get() { entries++; return 21000; } }); });
  await refused(c => { c.observedQuoteRequest.data = { toJSON() { entries++; return c.subject.data; } }; });
  await refused(c => { c.runtimeContextDigest = { toString() { entries++; return 'sha256:' + 'b'.repeat(64); } }; });
  assert.equal(entries, 0);
});
check('non-dp-rejects-proxy-inputs-and-receipts-without-traps', async () => {
  let traps = 0; const c = nonDpFusedDataContext(), s = new Strategy(), q = await s.quote(c);
  const proxy = v => new Proxy(v, { get() { traps++; throw Error(); }, ownKeys() { traps++; throw Error(); } });
  await assert.rejects(s.quote(proxy(c))); await assert.rejects(s.apply(c, proxy(q))); assert.equal(traps, 0);
});
check('non-dp-capture-detaches-inputs-and-retains-the-original-policy', async () => {
  const s = new Strategy(), c = nonDpFusedDataContext(), original = copy(c), q = await s.quote(c);
  c.policy.maxFusedPlasma = 1; c.observation.rpcObservation.basePlasma = 1; c.observedQuoteRequest.data = '';
  assert.equal(q.selected.fusedPlasma, 21000); assert.equal(q.policy.maxFusedPlasma, 30000); assert.deepEqual(await s.apply(original, q), q.selected);
});
check('non-dp-rejects-negative-zero-unsafe-and-inconsistent-resource-numbers', async () => {
  for (const change of [{ availablePlasma: -0 }, { basePlasma: 0 }, { basePlasma: Number.MAX_SAFE_INTEGER + 1 }, { requiredDifficulty: '0' }]) {
    await refused(c => { Object.assign(c.observation.rpcObservation, change); });
  }
  for (const cap of [-0, -1, 129]) await refused(c => { c.policy.maxMomentumAdvances = cap; });
});
check('non-dp-signed-phases-extra-fields-and-unowned-method-calls-are-refused', async () => {
  await refused(c => { c.phase = 'SIGNED'; }); await refused(c => { c.signature = ''; });
  assert.throws(() => new Strategy({})); await assert.rejects(Strategy.prototype.quote.call({}, nonDpFusedDataContext()));
  const s = new Strategy(); await assert.rejects(s.quote()); await assert.rejects(s.quote(nonDpFusedDataContext(), {}));
});
check('non-dp-is-an-explicit-separate-spi-with-no-silent-dp-strategy-downgrade', async () => {
  const c = nonDpFusedDataContext(); await assert.rejects(new BoundedDynamicPlasmaStrategy().quote({ phase: 'UNSIGNED', subjectDigest: 'sha256:' + 'a'.repeat(64),
    runtimeContextDigest: c.runtimeContextDigest, observation: c.observation, policy: { policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2, maxFusedPlasma: 30000, maxDifficulty: 0 } }));
  assert.equal((await new Strategy().quote(c)).selected.difficulty, 0);
});

export const nonDpFusedStrategyDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) { try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (e) { cases.push({ id: c.id, status: 'FAILURE', error: e.code ?? e.message }); break; } }
  const failed = cases.filter(c => c.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G1_NON_DP_FUSED_STRATEGY_DATA', passed: cases.length - failed, failed, cases,
    actualNonDpPolicyAndSharedUserSendCodecs: true, observationsDeclared: true, componentCooperativeTimers: false, newCaseTimerInvocations: 0,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
    nativeEntryBinding: 'NOT_IMPLEMENTED', installedSdkCompatibility: 'SOURCE_INSPECTED_NOT_EXECUTED', chainAuthentication: 'NOT_ESTABLISHED',
    physicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED', G0G5Acceptance: 'OPEN' }));
  if (failed || cases.length !== checks.length) process.exitCode = 1;
}
