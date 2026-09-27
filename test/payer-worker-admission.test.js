import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  OfflinePayerWorkerAdmission,
  PAYER_WORKER_ADMISSION_ERROR_CODES as CODES,
  PAYER_WORKER_LANES as LANES,
  PAYER_WORKER_OPERATION_KINDS as KINDS,
  PayerWorkerAdmissionError,
} from '../src/zenon/payer-worker-admission.js';

const TICKET_FIELDS = [
  'version', 'lane', 'kind', 'payer', 'operationId', 'workerId', 'sequence',
];

function rejectsWith(code) {
  return error => {
    assert.equal(error instanceof PayerWorkerAdmissionError, true);
    assert.equal(error.name, 'PayerWorkerAdmissionError');
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(Object.hasOwn(error, 'cause'), false);
    return true;
  };
}

function buyerRegistry(workerIds = ['worker-1'], maxAdmissions = 64) {
  return new OfflinePayerWorkerAdmission({
    lane: LANES.BUYER,
    workerIds,
    maxAdmissions,
  });
}

function buyerRequest(payer, operationId) {
  return { payer, operationId, kind: KINDS.BUYER_PREPARE };
}

test('two distinct payers hold concurrent tickets on distinct ordered workers', () => {
  const admission = new OfflinePayerWorkerAdmission({
    lane: LANES.FACILITATOR,
    workerIds: ['worker-a', 'worker-b'],
  });

  const first = admission.admit({
    payer: 'payer-a',
    operationId: 'operation-a',
    kind: KINDS.FACILITATOR_VERIFY,
  });
  const second = admission.admit({
    payer: 'payer-b',
    operationId: 'operation-b',
    kind: KINDS.FACILITATOR_SETTLE,
  });

  assert.deepEqual(first, {
    version: 1,
    lane: LANES.FACILITATOR,
    kind: KINDS.FACILITATOR_VERIFY,
    payer: 'payer-a',
    operationId: 'operation-a',
    workerId: 'worker-a',
    sequence: 1,
  });
  assert.equal(second.workerId, 'worker-b');
  assert.equal(second.sequence, 1);
  assert.equal(Object.getPrototypeOf(first), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(first), TICKET_FIELDS);
  assert.equal(Object.isFrozen(first), true);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(first))) {
    assert.equal(Object.hasOwn(descriptor, 'value'), true);
    assert.equal(Object.hasOwn(descriptor, 'get'), false);
  }

  assert.equal(admission.markDispatched(first), undefined);
  assert.equal(admission.markDispatched(second), undefined);
  assert.equal(admission.complete(first), undefined);
  assert.equal(admission.complete(second), undefined);
});

test('one payer reuses only its permanent worker and receives increasing sequences', () => {
  const admission = buyerRegistry(['worker-a', 'worker-b']);
  const first = admission.admit(buyerRequest('payer-a', 'operation-1'));
  admission.releaseUndispatched(first);

  const second = admission.admit(buyerRequest('payer-a', 'operation-2'));
  assert.equal(second.workerId, first.workerId);
  assert.equal(second.sequence, 2);
  admission.markDispatched(second);
  admission.complete(second);

  const third = admission.admit(buyerRequest('payer-b', 'operation-3'));
  assert.equal(third.workerId, 'worker-b');
  assert.equal(third.sequence, 1);
});

