import {
  selectOperatorTrustedCliExecution,
} from './zenon/operator-trusted-execution-policy-selector.js';

const FAILURE_LINE = 'Buyer CLI failed.\n';
let failureReported = false;

function reportFailure() {
  if (failureReported) return;
  failureReported = true;
  process.exitCode = 1;
  try {
    process.stderr.write(FAILURE_LINE);
  } catch {
    // The nonzero exit status remains the only available failure signal.
  }
}

async function loadBuyerRuntime(mode) {
  const { paidFetch } = await import('./buyer.js');
  if (mode === 'mock') {
    const { MockExactZenonClient } = await import('./mock-payment.js');
    return { Client: MockExactZenonClient, paidFetch };
  }
  const { ExactZenonClient } = await import('./zenon-payment.js');
  return { Client: ExactZenonClient, paidFetch };
}

export async function prepareBuyerCli({
  env = process.env,
  loadRuntime = loadBuyerRuntime,
} = {}) {
  const { mode, operatorTrust } = selectOperatorTrustedCliExecution(env);
  const policy = operatorTrust?.policy;

  const { Client, paidFetch } = await loadRuntime(mode);
  const runtimeOptions = {
    environment: env,
    operatorTrustedChainPolicy: policy,
  };
  if (operatorTrust?.rpcUrl !== undefined) runtimeOptions.rpcUrl = operatorTrust.rpcUrl;
  const client = mode === 'mock'
    ? new Client()
    : new Client(runtimeOptions);
  return { client, mode, paidFetch, policy, operatorTrust };
}

export async function runBuyerCli({
  env = process.env,
  argv = process.argv,
  loadRuntime,
  onOperatorTrustWarning = warning => process.stderr.write(`${warning}\n`),
  onOutput = (...args) => console.log(...args),
} = {}) {
  const { loadDotEnv } = await import('./env.js');
  loadDotEnv();

  const prepared = await prepareBuyerCli({
    env,
    ...(loadRuntime === undefined ? {} : { loadRuntime }),
  });
  const url = argv[2] ?? env.RESOURCE_URL ?? 'http://127.0.0.1:8402/paid';
  const { client, mode, paidFetch, operatorTrust } = prepared;
  const result = await paidFetch(url, client);
  const body = await result.response.text();
  if (mode === 'mock') {
    onOutput('HTTP:', result.response.status);
    onOutput('Settlement:', result.settlement);
    onOutput(body);
    return;
  }

  onOperatorTrustWarning(operatorTrust.warning);
  onOutput('HTTP status:', result.response.status);
  onOutput('Selected profile:', operatorTrust.profileName);
  onOutput('Trust mode:', operatorTrust.trustMode);
  onOutput('Remote chain authenticated: no');
}

/**
 * Explicit existing-key command host. This named entry does not change the
 * ordinary argv/default buyer, derive keys or acquire process stdio implicitly.
 * Native SDK/SQLite/HTTPS qualification of this wider graph remains separate.
 */
export async function openBuyerOriginalFundingCommandSession(configuration) {
  if (arguments.length !== 1) throw new TypeError('buyer_command_configuration_required');
  const { openSdk105NativeFundingCommandSession } =
    await import('./zenon/sdk105-native-funding-command-session.js');
  return openSdk105NativeFundingCommandSession(configuration);
}

/** Source-only opt-in API-credit binding with an explicit spending file and
 * the existing-key native client. Ordinary argv/default behavior is unchanged. */
export async function openBuyerApiCreditCommandSession(configuration) {
  if (arguments.length !== 1) throw new TypeError('buyer_api_credit_configuration_required');
  const { openSdk105NativeApiCreditCommandSession } =
    await import('./zenon/sdk105-native-api-credit-command-session.js');
  return openSdk105NativeApiCreditCommandSession(configuration);
}

export async function runBuyerApiCreditCommands(configuration) {
  if (arguments.length !== 1) throw new TypeError('buyer_api_credit_configuration_required');
  return runOriginalCommands(openBuyerApiCreditCommandSession, configuration);
}

/** Explicit existing-original recovery; no funding, key or default CLI switch.
 * Native SDK/SQLite/HTTPS qualification remains source-bound and separate. */
export async function openBuyerOriginalRecoveryCommandSession(configuration) {
  if (arguments.length !== 1) throw new TypeError('buyer_recovery_configuration_required');
  const { openNativeOriginalRecoveryCommandSession } =
    await import('./zenon/native-original-recovery-command-session.js');
  return openNativeOriginalRecoveryCommandSession(configuration);
}

/** Same existing-original owner plus an explicit borrowed local backend store.
 * Native two-store/official/HTTPS composition remains separately qualified. */
export async function openBuyerOriginalBackendRecoveryCommandSession(configuration) {
  if (arguments.length !== 1) throw new TypeError('buyer_backend_recovery_configuration_required');
  const { openNativeOriginalBackendRecoveryCommandSession } =
    await import('./zenon/native-original-recovery-command-session.js');
  return openNativeOriginalBackendRecoveryCommandSession(configuration);
}

/** Run the real named session through the shared bounded terminal observer.
 * Return a sanitized host result; do not force process exit or write a second
 * result after the owned command output has closed. */
export async function runBuyerOriginalFundingCommands(configuration) {
  if (arguments.length !== 1) throw new TypeError('buyer_command_configuration_required');
  return runOriginalCommands(openBuyerOriginalFundingCommandSession, configuration);
}

export async function runBuyerOriginalRecoveryCommands(configuration) {
  if (arguments.length !== 1) throw new TypeError('buyer_recovery_configuration_required');
  return runOriginalCommands(openBuyerOriginalRecoveryCommandSession, configuration);
}

export async function runBuyerOriginalBackendRecoveryCommands(configuration) {
  if (arguments.length !== 1) throw new TypeError('buyer_backend_recovery_configuration_required');
  return runOriginalCommands(openBuyerOriginalBackendRecoveryCommandSession, configuration);
}

async function runOriginalCommands(open, configuration) {
  const { runBuyerOriginalCommandHost, buyerOriginalCommandHostRefusalResult } =
    await import('./buyer-original-command-host.js');
  let session = null;
  try {
    session = await open(configuration);
    return await runBuyerOriginalCommandHost(session);
  } catch {
    if (session !== null) { try { await session.close(); } catch {} }
    return buyerOriginalCommandHostRefusalResult(session === null ? 'OPEN_REFUSED' : 'HOST_REFUSED');
  }
}

/** Explicit supplied-FIFO original-only launcher; source-only native binding.
 * First command line carries external original/pins/configuration. No defaults,
 * environment secret loading, arbitrary factory or funding/signing selection. */
export async function runBuyerOriginalRecoveryPipeCommands(configuration) {
  if (arguments.length !== 1) throw new TypeError('buyer_recovery_pipe_configuration_required');
  const { runNativeOriginalRecoveryPipeHost } =
    await import('./zenon/native-original-recovery-pipe-host.js');
  return runNativeOriginalRecoveryPipeHost(configuration);
}

async function launchBuyerCli() {
  if (typeof process.argv[1] !== 'string') return;
  const { pathToFileURL } = await import('node:url');
  if (pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  await runBuyerCli();
}

void launchBuyerCli().catch(() => reportFailure());
