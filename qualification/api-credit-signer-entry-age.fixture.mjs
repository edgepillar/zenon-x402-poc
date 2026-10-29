// Declared clock/store/key-method/wire ports only. Fixed public bytes and
// invalid signature-shaped DATA; no SDK, SQL, socket, signing or nonce search.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { canonicalJson } from '../src/canonical.js';
import { signerContextDataFixture } from './api-credit-signer-context.behavior.mjs';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { captureOriginalFundingSignerPreparation, createOriginalFundingSignerContextIntent, completeOriginalFundingSignerContextRecord } from '../src/original-funding-signer-context-custody.js';
import { createSdk105AgeBoundSignerContextWalletOwner, createSdk105CustodiedPreparedHashWalletOwner } from '../src/zenon/sdk105-prepared-hash-wallet-owner.js';
import { bindWalletOriginalFundingPreparation, bindWalletOriginalFundingPreSignContext, beginWalletOriginalFundingPreSignObservation } from '../src/zenon/original-funding-signer-context-bridge.js';
import { createObservedBalanceDeadlineBoundMaterialRetainedCandidatePreparer } from '../src/zenon/dynamic-plasma-observed-balance-deferred-material-planner.js';
import { createDynamicPlasmaJsonRpcReadTransport } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';

const F = Object.freeze, copy = x => JSON.parse(JSON.stringify(x)), ZERO = '0'.repeat(64), H = '33'.repeat(32), PREVIOUS = '66'.repeat(32);
function make(d, options) {
  const r = { ...d, now: options.start ?? 0n, raw: null, trace: [], clockCalls: 0, signs: 0, clears: 0, keyCalls: 0, begins: 0, retains: 0, stop: null };
  r.backend = F({ requirePreparationContext: true,
    beginSignerAttempt: F((id, block, context) => { r.trace.push('intent-entry'); r.begins++; assert.equal(id, d.row.paymentId); assert.equal(r.raw, null);
      r.raw = createOriginalFundingSignerContextIntent(d.row, block, context); r.trace.push('intent-commit');
      if (options.intent) options.intent(r); return r.raw;
    }),
    retainSignerResult: F((id, expected, block) => { r.retains++; r.trace.push('result-entry'); assert.equal(expected, r.raw); assert.equal(id, d.row.paymentId);
      r.raw = completeOriginalFundingSignerContextRecord(expected, block, d.row); r.trace.push('result-commit'); return r.raw;
    }) });
  r.key = { getAddress() { r.keyCalls++; return d.unsigned.address; }, getPublicKey() { r.keyCalls++; return Buffer.from(d.unsigned.publicKey, 'base64'); },
    sign(hash) { r.signs++; r.trace.push('sdk-entry'); r.signedHash = hash.toString('hex'); if (options.sign) options.sign(r); return Buffer.from(d.signed.signature, 'base64'); },
    clear() { r.clears++; } };
  r.configuration = { keyPair: r.key, expectedAddress: d.unsigned.address, expectedPublicKey: d.unsigned.publicKey };
  r.custody = { paymentId: d.row.paymentId, backend: r.backend };
  r.entry = { clock: F(() => { r.clockCalls++; r.trace.push('clock'); return options.clock ? options.clock(r) : r.now; }), maxReadToSignerMs: options.limit ?? 1000 };
  r.owner = options.legacy ? createSdk105CustodiedPreparedHashWalletOwner(r.configuration, r.custody)
    : createSdk105AgeBoundSignerContextWalletOwner(r.configuration, r.custody, r.entry);
  r.prepare = () => bindWalletOriginalFundingPreparation(r.owner, d.f.input, d.f.resourceUrl);
  r.begin = () => beginWalletOriginalFundingPreSignObservation(r.owner);
  r.bind = () => bindWalletOriginalFundingPreSignContext(r.owner, F({ originalUnsignedBlock: d.unsigned,
    getSignedOriginalData: F(() => F({ originalPlan: d.plan, preSignCheckpointJson: d.handoffData.preSignCheckpointJson })) }));
  r.admit = () => { r.prepare(); r.begin(); r.bind(); };
  r.sign = () => r.owner.sign(d.unsigned); return r;
}
export function signerEntryUnitFixture(options = {}) { return make(signerContextDataFixture(), options); }

