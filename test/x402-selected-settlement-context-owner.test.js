import test from 'node:test';
import {
  equal as q, deepEqual as same, notEqual as ne, rejects, throws, ok,
} from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Independent owner/mapper entry; the SDK bridge is not read or imported.
// Bridge wiring and real official-SDK recovery remain separately NOT_RUN.
// Scenario and helper bodies match the original source-pinned component unit.
const selector = process.argv[2] ?? 'all';
if (process.argv.length > 3
  || !['all','1','2','3','4','5','6','7','8','9','10'].includes(selector)
) throw new Error('INVALID_SCENARIO_SELECTOR');

const specs = [
  ['../src/x402-selected-settlement-context.js', 16818, 'afb6e16603023dd58d6a71cff5790a802dcfa4b98bc9d380b51ccc3d58e10991'],
];
const pins = Object.freeze(specs.map(([path, bytes, sha]) => {
  const url = new URL(path, import.meta.url);
  const raw = readFileSync(url);
  q(raw.length, bytes);
  q(createHash('sha256').update(raw).digest('hex'), sha);
  const text = raw.toString('utf8');
  q(/[^\x00-\x7f]/.test(text), false);
  q(Buffer.byteLength(text, 'utf8'), bytes);
  ok(text.endsWith('\n'));
  return Object.freeze({ url: url.href, text });
}));
const { createSelectedSettlementContextOwner: createOwner, normalizeSelectedSettlementCallbackResult: norm } = await import(pins[0].url);
const NativePromise = Promise;
const THEN = NativePromise.prototype.then;
const APPLY = Reflect.apply;
const ORIGINAL = Object.freeze({
  payloadJson: '{"opaque":"Bearer declared-payload"}\n',
  requirementsJson: '{"requirement":"declared"}',
  challengeJson: '{"challenge":"declared"}',
  paymentHash: 'a'.repeat(64),
  network: 'zenon:declared',
});
const rejected = error => error instanceof TypeError
  && error.name === 'TypeError'
  && error.message === 'Selected settlement context operation rejected'
  && error.code === 'selected_settlement_context_rejected'
  && error.stack === 'TypeError: Selected settlement context operation rejected';

function packet(disposition, publicationStatus, binding=ORIGINAL) {
  const reason = disposition === 'PENDING' ? 'settlement_pending'
    : disposition === 'UNKNOWN' ? 'settlement_outcome_unknown' : 'settlement_failed';
  const response = disposition === 'SUCCEEDED' ? {
    success: true, payer: 'declared-payer',
    transaction: binding.paymentHash, network: binding.network,
  } : {
    success: false, transaction: binding.paymentHash, network: binding.network,
    errorReason: reason, errorMessage: reason,
  };
  return { disposition, publicationStatus, responseJson: JSON.stringify(response) };
}
function changedResponse(value, change) {
  const response = JSON.parse(value.responseJson);
  change(response);
  return { ...value, responseJson: JSON.stringify(response) };
}
function config(original={ ...ORIGINAL }) {
  return {
    original,
    settleFirst: binding => packet('SUCCEEDED', 'NOT_ESTABLISHED', binding),
    reconcilePending: null,
    maxPendingReconciliations: 0,
  };
}
function fixture(t, options={}) {
  const original = options.original ?? { ...ORIGINAL };
  const gates = [], sinks = [];
  const counts = { first: 0, observer: 0 };
  const argumentsSeen = [];
  let firstAction = binding => packet('SUCCEEDED', 'NOT_ESTABLISHED', binding);
  let observerAction = binding => packet('SUCCEEDED', 'ACKNOWLEDGED', binding);
  function settleFirst(...args) {
    q(this, undefined);
    q(args.length, 1);
    ok(Object.isFrozen(args[0]));
    counts.first++;
    argumentsSeen.push(args[0]);
    return firstAction(args[0]);
  }
  function reconcilePending(...args) {
    q(this, undefined);
    q(args.length, 1);
    ok(Object.isFrozen(args[0]));
    counts.observer++;
    argumentsSeen.push(args[0]);
    return observerAction(args[0]);
  }
  const owner = createOwner({
    original,
    settleFirst,
    reconcilePending: options.observer === false ? null : reconcilePending,
    maxPendingReconciliations: options.budget ?? 2,
  });
  function track(promise) {
    sinks.push(APPLY(THEN, promise, [() => undefined, () => undefined]));
    return promise;
  }
  function gate() {
    let resolve, reject;
    const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
    const result = Object.freeze({ promise, resolve, reject });
    gates.push(result);
    track(promise);
    return result;
  }
  t.after(async () => {
    for (const value of gates) value.resolve(undefined);
    await NativePromise.all(sinks);
  });
  return {
    owner, original, counts, argumentsSeen, gate, track,
    call(...args) { return track(owner.attempt(...args)); },
    setFirst(action) { firstAction = action; },
    setObserver(action) { observerAction = action; },
  };
}
const decoded = text => JSON.parse(text);
const snapshot = f => f.owner.getSnapshot();

