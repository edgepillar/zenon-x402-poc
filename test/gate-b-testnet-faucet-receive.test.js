import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import * as sdk from 'znn-typescript-sdk';

import {
  GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT,
  GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES,
  GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES,
  GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION,
  frameGateBTestnetFaucetReceiveBootstrap,
  parseGateBTestnetFaucetReceiveFrame,
} from '../src/gate-b-testnet-faucet-receive-schema.js';
import { runGateBTestnetFaucetReceiveCli } from
  '../src/gate-b-testnet-faucet-receive-cli.js';
import {
  executeGateBTestnetFaucetReceive,
  runGateBTestnetFaucetReceiveChild,
} from '../src/gate-b-testnet-faucet-receive-child.js';
import {
  GATE_B_TESTNET_FAUCET_RECEIVE_STATES,
  openGateBTestnetFaucetReceiveState,
} from '../src/gate-b-testnet-faucet-receive-state.js';
import {
  superviseGateBTestnetFaucetReceive,
  superviseGateBTestnetFaucetReceiveForWorkspace,
} from
  '../src/gate-b-testnet-faucet-receive-supervisor.js';
import { selectGateBBuyerWalletWorkspace } from
  '../src/gate-b-buyer-wallet-selector.js';
import { computeBlockHash } from '../src/zenon-payment.js';
import { invokeLegacySdk105SignedComposite } from
  '../src/zenon/internal/legacy-sdk-1-0-5-signed-composite.js';
import {
  GATE_B_CURRENT_TESTNET_CHAIN_PROFILE,
  GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  GATE_B_CURRENT_TESTNET_PROFILE_NAME,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
  selectGateBCurrentTestnetPolicy,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const SYNTHETIC_PUBLIC_WS = `ws://${[8, 8, 4, 4].join('.')}:35998/`;
const WALLET_WORKSPACE_NAME = 'zenon-x402-gate-b-wallet';
const GENERATION_TOKEN = '09af'.repeat(8);
const EXPECTED_CHAIN_ID = Number(GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.chainIdentifier);

function bootstrap() {
  return {
    acknowledgement: GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT,
    rpcEndpoint: SYNTHETIC_PUBLIC_WS,
    schemaVersion: 1,
  };
}

test('faucet selection keeps bootstrap path-free and isolates generated state', () => {
  const supportRoot = '/private/synthetic/Application Support';
  const legacyRoot = join(supportRoot, WALLET_WORKSPACE_NAME);
  const generatedRoot = join(
    supportRoot,
    `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`,
  );
  const legacy = selectGateBBuyerWalletWorkspace(legacyRoot, supportRoot);
  const generated = selectGateBBuyerWalletWorkspace(generatedRoot, supportRoot);

  assert.equal(GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION, '--workspace');
  assert.notEqual(legacy.stateWorkspaceRoot, generated.stateWorkspaceRoot);
  assert.equal(generated.generationToken, GENERATION_TOKEN);
  assert.deepEqual(Object.keys(bootstrap()), [
    'acknowledgement', 'rpcEndpoint', 'schemaVersion',
  ]);
  assert.equal(JSON.stringify(bootstrap()).includes(generatedRoot), false);
});

function policy() {
  return selectGateBCurrentTestnetPolicy(
    GATE_B_CURRENT_TESTNET_PROFILE_NAME,
    GATE_B_CURRENT_TESTNET_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );
}

function signedReceiveJson(changes = {}, label = 'default') {
  const publicKey = Buffer.alloc(32, 1);
  const template = new sdk.AccountBlockTemplate({
    address: sdk.Address.fromPublicKey(publicKey),
    amount: 0n,
    blockType: sdk.BlockTypeEnum.UserReceive,
    chainIdentifier: EXPECTED_CHAIN_ID,
    data: Buffer.alloc(0),
    difficulty: 1,
    fromBlockHash: sdk.Hash.digest(Buffer.from(`source-${label}`)),
    fusedPlasma: 0,
    height: 1,
    momentumAcknowledged: new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from(`momentum-${label}`)),
      2,
    ),
    nonce: '0100000000000000',
    previousHash: sdk.Hash.digest(Buffer.from(`previous-${label}`)),
    publicKey,
    signature: Buffer.alloc(64, 2),
    toAddress: sdk.EMPTY_ADDRESS,
    tokenStandard: sdk.EMPTY_ZTS,
    version: 1,
  });
  template.hash = computeBlockHash(template, sdk);
  return { ...template.toJson(), ...changes };
}

async function stateFixture(t) {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'gate-b-receive-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const supportRoot = join(temporary, 'Library', 'Application Support');
  const walletRoot = join(supportRoot, WALLET_WORKSPACE_NAME);
  await mkdir(walletRoot, { recursive: true, mode: 0o700 });
  await chmod(supportRoot, 0o700);
  await chmod(walletRoot, 0o700);
  return { supportRoot: await realpath(supportRoot), walletRoot: await realpath(walletRoot) };
}

function stateInjections(changes = {}) {
  return {
    aclInspector: async () => true,
    platform: 'darwin',
    ...changes,
  };
}

function persistedRecoverySource(index) {
  const address = sdk.Address.fromPublicKey(Buffer.alloc(32, 1));
  return sourceBlock(
    address,
    index === 0 ? sdk.ZNN_ZTS : sdk.QSR_ZTS,
    `recovery-source-${index}`,
  );
}

function persistedRecoveryRecord(state, blockCount = 2) {
  const blocks = [];
  for (let index = 0; index < blockCount; index += 1) {
    const source = persistedRecoverySource(index);
    const serialized = signedReceiveJson({}, `recovery-${index}`);
    serialized.fromBlockHash = source.hash.toString();
    if (index === 0) serialized.previousHash = sdk.EMPTY_HASH.toString();
    const prepared = sdk.AccountBlockTemplate.fromJson(serialized);
    prepared.hash = computeBlockHash(prepared, sdk);
    const signedAccountBlock = {
      ...prepared.toJson(),
      publicKey: serialized.publicKey,
      signature: serialized.signature,
    };
    blocks.push({
      index,
      signedAccountBlock,
      sourceHash: signedAccountBlock.fromBlockHash,
      state: index === blockCount - 1 && !['COMPLETE', 'RECOVERED'].includes(state)
        ? state
        : 'INCLUDED',
    });
  }
  return {
    activeIndex: ['COMPLETE', 'RECOVERED'].includes(state) ? null : blockCount - 1,
    blocks,
    revision: 8,
    schemaVersion: 1,
    state,
  };
}

function memoryState(
  events,
  initial = null,
  initialAttempt = null,
  commitAttemptError = false,
  failSecondPreparedOnce = false,
) {
  let record = initial === null ? null : structuredClone(initial);
  let secondAttempt = initialAttempt === null ? null : structuredClone(initialAttempt);
  return {
    async load() { events.push('state.load'); return record && structuredClone(record); },
    async loadSecondReceiveAttempt() {
      events.push('state.second-attempt.load');
      return secondAttempt && structuredClone(secondAttempt);
    },
    async commitSecondReceiveAttempt(next) {
      events.push('state.second-attempt.commit');
      if (commitAttemptError || secondAttempt !== null) throw new Error('synthetic');
      secondAttempt = structuredClone(next);
      return structuredClone(secondAttempt);
    },
    async arm() {
      events.push('state.arm');
      record = { activeIndex: null, blocks: [], revision: 0, schemaVersion: 1, state: 'ARMED' };
      return structuredClone(record);
    },
    async update(next) {
      events.push(`state.${next.state}.${next.activeIndex ?? 'none'}`);
      if (failSecondPreparedOnce && next.state === 'PREPARED' && next.activeIndex === 1) {
        failSecondPreparedOnce = false;
        throw new Error('synthetic');
      }
      record = structuredClone(next);
      return structuredClone(record);
    },
    async close() { events.push('state.close'); },
    attemptSnapshot() { return secondAttempt && structuredClone(secondAttempt); },
    snapshot() { return record && structuredClone(record); },
  };
}

function sourceBlock(address, tokenStandard, label) {
  const block = new sdk.AccountBlock({
    address: sdk.Address.fromPublicKey(Buffer.alloc(32, 3)),
    blockType: sdk.BlockTypeEnum.ContractSend,
    chainIdentifier: EXPECTED_CHAIN_ID,
    data: Buffer.alloc(0),
    difficulty: 0,
    fromBlockHash: sdk.EMPTY_HASH,
    fusedPlasma: 0,
    height: 1,
    momentumAcknowledged: new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from(`source-momentum-${label}`)),
      1,
    ),
    nonce: '0000000000000000',
    previousHash: sdk.Hash.digest(Buffer.from(`source-previous-${label}`)),
    publicKey: Buffer.alloc(32, 3),
    signature: Buffer.alloc(64, 4),
    amount: 1n,
    tokenStandard,
    toAddress: address,
    version: 1,
  });
  block.hash = computeBlockHash(block, sdk);
  block.confirmationDetail = new sdk.AccountBlockConfirmationDetail(
    1,
    1,
    sdk.Hash.digest(Buffer.from(`source-confirmation-${label}`)),
    1,
  );
  return block;
}

function secondSourceSnapshot(block) {
  return {
    address: block.toAddress.toString(),
    amount: block.amount.toString(),
    asset: block.tokenStandard.toString(),
    blockType: block.blockType,
    hash: block.hash.toString(),
  };
}

function secondReceiveAttemptFor(record) {
  return {
    firstReceive: {
      hash: record.blocks[0].signedAccountBlock.hash,
      height: record.blocks[0].signedAccountBlock.height,
      momentumAcknowledgedHeight:
        record.blocks[0].signedAccountBlock.momentumAcknowledged.height,
      sourceHash: record.blocks[0].sourceHash,
    },
    schemaVersion: 1,
    secondSource: secondSourceSnapshot(persistedRecoverySource(1)),
  };
}

