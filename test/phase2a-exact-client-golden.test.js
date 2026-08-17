import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';
import * as sdk from 'znn-typescript-sdk';
import {
  ACCOUNT_BLOCK_HASH_PREIMAGE_BYTES,
  accountBlockHashHex,
  accountBlockHashPreimage,
} from '../test-support/phase2a-account-block-preimage.js';
import {
  PHASE2A_ORACLE,
  runPhase2AIsolated,
} from '../test-support/phase2a-sdk-harness.js';

ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));

// The filename is stable; schemaVersion, rather than the filename, governs the
// manifest format.
const FIXTURE_PATH = new URL('./fixtures/phase2a-exact-client-goldens.v1.json', import.meta.url);
const PACKAGE_LOCK_PATH = new URL('../package-lock.json', import.meta.url);
const INSTALLED_SDK_PACKAGE_PATH = new URL('../node_modules/znn-typescript-sdk/package.json', import.meta.url);
const ACCOUNT_BLOCK_FIELDS = Object.freeze([
  'version',
  'chainIdentifier',
  'blockType',
  'hash',
  'previousHash',
  'height',
  'momentumAcknowledged',
  'address',
  'toAddress',
  'amount',
  'tokenStandard',
  'fromBlockHash',
  'data',
  'fusedPlasma',
  'difficulty',
  'nonce',
  'publicKey',
  'signature',
]);
const BLOCK_STAGE_KEYS = Object.freeze([
  'sendReturn',
  'prepareEntry',
  'frontierAccountEntry',
  'preparationMomentumEntry',
  'plasmaEntry',
  'powProviderEntry',
  'signEntry',
  'prepareReturn',
  'beforeProductionClear',
  'afterProductionClear',
]);
const EMPTY_HASH = '0'.repeat(64);
const ZERO_PUBLIC_KEY_BASE64 = Buffer.alloc(32).toString('base64');
const EXPECTED_RESTORATION = Object.freeze({
  singletonDescriptorExact: true,
  staticDescriptorsExact: true,
  instanceDescriptorsExact: true,
  keyStoreDescriptorsExact: true,
  keyPairDescriptorsExact: true,
  templateDescriptorsExact: true,
  globalFetchDescriptorExact: true,
  environmentExact: true,
});
const EXACT_ANCHORS = Object.freeze({
  A: Object.freeze({
    transactionHash: '3651e34186505ad83d8831495cc8f860318e06d082fc985504f30f83268a6948',
    paymentSignatureHeaderSha256: '624ee2f50f8e6a6f861c70efff58cf103640ca4e150afea2e337dfe249dec155',
  }),
  B: Object.freeze({
    transactionHash: 'e25e430bb7b31ec1c65e46b4a6b10555962acb59f6ba12559f25931891fc7119',
    paymentSignatureHeaderSha256: '848886a834b2e4145c9aceebb5cb6f439d936700bd25ccdcf94eb2e9ebb97b7d',
  }),
  C: Object.freeze({
    transactionHash: 'bb7f5f1d71470417a01c806039bd59d359cc484e601cf18ca2b963c063c1daf1',
    paymentSignatureHeaderSha256: '7b58e9e9d3d40b33b5e7ef129193bed47e875fef98e5b79a93a6caaf88fa88dd',
  }),
});

function parseJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertAllBooleanFactsTrue(facts, label) {
  for (const [field, value] of Object.entries(facts)) {
    if (typeof value === 'boolean') assert.equal(value, true, `${label}.${field}`);
  }
}

function traceEventAt(trace, sequence) {
  const event = trace[sequence - 1];
  assert.equal(event?.sequence, sequence, `missing execution event ${sequence}`);
  return event;
}

function assertOrderedOperations(trace, expectedOperations) {
  let cursor = -1;
  for (const operation of expectedOperations) {
    cursor = trace.findIndex((entry, index) => index > cursor && entry.operation === operation);
    assert.notEqual(cursor, -1, `missing or out-of-order operation ${operation}`);
  }
}