const scenarios = [
  ['first success retains exact bindings and permanently consumes first authority', async t => {
    const f = fixture(t), before = JSON.stringify(f.original);
    f.setFirst(binding => {
      same(binding, ORIGINAL);
      ne(binding, f.original);
      q(snapshot(f).firstAuthorityConsumed, true);
      q(snapshot(f).state, 'FIRST_IN_FLIGHT');
      q(snapshot(f).inFlight, true);
      throws(() => { binding.payloadJson = 'changed'; }, TypeError);
      return packet('SUCCEEDED', 'NOT_ESTABLISHED', binding);
    });
    const response = decoded(await f.call({ ...f.original }));
    same(response, {
      success: true, payer: 'declared-payer',
      transaction: ORIGINAL.paymentHash, network: ORIGINAL.network,
    });
    same(f.counts, { first: 1, observer: 0 });
    q(snapshot(f).state, 'SUCCEEDED');
    q(snapshot(f).firstAuthorityConsumed, true);
    q(snapshot(f).totalAttempts, 1);
    q(snapshot(f).publication.status, 'NOT_ESTABLISHED');
    q(snapshot(f).publication.acknowledgementDeclared, false);
    await rejects(f.call({ ...f.original }), rejected);
    same(f.counts, { first: 1, observer: 0 });
    q(JSON.stringify(f.original), before);
  }],
  ['pending reaches one success through only the explicit original-context observer', async t => {
    const f = fixture(t);
    f.setFirst(binding => packet('PENDING', 'NOT_ESTABLISHED', binding));
    q(decoded(await f.call(f.original)).success, false);
    q(snapshot(f).state, 'PENDING');
    f.setFirst(() => { throw new Error('UNREACHED_SECOND_FIRST'); });
    f.setObserver(binding => {
      same(binding, ORIGINAL);
      ne(binding, f.argumentsSeen[0]);
      return packet('SUCCEEDED', 'ACKNOWLEDGED', binding);
    });
    q(decoded(await f.call({ ...f.original })).success, true);
    same(f.counts, { first: 1, observer: 1 });
    q(snapshot(f).state, 'SUCCEEDED');
    q(snapshot(f).pendingReconciliations, 1);
    q(snapshot(f).totalAttempts, 2);
    q(snapshot(f).publication.status, 'ACKNOWLEDGED');
    q(snapshot(f).publication.acknowledgementDeclared, true);
    await rejects(f.call(f.original), rejected);
    same(f.counts, { first: 1, observer: 1 });
  }],
  ['pending budgets and missing observers retain pending without another first call', async t => {
    const f = fixture(t, { budget: 2 });
    f.setFirst(binding => packet('PENDING', 'NOT_ESTABLISHED', binding));
    f.setObserver(binding => packet('PENDING', 'NOT_ESTABLISHED', binding));
    for (let index = 0; index < 3; index++) {
      q(decoded(await f.call(f.original)).success, false);
      q(snapshot(f).state, 'PENDING');
    }
    const before = snapshot(f);
    await rejects(f.call(f.original), rejected);
    same(snapshot(f), before);
    same(f.counts, { first: 1, observer: 2 });
    q(before.totalAttempts, 3);
    q(before.firstAuthorityConsumed, true);
    const missing = fixture(t, { observer: false, budget: 16 });
    missing.setFirst(binding => packet('PENDING', 'UNKNOWN', binding));
    q(decoded(await missing.call(missing.original)).success, false);
    const held = snapshot(missing);
    await rejects(missing.call(missing.original), rejected);
    same(snapshot(missing), held);
    q(held.state, 'PENDING');
    q(held.observerConfigured, false);
    q(held.publication.uncertaintyRetained, true);
    same(missing.counts, { first: 1, observer: 0 });
    const zero = fixture(t, { budget: 0 });
    zero.setFirst(binding => packet('PENDING', 'NOT_ESTABLISHED', binding));
    await zero.call(zero.original);
    await rejects(zero.call(zero.original), rejected);
    q(snapshot(zero).state, 'PENDING');
    same(zero.counts, { first: 1, observer: 0 });
  }],
  ['changed missing and foreign bindings cannot reach either callback', async t => {
    const f = fixture(t);
    const variants = [];
    for (const field of Object.keys(f.original)) {
      variants.push({ ...f.original, [field]: f.original[field] + ' ' });
      const missing = { ...f.original };
      delete missing[field];
      variants.push(missing);
    }
    variants.push(null, [], {}, { ...f.original, extra: true });
    variants.push({ ...f.original, paymentHash: 'b'.repeat(64) });
    variants.push({ ...f.original, network: 'zenon:foreign' });
    for (const input of variants) {
      await rejects(f.call(input), rejected);
      q(snapshot(f).firstAuthorityConsumed, false);
      q(snapshot(f).totalAttempts, 0);
    }
    same(f.counts, { first: 0, observer: 0 });
    f.setFirst(binding => packet('PENDING', 'NOT_ESTABLISHED', binding));
    await f.call(f.original);
    const held = snapshot(f);
    for (const input of variants) {
      await rejects(f.call(input), rejected);
      same(snapshot(f), held);
    }
    same(f.counts, { first: 1, observer: 0 });
    q(decoded(await f.call({ ...f.original })).success, true);
    same(f.counts, { first: 1, observer: 1 });
  }],
  ['concurrent calls and reentrancy never coalesce another success capability', async t => {
    const first = fixture(t), gate = first.gate();
    first.setFirst(() => gate.promise);
    const active = first.call(first.original);
    await rejects(first.call(first.original), rejected);
    q(snapshot(first).state, 'FIRST_IN_FLIGHT');
    q(snapshot(first).inFlight, true);
    q(snapshot(first).totalAttempts, 1);
    gate.resolve(packet('SUCCEEDED', 'ACKNOWLEDGED', first.original));
    q(decoded(await active).success, true);
    await rejects(first.call(first.original), rejected);
    same(first.counts, { first: 1, observer: 0 });

    const second = fixture(t), observerGate = second.gate();
    let nestedFirst, nestedObserver;
    second.setFirst(binding => {
      nestedFirst = second.call(binding);
      return packet('PENDING', 'NOT_ESTABLISHED', binding);
    });
    q(decoded(await second.call(second.original)).success, false);
    await rejects(nestedFirst, rejected);
    q(snapshot(second).state, 'PENDING');
    second.setObserver(binding => {
      nestedObserver = second.call(binding);
      return observerGate.promise;
    });
    const observing = second.call(second.original);
    await rejects(nestedObserver, rejected);
    await rejects(second.call(second.original), rejected);
    q(snapshot(second).state, 'RECONCILING');
    q(snapshot(second).inFlight, true);
    q(snapshot(second).totalAttempts, 2);
    observerGate.resolve(packet('SUCCEEDED', 'ACKNOWLEDGED', second.original));
    q(decoded(await observing).success, true);
    await rejects(second.call(second.original), rejected);
    same(second.counts, { first: 1, observer: 1 });
  }],
  ['callback failures unsafe packets and explicit unknown outcomes remain held', async t => {
    const secret = 'PRIVATE_CALLBACK_CONTENT_MUST_NOT_ESCAPE';
    for (const observing of [false, true]) {
      for (const kind of ['throw', 'reject', 'undefined', 'bad-json', 'extra', 'unknown']) {
        const f = fixture(t);
        if (observing) {
          f.setFirst(binding => packet('PENDING', 'NOT_ESTABLISHED', binding));
          await f.call(f.original);
        }
        const action = binding => {
          if (kind === 'throw') throw new Error(secret);
          if (kind === 'reject') {
            const gate = f.gate();
            gate.reject(new Error(secret));
            return gate.promise;
          }
          if (kind === 'undefined') return undefined;
          if (kind === 'bad-json') return {
            disposition: 'PENDING', publicationStatus: 'UNKNOWN', responseJson: '{',
          };
          if (kind === 'extra') return {
            ...packet('SUCCEEDED', 'ACKNOWLEDGED', binding), extra: secret,
          };
          return packet('UNKNOWN', 'UNKNOWN', binding);
        };
        if (observing) f.setObserver(action); else f.setFirst(action);
        if (kind === 'unknown') q(decoded(await f.call(f.original)).success, false);
        else await rejects(f.call(f.original), rejected);
        const held = snapshot(f);
        q(held.state, 'UNKNOWN');
        q(held.inFlight, false);
        q(held.firstAuthorityConsumed, true);
        q(held.publication.uncertaintyRetained, true);
        q(JSON.stringify(held).includes(secret), false);
        await rejects(f.call(f.original), rejected);
        same(snapshot(f), held);
        same(f.counts, { first: 1, observer: observing ? 1 : 0 });
      }
    }
  }],
  ['publication declarations preserve uncertainty without inferred acknowledgements', async t => {
    for (const status of ['NOT_ESTABLISHED', 'UNKNOWN', 'ACKNOWLEDGED']) {
      const f = fixture(t);
      f.setFirst(binding => packet('PENDING', status, binding));
      q(decoded(await f.call(f.original)).success, false);
      q(snapshot(f).publication.status, status);
      q(snapshot(f).publication.acknowledgementDeclared, status === 'ACKNOWLEDGED');
      q(snapshot(f).publication.uncertaintyRetained, status === 'UNKNOWN');
      f.setObserver(binding => packet('SUCCEEDED', 'ACKNOWLEDGED', binding));
      q(decoded(await f.call(f.original)).success, true);
      q(snapshot(f).publication.status, 'ACKNOWLEDGED');
      q(snapshot(f).publication.uncertaintyRetained, status === 'UNKNOWN');
      if (status === 'UNKNOWN') {
        q(snapshot(f).publication.firstUncertainty, 'DECLARED_PUBLICATION_UNKNOWN');
      }
    }
    const noAck = fixture(t);
    q(decoded(await noAck.call(noAck.original)).success, true);
    q(snapshot(noAck).publication.status, 'NOT_ESTABLISHED');
    q(snapshot(noAck).publication.acknowledgementDeclared, false);
    const declaredUnknown = fixture(t);
    declaredUnknown.setFirst(binding => packet('UNKNOWN', 'ACKNOWLEDGED', binding));
    q(decoded(await declaredUnknown.call(declaredUnknown.original)).success, false);
    q(snapshot(declaredUnknown).state, 'UNKNOWN');
    q(snapshot(declaredUnknown).publication.status, 'ACKNOWLEDGED');
    q(snapshot(declaredUnknown).publication.uncertaintyRetained, true);
    const invalidSuccess = fixture(t);
    invalidSuccess.setFirst(binding => packet('SUCCEEDED', 'UNKNOWN', binding));
    await rejects(invalidSuccess.call(invalidSuccess.original), rejected);
    q(snapshot(invalidSuccess).state, 'UNKNOWN');
    const pendingSuccess = fixture(t);
    pendingSuccess.setFirst(binding => changedResponse(
      packet('PENDING', 'NOT_ESTABLISHED', binding), response => { response.success = true; }));
    await rejects(pendingSuccess.call(pendingSuccess.original), rejected);
    for (const disposition of ['PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN']) {
      for (const field of ['transaction', 'network']) {
        const f = fixture(t);
        f.setFirst(binding => changedResponse(
          packet(disposition, 'NOT_ESTABLISHED', binding), response => {
            response[field] = field === 'transaction' ? 'b'.repeat(64) : 'zenon:foreign';
          }));
        await rejects(f.call(f.original), rejected);
        q(snapshot(f).state, 'UNKNOWN');
      }
    }
    const failed = fixture(t);
    failed.setFirst(binding => changedResponse(
      packet('FAILED', 'NOT_ESTABLISHED', binding), response => { response.transaction = ''; }));
    q(decoded(await failed.call(failed.original)).success, false);
    q(snapshot(failed).state, 'FAILED');
    await rejects(failed.call(failed.original), rejected);
    same(failed.counts, { first: 1, observer: 0 });

    const ACK='SUBMISSION_ACKNOWLEDGED', UNK='SUBMISSION_OUTCOME_UNKNOWN';
    const paid=decoded(packet('SUCCEEDED','NOT_ESTABLISHED').responseJson);
    const waiting={...paid,success:false,errorReason:'settlement_pending'};
    const mapped=norm(waiting,ORIGINAL), flow=fixture(t);
    same(mapped,packet('PENDING','NOT_ESTABLISHED'));
    flow.setFirst(b=>norm(waiting,b));
    flow.setObserver(b=>norm({...paid,state:ACK},b));
    q(decoded(await flow.call(flow.original)).success,false);
    q(snapshot(flow).state,'PENDING');
    q(snapshot(flow).publication.status,'NOT_ESTABLISHED');
    q(decoded(await flow.call(flow.original)).success,true);
    await rejects(flow.call(flow.original),rejected);
    same(flow.counts,{first:1,observer:1});
    q(snapshot(flow).publication.status,'ACKNOWLEDGED');
    for(const state of ['PENDING','SETTLEMENT_PENDING']) {
      same(norm({...waiting,state},ORIGINAL),mapped);
    }
    same(norm({...waiting,publicationStatus:undefined},ORIGINAL),mapped);
    for(const [raw,d,p] of [
      [{...waiting,state:ACK},'PENDING','ACKNOWLEDGED'],
      [{success:false,state:UNK},'UNKNOWN','UNKNOWN'],
      [{success:false,state:ACK,disposition:'UNKNOWN'},'UNKNOWN','ACKNOWLEDGED'],
      [{success:false,errorReason:'payment_reconciliation_terminal'},'UNKNOWN','UNKNOWN'],
    ]) {
      const value=norm(raw,ORIGINAL);
      same([value.disposition,value.publicationStatus],[d,p]);
    }
    same(norm(paid,ORIGINAL),packet('SUCCEEDED','NOT_ESTABLISHED'));
    const legacy=norm({success:false,errorReason:'invalid_signature'},ORIGINAL);
    q(legacy.disposition,'FAILED');
    q(legacy.publicationStatus,'NOT_ESTABLISHED');
    q(decoded(legacy.responseJson).transaction,'');
    for(const bad of [
      {...waiting,publicationStatus:null},{...waiting,disposition:null},
      {...waiting,disposition:'FAILED'},
      {success:false,state:UNK,publicationStatus:'ACKNOWLEDGED'},
      {success:false,state:ACK,publicationStatus:'UNKNOWN'},
      {...waiting,state:UNK},{success:false,state:'UNSUPPORTED'},
    ]) throws(()=>norm(bad,ORIGINAL),rejected);
    for(const raw of [paid,waiting]) {
      const missing={...raw}; delete missing.network;
      throws(()=>norm(missing,ORIGINAL),rejected);
    }
    for(const raw of [paid,waiting]) for(const field of ['transaction','network']) {
      throws(()=>norm({...raw,[field]:field==='transaction'
        ? 'b'.repeat(64):'zenon:foreign'},ORIGINAL),rejected);
    }
  }],
  ['hostile config input and result surfaces execute no traps or coercion', async t => {
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_TRAP'); };
    const traps = {
      get: trap, ownKeys: trap, getPrototypeOf: trap,
      getOwnPropertyDescriptor: trap, apply: trap,
    };
    const accessor = (value, field) => {
      const result = { ...value };
      Object.defineProperty(result, field, { enumerable: true, get: trap });
      return result;
    };
    throws(() => createOwner(new Proxy(config(), traps)), rejected);
    throws(() => createOwner(accessor(config(), 'original')), rejected);
    throws(() => createOwner({ ...config(), original: new Proxy({ ...ORIGINAL }, traps) }), rejected);
    throws(() => createOwner({
      ...config(), original: accessor({ ...ORIGINAL }, 'payloadJson'),
    }), rejected);
    throws(() => createOwner({
      ...config(), settleFirst: new Proxy(() => {}, traps),
    }), rejected);
    throws(() => createOwner({
      ...config(), reconcilePending: new Proxy(() => {}, traps),
    }), rejected);
    const sameCallback = () => {};
    throws(() => createOwner({
      ...config(), settleFirst: sameCallback, reconcilePending: sameCallback,
    }), rejected);
    throws(()=>norm(new Proxy({success:false},traps),ORIGINAL),rejected);
    throws(()=>norm(accessor({success:false},'success'),ORIGINAL),rejected);
    throws(()=>norm({success:false},new Proxy({...ORIGINAL},traps)),rejected);
    throws(()=>norm({success:false}),rejected);
    throws(()=>norm({success:false},ORIGINAL,undefined),rejected);
    const f = fixture(t);
    for (const value of [
      new Proxy({ ...f.original }, traps), accessor(f.original, 'challengeJson'),
      { ...f.original, [Symbol('extra')]: 1 },
      { ...f.original, payloadJson: new String(f.original.payloadJson) },
      { ...f.original, payloadJson: { [Symbol.toPrimitive]: trap, toString: trap } },
    ]) await rejects(f.call(value), rejected);
    q(snapshot(f).firstAuthorityConsumed, false);

    const basePacket = packet('SUCCEEDED', 'ACKNOWLEDGED');
    const thenable = {};
    Object.defineProperty(thenable, 'then', { get: trap, enumerable: true });
    const fake = Object.create(NativePromise.prototype);
    Object.defineProperty(fake, 'then', { get: trap });
    const badResults = [
      new Proxy(basePacket, traps), accessor(basePacket, 'responseJson'),
      accessor(basePacket, 'disposition'), accessor(basePacket, 'publicationStatus'),
      { ...basePacket, [Symbol('extra')]: 1 }, thenable, fake,
      { ...basePacket, responseJson: new String(basePacket.responseJson) },
      { ...basePacket, responseJson: { [Symbol.toPrimitive]: trap } },
    ];
    for (const value of badResults) {
      const bad = fixture(t);
      bad.setFirst(() => value);
      await rejects(bad.call(bad.original), rejected);
      q(snapshot(bad).state, 'UNKNOWN');
    }
    const proxiedPromise = fixture(t), target = proxiedPromise.gate();
    proxiedPromise.setFirst(() => new Proxy(target.promise, traps));
    await rejects(proxiedPromise.call(proxiedPromise.original), rejected);
    const constructorGetter = fixture(t), overridden = constructorGetter.gate();
    Object.defineProperty(overridden.promise, 'constructor', { get: trap });
    constructorGetter.setFirst(() => overridden.promise);
    await rejects(constructorGetter.call(constructorGetter.original), rejected);
    const real = fixture(t), native = real.gate();
    Object.defineProperty(native.promise, 'then', { get: trap });
    real.setFirst(() => native.promise);
    const result = real.call(real.original);
    native.resolve(packet('SUCCEEDED', 'NOT_ESTABLISHED', real.original));
    q(decoded(await result).success, true);
    q(touches, 0);
  }],
  ['arity size and count bounds keep snapshots fresh frozen and credential-free', async t => {
    throws(() => createOwner(), rejected);
    throws(() => createOwner(config(), undefined), rejected);
    for (const value of [-0, -1, NaN, Infinity, 17, 1.5, 1n, new Number(1)]) {
      throws(() => createOwner({ ...config(), maxPendingReconciliations: value }), rejected);
    }
    for (const field of Object.keys(config())) {
      const missing = config();
      delete missing[field];
      throws(() => createOwner(missing), rejected);
    }
    throws(() => createOwner({ ...config(), extra: true }), rejected);
    for (const [field, value] of [
      ['payloadJson', 'x'.repeat(131073)],
      ['requirementsJson', '\u00e9'.repeat(65537)],
      ['challengeJson', ''],
      ['paymentHash', 'A'.repeat(64)],
      ['paymentHash', 'a'.repeat(65)],
      ['network', 'x'.repeat(257)],
      ['network', new String('zenon:declared')],
    ]) throws(() => createOwner({
      ...config(), original: { ...ORIGINAL, [field]: value },
    }), rejected);

    const f = fixture(t);
    await rejects(f.call(), rejected);
    await rejects(f.call(f.original, undefined), rejected);
    throws(() => f.owner.getSnapshot(undefined), rejected);
    q(snapshot(f).firstAuthorityConsumed, false);
    same(Object.keys(f.owner), ['attempt', 'getSnapshot']);
    ok(Object.isFrozen(f.owner));
    for (const field of ['reset', 'restore', 'resume', 'close', 'resend']) {
      q(Object.hasOwn(f.owner, field), false);
    }
    const a = snapshot(f), b = snapshot(f);
    same(a, b);
    ne(a, b);
    ne(a.publication, b.publication);
    ne(a.bindings, b.bindings);
    for (const value of [a, a.publication, a.bindings]) {
      ok(Object.isFrozen(value));
      q(Object.getPrototypeOf(value), Object.prototype);
    }
    throws(() => { a.state = 'NEW'; }, TypeError);
    const diagnostic = JSON.stringify(a);
    for (const text of [
      ORIGINAL.payloadJson, ORIGINAL.requirementsJson, ORIGINAL.challengeJson,
      ORIGINAL.paymentHash, ORIGINAL.network, 'Bearer',
    ]) q(diagnostic.includes(text), false);
    q(a.bindings.custody, 'NOT_ESTABLISHED');
    q(a.persistence, 'MEMORY_ONLY');
    q(a.recoveryAuthority, 'NONE');

    const saved = { ...f.original };
    f.original.payloadJson = 'caller changed after construction';
    q(decoded(await f.call(saved)).success, true);
    q(f.argumentsSeen[0].payloadJson, saved.payloadJson);
    const large = fixture(t, { original: { ...ORIGINAL, payloadJson: 'x'.repeat(131072) } });
    q(decoded(await large.call(large.original)).success, true);
    q(snapshot(large).bindings.payloadCharacters, 131072);
    for (const responseJson of ['x'.repeat(16385), '\u00e9'.repeat(8193)]) {
      const bad = fixture(t);
      bad.setFirst(() => ({
        disposition: 'PENDING', publicationStatus: 'UNKNOWN', responseJson,
      }));
      await rejects(bad.call(bad.original), rejected);
      q(snapshot(bad).state, 'UNKNOWN');
    }
  }],
  ['independent owners preserve local one-positive limits without restart authority', async t => {
    const a = fixture(t);
    const b = fixture(t, { original: {
      ...ORIGINAL, payloadJson: '{"opaque":"independent"}',
      paymentHash: 'b'.repeat(64), network: 'zenon:other-declared',
    } });
    a.setFirst(binding => packet('PENDING', 'NOT_ESTABLISHED', binding));
    b.setFirst(binding => packet('PENDING', 'UNKNOWN', binding));
    q(decoded(await a.call(a.original)).success, false);
    q(decoded(await b.call(b.original)).success, false);
    const heldA = snapshot(a), heldB = snapshot(b);
    await rejects(a.call(b.original), rejected);
    await rejects(b.call(a.original), rejected);
    same(snapshot(a), heldA);
    same(snapshot(b), heldB);
    q(decoded(await a.call(a.original)).success, true);
    q(snapshot(b).state, 'PENDING');
    same(b.counts, { first: 1, observer: 0 });
    b.setObserver(binding => packet('FAILED', 'ACKNOWLEDGED', binding));
    q(decoded(await b.call(b.original)).success, false);
    q(snapshot(a).state, 'SUCCEEDED');
    q(snapshot(b).state, 'FAILED');
    await rejects(a.call(a.original), rejected);
    await rejects(b.call(b.original), rejected);
    same(a.counts, { first: 1, observer: 1 });
    same(b.counts, { first: 1, observer: 1 });
    for (const f of [a, b]) {
      const value = snapshot(f);
      q(value.firstAuthorityConsumed, true);
      q(value.qualification, 'DECLARED_CALLBACK_DATA_ONLY');
      q(value.persistence, 'MEMORY_ONLY');
      q(value.recoveryAuthority, 'NONE');
      q(value.bindings.custody, 'NOT_ESTABLISHED');
    }
  }],
];

q(scenarios.length, 10);
for (let index = 0; index < scenarios.length; index++) {
  if (selector === 'all' || selector === String(index + 1)) {
    const [name, run] = scenarios[index];
    test(name, { timeout: 5000 }, run);
  }
}
