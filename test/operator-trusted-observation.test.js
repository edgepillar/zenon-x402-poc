import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { paymentIntentDigest, sha256Hex } from '../src/canonical.js';
import {
  OperatorTrustedObservationError,
  verifyOperatorTrustedObservation,
} from '../src/operator-trusted-observation.js';
import {
  readOperatorTrustedObservationFile,
  runOperatorTrustedObservationCli,
} from '../src/operator-trusted-observation-cli.js';

const FIXTURE_URL = new URL(
  '../docs/evidence/gate-b-operator-trusted-observation-2026-09-04.json',
  import.meta.url,
);
const LIBRARY_URL = new URL('../src/operator-trusted-observation.js', import.meta.url);
const CLI_URL = new URL('../src/operator-trusted-observation-cli.js', import.meta.url);
const MAX_BYTES = 64 * 1024;
const SUCCESS = 'OPERATOR_TRUSTED_OBSERVATION_SELF_CONSISTENT\n';
const FAILURE = 'OPERATOR_TRUSTED_OBSERVATION_FAILED\n';
const ERROR_MESSAGE = 'operator_trusted_observation_invalid';

const DURATION_BINDINGS = Object.freeze({
  challenge: ['runner', 'challenge_request_started', 'challenge_402_received'],
  total: ['runner', 'challenge_402_received', 'paid_response_received'],
  buyerOwnerWait: ['buyer', 'buyer_owner_wait_started', 'buyer_owner_acquired'],
  buyerOwnerHeld: ['buyer', 'buyer_owner_acquired', 'buyer_owner_released'],
  buyerReadiness: ['buyer', 'buyer_readiness_started', 'buyer_readiness_finished'],
  prepareBlock: ['buyer', 'prepare_block_started', 'prepare_block_finished'],
  facilitatorOwnerWait: [
    'facilitator', 'facilitator_owner_wait_started', 'facilitator_owner_acquired',
  ],
  facilitatorOwnerHeld: [
    'facilitator', 'facilitator_owner_acquired', 'facilitator_owner_released',
  ],
  facilitatorReadiness: [
    'facilitator', 'facilitator_readiness_started', 'facilitator_readiness_finished',
  ],
  publication: ['facilitator', 'publication_started', 'publication_acknowledged'],
  inclusionWait: ['facilitator', 'inclusion_wait_started', 'momentum_inclusion_observed'],
  delivery: ['facilitator', 'delivery_started', 'delivery_finished'],
});

function clone(value) {
  return structuredClone(value);
}

async function fixtureText() {
  return readFile(FIXTURE_URL, 'utf8');
}

async function fixture() {
  return JSON.parse(await fixtureText());
}

function projections(record) {
  return record.retainedFragmentProjections;
}

function expectInvalid(input) {
  assert.throws(
    () => verifyOperatorTrustedObservation(input),
    error => {
      assert.equal(error instanceof OperatorTrustedObservationError, true);
      assert.equal(error.name, 'OperatorTrustedObservationError');
      assert.equal(error.message, ERROR_MESSAGE);
      assert.equal(error.code, ERROR_MESSAGE);
      assert.equal(error.cause, undefined);
      assert.equal(Object.hasOwn(error, 'cause'), false);
      assert.equal(error.stack, undefined);
      assert.deepEqual(Object.keys(error), ['code']);
      return true;
    },
  );
}

function invalidRecord(record) {
  expectInvalid(JSON.stringify(record));
}

function setPath(root, path, value) {
  let target = root;
  for (let index = 0; index < path.length - 1; index += 1) target = target[path[index]];
  target[path.at(-1)] = value;
}

function deletePath(root, path) {
  let target = root;
  for (let index = 0; index < path.length - 1; index += 1) target = target[path[index]];
  delete target[path.at(-1)];
}

function objectPaths(value, path = [], output = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      objectPaths(value[index], [...path, index], output);
    }
    return output;
  }
  if (value === null || typeof value !== 'object') return output;
  output.push(path);
  for (const [key, child] of Object.entries(value)) objectPaths(child, [...path, key], output);
  return output;
}

function requiredMemberPaths(value, path = [], output = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      requiredMemberPaths(value[index], [...path, index], output);
    }
    return output;
  }
  if (value === null || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    output.push([...path, key]);
    requiredMemberPaths(child, [...path, key], output);
  }
  return output;
}

function eventMap(record) {
  return new Map(projections(record).timing.timing.events.map(
    event => [`${event.role}:${event.phase}`, event],
  ));
}

function recalculateDurations(record) {
  const events = eventMap(record);
  const durations = projections(record).timing.timing.durationsMs;
  for (const [name, [role, start, end]] of Object.entries(DURATION_BINDINGS)) {
    durations[name] = events.get(`${role}:${end}`).monotonicMs -
      events.get(`${role}:${start}`).monotonicMs;
  }
}

function refreshBindings(record) {
  const retained = projections(record);
  const payment = retained.manifest.payment;
  const offer = payment.paymentRequired.accepts[payment.selectedIndex];
  const chainBlock = retained.chain.chain.accountBlock;
  const journalRecord = retained.journal.journal.record;
  payment.intentDigest = paymentIntentDigest(payment.paymentRequired, offer);
  journalRecord.intentDigest = payment.intentDigest;
  const encodedIntent = Buffer.from(payment.intentDigest, 'hex').toString('base64');
  chainBlock.data = encodedIntent;
  journalRecord.signedAccountBlock.data = encodedIntent;
  journalRecord.resourceIdentity = clone(payment.paymentRequired.resource);
  journalRecord.resourceDigest = sha256Hex(journalRecord.resourceIdentity);
  retained.http.http.final.bodyText = JSON.stringify(journalRecord.cachedResponse.body, null, 2);
}

