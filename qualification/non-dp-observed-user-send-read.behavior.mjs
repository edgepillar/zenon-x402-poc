// Declared in-memory JSON-RPC ports only. No socket, SDK, SQLite, keys,
// signatures, work, native PREPARE or application lifecycle is executed.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { nonDpFusedDataContext } from './non-dp-fused-strategy.behavior.mjs';
import { createNonDpObservedUserSendReadAdapter as create } from '../src/zenon/non-dp-observed-user-send-read-adapter.js';
import { createDynamicPlasmaJsonRpcReadTransport } from '../src/zenon/dynamic-plasma-json-rpc-read-transport.js';
import { computeZenonUnsignedUserSendHash, validateZenonUnsignedUserSendHash } from '../src/zenon/transaction-planner.js';

const F = Object.freeze, copy = x => JSON.parse(JSON.stringify(x)), checks = [];
const H = '33'.repeat(32), ZERO = '0'.repeat(64), FRONTIER = 'ledger.getFrontierMomentum';
const ACCOUNT = 'ledger.getFrontierAccountBlock', BALANCE = 'ledger.getAccountInfoByAddress';
const HEIGHT = 'ledger.getMomentumsByHeight', SPORK = 'embedded.spork.getAll';
const QUOTE = 'embedded.plasma.getRequiredPoWForAccountBlock';
const success = value => { const p = Promise.resolve(value); p.catch(() => {}); return p; };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function data() {
  const c = nonDpFusedDataContext(); return { nonDpReadInputVersion: 1, phase: 'UNSIGNED', paymentRequired: c.paymentRequired,
    accepted: c.accepted, payerAddress: c.payerAddress, compiledSporkIds: c.compiledSporkIds,
    policy: c.policy, runtimeContextDigest: c.runtimeContextDigest, publicKey: Buffer.alloc(32, 9).toString('base64') };
}
function header(c, height = 100, hash = H) {
  return { version: 1, chainIdentifier: 73404, hash, previousHash: '11'.repeat(32), height, timestamp: 1,
    data: '', content: [], changesHash: ZERO, publicKey: Buffer.alloc(32).toString('base64'),
    signature: Buffer.alloc(64).toString('base64'), nextFusionPrice: 0, nextWorkPrice: 0, producer: c.payerAddress };
}
function account(c) {
  return { version: 1, chainIdentifier: 73404, blockType: 2, hash: '66'.repeat(32), previousHash: ZERO, height: 6,
    momentumAcknowledged: { height: 99, hash: H }, address: c.payerAddress, toAddress: c.accepted.payTo,
    amount: '5', tokenStandard: c.accepted.asset, fromBlockHash: ZERO, descendantBlocks: [], data: '',
    fusedPlasma: 21000, difficulty: 0, nonce: '0'.repeat(16), basePlasma: 21000, usedPlasma: 21000,
    changesHash: ZERO, publicKey: '', signature: '', token: null, confirmationDetail: null, pairedAccountBlock: null };
}
function fixture(hooks = {}) {
  const c = data(), requests = [], frontiers = [0, 0], reads = [0, 0, 0]; let guardCalls = 0, accountCalls = 0;
  const list = [{ id: c.compiledSporkIds.libp2pId, name: 'libp2p', description: '', activated: true, enforcementHeight: 1 },
    { id: c.compiledSporkIds.dynamicPlasmaId, name: 'Dynamic Plasma', description: '', activated: false, enforcementHeight: 0 }];
  function wire(index) {
    return createDynamicPlasmaJsonRpcReadTransport({ exchange: body => {
      const rpc = JSON.parse(body); requests.push({ index, ...copy(rpc) }); reads[index]++;
      let cycle = Math.max(0, Math.floor((frontiers[index] - 1) / 2)), raw;
      if (rpc.method === FRONTIER) { cycle = Math.floor(frontiers[index]++ / 2); raw = header(c); }
      else if (rpc.method === HEIGHT) raw = { count: 100, list: [header(c, 2, '22'.repeat(32))] };
      else if (rpc.method === SPORK) raw = { count: list.length, list: copy(list.slice(rpc.params[0] * 128, (rpc.params[0] + 1) * 128)) };
      else if (rpc.method === QUOTE) raw = { availablePlasma: 30000, basePlasma: 21000, requiredDifficulty: 0 };
      else throw Error('Unexpected declared port method');
      if (hooks.endpoint) raw = hooks.endpoint(raw, rpc, index, cycle);
      return success('{"jsonrpc":"2.0","id":' + rpc.id + ',"result":' + (typeof raw === 'string' ? raw : JSON.stringify(raw)) + '}');
    } });
  }
  const transports = F([wire(0), wire(1)]);
  const accountExchange = body => {
    const rpc = JSON.parse(body); requests.push({ index: 2, ...copy(rpc) }); reads[2]++; accountCalls++;
    let raw = rpc.method === ACCOUNT ? account(c)
      : { address: c.payerAddress, accountHeight: 6, balanceInfoMap: { [c.accepted.asset]: { token: { tokenStandard: c.accepted.asset }, balance: '50' } } };
    if (hooks.account) raw = hooks.account(raw, rpc, accountCalls);
    const response = '{"jsonrpc":"2.0","id":' + rpc.id + ',"result":' + (typeof raw === 'string' ? raw : JSON.stringify(raw)) + '}';
    return hooks.accountPending ? hooks.accountPending(response, accountCalls) : success(response);
  };
  const requireCurrent = () => { guardCalls++; if (hooks.guard) return hooks.guard(guardCalls, c); };
  const adapter = create(F({ transports: hooks.transports ?? transports, accountExchange, requireCurrent }));
  return { c, adapter, requests, list, reads, guards: () => guardCalls };
}
function check(id, run) { checks.push(F({ id, run })); }
async function rejectedQuote(hooks, edit = () => {}) {
  const f = fixture(hooks); edit(f); await assert.rejects(f.adapter.quote(f.c)); return f;
}
async function planned(hooks = {}) { const f = fixture(hooks); f.plan = await f.adapter.quote(f.c); return f; }

