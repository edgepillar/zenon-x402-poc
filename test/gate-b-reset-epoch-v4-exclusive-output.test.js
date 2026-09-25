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
  generateGateBResetEpochV4ExclusiveOutputs,
  GateBResetEpochV4ExclusiveOutputError,
} from '../src/gate-b-reset-epoch-v4-exclusive-output.js';
import {
  bindGateBResetEpochV4Approval,
  prepareGateBResetEpochV4Review,
} from '../src/gate-b-reset-epoch-v4-review.js';
import {
  RESET_EPOCH_WSS_ONCE_POLICY,
} from '../src/live-evidence-runner.js';
import {
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
const HOSTNAME = 'synthetic-exclusive-output.trycloudflare.com';
const RUN_NAME = 'synthetic-reset-epoch-v4-exclusive-output';
const ERROR_CODE = 'gate_b_reset_epoch_v4_exclusive_output_invalid';
const WALLET_SENTINEL = 'SYNTHETIC_WALLET_MUST_NOT_BE_READ\n';

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

const SYNTHETIC_PAYER = syntheticUserAddress(31);
const SYNTHETIC_PAYEE = syntheticUserAddress(97);

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
    sourceRevision: 'd'.repeat(40),
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
        description: 'Synthetic source-only exclusive-output fixture',
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

async function privateWrite(root, name, bytes) {
  const path = join(root, name);
  await writeFile(path, bytes, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

async function fixture(t, configChanges = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'gate-b-reset-v4-output-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = await realpath(temporary);
  await chmod(root, 0o700);
  const config = runConfig(configChanges);
  const runConfigJson = canonicalText(config);
  const review = prepareGateBResetEpochV4Review(runConfigJson, RUN_NAME);
  const approvalJson = canonicalText(approval(review));
  bindGateBResetEpochV4Approval(approvalJson, review.configDigest, review);
  await privateWrite(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet, WALLET_SENTINEL);
  const rpcBytes = canonicalText({
    rpcEndpoint: PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_WSS_ENDPOINT,
    secretVersion: 4,
  });
  await privateWrite(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc, rpcBytes);
  await privateWrite(root, GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc, rpcBytes);
  await privateWrite(
    root,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    serializeGateBQuickTunnelHostnameSource(HOSTNAME, quickTunnelBinding()),
  );
  return { root, config, runConfigJson, review, approvalJson };
}

function decorateDirectoryHandle(counters) {
  return (handle) => ({
    stat: (...args) => handle.stat(...args),
    sync: (...args) => {
      counters.directorySyncs += 1;
      return handle.sync(...args);
    },
    close: (...args) => handle.close(...args),
  });
}

function decorateFileHandle(counters, readHook) {
  return (handle, name) => ({
    stat: (...args) => handle.stat(...args),
    chmod: (...args) => {
      if (name === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet) {
        counters.walletChmods += 1;
        throw new Error('wallet chmod sentinel');
      }
      return handle.chmod(...args);
    },
    async read(...args) {
      counters.reads.set(name, (counters.reads.get(name) ?? 0) + 1);
      if (name === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet) {
        counters.walletReads += 1;
        throw new Error('wallet read sentinel');
      }
      const result = await handle.read(...args);
      if (readHook) await readHook({ handle, name, result });
      return result;
    },
    write: (...args) => {
      counters.writes.set(name, (counters.writes.get(name) ?? 0) + 1);
      return handle.write(...args);
    },
    sync: (...args) => {
      counters.fileSyncs.set(name, (counters.fileSyncs.get(name) ?? 0) + 1);
      return handle.sync(...args);
    },
    close: (...args) => handle.close(...args),
  });
}

function counters() {
  return {
    directorySyncs: 0,
    fileSyncs: new Map(),
    reads: new Map(),
    walletChmods: 0,
    walletReads: 0,
    writes: new Map(),
  };
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

function generatorArguments(context, overrides = {}) {
  return [
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
    assert.equal(error instanceof GateBResetEpochV4ExclusiveOutputError, true);
    assert.equal(error.code, ERROR_CODE);
    assert.equal(error.message, ERROR_CODE);
    assert.equal(error.cause, undefined);
    assert.equal(error.stack, `GateBResetEpochV4ExclusiveOutputError: ${ERROR_CODE}`);
    return true;
  });
}

async function assertMissing(path) {
  await assert.rejects(lstat(path), error => error?.code === 'ENOENT');
}

function mode(stat) {
  return stat.mode & 0o777n;
}

test('writes and freshly revalidates exactly two non-authorizing outputs', async t => {
  const context = await fixture(t);
  const counts = counters();
  const walletBefore = await lstat(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet),
    { bigint: true },
  );
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
    result = await generateGateBResetEpochV4ExclusiveOutputs(
      ...generatorArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    );
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
    else delete globalThis.fetch;
  }

  assert.deepEqual(result, { status: 'source_only_outputs_written_non_authorizing' });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual((await readdir(context.root)).sort(), [
    GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
  ].sort());
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
  const outputStats = await Promise.all([
    lstat(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig), { bigint: true }),
    lstat(
      join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval),
      { bigint: true },
    ),
  ]);
  assert.equal(outputStats.every(value => value.isFile()), true);
  assert.equal(outputStats.every(value => value.nlink === 1n), true);
  assert.equal(outputStats.every(value => mode(value) === 0o600n), true);
  assert.notEqual(outputStats[0].ino, outputStats[1].ino);
  const walletAfter = await lstat(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet),
    { bigint: true },
  );
  for (const field of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'nlink']) {
    assert.equal(walletAfter[field], walletBefore[field]);
  }
  assert.equal(counts.walletReads, 0);
  assert.equal(counts.walletChmods, 0);
  assert.equal(networkCalls, 0);
  assert.equal(counts.writes.has(GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet), false);
  assert.equal(counts.writes.has(GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig), true);
  assert.equal(counts.writes.has(GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval), true);
  assert.equal(counts.fileSyncs.get(GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig), 1);
  assert.equal(counts.fileSyncs.get(GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval), 1);
  assert.equal(counts.directorySyncs >= 4, true);
  const source = await readFile(
    new URL('../src/gate-b-reset-epoch-v4-exclusive-output.js', import.meta.url),
    'utf8',
  );
  assert.equal(source.includes('znn-typescript-sdk'), false);
  assert.equal(/node:(?:http|https|net|tls)|\bfetch\b/.test(source), false);
});