function coherentlyTransform(record) {
  const retained = projections(record);
  const payment = retained.manifest.payment;
  const offer = payment.paymentRequired.accepts[payment.selectedIndex];
  const chain = retained.chain.chain;
  const journal = retained.journal.journal;
  const journalRecord = journal.record;
  const response = retained.http.http.final.paymentResponse;
  const body = journalRecord.cachedResponse.body;

  payment.paymentRequired.resource = {
    description: 'synthetic transformed resource',
    mimeType: 'application/vnd.example+json',
    url: 'https://example.invalid/transformed',
  };
  offer.amount = '41';
  offer.asset = 'synthetic-asset';
  offer.payTo = 'synthetic-payee';
  offer.maxTimeoutSeconds += 1;
  offer.extra.zenonChain = {
    version: 1,
    chainIdentifier: '41',
    genesisMomentumHash: '1'.repeat(64),
  };

  const transaction = '2'.repeat(64);
  const payer = 'synthetic-payer';
  Object.assign(chain.accountBlock, {
    chainIdentifier: 41,
    hash: transaction,
    height: 43,
    momentumAcknowledged: { height: 42 },
    address: payer,
    toAddress: offer.payTo,
    amount: offer.amount,
    tokenStandard: offer.asset,
    fusedPlasma: 17,
    difficulty: 19,
  });
  journalRecord.signedAccountBlock = clone(chain.accountBlock);
  journalRecord.transactionHash = transaction;
  journalRecord.chainProfile = clone(offer.extra.zenonChain);
  journalRecord.payer = payer;
  response.network = offer.network;
  response.transaction = transaction;
  response.payer = payer;
  body.network = offer.network;
  body.transaction = transaction;
  body.payer = payer;
  journal.sourceRevision += 7;

  chain.confirmation.numConfirmations += 2;
  chain.confirmation.momentumHeight += 3;
  chain.confirmation.momentumTimestamp += 5;
  journalRecord.momentumEvidence.confirmationDetail = {
    numConfirmations: chain.confirmation.numConfirmations,
    momentumHeight: chain.confirmation.momentumHeight,
    momentumTimestamp: chain.confirmation.momentumTimestamp,
  };

  const shift = 86_400_000;
  const monotonicOffsets = { runner: 101, buyer: 202, facilitator: 303 };
  for (const event of retained.timing.timing.events) {
    event.utc = new Date(Date.parse(event.utc) + shift).toISOString();
    event.monotonicMs = (event.monotonicMs * 2) + monotonicOffsets[event.role];
  }
  const events = eventMap(record);
  retained.http.http.initial.observedAt = events.get('runner:challenge_402_received').utc;
  retained.http.http.final.observedAt = events.get('runner:paid_response_received').utc;
  chain.confirmation.observedAt = events.get('facilitator:momentum_inclusion_observed').utc;
  journalRecord.momentumEvidence.observedAt = chain.confirmation.observedAt;
  journalRecord.createdAt = events.get('facilitator:publication_started').utc;
  body.generatedAt = events.get('facilitator:delivery_started').utc;
  journalRecord.updatedAt = events.get('facilitator:delivery_finished').utc;
  recalculateDurations(record);
  refreshBindings(record);
  return record;
}

test('committed operator-trusted observation is self-consistent as text and bytes', async () => {
  const text = await fixtureText();
  assert.equal(verifyOperatorTrustedObservation(text), true);
  assert.equal(verifyOperatorTrustedObservation(Buffer.from(text)), true);
  assert.equal(verifyOperatorTrustedObservation(new Uint8Array(Buffer.from(text))), true);
});

test('byte input uses intrinsic typed-array bounds and rejects proxies', async () => {
  const text = await fixtureText();
  const source = Buffer.from(text);
  class HostileUint8Array extends Uint8Array {
    get byteLength() {
      throw new Error('untrusted accessor');
    }

    get length() {
      return 0;
    }
  }
  const hostile = new HostileUint8Array(source.length);
  Uint8Array.prototype.set.call(hostile, source);
  assert.equal(verifyOperatorTrustedObservation(hostile), true);

  class UnderreportedUint8Array extends Uint8Array {
    get byteLength() {
      return 1;
    }
  }
  expectInvalid(new UnderreportedUint8Array(MAX_BYTES + 1));
  expectInvalid(new Proxy(new Uint8Array(source), {}));
});

test('verification failure is one fixed cause-free error without record data', async () => {
  const text = await fixtureText();
  const sentinel = 'record-data-must-not-escape';
  expectInvalid(`${text}${sentinel}`);
});

test('coherent changes prove the verifier does not pin fixture or dynamic values', async () => {
  const transformed = coherentlyTransform(await fixture());
  assert.equal(verifyOperatorTrustedObservation(JSON.stringify(transformed)), true);
});

test('ordinary JSON whitespace and key order are not treated as provenance', async () => {
  function reverse(value) {
    if (Array.isArray(value)) return value.map(reverse);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverse(child)]));
  }
  const record = reverse(await fixture());
  projections(record).http.http.final.bodyText = JSON.stringify(
    reverse(projections(record).journal.journal.record.cachedResponse.body),
  );
  assert.equal(verifyOperatorTrustedObservation(` \n${JSON.stringify(record, null, 1)}\r\n`), true);
});