function executionHarness({ failPublicationAt = -1, pendingMutation = false,
  fusedAt = -1, outgoingAt = -1, noPowAt = -1, existing = null,
  mutateSources = value => value, unconfirmedCount = 0,
  derivedAddressMatches = true, recoveredIndexes = [],
  recoveryObservationMutation = value => value,
  recoveryPendingMutation = value => value,
  recoverySourceMutation = value => value,
  recoverySourceLookupThrows = false,
  recoveryRemainingSourceMutation = value => value,
  recoveryRemainingLookupMutation = value => value,
  recoveryFrontierMutation = value => value,
  secondAttempt = null,
  secondCommitAttemptError = false,
  failSecondPreparedOnce = false,
  partialSuccessorMutation = value => value,
  readinessChainId = EXPECTED_CHAIN_ID } = {}) {
  const events = [];
  const publicKey = Buffer.alloc(32, 1);
  const expectedAddressObject = sdk.Address.fromPublicKey(publicKey);
  const expectedAddress = expectedAddressObject.toString();
  const sources = mutateSources([
    sourceBlock(expectedAddressObject, sdk.ZNN_ZTS, 'source-znn'),
    sourceBlock(expectedAddressObject, sdk.QSR_ZTS, 'source-qsr'),
  ], { expectedAddressObject, sdk });
  const preparedByHash = new Map();
  const observedByHash = new Map();
  let recoverySource;
  let recoveryRemainingSource;
  if (existing) {
    for (let index = 0; index < existing.blocks.length; index += 1) {
      preparedByHash.set(existing.blocks[index].signedAccountBlock.hash, index);
    }
    if (existing.blocks.length === 1) {
      recoverySource = persistedRecoverySource(0);
      recoverySource = recoverySourceMutation(recoverySource, {
        expectedAddressObject,
        remainingSource: sources[1],
        sdk,
      });
      recoveryRemainingSource = recoveryRemainingSourceMutation(
        persistedRecoverySource(1),
        { expectedAddressObject, recoverySource, sdk },
      );
    }
    for (const index of recoveredIndexes) {
      const stored = existing.blocks[index]?.signedAccountBlock;
      if (!stored) continue;
      const template = sdk.AccountBlockTemplate.fromJson(stored);
      template.publicKey = Buffer.from(stored.publicKey, 'base64');
      template.signature = Buffer.from(stored.signature, 'base64');
      const observed = new sdk.AccountBlock({
        ...template,
        confirmationDetail: new sdk.AccountBlockConfirmationDetail(
          1,
          4 + index,
          sdk.Hash.digest(Buffer.from(`recovered-confirmation-${index}`)),
          1,
        ),
      });
      observedByHash.set(stored.hash, recoveryObservationMutation(observed, index));
    }
  }
  let pendingReads = 0;
  let publicationCalls = 0;
  let poisonCalls = 0;
  let clearCalls = 0;
  let keyClearCalls = 0;
  let remainingSourceReads = 0;
  const zenon = {
    client: undefined,
    async initialize() { events.push('initialize'); },
    clearConnection() { clearCalls += 1; events.push('connection.clear'); },
    ledger: {
      async getUnreceivedBlocksByAddress() {
        pendingReads += 1;
        events.push(`pending.${pendingReads}`);
        const base = existing?.blocks.length === 1 ? [recoveryRemainingSource] : sources;
        const list = existing?.blocks.length === 1
          ? recoveryPendingMutation(base, pendingReads, {
              expectedAddressObject,
              recoverySource,
              sdk,
              sources,
            })
          : pendingMutation && pendingReads === 2 ? [sources[1], sources[0]] : sources;
        return new sdk.AccountBlockList(list.length, list, false);
      },
      async getUnconfirmedBlocksByAddress() {
        events.push('unconfirmed');
        const list = unconfirmedCount === 0 ? [] : [sources[0]];
        return new sdk.AccountBlockList(unconfirmedCount, list, false);
      },
      async publishRawTransaction(prepared) {
        const index = preparedByHash.get(prepared.hash.toString());
        publicationCalls += 1;
        events.push(`publish.${index}`);
        if (index === failPublicationAt) throw new Error('synthetic');
        const json = prepared.toJson();
        const observed = new sdk.AccountBlock({
          ...prepared,
          confirmationDetail: new sdk.AccountBlockConfirmationDetail(
            1,
            3 + index,
            sdk.Hash.digest(Buffer.from(`confirmation-${index}`)),
            1,
          ),
        });
        observedByHash.set(json.hash, observed);
        return prepared;
      },
      async getAccountBlockByHash(hash) {
        const key = hash.toString();
        events.push(`lookup.${preparedByHash.get(key) ?? 'unknown'}`);
        if (recoverySource && key === existing.blocks[0].sourceHash) {
          if (recoverySourceLookupThrows) throw new Error('synthetic');
          return recoverySource;
        }
        if (recoveryRemainingSource && key === recoveryRemainingSource.hash.toString()) {
          remainingSourceReads += 1;
          return recoveryRemainingLookupMutation(
            recoveryRemainingSource,
            remainingSourceReads,
            { expectedAddressObject, recoverySource, sdk },
          );
        }
        return observedByHash.get(key) ?? null;
      },
      async getFrontierAccountBlock() {
        events.push('frontier.account');
        const observed = observedByHash.get(existing?.blocks[0]?.signedAccountBlock.hash) ?? null;
        return recoveryFrontierMutation(observed, { expectedAddressObject, sdk });
      },
    },
  };
  const fakeZenon = {
    getInstance: () => zenon,
    getPowProvider: () => undefined,
    setChainID: value => { events.push('chain'); sdk.Zenon.setChainID(value); },
    setNetworkID: value => events.push(`network.${value}`),
  };
  const fakeSdk = { ...sdk, Zenon: fakeZenon, KeyStore: {
    fromMnemonic() {
      events.push('wallet.derive');
      return {
        getKeyPair(index) {
          assert.equal(index, 0);
          return {
            clear() { keyClearCalls += 1; events.push('key.clear'); },
            getAddress() {
              return derivedAddressMatches
                ? expectedAddressObject
                : sdk.Address.fromPublicKey(Buffer.alloc(32, 9));
            },
          };
        },
      };
    },
  } };
  const walletInput = Buffer.from(`${JSON.stringify({
    secretVersion: 1,
    mnemonic: 'synthetic mnemonic fixture',
    accountIndex: 0,
  })}\n`);
  const addressInput = Buffer.from(`${JSON.stringify({
    addressVersion: 1,
    address: expectedAddress,
    accountIndex: 0,
  })}\n`);
  const workspace = {
    async openInputs(names) { events.push(`workspace.open.${names[0]}`); return [{ name: names[0] }]; },
    assertDistinct() { return true; },
    async read(record) {
      events.push(`workspace.read.${record.name}`);
      return Buffer.from(record.name === 'buyer-wallet.json' ? walletInput : addressInput);
    },
    async verify() { return true; },
    async close() { events.push('workspace.close'); },
  };
  const state = memoryState(
    events,
    existing,
    secondAttempt,
    secondCommitAttemptError,
    failSecondPreparedOnce,
  );
  const runtime = {
    async withOwner(_owner, work) {
      events.push('owner');
      return work({
        poison() { poisonCalls += 1; events.push('poison'); },
        async runRpcWithDeadline({ execute, operation }) {
          events.push(`rpc.${operation}`);
          return execute();
        },
      });
    },
  };
  const injections = {
    actualCwdPath: () => join(process.cwd(), 'synthetic', WALLET_WORKSPACE_NAME),
    applicationSupportRoot: () => {
      events.push('support-root');
      return dirname(join(process.cwd(), 'synthetic', WALLET_WORKSPACE_NAME));
    },
    assertNodeReady: async () => {
      events.push('readiness');
      return { chainId: readinessChainId };
    },
    createPolicy: () => {
      events.push('policy');
      const selected = policy();
      events.push('policy.done');
      return selected;
    },
    invokeComposite: async (_zenon, template, _keyPair) => {
      const index = preparedByHash.size;
      events.push(`prepare.${index}`);
      template.version = 1;
      template.chainIdentifier = EXPECTED_CHAIN_ID;
      template.previousHash = existing?.blocks.length === 1 && index === 1
        ? sdk.Hash.parse(existing.blocks[0].signedAccountBlock.hash)
        : sdk.Hash.digest(Buffer.from(`previous-${index}`));
      template.height = index + 1;
      template.momentumAcknowledged = new sdk.HashHeight(
        sdk.Hash.digest(Buffer.from(`momentum-${index}`)),
        2 + index,
      );
      template.address = expectedAddressObject;
      template.toAddress = sdk.EMPTY_ADDRESS;
      template.amount = 0n;
      template.tokenStandard = sdk.EMPTY_ZTS;
      template.data = Buffer.alloc(0);
      template.blockType = index === outgoingAt
        ? sdk.BlockTypeEnum.UserSend
        : sdk.BlockTypeEnum.UserReceive;
      template.fusedPlasma = index === fusedAt ? 1 : 0;
      template.difficulty = index === noPowAt ? 0 : 1;
      template.nonce = index === noPowAt ? '0000000000000000' : '0100000000000000';
      template.publicKey = publicKey;
      template.signature = Buffer.alloc(64, 2);
      partialSuccessorMutation(template, {
        existing,
        index,
        sdk,
      });
      template.hash = computeBlockHash(template, sdk);
      preparedByHash.set(template.hash.toString(), index);
      return template;
    },
    loadDependencies: async () => {
      events.push('dependencies');
      return { ed: { verify: () => true }, sdk: fakeSdk };
    },
    now: (() => { let current = 0; return () => { current += 120_001; return current; }; })(),
    onExecutionMode: async mode => { events.push(`mode.${mode}`); return true; },
    onPublicationStart: async index => { events.push(`publishing.${index}`); return true; },
    openReceiveState: async () => state,
    openWalletWorkspace: async () => workspace,
    runtime,
    wait: async () => {},
  };
  return {
    clearCalls: () => clearCalls,
    events,
    injections,
    keyClearCalls: () => keyClearCalls,
    poisonCalls: () => poisonCalls,
    publicationCalls: () => publicationCalls,
    sources,
    state,
  };
}

test('faucet receiver bootstrap is exact, private-channel framed, and acknowledgement bound', () => {
  const frame = frameGateBTestnetFaucetReceiveBootstrap({
    acknowledgement: GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT,
    rpcEndpoint: SYNTHETIC_PUBLIC_WS,
    schemaVersion: 1,
  });
  const parsed = parseGateBTestnetFaucetReceiveFrame(frame);
  assert.equal(parsed.acknowledgement, GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT);
  assert.equal(parsed.rpcEndpoint, SYNTHETIC_PUBLIC_WS);
  assert.equal(parsed.schemaVersion, 1);

  assert.throws(() => frameGateBTestnetFaucetReceiveBootstrap({
    acknowledgement: 'wrong',
    rpcEndpoint: SYNTHETIC_PUBLIC_WS,
    schemaVersion: 1,
  }));
  assert.throws(() => frameGateBTestnetFaucetReceiveBootstrap({
    acknowledgement: GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT,
    rpcEndpoint: SYNTHETIC_PUBLIC_WS.replace('ws://', 'ws://user:secret@'),
    schemaVersion: 1,
  }));
});

test('faucet receiver CLI emits only fixed complete and unknown records', async () => {
  const complete = { stdout: '', stderr: '' };
  assert.equal(await runGateBTestnetFaucetReceiveCli({
    argv: [],
    supervise: async () => 'complete',
    stdout: value => { complete.stdout += value; return Buffer.byteLength(value); },
    stderr: value => { complete.stderr += value; return Buffer.byteLength(value); },
  }), 0);
  assert.equal(complete.stdout, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.COMPLETE);
  assert.equal(complete.stderr, '');

  const partial = { stdout: '', stderr: '' };
  assert.equal(await runGateBTestnetFaucetReceiveCli({
    argv: [],
    supervise: async () => 'partial-complete',
    stdout: value => { partial.stdout += value; return Buffer.byteLength(value); },
    stderr: value => { partial.stderr += value; return Buffer.byteLength(value); },
  }), 0);
  assert.equal(partial.stdout, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.COMPLETE);
  assert.equal(partial.stderr, '');

  const unknown = { stdout: '', stderr: '' };
  assert.equal(await runGateBTestnetFaucetReceiveCli({
    argv: [],
    supervise: async () => 'outcome-unknown',
    stdout: value => { unknown.stdout += value; return Buffer.byteLength(value); },
    stderr: value => { unknown.stderr += value; return Buffer.byteLength(value); },
  }), 2);
  assert.equal(unknown.stdout, '');
  assert.equal(unknown.stderr, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.OUTCOME_UNKNOWN);
});

test('faucet CLI has one legacy encoding and one explicit generated encoding', async () => {
  const supportRoot = '/private/synthetic/Application Support';
  const legacyRoot = join(supportRoot, WALLET_WORKSPACE_NAME);
  const generatedRoot = join(
    supportRoot,
    `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`,
  );
  const calls = [];
  const output = { stdout: '', stderr: '' };
  const common = {
    stdout: value => { output.stdout += value; return Buffer.byteLength(value); },
    stderr: value => { output.stderr += value; return Buffer.byteLength(value); },
    supervise: async injections => {
      calls.push(['legacy', injections]);
      return 'complete';
    },
    superviseGenerated: async (workspaceRoot, injections) => {
      calls.push(['generated', workspaceRoot, injections]);
      return 'complete';
    },
    supervisorInjections: { synthetic: true },
  };

  assert.equal(await runGateBTestnetFaucetReceiveCli({ argv: [], ...common }), 0);
  assert.deepEqual(calls, [['legacy', common.supervisorInjections]]);
  calls.length = 0;
  output.stdout = '';
  assert.equal(await runGateBTestnetFaucetReceiveCli({
    argv: [GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION, generatedRoot],
    ...common,
  }), 0);
  assert.deepEqual(calls, [[
    'generated', generatedRoot, common.supervisorInjections,
  ]]);

  for (const argv of [
    [GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION, legacyRoot],
    [`${GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION}=${generatedRoot}`],
    ['--workspace-root', generatedRoot],
    [GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION, generatedRoot, 'extra'],
    [GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION,
      `${supportRoot}/../Application Support/${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`],
    [GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION,
      join(supportRoot, `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN.toUpperCase()}`)],
    [GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION,
      join(supportRoot, `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN.slice(0, -1)}g`)],
    [GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION],
  ]) {
    calls.length = 0;
    output.stdout = '';
    output.stderr = '';
    assert.equal(await runGateBTestnetFaucetReceiveCli({ argv, ...common }), 1);
    assert.deepEqual(calls, []);
    assert.equal(output.stdout, '');
    assert.equal(output.stderr, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.FAILURE);
    assert.equal(output.stderr.includes(GENERATION_TOKEN), false);
    assert.equal(output.stderr.includes(legacyRoot), false);
  }
});