check('non-dp-read-construction-is-inert-and-borrows-parent-ownership', () => {
  const f = fixture(); assert.deepEqual(f.reads, [0, 0, 0]); assert.equal(f.guards(), 0);
  assert.deepEqual(Object.keys(f.adapter), ['quote', 'assemble', 'validateUnsigned', 'inspect']);
  assert.equal(f.adapter.inspect().borrowedReadRelease, 'PARENT_OWNED_NOT_ESTABLISHED'); assert.ok(Object.isFrozen(f.adapter));
});
check('non-dp-read-quote-binds-actual-account-and-independent-full-request', async () => {
  const f = await planned(); assert.deepEqual(f.reads, [5, 5, 3]);
  assert.equal(f.plan.subject.previousHash, '66'.repeat(32)); assert.equal(f.plan.subject.height, 7);
  assert.deepEqual(f.plan.subject.momentumAcknowledged, { height: 100, hash: H });
  for (const r of f.requests.filter(r => r.method === QUOTE)) assert.deepEqual(r.params, [f.plan.quote.quoteRequest]);
  assert.equal(f.plan.quote.selected.fusedPlasma, 21000); assert.equal(f.plan.quote.selected.difficulty, 0);
  assert.equal(f.plan.authority, 'NONE'); assert.equal(f.plan.quote.chainAuthentication, 'NOT_ESTABLISHED');
});
check('non-dp-read-never-requests-dp-variables-or-work', async () => {
  const f = await planned(); await f.adapter.assemble(f.c, f.plan);
  assert.deepEqual([...new Set(f.requests.map(r => r.method))].sort(), [FRONTIER, ACCOUNT, BALANCE, HEIGHT, SPORK, QUOTE].sort());
  assert.equal(Object.hasOwn(f.adapter, 'createWorkRequest'), false);
});
check('non-dp-read-three-stage-pipeline-preserves-original-block-hash-and-ack', async () => {
  const f = await planned({ endpoint(raw, rpc, _index, cycle) {
    if (rpc.method === FRONTIER && cycle) { raw.height += cycle; raw.hash = (cycle === 1 ? '44' : '55').repeat(32); } return raw;
  } });
  const assembled = await f.adapter.assemble(f.c, f.plan), original = assembled.accountBlock;
  assert.equal(validateZenonUnsignedUserSendHash(original).computedHash, original.hash);
  assert.deepEqual(original.momentumAcknowledged, { height: 100, hash: H }); assert.equal(original.publicKey, f.c.publicKey);
  const validated = await f.adapter.validateUnsigned(f.c, f.plan, original);
  assert.equal(validated.accountBlock, original); assert.equal(validated.originalPlan, f.plan);
  assert.deepEqual(f.adapter.inspect().reads, [15, 15, 9]); assert.equal(f.adapter.inspect().stage, 'VALIDATED');
});
check('non-dp-read-no-stage-replay-or-second-economic-original', async () => {
  const f = await planned(); const n = f.requests.length;
  await assert.rejects(f.adapter.quote(f.c)); await assert.rejects(f.adapter.validateUnsigned(f.c, f.plan, {})); assert.equal(f.requests.length, n);
  const a = await f.adapter.assemble(f.c, f.plan); await f.adapter.validateUnsigned(f.c, f.plan, a.accountBlock);
  const count = f.requests.length; await assert.rejects(f.adapter.assemble(f.c, f.plan));
  await assert.rejects(f.adapter.validateUnsigned(f.c, f.plan, a.accountBlock)); assert.equal(f.requests.length, count);
});
check('non-dp-read-invalid-input-is-rejected-before-any-guard-or-read', async () => {
  for (const edit of [c => { c.phase = 'SIGNED'; }, c => { c.policy.maxFusedPlasma = 0; }, c => { c.policy.maxMomentumAdvances = -0; },
    c => { c.publicKey = ''; }, c => { c.runtimeContextDigest += '\n'; }, c => { c.extra = 1; }]) {
    const f = fixture(), c = copy(f.c); edit(c); await assert.rejects(f.adapter.quote(c));
    assert.deepEqual(f.reads, [0, 0, 0]); assert.equal(f.guards(), 0); assert.equal(f.adapter.inspect().held, false);
    assert.equal((await f.adapter.quote(f.c)).subject.height, 7);
  }
});
check('non-dp-read-accessor-and-proxy-inputs-are-not-entered', async () => {
  const f = fixture(); let calls = 0; const c = copy(f.c);
  Object.defineProperty(c.accepted, 'amount', { enumerable: true, get() { calls++; return '5'; } });
  await assert.rejects(f.adapter.quote(c));
  await assert.rejects(f.adapter.quote(new Proxy(f.c, { get() { calls++; }, ownKeys() { calls++; } })));
  assert.equal(calls, 0); assert.equal(f.guards(), 0);
});
check('non-dp-read-snapshot-precedes-first-ownership-callback', async () => {
  const f = fixture({ guard(count, c) { if (count === 1) { c.accepted.amount = '6'; c.policy.maxFusedPlasma = 1; } } });
  const q = await f.adapter.quote(f.c); assert.equal(q.subject.amount, '5'); assert.equal(q.quote.policy.maxFusedPlasma, 30000);
});
check('non-dp-read-pending-operation-rejects-overlapping-stage', async () => {
  const gate = deferred(), entered = deferred();
  const f = fixture({ accountPending(response, count) { if (count !== 1) return success(response); entered.resolve(response); return gate.promise; } });
  const pending = f.adapter.quote(f.c); const response = await entered.promise;
  await assert.rejects(f.adapter.quote(f.c)); assert.equal(f.adapter.inspect().active, true);
  gate.resolve(response); await pending; assert.equal(f.adapter.inspect().stage, 'QUOTED');
});
check('non-dp-read-expired-owner-after-pending-read-never-returns-a-plan', async () => {
  const gate = deferred(), entered = deferred(); let current = true;
  const f = fixture({ guard() { if (!current) throw Error('closed'); },
    accountPending(response) { entered.resolve(response); return gate.promise; } });
  const pending = f.adapter.quote(f.c); pending.catch(() => {}); const response = await entered.promise; current = false; gate.resolve(response);
  await assert.rejects(pending); assert.equal(f.adapter.inspect().held, true); assert.equal(f.requests.length, 1);
});
check('non-dp-read-ownership-guard-must-return-undefined', async () => {
  const f = await rejectedQuote({ guard() { return false; } }); assert.equal(f.requests.length, 0); assert.equal(f.adapter.inspect().held, true);
});
check('non-dp-read-null-frontier-is-never-inferred-as-empty-account', async () => {
  const f = await rejectedQuote({ account(raw, rpc) { return rpc.method === ACCOUNT ? null : raw; } });
  assert.deepEqual(f.reads, [0, 0, 1]); assert.equal(f.adapter.inspect().held, true);
});
check('non-dp-read-account-bracket-must-retain-same-frontier', async () => {
  const f = await rejectedQuote({ account(raw, rpc, count) { if (rpc.method === ACCOUNT && count === 3) raw.hash = '77'.repeat(32); return raw; } });
  assert.deepEqual(f.reads, [5, 5, 3]);
});
check('non-dp-read-original-frontier-is-rechecked-before-later-balance', async () => {
  const f = await planned({ account(raw, rpc, count) { if (rpc.method === ACCOUNT && count > 3) raw.height++; return raw; } });
  await assert.rejects(f.adapter.assemble(f.c, f.plan)); assert.deepEqual(f.reads, [5, 5, 4]);
});
check('non-dp-read-missing-or-insufficient-selected-balance-refuses-before-rule-reads', async () => {
  for (const edit of [raw => { raw.balanceInfoMap = {}; }, raw => { Object.values(raw.balanceInfoMap)[0].balance = '4'; }]) {
    const f = await rejectedQuote({ account(raw, rpc) { if (rpc.method === BALANCE) edit(raw); return raw; } }); assert.deepEqual(f.reads, [0, 0, 2]);
  }
});
check('non-dp-read-account-height-and-token-must-match-selected-frontier', async () => {
  for (const edit of [raw => { raw.accountHeight++; }, raw => { Object.values(raw.balanceInfoMap)[0].token.tokenStandard = 'wrong'; }]) {
    await rejectedQuote({ account(raw, rpc) { if (rpc.method === BALANCE) edit(raw); return raw; } });
  }
});
check('non-dp-read-genesis-and-chain-profile-are-independently-compared', async () => {
  for (const edit of [raw => { raw.list[0].previousHash = 'aa'.repeat(32); }, raw => { raw.list[0].chainIdentifier++; }]) {
    await rejectedQuote({ endpoint(raw, rpc) { if (rpc.method === HEIGHT) edit(raw); return raw; } });
  }
});
check('non-dp-read-endpoints-must-agree-on-full-resource-quote', async () => {
  await rejectedQuote({ endpoint(raw, rpc, index) { if (rpc.method === QUOTE && index === 1) raw.availablePlasma++; return raw; } });
});
check('non-dp-read-dp-momentum-is-refused-even-with-zero-difficulty', async () => {
  await rejectedQuote({ endpoint(raw, rpc) { if (rpc.method === FRONTIER) { raw.version = 2; raw.nextFusionPrice = 1000; } return raw; } });
});
check('non-dp-read-enforced-dp-spork-refuses-legacy-version-one', async () => {
  const f = fixture(); f.list[1].activated = true; f.list[1].enforcementHeight = 100;
  await assert.rejects(f.adapter.quote(f.c)); assert.equal(f.requests.some(r => r.method === QUOTE), false);
});
check('non-dp-read-incomplete-rule-list-is-not-absence-evidence', async () => {
  await rejectedQuote({ endpoint(raw, rpc) { if (rpc.method === SPORK) raw.count = 3; return raw; } });
});
check('non-dp-read-duplicate-rule-identifiers-are-refused', async () => {
  const f = fixture(); f.list[1].id = f.list[0].id; await assert.rejects(f.adapter.quote(f.c));
});
check('non-dp-read-full-eight-page-rule-list-is-collected-with-bounded-requests', async () => {
  const f = fixture(); f.list.splice(0);
  for (let i = 0; i < 1024; i++) f.list.push({ id: i.toString(16).padStart(64, '0'), name: 'Synthetic', description: '', activated: false, enforcementHeight: 0 });
  await f.adapter.quote(f.c); assert.deepEqual(f.reads, [12, 12, 3]);
  for (const index of [0, 1]) assert.deepEqual(f.requests.filter(r => r.index === index && r.method === SPORK).map(r => r.params),
    Array.from({ length: 8 }, (_, i) => [i, 128]));
});
check('non-dp-read-rule-page-count-drift-and-endpoint-order-drift-are-refused', async () => {
  const f = fixture({ endpoint(raw, rpc) { if (rpc.method === SPORK && rpc.params[0] === 1) raw.count--; return raw; } });
  for (let i = 0; i < 127; i++) f.list.push({ id: (i + 100).toString(16).padStart(64, '0'), name: 'Synthetic', description: '', activated: false, enforcementHeight: 0 });
  await assert.rejects(f.adapter.quote(f.c));
  await rejectedQuote({ endpoint(raw, rpc, index) { if (rpc.method === SPORK && index === 1) raw.list.reverse(); return raw; } });
});
check('non-dp-read-numeric-lexemes-cannot-round-or-coerce-rule-and-quote-fields', async () => {
  for (const spelling of ['-0', '0e0', '0.0', '9007199254740993', '"0"']) {
    await rejectedQuote({ endpoint(raw, rpc) { return rpc.method === QUOTE ? '{"availablePlasma":30000,"basePlasma":21000,"requiredDifficulty":' + spelling + '}' : raw; } });
  }
});
check('non-dp-read-existing-bounded-scanner-rejects-duplicate-json-keys', async () => {
  await rejectedQuote({ endpoint(raw, rpc) { return rpc.method === QUOTE
    ? '{"availablePlasma":30000,"basePlasma":21000,"requiredDifficulty":0,"requiredDifficulty":0}' : raw; } });
});
check('non-dp-read-missing-and-extra-native-result-fields-are-not-guessed', async () => {
  for (const method of [HEIGHT, SPORK, QUOTE]) await rejectedQuote({ endpoint(raw, rpc) { if (rpc.method === method) raw.unexpected = 1; return raw; } });
  await rejectedQuote({ endpoint(raw, rpc) { if (rpc.method === QUOTE) raw.requiredFusedPlasma = 21000; return raw; } });
});
check('non-dp-read-momentum-bracket-change-is-refused', async () => {
  let count = 0; await rejectedQuote({ endpoint(raw, rpc, index) { if (rpc.method === FRONTIER && index === 0 && ++count === 2) raw.hash = 'aa'.repeat(32); return raw; } });
});
check('non-dp-read-later-base-cost-change-never-requotes-or-assembles', async () => {
  const f = await planned({ endpoint(raw, rpc, _index, cycle) { if (rpc.method === QUOTE && cycle) raw.basePlasma++; return raw; } });
  await assert.rejects(f.adapter.assemble(f.c, f.plan)); assert.equal(f.plan.quote.selected.fusedPlasma, 21000); assert.equal(f.adapter.inspect().held, true);
});
check('non-dp-read-later-fusion-loss-or-work-demand-refuses-without-fallback', async () => {
  for (const edit of [raw => { raw.availablePlasma = 20999; }, raw => { raw.requiredDifficulty = 1; }]) {
    const f = await planned({ endpoint(raw, rpc, _index, cycle) { if (rpc.method === QUOTE && cycle) edit(raw); return raw; } });
    await assert.rejects(f.adapter.assemble(f.c, f.plan)); assert.equal(f.adapter.inspect().held, true);
  }
});
check('non-dp-read-later-momentum-window-rollback-and-same-height-fork-refuse', async () => {
  for (const height of [99, 100, 103]) {
    const f = await planned({ endpoint(raw, rpc, _index, cycle) { if (rpc.method === FRONTIER && cycle) { raw.height = height; raw.hash = 'aa'.repeat(32); } return raw; } });
    await assert.rejects(f.adapter.assemble(f.c, f.plan));
  }
});
check('non-dp-read-final-rule-activation-cannot-authorize-original-unsigned-block', async () => {
  const f = await planned({ endpoint(raw, rpc, _index, cycle) {
    if (rpc.method === SPORK && cycle === 2) { raw.list[1].activated = true; raw.list[1].enforcementHeight = 100; } return raw;
  } });
  const a = await f.adapter.assemble(f.c, f.plan); await assert.rejects(f.adapter.validateUnsigned(f.c, f.plan, a.accountBlock));
  assert.equal(a.accountBlock.signature, ''); assert.equal(f.adapter.inspect().held, true);
});
check('non-dp-read-input-policy-runtime-or-key-change-refuses-before-new-read', async () => {
  const f = await planned(), count = f.requests.length;
  for (const edit of [c => { c.policy.maxFusedPlasma++; }, c => { c.runtimeContextDigest = 'sha256:' + 'a'.repeat(64); }, c => { c.publicKey = Buffer.alloc(32, 8).toString('base64'); }]) {
    const c = copy(f.c); edit(c); await assert.rejects(f.adapter.assemble(c, f.plan)); assert.equal(f.requests.length, count);
  }
  assert.equal(f.adapter.inspect().held, false);
});
check('non-dp-read-copied-or-cross-owner-plan-is-powerless', async () => {
  const a = await planned(), b = await planned(), count = a.requests.length;
  await assert.rejects(a.adapter.assemble(a.c, F({ ...a.plan }))); await assert.rejects(a.adapter.assemble(a.c, b.plan));
  assert.equal(a.requests.length, count);
});
check('non-dp-read-modified-even-self-consistent-block-cannot-replace-original', async () => {
  const f = await planned(), a = await f.adapter.assemble(f.c, f.plan), n = f.requests.length;
  const changed = copy(a.accountBlock); changed.fusedPlasma++; changed.hash = computeZenonUnsignedUserSendHash(changed);
  await assert.rejects(f.adapter.validateUnsigned(f.c, f.plan, changed)); assert.equal(f.requests.length, n);
  assert.equal(f.adapter.inspect().held, false); assert.equal((await f.adapter.validateUnsigned(f.c, f.plan, a.accountBlock)).accountBlock, a.accountBlock);
});
check('non-dp-read-signed-or-malformed-block-cannot-enter-final-read', async () => {
  const f = await planned(), a = await f.adapter.assemble(f.c, f.plan), n = f.requests.length;
  const signed = copy(a.accountBlock); signed.signature = 'unexpected';
  await assert.rejects(f.adapter.validateUnsigned(f.c, f.plan, signed)); assert.equal(f.requests.length, n);
});
check('non-dp-read-port-rejection-permanently-holds-without-reset', async () => {
  const f = fixture({ accountPending() { const p = Promise.reject(Error('declared failure')); p.catch(() => {}); return p; } });
  await assert.rejects(f.adapter.quote(f.c)); await assert.rejects(f.adapter.quote(f.c));
  assert.equal(f.requests.length, 1); assert.equal(f.adapter.inspect().held, true);
});
check('non-dp-read-thenable-port-is-not-assimilated', async () => {
  let hooks = 0; const fake = F({ callRead: () => ({ get then() { hooks++; throw Error(); } }) });
  const f = fixture({ transports: F([fake, fake]) }); await assert.rejects(f.adapter.quote(f.c));
  assert.equal(hooks, 0); assert.equal(f.adapter.inspect().held, true);
});
check('non-dp-read-unsettled-port-has-no-fake-timeout-or-release', async () => {
  const gate = deferred(), entered = deferred();
  const f = fixture({ accountPending(response, count) { if (count > 1) return success(response); entered.resolve(response); return gate.promise; } });
  const pending = f.adapter.quote(f.c), response = await entered.promise;
  assert.equal(f.adapter.inspect().active, true); assert.equal(f.adapter.inspect().borrowedReadRelease, 'PARENT_OWNED_NOT_ESTABLISHED');
  gate.resolve(response); await pending; assert.equal(f.adapter.inspect().active, false);
});
check('non-dp-read-constructor-rejects-proxy-and-extra-capability-options', () => {
  const p = F({ callRead: () => success('null') }); let traps = 0;
  const options = F({ transports: F([p, p]), accountExchange: () => success('null'), requireCurrent() {} });
  assert.throws(() => create(new Proxy(options, { ownKeys() { traps++; } }))); assert.equal(traps, 0);
  assert.throws(() => create(F({ ...options, close() {} }))); assert.throws(() => create(options, options));
});

export const nonDpObservedUserSendReadDataCases = F([...checks]);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [];
  for (const c of checks) { try { await c.run(); cases.push({ id: c.id, status: 'PASS' }); }
    catch (e) { cases.push({ id: c.id, status: 'FAILURE', error: e.code ?? e.message }); break; } }
  const failed = cases.filter(c => c.status !== 'PASS').length;
  console.log(JSON.stringify({ qualification: 'G1_NON_DP_OBSERVED_USER_SEND_READ_DATA', passed: cases.length - failed, failed, cases,
    actualSharedAccountRpcSubjectPolicyAndHashCodecs: true, observationsDeclared: true, componentCooperativeTimers: false,
    nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, actualPrepare: 0, payouts: 0,
    nativeEntryBinding: 'NOT_IMPLEMENTED', chainAuthentication: 'NOT_ESTABLISHED', physicalRelease: 'NOT_ESTABLISHED', LinuxAcceptance: 'NOT_ESTABLISHED' }));
  if (failed || cases.length !== checks.length) process.exitCode = 1;
}