test('Unicode is compared byte-semantically without normalization', async () => {
  const composed = await fixture();
  projections(composed).manifest.payment.paymentRequired.resource.description = '\u00e9';
  refreshBindings(composed);
  const decomposed = clone(composed);
  projections(decomposed).manifest.payment.paymentRequired.resource.description = 'e\u0301';
  refreshBindings(decomposed);
  assert.equal(verifyOperatorTrustedObservation(JSON.stringify(composed)), true);
  assert.equal(verifyOperatorTrustedObservation(JSON.stringify(decomposed)), true);
  assert.notEqual(
    projections(composed).journal.journal.record.resourceDigest,
    projections(decomposed).journal.journal.record.resourceDigest,
  );
});

test('every retained object member is required and every object rejects unknown members', async t => {
  const original = await fixture();
  for (const path of requiredMemberPaths(original)) {
    await t.test(`missing ${path.join('.')}`, () => {
      const changed = clone(original);
      deletePath(changed, path);
      invalidRecord(changed);
    });
  }
  for (const path of objectPaths(original)) {
    await t.test(`unknown ${path.join('.') || 'root'}`, () => {
      const changed = clone(original);
      let target = changed;
      for (const key of path) target = target[key];
      target.unexpectedMember = false;
      invalidRecord(changed);
    });
  }
});

test('exact version, type, classification, evidence marker, and fragment labels are enforced', async t => {
  const cases = [
    ['record version', record => { record.recordVersion = 2; }],
    ['record type', record => { record.recordType = 'different-observation'; }],
    ['evidence-v1 marker', record => { record.evidenceV1Bundle = true; }],
    ['issue primitive', record => { record.issue = 83; }],
    ['trust model', record => { record.publicationClassification.trustModel = 'independent'; }],
    ['route relationship', record => { record.publicationClassification.routeRelationship = 'different-route'; }],
    ['independent verification', record => {
      record.publicationClassification.independentOperatorVerification = true;
    }],
  ];
  for (const name of ['manifest', 'chain', 'http', 'journal', 'timing']) {
    cases.push(
      [`${name} fragment version`, record => {
        projections(record)[name].fragmentVersion += 1;
      }],
      [`${name} fragment type`, record => {
        projections(record)[name].fragmentType = 'different';
      }],
    );
  }
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const record = await fixture();
      mutate(record);
      invalidRecord(record);
    });
  }
});

test('every declared nonclaim is exact, present, and false', async t => {
  const original = await fixture();
  for (const key of Object.keys(original.nonClaims)) {
    await t.test(key, () => {
      const changed = clone(original);
      changed.nonClaims[key] = true;
      invalidRecord(changed);
    });
  }
});

test('payment selection, intent digest, block data, and resource bindings reject tampering', async t => {
  const cases = [
    ['selection range', record => { projections(record).manifest.payment.selectedIndex = 1; }],
    ['empty accepts', record => { projections(record).manifest.payment.paymentRequired.accepts = []; }],
    ['intent digest', record => { projections(record).manifest.payment.intentDigest = '3'.repeat(64); }],
    ['chain block data', record => {
      projections(record).chain.chain.accountBlock.data = Buffer.alloc(32, 4).toString('base64');
    }],
    ['journal block data', record => {
      projections(record).journal.journal.record.signedAccountBlock.data =
        Buffer.alloc(32, 5).toString('base64');
    }],
    ['noncanonical base64', record => {
      projections(record).chain.chain.accountBlock.data += '=';
    }],
    ['resource identity', record => {
      projections(record).journal.journal.record.resourceIdentity.description += ' changed';
    }],
    ['resource digest', record => {
      projections(record).journal.journal.record.resourceDigest = '6'.repeat(64);
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const record = await fixture();
      mutate(record);
      invalidRecord(record);
    });
  }
});

test('partial block, amount, asset, payee, payer, network, and chain-profile links reject tampering', async t => {
  const cases = [
    ['partial block copy', record => {
      projections(record).journal.journal.record.signedAccountBlock.difficulty += 1;
    }],
    ['coherent non-UserSend block type', record => {
      const retained = projections(record);
      retained.chain.chain.accountBlock.blockType = 1;
      retained.journal.journal.record.signedAccountBlock.blockType = 1;
    }],
    ['amount', record => { projections(record).chain.chain.accountBlock.amount += '0'; }],
    ['asset', record => { projections(record).chain.chain.accountBlock.tokenStandard += 'x'; }],
    ['payee', record => { projections(record).chain.chain.accountBlock.toAddress += 'x'; }],
    ['payer block', record => { projections(record).chain.chain.accountBlock.address += 'x'; }],
    ['payer response', record => { projections(record).http.http.final.paymentResponse.payer += 'x'; }],
    ['payer journal', record => { projections(record).journal.journal.record.payer += 'x'; }],
    ['payer body', record => {
      const retained = projections(record);
      retained.journal.journal.record.cachedResponse.body.payer += 'x';
      retained.http.http.final.bodyText = JSON.stringify(
        retained.journal.journal.record.cachedResponse.body,
      );
    }],
    ['network response', record => { projections(record).http.http.final.paymentResponse.network += 'x'; }],
    ['network body', record => {
      const retained = projections(record);
      retained.journal.journal.record.cachedResponse.body.network += 'x';
      retained.http.http.final.bodyText = JSON.stringify(
        retained.journal.journal.record.cachedResponse.body,
      );
    }],
    ['chain profile', record => {
      projections(record).journal.journal.record.chainProfile.chainIdentifier = '42';
    }],
    ['numeric chain link', record => { projections(record).chain.chain.accountBlock.chainIdentifier += 1; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const record = await fixture();
      mutate(record);
      invalidRecord(record);
    });
  }
});