test('generated faucet CLI preserves an ambiguous result once without path disclosure',
  async () => {
    const supportRoot = '/private/synthetic/Application Support';
    const generatedRoot = join(
      supportRoot,
      `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`,
    );
    const output = { stdout: '', stderr: '' };
    let generatedCalls = 0;
    let legacyCalls = 0;
    assert.equal(await runGateBTestnetFaucetReceiveCli({
      argv: [GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION, generatedRoot],
      stderr: value => { output.stderr += value; return Buffer.byteLength(value); },
      stdout: value => { output.stdout += value; return Buffer.byteLength(value); },
      async supervise() { legacyCalls += 1; return 'complete'; },
      async superviseGenerated(workspaceRoot) {
        generatedCalls += 1;
        assert.equal(workspaceRoot, generatedRoot);
        return 'outcome-unknown';
      },
    }), 2);
    assert.equal(generatedCalls, 1);
    assert.equal(legacyCalls, 0);
    assert.equal(output.stdout, '');
    assert.equal(output.stderr, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.OUTCOME_UNKNOWN);
    assert.equal(output.stderr.includes(GENERATION_TOKEN), false);
    assert.equal(output.stderr.includes(generatedRoot), false);
  });

test('faucet receiver CLI rejects argv without echoing private input', async () => {
  const output = { stdout: '', stderr: '' };
  assert.equal(await runGateBTestnetFaucetReceiveCli({
    argv: ['--rpc-endpoint', SYNTHETIC_PUBLIC_WS],
    supervise: async () => 'complete',
    stdout: value => { output.stdout += value; return Buffer.byteLength(value); },
    stderr: value => { output.stderr += value; return Buffer.byteLength(value); },
  }), 1);
  assert.equal(output.stdout, '');
  assert.equal(output.stderr, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.FAILURE);
  assert.equal(output.stderr.includes(SYNTHETIC_PUBLIC_WS), false);
});

test('faucet receiver CLI treats short or broken fixed-output writes as failure', async () => {
  const short = { stderr: '' };
  assert.equal(await runGateBTestnetFaucetReceiveCli({
    argv: [],
    supervise: async () => 'complete',
    stdout: () => 0,
    stderr: value => { short.stderr += value; return Buffer.byteLength(value); },
  }), 1);
  assert.equal(short.stderr, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.FAILURE);

  assert.equal(await runGateBTestnetFaucetReceiveCli({
    argv: [],
    supervise: async () => 'complete',
    stdout: () => { throw new Error('synthetic'); },
    stderr: () => { throw new Error('synthetic'); },
  }), 1);
});

test('faucet receiver schema rejects non-public or noncanonical endpoint shapes', () => {
  const invalid = [
    'wss://127.0.0.1:35998/',
    'ws://127.0.0.1:35998/',
    'ws://localhost:35998/',
    'ws://8.8.4.4/',
    'ws://8.8.4.4:80/',
    'ws://8.8.4.4:35998/path',
    'ws://8.8.4.4:35998/?query=1',
  ];
  for (const rpcEndpoint of invalid) {
    assert.throws(() => frameGateBTestnetFaucetReceiveBootstrap({
      acknowledgement: GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT,
      rpcEndpoint,
      schemaVersion: 1,
    }));
  }
});

test('faucet receiver state creates a durable one-shot marker and exact private record', async t => {
  const fixture = await stateFixture(t);
  const first = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  const armed = await first.arm();
  assert.equal(armed.state, GATE_B_TESTNET_FAUCET_RECEIVE_STATES.ARMED);
  await first.close();

  const second = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  t.after(async () => {
    await Promise.allSettled([first.close(), second.close()]);
  });
  assert.deepEqual(await second.load(), armed);
  await assert.rejects(() => second.arm());
  const stateRoot = join(fixture.supportRoot, 'zenon-x402-gate-b-faucet-receive');
  assert.equal((await lstat(stateRoot)).mode & 0o777, 0o700);
  assert.equal((await lstat(join(stateRoot, '.faucet-receive-once'))).mode & 0o777, 0o600);
  assert.equal((await lstat(join(stateRoot, 'faucet-receive-recovery.json'))).mode & 0o777, 0o600);
  await second.close();
});

test('generated faucet state is token-isolated and rejects malformed generations pre-effect',
  async t => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'gate-b-state-generation-')));
    t.after(() => rm(temporary, { recursive: true, force: true }));
    const supportRoot = join(temporary, 'Library', 'Application Support');
    const tokenA = GENERATION_TOKEN;
    const tokenB = 'f0a9'.repeat(8);
    const walletA = join(supportRoot, `${WALLET_WORKSPACE_NAME}-${tokenA}`);
    const walletB = join(supportRoot, `${WALLET_WORKSPACE_NAME}-${tokenB}`);
    await mkdir(walletA, { recursive: true, mode: 0o700 });
    await mkdir(walletB, { mode: 0o700 });
    await chmod(supportRoot, 0o700);
    await chmod(walletA, 0o700);
    await chmod(walletB, 0o700);

    const selectionA = selectGateBBuyerWalletWorkspace(walletA, supportRoot);
    const selectionB = selectGateBBuyerWalletWorkspace(walletB, supportRoot);
    assert.notEqual(selectionA.stateWorkspaceRoot, selectionB.stateWorkspaceRoot);
    const stateA = await openGateBTestnetFaucetReceiveState(
      walletA,
      stateInjections(),
    );
    const stateB = await openGateBTestnetFaucetReceiveState(
      walletB,
      stateInjections(),
    );
    await stateA.arm();
    assert.equal((await stateA.load()).state, 'ARMED');
    assert.equal(await stateB.load(), null);
    await stateA.close();
    await stateB.close();
    assert.equal((await lstat(selectionA.stateWorkspaceRoot)).isDirectory(), true);
    assert.equal((await lstat(selectionB.stateWorkspaceRoot)).isDirectory(), true);

    let mkdirCalls = 0;
    const malformed = join(
      supportRoot,
      `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN.toUpperCase()}`,
    );
    await assert.rejects(openGateBTestnetFaucetReceiveState(
      malformed,
      stateInjections({
        async mkdirPath() { mkdirCalls += 1; },
      }),
    ));
    assert.equal(mkdirCalls, 0);
  });

test('generated faucet child reparses cwd and binds wallet and state to one generation',
  async () => {
    const supportRoot = join(
      process.cwd(),
      'synthetic-unicode-\u00e9',
      'Application Support',
    );
    const generatedRoot = join(
      supportRoot,
      `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`,
    );
    const harness = executionHarness();
    const opened = { state: [], wallet: [] };
    const openReceiveState = harness.injections.openReceiveState;
    const openWalletWorkspace = harness.injections.openWalletWorkspace;
    harness.injections.actualCwdPath = () => generatedRoot;
    harness.injections.applicationSupportRoot = () => supportRoot;
    harness.injections.openReceiveState = async workspaceRoot => {
      opened.state.push(workspaceRoot);
      return openReceiveState(workspaceRoot);
    };
    harness.injections.openWalletWorkspace = async workspaceRoot => {
      opened.wallet.push(workspaceRoot);
      return openWalletWorkspace(workspaceRoot);
    };

    assert.equal(
      await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
      'complete',
    );
    assert.deepEqual(opened, {
      state: [generatedRoot],
      wallet: [generatedRoot],
    });
    assert.equal(harness.publicationCalls(), 2);
  });

test('faucet child rejects malformed and cross-root cwd before dependencies or effects',
  async () => {
    const supportRoot = join(process.cwd(), 'synthetic-selector-a', 'Application Support');
    const otherSupportRoot = join(process.cwd(), 'synthetic-selector-b', 'Application Support');
    const candidates = [
      join(otherSupportRoot, `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`),
      join(supportRoot, `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN.toUpperCase()}`),
      `${supportRoot}/../Application Support/${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`,
    ];
    for (const actualCwd of candidates) {
      const harness = executionHarness();
      harness.injections.actualCwdPath = () => actualCwd;
      harness.injections.applicationSupportRoot = () => supportRoot;
      await assert.rejects(() => executeGateBTestnetFaucetReceive(
        bootstrap(),
        harness.injections,
      ));
      assert.deepEqual(harness.events, []);
      assert.equal(harness.publicationCalls(), 0);
      assert.equal(harness.poisonCalls(), 0);
    }
  });

test('faucet receiver state durably preserves an exact prepared block', async t => {
  const fixture = await stateFixture(t);
  const store = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  const armed = await store.arm();
  const block = signedReceiveJson();
  const prepared = {
    activeIndex: 0,
    blocks: [{ index: 0, signedAccountBlock: block, sourceHash: block.fromBlockHash, state: 'PREPARED' }],
    revision: armed.revision + 1,
    schemaVersion: 1,
    state: 'PREPARED',
  };
  assert.deepEqual(await store.update(prepared), prepared);
  await store.close();
  const reopened = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  assert.deepEqual(await reopened.load(), prepared);
  await reopened.close();
});

test('faucet receiver state permits exact included recovery before preparing index one', async t => {
  const fixture = await stateFixture(t);
  const store = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  let record = await store.arm();
  const first = signedReceiveJson({}, 'partial-first');
  record = await store.update({
    activeIndex: 0,
    blocks: [{
      index: 0,
      signedAccountBlock: first,
      sourceHash: first.fromBlockHash,
      state: 'PREPARED',
    }],
    revision: record.revision + 1,
    schemaVersion: 1,
    state: 'PREPARED',
  });
  record = structuredClone(record);
  record.revision += 1;
  record.state = 'UNKNOWN';
  record.blocks[0].state = 'UNKNOWN';
  record = await store.update(record);

  const included = structuredClone(record);
  included.revision += 1;
  included.state = 'INCLUDED';
  included.blocks[0].state = 'INCLUDED';
  record = await store.update(included);

  const second = signedReceiveJson({}, 'partial-second');
  const prepared = structuredClone(record);
  prepared.revision += 1;
  prepared.activeIndex = 1;
  prepared.state = 'PREPARED';
  prepared.blocks.push({
    index: 1,
    signedAccountBlock: second,
    sourceHash: second.fromBlockHash,
    state: 'PREPARED',
  });
  assert.deepEqual(await store.update(prepared), prepared);
  await store.close();
});

