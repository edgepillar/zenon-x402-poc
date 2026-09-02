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
  GATE_B_TESTNET_FAUCET_RECEIVE_STATUS_LINES,
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
import { superviseGateBTestnetFaucetReceive } from
  '../src/gate-b-testnet-faucet-receive-supervisor.js';
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
const EXPECTED_CHAIN_ID = Number(GATE_B_CURRENT_TESTNET_CHAIN_PROFILE.chainIdentifier);

function bootstrap() {
  return {
    acknowledgement: GATE_B_TESTNET_FAUCET_RECEIVE_ACKNOWLEDGEMENT,
    rpcEndpoint: SYNTHETIC_PUBLIC_WS,
    schemaVersion: 1,
  };
}

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

function persistedRecoveryRecord(state, blockCount = 2) {
  const blocks = [];
  for (let index = 0; index < blockCount; index += 1) {
    const signedAccountBlock = signedReceiveJson({}, `recovery-${index}`);
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

function memoryState(events, initial = null) {
  let record = initial === null ? null : structuredClone(initial);
  return {
    async load() { events.push('state.load'); return record && structuredClone(record); },
    async arm() {
      events.push('state.arm');
      record = { activeIndex: null, blocks: [], revision: 0, schemaVersion: 1, state: 'ARMED' };
      return structuredClone(record);
    },
    async update(next) {
      events.push(`state.${next.state}.${next.activeIndex ?? 'none'}`);
      record = structuredClone(next);
      return structuredClone(record);
    },
    async close() { events.push('state.close'); },
    snapshot() { return record && structuredClone(record); },
  };
}

function sourceBlock(address, tokenStandard, label) {
  return new sdk.AccountBlock({
    blockType: sdk.BlockTypeEnum.ContractSend,
    hash: sdk.Hash.digest(Buffer.from(label)),
    amount: 1n,
    tokenStandard,
    toAddress: address,
  });
}

function executionHarness({ failPublicationAt = -1, pendingMutation = false,
  fusedAt = -1, outgoingAt = -1, noPowAt = -1, existing = null,
  mutateSources = value => value, unconfirmedCount = 0,
  derivedAddressMatches = true, recoveredIndexes = [],
  recoveryObservationMutation = value => value,
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
  if (existing) {
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
  const zenon = {
    client: undefined,
    async initialize() { events.push('initialize'); },
    clearConnection() { clearCalls += 1; events.push('connection.clear'); },
    ledger: {
      async getUnreceivedBlocksByAddress() {
        pendingReads += 1;
        events.push(`pending.${pendingReads}`);
        const list = pendingMutation && pendingReads === 2 ? [sources[1], sources[0]] : sources;
        return new sdk.AccountBlockList(list.length, list, false);
      },
      async getUnconfirmedBlocksByAddress() {
        events.push('unconfirmed');
        const list = unconfirmedCount === 0 ? [] : [sources[0]];
        return new sdk.AccountBlockList(unconfirmedCount, list, false);
      },
      async publishRawTransaction(prepared) {
        const index = publicationCalls;
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
        return observedByHash.get(key) ?? null;
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
  const state = memoryState(events, existing);
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
      template.previousHash = sdk.Hash.digest(Buffer.from(`previous-${index}`));
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
      template.hash = computeBlockHash(template, sdk);
      preparedByHash.set(template.hash.toString(), index);
      return template;
    },
    loadDependencies: async () => {
      events.push('dependencies');
      return { ed: { verify: () => true }, sdk: fakeSdk };
    },
    now: (() => { let current = 0; return () => { current += 120_001; return current; }; })(),
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
  assert.deepEqual(await second.load(), armed);
  await assert.rejects(() => second.arm());
  const stateRoot = join(fixture.supportRoot, 'zenon-x402-gate-b-faucet-receive');
  assert.equal((await lstat(stateRoot)).mode & 0o777, 0o700);
  assert.equal((await lstat(join(stateRoot, '.faucet-receive-once'))).mode & 0o777, 0o600);
  assert.equal((await lstat(join(stateRoot, 'faucet-receive-recovery.json'))).mode & 0o777, 0o600);
  await second.close();
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
  assert.equal(harness.state.snapshot().state, 'COMPLETE');
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

test('every one-block crash state is permanently partial even when its block is included', async () => {
  for (const state of ['PREPARED', 'PUBLISHING', 'UNKNOWN', 'INCLUDED']) {
    const existing = persistedRecoveryRecord(state, 1);
    const harness = executionHarness({ existing, recoveredIndexes: [0] });
    assert.equal(
      await executeGateBTestnetFaucetReceive(bootstrap(), harness.injections),
      'outcome-unknown',
      state,
    );
    assert.equal(harness.events.some(value => value.startsWith('workspace.')), false, state);
    assert.equal(harness.events.some(value => value.startsWith('prepare.')), false, state);
    assert.equal(harness.publicationCalls(), 0, state);
    assert.equal(harness.keyClearCalls(), 0, state);
    assert.equal(harness.poisonCalls(), 1, state);
  }
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
    execute: async () => 'complete',
    forceExit: code => { exitCode = code; },
    readBootstrap: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
  });
  await work;
  assert.deepEqual(messages, ['READY']);
  channel.emit('message', 'EXECUTE');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(messages, ['READY', 'COMPLETE']);
  assert.equal(exitCode, 0);
  assert.equal(messages.every(value => typeof value === 'string'), true);
});

test('supervisor ignores child output and accepts exactly two publication boundaries', async t => {
  const fixture = await stateFixture(t);
  let spawnOptions;
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
        this.emit('message', 'PUBLISHING');
        this.emit('message', 'PUBLISHING');
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
  assert.equal(await superviseGateBTestnetFaucetReceive({
    applicationSupportRoot: () => fixture.supportRoot,
    childModule: join(fixture.supportRoot, 'synthetic-child.js'),
    forkProcess(_module, _args, options) { spawnOptions = options; return child; },
    platform: 'darwin',
    readBootstrapFrame: async () => frameGateBTestnetFaucetReceiveBootstrap(bootstrap()),
    timeoutMs: 1000,
  }), 'complete');
  assert.deepEqual(spawnOptions.stdio.slice(0, 3), ['ignore', 'ignore', 'ignore']);
  assert.deepEqual(spawnOptions.env, {});
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
      queueMicrotask(() => this.emit('message', 'PUBLISHING'));
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
        this.emit('message', 'PUBLISHING');
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
        queueMicrotask(() => this.emit('message', 'PUBLISHING'));
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