test('the supplied transaction identifier must agree across every retained copy', async t => {
  const paths = [
    ['retainedFragmentProjections', 'chain', 'chain', 'accountBlock', 'hash'],
    ['retainedFragmentProjections', 'http', 'http', 'final', 'paymentResponse', 'transaction'],
    ['retainedFragmentProjections', 'journal', 'journal', 'record', 'transactionHash'],
    ['retainedFragmentProjections', 'journal', 'journal', 'record', 'signedAccountBlock', 'hash'],
    ['retainedFragmentProjections', 'journal', 'journal', 'record', 'cachedResponse', 'body', 'transaction'],
  ];
  for (const path of paths) {
    await t.test(path.slice(-2).join('.'), async () => {
      const record = await fixture();
      setPath(record, path, '7'.repeat(64));
      const bodyPath = path.includes('body');
      if (bodyPath) {
        projections(record).http.http.final.bodyText = JSON.stringify(
          projections(record).journal.journal.record.cachedResponse.body,
        );
      }
      invalidRecord(record);
    });
  }
});

test('confirmation tuple equality, positive counts, and height ordering are enforced', async t => {
  const cases = [
    ['zero confirmations', record => { projections(record).chain.chain.confirmation.numConfirmations = 0; }],
    ['tuple confirmations', record => {
      projections(record).journal.journal.record.momentumEvidence.confirmationDetail.numConfirmations += 1;
    }],
    ['tuple height', record => {
      projections(record).journal.journal.record.momentumEvidence.confirmationDetail.momentumHeight += 1;
    }],
    ['tuple timestamp', record => {
      projections(record).journal.journal.record.momentumEvidence.confirmationDetail.momentumTimestamp += 1;
    }],
    ['acknowledged height order', record => {
      const chain = projections(record).chain.chain;
      chain.confirmation.momentumHeight = chain.accountBlock.momentumAcknowledged.height;
      projections(record).journal.journal.record.momentumEvidence.confirmationDetail.momentumHeight =
        chain.confirmation.momentumHeight;
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const record = await fixture();
      mutate(record);
      invalidRecord(record);
    });
  }
});

test('HTTP/cache checks cover only the shared status, content type, and exact six-field body', async t => {
  const cases = [
    ['status equality', record => { projections(record).journal.journal.record.cachedResponse.status = 201; }],
    ['content type equality', record => {
      projections(record).journal.journal.record.cachedResponse.headers['content-type'] = 'application/json';
    }],
    ['body equality', record => {
      projections(record).http.http.final.bodyText = '{"ok":false}';
    }],
    ['body ok', record => {
      const retained = projections(record);
      retained.journal.journal.record.cachedResponse.body.ok = false;
      retained.http.http.final.bodyText = JSON.stringify(retained.journal.journal.record.cachedResponse.body);
    }],
    ['body message', record => {
      const retained = projections(record);
      retained.journal.journal.record.cachedResponse.body.message = 'different';
      retained.http.http.final.bodyText = JSON.stringify(retained.journal.journal.record.cachedResponse.body);
    }],
    ['body generatedAt type', record => {
      const retained = projections(record);
      retained.journal.journal.record.cachedResponse.body.generatedAt = 1;
      retained.http.http.final.bodyText = JSON.stringify(retained.journal.journal.record.cachedResponse.body);
    }],
    ['body extra field', record => {
      const retained = projections(record);
      retained.journal.journal.record.cachedResponse.body.extra = false;
      retained.http.http.final.bodyText = JSON.stringify(retained.journal.journal.record.cachedResponse.body);
    }],
    ['cache policy', record => { projections(record).http.http.final.cacheControl = 'public'; }],
    ['vary', record => { projections(record).http.http.final.vary = 'Accept'; }],
    ['initial status', record => { projections(record).http.http.initial.status = 200; }],
    ['final status', record => {
      const retained = projections(record);
      retained.http.http.final.status = 201;
      retained.journal.journal.record.cachedResponse.status = 201;
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const record = await fixture();
      mutate(record);
      invalidRecord(record);
    });
  }
});

test('nested HTTP bodyText uses the same duplicate-aware parser', async () => {
  const record = await fixture();
  const body = projections(record).journal.journal.record.cachedResponse.body;
  projections(record).http.http.final.bodyText =
    `{"ok":true,"ok":true,"message":${JSON.stringify(body.message)},` +
    `"network":${JSON.stringify(body.network)},"payer":${JSON.stringify(body.payer)},` +
    `"transaction":${JSON.stringify(body.transaction)},` +
    `"generatedAt":${JSON.stringify(body.generatedAt)}}`;
  invalidRecord(record);
});