function assertSuccessfulLifecycle(captured, accountIndex) {
  assert.deepEqual(captured.lifecycle, {
    constructorTemporaryPairs: 1,
    operationPairs: 1,
    temporary: {
      index: 0,
      productionClearAttempts: 0,
      productionClearOutcome: 'not-called',
      privateNonzeroBeforeProductionClear: null,
      publicNonzeroBeforeProductionClear: null,
      privateNonzeroAfterProductionClear: null,
      publicNonzeroAfterProductionClear: null,
      privateNonzeroBeforeHarnessTeardown: true,
      publicNonzeroBeforeHarnessTeardown: true,
      harnessTeardownWipeAttempts: 0,
    },
    operation: {
      index: accountIndex,
      productionClearAttempts: 1,
      productionClearOutcome: 'returned',
      privateNonzeroBeforeProductionClear: true,
      publicNonzeroBeforeProductionClear: true,
      privateNonzeroAfterProductionClear: false,
      publicNonzeroAfterProductionClear: false,
      privateNonzeroBeforeHarnessTeardown: false,
      publicNonzeroBeforeHarnessTeardown: false,
      harnessTeardownWipeAttempts: 0,
    },
    connectionClearCalls: 1,
    clientOwnAfterProduction: true,
    clientUndefinedAfterProduction: true,
    publicationCalls: 0,
    networkTripwireCalls: 0,
    fetchCalls: 2,
  });
  assert.deepEqual(captured.harnessCleanupFacts, {
    pairWipes: [
      {
        role: 'constructor-temporary',
        index: 0,
        harnessTeardownWipeAttempts: 1,
        privateZeroAfterHarnessTeardown: true,
        publicZeroAfterHarnessTeardown: true,
      },
      {
        role: 'operation',
        index: accountIndex,
        harnessTeardownWipeAttempts: 1,
        privateZeroAfterHarnessTeardown: true,
        publicZeroAfterHarnessTeardown: true,
      },
    ],
    allSensitiveBuffersZeroAfterHarnessTeardown: true,
  });
}

function assertStageEvent(trace, stage, snapshot) {
  assert.ok(snapshot, `missing ${stage} snapshot`);
  assert.deepEqual(traceEventAt(trace, snapshot.sequence), {
    sequence: snapshot.sequence,
    category: 'block-stage',
    operation: `block-stage.${stage}`,
  });
  assert.deepEqual(Object.keys(snapshot.block), ACCOUNT_BLOCK_FIELDS);
}

