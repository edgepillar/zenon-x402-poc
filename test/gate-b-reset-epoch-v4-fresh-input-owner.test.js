import assert from 'node:assert/strict';
import {
  chmod,
  link,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/canonical.js';
import {
  GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST,
  GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY,
  GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY,
  GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES,
} from '../src/gate-b-quick-tunnel-artifact.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  serializeGateBQuickTunnelHostnameSource,
} from '../src/gate-b-public-ws-inputs-schema.js';
import {
  generateGateBResetEpochV4FreshInputs,
  GateBResetEpochV4FreshInputOwnerError,
} from '../src/gate-b-reset-epoch-v4-fresh-input-owner.js';
import {
  prepareGateBResetEpochV4Review,
} from '../src/gate-b-reset-epoch-v4-review.js';
import { RESET_EPOCH_WSS_ONCE_POLICY } from '../src/live-evidence-runner.js';
import {
  HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
  PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [
  0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
];
const SYNTHETIC_ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const HOSTNAME = 'synthetic-fresh-input-owner.trycloudflare.com';
const OTHER_HOSTNAME = 'synthetic-other-fresh-owner.trycloudflare.com';
const RUN_NAME = 'synthetic-reset-epoch-v4-fresh-input-owner';
const ERROR_CODE = 'gate_b_reset_epoch_v4_fresh_input_owner_invalid';
const FAKE_WALLET_BYTES = Buffer.from(
  'SYNTHETIC_FAKE_WALLET_BYTES_NOT_A_KEY\n',
  'utf8',
);

const INPUT_LEAVES = [
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
];
const ALL_LEAVES = [
  ...INPUT_LEAVES,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
];

function bech32Polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const high = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let bit = 0; bit < BECH32_GENERATORS.length; bit += 1) {
      if ((high >>> bit) & 1) checksum ^= BECH32_GENERATORS[bit];
    }
  }
  return checksum;
}

function syntheticUserAddress(seed) {
  const payload = Uint8Array.from(
    { length: 20 },
    (_, index) => index === 0 ? 0 : (seed + index) & 0xff,
  );
  const words = [];
  let accumulator = 0;
  let bits = 0;
  for (const byte of payload) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  if (bits > 0) words.push((accumulator << (5 - bits)) & 31);
  const polymod = bech32Polymod([
    3, 0, 26,
    ...words,
    0, 0, 0, 0, 0, 0,
  ]) ^ 1;
  const checksum = [];
  for (let index = 0; index < 6; index += 1) {
    checksum.push((polymod >>> (5 * (5 - index))) & 31);
  }
  return `z1${[...words, ...checksum].map(value => BECH32_CHARSET[value]).join('')}`;
}

const SYNTHETIC_PAYER = syntheticUserAddress(47);
const SYNTHETIC_PAYEE = syntheticUserAddress(113);

function quickTunnelBinding() {
  const manifest = GATE_B_QUICK_TUNNEL_ARTIFACT_MANIFEST;
  return {
    artifact: {
      architecture: manifest.architecture,
      archiveSha256: manifest.archiveSha256,
      asset: manifest.asset,
      executableSha256: manifest.executableSha256,
      manifestVersion: manifest.manifestVersion,
      platform: manifest.platform,
      release: manifest.release,
    },
    hostnamePersistence: { ...GATE_B_QUICK_TUNNEL_HOSTNAME_PERSISTENCE_POLICY },
    runtimeControl: { ...GATE_B_QUICK_TUNNEL_RUNTIME_CONTROL_POLICY },
    telemetry: {
      ...GATE_B_QUICK_TUNNEL_TELEMETRY_POLICIES.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    },
  };
}