test('faucet receiver state rejects same-length INCLUDED to PREPARED regressions', async t => {
  const fixture = await stateFixture(t);
  const store = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  let record = await store.arm();
  const first = signedReceiveJson({}, 'same-length-first');
  record = await store.update({
    activeIndex: 0,
    blocks: [{
      index: 0,
      signedAccountBlock: first,
      sourceHash: first.fromBlockHash,
      state: 'PREPARED',
    }],
    revision: record.revision + 1,
    schemaVersion: 1,
    state: 'PREPARED',
  });
  for (const state of ['PUBLISHING', 'INCLUDED']) {
    const next = structuredClone(record);
    next.revision += 1;
    next.state = state;
    next.blocks[0].state = state;
    record = await store.update(next);
  }
  const oneBlockRegression = structuredClone(record);
  oneBlockRegression.revision += 1;
  oneBlockRegression.state = 'PREPARED';
  oneBlockRegression.blocks[0].state = 'PREPARED';
  await assert.rejects(() => store.update(oneBlockRegression));

  const second = signedReceiveJson({}, 'same-length-second');
  record = await store.update({
    activeIndex: 1,
    blocks: [
      structuredClone(record.blocks[0]),
      {
        index: 1,
        signedAccountBlock: second,
        sourceHash: second.fromBlockHash,
        state: 'PREPARED',
      },
    ],
    revision: record.revision + 1,
    schemaVersion: 1,
    state: 'PREPARED',
  });
  for (const state of ['PUBLISHING', 'INCLUDED']) {
    const next = structuredClone(record);
    next.revision += 1;
    next.state = state;
    next.blocks[1].state = state;
    record = await store.update(next);
  }
  const twoBlockRegression = structuredClone(record);
  twoBlockRegression.revision += 1;
  twoBlockRegression.state = 'PREPARED';
  twoBlockRegression.blocks[1].state = 'PREPARED';
  await assert.rejects(() => store.update(twoBlockRegression));
  await store.close();
});

test('faucet receiver state grants one durable second-receive attempt atomically', async t => {
  const fixture = await stateFixture(t);
  const first = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  const second = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  t.after(async () => {
    await Promise.allSettled([first.close(), second.close()]);
  });
  let record = await first.arm();
  const persisted = persistedRecoveryRecord('INCLUDED', 1);
  record = await first.update({
    activeIndex: 0,
    blocks: [{
      ...persisted.blocks[0],
      state: 'PREPARED',
    }],
    revision: record.revision + 1,
    schemaVersion: 1,
    state: 'PREPARED',
  });
  for (const state of ['UNKNOWN', 'INCLUDED']) {
    const next = structuredClone(record);
    next.revision += 1;
    next.state = state;
    next.blocks[0].state = state;
    record = await first.update(next);
  }
  const attempt = secondReceiveAttemptFor(record);
  const settled = await Promise.allSettled([
    first.commitSecondReceiveAttempt(attempt),
    second.commitSecondReceiveAttempt(attempt),
  ]);
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(settled.filter(result => result.status === 'rejected').length, 1);
  assert.deepEqual(await first.loadSecondReceiveAttempt(), attempt);
  assert.deepEqual(await second.loadSecondReceiveAttempt(), attempt);
  const stateRoot = join(fixture.supportRoot, 'zenon-x402-gate-b-faucet-receive');
  assert.equal(
    (await lstat(join(stateRoot, 'faucet-receive-second-attempt.json'))).mode & 0o777,
    0o600,
  );
  await first.close();
  await second.close();
  const reopened = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  assert.deepEqual(await reopened.loadSecondReceiveAttempt(), attempt);
  await assert.rejects(() => reopened.commitSecondReceiveAttempt(attempt));
  await reopened.close();
});

test('faucet receiver state cannot rewrite an included receive while adding the second', async t => {
  const fixture = await stateFixture(t);
  const store = await openGateBTestnetFaucetReceiveState(
    fixture.walletRoot,
    stateInjections(),
  );
  let record = await store.arm();
  const first = signedReceiveJson();
  record = await store.update({
    activeIndex: 0,
    blocks: [{ index: 0, signedAccountBlock: first, sourceHash: first.fromBlockHash, state: 'PREPARED' }],
    revision: record.revision + 1,
    schemaVersion: 1,
    state: 'PREPARED',
  });
  for (const state of ['PUBLISHING', 'INCLUDED']) {
    record = structuredClone(record);
    record.revision += 1;
    record.state = state;
    record.blocks[0].state = state;
    record = await store.update(record);
  }
  const replacement = signedReceiveJson({
    fromBlockHash: 'b'.repeat(64),
    hash: 'c'.repeat(64),
  });
  const second = signedReceiveJson({
    fromBlockHash: 'd'.repeat(64),
    hash: 'e'.repeat(64),
  });
  const malicious = {
    activeIndex: 1,
    blocks: [
      { index: 0, signedAccountBlock: replacement, sourceHash: replacement.fromBlockHash,
        state: 'INCLUDED' },
      { index: 1, signedAccountBlock: second, sourceHash: second.fromBlockHash, state: 'PREPARED' },
    ],
    revision: record.revision + 1,
    schemaVersion: 1,
    state: 'PREPARED',
  };
  await assert.rejects(() => store.update(malicious));
  await store.close();
});

test('faucet receiver state brackets its retained directory and files with ACL checks', async t => {
  const fixture = await stateFixture(t);
  const calls = [];
  const store = await openGateBTestnetFaucetReceiveState(fixture.walletRoot, stateInjections({
    async aclInspector(target, expectedMode) {
      calls.push([target.split('/').at(-1), expectedMode]);
      return true;
    },
  }));
  await store.arm();
  await store.load();
  await store.close();
  assert.equal(calls.some(([leaf, mode]) =>
    leaf === 'zenon-x402-gate-b-faucet-receive' && mode === 'drwx------'), true);
  assert.equal(calls.some(([leaf, mode]) =>
    leaf === '.faucet-receive-once' && mode === '-rw-------'), true);
  assert.equal(calls.some(([leaf, mode]) =>
    leaf === 'faucet-receive-recovery.json' && mode === '-rw-------'), true);
  assert.equal(calls.some(([leaf, mode]) =>
    leaf.startsWith('.faucet-receive-recovery.json.') && mode === '-rw-------'), true);
});

test('faucet receiver state rejects ACL presence and retained directory identity drift', async t => {
  await t.test('ACL presence', async () => {
    const fixture = await stateFixture(t);
    const store = await openGateBTestnetFaucetReceiveState(fixture.walletRoot, stateInjections({
      aclInspector: async target => !target.endsWith('/.faucet-receive-once'),
    }));
    await assert.rejects(() => store.arm());
    await store.close();
  });

  await t.test('descriptor identity drift', async () => {
    const fixture = await stateFixture(t);
    let drift = false;
    const store = await openGateBTestnetFaucetReceiveState(fixture.walletRoot, stateInjections({
      decorateDirectoryHandle(handle) {
        return {
          close: handle.close.bind(handle),
          stat: async options => {
            const value = await handle.stat(options);
            if (!drift) return value;
            return {
              ...value,
              ino: value.ino + 1n,
              isDirectory: value.isDirectory.bind(value),
              isSymbolicLink: value.isSymbolicLink.bind(value),
            };
          },
          sync: handle.sync.bind(handle),
        };
      },
    }));
    drift = true;
    await assert.rejects(() => store.load());
    drift = false;
    await store.close();
  });
});

test('faucet receiver state detects pathname replacement across rename and fsync', async t => {
  const fixture = await stateFixture(t);
  const stateRoot = join(fixture.supportRoot, 'zenon-x402-gate-b-faucet-receive');
  const displaced = join(fixture.supportRoot, 'displaced-faucet-receive-state');
  let replaceAfterRename = false;
  const store = await openGateBTestnetFaucetReceiveState(fixture.walletRoot, stateInjections({
    async renamePath(source, destination) {
      await rename(source, destination);
      if (replaceAfterRename) {
        replaceAfterRename = false;
        await rename(stateRoot, displaced);
        await mkdir(stateRoot, { mode: 0o700 });
      }
    },
  }));
  replaceAfterRename = true;
  await assert.rejects(() => store.arm());
  await store.close();
});

test('faucet receiver validates readiness before wallet access and completes two sequential receives', async () => {
  const harness = executionHarness();
  let result;
  try {
    result = await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections);
  } catch {
    assert.fail(`PHASE=${harness.events.at(-1)}`);
  }
  assert.equal(result, 'complete');
  assert.equal(harness.publicationCalls(), 2);
  assert.equal(harness.keyClearCalls(), 1);
  assert.equal(harness.clearCalls(), 1);
  assert.ok(harness.events.indexOf('readiness') < harness.events.indexOf('workspace.open.buyer-wallet.json'));
  assert.ok(harness.events.indexOf('lookup.0') < harness.events.indexOf('prepare.1'));
  assert.ok(harness.events.indexOf('state.second-attempt.commit') <
    harness.events.indexOf('prepare.1'));
  assert.deepEqual(
    harness.state.attemptSnapshot().secondSource,
    secondSourceSnapshot(harness.sources[1]),
  );
  assert.equal(harness.state.snapshot().state, 'COMPLETE');
});

test('fresh execution losing the shared second-attempt race stops before index-one preparation',
  async () => {
    const harness = executionHarness({ secondCommitAttemptError: true });
    assert.equal(
      await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
      'outcome-unknown',
    );
    assert.equal(harness.events.includes('state.second-attempt.commit'), true);
    assert.equal(harness.events.includes('prepare.0'), true);
    assert.equal(harness.events.includes('publish.0'), true);
    assert.equal(harness.events.includes('prepare.1'), false);
    assert.equal(harness.events.includes('publish.1'), false);
    assert.equal(harness.publicationCalls(), 1);
    assert.equal(harness.state.snapshot().state, 'INCLUDED');
    assert.equal(harness.state.snapshot().blocks.length, 1);
  });

test('post-sign pre-persistence failure permanently blocks index-one re-signing', async () => {
  const harness = executionHarness({ failSecondPreparedOnce: true });
  await assert.rejects(() => executeGateBTestnetFaucetReceive(
    bootstrap(),
    harness.injections,
  ));
  assert.equal(harness.events.includes('state.second-attempt.commit'), true);
  assert.equal(harness.events.includes('prepare.1'), true);
  assert.equal(harness.events.includes('publish.1'), false);
  assert.equal(harness.state.snapshot().state, 'INCLUDED');
  assert.equal(harness.state.snapshot().blocks.length, 1);
  const walletReads = harness.events.filter(value =>
    value === 'workspace.read.buyer-wallet.json').length;
  const indexOnePreparations = harness.events.filter(value => value === 'prepare.1').length;
  const publications = harness.publicationCalls();
  assert.equal(
    await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
    'outcome-unknown',
  );
  assert.equal(harness.events.filter(value =>
    value === 'workspace.read.buyer-wallet.json').length, walletReads);
  assert.equal(harness.events.filter(value => value === 'prepare.1').length,
    indexOnePreparations);
  assert.equal(harness.publicationCalls(), publications);
  assert.equal(harness.state.snapshot().state, 'INCLUDED');
  assert.equal(harness.state.snapshot().blocks.length, 1);
});