test('journal schema, state, counts, and timestamp ordering are enforced', async t => {
  const cases = [
    ['schema', record => { projections(record).journal.journal.sourceSchemaVersion = 2; }],
    ['revision', record => { projections(record).journal.journal.sourceRevision = 0; }],
    ['active count', record => { projections(record).journal.journal.activeRecordCount = 2; }],
    ['tombstone count', record => { projections(record).journal.journal.tombstoneCount = 1; }],
    ['evidence state', record => {
      projections(record).journal.journal.record.evidenceState = 'DIFFERENT';
    }],
    ['delivery state', record => {
      projections(record).journal.journal.record.deliveryState = 'DIFFERENT';
    }],
    ['updated before created', record => {
      const journalRecord = projections(record).journal.journal.record;
      journalRecord.updatedAt = new Date(Date.parse(journalRecord.createdAt) - 1).toISOString();
    }],
    ['invalid created timestamp', record => {
      projections(record).journal.journal.record.createdAt = 'not-a-time';
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const record = await fixture();
      mutate(record);
      invalidRecord(record);
    });
  }
});

test('event set, sequence, role clocks, per-role monotonicity, and declared UTC order are enforced', async t => {
  const cases = [
    ['event count', record => { projections(record).timing.timing.events.pop(); }],
    ['sequence', record => { projections(record).timing.timing.events[3].sequence += 1; }],
    ['event pair', record => {
      projections(record).timing.timing.events[3].phase =
        projections(record).timing.timing.events[2].phase;
    }],
    ['clock domain', record => {
      projections(record).timing.timing.events[3].clockDomain = 'runner-monotonic-v1';
    }],
    ['monotonic rollback', record => {
      const events = projections(record).timing.timing.events;
      events[4].monotonicMs = events[3].monotonicMs - 1;
    }],
    ['negative monotonic', record => { projections(record).timing.timing.events[0].monotonicMs = -1; }],
    ['UTC rollback', record => {
      const events = projections(record).timing.timing.events;
      events[4].utc = new Date(Date.parse(events[3].utc) - 1).toISOString();
    }],
    ['per-role phase order', record => {
      const events = projections(record).timing.timing.events;
      [events[4].phase, events[5].phase] = [events[5].phase, events[4].phase];
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const record = await fixture();
      mutate(record);
      invalidRecord(record);
    });
  }
});

test('all twelve durations are recomputed from their role-local monotonic clocks', async t => {
  const original = await fixture();
  for (const key of Object.keys(DURATION_BINDINGS)) {
    await t.test(key, () => {
      const changed = clone(original);
      projections(changed).timing.timing.durationsMs[key] += 1;
      invalidRecord(changed);
    });
  }
});

test('HTTP, confirmation, and journal event anchors and their orders reject tampering', async t => {
  const cases = [
    ['initial HTTP anchor', record => {
      projections(record).http.http.initial.observedAt =
        projections(record).timing.timing.events[0].utc;
    }],
    ['final HTTP anchor', record => {
      projections(record).http.http.final.observedAt =
        projections(record).timing.timing.events[19].utc;
    }],
    ['confirmation anchor', record => {
      projections(record).chain.chain.confirmation.observedAt =
        projections(record).timing.timing.events[15].utc;
    }],
    ['journal confirmation anchor', record => {
      projections(record).journal.journal.record.momentumEvidence.observedAt =
        projections(record).timing.timing.events[15].utc;
    }],
    ['creation/publication order', record => {
      const retained = projections(record);
      retained.journal.journal.record.createdAt = retained.timing.timing.events[14].utc;
    }],
    ['generated/delivery order', record => {
      const retained = projections(record);
      retained.journal.journal.record.cachedResponse.body.generatedAt =
        new Date(Date.parse(retained.timing.timing.events[18].utc) - 1).toISOString();
      retained.http.http.final.bodyText = JSON.stringify(
        retained.journal.journal.record.cachedResponse.body,
      );
    }],
    ['update/delivery order', record => {
      const retained = projections(record);
      retained.journal.journal.record.updatedAt = retained.timing.timing.events[20].utc;
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const record = await fixture();
      mutate(record);
      invalidRecord(record);
    });
  }
});

test('strict parser rejects duplicate keys, hostile UTF-8/JSON, size, numbers, and surrogates', async t => {
  const text = await fixtureText();
  const cases = [
    ['top-level duplicate', text.replace('{', '{"recordVersion":1,')],
    ['empty', ''],
    ['whitespace only', ' \n\r\t'],
    ['BOM text', `\ufeff${text}`],
    ['BOM bytes', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)])],
    ['invalid UTF-8', Buffer.from([0xc0, 0xaf])],
    ['truncated UTF-8', Buffer.from([0xe2, 0x82])],
    ['float', text.replace('"recordVersion": 1', '"recordVersion": 1.0')],
    ['exponent', text.replace('"recordVersion": 1', '"recordVersion": 1e0')],
    ['negative', text.replace('"recordVersion": 1', '"recordVersion": -1')],
    ['negative zero', text.replace('"recordVersion": 1', '"recordVersion": -0')],
    ['leading zero', text.replace('"recordVersion": 1', '"recordVersion": 01')],
    ['unsafe integer', text.replace('"recordVersion": 1', '"recordVersion": 9007199254740992')],
    ['unescaped control', '{"value":"\u0000"}'],
    ['lone high surrogate escape', '{"value":"\\ud800"}'],
    ['lone low surrogate escape', '{"value":"\\udc00"}'],
    ['trailing token', `${text}false`],
    ['too large', ' '.repeat(MAX_BYTES + 1)],
    ['too deep', `${'['.repeat(40)}null${']'.repeat(40)}`],
    ['too many nodes', `[${Array.from({ length: 8_300 }, () => 'null').join(',')}]`],
    ['too many members', `{${Array.from(
      { length: 4_200 },
      (_, index) => `"k${index}":null`,
    ).join(',')}}`],
    ['too many strings', `[${Array.from({ length: 4_200 }, () => '""').join(',')}]`],
    ['oversized string', JSON.stringify('x'.repeat(20_000))],
  ];
  for (const [name, input] of cases) await t.test(name, () => expectInvalid(input));

  await t.test('oversized text rejects before Buffer conversion', () => {
    const originalFrom = Buffer.from;
    let conversions = 0;
    Buffer.from = (...arguments_) => {
      conversions += 1;
      return Reflect.apply(originalFrom, Buffer, arguments_);
    };
    try {
      expectInvalid('x'.repeat(MAX_BYTES + 1));
    } finally {
      Buffer.from = originalFrom;
    }
    assert.equal(conversions, 0);
  });

  const paired = await fixture();
  paired.issue = '\ud83d\ude00';
  assert.equal(verifyOperatorTrustedObservation(JSON.stringify(paired)), true);
  expectInvalid(1);
  expectInvalid(null);
  expectInvalid({});
  expectInvalid(new DataView(new ArrayBuffer(8)));
});

