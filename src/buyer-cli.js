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
  const mode = env.PAYMENT_MODE ?? 'mock';
  if (mode !== 'mock' && mode !== 'zenon') throw new Error('unsupported payment mode');

  let policy;
  if (mode === 'zenon') {
    const { selectOperatorTrustedTestnetPolicy } =
      await import('./zenon/operator-trusted-testnet-profile.js');
    policy = selectOperatorTrustedTestnetPolicy(
      env.ZENON_CHAIN_PROFILE_NAME,
      env.ZENON_OPERATOR_TRUST_ACK,
      env.ZENON_LIVE_ACK,
    );
  }

  const { Client, paidFetch } = await loadRuntime(mode);
  const client = mode === 'mock'
    ? new Client()
    : new Client({ environment: env, operatorTrustedChainPolicy: policy });
  return { client, mode, paidFetch, policy };
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

  const url = argv[2] ?? env.RESOURCE_URL ?? 'http://127.0.0.1:8402/paid';
  const { client, mode, paidFetch, policy } = await prepareBuyerCli({
    env,
    ...(loadRuntime === undefined ? {} : { loadRuntime }),
  });
  const result = await paidFetch(url, client);
  const body = await result.response.text();
  if (mode === 'mock') {
    onOutput('HTTP:', result.response.status);
    onOutput('Settlement:', result.settlement);
    onOutput(body);
    return;
  }

  onOperatorTrustWarning(policy.warning);
  onOutput('HTTP status:', result.response.status);
  onOutput('Selected profile:', policy.profileName);
  onOutput('Trust mode:', policy.trustMode);
  onOutput('Remote chain authenticated: no');
}

async function launchBuyerCli() {
  if (typeof process.argv[1] !== 'string') return;
  const { pathToFileURL } = await import('node:url');
  if (pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  await runBuyerCli();
}

void launchBuyerCli().catch(() => reportFailure());
