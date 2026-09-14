import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_MAX_CHALLENGE_LIFETIME_MS,
  ServiceCreditExternalHolderGrantDescriptorHandoffError,
  createServiceCreditExternalHolderGrantDescriptorHandoff,
  createServiceCreditExternalHolderGrantDescriptorSigningBytes,
} from '../src/service-credit-external-holder-grant-descriptor-handoff.js';
import {
  deriveServiceCreditCapabilityCommitment,
} from '../src/service-credit-capability.js';

const ORIGIN = 'https://service.example';
const NOW = 2_000_000_000_000;
const LIFETIME_MS = 1_000;
const GRANT_ID = 'grant.external-holder.reference';
const UNAVAILABLE = 'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_UNAVAILABLE';
const INVALID_CONFIGURATION =
  'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_INVALID_CONFIGURATION';
const INVALID_INPUT =
  'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_INVALID_INPUT';
const SPKI_ED25519_PREFIX_HEX = '302a300506032b6570032100';

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  assert.equal(spki.subarray(0, -32).toString('hex'), SPKI_ED25519_PREFIX_HEX);
  return Object.freeze({
    privateKey: pair.privateKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  });
}

function selectedHolder(publicKey) {
  return {
    offerId: 'offer.external-holder.reference',
    offerVersion: 1,
    holderId: 'holder.external.reference',
    capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey }),
  };
}

function fixture(overrides = {}) {
  const keys = overrides.keys ?? keyMaterial();
  const selection = overrides.selection ?? selectedHolder(keys.publicKey);
  const ownerSelection = Object.freeze({ ...selection });
  const origin = overrides.origin ?? ORIGIN;
  const state = {
    now: overrides.now ?? NOW,
    nowReads: 0,
    phase: overrides.phase ?? 'ACTIVE',
    descriptorReads: 0,
    reenter: overrides.reenter ?? null,
  };
  const ownerDescriptor = overrides.ownerDescriptor ?? Object.freeze({
    grantId: GRANT_ID,
    capabilityCommitment: selection.capabilityCommitment,
  });
  const getActiveGrantDescriptorForSelection = Object.freeze(
    function getActiveGrantDescriptorForSelection(requestedSelection) {
      state.descriptorReads += 1;
      if (state.reenter !== null) state.reenter();
      if (
        state.phase !== 'ACTIVE'
        || requestedSelection.offerId !== ownerSelection.offerId
        || requestedSelection.offerVersion !== ownerSelection.offerVersion
        || requestedSelection.holderId !== ownerSelection.holderId
        || requestedSelection.capabilityCommitment !== ownerSelection.capabilityCommitment
      ) throw new Error('synthetic-private-detail');
      return ownerDescriptor;
    },
  );
  const now = Object.freeze(() => {
    state.nowReads += 1;
    return state.now;
  });
  const handoff = createServiceCreditExternalHolderGrantDescriptorHandoff({
    origin,
    selection,
    challengeLifetimeMs: overrides.challengeLifetimeMs ?? LIFETIME_MS,
    now,
    getActiveGrantDescriptorForSelection,
  });
  return { handoff, keys, origin, ownerDescriptor, selection, state };
}

function signingMessage(challenge, origin, selection) {
  return {
    ...challenge,
    origin,
    selection,
  };
}

function signedRedemption(challenge, context, overrides = {}) {
  const signingKeys = overrides.signingKeys ?? context.keys;
  const signingOrigin = overrides.signingOrigin ?? context.origin;
  const signingSelection = overrides.signingSelection ?? context.selection;
  return {
    challenge,
    publicKey: signingKeys.publicKey,
    signature: sign(
      null,
      createServiceCreditExternalHolderGrantDescriptorSigningBytes(
        signingMessage(challenge, signingOrigin, signingSelection),
      ),
      signingKeys.privateKey,
    ).toString('base64url'),
    ...(Object.hasOwn(overrides, 'signature') ? { signature: overrides.signature } : {}),
  };
}

function assertError(operation, code) {
  assert.throws(operation, error => {
    assert.equal(
      error instanceof ServiceCreditExternalHolderGrantDescriptorHandoffError,
      true,
    );
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(
      error.stack,
      `ServiceCreditExternalHolderGrantDescriptorHandoffError: ${code}`,
    );
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(String(error.stack).includes('synthetic-private-detail'), false);
    return true;
  });
}