async function runCli(options) {
  let stdout = '';
  let stderr = '';
  let reads = 0;
  const success = await runOperatorTrustedObservationCli({
    argv: options.argv,
    readFile: async file => {
      reads += 1;
      return options.readFile(file);
    },
    stdout: line => {
      stdout += line;
      return Buffer.byteLength(line, 'utf8');
    },
    stderr: line => {
      stderr += line;
      return Buffer.byteLength(line, 'utf8');
    },
  });
  return { success, stdout, stderr, reads };
}

test('CLI accepts exactly --file with no fallback, search, default, or environment input', async t => {
  const text = await fixtureText();
  const accepted = await runCli({ argv: ['--file', 'explicit.json'], readFile: async () => text });
  assert.deepEqual(accepted, { success: true, stdout: SUCCESS, stderr: '', reads: 1 });

  const rejected = [
    [], ['explicit.json'], ['--file'], ['--file=explicit.json'],
    ['--file', 'one.json', 'two.json'], ['--other', 'explicit.json'],
    ['--file', ''], ['--file', 'one.json', '--file', 'two.json'],
  ];
  for (const argv of rejected) {
    await t.test(JSON.stringify(argv), async () => {
      const result = await runCli({ argv, readFile: async () => text });
      assert.deepEqual(result, { success: false, stdout: '', stderr: FAILURE, reads: 0 });
    });
  }
});

test('CLI output, exit result, and failure boundary never expose cause, path, or record data', async () => {
  const sentinelPath = 'sensitive-path-sentinel';
  const sentinelData = 'sensitive-record-sentinel';
  const result = await runCli({
    argv: ['--file', sentinelPath],
    readFile: async () => `{${JSON.stringify(sentinelData)}}`,
  });
  assert.equal(result.success, false);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, FAILURE);
  assert.equal(`${result.stdout}${result.stderr}`.includes(sentinelPath), false);
  assert.equal(`${result.stdout}${result.stderr}`.includes(sentinelData), false);
});

test('CLI contains short and throwing fixed-output writers and fails closed', async t => {
  const text = await fixtureText();
  for (const [name, stdout] of [
    ['short stdout', () => 0],
    ['throwing stdout', () => { throw new Error('hidden output failure'); }],
  ]) {
    await t.test(name, async () => {
      let stderr = '';
      const success = await runOperatorTrustedObservationCli({
        argv: ['--file', 'explicit.json'],
        readFile: async () => text,
        stdout,
        stderr: line => {
          stderr += line;
          return Buffer.byteLength(line, 'utf8');
        },
      });
      assert.equal(success, false);
      assert.equal(stderr, FAILURE);
    });
  }

  for (const [name, stderr] of [
    ['short stderr', () => 0],
    ['throwing stderr', () => { throw new Error('hidden output failure'); }],
  ]) {
    await t.test(name, async () => {
      const success = await runOperatorTrustedObservationCli({
        argv: [],
        readFile: async () => text,
        stdout: () => Buffer.byteLength(SUCCESS, 'utf8'),
        stderr,
      });
      assert.equal(success, false);
    });
  }
});

test('default CLI reads the committed regular single-link file and emits fixed success', async () => {
  let stdout = '';
  let stderr = '';
  const success = await runOperatorTrustedObservationCli({
    argv: ['--file', fileURLToPath(FIXTURE_URL)],
    stdout: line => {
      stdout += line;
      return Buffer.byteLength(line, 'utf8');
    },
    stderr: line => {
      stderr += line;
      return Buffer.byteLength(line, 'utf8');
    },
  });
  assert.equal(success, true);
  assert.equal(stdout, SUCCESS);
  assert.equal(stderr, '');
});