test('configuration and request shapes reject proxies, accessors, symbols, extras and coercion', () => {
  let trapCalls = 0;
  const proxiedConfiguration = new Proxy({
    lane: LANES.BUYER,
    workerIds: ['worker-a'],
  }, {
    get() {
      trapCalls += 1;
      return undefined;
    },
  });
  assert.throws(
    () => new OfflinePayerWorkerAdmission(proxiedConfiguration),
    rejectsWith(CODES.INVALID_CONFIGURATION),
  );
  assert.equal(trapCalls, 0);

  let getterCalls = 0;
  const accessorConfiguration = { workerIds: ['worker-a'] };
  Object.defineProperty(accessorConfiguration, 'lane', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return LANES.BUYER;
    },
  });
  assert.throws(
    () => new OfflinePayerWorkerAdmission(accessorConfiguration),
    rejectsWith(CODES.INVALID_CONFIGURATION),
  );
  assert.equal(getterCalls, 0);

  const withSymbol = { lane: LANES.BUYER, workerIds: ['worker-a'] };
  withSymbol[Symbol('extra')] = true;
  assert.throws(
    () => new OfflinePayerWorkerAdmission(withSymbol),
    rejectsWith(CODES.INVALID_CONFIGURATION),
  );
  assert.throws(
    () => buyerRegistry(['worker-a', 'worker-a']),
    rejectsWith(CODES.INVALID_CONFIGURATION),
  );
  assert.throws(
    () => buyerRegistry(new Array(1)),
    rejectsWith(CODES.INVALID_CONFIGURATION),
  );
  const arrayWithExtra = ['worker-a'];
  arrayWithExtra.extra = true;
  assert.throws(
    () => buyerRegistry(arrayWithExtra),
    rejectsWith(CODES.INVALID_CONFIGURATION),
  );

  const admission = buyerRegistry(['worker-a'], 1);
  let coercions = 0;
  const coerciblePayer = {
    toString() {
      coercions += 1;
      return 'payer-a';
    },
  };
  assert.throws(
    () => admission.admit(buyerRequest(coerciblePayer, 'operation-a')),
    rejectsWith(CODES.INVALID_REQUEST),
  );
  assert.equal(coercions, 0);

  const accessorRequest = {
    operationId: 'operation-a',
    kind: KINDS.BUYER_PREPARE,
  };
  Object.defineProperty(accessorRequest, 'payer', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'payer-a';
    },
  });
  assert.throws(
    () => admission.admit(accessorRequest),
    rejectsWith(CODES.INVALID_REQUEST),
  );
  assert.equal(getterCalls, 0);
  assert.throws(
    () => admission.admit({ ...buyerRequest('payer-a', 'operation-a'), extra: true }),
    rejectsWith(CODES.INVALID_REQUEST),
  );

  const ticket = admission.admit(buyerRequest('payer-a', 'operation-a'));
  assert.equal(ticket.sequence, 1);
});

test('lane-specific operation kinds fail without consuming admission budget', () => {
  const buyer = buyerRegistry(['buyer-worker'], 1);
  assert.throws(() => buyer.admit({
    payer: 'payer-a',
    operationId: 'wrong-lane',
    kind: KINDS.FACILITATOR_VERIFY,
  }), rejectsWith(CODES.INVALID_REQUEST));
  assert.equal(buyer.admit(buyerRequest('payer-a', 'buyer-operation')).sequence, 1);

  const facilitator = new OfflinePayerWorkerAdmission({
    lane: LANES.FACILITATOR,
    workerIds: ['facilitator-worker'],
    maxAdmissions: 1,
  });
  assert.throws(
    () => facilitator.admit(buyerRequest('payer-a', 'wrong-role')),
    rejectsWith(CODES.INVALID_REQUEST),
  );
  const ticket = facilitator.admit({
    payer: 'payer-a',
    operationId: 'reconcile-operation',
    kind: KINDS.FACILITATOR_RECONCILE_CANDIDATE,
  });
  assert.equal(ticket.payer, 'payer-a');
});

test('same-payer overlap is busy and does not consume or reserve the next operation', () => {
  const admission = buyerRegistry(['worker-a'], 2);
  const first = admission.admit(buyerRequest('payer-a', 'operation-1'));
  assert.throws(
    () => admission.admit(buyerRequest('payer-a', 'operation-2')),
    rejectsWith(CODES.PAYER_BUSY),
  );
  admission.releaseUndispatched(first);
  const second = admission.admit(buyerRequest('payer-a', 'operation-2'));
  assert.equal(second.sequence, 2);
});

test('permanent binding exhausts capacity and successful admissions exhaust the budget', () => {
  const capacity = buyerRegistry(['worker-a'], 4);
  const first = capacity.admit(buyerRequest('payer-a', 'operation-1'));
  capacity.releaseUndispatched(first);
  assert.throws(
    () => capacity.admit(buyerRequest('payer-b', 'operation-2')),
    rejectsWith(CODES.CAPACITY_EXHAUSTED),
  );
  const reuse = capacity.admit(buyerRequest('payer-a', 'operation-3'));
  assert.equal(reuse.workerId, 'worker-a');

  const budget = buyerRegistry(['worker-a', 'worker-b'], 1);
  const admitted = budget.admit(buyerRequest('payer-a', 'operation-a'));
  budget.releaseUndispatched(admitted);
  assert.throws(
    () => budget.admit(buyerRequest('payer-b', 'operation-b')),
    rejectsWith(CODES.ADMISSION_LIMIT_REACHED),
  );
});