test('preserves a stale-output collision without overwrite, deletion, or retry', async t => {
  const context = await fixture(t);
  const counts = counters();
  const stale = 'SYNTHETIC_STALE_OUTPUT_RESIDUE\n';
  let reservations = 0;
  const runPath = join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig);
  const injected = workspaceInjections(context.root, counts, {
    async openPath(path, flags, createMode) {
      if (path === runPath) {
        reservations += 1;
        if (reservations === 1) await privateWrite(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig, stale);
      }
      return open(path, flags, createMode);
    },
  });
  await expectFailure(generateGateBResetEpochV4ExclusiveOutputs(
    ...generatorArguments(context, { injected }),
  ));
  assert.equal(reservations, 1);
  assert.equal(await readFile(runPath, 'utf8'), stale);
  await assertMissing(join(
    context.root,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
  ));
  assert.equal(counts.writes.size, 0);
  assert.equal(counts.walletReads, 0);
});

test('retains first-reservation residue when the second reservation fails', async t => {
  const context = await fixture(t);
  const counts = counters();
  const approvalPath = join(
    context.root,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
  );
  let approvalReservations = 0;
  const injected = workspaceInjections(context.root, counts, {
    async openPath(path, flags, createMode) {
      if (path === approvalPath) {
        approvalReservations += 1;
        throw Object.assign(new Error('second reservation sentinel'), { code: 'EIO' });
      }
      return open(path, flags, createMode);
    },
  });
  await expectFailure(generateGateBResetEpochV4ExclusiveOutputs(
    ...generatorArguments(context, { injected }),
  ));
  assert.equal(approvalReservations, 1);
  const firstStat = await lstat(
    join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig),
    { bigint: true },
  );
  assert.equal(firstStat.size, 0n);
  assert.equal(firstStat.nlink, 1n);
  assert.equal(mode(firstStat), 0o600n);
  await assertMissing(approvalPath);
  assert.equal(counts.writes.size, 0);
  assert.equal(counts.walletReads, 0);
});

