import { writeSync } from 'node:fs';

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

async function runServerCli() {
  const { loadDotEnv, envInt } = await import('./env.js');
  loadDotEnv();

  const mode = process.env.PAYMENT_MODE ?? 'mock';
  const [{ createResourceServer }, { buildRequirement }] = await Promise.all([
    import('./resource-server.js'),
    import('./config.js'),
  ]);
  const requirement = await buildRequirement(mode);
  let facilitator;
  if (mode === 'mock') {
    const { MockExactZenonFacilitator } = await import('./mock-payment.js');
    facilitator = new MockExactZenonFacilitator();
  } else {
    const { ExactZenonFacilitator } = await import('./zenon-payment.js');
    facilitator = new ExactZenonFacilitator();
  }

  const port = envInt('PORT', 8402);
  const app = createResourceServer({
    facilitator,
    requirement,
    port,
    advertisedBaseUrl: process.env.RESOURCE_BASE_URL,
  });
  await runServerLifecycle({
    app,
    onTerminalFailure: reportFailure,
    onListening(listening) {
      console.log(`[${mode}] x402 resource server listening on ${listening.url}/paid`);
      console.log('Requirement:', requirement);
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