test('production receive validator accepts the actual pinned SDK composite with deterministic PoW',
  async () => {
    const zenon = sdk.Zenon.getInstance();
    const prior = {
      chain: sdk.Zenon.getChainIdentifier(),
      clearConnection: Object.getOwnPropertyDescriptor(zenon, 'clearConnection'),
      client: zenon.client,
      embedded: zenon.embedded,
      initialize: Object.getOwnPropertyDescriptor(zenon, 'initialize'),
      ledger: zenon.ledger,
      network: sdk.Zenon.getNetworkID(),
      pow: sdk.Zenon.getPowProvider(),
    };
    let mnemonic = '';
    let fixtureKeyPair;
    try {
      sdk.Zenon.setPowProvider(undefined);
      const fixtureWallet = sdk.KeyStore.fromEntropy('01'.repeat(32));
      mnemonic = fixtureWallet.mnemonic;
      fixtureKeyPair = fixtureWallet.getKeyPair(0);
      const address = fixtureKeyPair.getAddress();
      const expectedAddress = address.toString();
      const sources = [
        sourceBlock(address, sdk.ZNN_ZTS, 'actual-sdk-source-znn'),
        sourceBlock(address, sdk.QSR_ZTS, 'actual-sdk-source-qsr'),
      ];
      const sourceByHash = new Map(sources.map(block => [block.hash.toString(), block]));
      const includedByHash = new Map();
      let frontier = null;
      let publications = 0;
      let powCalls = 0;
      zenon.client = undefined;
      zenon.initialize = async () => {};
      zenon.clearConnection = () => { zenon.client = undefined; };
      zenon.ledger = {
        async getAccountBlockByHash(hash) {
          return sourceByHash.get(hash.toString()) ?? includedByHash.get(hash.toString()) ?? null;
        },
        async getFrontierAccountBlock() { return frontier; },
        async getFrontierMomentum() {
          return { hash: sdk.Hash.digest(Buffer.from('actual-sdk-momentum')), height: 9 };
        },
        async getUnconfirmedBlocksByAddress() {
          return new sdk.AccountBlockList(0, [], false);
        },
        async getUnreceivedBlocksByAddress() {
          return new sdk.AccountBlockList(2, sources, false);
        },
        async publishRawTransaction(prepared) {
          publications += 1;
          frontier = new sdk.AccountBlock({
            ...prepared,
            confirmationDetail: new sdk.AccountBlockConfirmationDetail(
              1,
              20 + publications,
              sdk.Hash.digest(Buffer.from(`actual-sdk-confirmation-${publications}`)),
              1,
            ),
          });
          includedByHash.set(prepared.hash.toString(), frontier);
          return prepared;
        },
      };
      zenon.embedded = {
        plasma: {
          async getRequiredPoWForAccountBlock() {
            return { availablePlasma: 0, basePlasma: 0, requiredDifficulty: 1 };
          },
        },
      };
      const events = [];
      const state = memoryState(events);
      const walletInput = Buffer.from(`${JSON.stringify({
        accountIndex: 0,
        mnemonic,
        secretVersion: 1,
      })}\n`);
      const addressInput = Buffer.from(`${JSON.stringify({
        accountIndex: 0,
        address: expectedAddress,
        addressVersion: 1,
      })}\n`);
      const workspace = {
        assertDistinct: () => true,
        async close() {},
        async openInputs(names) { return [{ name: names[0] }]; },
        async read(record) {
          return Buffer.from(record.name === 'buyer-wallet.json' ? walletInput : addressInput);
        },
        async verify() { return true; },
      };
      const ed = await import('@noble/ed25519');
      const { sha512 } = await import('@noble/hashes/sha2');
      ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
      const result = await executeGateBTestnetFaucetReceive(bootstrap(), {
        actualCwdPath: () => join(
          process.cwd(),
          'synthetic-actual-sdk',
          WALLET_WORKSPACE_NAME,
        ),
        applicationSupportRoot: () => dirname(join(
          process.cwd(),
          'synthetic-actual-sdk',
          WALLET_WORKSPACE_NAME,
        )),
        assertNodeReady: async () => ({ chainId: EXPECTED_CHAIN_ID }),
        createPolicy: policy,
        async invokeComposite(instance, template, keyPair) {
          sdk.Zenon.setPowProvider(async (_hash, difficulty) => {
            assert.equal(difficulty, 1);
            powCalls += 1;
            return powCalls.toString(16).padStart(16, '0');
          });
          try {
            return await invokeLegacySdk105SignedComposite(instance, template, keyPair);
          } finally {
            sdk.Zenon.setPowProvider(undefined);
          }
        },
        loadDependencies: async () => ({ ed, sdk }),
        now: (() => { let value = 0; return () => { value += 120_001; return value; }; })(),
        onPublicationStart: async () => true,
        openReceiveState: async () => state,
        openWalletWorkspace: async () => workspace,
        runtime: {
          async withOwner(_owner, work) {
            return work({
              poison() {},
              async runRpcWithDeadline({ execute }) { return execute(); },
            });
          },
        },
        wait: async () => {},
      });
      assert.equal(result, 'complete');
      assert.equal(powCalls, 2);
      assert.equal(publications, 2);
      assert.equal(state.snapshot().state, 'COMPLETE');
    } finally {
      mnemonic = '';
      try { fixtureKeyPair?.clear(); } catch {}
      sdk.Zenon.setPowProvider(prior.pow);
      sdk.Zenon.setChainID(prior.chain);
      sdk.Zenon.setNetworkID(prior.network);
      zenon.ledger = prior.ledger;
      zenon.embedded = prior.embedded;
      zenon.client = prior.client;
      if (prior.initialize) Object.defineProperty(zenon, 'initialize', prior.initialize);
      else delete zenon.initialize;
      if (prior.clearConnection) {
        Object.defineProperty(zenon, 'clearConnection', prior.clearConnection);
      } else delete zenon.clearConnection;
    }
  });

test('faucet receiver rejects a changing pending snapshot before wallet access', async () => {
  const harness = executionHarness({ pendingMutation: true });
  await assert.rejects(() => executeGateBTestnetFaucetReceive(bootstrap(), harness.injections));
  assert.equal(harness.events.includes('workspace.open.buyer-wallet.json'), false);
  assert.equal(harness.publicationCalls(), 0);
});

test('faucet receiver rejects every non-exact pending source set before wallet access', async () => {
  const cases = [
    sources => [sources[0]],
    sources => [sources[0], sources[0]],
    (sources, context) => [
      sources[0],
      sourceBlock(context.expectedAddressObject, context.sdk.ZNN_ZTS, 'other-znn'),
    ],
    (sources, context) => [
      sources[0],
      sourceBlock(context.expectedAddressObject, context.sdk.EMPTY_ZTS, 'unsupported'),
    ],
    (sources, context) => {
      const invalid = sourceBlock(context.expectedAddressObject, context.sdk.QSR_ZTS, 'zero');
      invalid.amount = 0n;
      return [sources[0], invalid];
    },
    (sources, context) => [
      sources[0],
      sourceBlock(
        context.sdk.Address.fromPublicKey(Buffer.alloc(32, 7)),
        context.sdk.QSR_ZTS,
        'wrong-destination',
      ),
    ],
  ];
  for (const mutateSources of cases) {
    const harness = executionHarness({ mutateSources });
    await assert.rejects(() => executeGateBTestnetFaucetReceive(
      bootstrap(),
      harness.injections,
    ));
    assert.equal(harness.events.includes('workspace.open.buyer-wallet.json'), false);
    assert.equal(harness.publicationCalls(), 0);
  }
});

test('faucet receiver rejects hostile pending hash storage without invoking hooks', async () => {
  for (const kind of ['proxy-core', 'accessor-hash']) {
    let hooks = 0;
    const harness = executionHarness({
      mutateSources(sources) {
        if (kind === 'proxy-core') {
          sources[0].hash.core = new Proxy(sources[0].hash.core, {
            get() { hooks += 1; throw new Error('synthetic'); },
          });
        } else {
          Object.defineProperty(sources[0], 'hash', {
            configurable: true,
            enumerable: true,
            get() { hooks += 1; throw new Error('synthetic'); },
          });
        }
        return sources;
      },
    });
    await assert.rejects(() => executeGateBTestnetFaucetReceive(
      bootstrap(),
      harness.injections,
    ));
    assert.equal(hooks, 0);
    assert.equal(harness.events.includes('workspace.open.buyer-wallet.json'), false);
    assert.equal(harness.publicationCalls(), 0);
  }
});

test('faucet receiver rejects conflicting unconfirmed state before wallet access', async () => {
  const harness = executionHarness({ unconfirmedCount: 1 });
  await assert.rejects(() => executeGateBTestnetFaucetReceive(bootstrap(), harness.injections));
  assert.equal(harness.events.includes('workspace.open.buyer-wallet.json'), false);
  assert.equal(harness.publicationCalls(), 0);
});

test('faucet receiver rejects wrong readiness identity before wallet access', async () => {
  const harness = executionHarness({ readinessChainId: EXPECTED_CHAIN_ID + 1 });
  await assert.rejects(() => executeGateBTestnetFaucetReceive(bootstrap(), harness.injections));
  assert.equal(harness.events.includes('workspace.open.buyer-wallet.json'), false);
  assert.equal(harness.publicationCalls(), 0);
});

test('faucet receiver rejects a wallet/address mismatch before preparation', async () => {
  const harness = executionHarness({ derivedAddressMatches: false });
  await assert.rejects(() => executeGateBTestnetFaucetReceive(bootstrap(), harness.injections));
  assert.equal(harness.events.includes('prepare.0'), false);
  assert.equal(harness.publicationCalls(), 0);
  assert.equal(harness.keyClearCalls(), 1);
});

test('faucet receiver rejects fused preparation and never publishes', async () => {
  const harness = executionHarness({ fusedAt: 0 });
  await assert.rejects(() => executeGateBTestnetFaucetReceive(bootstrap(), harness.injections));
  assert.equal(harness.publicationCalls(), 0);
  assert.equal(harness.keyClearCalls(), 1);
});

test('faucet receiver rejects outgoing or no-PoW prepared blocks and never publishes', async () => {
  for (const options of [{ outgoingAt: 0 }, { noPowAt: 0 }]) {
    const harness = executionHarness(options);
    await assert.rejects(() => executeGateBTestnetFaucetReceive(bootstrap(), harness.injections));
    assert.equal(harness.publicationCalls(), 0);
    assert.equal(harness.keyClearCalls(), 1);
  }
});

test('first publication ambiguity persists UNKNOWN, poisons, and never prepares the second', async () => {
  const harness = executionHarness({ failPublicationAt: 0 });
  assert.equal(
    await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
    'outcome-unknown',
  );
  assert.equal(harness.publicationCalls(), 1);
  assert.equal(harness.events.includes('prepare.1'), false);
  assert.equal(harness.state.snapshot().state, 'UNKNOWN');
  assert.equal(harness.poisonCalls(), 1);
});

test('second publication ambiguity preserves first inclusion and never retries', async () => {
  const harness = executionHarness({ failPublicationAt: 1 });
  assert.equal(
    await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
    'outcome-unknown',
  );
  assert.equal(harness.publicationCalls(), 2);
  assert.deepEqual(
    harness.events.filter(value => value.startsWith('publish.')),
    ['publish.0', 'publish.1'],
  );
  assert.equal(harness.state.snapshot().blocks[0].state, 'INCLUDED');
  assert.equal(harness.state.snapshot().blocks[1].state, 'UNKNOWN');
});

test('released SDK base64-as-ASCII observation normalizes only both signature fields', async () => {
  for (const encoding of ['binary', 'base64-as-ascii']) {
    const existing = persistedRecoveryRecord('COMPLETE');
    const harness = executionHarness({
      existing,
      recoveredIndexes: [0, 1],
      recoveryObservationMutation(observed, index) {
        if (encoding === 'base64-as-ascii') {
          const released = sdk.AccountBlock.fromJson(
            existing.blocks[index].signedAccountBlock,
          );
          observed.publicKey = released.publicKey;
          observed.signature = released.signature;
        }
        return observed;
      },
    });
    assert.equal(
      await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
      'recovered',
      encoding,
    );
    assert.equal(harness.publicationCalls(), 0, encoding);
    assert.equal(harness.events.some(value => value.startsWith('workspace.')), false, encoding);
  }
});

test('RPC signature compatibility rejects malformed or mixed encodings', async () => {
  const cases = [
    (observed, stored) => { observed.publicKey = Buffer.from(stored.publicKey); },
    (observed, stored) => { observed.signature = Buffer.from(stored.signature); },
    observed => { observed.publicKey = Buffer.alloc(31); },
    observed => { observed.signature = Buffer.alloc(63); },
    (observed, stored) => {
      observed.publicKey = Buffer.from(`${stored.publicKey.slice(0, -1)}A`);
      observed.signature = Buffer.from(stored.signature);
    },
  ];
  for (const mutate of cases) {
    const existing = persistedRecoveryRecord('COMPLETE');
    const harness = executionHarness({
      existing,
      recoveredIndexes: [0, 1],
      recoveryObservationMutation(observed, index) {
        if (index === 0) mutate(observed, existing.blocks[index].signedAccountBlock);
        return observed;
      },
    });
    assert.equal(
      await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
      'outcome-unknown',
    );
    assert.equal(harness.publicationCalls(), 0);
    assert.equal(harness.events.some(value => value.startsWith('workspace.')), false);
  }
});

