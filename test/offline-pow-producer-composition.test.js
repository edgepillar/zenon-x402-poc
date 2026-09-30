import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as sdk from 'znn-typescript-sdk';

import { composeOfflinePreparationTrace } from
  '../src/zenon/internal/offline-observation-to-preparation-contract.js';
import { composeOfflinePreparationWithNonceProof } from
  '../src/zenon/internal/offline-preparation-nonce-contract.js';
import { produceOfflineZenonNonce } from
  '../src/zenon/internal/offline-pow-producer-owner.js';
import { prepareUnsignedZenonPaymentBlock } from
  '../src/zenon/internal/pre-sign-account-block-preparation.js';

const REJECTION_CODE = 'offline_preparation_nonce_contract_rejected';
const PLACEHOLDER_NONCE = '0'.repeat(16);
const POW_RANGE = 1n << 64n;
const PAYER_PUBLIC_KEY_BYTES = Buffer.alloc(32, 0x11);
const RECIPIENT_PUBLIC_KEY_BYTES = Buffer.alloc(32, 0x22);
const OTHER_RECIPIENT_PUBLIC_KEY_BYTES = Buffer.alloc(32, 0x33);
const PAYER_CORE = Buffer.concat([
  Buffer.alloc(1),
  sha3(PAYER_PUBLIC_KEY_BYTES).subarray(0, 19),
]);
const PAYER = sdk.Address.fromPublicKey(PAYER_PUBLIC_KEY_BYTES).toString();
const RECIPIENT = sdk.Address.fromPublicKey(RECIPIENT_PUBLIC_KEY_BYTES).toString();
const OTHER_RECIPIENT = sdk.Address.fromPublicKey(
  OTHER_RECIPIENT_PUBLIC_KEY_BYTES,
).toString();
const PUBLIC_KEY = PAYER_PUBLIC_KEY_BYTES.toString('base64');
const DATA = sha3(Buffer.from('offline-pow-composition-data')).toString('base64');
const OTHER_DATA = sha3(
  Buffer.from('offline-pow-composition-other-data'),
).toString('base64');
const ACCOUNT_HASH = sha3(
  Buffer.from('offline-pow-composition-account'),
).toString('hex');
const OTHER_ACCOUNT_HASH = sha3(
  Buffer.from('offline-pow-composition-other-account'),
).toString('hex');
const MOMENTUM_HASH = sha3(
  Buffer.from('offline-pow-composition-momentum'),
).toString('hex');
const OTHER_MOMENTUM_HASH = sha3(
  Buffer.from('offline-pow-composition-other-momentum'),
).toString('hex');
const EXPECTED_TRUST = Object.freeze({
  sourceAuthentication: 'NOT_ESTABLISHED',
  chainAuthentication: 'NOT_ESTABLISHED',
  canonicality: 'NOT_ESTABLISHED',
  finality: 'NOT_ESTABLISHED',
  liveFreshness: 'NOT_ESTABLISHED',
  signingAuthorization: 'NOT_ESTABLISHED',
});
const EXPECTED_SUCCESS_LIFECYCLE = Object.freeze({
  status: 'COMPLETED',
  attemptCount: 1,
  ready: 'OBSERVED',
  wrapperInvocation: 'JS_WRAPPER_INVOKED',
  nativeOrWasmEntry: 'NOT_ESTABLISHED',
  terminal: 'SUCCESS',
  processExit: 'ZERO',
  processClose: 'OBSERVED',
  stdioClose: 'OBSERVED',
  termination: 'NOT_REQUESTED',
  retry: 'NOT_PERFORMED',
  networkBoundary: 'TRUSTED_ARTIFACT_JS_DENIAL_FACADE_NOT_OS_SANDBOX',
});

let producerInvocationCount = 0;

function sha3(value) {
  return createHash('sha3-256').update(value).digest();
}

