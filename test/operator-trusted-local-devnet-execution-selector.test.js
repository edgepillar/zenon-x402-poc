import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { test } from 'node:test';

import { prepareBuyerCli, runBuyerCli } from '../src/buyer-cli.js';
import { prepareServerCli, runServerCli } from '../src/server-cli.js';
import { ExactZenonClient, ExactZenonFacilitator } from '../src/zenon-payment.js';
import {
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
  OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS,
} from '../src/zenon/operator-trusted-local-devnet-profile.js';
import {
  OPERATOR_TRUST_ACKNOWLEDGEMENT,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  TESTNET_LIVE_ACKNOWLEDGEMENT,
  selectOperatorTrustedTestnetPolicy,
} from '../src/zenon/operator-trusted-testnet-profile.js';
import {
  selectOperatorTrustedExecutionPolicy,
} from '../src/zenon/operator-trusted-execution-policy-selector.js';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function syntheticLocalArtifactText() {
  const genesis = 'a'.repeat(64);
  const heightTwo = 'b'.repeat(64);
  return `${canonicalJson({
    acknowledgement: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    artifactVersion: 1,
    chainProfile: {
      chainIdentifier: '69',
      genesisMomentumHash: genesis,
      version: 1,
    },
    heightTwo: {
      chainIdentifier: 69,
      hash: heightTwo,
      height: 2,
      previousHash: genesis,
      version: 1,
    },
    lane: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
    nonClaims: { ...OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_NON_CLAIMS },
    provenance: {
      generator: {
        repository: '0x3639/testnet',
        revision: 'c'.repeat(40),
      },
      nodeRuntime: {
        containerImageDigest: `sha256:${'d'.repeat(64)}`,
        sourceRepository: 'zenon-network/go-zenon',
        sourceRevision: 'e'.repeat(40),
      },
    },
  })}\n`;
}

function loopbackRpcUrl() {
  const host = [127, 0, 0, 1].join('.');
  const port = (2 ** 14) - 1;
  return `ws://${host}:${port}/`;
}

function ipv6LoopbackRpcUrl() {
  const port = (2 ** 14) - 1;
  return `ws://[::1]:${port}/`;
}

function nonLoopbackRpcUrl() {
  const host = ['e', 'x', 'a', 'm', 'p', 'l', 'e'].join('');
  const port = (2 ** 14) - 1;
  return `ws://${host}:${port}/`;
}

function credentialBearingLoopbackRpcUrl() {
  const url = new URL(loopbackRpcUrl());
  url.username = String.fromCharCode(117);
  url.password = String.fromCharCode(112);
  return url.href;
}

function artifactFileName(suffix) {
  return `x402-local-profile-${process.pid}-${suffix}.json`;
}

async function withArtifact(text, suffix, callback) {
  const fileName = artifactFileName(suffix);
  writeFileSync(fileName, text, { flag: 'wx', mode: 0o600 });
  try {
    return await callback(fileName);
  } finally {
    rmSync(fileName, { force: true });
  }
}

async function withDirectoryArtifact(suffix, callback) {
  const directoryName = artifactFileName(suffix);
  mkdirSync(directoryName, { mode: 0o700 });
  try {
    return await callback(directoryName);
  } finally {
    rmSync(directoryName, { force: true, recursive: true });
  }
}

async function withFifoArtifact(suffix, callback) {
  const fileName = artifactFileName(suffix);
  execFileSync('mkfifo', [fileName]);
  try {
    return await callback(fileName);
  } finally {
    rmSync(fileName, { force: true });
  }
}

function localEnv(fileName, overrides = {}) {
  return {
    PAYMENT_MODE: 'zenon',
    ZENON_CHAIN_PROFILE_NAME: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
    ZENON_LOCAL_DEVNET_ARTIFACT_FILE: fileName,
    ZENON_LOCAL_DEVNET_ACK: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    ZENON_RPC_URL: loopbackRpcUrl(),
    ...overrides,
  };
}

function publicTestnetEnv() {
  return {
    PAYMENT_MODE: 'zenon',
    ZENON_CHAIN_PROFILE_NAME: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    ZENON_OPERATOR_TRUST_ACK: OPERATOR_TRUST_ACKNOWLEDGEMENT,
    ZENON_LIVE_ACK: TESTNET_LIVE_ACKNOWLEDGEMENT,
  };
}