function runConfig(changes = {}) {
  return {
    runnerVersion: 4,
    executionMode: RESET_EPOCH_WSS_ONCE_POLICY.executionMode,
    eventId: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    sourceRevision: 'f'.repeat(40),
    profileName: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    payer: SYNTHETIC_PAYER,
    acknowledgements: {
      live: TESTNET_LIVE_ACKNOWLEDGEMENT,
      operatorTrust:
        PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_OPERATOR_TRUST_ACKNOWLEDGEMENT,
      wss: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ACKNOWLEDGEMENT,
    },
    expectedPaymentRequired: {
      x402Version: 2,
      resource: {
        url: `https://${HOSTNAME}/paid`,
        description: 'Synthetic source-only fresh-input-owner fixture',
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network: 'zenon:testnet',
        asset: SYNTHETIC_ASSET,
        amount: '1',
        payTo: SYNTHETIC_PAYEE,
        maxTimeoutSeconds: 60,
        extra: {
          paymentFlow: 'upfront',
          poc: true,
          settlement: 'account-block',
          zenonChain: { ...PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE },
        },
      }],
    },
    quickTunnel: quickTunnelBinding(),
    runtime: {
      listenPort: 41000,
      rpcTimeoutMs: 1000,
      maxRecoveryAttempts: 0,
      recoveryDelayMs: 0,
      maxRecoveryElapsedMs: 1000,
    },
    ...changes,
  };
}

function approval(review, changes = {}) {
  return {
    approvalVersion: 1,
    approvalType: RESET_EPOCH_WSS_ONCE_POLICY.approvalType,
    executionMode: review.executionMode,
    eventId: review.eventId,
    runName: review.runName,
    sourceRevision: review.sourceRevision,
    profileName: review.profileName,
    payer: review.payer,
    configDigest: review.configDigest,
    paymentIntentDigest: review.paymentIntentDigest,
    rpcEndpoint: review.rpcEndpoint,
    quickTunnel: structuredClone(review.quickTunnel),
    acknowledgements: {
      oneUseResetLive: RESET_EPOCH_WSS_ONCE_POLICY.oneUseApproval,
      payment: RESET_EPOCH_WSS_ONCE_POLICY.paymentAcknowledgement,
      publication: RESET_EPOCH_WSS_ONCE_POLICY.publicationAcknowledgement,
    },
    ...changes,
  };
}

function canonicalText(value) {
  return `${canonicalJson(value)}\n`;
}

function inputBuffers(hostname = HOSTNAME) {
  const rpcBytes = Buffer.from(canonicalText({
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    secretVersion: 4,
  }), 'utf8');
  return [
    Buffer.from(FAKE_WALLET_BYTES),
    rpcBytes,
    Buffer.from(rpcBytes),
    serializeGateBQuickTunnelHostnameSource(hostname, quickTunnelBinding()),
  ];
}

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'gate-b-reset-v4-fresh-owner-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = await realpath(temporary);
  await chmod(root, 0o700);
  const config = runConfig();
  const runConfigJson = canonicalText(config);
  const review = prepareGateBResetEpochV4Review(runConfigJson, RUN_NAME);
  const approvalJson = canonicalText(approval(review));
  return {
    root,
    config,
    runConfigJson,
    review,
    approvalJson,
    inputs: inputBuffers(),
  };
}

function counters() {
  return {
    directorySyncs: 0,
    fileSyncs: new Map(),
    openCounts: new Map(),
    writeBuffers: [],
    writeCounts: new Map(),
  };
}

function decorateDirectoryHandle(counts, syncHook) {
  return handle => ({
    stat: (...args) => handle.stat(...args),
    async sync(...args) {
      counts.directorySyncs += 1;
      const result = await handle.sync(...args);
      if (syncHook) await syncHook();
      return result;
    },
    close: (...args) => handle.close(...args),
  });
}

function decorateFileHandle(counts, hooks = {}) {
  return (handle, name) => ({
    stat: (...args) => handle.stat(...args),
    chmod: (...args) => hooks.chmod
      ? hooks.chmod({ args, handle, name })
      : handle.chmod(...args),
    read: (...args) => handle.read(...args),
    async write(...args) {
      counts.writeCounts.set(name, (counts.writeCounts.get(name) ?? 0) + 1);
      counts.writeBuffers.push(args[0]);
      if (hooks.write) return hooks.write({ args, handle, name });
      return handle.write(...args);
    },
    async sync(...args) {
      counts.fileSyncs.set(name, (counts.fileSyncs.get(name) ?? 0) + 1);
      return handle.sync(...args);
    },
    close: (...args) => handle.close(...args),
  });
}

function workspaceInjections(root, counts, overrides = {}) {
  return {
    platform: 'darwin',
    actualCwdPath: () => root,
    lstatActualCwd: () => lstat(root, { bigint: true }),
    openActualCwd: flags => open(root, flags),
    realpathActualCwd: () => realpath(root),
    aclInspector: async () => true,
    decorateDirectoryHandle: decorateDirectoryHandle(counts),
    decorateFileHandle: decorateFileHandle(counts),
    ...overrides,
  };
}