test('RPC inclusion compatibility preserves exact equality for every other signed field', async () => {
  const otherAddress = sdk.Address.fromPublicKey(Buffer.alloc(32, 9));
  const mutations = [
    observed => { observed.version += 1; },
    observed => { observed.chainIdentifier += 1; },
    observed => { observed.blockType = sdk.BlockTypeEnum.UserSend; },
    observed => { observed.hash = sdk.Hash.digest(Buffer.from('mismatch-hash')); },
    observed => { observed.previousHash = sdk.Hash.digest(Buffer.from('mismatch-previous')); },
    observed => { observed.height += 1; },
    observed => {
      observed.momentumAcknowledged = new sdk.HashHeight(
        sdk.Hash.digest(Buffer.from('mismatch-momentum')),
        observed.momentumAcknowledged.height,
      );
    },
    observed => {
      observed.momentumAcknowledged = new sdk.HashHeight(
        observed.momentumAcknowledged.hash,
        observed.momentumAcknowledged.height + 1,
      );
    },
    observed => { observed.address = otherAddress; },
    observed => { observed.toAddress = otherAddress; },
    observed => { observed.amount = 1n; },
    observed => { observed.tokenStandard = sdk.ZNN_ZTS; },
    observed => { observed.fromBlockHash = sdk.Hash.digest(Buffer.from('mismatch-source')); },
    observed => { observed.data = Buffer.from('mismatch-data'); },
    observed => { observed.fusedPlasma = 1; },
    observed => { observed.difficulty += 1; },
    observed => { observed.nonce = '0200000000000000'; },
  ];
  for (const mutate of mutations) {
    const existing = persistedRecoveryRecord('COMPLETE');
    const harness = executionHarness({
      existing,
      recoveredIndexes: [0, 1],
      recoveryObservationMutation(observed, index) {
        if (index === 0) mutate(observed);
        return observed;
      },
    });
    assert.equal(
      await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
      'outcome-unknown',
    );
    assert.equal(harness.publicationCalls(), 0);
  }
});

test('one-record UNKNOWN continues only the complementary index-one receive after exact recovery',
  async () => {
    const existing = persistedRecoveryRecord('UNKNOWN', 1);
    const harness = executionHarness({ existing, recoveredIndexes: [0] });
    assert.equal(
      await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
      'partial-complete',
    );
    assert.equal(harness.publicationCalls(), 1);
    assert.equal(harness.events.includes('prepare.0'), false);
    assert.equal(harness.events.includes('publish.0'), false);
    assert.equal(harness.events.includes('prepare.1'), true);
    assert.equal(harness.events.includes('publish.1'), true);
    assert.ok(harness.events.indexOf('state.INCLUDED.0') < harness.events.indexOf('pending.1'));
    assert.ok(harness.events.indexOf('unconfirmed') <
      harness.events.indexOf('workspace.open.buyer-wallet.json'));
    assert.ok(harness.events.indexOf('state.second-attempt.commit') <
      harness.events.indexOf('workspace.open.buyer-wallet.json'));
    assert.ok(harness.events.lastIndexOf('lookup.unknown') <
      harness.events.indexOf('workspace.open.buyer-wallet.json'));
    assert.deepEqual(harness.state.attemptSnapshot(), secondReceiveAttemptFor(existing));
    assert.equal(harness.state.snapshot().state, 'COMPLETE');
    assert.deepEqual(harness.state.snapshot().blocks.map(block => block.state), [
      'INCLUDED',
      'INCLUDED',
    ]);
    assert.equal(harness.state.snapshot().blocks[1].signedAccountBlock.height, 2);
    assert.equal(
      harness.state.snapshot().blocks[1].signedAccountBlock.previousHash,
      harness.state.snapshot().blocks[0].signedAccountBlock.hash,
    );
  });

test('one-record recovery rejects a non-successor index-one preparation before publication',
  async () => {
    const cases = [
      {
        name: 'wrong-height',
        mutate(template) { template.height += 1; },
      },
      {
        name: 'wrong-predecessor',
        mutate(template) {
          template.previousHash = sdk.Hash.digest(Buffer.from('wrong-partial-predecessor'));
        },
      },
    ];
    for (const fixture of cases) {
      const existing = persistedRecoveryRecord('UNKNOWN', 1);
      const harness = executionHarness({
        existing,
        partialSuccessorMutation: fixture.mutate,
        recoveredIndexes: [0],
      });
      await assert.rejects(
        () => executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
        fixture.name,
      );
      assert.equal(harness.events.includes('prepare.1'), true, fixture.name);
      assert.equal(harness.events.includes('publishing.1'), false, fixture.name);
      assert.equal(harness.publicationCalls(), 0, fixture.name);
      assert.equal(harness.state.snapshot().blocks.length, 1, fixture.name);
    }
  });

test('one-record recovery is fresh-account-only and frontier-bound before wallet access',
  async () => {
    const cases = [
      {
        name: 'non-first-height',
        mutate(existing) {
          existing.blocks[0].signedAccountBlock.height = 2;
        },
      },
      {
        name: 'non-empty-predecessor',
        mutate(existing) {
          existing.blocks[0].signedAccountBlock.previousHash =
            sdk.Hash.digest(Buffer.from('nonempty-predecessor')).toString();
        },
      },
      { name: 'missing-frontier', options: { recoveryFrontierMutation: () => null } },
      {
        name: 'intervening-frontier',
        options: {
          recoveryFrontierMutation(frontier) {
            const other = new sdk.AccountBlock({ ...frontier, height: frontier.height + 1 });
            other.hash = computeBlockHash(other, sdk);
            return other;
          },
        },
      },
    ];
    for (const fixture of cases) {
      const existing = persistedRecoveryRecord('UNKNOWN', 1);
      fixture.mutate?.(existing);
      const harness = executionHarness({
        existing,
        recoveredIndexes: [0],
        ...(fixture.options ?? {}),
      });
      assert.equal(
        await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
        'outcome-unknown',
        fixture.name,
      );
      assert.equal(harness.events.some(value => value.startsWith('workspace.')), false,
        fixture.name);
      assert.equal(harness.events.some(value => value.startsWith('prepare.')), false,
        fixture.name);
      assert.equal(harness.publicationCalls(), 0, fixture.name);
    }
  });

test('one-record recovery binds both source contents and rejects a changed committed source',
  async () => {
    const cases = [
      {
        name: 'declared-hash-disagrees-with-content',
        options: {
          recoveryRemainingSourceMutation(source) {
            source.amount += 1n;
            return source;
          },
        },
      },
      {
        name: 'first-source-declared-hash-disagrees-with-content',
        options: {
          recoverySourceMutation(source) {
            source.amount += 1n;
            return source;
          },
        },
      },
      {
        name: 'pending-and-looked-up-remaining-source-disagree',
        options: {
          recoveryRemainingLookupMutation(source, read) {
            if (read !== 1) return source;
            const changed = new sdk.AccountBlock({ ...source, amount: source.amount + 1n });
            changed.hash = source.hash;
            return changed;
          },
        },
      },
      {
        name: 'remaining-source-confirmed-after-receive-boundary',
        options: {
          recoveryRemainingSourceMutation(source) {
            source.confirmationDetail = new sdk.AccountBlockConfirmationDetail(
              1,
              3,
              sdk.Hash.digest(Buffer.from('late-source-confirmation')),
              1,
            );
            return source;
          },
        },
      },
      {
        name: 'first-source-confirmation-unavailable',
        options: {
          recoverySourceMutation(source) {
            source.confirmationDetail = null;
            return source;
          },
        },
      },
      {
        name: 'remaining-source-changes-after-commit',
        options: {
          recoveryRemainingLookupMutation(source, read) {
            if (read === 1) return source;
            const changed = new sdk.AccountBlock({ ...source, amount: source.amount + 1n });
            changed.hash = source.hash;
            return changed;
          },
        },
      },
    ];
    for (const fixture of cases) {
      const existing = persistedRecoveryRecord('UNKNOWN', 1);
      const harness = executionHarness({
        existing,
        recoveredIndexes: [0],
        ...fixture.options,
      });
      assert.equal(
        await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
        'outcome-unknown',
        fixture.name,
      );
      assert.equal(harness.events.some(value => value.startsWith('workspace.')), false,
        fixture.name);
      assert.equal(harness.events.some(value => value.startsWith('prepare.')), false,
        fixture.name);
      assert.equal(harness.publicationCalls(), 0, fixture.name);
    }
  });

test('a durable second-receive attempt blocks every later wallet reopening', async () => {
  const existing = persistedRecoveryRecord('UNKNOWN', 1);
  const harness = executionHarness({
    existing,
    recoveredIndexes: [0],
    secondAttempt: secondReceiveAttemptFor(existing),
  });
  assert.equal(
    await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
    'outcome-unknown',
  );
  assert.equal(harness.events.some(value => value.startsWith('workspace.')), false);
  assert.equal(harness.events.some(value => value.startsWith('prepare.')), false);
  assert.equal(harness.publicationCalls(), 0);
});

test('recovery losing the shared second-attempt race stops before wallet access', async () => {
  const existing = persistedRecoveryRecord('UNKNOWN', 1);
  const harness = executionHarness({
    existing,
    recoveredIndexes: [0],
    secondCommitAttemptError: true,
  });
  assert.equal(
    await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
    'outcome-unknown',
  );
  assert.equal(harness.events.includes('state.second-attempt.commit'), true);
  assert.equal(harness.events.some(value => value.startsWith('workspace.')), false);
  assert.equal(harness.events.some(value => value.startsWith('prepare.')), false);
  assert.equal(harness.publicationCalls(), 0);
  assert.equal(harness.state.snapshot().state, 'INCLUDED');
  assert.equal(harness.state.snapshot().blocks.length, 1);
});

test('one-record recovery rejects every pre-publication identity ambiguity before wallet access',
  async () => {
    const cases = [
      { name: 'first-not-included', options: { recoveredIndexes: [] } },
      {
        name: 'first-still-pending',
        options: {
          recoveredIndexes: [0],
          recoveryPendingMutation(_base, _read, context) { return [context.recoverySource]; },
        },
      },
      {
        name: 'extra-pending',
        options: {
          recoveredIndexes: [0],
          recoveryPendingMutation(_base, _read, context) { return context.sources; },
        },
      },
      {
        name: 'unstable-replacement',
        options: {
          recoveredIndexes: [0],
          recoveryPendingMutation(base, read, context) {
            return read === 1 ? base : [sourceBlock(
              context.expectedAddressObject,
              context.sdk.QSR_ZTS,
              'unstable-replacement',
            )];
          },
        },
      },
      {
        name: 'same-asset-pair',
        options: {
          recoveredIndexes: [0],
          recoveryPendingMutation(_base, _read, context) {
            return [sourceBlock(context.expectedAddressObject, context.sdk.ZNN_ZTS, 'same-asset')];
          },
        },
      },
      {
        name: 'non-native-source',
        options: {
          recoveredIndexes: [0],
          recoveryPendingMutation(_base, _read, context) {
            return [sourceBlock(context.expectedAddressObject, context.sdk.EMPTY_ZTS, 'non-native')];
          },
        },
      },
      {
        name: 'address-mismatch',
        options: {
          recoveredIndexes: [0],
          recoveryPendingMutation(_base, _read, context) {
            return [sourceBlock(
              context.sdk.Address.fromPublicKey(Buffer.alloc(32, 8)),
              context.sdk.QSR_ZTS,
              'wrong-address',
            )];
          },
        },
      },
      { name: 'unconfirmed', options: { recoveredIndexes: [0], unconfirmedCount: 1 } },
      {
        name: 'malformed-first-source',
        options: {
          recoveredIndexes: [0],
          recoverySourceMutation(source) { source.amount = 0n; return source; },
        },
      },
      {
        name: 'source-lookup-ambiguity',
        options: { recoveredIndexes: [0], recoverySourceLookupThrows: true },
      },
    ];
    for (const fixture of cases) {
      const existing = persistedRecoveryRecord('UNKNOWN', 1);
      const harness = executionHarness({ existing, ...fixture.options });
      assert.equal(
        await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
        'outcome-unknown',
        fixture.name,
      );
      assert.equal(harness.events.some(value => value.startsWith('workspace.')), false,
        fixture.name);
      assert.equal(harness.events.some(value => value.startsWith('prepare.')), false,
        fixture.name);
      assert.equal(harness.publicationCalls(), 0, fixture.name);
      assert.equal(harness.keyClearCalls(), 0, fixture.name);
      assert.equal(harness.poisonCalls(), 1, fixture.name);
    }
  });

