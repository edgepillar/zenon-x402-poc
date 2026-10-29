import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { captureApiCreditCliArguments } from './api-credit-cli-arguments.js';

const HELP = 'API credit operator source candidate (native acceptance is OPEN).\n'
  + 'node src/api-credit-cli.js --profile-fd 3 --key-fd 4 --input-fd 5 --output-fd 6 --bootstrap-ms 1000\n'
  + 'Supply four distinct, exclusive POSIX FIFO ends owned by the operator.\n'
  + 'Profile: canonical public bootstrap JSON terminated by EOF.\n'
  + 'Key: exactly 32 existing private-key bytes terminated by EOF.\n'
  + 'Input/output: bounded explicit original-funding and service commands.\n'
  + 'History only: node src/api-credit-cli.js --inspect-fd 3 --output-fd 6 --bootstrap-ms 1000\n'
  + 'Inspect input: one canonical recovery envelope and its existing service proof, then EOF.\n'
  + 'Signer history: node src/api-credit-cli.js --signer-inspect-fd 3 --output-fd 6 --bootstrap-ms 1000\n'
  + 'Signer output contains private existing signed-payment DATA; history grants no dispatch.\n'
  + 'No stdin, environment secret, mnemonic, generated key or default profile.\n';

/** Single documented candidate entry. Parsing/help never import the native
 * launcher or load an SDK/key. Operational bytes use only explicit pipes. */
export async function runApiCreditCli(argv) {
  const args = captureApiCreditCliArguments(argv);
  if (args.mode === 'HELP') { process.stdout.write(HELP); return 0; }
  let result;
  try {
    if (args.mode === 'SIGNER_INSPECT') {
      const { runNativeApiCreditSignerInspection } = await import('./zenon/native-api-credit-recovery-inspection-launcher.js');
      result = await runNativeApiCreditSignerInspection(args);
    } else if (args.mode === 'INSPECT') {
      const { runNativeApiCreditRecoveryInspection } = await import('./zenon/native-api-credit-recovery-inspection-launcher.js');
      result = await runNativeApiCreditRecoveryInspection(args);
    } else {
      const { runNativeApiCreditOperator } = await import('./zenon/native-api-credit-operator-launcher.js');
      result = await runNativeApiCreditOperator(args);
    }
  } catch {
    process.stderr.write('API_CREDIT_OPERATOR_CLOSE_UNKNOWN\n'); return 4;
  }
  // Never append status to the already-owned/closed command result pipe.
  process.stderr.write(result.exitCode === 0 ? 'API_CREDIT_OPERATOR_CLOSED\n'
    : result.exitCode === 1 ? 'API_CREDIT_OPERATOR_BOOTSTRAP_REFUSED\n' : 'API_CREDIT_OPERATOR_CLOSE_UNKNOWN\n');
  return result.exitCode;
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { process.exitCode = await runApiCreditCli(process.argv.slice(2)); }
  catch { process.stderr.write('API_CREDIT_CLI_ARGUMENTS_REFUSED\n'); process.exitCode = 1; }
}