function ownerArguments(context, overrides = {}) {
  const inputs = overrides.inputs ?? context.inputs;
  return [
    inputs[0],
    inputs[1],
    inputs[2],
    inputs[3],
    overrides.runConfigJson ?? context.runConfigJson,
    overrides.approvalJson ?? context.approvalJson,
    overrides.reviewedConfigDigest ?? context.review.configDigest,
    overrides.runName ?? RUN_NAME,
    context.root,
    overrides.injected,
  ];
}

async function expectFailure(promise) {
  await assert.rejects(promise, error => {
    assert.equal(error instanceof GateBResetEpochV4FreshInputOwnerError, true);
    assert.equal(error.code, ERROR_CODE);
    assert.equal(error.message, ERROR_CODE);
    assert.equal(error.cause, undefined);
    assert.equal(error.stack, `GateBResetEpochV4FreshInputOwnerError: ${ERROR_CODE}`);
    return true;
  });
}

async function assertMissing(path) {
  await assert.rejects(lstat(path), error => error?.code === 'ENOENT');
}

function mode(stat) {
  return stat.mode & 0o777n;
}

test('requires an explicit private workspace path before reserving inputs', async t => {
  const context = await fixture(t);
  await expectFailure(generateGateBResetEpochV4FreshInputs(
    ...ownerArguments(context).slice(0, 8),
  ));
  assert.deepEqual(await readdir(context.root), []);
});

test('creates six fresh private leaves and returns only a fixed non-authorizing status', async t => {
  const context = await fixture(t);
  const counts = counters();
  const originals = context.inputs.map(value => Buffer.from(value));
  const injected = workspaceInjections(context.root, counts);
  let networkCalls = 0;
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value() {
      networkCalls += 1;
      throw new Error('network sentinel');
    },
    writable: true,
  });

  let result;
  try {
    result = await generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    );
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
    else delete globalThis.fetch;
  }

  assert.deepEqual(result, {
    status: 'source_only_fresh_inputs_and_outputs_written_non_authorizing',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(networkCalls, 0);
  assert.deepEqual((await readdir(context.root)).sort(), [...ALL_LEAVES].sort());
  for (let index = 0; index < INPUT_LEAVES.length; index += 1) {
    assert.deepEqual(
      await readFile(join(context.root, INPUT_LEAVES[index])),
      originals[index],
    );
    assert.deepEqual(context.inputs[index], originals[index]);
  }
  assert.equal(
    await readFile(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig), 'utf8'),
    context.runConfigJson,
  );
  assert.equal(
    await readFile(
      join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval),
      'utf8',
    ),
    context.approvalJson,
  );
  const stats = await Promise.all(ALL_LEAVES.map(name => lstat(
    join(context.root, name),
    { bigint: true },
  )));
  assert.equal(stats.every(value => value.isFile()), true);
  assert.equal(stats.every(value => value.nlink === 1n), true);
  assert.equal(stats.every(value => mode(value) === 0o600n), true);
  assert.equal(new Set(stats.map(value => `${value.dev}:${value.ino}`)).size, 6);
  assert.equal(counts.writeBuffers.length >= 6, true);
  assert.equal(
    counts.writeBuffers.every(value => value.every(byte => byte === 0)),
    true,
  );
  assert.equal(counts.directorySyncs >= 8, true);

  const source = await readFile(
    new URL('../src/gate-b-reset-epoch-v4-fresh-input-owner.js', import.meta.url),
    'utf8',
  );
  assert.equal(/node:(?:http|https|net|tls)|\bfetch\b/.test(source), false);
});

test('copies caller buffers before asynchronous work and does not wipe caller ownership', async t => {
  const context = await fixture(t);
  const counts = counters();
  const originals = context.inputs.map(value => Buffer.from(value));
  let mutated = false;
  const injected = workspaceInjections(context.root, counts, {
    async openPath(path, flags, createMode) {
      if (!mutated && path === join(context.root, INPUT_LEAVES[0])) {
        mutated = true;
        for (const input of context.inputs) input.fill(0x78);
      }
      return open(path, flags, createMode);
    },
  });

  await generateGateBResetEpochV4FreshInputs(
    ...ownerArguments(context, { injected }),
  );
  assert.equal(mutated, true);
  for (let index = 0; index < INPUT_LEAVES.length; index += 1) {
    assert.deepEqual(
      await readFile(join(context.root, INPUT_LEAVES[index])),
      originals[index],
    );
    assert.equal(context.inputs[index].every(byte => byte === 0x78), true);
  }
});