function assertBlockStages(id, captured, transaction) {
  const stages = captured.blockStageSnapshots;
  const trace = captured.observedExecutionTrace;
  assert.deepEqual(Object.keys(stages), BLOCK_STAGE_KEYS);

  for (const stage of BLOCK_STAGE_KEYS) {
    if (stage === 'powProviderEntry' && id !== 'C') {
      assert.equal(stages[stage], null);
    } else {
      assertStageEvent(trace, stage, stages[stage]);
    }
  }

  const send = stages.sendReturn.block;
  assert.deepEqual(send, {
    version: 1,
    chainIdentifier: transaction.chainIdentifier,
    blockType: sdk.BlockTypeEnum.UserSend,
    hash: EMPTY_HASH,
    previousHash: EMPTY_HASH,
    height: 0,
    momentumAcknowledged: { hash: EMPTY_HASH, height: 0 },
    address: sdk.EMPTY_ADDRESS.toString(),
    toAddress: transaction.toAddress,
    amount: transaction.amount,
    tokenStandard: transaction.tokenStandard,
    fromBlockHash: EMPTY_HASH,
    data: '',
    fusedPlasma: 0,
    difficulty: 0,
    nonce: '',
    publicKey: '',
    signature: '',
  });

  assert.deepEqual(stages.prepareEntry.block, {
    ...send,
    data: transaction.data,
  });
  assert.deepEqual(stages.frontierAccountEntry.block, {
    ...stages.prepareEntry.block,
    address: transaction.address,
    publicKey: transaction.publicKey,
  });

  // SDK 1.0.5 fetches both frontier values before applying either result.
  assert.deepEqual(
    stages.preparationMomentumEntry.block,
    stages.frontierAccountEntry.block,
  );
  assert.deepEqual(stages.plasmaEntry.block, {
    ...stages.preparationMomentumEntry.block,
    previousHash: transaction.previousHash,
    height: transaction.height,
    momentumAcknowledged: transaction.momentumAcknowledged,
  });

  let beforeSign = stages.plasmaEntry.block;
  if (id === 'C') {
    assert.deepEqual(stages.powProviderEntry.block, {
      ...stages.plasmaEntry.block,
      fusedPlasma: transaction.fusedPlasma,
      difficulty: transaction.difficulty,
    });
    assert.equal(stages.powProviderEntry.block.nonce, '');
    beforeSign = stages.powProviderEntry.block;
  }
  assert.deepEqual(stages.signEntry.block, {
    ...beforeSign,
    hash: transaction.hash,
    fusedPlasma: transaction.fusedPlasma,
    difficulty: transaction.difficulty,
    nonce: transaction.nonce,
  });
  assert.equal(stages.signEntry.block.signature, '');
  assert.deepEqual(stages.prepareReturn.block, transaction);
  assert.deepEqual(stages.beforeProductionClear.block, transaction);
  assert.equal(stages.afterProductionClear.clearOutcome, 'returned');
  assert.deepEqual(stages.afterProductionClear.block, {
    ...transaction,
    publicKey: ZERO_PUBLIC_KEY_BASE64,
  });

  const orderedStageSequences = BLOCK_STAGE_KEYS
    .map(stage => stages[stage]?.sequence)
    .filter(sequence => sequence !== undefined && sequence !== null);
  assert.deepEqual(
    [...orderedStageSequences].sort((left, right) => left - right),
    orderedStageSequences,
  );

  const payloadStages = captured.payloadTransactionSnapshots;
  assert.deepEqual(Object.keys(payloadStages), [
    'productionToJson',
    'beforeProductionClear',
    'afterProductionClear',
  ]);
  assert.deepEqual(payloadStages.productionToJson.transaction, transaction);
  assert.deepEqual(payloadStages.beforeProductionClear.transaction, transaction);
  assert.deepEqual(payloadStages.afterProductionClear.transaction, transaction);
  assert.equal(payloadStages.beforeProductionClear.sequence, stages.beforeProductionClear.sequence);
  assert.equal(payloadStages.afterProductionClear.sequence, stages.afterProductionClear.sequence);
  assert.equal(
    traceEventAt(trace, payloadStages.productionToJson.sequence).operation,
    'AccountBlockTemplate.toJson',
  );
}