test('one-record recovery preserves an ambiguous index-one block without replacement', async () => {
  const existing = persistedRecoveryRecord('UNKNOWN', 1);
  const harness = executionHarness({
    existing,
    failPublicationAt: 1,
    recoveredIndexes: [0],
  });
  assert.equal(
    await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
    'outcome-unknown',
  );
  assert.equal(harness.publicationCalls(), 1);
  assert.deepEqual(
    harness.events.filter(value => value.startsWith('publish.')),
    ['publish.1'],
  );
  assert.equal(harness.state.snapshot().blocks[0].state, 'INCLUDED');
  assert.equal(harness.state.snapshot().blocks[1].state, 'UNKNOWN');
  assert.equal(harness.state.snapshot().blocks.length, 2);
});

test('two persisted receives recover only after both exact blocks are Momentum-included', async () => {
  for (const state of ['PREPARED', 'PUBLISHING', 'UNKNOWN', 'INCLUDED', 'COMPLETE', 'RECOVERED']) {
    const existing = persistedRecoveryRecord(state);
    const harness = executionHarness({ existing, recoveredIndexes: [0, 1] });
    assert.equal(
      await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
      'recovered',
      state,
    );
    assert.equal(harness.events.some(value => value.startsWith('workspace.')), false, state);
    assert.equal(harness.events.some(value => value.startsWith('prepare.')), false, state);
    assert.equal(harness.publicationCalls(), 0, state);
    assert.equal(harness.keyClearCalls(), 0, state);
    assert.equal(harness.poisonCalls(), 0, state);
    assert.equal(harness.state.snapshot().state,
      state === 'COMPLETE' ? 'COMPLETE' : 'RECOVERED', state);
  }
});

test('a persisted index one keeps recovery observation-only after a partial-attempt record',
  async () => {
    const existing = persistedRecoveryRecord('UNKNOWN');
    const harness = executionHarness({
      existing,
      recoveredIndexes: [0, 1],
      secondAttempt: secondReceiveAttemptFor(existing),
    });
    assert.equal(
      await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
      'recovered',
    );
    assert.equal(harness.events.some(value => value.startsWith('workspace.')), false);
    assert.equal(harness.events.some(value => value.startsWith('prepare.')), false);
    assert.equal(harness.publicationCalls(), 0);
  });

test('two persisted receives remain unknown when either inclusion is absent or field-mismatched',
  async () => {
    for (const mode of ['first-only', 'second-only', 'mismatch']) {
      const existing = persistedRecoveryRecord('UNKNOWN');
      const options = mode === 'first-only'
        ? { existing, recoveredIndexes: [0] }
        : mode === 'second-only'
          ? { existing, recoveredIndexes: [1] }
          : {
              existing,
              recoveredIndexes: [0, 1],
              recoveryObservationMutation(observed, index) {
                if (index === 1) {
                  observed.previousHash = sdk.Hash.digest(Buffer.from('mismatched-observation'));
                }
                return observed;
              },
            };
      const harness = executionHarness(options);
      assert.equal(
        await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
        'outcome-unknown',
        mode,
      );
      assert.equal(harness.events.some(value => value.startsWith('workspace.')), false, mode);
      assert.equal(harness.publicationCalls(), 0, mode);
      assert.equal(harness.poisonCalls(), 1, mode);
    }
  });

test('isolated child emits only primitive protocol messages', async () => {
  const channel = new EventEmitter();
  const messages = [];
  let exitCode;
  channel.send = (message, callback) => {
    messages.push(message);
    callback();
  };
  const work = runGateBTestnetFaucetReceiveChild({
    channel,
    execute: async (_bootstrap, injections) => {
      await injections.onExecutionMode(
        GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH,
      );
      await injections.onPublicationStart(0);
      await injections.onPublicationStart(1);
      return 'complete';
    },
    forceExit: code => { exitCode = code; },
    readBootstrap: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
  });
  await work;
  assert.deepEqual(messages, ['READY']);
  channel.emit('message', 'EXECUTE');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(messages, [
    'READY',
    GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH,
    'PUBLISHING_0',
    'PUBLISHING_1',
    'COMPLETE',
  ]);
  assert.equal(exitCode, 0);
  assert.equal(messages.every(value => typeof value === 'string'), true);
});

test('isolated child emits mode-matched partial and read-only terminal protocols', async () => {
  const cases = [
    {
      expected: [
        'READY',
        GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.PARTIAL_RECOVERY,
        'PUBLISHING_1',
        'PARTIAL_COMPLETE',
      ],
      index: 1,
      mode: GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.PARTIAL_RECOVERY,
      status: 'partial-complete',
    },
    {
      expected: [
        'READY',
        GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY,
        'RECOVERED',
      ],
      mode: GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY,
      status: 'recovered',
    },
  ];
  for (const fixture of cases) {
    const channel = new EventEmitter();
    const messages = [];
    let exitCode;
    channel.send = (message, callback) => {
      messages.push(message);
      callback();
    };
    const work = runGateBTestnetFaucetReceiveChild({
      channel,
      execute: async (_bootstrap, injections) => {
        await injections.onExecutionMode(fixture.mode);
        if (fixture.index !== undefined) {
          await injections.onPublicationStart(fixture.index);
        }
        return fixture.status;
      },
      forceExit: code => { exitCode = code; },
      readBootstrap: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
    });
    await work;
    channel.emit('message', 'EXECUTE');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(messages, fixture.expected);
    assert.equal(exitCode, 0);
  }
});

test('supervisor ignores child output and accepts exactly two publication boundaries', async t => {
  const fixture = await stateFixture(t);
  assert.equal(superviseGateBTestnetFaucetReceive.length, 1);
  assert.equal(superviseGateBTestnetFaucetReceiveForWorkspace.length, 2);
  let spawnOptions;
  let spawnArgs;
  const bootstrapChunks = [];
  class Child extends EventEmitter {
    constructor() {
      super();
      this.connected = true;
      this.channel = { close() {}, unref() {} };
      this.stdio = [null, null, null, null, new PassThrough()];
    }
    send(message, callback) {
      assert.equal(message, 'EXECUTE');
      callback();
      queueMicrotask(() => {
        this.emit('message', GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH);
        this.emit('message', 'PUBLISHING_0');
        this.emit('message', 'PUBLISHING_1');
        this.emit('message', 'COMPLETE');
        this.emit('exit', 0, null);
        this.emit('close', 0, null);
      });
      return true;
    }
    kill() { return true; }
    disconnect() { this.connected = false; }
  }
  const child = new Child();
  child.stdio[4].on('data', chunk => bootstrapChunks.push(Buffer.from(chunk)));
  child.stdio[4].on('finish', () => child.emit('message', 'READY'));
  assert.equal(await superviseGateBTestnetFaucetReceive({
    applicationSupportRoot: () => fixture.supportRoot,
    childModule: join(fixture.supportRoot, 'synthetic-child.js'),
    forkProcess(_module, args, options) {
      spawnArgs = args;
      spawnOptions = options;
      return child;
    },
    platform: 'darwin',
    readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
    timeoutMs: 1000,
  }), 'complete');
  assert.deepEqual(spawnArgs, []);
  assert.equal(spawnOptions.cwd, fixture.walletRoot);
  assert.deepEqual(spawnOptions.stdio.slice(0, 3), ['ignore', 'ignore', 'ignore']);
  assert.deepEqual(spawnOptions.env, {});
  assert.deepEqual(
    parseGateBTestnetFaucetReceiveFrame(Buffer.concat(bootstrapChunks)),
    bootstrap(),
  );
});

test('production generated faucet path uses cwd alone and keeps bootstrap and IPC path-free',
  async t => {
    const fixture = await stateFixture(t);
    const generatedRoot = join(
      fixture.supportRoot,
      `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`,
    );
    await mkdir(generatedRoot, { mode: 0o700 });
    await chmod(generatedRoot, 0o700);
    const bootstrapChunks = [];
    const transcript = [];
    let spawnRecord;
    class Child extends EventEmitter {
      constructor() {
        super();
        this.connected = true;
        this.channel = { close() {}, unref() {} };
        this.stdio = [null, null, null, null, new PassThrough()];
      }
      send(message, callback) {
        transcript.push(message);
        callback();
        queueMicrotask(() => {
          for (const response of [
            GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH,
            'PUBLISHING_0',
            'PUBLISHING_1',
            'COMPLETE',
          ]) {
            transcript.push(response);
            this.emit('message', response);
          }
          this.emit('exit', 0, null);
          this.emit('close', 0, null);
        });
        return true;
      }
      kill() { return true; }
      disconnect() { this.connected = false; }
    }
    const child = new Child();
    child.stdio[4].on('data', chunk => bootstrapChunks.push(Buffer.from(chunk)));
    child.stdio[4].on('finish', () => {
      transcript.push('READY');
      child.emit('message', 'READY');
    });
    const output = { stdout: '', stderr: '' };
    assert.equal(await runGateBTestnetFaucetReceiveCli({
      argv: [GATE_B_TESTNET_FAUCET_RECEIVE_WORKSPACE_OPTION, generatedRoot],
      stderr: value => { output.stderr += value; return Buffer.byteLength(value); },
      stdout: value => { output.stdout += value; return Buffer.byteLength(value); },
      supervisorInjections: {
        applicationSupportRoot: () => fixture.supportRoot,
        childModule: join(fixture.supportRoot, 'fixed-generated-child.js'),
        forkProcess(modulePath, argv, options) {
          spawnRecord = { argv, modulePath, options };
          return child;
        },
        platform: 'darwin',
        readBootstrapFrame: async () =>
          frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
        timeoutMs: 1000,
      },
    }), 0);
    assert.equal(output.stdout, GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES.COMPLETE);
    assert.equal(output.stderr, '');
    assert.deepEqual(spawnRecord.argv, []);
    assert.equal(spawnRecord.options.cwd, generatedRoot);
    assert.equal(spawnRecord.options.detached, false);
    assert.deepEqual(spawnRecord.options.env, {});
    assert.deepEqual(spawnRecord.options.execArgv, []);
    assert.equal(spawnRecord.options.shell, false);
    const framedBootstrap = Buffer.concat(bootstrapChunks);
    assert.deepEqual(parseGateBTestnetFaucetReceiveFrame(framedBootstrap), bootstrap());
    assert.equal(framedBootstrap.includes(Buffer.from(generatedRoot)), false);
    assert.equal(framedBootstrap.includes(Buffer.from(GENERATION_TOKEN)), false);
    assert.equal(transcript.every(value => typeof value === 'string'), true);
    assert.equal(JSON.stringify(transcript).includes(generatedRoot), false);
    assert.equal(JSON.stringify(transcript).includes(GENERATION_TOKEN), false);
  });