function assertUnavailable(operation) {
  assertError(operation, UNAVAILABLE);
}

test('the opt-in module is inert, listenerless, and captures detached fixed inputs', () => {
  const source = readFileSync(
    new URL('../src/service-credit-external-holder-grant-descriptor-handoff.js', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'node:http',
    'node:https',
    'node:net',
    'createServer(',
    '.listen(',
    'process.env',
    'console.',
    'privateKey',
    'activateCommittedFunding',
  ]) assert.equal(source.includes(forbidden), false);
  assert.equal(
    source.includes('does not provide authenticated HTTPS ingress or evidence of live activation'),
    true,
  );
  assert.equal(
    source.includes('future unauthenticated public challenge route still needs rate limits and'),
    true,
  );
  assert.equal(
    source.includes('selection-aware trusted privileged owner dependency, not independent proof'),
    true,
  );
  assert.equal(
    source.includes('owner-validated committed ACTIVE grant binding'),
    true,
  );

  const keys = keyMaterial();
  const selection = selectedHolder(keys.publicKey);
  const fixedSelection = { ...selection };
  const ownerDescriptor = Object.freeze({
    grantId: GRANT_ID,
    capabilityCommitment: fixedSelection.capabilityCommitment,
  });
  let nowCalls = 0;
  let descriptorReads = 0;
  const handoff = createServiceCreditExternalHolderGrantDescriptorHandoff({
    origin: ORIGIN,
    selection,
    challengeLifetimeMs: LIFETIME_MS,
    now: Object.freeze(() => { nowCalls += 1; return NOW; }),
    getActiveGrantDescriptorForSelection: Object.freeze(requestedSelection => {
      descriptorReads += 1;
      assert.deepEqual(requestedSelection, fixedSelection);
      return ownerDescriptor;
    }),
  });
  selection.offerId = 'offer.changed';
  selection.capabilityCommitment = `sha256:${'0'.repeat(64)}`;

  assert.deepEqual(Reflect.ownKeys(handoff), ['issueChallenge', 'redeem', 'close']);
  assert.equal(Object.isFrozen(handoff), true);
  assert.equal(Object.isFrozen(handoff.issueChallenge), true);
  assert.equal(Object.isFrozen(handoff.redeem), true);
  assert.equal(Object.isFrozen(handoff.close), true);
  assert.equal(nowCalls, 0);
  assert.equal(descriptorReads, 0);

  const challenge = handoff.issueChallenge();
  const descriptor = handoff.redeem(signedRedemption(challenge, {
    keys,
    origin: ORIGIN,
    selection: fixedSelection,
  }));
  assert.deepEqual(descriptor, ownerDescriptor);
  assert.equal(descriptorReads, 1);
});

test('an exact holder proof discloses only one new frozen active descriptor', () => {
  const context = fixture();
  const challenge = context.handoff.issueChallenge();
  assert.deepEqual(Reflect.ownKeys(challenge), [
    'handoffVersion', 'challenge', 'expiresAtMs',
  ]);
  assert.equal(
    challenge.handoffVersion,
    SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  );
  assert.equal(challenge.expiresAtMs, NOW + LIFETIME_MS);
  assert.match(challenge.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Object.isFrozen(challenge), true);
  assert.equal(Object.hasOwn(challenge, 'grantId'), false);
  const serializedChallenge = JSON.stringify(challenge);
  for (const hidden of [
    'origin',
    'selection',
    'holderId',
    'capabilityCommitment',
    'offerId',
    'offerVersion',
    ORIGIN,
    context.selection.holderId,
    context.selection.capabilityCommitment,
    context.selection.offerId,
  ]) assert.equal(serializedChallenge.includes(hidden), false);

  const message = signingMessage(challenge, context.origin, context.selection);
  const firstBytes = createServiceCreditExternalHolderGrantDescriptorSigningBytes(message);
  const reordered = Object.fromEntries(Object.entries(message).reverse());
  reordered.selection = Object.fromEntries(Object.entries(message.selection).reverse());
  const secondBytes = createServiceCreditExternalHolderGrantDescriptorSigningBytes(reordered);
  assert.notEqual(firstBytes, secondBytes);
  assert.deepEqual(firstBytes, secondBytes);

  const descriptor = context.handoff.redeem(signedRedemption(challenge, context));
  assert.deepEqual(Reflect.ownKeys(descriptor), ['grantId', 'capabilityCommitment']);
  assert.deepEqual(descriptor, context.ownerDescriptor);
  assert.notEqual(descriptor, context.ownerDescriptor);
  assert.equal(Object.isFrozen(descriptor), true);
  assert.equal(context.state.descriptorReads, 1);
});

