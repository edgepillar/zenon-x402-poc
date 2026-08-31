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

async function launchBuyerCli() {
  if (typeof process.argv[1] !== 'string') return;
  const { pathToFileURL } = await import('node:url');
  if (pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  await runBuyerCli();
}

void launchBuyerCli().catch(() => reportFailure());