function buyerRuntime(counter) {
  return async () => {
    counter.calls += 1;
    return {
      Client: class Client {
        constructor(options = undefined) {
          this.options = options;
        }
      },
      paidFetch: async () => undefined,
    };
  };
}

function serverRuntime(counter, observed) {
  return async () => {
    counter.calls += 1;
    return {
      Facilitator: class Facilitator {
        constructor(options = undefined) {
          observed.facilitatorOptions = options;
        }
      },
      buildRequirement: async (mode, options) => {
        observed.requirementMode = mode;
        observed.chainProfile = options?.zenonChain;
        return Object.freeze({});
      },
      createResourceServer: () => Object.freeze({}),
      envInt: () => (2 ** 12) + 1,
    };
  };
}

async function assertBuyerFailsBeforeRuntime(env) {
  const counter = { calls: 0 };
  await assert.rejects(() => prepareBuyerCli({ env, loadRuntime: buyerRuntime(counter) }));
  assert.equal(counter.calls, 0);
}

async function assertServerFailsBeforeRuntime(env) {
  const counter = { calls: 0 };
  const observed = {};
  await assert.rejects(() => prepareServerCli({
    env,
    loadRuntime: serverRuntime(counter, observed),
  }));
  assert.equal(counter.calls, 0);
  assert.equal(Object.keys(observed).length, 0);
}

async function assertBothFailBeforeRuntime(env) {
  await assertBuyerFailsBeforeRuntime(env);
  await assertServerFailsBeforeRuntime(env);
}

async function assertCliWrappersFailBeforeRuntime(env) {
  const buyerCounter = { calls: 0 };
  const serverCounter = { calls: 0 };
  const observed = {};
  await assert.rejects(() => runBuyerCli({
    env,
    argv: ['node', 'buyer-cli.js'],
    loadRuntime: buyerRuntime(buyerCounter),
    onOperatorTrustWarning: () => {},
    onOutput: () => {},
  }));
  await assert.rejects(() => runServerCli({
    env,
    loadRuntime: serverRuntime(serverCounter, observed),
    onOperatorTrustWarning: () => {},
    onOutput: () => {},
  }));
  assert.equal(buyerCounter.calls, 0);
  assert.equal(serverCounter.calls, 0);
  assert.equal(Object.keys(observed).length, 0);
}

test('mock remains the default execution mode for both ordinary CLIs', async () => {
  const buyerCounter = { calls: 0 };
  const serverCounter = { calls: 0 };
  const observed = {};
  const buyer = await prepareBuyerCli({ env: {}, loadRuntime: buyerRuntime(buyerCounter) });
  const server = await prepareServerCli({
    env: {},
    loadRuntime: serverRuntime(serverCounter, observed),
  });

  assert.equal(buyer.mode, 'mock');
  assert.equal(buyer.policy, undefined);
  assert.equal(server.mode, 'mock');
  assert.equal(server.policy, undefined);
  assert.equal(buyerCounter.calls, 1);
  assert.equal(serverCounter.calls, 1);
});

test('the existing public-testnet selection remains closed and unchanged', () => {
  const selection = selectOperatorTrustedExecutionPolicy(publicTestnetEnv());
  const direct = selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
    OPERATOR_TRUST_ACKNOWLEDGEMENT,
    TESTNET_LIVE_ACKNOWLEDGEMENT,
  );

  assert.equal(selection.profileName, direct.profileName);
  assert.equal(selection.warning, direct.warning);
  assert.deepEqual(selection.chainProfile, direct.chainProfile());
  assert.equal(Object.isFrozen(selection.chainProfile), true);
  assert.throws(() => selectOperatorTrustedTestnetPolicy(
    OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_LANE,
    OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    '',
  ));
});

