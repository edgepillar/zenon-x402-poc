import { writeSync } from 'node:fs';

import {
  selectOperatorTrustedCliExecution,
} from './zenon/operator-trusted-execution-policy-selector.js';

const FAILURE_LINE = 'Server CLI failed.\n';
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'];
let failureReported = false;

function reportFailure() {
  if (failureReported) return;
  failureReported = true;
  process.exitCode = 1;
  try {
    writeSync(2, FAILURE_LINE);
  } catch {}
  process.exit(1);
}

// Import-safe seam for deterministic lifecycle tests; production supplies the real process and app.
export async function runServerLifecycle({
  app,
  signalTarget = process,
  onListening,
  onTerminalFailure,
}) {
  let listening = false;
  let shutdownRequested = false;
  let closePromise;
  let settled = false;
  let settleLifecycle;
  const installedSignals = [];
  const completion = new Promise(resolve => {
    settleLifecycle = resolve;
  });

  const settleOnce = succeeded => {
    if (settled) return;
    settled = true;
    if (!succeeded && typeof onTerminalFailure === 'function') onTerminalFailure();
    settleLifecycle(succeeded);
  };
  const closeOnce = () => {
    if (closePromise === undefined) {
      closePromise = Promise.resolve().then(() => app.close());
    }
    return closePromise;
  };
  const beginClose = () => {
    closeOnce().then(
      () => settleOnce(true),
      () => settleOnce(false),
    );
  };
  const handleSignal = () => {
    if (shutdownRequested || settled) return;
    shutdownRequested = true;
    if (listening) beginClose();
  };
  const handleServerError = () => settleOnce(false);
  const handleServerClose = () => {
    if (closePromise === undefined) settleOnce(false);
  };

  try {
    for (const signal of SHUTDOWN_SIGNALS) {
      signalTarget.on(signal, handleSignal);
      installedSignals.push(signal);
    }
    app.server.on('error', handleServerError);
    app.server.on('close', handleServerClose);

    let listeningInfo;
    let listenSucceeded = false;
    try {
      listeningInfo = await app.listen();
      listenSucceeded = true;
    } catch {
      settleOnce(false);
    }

    if (listenSucceeded && !settled) {
      listening = true;
      if (shutdownRequested) beginClose();
      else {
        try {
          onListening(listeningInfo);
        } catch {
          settleOnce(false);
        }
      }
    }

    const succeeded = await completion;
    if (!succeeded) throw new Error('server lifecycle failed');
  } finally {
    for (const signal of installedSignals) signalTarget.off(signal, handleSignal);
    app.server.off('error', handleServerError);
    app.server.off('close', handleServerClose);
  }
}

async function loadServerRuntime(mode) {
  const [{ createResourceServer }, { buildRequirement }, { envInt }] = await Promise.all([
    import('./resource-server.js'),
    import('./config.js'),
    import('./env.js'),
  ]);
  if (mode === 'mock') {
    const { MockExactZenonFacilitator } = await import('./mock-payment.js');
    return { buildRequirement, createResourceServer, envInt, Facilitator: MockExactZenonFacilitator };
  }
  const { ExactZenonFacilitator } = await import('./zenon-payment.js');
  return { buildRequirement, createResourceServer, envInt, Facilitator: ExactZenonFacilitator };
}

export async function prepareServerCli({
  env = process.env,
  loadRuntime = loadServerRuntime,
} = {}) {
  const { mode, operatorTrust } = selectOperatorTrustedCliExecution(env);
  const policy = operatorTrust?.policy;

  const { buildRequirement, createResourceServer, envInt, Facilitator } =
    await loadRuntime(mode);
  const requirement = await buildRequirement(
    mode,
    operatorTrust === undefined ? undefined : { zenonChain: operatorTrust.chainProfile },
    env,
  );
  const runtimeOptions = {
    environment: env,
    operatorTrustedChainPolicy: policy,
  };
  if (operatorTrust?.rpcUrl !== undefined) runtimeOptions.rpcUrl = operatorTrust.rpcUrl;
  const facilitator = mode === 'mock'
    ? new Facilitator()
    : new Facilitator(runtimeOptions);
  const port = envInt('PORT', 8402, env);
  const app = createResourceServer({
    facilitator,
    requirement,
    port,
    advertisedBaseUrl: env.RESOURCE_BASE_URL,
  });
  return { app, mode, operatorTrust, policy, requirement };
}

export async function runServerCli({
  env = process.env,
  loadRuntime,
  onOperatorTrustWarning = warning => writeSync(2, `${warning}\n`),
  onOutput = (...args) => console.log(...args),
  signalTarget = process,
} = {}) {
  const { loadDotEnv } = await import('./env.js');
  loadDotEnv();

  const { app, mode, operatorTrust, requirement } = await prepareServerCli({
    env,
    ...(loadRuntime === undefined ? {} : { loadRuntime }),
  });
  await runServerLifecycle({
    app,
    signalTarget,
    onTerminalFailure: reportFailure,
    onListening(listening) {
      if (mode === 'mock') {
        onOutput(`[${mode}] x402 resource server listening on ${listening.url}/paid`);
        onOutput('Requirement:', requirement);
        return;
      }
      onOperatorTrustWarning(operatorTrust.warning);
      onOutput('Zenon resource server listening.');
      onOutput('Selected profile:', operatorTrust.profileName);
      onOutput('Trust mode:', operatorTrust.trustMode);
      onOutput('Remote chain authenticated: no');
    },
  });
}

async function launchServerCli() {
  if (typeof process.argv[1] !== 'string') return;
  const { pathToFileURL } = await import('node:url');
  if (pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  await runServerCli();
}

void launchServerCli().catch(() => reportFailure());
