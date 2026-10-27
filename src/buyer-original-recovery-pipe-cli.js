import { pathToFileURL } from 'node:url';
import { writeSync } from 'node:fs';
import { runNativeOriginalRecoveryPipeHost } from './zenon/native-original-recovery-pipe-host.js';

/** Explicit standalone entry on development. Secrets, original checkpoint and
 * pins arrive on the owned command pipe, never argv/env. No default CLI change. */
export async function runBuyerOriginalRecoveryPipeCli(argv) {
  if (arguments.length !== 1 || !Array.isArray(argv) || argv.length !== 8
      || argv[2] !== '--allowed-root' || typeof argv[3] !== 'string'
      || argv[4] !== '--input-fd' || argv[6] !== '--output-fd'
      || !/^[1-9][0-9]{0,3}$/.test(argv[5]) || !/^[1-9][0-9]{0,3}$/.test(argv[7]))
    throw new TypeError('buyer_recovery_pipe_arguments_required');
  return runNativeOriginalRecoveryPipeHost({ allowedRoot: argv[3], inputFd: Number(argv[5]), outputFd: Number(argv[7]) });
}

async function main() {
  if (typeof process.argv[1] !== 'string' || pathToFileURL(process.argv[1]).href !== import.meta.url) return;
  try {
    const result = await runBuyerOriginalRecoveryPipeCli(process.argv);
    if (!['CLOSED', 'INPUT_REFUSED', 'RECONCILIATION_REQUIRED', 'OUTCOME_UNKNOWN', 'CLOSE_UNKNOWN', 'HOST_REFUSED',
      'BOOTSTRAP_REFUSED'].includes(result.status) || ![0, 1, 2, 3, 4].includes(result.exitCode)) throw Error();
    report(result.status, result.exitCode);
  } catch {
    report('REFUSED', 4);
  }
}
function report(status, exitCode) {
  process.exitCode = exitCode;
  try { writeSync(2, 'BUYER_ORIGINAL_RECOVERY_PIPE_' + status + '\n'); } catch {}
}
void main();