test('invalid public-testnet selection preserves its existing failure family', () => {
  const invalidName = ['u', 'n', 'k', 'n', 'o', 'w', 'n'].join('');
  let expected;
  try {
    selectOperatorTrustedTestnetPolicy(
      invalidName,
      OPERATOR_TRUST_ACKNOWLEDGEMENT,
      TESTNET_LIVE_ACKNOWLEDGEMENT,
    );
  } catch (error) {
    expected = error;
  }
  assert.ok(expected);
  assert.throws(() => selectOperatorTrustedExecutionPolicy({
    ...publicTestnetEnv(),
    ZENON_CHAIN_PROFILE_NAME: invalidName,
  }), error => error?.name === expected.name && error?.code === expected.code);
});

test('ordinary buyer and server preserve public-testnet policy construction', async () => {
  const env = publicTestnetEnv();
  const buyerCounter = { calls: 0 };
  const serverCounter = { calls: 0 };
  const observed = {};
  const buyer = await prepareBuyerCli({ env, loadRuntime: buyerRuntime(buyerCounter) });
  const server = await prepareServerCli({
    env,
    loadRuntime: serverRuntime(serverCounter, observed),
  });

  assert.equal(buyer.policy.profileName, OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME);
  assert.equal(server.policy.profileName, OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME);
  assert.deepEqual(observed.chainProfile, server.policy.chainProfile());
  assert.equal(Object.hasOwn(buyer.client.options, 'rpcUrl'), false);
  assert.equal(Object.hasOwn(observed.facilitatorOptions, 'rpcUrl'), false);
  assert.equal(buyerCounter.calls, 1);
  assert.equal(serverCounter.calls, 1);
});

test('buyer and server derive equivalent local policies from one explicit artifact family', async () => {
  await withArtifact(syntheticLocalArtifactText(), 'valid', async fileName => {
    for (const rpcUrl of [loopbackRpcUrl(), ipv6LoopbackRpcUrl()]) {
      const env = localEnv(fileName, { ZENON_RPC_URL: rpcUrl });
      const buyerCounter = { calls: 0 };
      const serverCounter = { calls: 0 };
      const observed = {};
      const buyer = await prepareBuyerCli({ env, loadRuntime: buyerRuntime(buyerCounter) });
      const server = await prepareServerCli({
        env,
        loadRuntime: serverRuntime(serverCounter, observed),
      });

      assert.equal(buyer.policy.trustMode, server.policy.trustMode);
      assert.deepEqual(buyer.policy.chainProfile, server.policy.chainProfile);
      assert.deepEqual(observed.chainProfile, server.policy.chainProfile);
      assert.equal(buyer.client.options.rpcUrl, rpcUrl);
      assert.equal(observed.facilitatorOptions.rpcUrl, rpcUrl);
      assert.equal(observed.facilitatorOptions.operatorTrustedChainPolicy, server.policy);
      assert.equal(buyerCounter.calls, 1);
      assert.equal(serverCounter.calls, 1);
    }
  });
});

test('missing or unknown local selector inputs fail before buyer runtime construction', async () => {
  await assertBothFailBeforeRuntime({
    PAYMENT_MODE: 'zenon',
    ZENON_CHAIN_PROFILE_NAME: ['u', 'n', 'k', 'n', 'o', 'w', 'n'].join(''),
  });
  await assertBothFailBeforeRuntime({ PAYMENT_MODE: 'zenon' });
  await assertBothFailBeforeRuntime(localEnv(undefined));
});

test('missing or wrong local acknowledgement fails before runtime construction', async () => {
  await withArtifact(syntheticLocalArtifactText(), 'wrong-ack', async fileName => {
    await assertBothFailBeforeRuntime(localEnv(fileName, {
      ZENON_LOCAL_DEVNET_ACK: undefined,
    }));
    await assertBothFailBeforeRuntime(localEnv(fileName, {
      ZENON_LOCAL_DEVNET_ACK: String.fromCharCode(110),
    }));
  });
});