test('generated faucet supervisor rejects legacy, nested, and cross-root selection before fork',
  async t => {
    const fixture = await stateFixture(t);
    const rejected = [
      fixture.walletRoot,
      join(
        fixture.supportRoot,
        'nested',
        `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`,
      ),
      join(
        dirname(fixture.supportRoot),
        `${WALLET_WORKSPACE_NAME}-${GENERATION_TOKEN}`,
      ),
    ];
    for (const workspaceRoot of rejected) {
      let forks = 0;
      await assert.rejects(() => superviseGateBTestnetFaucetReceiveForWorkspace(
        workspaceRoot,
        {
          applicationSupportRoot: () => fixture.supportRoot,
          childModule: join(fixture.supportRoot, 'fixed-generated-child.js'),
          forkProcess() { forks += 1; throw new Error('unexpected'); },
          platform: 'darwin',
          readBootstrapFrame: async () =>
            frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
          timeoutMs: 1000,
        },
      ));
      assert.equal(forks, 0);
    }
  });

test('supervisor rejects a false completion without both publication boundaries', async t => {
  const fixture = await stateFixture(t);
  class Child extends EventEmitter {
    constructor() {
      super();
      this.connected = true;
      this.channel = { close() {}, unref() {} };
      this.stdio = [null, null, null, null, new PassThrough()];
    }
    send(message, callback) {
      assert.equal(message, 'EXECUTE');
      callback();
      queueMicrotask(() => {
        this.emit('message', GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH);
        this.emit('message', 'COMPLETE');
        this.emit('exit', 0, null);
        this.emit('close', 0, null);
      });
      return true;
    }
    kill() { return true; }
    disconnect() { this.connected = false; }
  }
  const child = new Child();
  child.stdio[4].on('finish', () => child.emit('message', 'READY'));
  await assert.rejects(() => superviseGateBTestnetFaucetReceive({
    applicationSupportRoot: () => fixture.supportRoot,
    childModule: join(fixture.supportRoot, 'synthetic-child.js'),
    forkProcess: () => child,
    platform: 'darwin',
    readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
    timeoutMs: 1000,
  }));
});

test('supervisor converts a post-publication timeout to unknown and reaps the child', async t => {
  const fixture = await stateFixture(t);
  let killed = 0;
  class Child extends EventEmitter {
    constructor() {
      super();
      this.connected = true;
      this.channel = { close() {}, unref() {} };
      this.stdio = [null, null, null, null, new PassThrough()];
    }
    send(message, callback) {
      assert.equal(message, 'EXECUTE');
      callback();
      queueMicrotask(() => {
        this.emit('message', GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH);
        this.emit('message', 'PUBLISHING_0');
      });
      return true;
    }
    kill() {
      killed += 1;
      queueMicrotask(() => this.emit('close', null, 'SIGTERM'));
      return true;
    }
    disconnect() { this.connected = false; }
  }
  const child = new Child();
  child.stdio[4].on('finish', () => child.emit('message', 'READY'));
  assert.equal(await superviseGateBTestnetFaucetReceive({
    applicationSupportRoot: () => fixture.supportRoot,
    childModule: join(fixture.supportRoot, 'synthetic-child.js'),
    forkProcess: () => child,
    platform: 'darwin',
    readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
    timeoutMs: 1000,
  }), 'outcome-unknown');
  assert.equal(killed, 1);
});

test('supervisor retains and cleans a malformed spawned child before rejecting', async t => {
  const fixture = await stateFixture(t);
  const signals = [];
  let disconnected = 0;
  let childUnref = 0;
  let channelClose = 0;
  let channelUnref = 0;
  class MalformedChild extends EventEmitter {
    constructor() {
      super();
      this.channel = {
        close() { channelClose += 1; },
        unref() { channelUnref += 1; },
      };
      this.stdio = [null];
    }
    disconnect() { disconnected += 1; }
    kill(signal) {
      signals.push(signal);
      queueMicrotask(() => this.emit('close', null, signal));
      return true;
    }
    unref() { childUnref += 1; }
  }
  await assert.rejects(() => superviseGateBTestnetFaucetReceive({
    applicationSupportRoot: () => fixture.supportRoot,
    childModule: join(fixture.supportRoot, 'synthetic-child.js'),
    forkProcess: () => new MalformedChild(),
    killMs: 20,
    platform: 'darwin',
    readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
    termMs: 5,
    timeoutMs: 1000,
  }));
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(disconnected >= 1, true);
  assert.equal(childUnref >= 1, true);
  assert.equal(channelClose >= 1, true);
  assert.equal(channelUnref >= 1, true);
});

test('supervisor maps malformed terminal data after PUBLISHING to unknown', async t => {
  const fixture = await stateFixture(t);
  class Child extends EventEmitter {
    constructor() {
      super();
      this.channel = { close() {}, unref() {} };
      this.stdio = [null, null, null, null, new PassThrough()];
    }
    disconnect() {}
    kill(signal) {
      queueMicrotask(() => this.emit('close', null, signal));
      return true;
    }
    send(_message, callback) {
      callback();
      queueMicrotask(() => {
        this.emit('message', GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH);
        this.emit('message', 'PUBLISHING_0');
        this.emit('message', 'MALFORMED');
      });
      return true;
    }
    unref() {}
  }
  const child = new Child();
  child.stdio[4].on('finish', () => child.emit('message', 'READY'));
  assert.equal(await superviseGateBTestnetFaucetReceive({
    applicationSupportRoot: () => fixture.supportRoot,
    childModule: join(fixture.supportRoot, 'synthetic-child.js'),
    forkProcess: () => child,
    killMs: 20,
    platform: 'darwin',
    readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
    termMs: 5,
    timeoutMs: 1000,
  }), 'outcome-unknown');
});

test('supervisor quarantines a never-closing child after PUBLISHING and remains unknown',
  async t => {
    const fixture = await stateFixture(t);
    const signals = [];
    let disconnected = 0;
    let childUnref = 0;
    let channelClose = 0;
    let channelUnref = 0;
    class Child extends EventEmitter {
      constructor() {
        super();
        this.channel = {
          close() { channelClose += 1; },
          unref() { channelUnref += 1; },
        };
        this.stdio = [null, null, null, null, new PassThrough()];
      }
      disconnect() { disconnected += 1; }
      kill(signal) { signals.push(signal); return true; }
      send(_message, callback) {
        callback();
        queueMicrotask(() => {
          this.emit('message', GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH);
          this.emit('message', 'PUBLISHING_0');
        });
        return true;
      }
      unref() { childUnref += 1; }
    }
    const child = new Child();
    child.stdio[4].on('finish', () => child.emit('message', 'READY'));
    assert.equal(await superviseGateBTestnetFaucetReceive({
      applicationSupportRoot: () => fixture.supportRoot,
      childModule: join(fixture.supportRoot, 'synthetic-child.js'),
      forkProcess: () => child,
      killMs: 20,
      platform: 'darwin',
      readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
      termMs: 5,
      timeoutMs: 1000,
    }), 'outcome-unknown');
    assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
    assert.equal(disconnected >= 1, true);
    assert.equal(childUnref >= 1, true);
    assert.equal(channelClose >= 1, true);
    assert.equal(channelUnref >= 1, true);
  });

test('supervisor accepts only mode-matched indexed partial and read-only traces', async t => {
  const fixture = await stateFixture(t);
  async function run(messages) {
    class Child extends EventEmitter {
      constructor() {
        super();
        this.connected = true;
        this.channel = { close() {}, unref() {} };
        this.stdio = [null, null, null, null, new PassThrough()];
      }
      disconnect() { this.connected = false; }
      kill() { return true; }
      send(_message, callback) {
        callback();
        queueMicrotask(() => {
          for (const message of messages) this.emit('message', message);
          this.emit('exit', 0, null);
          this.emit('close', 0, null);
        });
        return true;
      }
    }
    const child = new Child();
    child.stdio[4].on('finish', () => child.emit('message', 'READY'));
    return superviseGateBTestnetFaucetReceive({
      applicationSupportRoot: () => fixture.supportRoot,
      childModule: join(fixture.supportRoot, 'synthetic-child.js'),
      forkProcess: () => child,
      platform: 'darwin',
      readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
      timeoutMs: 1000,
    });
  }
  assert.equal(await run([
    GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.PARTIAL_RECOVERY,
    'PUBLISHING_1',
    'PARTIAL_COMPLETE',
  ]), 'partial-complete');
  assert.equal(await run([
    GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY,
    'RECOVERED',
  ]), 'recovered');
});

test('supervisor treats any wrong-index or pre-mode publication boundary as unknown', async t => {
  const fixture = await stateFixture(t);
  async function run(messages) {
    class Child extends EventEmitter {
      constructor() {
        super();
        this.connected = true;
        this.channel = { close() {}, unref() {} };
        this.stdio = [null, null, null, null, new PassThrough()];
      }
      disconnect() { this.connected = false; }
      kill(signal) {
        queueMicrotask(() => this.emit('close', null, signal));
        return true;
      }
      send(_message, callback) {
        callback();
        queueMicrotask(() => {
          for (const message of messages) this.emit('message', message);
        });
        return true;
      }
      unref() {}
    }
    const child = new Child();
    child.stdio[4].on('finish', () => child.emit('message', 'READY'));
    return superviseGateBTestnetFaucetReceive({
      applicationSupportRoot: () => fixture.supportRoot,
      childModule: join(fixture.supportRoot, 'synthetic-child.js'),
      forkProcess: () => child,
      killMs: 20,
      platform: 'darwin',
      readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
      termMs: 5,
      timeoutMs: 1000,
    });
  }
  const riskyInvalidSequences = [
    [GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH, 'PUBLISHING_1'],
    ['PUBLISHING_0'],
    [
      GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH,
      'PUBLISHING_0',
      'PUBLISHING_0',
    ],
    [
      GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY,
      'PUBLISHING_0',
    ],
    [
      GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.FRESH,
      'PUBLISHING_0',
      'PUBLISHING_1',
      'COMPLETE',
      'PUBLISHING_1',
    ],
    [
      GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.PARTIAL_RECOVERY,
      'PUBLISHING_1',
      'COMPLETE',
    ],
  ];
  for (const messages of riskyInvalidSequences) {
    assert.equal(await run(messages), 'outcome-unknown');
  }
  await assert.rejects(() => run([
    GATE_B_TESTNET_FAUCET_RECEIVE_EXECUTION_MODES.READ_ONLY_RECOVERY,
    'COMPLETE',
  ]));
});

test('supervisor latches indexed publication risk that arrives during bounded reaping',
  async t => {
    const fixture = await stateFixture(t);
    async function run(initialMessage) {
      class Child extends EventEmitter {
        constructor() {
          super();
          this.connected = true;
          this.channel = { close() {}, unref() {} };
          this.stdio = [null, null, null, null, new PassThrough()];
        }
        disconnect() { this.connected = false; }
        kill(signal) {
          queueMicrotask(() => {
            this.emit('message', 'PUBLISHING_0');
            this.emit('close', null, signal);
          });
          return true;
        }
        send(_message, callback) {
          callback();
          if (initialMessage !== undefined) {
            queueMicrotask(() => this.emit('message', initialMessage));
          }
          return true;
        }
        unref() {}
      }
      const child = new Child();
      child.stdio[4].on('finish', () => child.emit('message', 'READY'));
      return superviseGateBTestnetFaucetReceive({
        applicationSupportRoot: () => fixture.supportRoot,
        childModule: join(fixture.supportRoot, 'synthetic-child.js'),
        forkProcess: () => child,
        killMs: 20,
        platform: 'darwin',
        readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
        termMs: 5,
        timeoutMs: 1000,
      });
    }
    assert.equal(await run('MALFORMED'), 'outcome-unknown');
    assert.equal(await run(undefined), 'outcome-unknown');
  });

test('receiver modules are import safe and perform no action', () => {
  const moduleNames = [
    'gate-b-testnet-faucet-receive-schema.js',
    'gate-b-testnet-faucet-receive-state.js',
    'gate-b-testnet-faucet-receive-supervisor.js',
    'gate-b-testnet-faucet-receive-child.js',
    'gate-b-testnet-faucet-receive-cli.js',
  ];
  for (const name of moduleNames) {
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `await import(${JSON.stringify(new URL(`../src/${name}`, import.meta.url).href)})`,
    ], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
});