function assertUnifiedTrace(id, captured, transaction) {
  const trace = captured.observedExecutionTrace;
  assert.ok(trace.length > 0);
  assert.deepEqual(trace.map(entry => entry.sequence),
    Array.from({ length: trace.length }, (_, index) => index + 1));

  const requiredOrder = [
    'fetch.initial',
    'Zenon.setNetworkID',
    'Zenon.getInstance',
    'zenon.initialize',
    'stats.networkInfo',
    'stats.syncInfo',
    'ledger.getFrontierMomentum',
    'authenticateChainProfile',
    'Zenon.setChainID',
    ...(id === 'B' ? ['embedded.token.getByZts'] : []),
    'KeyStore.fromMnemonic',
    'KeyStore.getKeyPair',
    'KeyPair.getAddress',
    'KeyStore.getKeyPair',
    'AccountBlockTemplate.send.enter',
    'Zenon.getChainIdentifier',
    'block-stage.sendReturn',
    'Zenon.prepareBlock.enter',
    'block-stage.prepareEntry',
    'Zenon.getInstance',
    'KeyPair.getAddress',
    'KeyPair.getPublicKey',
    'ledger.getFrontierAccountBlock',
    'block-stage.frontierAccountEntry',
    'ledger.getFrontierMomentum',
    'block-stage.preparationMomentumEntry',
    'embedded.plasma.getRequiredPoWForAccountBlock',
    'block-stage.plasmaEntry',
    ...(id === 'C'
      ? ['Zenon.getPowProvider', 'Zenon.powProvider', 'block-stage.powProviderEntry']
      : []),
    'KeyPair.sign',
    'block-stage.signEntry',
    'block-stage.prepareReturn',
    'Zenon.prepareBlock.return',
    'AccountBlockTemplate.toJson',
    'KeyPair.clear.enter',
    'block-stage.beforeProductionClear',
    'block-stage.afterProductionClear',
    'Zenon.clearConnection',
    'ownerProbe.enter',
    'fetch.paid',
  ];
  assertOrderedOperations(trace, requiredOrder);

  for (const milestone of captured.sdkGlobalMilestones) {
    assert.deepEqual(traceEventAt(trace, milestone.sequence), milestone);
    assert.equal(milestone.category, 'sdk-global');
  }

  const apiTrace = captured.sdkApiRpcMethodBoundaryTrace;
  const expectedApiOperations = [
    'zenon.initialize',
    'stats.networkInfo',
    'stats.syncInfo',
    'ledger.getFrontierMomentum',
    ...(id === 'B' ? ['embedded.token.getByZts'] : []),
    'ledger.getFrontierAccountBlock',
    'ledger.getFrontierMomentum',
    'embedded.plasma.getRequiredPoWForAccountBlock',
  ];
  assert.deepEqual(apiTrace.map(entry => entry.operation), expectedApiOperations);
  for (const entry of apiTrace) {
    assert.equal(entry.layer, 'sdk-api-method-boundary');
    assert.equal(entry.wireEncodingObserved, false);
    assert.equal(entry.outcome, 'fulfilled');
    const observed = traceEventAt(trace, entry.sequence);
    assert.equal(observed.category, 'sdk-api');
    assert.equal(observed.operation, entry.operation);
    assert.equal(observed.phase, entry.phase);
  }

  const prepareTrace = captured.prepareBlockApiBoundaryTrace;
  assert.deepEqual(prepareTrace, apiTrace.filter(entry => entry.phase === 'prepare'));
  assert.deepEqual(prepareTrace.map(entry => entry.operation), [
    'ledger.getFrontierAccountBlock',
    'ledger.getFrontierMomentum',
    'embedded.plasma.getRequiredPoWForAccountBlock',
  ]);
  assert.deepEqual(prepareTrace[0].arguments, [transaction.address]);
  assert.deepEqual(prepareTrace[1].arguments, []);
  assert.deepEqual(prepareTrace[2].arguments, [{
    address: transaction.address,
    blockType: sdk.BlockTypeEnum.UserSend,
    toAddress: transaction.toAddress,
    data: transaction.data,
  }]);
}

function assertArgumentAndIdentityFacts(id, captured, transaction, intentDigest) {
  const facts = captured.argumentFacts;
  assert.equal(facts.frontierAddressType, 'object');
  assert.equal(facts.frontierAddressConstructor, 'Address');
  assert.equal(facts.frontierAddressIsSdkAddress, true);
  assert.equal(facts.frontierAddressIsPayerIdentity, true);
  assert.equal(facts.frontierAddressArguments, 1);
  assert.equal(facts.tokenType, 'object');
  assert.equal(facts.tokenConstructor, 'TokenStandard');
  assert.equal(facts.tokenIsSdkTokenStandard, true);
  assert.equal(facts.tokenLookupOccurred, id === 'B');
  assert.equal(facts.tokenLookupUsedExactTemplateToken, id === 'B' ? true : null);
  assert.equal(facts.powParamType, 'object');
  assert.equal(facts.powParamConstructor, 'GetRequiredPowParam');
  assert.equal(facts.powParamIsSdkGetRequiredPowParam, true);
  assert.equal(facts.powParamAddressIdentity, true);
  assert.equal(facts.powParamRecipientIdentity, true);
  assert.equal(facts.powParamDataIdentity, true);
  assert.equal(facts.powParamBlockType, sdk.BlockTypeEnum.UserSend);
  assert.equal(facts.powParamDataHex, intentDigest);
  assert.equal(facts.powParamAddressBytesHex, facts.frontierAddressBytesHex);
  assert.equal(facts.powParamRecipientBytesHex, facts.templateRecipientBytesHex);
  assert.equal(facts.readinessAndPreparationMomentumDiffer, true);
  assert.equal(facts.authenticatedSessionSingleton, true);
  assert.equal(facts.sdkGetInstanceCalls, 2);
  assert.equal(facts.sdkGetInstanceResultsSameSession, true);
  assert.equal(facts.templateTokenMatchesFixtureBytes, true);
  assert.equal(facts.templateRecipientIsSdkAddress, true);
  assert.equal(facts.sendRecipientIdentity, true);
  assert.equal(facts.sendTokenIdentity, true);
  assert.equal(facts.sendAmountType, 'bigint');
  assert.equal(facts.sendAmountDecimal, transaction.amount);

  assertAllBooleanFactsTrue(captured.mutationFacts, 'mutationFacts');
  assert.equal(captured.mutationFacts.blockHashAtSign, transaction.hash);
  assert.equal(captured.mutationFacts.signArgumentHex, transaction.hash);
  if (id === 'C') {
    assert.equal(captured.mutationFacts.powDataHash, captured.mutationFacts.independentPowDataHash);
  } else {
    assert.equal(captured.mutationFacts.powDataHash, null);
  }
}