test('missing, empty, oversized, invalid-UTF-8, malformed, and noncanonical local artifacts fail before runtime construction', async () => {
  await assertBothFailBeforeRuntime(localEnv(undefined));
  await withArtifact(Buffer.alloc(0), 'empty', async fileName => {
    await assertBothFailBeforeRuntime(localEnv(fileName));
  });
  await withArtifact(Buffer.alloc((16 * 1024) + 1, 0x20), 'oversized', async fileName => {
    await assertBothFailBeforeRuntime(localEnv(fileName));
  });
  await withArtifact(Buffer.from([0xc3, 0x28]), 'invalid-utf8', async fileName => {
    await assertBothFailBeforeRuntime(localEnv(fileName));
  });
  await withArtifact('{}\n', 'malformed', async fileName => {
    await assertBothFailBeforeRuntime(localEnv(fileName));
  });
  await withArtifact(`${syntheticLocalArtifactText()}\n`, 'noncanonical', async fileName => {
    await assertBothFailBeforeRuntime(localEnv(fileName));
  });
});

test('unsafe local artifact filesystem objects fail before runtime construction', async () => {
  await withArtifact(syntheticLocalArtifactText(), 'unsafe-target', async fileName => {
    const symlinkName = artifactFileName('unsafe-symlink');
    symlinkSync(fileName, symlinkName);
    try {
      await assertBothFailBeforeRuntime(localEnv(symlinkName));
    } finally {
      rmSync(symlinkName, { force: true });
    }

    const hardlinkName = artifactFileName('unsafe-hardlink');
    linkSync(fileName, hardlinkName);
    try {
      await assertBothFailBeforeRuntime(localEnv(hardlinkName));
    } finally {
      rmSync(hardlinkName, { force: true });
    }

    chmodSync(fileName, 0o622);
    await assertBothFailBeforeRuntime(localEnv(fileName));
  });
  await withDirectoryArtifact('unsafe-directory', async directoryName => {
    await assertBothFailBeforeRuntime(localEnv(directoryName));
  });
  await withFifoArtifact('unsafe-fifo', async fifoName => {
    await assertBothFailBeforeRuntime(localEnv(fifoName));
  });
});

test('local RPC validation accepts only canonical IPv4 or IPv6 loopback WebSocket URLs', async () => {
  await withArtifact(syntheticLocalArtifactText(), 'rpc', async fileName => {
    const invalidRpcUrls = [
      undefined,
      nonLoopbackRpcUrl(),
      credentialBearingLoopbackRpcUrl(),
      'wss://127.0.0.1:16383/',
      'http://127.0.0.1:16383/',
      'ws://127.0.0.1:16383/path',
      'ws://127.0.0.1:16383/?query=value',
      'ws://127.0.0.1:16383/#fragment',
      'ws://127.0.0.1:80/',
      'ws://127.0.0.1:0/',
      'ws://127.0.0.1:65536/',
      'ws://127.1:16383/',
      'ws://2130706433:16383/',
      'ws://0x7f000001:16383/',
      'ws://localhost:16383/',
      'ws://[::ffff:127.0.0.1]:16383/',
    ];
    for (const rpcUrl of invalidRpcUrls) {
      await assertBothFailBeforeRuntime(localEnv(fileName, { ZENON_RPC_URL: rpcUrl }));
    }
  });
});

test('mixed public and local selector families fail before either runtime is loaded', async () => {
  await withArtifact(syntheticLocalArtifactText(), 'mixed-family', async fileName => {
    await assertBothFailBeforeRuntime(localEnv(fileName, {
      ZENON_OPERATOR_TRUST_ACK: OPERATOR_TRUST_ACKNOWLEDGEMENT,
    }));
    await assertBothFailBeforeRuntime(localEnv(fileName, {
      ZENON_LIVE_ACK: TESTNET_LIVE_ACKNOWLEDGEMENT,
    }));
    await assertBothFailBeforeRuntime(localEnv(fileName, {
      ZENON_OPERATOR_TRUST_ACK: undefined,
    }));
    await assertBothFailBeforeRuntime(localEnv(fileName, {
      ZENON_LIVE_ACK: undefined,
    }));
    await assertBothFailBeforeRuntime({
      ...publicTestnetEnv(),
      ZENON_LOCAL_DEVNET_ACK: OPERATOR_TRUSTED_LOCAL_FOUR_NODE_DEVNET_ACKNOWLEDGEMENT,
    });
    await assertBothFailBeforeRuntime({
      ...publicTestnetEnv(),
      ZENON_LOCAL_DEVNET_ARTIFACT_FILE: fileName,
    });
    await assertBothFailBeforeRuntime({
      ...publicTestnetEnv(),
      ZENON_LOCAL_DEVNET_ACK: undefined,
    });
    await assertBothFailBeforeRuntime({
      ...publicTestnetEnv(),
      ZENON_LOCAL_DEVNET_ARTIFACT_FILE: undefined,
    });
  });
});