export function signerEntryCompositionFixture(options = {}) {
  const f = retainedOriginalInputFixture(), unsigned = f.candidate.originalUnsignedBlock, read = f.input.plannerContext.readInput;
  const prepared = captureOriginalFundingSignerPreparation(f.input, f.resourceUrl);
  const row = { paymentId: 'payment.composition', originalDigest: prepared.originalDigest, network: read.accepted.network, asset: read.accepted.asset,
    recipient: read.accepted.payTo, amount: read.accepted.amount, reservedDay: 1, status: 'RESERVED', spentDay: null };
  const r = make({ f, unsigned, signed: f.candidate.accountBlock, row }, options), counts = [0, 0];
  r.accountReads = 0; r.materialCalls = 0; r.stage = 0; r.dpReads = counts;
  const frontier = { chainIdentifier: '73404', height: 100, hash: H, version: 2, nextFusionPrice: 1000, nextWorkPrice: 1000 };
  const momentum = (v = frontier) => ({ ...v, chainIdentifier: Number(v.chainIdentifier), previousHash: '11'.repeat(32), timestamp: 1234,
    data: '', content: [], changesHash: '66'.repeat(32), publicKey: Buffer.alloc(32, 6).toString('base64'),
    signature: Buffer.alloc(64, 8).toString('base64'), producer: unsigned.address });
  const methods = ['ledger.getFrontierMomentum', 'ledger.getMomentumsByHeight', 'embedded.spork.getAll', 'embedded.plasma.getVariables',
    'embedded.plasma.getRequiredPoWForAccountBlock', 'ledger.getFrontierMomentum'];
  const transports = [0, 1].map(endpoint => createDynamicPlasmaJsonRpcReadTransport({ exchange(body) {
    const request = JSON.parse(body), index = counts[endpoint]++ % 6;
    assert.ok(counts[endpoint] <= 36); assert.equal(request.id, counts[endpoint]); assert.equal(request.method, methods[index]);
    const results = [momentum(), { count: 200, list: [momentum({ ...frontier, height: 2, version: 1, hash: '22'.repeat(32), nextFusionPrice: 0, nextWorkPrice: 0 })] },
      { count: 2, list: [ { id: read.compiledSporkIds.libp2pId, name: 'libp2p', description: 'Synthetic.', activated: false, enforcementHeight: 0 },
        { id: read.compiledSporkIds.dynamicPlasmaId, name: 'dynamic-plasma', description: 'Synthetic.', activated: true, enforcementHeight: 10 } ] },
      { MaxBasePlasmaInMomentum: 4200000, FusedPlasmaTarget: 1050000, PowPlasmaTarget: 1050000, MaxPriceChangePercent: 10, PriceChangeDenominator: 20 },
      { availablePlasma: 30000, basePlasma: 21000, requiredDifficulty: 0, requiredFusedPlasma: 21000 }, momentum()];
    return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: results[index] }));
  } }));
  function accountExchange(body) {
    const request = JSON.parse(body); assert.equal(request.id, ++r.accountReads); assert.ok(r.accountReads <= 18); assert.deepEqual(request.params, [unsigned.address]);
    r.stage = Math.floor((r.accountReads - 1) / 3) + 1;
    if (r.accountReads === 10) { r.trace.push('last-read-start'); assert.equal(r.owner.inspect().signerCustody.signerEntryAge.started, true);
      const wait=r.planner.getMaterialWaitSnapshot();assert.equal(wait.timersStarted,1);assert.equal(wait.timersCleared,1);if (options.read) options.read(r); }
    const result = request.method === 'ledger.getAccountInfoByAddress'
      ? { address: unsigned.address, accountHeight: 6, balanceInfoMap: { [read.accepted.asset]: { token: { tokenStandard: read.accepted.asset }, balance: read.accepted.amount } } }
      : { version: 1, chainIdentifier: 73404, blockType: 3, hash: PREVIOUS, previousHash: '77'.repeat(32), height: 6,
        momentumAcknowledged: { hash: H, height: 100 }, address: unsigned.address, toAddress: read.accepted.payTo, amount: read.accepted.amount,
        tokenStandard: read.accepted.asset, fromBlockHash: '88'.repeat(32), descendantBlocks: [], data: null, fusedPlasma: 0, difficulty: 0,
        nonce: '0000000000000000', basePlasma: 21000, usedPlasma: 21000, changesHash: ZERO, publicKey: '', signature: '', token: null, confirmationDetail: null, pairedAccountBlock: null };
    return Promise.resolve(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
  }
  r.prepare();
  r.planner = createObservedBalanceDeadlineBoundMaterialRetainedCandidatePreparer({ readOptions: { transports, accountExchange }, materialWaitMs: 250, wallet: r.owner,
    materialExchange(request) { r.materialCalls++; assert.equal(r.materialCalls, 1); assert.equal(request.workRequest.accountBlock.difficulty, 0);
      return Promise.resolve({ materialVersion: 1, publicKey: unsigned.publicKey, nonce: '0000000000000000' }); }
  });
  r.run = () => r.planner.prepareSignedCandidate(copy(f.input.plannerContext));
  return r;
}
