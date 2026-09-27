import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { canonicalJson } from '../src/canonical.js';
import {
  GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS,
  GATE_B_OPERATOR_COORDINATOR_IPC_TYPES,
  GATE_B_OPERATOR_COORDINATOR_STATUS_LINES,
  createGateBOperatorCoordinatorIpcMessage,
  frameGateBOperatorCoordinatorBootstrap,
  frameGateBOperatorCoordinatorReview,
} from '../src/gate-b-operator-coordinator-schema.js';
import {
  runGateBOperatorCoordinatorCli,
} from '../src/gate-b-operator-coordinator-cli.js';
import {
  launchGateBOperatorCoordinator,
  launchGateBOperatorWatchdogSetup,
  stopGateBOperatorCoordinator,
  waitGateBOperatorCoordinatorClosed,
} from '../src/gate-b-operator-coordinator-launcher.js';
import {
  GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED,
  runGateBOperatorFrontEnd,
} from '../src/gate-b-operator-front-end.js';
import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
} from '../src/gate-b-quick-tunnel-artifact.js';
import {
  GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_MODES,
} from '../src/gate-b-quick-tunnel-schema.js';
import {
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';

async function source(relative) {
  return readFile(new URL(relative, import.meta.url), 'utf8');
}

function syntheticAddress(seed) {
  const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const generators = [
    0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
  ];
  const step = (checksum, word) => {
    const high = checksum >>> 25;
    let result = ((checksum & 0x1ffffff) << 5) ^ word;
    for (let bit = 0; bit < generators.length; bit += 1) {
      if ((high >>> bit) & 1) result ^= generators[bit];
    }
    return result >>> 0;
  };
  const bytes = Uint8Array.from({ length: 20 }, (_, index) =>
    index === 0 ? 0 : (seed + index * 17) & 0xff);
  const words = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  let checksum = step(step(step(1, 3), 0), 26);
  for (const word of words) checksum = step(checksum, word);
  for (let index = 0; index < 6; index += 1) checksum = step(checksum, 0);
  checksum = (checksum ^ 1) >>> 0;
  for (let index = 5; index >= 0; index -= 1) {
    words.push((checksum >>> (5 * index)) & 31);
  }
  return `z1${words.map(word => charset[word]).join('')}`;
}

function bootstrap(root) {
  return {
    mode: 'reset-epoch-exact-six-native-v1',
    payeeAddress: syntheticAddress(109),
    policyPreflight: canonicalJson({
      policySelection: {
        eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
        liveAcknowledgement: TESTNET_LIVE_ACKNOWLEDGEMENT,
        operatorTrustAcknowledgement:
          PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
        profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
        rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
        wssAcknowledgement:
          PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
      },
      preflightVersion: 1,
    }),
    quickTunnel: {
      cloudflaredExecutable: '/usr/local/bin/schema5-synthetic-tunnel',
      sourcePin: GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST.executableSha256,
      telemetryAcknowledgement:
        GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS
          .ACCEPT_POSSIBLE_ERROR_TELEMETRY,
      telemetryMode:
        GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    },
    runName: 'schema5-cwd-boundary',
    schemaVersion: 5,
    workspaceRoot: root,
  };
}

function phase2Review() {
  return {
    acknowledgements: {
      offlineReceipt: GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.resetOfflineReceipt,
      operatorAssertion:
        GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.resetOperatorAssertion,
      payeeOwnership:
        GATE_B_OPERATOR_COORDINATOR_ACKNOWLEDGEMENTS.resetPayeeOwnership,
    },
    reviewedConfigDigest: 'a'.repeat(64),
    reviewedPayee: syntheticAddress(109),
    reviewedPayer: syntheticAddress(41),
    reviewedPaymentIntentDigest: 'b'.repeat(64),
    schemaVersion: 5,
  };
}

function operatorTrustedCrossCheck() {
  return Object.freeze({
    configDigest: phase2Review().reviewedConfigDigest,
    hostname: 'fixture.trycloudflare.com',
    independentReview: 'NOT_PROVEN',
    payee: phase2Review().reviewedPayee,
    payer: phase2Review().reviewedPayer,
    paymentIntentDigest: phase2Review().reviewedPaymentIntentDigest,
    resultVersion: 5,
    sourceRevision: 'a'.repeat(40),
    type: 'OPERATOR_TRUSTED_NONAUTHORITATIVE_CROSS_CHECK',
  });
}

async function waitFor(check, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('bounded condition not reached');
}

function fakeTty() {
  const input = new PassThrough();
  Object.defineProperties(input, {
    isRaw: { configurable: false, enumerable: true, writable: true, value: false },
    isTTY: { configurable: false, enumerable: true, writable: false, value: true },
    setRawMode: {
      configurable: true,
      enumerable: true,
      writable: false,
      value(value) { this.isRaw = value; return this; },
    },
  });
  return input;
}

test('schema-5 adapter has no live approval, live preflight, runner-child, or authorization import',
  async () => {
    const adapter = await source('../src/gate-b-reset-epoch-exact-six-native-adapter.js');
    assert.doesNotMatch(adapter, /parseResetEpochWssOnceApproval/u);
    assert.doesNotMatch(adapter, /preflightResetEpochWssOnceRun/u);
    assert.doesNotMatch(adapter, /resetLiveApproval/u);
    assert.doesNotMatch(adapter, /live-evidence-runner/u);
    assert.doesNotMatch(adapter, /live-evidence-public-ws-once-(?:supervisor|run-child)/u);
    assert.doesNotMatch(adapter,
      /authorizeAndPreflightGateBResetEpoch|approvalDocument/iu);
    assert.match(adapter, /RUN_NOT_AUTHORIZED/u);
    assert.match(adapter, /futureLiveConsumerEligible:\s*false/u);
    assert.match(adapter, /resetEpochOfflinePreflightReceipt/u);
  });

test('schema-5 launcher selects workspace cwd only after canonical bootstrap parsing',
  async () => {
    const launcher = await source('../src/gate-b-operator-coordinator-launcher.js');
    const launchStart = launcher.indexOf('function launchGateBOperatorProcess(');
    const launchEnd = launcher.indexOf('\nfunction ', launchStart + 1);
    const launch = launcher.slice(launchStart, launchEnd);
    const parseOffset = launch.indexOf('parseGateBOperatorCoordinatorBootstrapFrame');
    const spawnOffset = launch.indexOf('dependencies.spawnProcess');
    assert.notEqual(parseOffset, -1);
    assert.notEqual(spawnOffset, -1);
    assert.equal(parseOffset < spawnOffset, true);
    assert.match(launch, /schemaVersion === 5/u);
    assert.match(launch, /cwd:\s*childCwd/u);
  });

test('Phase 1 parsing precedes operational setup', async () => {
  const frontEnd = await source('../src/gate-b-operator-front-end.js');
  const runStart = frontEnd.indexOf('export async function runGateBOperatorFrontEnd');
  const run = frontEnd.slice(runStart);
  const parseOffset = run.indexOf('parseGateBOperatorCoordinatorBootstrapFrame');
  const setupOffset = run.indexOf('dependencies.launchSetup');
  assert.notEqual(parseOffset, -1);
  assert.notEqual(setupOffset, -1);
  assert.equal(parseOffset < setupOffset, true);
});

test('invalid Phase 1 causes zero operational setup effects', async () => {
  const input = fakeTty();
  const output = new PassThrough();
  const lines = [];
  output.on('data', chunk => lines.push(chunk.toString('utf8')));
  let setups = 0;
  const pending = runGateBOperatorFrontEnd({
    argv: [],
    channel: new EventEmitter(),
    errorOutput: new PassThrough(),
    input,
    launchSetup: async () => { setups += 1; return Object.freeze(Object.create(null)); },
    output,
    outputTimeoutMs: 100,
    phase1TimeoutMs: 1000,
    phase2TimeoutMs: 1000,
    stopCoordinator: async () => 'CLOSED',
    submitBootstrap: async () => Object.freeze(Object.create(null)),
    submitReview: async () => 'PREFLIGHT_VALID',
    waitClosed: async () => 'CLOSED',
  });
  await waitFor(() => lines.includes(GATE_B_OPERATOR_FRONT_END_PHASE_1_REQUIRED) &&
    input.isRaw);
  input.write(Buffer.from('{"schemaVersion":5}\r', 'utf8'));
  assert.equal(await pending, false);
  assert.equal(setups, 0);
  assert.equal(input.isRaw, false);
});

test('invalid schema-5 bootstrap is rejected before guard creation or child spawn', async () => {
  let effects = 0;
  await assert.rejects(launchGateBOperatorWatchdogSetup({
    ...bootstrap(join(tmpdir(), 'schema5-invalid-bootstrap')),
    payeeAddress: 'invalid',
  }, {
    createOriginGuard() { effects += 1; },
    spawnProcess() { effects += 1; },
  }));
  assert.equal(effects, 0);
});

test('schema-5 coordinator compares a fixed-child nonauthoritative cross-check before validation',
  async () => {
    const channel = new EventEmitter();
    const sent = [];
    channel.send = (message, callback) => {
      sent.push(message.type);
      queueMicrotask(() => callback?.(null));
      if (message.type === GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.REVIEW_REQUIRED) {
        queueMicrotask(() => channel.emit('message', { type: 'REVIEW_OPEN' }));
      }
      return true;
    };
    const candidate = bootstrap(join(tmpdir(), 'schema5-cli-workspace'));
    const review = phase2Review();
    const crossChecked = operatorTrustedCrossCheck();
    const capability = Object.freeze(Object.create(null));
    const events = [];
    const lines = [];
    let constructorReads = 0;
    const dependencyPromise = value => {
      const promise = Promise.resolve(value);
      Object.defineProperty(promise, 'constructor', {
        configurable: true,
        enumerable: false,
        get() {
          constructorReads += 1;
          throw new Error('constructor species poison');
        },
      });
      return promise;
    };
    let status = 'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED';
    const reader = Object.freeze({
      close() { return true; },
      openReviewPhase() { return true; },
      openRunPhase() { events.push('run-open-poison'); return true; },
      readInitial() {
        return Promise.resolve(frameGateBOperatorCoordinatorBootstrap(candidate));
      },
      readReview() {
        return Promise.resolve(frameGateBOperatorCoordinatorReview(review));
      },
      readRun() {
        events.push('run-read-poison');
        return Promise.reject(new Error('run poison'));
      },
    });
    const pending = runGateBOperatorCoordinatorCli({
      argv: [],
      channel,
      createFrameReader: () => reader,
      getResetControllerStatus: supplied => {
        assert.equal(supplied, capability);
        return status;
      },
      inputStream: Object.freeze({}),
      lifetimeMs: 1000,
      prepareResetController: supplied => {
        assert.deepEqual(supplied, candidate);
        events.push('prepare');
        return dependencyPromise(capability);
      },
      crossCheckResetConfiguration: (root, options) => {
        assert.equal(root, candidate.workspaceRoot);
        assert.equal(options.signal instanceof AbortSignal, true);
        events.push('operator-trusted-cross-check');
        return dependencyPromise(crossChecked);
      },
      runController: async () => {
        events.push('run-controller-poison');
        throw new Error('run poison');
      },
      stderr: async line => { lines.push(['stderr', line]); return true; },
      stdout: async line => { lines.push(['stdout', line]); return true; },
      stopResetController: supplied => {
        assert.equal(supplied, capability);
        events.push('stop');
        status = 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED';
        return dependencyPromise(status);
      },
      validateResetController: (supplied, operator, childResult) => {
        assert.equal(supplied, capability);
        assert.deepEqual(operator, review);
        assert.deepEqual(childResult, crossChecked);
        events.push('validate');
        status = 'GATE_B_CONTROLLER_OFFLINE_PREFLIGHT_RECEIPT_VALID_RUN_NOT_AUTHORIZED';
        return dependencyPromise(status);
      },
      waitResetControllerClosed: supplied => {
        assert.equal(supplied, capability);
        events.push('wait');
        return dependencyPromise('GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED');
      },
    });
    await waitFor(() => sent.includes(GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.PREFLIGHT_VALID));
    channel.emit('message', createGateBOperatorCoordinatorIpcMessage(
      GATE_B_OPERATOR_COORDINATOR_IPC_TYPES.STOP,
    ));
    assert.equal(await pending, true);
    assert.deepEqual(events, [
      'prepare', 'operator-trusted-cross-check', 'validate', 'stop', 'wait',
    ]);
    assert.deepEqual(lines, [
      ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.REVIEW_REQUIRED],
      ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.RESET_OFFLINE_PREFLIGHT_VALID],
      ['stdout', GATE_B_OPERATOR_COORDINATOR_STATUS_LINES.CLOSED],
    ]);
    assert.equal(constructorReads, 0);
    assert.equal(events.some(event => event.includes('run')), false);
  });

test('launcher passes schema-5 workspace cwd to a fixture child; default coordinator remains unproven',
  { timeout: 10_000 }, async t => {
    const temporary = await mkdtemp(join(tmpdir(), 'schema5-cwd-boundary-'));
    t.after(() => rm(temporary, { recursive: true, force: true }));
    const root = await realpath(temporary);
    await chmod(root, 0o700);
    const childModule = fileURLToPath(new URL(
      '../test-support/gate-b-schema5-workspace-coordinator-child.js',
      import.meta.url,
    ));
    const capability = await launchGateBOperatorCoordinator(bootstrap(root), {
      cliModule: childModule,
      executable: process.execPath,
      gracefulStopMs: 1000,
      lifetimeMs: 5000,
      platform: 'darwin',
      reapAbandonMs: 1500,
      reapForceMs: 500,
    });
    assert.equal(await stopGateBOperatorCoordinator(capability), 'CLOSED');
    assert.equal(await waitGateBOperatorCoordinatorClosed(capability), 'CLOSED');
  });