function syntheticManifest() {
  return {
    payer: PAYER,
    publicKey: PUBLIC_KEY,
    intent: {
      toAddress: RECIPIENT,
      amount: '42',
      tokenStandard: sdk.ZNN_ZTS.toString(),
      data: DATA,
    },
    context: {
      chainIdentifier: 1,
      networkIdentifier: 'synthetic-network-v1',
      profileIdentifier: 'synthetic-profile-v1',
      epochIdentifier: 'synthetic-epoch-v1',
    },
    trustLabel: 'synthetic-recorded',
  };
}

function syntheticTrace() {
  const expectedManifest = syntheticManifest();
  const account = { address: PAYER, height: 7, hash: ACCOUNT_HASH };
  const momentum = {
    chainIdentifier: 1,
    height: 42,
    hash: MOMENTUM_HASH,
    version: 1,
  };
  return {
    phase: 'UNSIGNED',
    expectedManifest,
    capturedTrace: {
      manifest: structuredClone(expectedManifest),
      quoteRequest: {
        address: PAYER,
        blockType: 2,
        toAddress: RECIPIENT,
        data: DATA,
      },
      accountFrontierBefore: account,
      accountFrontierAfter: { ...account },
      momentumBefore: momentum,
      rpcObservation: {
        availablePlasma: 0,
        basePlasma: 1,
        requiredDifficulty: 2,
      },
      momentumAfter: { ...momentum },
      nonceRecord: {
        nonce: PLACEHOLDER_NONCE,
        payer: PAYER,
        previousAccountHash: ACCOUNT_HASH,
        difficulty: 2,
      },
    },
  };
}

function independentPredicate(scope, nonce) {
  const domain = sha3(Buffer.concat([
    PAYER_CORE,
    Buffer.from(scope.previousAccountHash, 'hex'),
  ]));
  const work = sha3(Buffer.concat([
    Buffer.from(nonce, 'hex'),
    domain,
  ]));
  const observed = work.readBigUInt64LE(0);
  const threshold = POW_RANGE - (POW_RANGE / BigInt(scope.difficulty));
  return observed >= threshold;
}

function sameScope(left, right) {
  return left.payer === right.payer &&
    left.previousAccountHash === right.previousAccountHash &&
    left.difficulty === right.difficulty;
}

function assertScopeEqual(left, right, label) {
  assert.equal(sameScope(left, right), true, label);
}

function assertRejected(trace, label) {
  let classification = 'NOT_REJECTED';
  try {
    composeOfflinePreparationWithNonceProof(trace);
  } catch (error) {
    classification = error instanceof TypeError && error.code === REJECTION_CODE
      ? 'EXPECTED_REJECTION'
      : 'UNEXPECTED_REJECTION';
  }
  assert.equal(classification, 'EXPECTED_REJECTION', label);
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, 'result graph is deeply frozen');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.hasOwn(descriptor, 'value')) assertDeepFrozen(descriptor.value, seen);
  }
}

function containsFunction(value, seen = new Set()) {
  if (typeof value === 'function') return true;
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).some(key => containsFunction(value[key], seen));
}

function assertNoAuthorityClaims(value) {
  for (const field of [
    'signer', 'wallet', 'rpc', 'runtime', 'capability', 'authorization',
    'freshness', 'replayProtected', 'chainIdentity', 'publish', 'submit',
  ]) {
    assert.equal(field in value, false, `${field} authority remains absent`);
  }
}

function attachProducedNonce(trace, scope, nonce) {
  trace.capturedTrace.nonceRecord = {
    nonce,
    payer: scope.payer,
    previousAccountHash: scope.previousAccountHash,
    difficulty: scope.difficulty,
  };
  return trace;
}

function changedIntentAndContext(trace) {
  for (const manifest of [trace.expectedManifest, trace.capturedTrace.manifest]) {
    manifest.intent.toAddress = OTHER_RECIPIENT;
    manifest.intent.amount = '43';
    manifest.intent.tokenStandard = sdk.QSR_ZTS.toString();
    manifest.intent.data = OTHER_DATA;
    manifest.context.chainIdentifier = 2;
    manifest.context.networkIdentifier = 'synthetic-network-v2';
    manifest.context.profileIdentifier = 'synthetic-profile-v2';
    manifest.context.epochIdentifier = 'synthetic-epoch-v2';
  }
  trace.capturedTrace.quoteRequest.toAddress = OTHER_RECIPIENT;
  trace.capturedTrace.quoteRequest.data = OTHER_DATA;
  trace.capturedTrace.momentumBefore.chainIdentifier = 2;
  trace.capturedTrace.momentumAfter.chainIdentifier = 2;
  return trace;
}