test('signing bytes match an independently assembled fixed v1 known answer', () => {
  const challenge = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const capabilityCommitment = `sha256:${'1'.repeat(64)}`;
  const input = {
    handoffVersion: 1,
    origin: 'https://service.example',
    selection: {
      offerId: 'offer.external-holder.reference',
      offerVersion: 1,
      holderId: 'holder.external.reference',
      capabilityCommitment,
    },
    challenge,
    expiresAtMs: 2_000_000_001_000,
  };
  const expected = Buffer.from(
    'zenon-x402-service-credit-external-holder-grant-descriptor-handoff-v1\0'
      + '{"challenge":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",'
      + '"expiresAtMs":2000000001000,"handoffVersion":1,'
      + '"origin":"https://service.example","selection":{'
      + `"capabilityCommitment":"${capabilityCommitment}",`
      + '"holderId":"holder.external.reference",'
      + '"offerId":"offer.external-holder.reference","offerVersion":1}}',
    'utf8',
  );

  assert.deepEqual(
    createServiceCreditExternalHolderGrantDescriptorSigningBytes(input),
    expected,
  );
});

test('a successful challenge is one-use and the next challenge is fresh', () => {
  const context = fixture();
  const first = context.handoff.issueChallenge();
  const redemption = signedRedemption(first, context);
  context.handoff.redeem(redemption);
  assertUnavailable(() => context.handoff.redeem(redemption));
  assert.equal(context.state.descriptorReads, 1);

  const second = context.handoff.issueChallenge();
  assert.notEqual(second.challenge, first.challenge);
  assert.equal(second.handoffVersion, first.handoffVersion);
  assert.equal(second.expiresAtMs, first.expiresAtMs);
  context.handoff.close();
});

test('wrong keys and bad signatures fail identically before the privileged read', async t => {
  await t.test('wrong key', () => {
    const context = fixture();
    const challenge = context.handoff.issueChallenge();
    const otherKeys = keyMaterial();
    assertUnavailable(() => context.handoff.redeem(signedRedemption(challenge, context, {
      signingKeys: otherKeys,
    })));
    assert.equal(context.state.descriptorReads, 0);
  });

  await t.test('bad signature', () => {
    const context = fixture();
    const challenge = context.handoff.issueChallenge();
    const redemption = signedRedemption(challenge, context, {
      signature: Buffer.alloc(64).toString('base64url'),
    });
    assertUnavailable(() => context.handoff.redeem(redemption));
    assert.equal(context.state.descriptorReads, 0);
  });

  await t.test('noncanonical public key', () => {
    const context = fixture();
    const challenge = context.handoff.issueChallenge();
    const redemption = signedRedemption(challenge, context);
    redemption.publicKey = `${redemption.publicKey}=`;
    assertUnavailable(() => context.handoff.redeem(redemption));
    assert.equal(context.state.descriptorReads, 0);
  });
});

test('wrong origin or fixed selection signing fails without privileged disclosure', async t => {
  const changes = [
    ['origin', context => ({ signingOrigin: 'https://other.example' })],
    ['offer', context => ({
      signingSelection: { ...context.selection, offerId: 'offer.external-holder.other' },
    })],
    ['offer version', context => ({
      signingSelection: { ...context.selection, offerVersion: 2 },
    })],
    ['holder', context => ({
      signingSelection: { ...context.selection, holderId: 'holder.external.other' },
    })],
    ['commitment', context => ({
      signingSelection: {
        ...context.selection,
        capabilityCommitment: `sha256:${'0'.repeat(64)}`,
      },
    })],
  ];

  for (const [name, change] of changes) await t.test(name, () => {
    const context = fixture();
    const issued = context.handoff.issueChallenge();
    assertUnavailable(() => context.handoff.redeem(
      signedRedemption(issued, context, change(context)),
    ));
    assert.equal(context.state.descriptorReads, 0);
    assertUnavailable(() => context.handoff.redeem(signedRedemption(issued, context)));
  });
});

