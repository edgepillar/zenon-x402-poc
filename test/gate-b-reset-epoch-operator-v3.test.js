import assert from 'node:assert/strict';
import { constants as fsConstants, readFileSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/canonical.js';
import {
  GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3,
  GATE_B_RESET_EPOCH_STATUS_V3,
  parseGateBResetEpochAuthorizationArtifactV3,
  parseGateBResetEpochBootstrapArtifactV3,
  parseGateBResetEpochConfigurationArtifactV3,
  parseGateBResetEpochReviewArtifactV3,
} from '../src/gate-b-reset-epoch-artifacts-v3.js';
import {
  prepareAndPreflightGateBResetEpochArtifactsV3,
  preflightGateBResetEpochArtifactsV3,
} from '../src/gate-b-reset-epoch-filesystem-preflight-v3.js';
import {
  independentlyReviewGateBResetEpochConfigurationV3,
} from '../src/gate-b-reset-epoch-independent-review-v3.js';
import {
  executeGateBResetEpochOperatorV3,
  rejectGateBResetEpochOperatorPhase3V3,
} from '../src/gate-b-reset-epoch-operator-v3.js';
import {
  GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT,
  GATE_B_RESET_EPOCH_OPERATOR_V3_STATUS_LINES,
  runGateBResetEpochOperatorV3Cli,
} from '../src/gate-b-reset-epoch-operator-v3-cli.js';
import {
  bindGateBResetEpochOperatorBootstrapV3,
} from '../src/gate-b-reset-epoch-pre-wallet-entry-v3.js';
import { runGateBOperatorEntry } from '../src/gate-b-operator-front-end.js';
import { GATE_B_PUBLIC_WS_INPUT_LEAVES } from '../src/gate-b-public-ws-inputs-schema.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const OPERATOR_ERROR = 'gate_b_reset_epoch_operator_v3_invalid';

function resetEpochSelection(overrides = {}) {
  return {
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    wssAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
    ...overrides,
  };
}

function priorEpochSelection() {
  return {
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_EVENT_ID,
    liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
    operatorTrustAcknowledgement:
      PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_PROFILE_NAME,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ENDPOINT,
    wssAcknowledgement: PUBLIC_TESTNET_DYNAMIC_PLASMA_EPOCH_WSS_ACKNOWLEDGEMENT,
  };
}

function policyPreflight(selection = resetEpochSelection()) {
  return canonicalJson({ policySelection: selection, preflightVersion: 1 });
}

function entry(selection = resetEpochSelection()) {
  return {
    policyPreflight: policyPreflight(selection),
    schemaVersion: 3,
  };
}

function boundEntry(workspaceRoot, selection = resetEpochSelection()) {
  return bindGateBResetEpochOperatorBootstrapV3({
    ...entry(selection),
    workspaceRoot,
  });
}

function fakeResult() {
  return {
    schemaVersion: 3,
    status: GATE_B_RESET_EPOCH_STATUS_V3.PREFLIGHT_VALID,
  };
}

function assertSanitizedOperatorFailure(promise) {
  return assert.rejects(promise, error => {
    assert.equal(error?.name, 'GateBResetEpochOperatorV3Error');
    assert.equal(error?.code, OPERATOR_ERROR);
    assert.equal(error?.message, OPERATOR_ERROR);
    assert.equal(error?.stack, undefined);
    assert.equal(error?.cause, undefined);
    return true;
  });
}

function filesystemDependencies(root) {
  return {
    actualCwd: () => root,
    constants: fsConstants,
    getuid: () => process.getuid(),
    lstatPath: lstat,
    openPath: open,
    realpathPath: realpath,
    reviewConfiguration: independentlyReviewGateBResetEpochConfigurationV3,
  };
}

async function withPrivateWorkspace(t, callback) {
  const created = await mkdtemp(join(tmpdir(), 'gate-b-reset-epoch-v3-'));
  const root = await realpath(created);
  await chmod(root, 0o700);
  t.after(async () => { await rm(root, { force: true, recursive: true }); });
  return callback(root);
}

test('invalid, stale, mixed, and hostile v3 selection rejects before any dependency effect', async () => {
  const calls = [];
  const dependency = {
    currentWorkspaceRoot() {
      calls.push('workspace');
      return '/offline/workspace';
    },
    prepareAndPreflight() {
      calls.push('filesystem');
      return Promise.resolve(fakeResult());
    },
  };
  const reset = resetEpochSelection();
  const prior = priorEpochSelection();
  const mixed = Object.entries(prior)
    .filter(([field, value]) => reset[field] !== value)
    .map(([field, value]) => resetEpochSelection({ [field]: value }));
  for (const selection of [prior, ...mixed]) {
    await assertSanitizedOperatorFailure(
      executeGateBResetEpochOperatorV3(entry(selection), dependency),
    );
  }
  assert.deepEqual(calls, []);

  const traps = [];
  const hostileDependencies = new Proxy({}, {
    get() { traps.push('get'); },
    getOwnPropertyDescriptor() { traps.push('descriptor'); },
    getPrototypeOf() { traps.push('prototype'); },
    ownKeys() { traps.push('keys'); },
  });
  await assertSanitizedOperatorFailure(
    executeGateBResetEpochOperatorV3(entry(prior), hostileDependencies),
  );
  assert.deepEqual(traps, []);
});

test('valid v3 reaches the non-authorizing pause through one injected offline stage', async () => {
  const calls = [];
  const forbidden = {
    child: 0,
    network: 0,
    prepare: 0,
    provision: 0,
    rpc: 0,
    sdk: 0,
    tunnel: 0,
    wallet: 0,
  };
  const result = await executeGateBResetEpochOperatorV3(entry(), {
    currentWorkspaceRoot() {
      return '/offline/workspace';
    },
    async prepareAndPreflight(binding) {
      calls.push(binding);
      assert.equal(binding.schemaVersion, 3);
      assert.equal(binding.status, 'RUN_NOT_AUTHORIZED');
      assert.deepEqual(binding.policySelection, resetEpochSelection());
      return fakeResult();
    },
  });
  assert.deepEqual(result, fakeResult());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(forbidden, {
    child: 0,
    network: 0,
    prepare: 0,
    provision: 0,
    rpc: 0,
    sdk: 0,
    tunnel: 0,
    wallet: 0,
  });
});

test('default v3 offline path writes and independently reopens only its exact artifact family',
  async t => withPrivateWorkspace(t, async root => {
    const dependencies = filesystemDependencies(root);
    const originalCwd = process.cwd();
    let result;
    try {
      process.chdir(root);
      result = await executeGateBResetEpochOperatorV3(entry());
    } finally {
      process.chdir(originalCwd);
    }
    assert.deepEqual(result, fakeResult());

    const bytes = Object.create(null);
    for (const [kind, leaf] of Object.entries(GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3)) {
      bytes[kind] = await readFile(join(root, leaf));
    }
    const bootstrap = parseGateBResetEpochBootstrapArtifactV3(bytes.bootstrap);
    const configuration = parseGateBResetEpochConfigurationArtifactV3(bytes.configuration);
    const review = parseGateBResetEpochReviewArtifactV3(bytes.review);
    const authorization = parseGateBResetEpochAuthorizationArtifactV3(bytes.authorization);
    for (const artifact of [bootstrap, configuration, review, authorization]) {
      assert.deepEqual(artifact.policySelection, resetEpochSelection());
    }
    assert.equal(configuration.offlineOnly, true);
    assert.equal(configuration.runAuthorized, false);
    assert.equal(authorization.offlineOnly, true);
    assert.equal(authorization.runAuthorized, false);
    assert.equal(authorization.configurationDigest, review.configurationDigest);
    assert.deepEqual(
      await preflightGateBResetEpochArtifactsV3(
        boundEntry(root),
        dependencies,
      ),
      fakeResult(),
    );
    for (const leaf of Object.values(GATE_B_PUBLIC_WS_INPUT_LEAVES)) {
      await assert.rejects(lstat(join(root, leaf)), error => error?.code === 'ENOENT');
    }
  }));

test('v3 artifacts are one-use, tamper evident, and reject legacy workspace mixing', async t => {
  await withPrivateWorkspace(t, async root => {
    const dependencies = filesystemDependencies(root);
    const invoke = () => executeGateBResetEpochOperatorV3(entry(), {
      currentWorkspaceRoot: () => root,
      prepareAndPreflight: binding =>
        prepareAndPreflightGateBResetEpochArtifactsV3(binding, dependencies),
    });
    await invoke();
    const before = Object.create(null);
    for (const leaf of Object.values(GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3)) {
      before[leaf] = await readFile(join(root, leaf));
    }
    await assertSanitizedOperatorFailure(invoke());
    for (const leaf of Object.values(GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3)) {
      assert.equal((await readFile(join(root, leaf))).equals(before[leaf]), true);
    }
    await writeFile(
      join(root, GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.review),
      Buffer.from('{}\n'),
      { mode: 0o600 },
    );
    await assert.rejects(preflightGateBResetEpochArtifactsV3(
      boundEntry(root),
      dependencies,
    ));
  });

  await withPrivateWorkspace(t, async root => {
    const legacyLeaf = Object.values(GATE_B_PUBLIC_WS_INPUT_LEAVES)[0];
    await writeFile(join(root, legacyLeaf), Buffer.from('{}\n'), { mode: 0o600 });
    await assertSanitizedOperatorFailure(executeGateBResetEpochOperatorV3(entry(), {
      currentWorkspaceRoot: () => root,
      prepareAndPreflight: binding => prepareAndPreflightGateBResetEpochArtifactsV3(
        binding,
        filesystemDependencies(root),
      ),
    }));
    for (const leaf of Object.values(GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3)) {
      await assert.rejects(lstat(join(root, leaf)), error => error?.code === 'ENOENT');
    }
  });
});

test('v3 preflight fails closed when an artifact descriptor does not close cleanly', async t =>
  withPrivateWorkspace(t, async root => {
    const dependencies = filesystemDependencies(root);
    await executeGateBResetEpochOperatorV3(entry(), {
      currentWorkspaceRoot: () => root,
      prepareAndPreflight: binding =>
        prepareAndPreflightGateBResetEpochArtifactsV3(binding, dependencies),
    });

    const configurationPath = join(
      root,
      GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.configuration,
    );
    let closeAttempts = 0;
    const closeFailureDependencies = {
      ...dependencies,
      async openPath(path, flags, mode) {
        const handle = await open(path, flags, mode);
        if (path !== configurationPath) return handle;
        return {
          close: async () => {
            closeAttempts += 1;
            await handle.close();
            throw new Error('close acknowledgement unavailable');
          },
          read: handle.read.bind(handle),
          stat: handle.stat.bind(handle),
        };
      },
    };

    await assert.rejects(
      preflightGateBResetEpochArtifactsV3(
        boundEntry(root),
        closeFailureDependencies,
      ),
      error => error?.code === 'gate_b_reset_epoch_filesystem_preflight_v3_invalid',
    );
    assert.equal(closeAttempts, 2);
  }));

test('every v3 artifact parser rejects family or version downgrade', async t =>
  withPrivateWorkspace(t, async root => {
    const dependencies = filesystemDependencies(root);
    await executeGateBResetEpochOperatorV3(entry(), {
      currentWorkspaceRoot: () => root,
      prepareAndPreflight: binding =>
        prepareAndPreflightGateBResetEpochArtifactsV3(binding, dependencies),
    });
    const cases = [
      ['bootstrap', 'bootstrapVersion'],
      ['configuration', 'configurationVersion'],
      ['review', 'reviewVersion'],
      ['authorization', 'authorizationVersion'],
    ];
    const parsers = {
      authorization: parseGateBResetEpochAuthorizationArtifactV3,
      bootstrap: parseGateBResetEpochBootstrapArtifactV3,
      configuration: parseGateBResetEpochConfigurationArtifactV3,
      review: parseGateBResetEpochReviewArtifactV3,
    };
    for (const [kind, versionField] of cases) {
      const leaf = GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3[kind];
      const source = JSON.parse((await readFile(join(root, leaf), 'utf8')).trimEnd());
      for (const mutation of [
        { ...source, [versionField]: 2 },
        { ...source, artifactFamily: 'gate-b-current-testnet-wss-v2' },
      ]) {
        const bytes = Buffer.from(`${canonicalJson(mutation)}\n`);
        assert.throws(() => parsers[kind](bytes));
        bytes.fill(0);
      }
    }
  }));

test('the actual operator entry selects v3 exactly and preserves the no-argument legacy route',
  async () => {
    const calls = [];
    const runLegacy = async () => { calls.push('legacy'); return true; };
    const runResetEpochV3 = async options => {
      calls.push(['v3', options.argv]);
      return options.argv.length === 1;
    };
    assert.equal(await runGateBOperatorEntry({ argv: [], runLegacy, runResetEpochV3 }), true);
    assert.deepEqual(calls, ['legacy']);
    calls.length = 0;
    assert.equal(await runGateBOperatorEntry({
      argv: [GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT],
      runLegacy,
      runResetEpochV3,
    }), true);
    assert.deepEqual(calls, [[
      'v3',
      [GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT],
    ]]);
    calls.length = 0;
    assert.equal(await runGateBOperatorEntry({
      argv: [GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT, '--run'],
      runLegacy,
      runResetEpochV3,
    }), false);
    assert.deepEqual(calls, [[
      'v3',
      [GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT, '--run'],
    ]]);
    calls.length = 0;

    const hostileArgv = [];
    let reads = 0;
    Object.defineProperty(hostileArgv, '0', {
      enumerable: true,
      get() { reads += 1; return GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT; },
    });
    assert.equal(hostileArgv.length, 1);
    assert.equal(await runGateBOperatorEntry({
      argv: hostileArgv,
      runLegacy,
      runResetEpochV3,
    }), false);
    assert.equal(reads, 0);
    assert.deepEqual(calls, []);
  });

test('v3 CLI validates canonical selection before its injected offline execution', async () => {
  const outputs = [];
  const effects = [];
  const valid = canonicalJson(entry());
  const validResult = await runGateBResetEpochOperatorV3Cli({
    argv: [GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT],
    execute: candidate => executeGateBResetEpochOperatorV3(candidate, {
      currentWorkspaceRoot: () => '/offline/workspace',
      async prepareAndPreflight() {
        effects.push('offline-filesystem');
        return fakeResult();
      },
    }),
    stdin: [Buffer.from(valid)],
    stdout: line => { outputs.push(['stdout', line]); return Buffer.byteLength(line); },
    stderr: line => { outputs.push(['stderr', line]); return Buffer.byteLength(line); },
  });
  assert.equal(validResult, true);
  assert.deepEqual(effects, ['offline-filesystem']);
  assert.deepEqual(outputs, [[
    'stdout',
    GATE_B_RESET_EPOCH_OPERATOR_V3_STATUS_LINES.SUCCESS,
  ]]);

  outputs.length = 0;
  effects.length = 0;
  const invalid = canonicalJson(entry(priorEpochSelection()));
  const invalidResult = await runGateBResetEpochOperatorV3Cli({
    argv: [GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT],
    execute: candidate => executeGateBResetEpochOperatorV3(candidate, {
      currentWorkspaceRoot: () => '/offline/workspace',
      async prepareAndPreflight() {
        effects.push('forbidden');
        return fakeResult();
      },
    }),
    stdin: [Buffer.from(invalid)],
    stdout: line => { outputs.push(['stdout', line]); return Buffer.byteLength(line); },
    stderr: line => { outputs.push(['stderr', line]); return Buffer.byteLength(line); },
  });
  assert.equal(invalidResult, false);
  assert.deepEqual(effects, []);
  assert.deepEqual(outputs, [[
    'stderr',
    GATE_B_RESET_EPOCH_OPERATOR_V3_STATUS_LINES.FAILURE,
  ]]);

  outputs.length = 0;
  effects.length = 0;
  const phase3Attempt = await runGateBResetEpochOperatorV3Cli({
    argv: [GATE_B_RESET_EPOCH_OPERATOR_V3_ARGUMENT, '--run'],
    execute: async () => { effects.push('forbidden'); return fakeResult(); },
    stdin: [],
    stdout: line => { outputs.push(['stdout', line]); return Buffer.byteLength(line); },
    stderr: line => { outputs.push(['stderr', line]); return Buffer.byteLength(line); },
  });
  assert.equal(phase3Attempt, false);
  assert.deepEqual(effects, []);
  assert.deepEqual(outputs, [[
    'stderr',
    GATE_B_RESET_EPOCH_OPERATOR_V3_STATUS_LINES.FAILURE,
  ]]);
});

test('v3 Phase-3 RUN is unconditionally rejected without inspecting caller data', () => {
  const traps = [];
  const hostile = new Proxy({}, {
    get() { traps.push('get'); },
    getOwnPropertyDescriptor() { traps.push('descriptor'); },
    getPrototypeOf() { traps.push('prototype'); },
    ownKeys() { traps.push('keys'); },
  });
  assert.throws(
    () => rejectGateBResetEpochOperatorPhase3V3(hostile),
    error => error?.code === OPERATOR_ERROR && error?.stack === undefined,
  );
  assert.deepEqual(traps, []);
});

test('v3 production modules contain no legacy effect transition or process/network primitive', () => {
  const paths = [
    '../src/gate-b-reset-epoch-artifacts-v3.js',
    '../src/gate-b-reset-epoch-independent-review-v3.js',
    '../src/gate-b-reset-epoch-filesystem-preflight-v3.js',
    '../src/gate-b-reset-epoch-operator-v3.js',
    '../src/gate-b-reset-epoch-operator-v3-cli.js',
  ];
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /node:(?:child_process|dns|https?|http2|net|tls|worker_threads)/);
    assert.doesNotMatch(source, /znn-typescript-sdk|\.listen\s*\(|\.connect\s*\(|\bfetch\s*\(|\bWebSocket\b|\b(?:spawn|execFile|fork)\s*\(/);
    assert.doesNotMatch(source, /gate-b-(?:public-ws-inputs-controller|quick-tunnel-launcher)|live-evidence-runner/);
  }
});