after(() => {
  assert.equal(producerInvocationCount, 1, 'the production API is invoked exactly once');
});

test('one real child result composes with the frozen offline preparation contract',
  { concurrency: false }, async (t) => {
    let shared;

    await t.test(
      'one production attempt proves the ordered wrapper lifecycle and composition',
      async () => {
        const stagedTrace = syntheticTrace();
        const staged = composeOfflinePreparationTrace(stagedTrace);
        const stagedPreparation = prepareUnsignedZenonPaymentBlock(
          staged.preparationInput,
        );
        const originalScope = Object.freeze({
          payer: stagedPreparation.block.address,
          previousAccountHash: stagedPreparation.block.previousHash,
          difficulty: stagedPreparation.block.difficulty,
        });

        assert.equal(staged.compatibility.classification, 'PRE_DP');
        assert.equal(staged.trust.nonceProof, 'NOT_VERIFIED');
        assert.equal(stagedPreparation.classification, 'PRE_DP');
        assert.equal(stagedPreparation.block.difficulty, 2);
        assert.equal(stagedPreparation.block.signature, '');

        assert.equal(producerInvocationCount, 0, 'no earlier production attempt');
        producerInvocationCount += 1;
        const produced = await produceOfflineZenonNonce({ ...originalScope });

        const positiveTrace = attachProducedNonce(
          structuredClone(stagedTrace),
          originalScope,
          produced.nonce,
        );
        const composed = composeOfflinePreparationWithNonceProof(positiveTrace);
        const reusableTrace = structuredClone(positiveTrace);

        assert.equal(produced.qualification, 'OFFLINE_NONCE_PRODUCER_ONLY');
        assert.equal(produced.status, 'VALID');
        assert.equal(/^[0-9a-f]{16}$/.test(produced.nonce), true,
          'the candidate is canonical');
        assertScopeEqual(produced.recordedProofScope, originalScope,
          'producer scope equals the original prepared scope');
        assert.deepEqual(produced.lifecycle, EXPECTED_SUCCESS_LIFECYCLE);
        assert.deepEqual(produced.trust, EXPECTED_TRUST);
        assert.equal(independentPredicate(originalScope, produced.nonce), true,
          'the independent chain-style predicate is valid');

        assert.equal(composed.qualification, 'OFFLINE_PREPARATION_NONCE_ONLY');
        assert.equal(composed.preparation.classification, 'PRE_DP');
        assert.equal(composed.preparation.block.signature, '');
        assert.equal(composed.nonceProof.status, 'VALID');
        assert.equal(
          composed.preparation.block.nonce === produced.nonce,
          true,
          'prepared block retains the produced candidate',
        );
        assertScopeEqual(positiveTrace.capturedTrace.nonceRecord, originalScope,
          'recorded trace scope equals the original prepared scope');
        assertScopeEqual({
          payer: composed.preparation.block.address,
          previousAccountHash: composed.preparation.block.previousHash,
          difficulty: composed.preparation.block.difficulty,
        }, originalScope, 'composed block scope equals the original prepared scope');
        assertScopeEqual(composed.nonceProof.recordedProofScope, originalScope,
          'verified predicate scope equals the original prepared scope');
        assert.deepEqual(composed.trust, EXPECTED_TRUST);
        assert.deepEqual(composed.nonceProof.trust, EXPECTED_TRUST);
        assertNoAuthorityClaims(produced);
        assertNoAuthorityClaims(composed);
        assert.equal(containsFunction(produced), false);
        assert.equal(containsFunction(composed), false);
        assertDeepFrozen(produced);
        assertDeepFrozen(composed);
        assert.equal(produced.recordedProofScope !== originalScope, true,
          'producer scope is detached');
        assert.equal(composed.preparation !== stagedPreparation, true,
          'composition is detached from staged preparation');
        assert.equal(composed.recordedContext !== positiveTrace.expectedManifest.context,
          true, 'recorded context is detached');

        positiveTrace.expectedManifest.intent.amount = '99';
        positiveTrace.capturedTrace.manifest.intent.amount = '99';
        assert.equal(composed.preparation.block.amount === '42', true,
          'composition remains detached from later trace mutation');

        shared = Object.freeze({
          originalScope,
          produced,
          composed,
          reusableTrace,
        });
      },
    );

    if (shared === undefined) return;

    await t.test('the same candidate rejects exact recorded-scope mismatches', () => {
      const mutations = [
        value => { value.capturedTrace.nonceRecord.payer = OTHER_RECIPIENT; },
        value => {
          value.capturedTrace.nonceRecord.previousAccountHash = OTHER_ACCOUNT_HASH;
        },
        value => { value.capturedTrace.nonceRecord.difficulty = 3; },
      ];
      for (const mutate of mutations) {
        const variation = structuredClone(shared.reusableTrace);
        mutate(variation);
        assertRejected(variation, 'recorded proof binding mismatch rejects');
      }
      assert.equal(producerInvocationCount, 1, 'negative cases reuse one candidate');
    });

    await t.test('the same candidate rejects stale before and after snapshots', () => {
      const mutations = [
        value => { value.capturedTrace.accountFrontierBefore.height -= 1; },
        value => {
          value.capturedTrace.accountFrontierAfter.hash = OTHER_ACCOUNT_HASH;
        },
        value => { value.capturedTrace.momentumBefore.height -= 1; },
        value => {
          value.capturedTrace.momentumAfter.hash = OTHER_MOMENTUM_HASH;
        },
      ];
      for (const mutate of mutations) {
        const variation = structuredClone(shared.reusableTrace);
        mutate(variation);
        assertRejected(variation, 'stale recorded snapshots reject');
      }
      assert.equal(producerInvocationCount, 1, 'stale cases reuse one candidate');
    });

    await t.test(
      'locally consistent changed intent and context can retain work but alter hash',
      () => {
        const changedTrace = changedIntentAndContext(
          structuredClone(shared.reusableTrace),
        );
        const changed = composeOfflinePreparationWithNonceProof(changedTrace);

        assert.equal(changed.nonceProof.status, 'VALID');
        assertScopeEqual(
          changed.nonceProof.recordedProofScope,
          shared.originalScope,
          'changed intent retains the same predicate scope',
        );
        assert.equal(
          changed.preparation.block.nonce === shared.produced.nonce,
          true,
          'changed intent reuses the same candidate',
        );
        assert.equal(
          changed.preparation.block.hash !== shared.composed.preparation.block.hash,
          true,
          'changed intent produces a different unsigned block hash',
        );
        assert.equal(changed.recordedContext.chainIdentifier === 2, true,
          'changed synthetic context is recorded');
        assert.deepEqual(changed.trust, EXPECTED_TRUST);
        assertNoAuthorityClaims(changed);
        assertDeepFrozen(changed);
        assert.equal(producerInvocationCount, 1,
          'changed intent reuses one candidate');
      },
    );

    await t.test('qualification remains predicate-only and PRE_DP-only', () => {
      assert.equal(shared.composed.preparation.classification, 'PRE_DP');
      assert.equal(shared.produced.lifecycle.nativeOrWasmEntry, 'NOT_ESTABLISHED');
      assert.equal(
        shared.produced.lifecycle.networkBoundary,
        'TRUSTED_ARTIFACT_JS_DENIAL_FACADE_NOT_OS_SANDBOX',
      );
      assert.equal('replayProtected' in shared.composed, false);
      assert.equal('chainAuthenticated' in shared.composed, false);
      assert.equal('signingReady' in shared.composed, false);
      assert.equal('liveQualified' in shared.composed, false);
      assert.equal(producerInvocationCount, 1, 'no retry is performed');
    });
  });