test('Phase 2A schema-v2 oracle records capture provenance and literal fixtures', () => {
  const manifest = parseJson(FIXTURE_PATH);
  const lock = parseJson(PACKAGE_LOCK_PATH);
  const installed = parseJson(INSTALLED_SDK_PACKAGE_PATH);
  const locked = lock.packages?.['node_modules/znn-typescript-sdk'];

  assert.equal(manifest.schemaVersion, 2);
  // projectHead is capture provenance only; this test deliberately does not
  // inspect or compare the current repository HEAD.
  assert.deepEqual(manifest.oracle, PHASE2A_ORACLE);
  assert.equal(installed.version, PHASE2A_ORACLE.sdkVersion);
  assert.equal(locked?.version, PHASE2A_ORACLE.sdkVersion);
  assert.equal(locked?.integrity, PHASE2A_ORACLE.sdkIntegrity);
  assert.deepEqual(Object.keys(manifest.scenarios), ['A', 'B', 'C']);
  for (const id of ['A', 'B', 'C']) {
    assert.equal(manifest.scenarios[id].schemaVersion, 2);
    assert.equal(manifest.scenarios[id].id, id);
    assert.deepEqual(manifest.scenarios[id].provenance, PHASE2A_ORACLE);
  }
});

test('isolated unchanged ExactZenonClient reproduces all reviewed Phase 2A goldens', async t => {
  const manifest = parseJson(FIXTURE_PATH);

  for (const id of ['A', 'B', 'C']) {
    await t.test(`fixture ${id}`, () => {
      const captured = runPhase2AIsolated('capture', id);
      const expected = manifest.scenarios[id];
      const golden = captured.golden;
      const anchor = EXACT_ANCHORS[id];

      assert.deepEqual(captured.outcome, { status: 'fulfilled' });
      assert.deepEqual(captured.restoration, EXPECTED_RESTORATION);
      assert.deepEqual(captured.failureFacts, {
        plasmaFailureObserved: false,
        keyCleanupFailureObserved: false,
        connectionCleanupFailureObserved: false,
      });
      assert.equal(captured.networkTripwireCalls, 0);
      assert.deepEqual(captured.releaseEvidence, {
        queuedAfterInitialize: true,
        probeEntered: true,
        connectionCleanupSeenBeforeProbe: true,
        probeResult: { status: 'entered' },
        operationSettled: true,
      });
      assertSuccessfulLifecycle(captured, expected.inputs.accountIndex);

      // Primary reviewed literal oracle. There is no test-time update/bless path.
      assert.deepEqual(golden, expected);
      assert.equal(golden.schemaVersion, 2);

      const transaction = golden.expected.transaction;
      const paymentPayload = golden.expected.paymentPayload;
      const intentDigest = paymentPayload.payload.intentDigest;
      const preimage = accountBlockHashPreimage(transaction);
      const publicKey = Buffer.from(transaction.publicKey, 'base64');
      const signature = Buffer.from(transaction.signature, 'base64');
      const transactionHash = Buffer.from(transaction.hash, 'hex');
      const headerBytes = Buffer.from(golden.expected.paymentSignatureHeader, 'base64');

      assert.deepEqual(Object.keys(transaction), ACCOUNT_BLOCK_FIELDS);
      assert.equal(transaction.hash, anchor.transactionHash);
      assert.equal(golden.expected.transactionHash, anchor.transactionHash);
      assert.equal(
        golden.expected.paymentSignatureHeaderSha256,
        anchor.paymentSignatureHeaderSha256,
      );
      assert.equal(preimage.length, ACCOUNT_BLOCK_HASH_PREIMAGE_BYTES);
      assert.equal(preimage.length, 306);
      assert.equal(preimage.toString('hex'), golden.expected.hashPreimageHex);
      assert.equal(accountBlockHashHex(transaction), transaction.hash);
      assert.equal(golden.expected.hashPreimageBytes, 306);
      assert.equal(golden.expected.publicKeyHex, publicKey.toString('hex'));
      assert.equal(golden.expected.signatureHex, signature.toString('hex'));
      assert.equal(publicKey.length, 32);
      assert.equal(signature.length, 64);
      assert.equal(ed.verify(signature, transactionHash, publicKey, { zip215: false }), true);

      assert.equal(JSON.stringify(transaction), golden.expected.preparedJsonString);
      assert.equal(
        Buffer.from(golden.expected.preparedJsonString, 'utf8').toString('hex'),
        golden.expected.preparedJsonUtf8Hex,
      );
      assert.equal(JSON.stringify(paymentPayload), golden.expected.paymentPayloadWireJson);
      assert.equal(
        Buffer.from(golden.expected.paymentPayloadWireJson, 'utf8').toString('hex'),
        golden.expected.paymentPayloadUtf8Hex,
      );
      assert.equal(headerBytes.toString('utf8'), golden.expected.paymentPayloadWireJson);
      assert.equal(
        sha256Hex(Buffer.from(golden.expected.paymentSignatureHeader, 'utf8')),
        anchor.paymentSignatureHeaderSha256,
      );
      assert.deepEqual(JSON.parse(headerBytes.toString('utf8')), paymentPayload);
      assert.deepEqual(paymentPayload.payload.transaction, transaction);
      assert.equal(Buffer.from(intentDigest, 'hex').toString('base64'), transaction.data);

      assert.deepEqual(captured.observedExecutionTrace, golden.expected.observedExecutionTrace);
      assert.deepEqual(
        captured.sdkApiRpcMethodBoundaryTrace,
        golden.expected.sdkApiRpcMethodBoundaryTrace,
      );
      assert.deepEqual(
        captured.prepareBlockApiBoundaryTrace,
        golden.expected.prepareBlockApiBoundaryTrace,
      );
      assert.deepEqual(captured.blockStageSnapshots, golden.expected.blockStageSnapshots);
      assert.deepEqual(
        captured.payloadTransactionSnapshots,
        golden.expected.payloadTransactionSnapshots,
      );
      assert.deepEqual(captured.harnessCleanupFacts, golden.expected.harnessCleanupFacts);
      assert.deepEqual(captured.restoration, golden.expected.restoration);

      assertBlockStages(id, captured, transaction);
      assertUnifiedTrace(id, captured, transaction);
      assertArgumentAndIdentityFacts(id, captured, transaction, intentDigest);

      const observedOperations = captured.observedExecutionTrace.map(entry => entry.operation);
      assert.equal(observedOperations.includes('hash'), false);
      assert.equal(observedOperations.includes('preflight'), false);
      assert.equal(observedOperations.includes('owner.released'), false);
      assert.equal(observedOperations.includes('ledger.publishRawTransaction'), false);
      assert.equal(captured.lifecycle.publicationCalls, 0);
      assert.equal(captured.lifecycle.networkTripwireCalls, 0);
      assert.equal(observedOperations.includes('fetch.paid'), true);
    });
  }
});