test('expiry burns the exact challenge without a privileged read or retry', () => {
  const context = fixture();
  const challenge = context.handoff.issueChallenge();
  const redemption = signedRedemption(challenge, context);
  context.state.now = challenge.expiresAtMs;
  assertUnavailable(() => context.handoff.redeem(redemption));
  assertUnavailable(() => context.handoff.redeem(redemption));
  assert.equal(context.state.descriptorReads, 0);

  const next = context.handoff.issueChallenge();
  assert.notEqual(next.challenge, challenge.challenge);
  context.handoff.close();
});

test('expiry reached by the trusted owner read discloses nothing and burns the challenge', () => {
  const context = fixture();
  const challenge = context.handoff.issueChallenge();
  const redemption = signedRedemption(challenge, context);
  let nowReadsInsideOwner = null;
  context.state.reenter = () => {
    nowReadsInsideOwner = context.state.nowReads;
    context.state.now = challenge.expiresAtMs;
  };
  let disclosed;

  assertUnavailable(() => { disclosed = context.handoff.redeem(redemption); });
  assert.equal(disclosed, undefined);
  assert.equal(context.state.descriptorReads, 1);
  assert.notEqual(nowReadsInsideOwner, null);
  assert.equal(context.state.nowReads > nowReadsInsideOwner, true);
  const nowReadsAfterRejection = context.state.nowReads;
  assertUnavailable(() => context.handoff.redeem(redemption));
  assert.equal(context.state.descriptorReads, 1);
  assert.equal(context.state.nowReads, nowReadsAfterRejection);
});

test('concurrent issue preserves the pending challenge and concurrent redeem has one winner', async () => {
  const context = fixture();
  const challenge = context.handoff.issueChallenge();
  assertUnavailable(() => context.handoff.issueChallenge());
  const redemption = signedRedemption(challenge, context);
  const results = await Promise.allSettled([
    Promise.resolve().then(() => context.handoff.redeem(redemption)),
    Promise.resolve().then(() => context.handoff.redeem(redemption)),
  ]);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected']);
  assert.equal(results[1].reason.code, UNAVAILABLE);
  assert.equal(context.state.descriptorReads, 1);
});

test('reentrant issue is unavailable while a verified redemption owns the operation', () => {
  const context = fixture();
  let reentrantFailures = 0;
  context.state.reenter = () => {
    assertUnavailable(() => context.handoff.issueChallenge());
    reentrantFailures += 1;
  };
  const challenge = context.handoff.issueChallenge();
  const descriptor = context.handoff.redeem(signedRedemption(challenge, context));
  assert.equal(descriptor.grantId, GRANT_ID);
  assert.equal(reentrantFailures, 1);
  assert.equal(context.state.descriptorReads, 1);
});

test('pre-ACTIVE and malformed owner results use the same sanitized failure', async t => {
  await t.test('pre-ACTIVE', () => {
    const context = fixture({ phase: 'NEW' });
    const challenge = context.handoff.issueChallenge();
    assertUnavailable(() => context.handoff.redeem(signedRedemption(challenge, context)));
    assert.equal(context.state.descriptorReads, 1);
  });

  await t.test('wrong commitment', () => {
    const context = fixture({ ownerDescriptor: Object.freeze({
      grantId: GRANT_ID,
      capabilityCommitment: `sha256:${'0'.repeat(64)}`,
    }) });
    const challenge = context.handoff.issueChallenge();
    assertUnavailable(() => context.handoff.redeem(signedRedemption(challenge, context)));
    assert.equal(context.state.descriptorReads, 1);
  });

  await t.test('full grant', () => {
    const keys = keyMaterial();
    const selection = selectedHolder(keys.publicKey);
    const context = fixture({
      keys,
      selection,
      ownerDescriptor: Object.freeze({
        grantId: GRANT_ID,
        capabilityCommitment: selection.capabilityCommitment,
        payer: 'synthetic-payer',
      }),
    });
    const challenge = context.handoff.issueChallenge();
    assertUnavailable(() => context.handoff.redeem(signedRedemption(challenge, context)));
    assert.equal(context.state.descriptorReads, 1);
  });
});