test('execution selection rejects accessors and proxies without invoking their hooks', async () => {
  for (const field of [
    'ZENON_CHAIN_PROFILE_NAME',
    'ZENON_OPERATOR_TRUST_ACK',
    'ZENON_LIVE_ACK',
  ]) {
    const env = publicTestnetEnv();
    let reads = 0;
    Object.defineProperty(env, field, {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        return undefined;
      },
    });
    assert.throws(() => selectOperatorTrustedExecutionPolicy(env), {
      code: 'operator_trusted_local_devnet_execution_invalid',
    });
    assert.equal(reads, 0);
  }

  let traps = 0;
  const env = new Proxy(publicTestnetEnv(), {
    get(target, field, receiver) {
      traps += 1;
      return Reflect.get(target, field, receiver);
    },
    getOwnPropertyDescriptor(target, field) {
      traps += 1;
      return Reflect.getOwnPropertyDescriptor(target, field);
    },
  });
  assert.throws(() => selectOperatorTrustedExecutionPolicy(env), {
    code: 'operator_trusted_local_devnet_execution_invalid',
  });
  assert.equal(traps, 0);
});

test('ordinary CLI wrappers reject hostile payment-mode environments without invoking hooks', async () => {
  const accessorEnv = publicTestnetEnv();
  let reads = 0;
  Object.defineProperty(accessorEnv, 'PAYMENT_MODE', {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1;
      throw new Error('unreachable payment-mode accessor');
    },
  });
  await assertCliWrappersFailBeforeRuntime(accessorEnv);
  assert.equal(reads, 0);

  let traps = 0;
  const proxyEnv = new Proxy(publicTestnetEnv(), {
    get(target, field, receiver) {
      traps += 1;
      return Reflect.get(target, field, receiver);
    },
    getOwnPropertyDescriptor(target, field) {
      traps += 1;
      return Reflect.getOwnPropertyDescriptor(target, field);
    },
  });
  await assertCliWrappersFailBeforeRuntime(proxyEnv);
  assert.equal(traps, 0);
});

test('local RPC selection rejects accessors and binds its snapshot across asynchronous runtime construction', async () => {
  await withArtifact(syntheticLocalArtifactText(), 'rpc-snapshot', async fileName => {
    const accessorEnv = localEnv(fileName);
    Object.defineProperty(accessorEnv, 'ZENON_RPC_URL', {
      configurable: true,
      enumerable: true,
      get: loopbackRpcUrl,
    });
    await assertBothFailBeforeRuntime(accessorEnv);

    const env = localEnv(fileName);
    const selected = selectOperatorTrustedExecutionPolicy(env);
    const originalRpcUrl = selected.rpcUrl;
    env.ZENON_RPC_URL = nonLoopbackRpcUrl();
    const client = new ExactZenonClient({
      environment: env,
      operatorTrustedChainPolicy: selected.policy,
      rpcUrl: selected.rpcUrl,
    });
    const facilitator = new ExactZenonFacilitator({
      environment: env,
      operatorTrustedChainPolicy: selected.policy,
      rpcUrl: selected.rpcUrl,
    });
    assert.equal(Object.getOwnPropertyDescriptor(client, 'rpcUrl')?.value, originalRpcUrl);
    assert.equal(Object.getOwnPropertyDescriptor(facilitator, 'rpcUrl')?.value, originalRpcUrl);
    assert.equal(Object.getOwnPropertyDescriptor(client, 'rpcUrl')?.enumerable, false);
    assert.equal(Object.getOwnPropertyDescriptor(facilitator, 'rpcUrl')?.enumerable, false);
    assert.equal(Object.isFrozen(client.operatorTrustedChainProfile), true);
    assert.equal(Object.isFrozen(facilitator.operatorTrustedChainProfile), true);

    const delayedEnv = localEnv(fileName);
    const buyerCounter = { calls: 0 };
    const buyer = await prepareBuyerCli({
      env: delayedEnv,
      loadRuntime: async () => {
        delayedEnv.ZENON_RPC_URL = nonLoopbackRpcUrl();
        return buyerRuntime(buyerCounter)();
      },
    });
    assert.equal(buyer.client.options.rpcUrl, originalRpcUrl);
    assert.equal(buyerCounter.calls, 1);
  });
});