test('default file reader rejects final/component symlinks, hardlinks, and special files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'operator-observation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const text = await fixtureText();
  const regular = join(directory, 'regular.json');
  await writeFile(regular, text);

  await t.test('final symlink', async () => {
    const linked = join(directory, 'linked.json');
    await symlink(regular, linked);
    await assert.rejects(readOperatorTrustedObservationFile(linked));
  });
  await t.test('component symlink', async () => {
    const physical = join(directory, 'physical');
    const linked = join(directory, 'linked-directory');
    await mkdir(physical);
    await writeFile(join(physical, 'record.json'), text);
    await symlink(physical, linked);
    await assert.rejects(readOperatorTrustedObservationFile(join(linked, 'record.json')));
  });
  await t.test('hardlink', async () => {
    const hardlinked = join(directory, 'hardlinked.json');
    await link(regular, hardlinked);
    await assert.rejects(readOperatorTrustedObservationFile(hardlinked));
  });
  await t.test('directory special file', async () => {
    await assert.rejects(readOperatorTrustedObservationFile(directory));
  });
  await t.test('portable character device', async nested => {
    try {
      const stat = await lstat('/dev/null');
      if (!stat.isCharacterDevice()) {
        nested.skip('no portable character device');
        return;
      }
    } catch {
      nested.skip('no portable character device');
      return;
    }
    await assert.rejects(readOperatorTrustedObservationFile('/dev/null'));
  });
});

function fakeStat(overrides = {}) {
  return {
    dev: 1n,
    ino: 2n,
    mode: BigInt(fsConstants.S_IFREG | 0o644),
    nlink: 1n,
    size: 4n,
    mtimeNs: 5n,
    ctimeNs: 6n,
    ...overrides,
  };
}

function fakeReaderScenario({
  constants = fsConstants,
  pathStats,
  openStats,
  afterStats,
  bytes = Buffer.from('null'),
  bytesRead = bytes.length,
  readFailure = false,
  closeFailure = false,
} = {}) {
  const directory = fakeStat({
    ino: 1n,
    mode: BigInt(fsConstants.S_IFDIR | 0o755),
    nlink: 2n,
    size: 0n,
  });
  const leaf = fakeStat();
  const initialPaths = pathStats ?? [directory, directory, leaf];
  let lstatCalls = 0;
  let opens = 0;
  let openedFlags;
  let statCalls = 0;
  let reads = 0;
  let closes = 0;
  const handle = {
    async stat() {
      statCalls += 1;
      return statCalls === 1 ? (openStats ?? leaf) : (afterStats ?? openStats ?? leaf);
    },
    async read(buffer) {
      reads += 1;
      if (readFailure) throw new Error('hidden read failure');
      bytes.copy(buffer, 0, 0, Math.min(bytes.length, buffer.length));
      return { bytesRead, buffer };
    },
    async close() {
      closes += 1;
      if (closeFailure) throw new Error('hidden close failure');
    },
  };
  const dependencies = {
    constants,
    lstat: async () => {
      const cycleIndex = lstatCalls % initialPaths.length;
      const cycle = Math.floor(lstatCalls / initialPaths.length);
      lstatCalls += 1;
      if (cycle === 0) return initialPaths[cycleIndex];
      return pathStats?.post?.[cycleIndex] ?? initialPaths[cycleIndex];
    },
    open: async (_path, flags) => {
      opens += 1;
      openedFlags = flags;
      return handle;
    },
    resolve: () => '/safe/record.json',
  };
  return {
    dependencies,
    counts: () => ({ lstatCalls, opens, statCalls, reads, closes }),
    flags: () => openedFlags,
  };
}

test('file reader pins identity and metadata and performs one read and one close', async () => {
  const scenario = fakeReaderScenario();
  const bytes = await readOperatorTrustedObservationFile('explicit.json', scenario.dependencies);
  assert.equal(bytes.toString('utf8'), 'null');
  assert.deepEqual(
    scenario.counts(),
    { lstatCalls: 6, opens: 1, statCalls: 2, reads: 1, closes: 1 },
  );
  assert.equal((scenario.flags() & fsConstants.O_NOFOLLOW) === fsConstants.O_NOFOLLOW, true);
  if (Number.isInteger(fsConstants.O_NONBLOCK)) {
    assert.equal((scenario.flags() & fsConstants.O_NONBLOCK) === fsConstants.O_NONBLOCK, true);
  }
  if (Number.isInteger(fsConstants.O_CLOEXEC)) {
    assert.equal((scenario.flags() & fsConstants.O_CLOEXEC) === fsConstants.O_CLOEXEC, true);
  }
});

test('file reader fails closed when O_NOFOLLOW is unavailable', async () => {
  const constants = { ...fsConstants };
  delete constants.O_NOFOLLOW;
  const scenario = fakeReaderScenario({ constants });
  await assert.rejects(readOperatorTrustedObservationFile('explicit.json', scenario.dependencies));
  assert.deepEqual(
    scenario.counts(),
    { lstatCalls: 0, opens: 0, statCalls: 0, reads: 0, closes: 0 },
  );
});