test('successful operation identifiers remain replay-protected after release', () => {
  const admission = buyerRegistry(['worker-a']);
  const ticket = admission.admit(buyerRequest('payer-a', 'operation-a'));
  admission.releaseUndispatched(ticket);
  assert.throws(
    () => admission.admit(buyerRequest('payer-a', 'operation-a')),
    rejectsWith(CODES.OPERATION_REPLAY),
  );
});

test('cloned, forged and foreign tickets fail private identity checks', () => {
  const firstAdmission = buyerRegistry(['worker-a']);
  const secondAdmission = buyerRegistry(['worker-a']);
  const ticket = firstAdmission.admit(buyerRequest('payer-a', 'operation-a'));
  const clone = Object.freeze({ ...ticket });
  const forged = Object.freeze({
    version: 1,
    lane: LANES.BUYER,
    kind: KINDS.BUYER_PREPARE,
    payer: 'payer-a',
    operationId: 'operation-a',
    workerId: 'worker-a',
    sequence: 1,
  });

  assert.throws(
    () => firstAdmission.markDispatched(clone),
    rejectsWith(CODES.INVALID_TICKET),
  );
  assert.throws(
    () => firstAdmission.markDispatched(forged),
    rejectsWith(CODES.INVALID_TICKET),
  );
  assert.throws(
    () => secondAdmission.markDispatched(ticket),
    rejectsWith(CODES.INVALID_TICKET),
  );
  firstAdmission.markDispatched(ticket);
});

test('only reserved-dispatched-completed or reserved-released transitions are accepted', () => {
  const admission = buyerRegistry(['worker-a'], 2);
  const dispatched = admission.admit(buyerRequest('payer-a', 'operation-1'));
  assert.throws(
    () => admission.complete(dispatched),
    rejectsWith(CODES.INVALID_TRANSITION),
  );
  admission.markDispatched(dispatched);
  assert.throws(
    () => admission.markDispatched(dispatched),
    rejectsWith(CODES.INVALID_TRANSITION),
  );
  assert.throws(
    () => admission.releaseUndispatched(dispatched),
    rejectsWith(CODES.INVALID_TRANSITION),
  );
  admission.complete(dispatched);
  assert.throws(
    () => admission.complete(dispatched),
    rejectsWith(CODES.INVALID_TRANSITION),
  );

  const released = admission.admit(buyerRequest('payer-a', 'operation-2'));
  admission.releaseUndispatched(released);
  assert.throws(
    () => admission.markDispatched(released),
    rejectsWith(CODES.INVALID_TRANSITION),
  );
});

test('quarantine is permanent and idempotent while another worker remains usable', () => {
  const admission = buyerRegistry(['worker-a', 'worker-b'], 4);
  const uncertain = admission.admit(buyerRequest('payer-a', 'operation-a'));
  admission.markDispatched(uncertain);
  assert.equal(admission.quarantineWorker('worker-a'), undefined);
  assert.equal(admission.quarantineWorker('worker-a'), undefined);
  assert.throws(
    () => admission.complete(uncertain),
    rejectsWith(CODES.WORKER_QUARANTINED),
  );
  assert.throws(
    () => admission.releaseUndispatched(uncertain),
    rejectsWith(CODES.WORKER_QUARANTINED),
  );
  assert.throws(
    () => admission.admit(buyerRequest('payer-a', 'operation-a-next')),
    rejectsWith(CODES.WORKER_QUARANTINED),
  );

  const other = admission.admit(buyerRequest('payer-b', 'operation-b'));
  assert.equal(other.workerId, 'worker-b');
  admission.markDispatched(other);
  admission.complete(other);
});

test('production module imports only node:util and no live adapter modules', () => {
  const source = readFileSync(
    new URL('../src/zenon/payer-worker-admission.js', import.meta.url),
    'utf8',
  );
  const importSpecifiers = Array.from(
    source.matchAll(/^import .* from ['"]([^'"]+)['"];$/gm),
    match => match[1],
  );
  assert.deepEqual(importSpecifiers, ['node:util']);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(
    importSpecifiers.join('\n'),
    /live-runtime|zenon-payment|settlement-journal|node:(?:fs|net|http|https|timers|worker_threads|child_process)/,
  );

  for (const relativePath of [
    '../src/live-runtime.js',
    '../src/zenon-payment.js',
    '../src/settlement-journal.js',
  ]) {
    const integrationSource = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(integrationSource, /payer-worker-admission\.js/);
  }
});