test('rejects input drift before reserving either output', async t => {
  const context = await fixture(t);
  const counts = counters();
  let drifted = false;
  const buyerRpcPath = join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc);
  const readHook = async ({ name, result }) => {
    if (!drifted && name === GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc &&
        result.bytesRead === 0) {
      drifted = true;
      await writeFile(buyerRpcPath, 'SYNTHETIC_DRIFT\n', { mode: 0o600 });
    }
  };
  const injected = workspaceInjections(context.root, counts, {
    decorateFileHandle: decorateFileHandle(counts, readHook),
  });
  await expectFailure(generateGateBResetEpochV4ExclusiveOutputs(
    ...generatorArguments(context, { injected }),
  ));
  assert.equal(drifted, true);
  await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));
  await assertMissing(join(
    context.root,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
  ));
  assert.equal(counts.walletReads, 0);
});

test('rejects cross-binding mismatch before reserving outputs', async t => {
  const context = await fixture(t, {
    expectedPaymentRequired: {
      ...runConfig().expectedPaymentRequired,
      resource: {
        ...runConfig().expectedPaymentRequired.resource,
        url: 'https://different-synthetic-output.trycloudflare.com/paid',
      },
    },
  });
  const counts = counters();
  await expectFailure(generateGateBResetEpochV4ExclusiveOutputs(
    ...generatorArguments(context, {
      injected: workspaceInjections(context.root, counts),
    }),
  ));
  await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));
  await assertMissing(join(
    context.root,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
  ));
  assert.equal(counts.walletReads, 0);
});

test('rejects unexpected leaves and aliased required inputs', async t => {
  await t.test('unexpected leaf', async t => {
    const context = await fixture(t);
    await privateWrite(context.root, 'unexpected-synthetic.json', '{}\n');
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4ExclusiveOutputs(
      ...generatorArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));
    assert.equal(counts.walletReads, 0);
  });

  await t.test('hard-linked required inputs', async t => {
    const context = await fixture(t);
    const facilitatorPath = join(
      context.root,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
    );
    await unlink(facilitatorPath);
    await link(
      join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc),
      facilitatorPath,
    );
    const counts = counters();
    await expectFailure(generateGateBResetEpochV4ExclusiveOutputs(
      ...generatorArguments(context, {
        injected: workspaceInjections(context.root, counts),
      }),
    ));
    await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));
    assert.equal(counts.walletReads, 0);
  });
});

test('rejects malformed, unreviewed, and non-canonical inputs before filesystem effects', async t => {
  const context = await fixture(t);
  const cases = [
    ['malformed approval', { approvalJson: '{}\n' }],
    ['unreviewed approval', {
      approvalJson: canonicalText(approval(context.review, { runName: 'different-run' })),
    }],
    ['non-canonical run config', {
      runConfigJson: `${JSON.stringify(context.config)}\n`,
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
      await expectFailure(generateGateBResetEpochV4ExclusiveOutputs(
        ...generatorArguments(context, { ...overrides, injected }),
      ));
      assert.equal(filesystemOpens, 0);
      assert.equal(counts.directorySyncs, 0);
      assert.equal(counts.walletReads, 0);
    });
  }
  await assertMissing(join(context.root, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig));
  await assertMissing(join(
    context.root,
    GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
  ));
});