test('close clears an outstanding challenge and is final', () => {
  const context = fixture();
  const challenge = context.handoff.issueChallenge();
  const redemption = signedRedemption(challenge, context);
  assert.equal(context.handoff.close(), undefined);
  assert.equal(context.handoff.close(), undefined);
  assertUnavailable(() => context.handoff.redeem(redemption));
  assertUnavailable(() => context.handoff.issueChallenge());
  assert.equal(context.state.descriptorReads, 0);
});

test('malformed, proxy, and accessor attempts are rejected without evaluation or effects', async t => {
  let getterCalls = 0;
  const cases = [
    ['extra field', (redemption) => ({ ...redemption, grantId: GRANT_ID })],
    ['proxy', redemption => new Proxy(redemption, {
      ownKeys() { throw new Error('synthetic-private-detail'); },
    })],
    ['outer accessor', redemption => {
      const candidate = { ...redemption };
      Object.defineProperty(candidate, 'signature', {
        enumerable: true,
        get() { getterCalls += 1; throw new Error('synthetic-private-detail'); },
      });
      return candidate;
    }],
    ['challenge proxy', redemption => ({
      ...redemption,
      challenge: new Proxy(redemption.challenge, {}),
    })],
    ['challenge accessor', redemption => {
      const challenge = { ...redemption.challenge };
      Object.defineProperty(challenge, 'expiresAtMs', {
        enumerable: true,
        get() { getterCalls += 1; throw new Error('synthetic-private-detail'); },
      });
      return { ...redemption, challenge };
    }],
  ];

  for (const [name, mutate] of cases) await t.test(name, () => {
    const context = fixture();
    const challenge = context.handoff.issueChallenge();
    const valid = signedRedemption(challenge, context);
    assertUnavailable(() => context.handoff.redeem(mutate(valid)));
    assertUnavailable(() => context.handoff.redeem(valid));
    assert.equal(context.state.descriptorReads, 0);
  });
  assert.equal(getterCalls, 0);
});

test('construction and signing use strict bounded canonical schemas', () => {
  const keys = keyMaterial();
  const selection = selectedHolder(keys.publicKey);
  const base = {
    origin: ORIGIN,
    selection,
    challengeLifetimeMs: LIFETIME_MS,
    now: Object.freeze(() => NOW),
    getActiveGrantDescriptorForSelection: Object.freeze(() => Object.freeze({
      grantId: GRANT_ID,
      capabilityCommitment: selection.capabilityCommitment,
    })),
  };
  for (const origin of [
    'http://service.example',
    'https://service.example/',
    'https://service.example/path',
    'https://service.example:443',
    'https://SERVICE.example',
  ]) assertError(
    () => createServiceCreditExternalHolderGrantDescriptorHandoff({ ...base, origin }),
    INVALID_CONFIGURATION,
  );
  for (const challengeLifetimeMs of [
    0,
    SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_MAX_CHALLENGE_LIFETIME_MS + 1,
  ]) assertError(
    () => createServiceCreditExternalHolderGrantDescriptorHandoff({
      ...base,
      challengeLifetimeMs,
    }),
    INVALID_CONFIGURATION,
  );
  assertError(
    () => createServiceCreditExternalHolderGrantDescriptorHandoff({
      ...base,
      selection: { ...selection, extra: true },
    }),
    INVALID_CONFIGURATION,
  );
  assertError(
    () => createServiceCreditExternalHolderGrantDescriptorHandoff(
      new Proxy(base, { ownKeys() { throw new Error('synthetic-private-detail'); } }),
    ),
    INVALID_CONFIGURATION,
  );

  const context = fixture();
  const challenge = context.handoff.issueChallenge();
  const message = signingMessage(challenge, context.origin, context.selection);
  assertError(
    () => createServiceCreditExternalHolderGrantDescriptorSigningBytes(challenge),
    INVALID_INPUT,
  );
  const accessor = { ...message };
  let getterCalls = 0;
  Object.defineProperty(accessor, 'origin', {
    enumerable: true,
    get() { getterCalls += 1; throw new Error('synthetic-private-detail'); },
  });
  assertError(
    () => createServiceCreditExternalHolderGrantDescriptorSigningBytes(accessor),
    INVALID_INPUT,
  );
  assertError(
    () => createServiceCreditExternalHolderGrantDescriptorSigningBytes(
      new Proxy(message, {}),
    ),
    INVALID_INPUT,
  );
  assert.equal(getterCalls, 0);
  context.handoff.close();
});