test('public constructors require an exact local-policy and bound-loopback-RPC pair', async () => {
  await withArtifact(syntheticLocalArtifactText(), 'constructor-pairing', async fileName => {
    const localSelection = selectOperatorTrustedExecutionPolicy(localEnv(fileName));
    const publicPolicy = selectOperatorTrustedTestnetPolicy(
      OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
      OPERATOR_TRUST_ACKNOWLEDGEMENT,
      TESTNET_LIVE_ACKNOWLEDGEMENT,
    );
    const authenticateChainProfile = async () => publicPolicy.chainProfile();
    const constructors = [
      options => new ExactZenonClient(options),
      options => new ExactZenonFacilitator(options),
    ];

    for (const construct of constructors) {
      let environmentReads = 0;
      const hostileEnvironment = {};
      for (const field of [
        'ZENON_MNEMONIC',
        'ZENON_ACCOUNT_INDEX',
        'ZENON_RPC_TIMEOUT_MS',
      ]) {
        Object.defineProperty(hostileEnvironment, field, {
          configurable: true,
          enumerable: true,
          get() {
            environmentReads += 1;
            throw new Error('unreachable constructor environment accessor');
          },
        });
      }

      assert.throws(() => construct({
        environment: hostileEnvironment,
        operatorTrustedChainPolicy: localSelection.policy,
      }), { code: 'operator_trusted_local_devnet_rpc_policy_mismatch' });
      assert.equal(environmentReads, 0);

      for (const rpcUrl of [
        nonLoopbackRpcUrl(),
        nonLoopbackRpcUrl().replace(/^ws:/, 'wss:'),
        credentialBearingLoopbackRpcUrl(),
      ]) {
        assert.throws(() => construct({
          environment: hostileEnvironment,
          operatorTrustedChainPolicy: localSelection.policy,
          rpcUrl,
        }), { code: 'operator_trusted_local_devnet_rpc_invalid' });
        assert.equal(environmentReads, 0);
      }

      for (const rpcUrl of [loopbackRpcUrl(), ipv6LoopbackRpcUrl()]) {
        assert.doesNotThrow(() => construct({
          environment: {},
          operatorTrustedChainPolicy: localSelection.policy,
          rpcUrl,
        }));
      }

      assert.throws(() => construct({
        environment: hostileEnvironment,
        operatorTrustedChainPolicy: publicPolicy,
        rpcUrl: loopbackRpcUrl(),
      }), { code: 'operator_trusted_local_devnet_rpc_policy_mismatch' });
      assert.equal(environmentReads, 0);
      assert.doesNotThrow(() => construct({
        environment: {},
        operatorTrustedChainPolicy: publicPolicy,
      }));

      assert.throws(() => construct({
        authenticateChainProfile,
        environment: hostileEnvironment,
        rpcUrl: loopbackRpcUrl(),
      }), { code: 'operator_trusted_local_devnet_rpc_policy_mismatch' });
      assert.equal(environmentReads, 0);
      assert.doesNotThrow(() => construct({
        authenticateChainProfile,
        environment: {},
      }));
      assert.throws(() => construct({
        environment: hostileEnvironment,
        rpcUrl: loopbackRpcUrl(),
      }), { code: 'operator_trusted_local_devnet_rpc_policy_mismatch' });
      assert.equal(environmentReads, 0);
    }
  });
});

test('local selector errors are fixed and redacted before runtime construction', async () => {
  await withArtifact('{}\n', 'redaction', async fileName => {
    let captured;
    try {
      selectOperatorTrustedExecutionPolicy(localEnv(fileName));
    } catch (error) {
      captured = error;
    }
    assert.equal(captured?.code, 'operator_trusted_local_devnet_execution_invalid');
    assert.equal(captured?.stack, undefined);
    assert.equal(captured?.message, 'operator_trusted_local_devnet_execution_invalid');
  });
});