test('rejects malformed, noncanonical, historical, mixed, and cross-bound inputs before mutation',
  async t => {
    const context = await fixture(t);
    const historical = runConfig({
      eventId: HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_EVENT_ID,
      profileName: HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME,
    });
    historical.expectedPaymentRequired.accepts[0].extra.zenonChain = {
      ...HISTORICAL_PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_CHAIN_PROFILE,
    };
    const mixedInputs = inputBuffers();
    mixedInputs[2] = Buffer.from(canonicalText({
      rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
      secretVersion: 3,
    }), 'utf8');
    const mismatchInputs = inputBuffers(OTHER_HOSTNAME);
    const cases = [
      ['non-Buffer wallet', { inputs: [new Uint8Array([1]), ...context.inputs.slice(1)] }],
      ['oversized wallet', {
        inputs: [Buffer.alloc((64 * 1024) + 1, 0x78), ...context.inputs.slice(1)],
      }],
      ['malformed buyer RPC', {
        inputs: [context.inputs[0], Buffer.from('{}\n'), ...context.inputs.slice(2)],
      }],
      ['mixed RPC generation', { inputs: mixedInputs }],
      ['hostname cross-binding mismatch', { inputs: mismatchInputs }],
      ['noncanonical approval', {
        approvalJson: `${JSON.stringify(approval(context.review), null, 2)}\n`,
      }],
      ['historical reset epoch', { runConfigJson: canonicalText(historical) }],
      ['unknown run field', {
        runConfigJson: canonicalText({ ...context.config, unknown: true }),
      }],
    ];

    for (const [name, overrides] of cases) {
      await t.test(name, async () => {
        const counts = counters();
        let filesystemOpens = 0;
        const injected = workspaceInjections(context.root, counts, {
          openPath(...args) {
            filesystemOpens += 1;
            return open(...args);
          },
        });
        await expectFailure(generateGateBResetEpochV4FreshInputs(
          ...ownerArguments(context, { ...overrides, injected }),
        ));
        assert.equal(filesystemOpens, 0);
        assert.equal(counts.directorySyncs, 0);
        assert.deepEqual(await readdir(context.root), []);
      });
    }
  });

test('rejects stale, unexpected, linked, and unsafe workspace state without overwrite', async t => {
  await t.test('stale required leaf', async t => {
    const context = await fixture(t);
    const stale = Buffer.from('SYNTHETIC_STALE_INPUT_RESIDUE\n');
    const path = join(context.root, INPUT_LEAVES[0]);
    await writeFile(path, stale, { mode: 0o600 });
    await chmod(path, 0o600);
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    assert.deepEqual(await readFile(path), stale);
    assert.deepEqual(await readdir(context.root), [INPUT_LEAVES[0]]);
    assert.equal(counts.writeCounts.size, 0);
  });

  await t.test('unexpected symlink', async t => {
    const context = await fixture(t);
    await symlink('missing-synthetic-target', join(context.root, 'unexpected-synthetic'));
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    assert.equal((await lstat(join(context.root, 'unexpected-synthetic'))).isSymbolicLink(), true);
    assert.equal(counts.writeCounts.size, 0);
  });

  await t.test('hard-linked stale leaf', async t => {
    const context = await fixture(t);
    const source = join(context.root, 'synthetic-hardlink-source');
    await writeFile(source, FAKE_WALLET_BYTES, { mode: 0o600 });
    await chmod(source, 0o600);
    await link(source, join(context.root, INPUT_LEAVES[0]));
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    assert.equal((await lstat(source, { bigint: true })).nlink, 2n);
    assert.equal(counts.writeCounts.size, 0);
  });

  await t.test('wrong workspace mode', async t => {
    const context = await fixture(t);
    await chmod(context.root, 0o755);
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    assert.deepEqual(await readdir(context.root), []);
    assert.equal(counts.writeCounts.size, 0);
  });
});