test('file reader rejects replacement, truncation, growth, metadata, and link changes without leaks', async t => {
  const cases = [
    ['replacement at open', { openStats: fakeStat({ ino: 9n }) }],
    ['truncation read', { bytesRead: 3 }],
    ['growth read', { bytes: Buffer.from('nullx'), bytesRead: 5 }],
    ['device after read', { afterStats: fakeStat({ dev: 7n }) }],
    ['inode after read', { afterStats: fakeStat({ ino: 7n }) }],
    ['size after read', { afterStats: fakeStat({ size: 5n }) }],
    ['mode after read', { afterStats: fakeStat({ mode: BigInt(fsConstants.S_IFREG | 0o600) }) }],
    ['mtime after read', { afterStats: fakeStat({ mtimeNs: 7n }) }],
    ['ctime after read', { afterStats: fakeStat({ ctimeNs: 7n }) }],
    ['link after read', { afterStats: fakeStat({ nlink: 2n }) }],
    ['read failure', { readFailure: true }],
    ['close failure', { closeFailure: true }],
  ];
  for (const [name, options] of cases) {
    await t.test(name, async () => {
      const scenario = fakeReaderScenario(options);
      await assert.rejects(readOperatorTrustedObservationFile('explicit.json', scenario.dependencies));
      const counts = scenario.counts();
      assert.equal(counts.reads <= 1, true);
      assert.equal(counts.closes, 1);
    });
  }

  await t.test('component replacement after read', async () => {
    const directory = fakeStat({
      ino: 1n,
      mode: BigInt(fsConstants.S_IFDIR | 0o755),
      nlink: 2n,
      size: 0n,
    });
    const leaf = fakeStat();
    const pathStats = [directory, directory, leaf];
    pathStats.post = [directory, { ...directory, ino: 8n }, leaf];
    const scenario = fakeReaderScenario({ pathStats });
    await assert.rejects(readOperatorTrustedObservationFile('explicit.json', scenario.dependencies));
    assert.deepEqual(
      scenario.counts(),
      { lstatCalls: 6, opens: 1, statCalls: 2, reads: 1, closes: 1 },
    );
  });
});

test('library and CLI imports are inert and register no I/O or network work', () => {
  const script = `
    const forbidden = () => { throw new Error('side effect'); };
    process.stdout.write = forbidden;
    process.stderr.write = forbidden;
    globalThis.fetch = forbidden;
    globalThis.WebSocket = class { constructor() { forbidden(); } };
    const before = process._getActiveHandles().length;
    await import(${JSON.stringify(LIBRARY_URL.href)});
    await import(${JSON.stringify(CLI_URL.href)});
    await new Promise(resolve => setImmediate(resolve));
    if (process._getActiveHandles().length !== before) process.exitCode = 2;
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
    env: {},
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('direct CLI has exact fixed output and exit codes', async t => {
  const valid = spawnSync(process.execPath, [fileURLToPath(CLI_URL), '--file', fileURLToPath(FIXTURE_URL)], {
    encoding: 'utf8',
    env: {},
  });
  assert.equal(valid.status, 0);
  assert.equal(valid.stdout, SUCCESS);
  assert.equal(valid.stderr, '');

  const directory = await mkdtemp(join(tmpdir(), 'operator-observation-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const invalidPath = join(directory, 'invalid.json');
  await writeFile(invalidPath, '{"sentinel":"must-not-escape"}');
  const invalid = spawnSync(process.execPath, [fileURLToPath(CLI_URL), '--file', invalidPath], {
    encoding: 'utf8',
    env: {},
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.equal(invalid.stderr, FAILURE);
  assert.equal(`${invalid.stdout}${invalid.stderr}`.includes(invalidPath), false);
  assert.equal(`${invalid.stdout}${invalid.stderr}`.includes('sentinel'), false);
});

test('documented silent package command has exact fixed output', () => {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'run',
      '--silent',
      'verify:operator-trusted-observation',
      '--',
      '--file',
      fileURLToPath(FIXTURE_URL),
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, SUCCESS);
  assert.equal(result.stderr, '');
});

test('direct CLI contains a real closed stdout pipe without a raw diagnostic', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'operator-observation-pipe-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let deep = directory;
  for (let index = 0; index < 64; index += 1) deep = join(deep, `d${index}`);
  await mkdir(deep, { recursive: true });
  const recordPath = join(deep, 'record.json');
  await writeFile(recordPath, await fixtureText());

  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(CLI_URL), '--file', recordPath],
      { env: {}, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stderr }));
    child.stdout.destroy();
  });
  assert.deepEqual(result, { code: 1, signal: null, stderr: FAILURE });
  assert.equal(result.stderr.includes(recordPath), false);
});

test('production sources contain no fixture name, dynamic values, network, writes, or registration', async () => {
  const [record, librarySource, cliSource] = await Promise.all([
    fixture(),
    readFile(LIBRARY_URL, 'utf8'),
    readFile(CLI_URL, 'utf8'),
  ]);
  const retained = projections(record);
  const dynamicValues = [
    retained.chain.chain.accountBlock.hash,
    retained.chain.chain.accountBlock.amount,
    retained.chain.chain.accountBlock.address,
    retained.chain.chain.accountBlock.toAddress,
    retained.chain.chain.accountBlock.tokenStandard,
    retained.chain.chain.confirmation.observedAt,
    String(retained.journal.journal.sourceRevision),
  ];
  for (const source of [librarySource, cliSource]) {
    assert.doesNotMatch(source, /gate-b-operator-trusted-observation-\d{4}-\d{2}-\d{2}/);
    for (const value of dynamicValues) {
      if (value.length >= 3) assert.equal(source.includes(value), false);
    }
  }
  assert.doesNotMatch(librarySource, /node:fs|node:http|node:https|node:net|fetch\s*\(|WebSocket|process\.env/);
  assert.doesNotMatch(cliSource, /writeFile|appendFile|createWriteStream|node:http|node:https|node:net|fetch\s*\(|WebSocket|process\.env|process\.on\s*\(/);
});