test('leaves consumed restrictive residue after reservation, write, or output failure', async t => {
  await t.test('partial input reservation', async t => {
    const context = await fixture(t);
    const counts = counters();
    let attempts = 0;
    const failedPath = join(context.root, INPUT_LEAVES[2]);
    const injected = workspaceInjections(context.root, counts, {
      async openPath(path, flags, createMode) {
        if (path === failedPath) {
          attempts += 1;
          throw Object.assign(new Error('reservation sentinel'), { code: 'EIO' });
        }
        return open(path, flags, createMode);
      },
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(attempts, 1);
    assert.deepEqual((await readdir(context.root)).sort(), INPUT_LEAVES.slice(0, 2).sort());
    for (const name of INPUT_LEAVES.slice(0, 2)) {
      const stat = await lstat(join(context.root, name), { bigint: true });
      assert.equal(stat.size, 0n);
      assert.equal(stat.nlink, 1n);
      assert.equal(mode(stat), 0o600n);
    }
  });

  await t.test('partial input write', async t => {
    const context = await fixture(t);
    const counts = counters();
    let attempts = 0;
    const injected = workspaceInjections(context.root, counts, {
      decorateFileHandle: decorateFileHandle(counts, {
        write({ args, handle, name }) {
          if (name === INPUT_LEAVES[1]) {
            attempts += 1;
            throw new Error('write sentinel');
          }
          return handle.write(...args);
        },
      }),
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(attempts, 1);
    assert.deepEqual((await readdir(context.root)).sort(), [...INPUT_LEAVES].sort());
    assert.deepEqual(await readFile(join(context.root, INPUT_LEAVES[0])), context.inputs[0]);
    for (const name of INPUT_LEAVES.slice(1)) {
      assert.equal((await lstat(join(context.root, name), { bigint: true })).size, 0n);
    }
  });

  await t.test('output reservation failure', async t => {
    const context = await fixture(t);
    const counts = counters();
    let attempts = 0;
    const failedPath = join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig);
    const injected = workspaceInjections(context.root, counts, {
      async openPath(path, flags, createMode) {
        if (path === failedPath) {
          attempts += 1;
          throw Object.assign(new Error('output sentinel'), { code: 'EIO' });
        }
        return open(path, flags, createMode);
      },
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(attempts, 1);
    assert.deepEqual((await readdir(context.root)).sort(), [...INPUT_LEAVES].sort());
    for (let index = 0; index < INPUT_LEAVES.length; index += 1) {
      assert.deepEqual(
        await readFile(join(context.root, INPUT_LEAVES[index])),
        context.inputs[index],
      );
    }
    await assertMissing(join(
      context.root,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
    ));
  });
});

test('rejects same-byte pathname replacement and wrong created-file mode', async t => {
  await t.test('pathname replacement', async t => {
    const context = await fixture(t);
    const counts = counters();
    let inputWrites = 0;
    let replaced = false;
    const replacedPath = join(context.root, INPUT_LEAVES[1]);
    const injected = workspaceInjections(context.root, counts, {
      decorateFileHandle: decorateFileHandle(counts, {
        async write({ args, handle, name }) {
          const result = await handle.write(...args);
          if (INPUT_LEAVES.includes(name)) inputWrites += 1;
          return result;
        },
      }),
      decorateDirectoryHandle: decorateDirectoryHandle(counts, async () => {
        if (!replaced && inputWrites === 4) {
          replaced = true;
          await unlink(replacedPath);
          await writeFile(replacedPath, context.inputs[1], { mode: 0o600 });
          await chmod(replacedPath, 0o600);
        }
      }),
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(replaced, true);
    assert.deepEqual((await readdir(context.root)).sort(), [...INPUT_LEAVES].sort());
    await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));
  });

  await t.test('wrong created-file mode', async t => {
    const context = await fixture(t);
    const counts = counters();
    let changed = false;
    const injected = workspaceInjections(context.root, counts, {
      decorateFileHandle: decorateFileHandle(counts, {
        async chmod({ args, handle, name }) {
          if (!changed && name === INPUT_LEAVES[0]) {
            changed = true;
            return handle.chmod(0o644);
          }
          return handle.chmod(...args);
        },
      }),
    });
    await expectFailure(generateGateBResetEpochV4FreshInputs(
      ...ownerArguments(context, { injected }),
    ));
    assert.equal(changed, true);
    const stat = await lstat(join(context.root, INPUT_LEAVES[0]), { bigint: true });
    assert.equal(mode(stat), 0o644n);
    assert.deepEqual(await readdir(context.root), [INPUT_LEAVES[0]]);
  });
});
