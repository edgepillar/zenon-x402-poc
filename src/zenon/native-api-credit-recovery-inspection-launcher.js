// SOURCE ONLY. Native process/reopen/release acceptance remains OPEN.
import { hrtime } from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { createBuyerOwnedPipeStreams } from '../buyer-owned-pipe-streams.js';
import { createBuyerCommandLineChannel } from '../buyer-command-line-channel.js';
import { runApiCreditRecoveryInspectionCoordinator, runApiCreditSignerInspectionCoordinator } from '../api-credit-recovery-inspection-coordinator.js';

const F = Object.freeze, CLOCK = hrtime.bigint, FAILED = new Set();
let entered = false;
function fail() { throw new TypeError('API_CREDIT_NATIVE_RECOVERY_INSPECTION_UNKNOWN'); }
/** Same operator entry, no wallet/key pipe or funding/service dispatch input.
 * One framed canonical envelope AND EOF precede every native store import. */
export async function runNativeApiCreditRecoveryInspection(args) {
  if (arguments.length !== 1) fail(); return runInspection(args, false);
}
export async function runNativeApiCreditSignerInspection(args) {
  if (arguments.length !== 1) fail(); return runInspection(args, true);
}
async function runInspection(args, signer) {
  if (entered || FAILED.size !== 0 || args.mode !== (signer ? 'SIGNER_INSPECT' : 'INSPECT')) fail(); entered = true;
  const frame = { streams: null, channel: null, inspectionEntered: false };
  try {
    frame.streams = createBuyerOwnedPipeStreams({ inputFd: signer ? args.signerInspectionFd : args.inspectionFd, outputFd: args.outputFd });
    frame.channel = createBuyerCommandLineChannel({ ...frame.streams, limits: signer
      ? { maxCommands: 2, maxLineBytes: 16384, maxInputBytes: 16385, maxOutputBytes: 131072, closeWaitMs: 1000 }
      : { maxCommands: 2, maxLineBytes: 65536, maxInputBytes: 65537, maxOutputBytes: 65536, closeWaitMs: 1000 } });
    const ports = F({
      readProfile: F(async guard => {
        guard(); const line = await frame.channel.readCommand(); guard();
        if (typeof line !== 'string' || await frame.channel.readCommand() !== null) fail(); guard(); return line;
      }),
      inspectOriginal: F(async (profile, guard) => {
        try {
          if (signer) {
            guard(); const { inspectNativeApiCreditSignerOriginal } = await import('./native-api-credit-signer-inspection.js');
            guard(); frame.inspectionEntered = true; return await inspectNativeApiCreditSignerOriginal(profile, guard);
          }
          guard(); const { inspectServiceCreditCapturedOriginal } = await import('../service-credit-recovery-inspect-cli.js');
          guard(); frame.inspectionEntered = true; return await inspectServiceCreditCapturedOriginal(profile, guard);
        } finally { if (!frame.inspectionEntered) profile.release(); }
      }),
      writeResult: F((line, guard) => { guard(); if (typeof line !== 'string' || Buffer.byteLength(line) > (signer ? 131072 : 2048)) fail(); return frame.channel.writeResult(line); }),
      close: F(() => frame.channel.close()), inspect: F(() => frame.channel.inspect()),
      clock: F(() => Reflect.apply(CLOCK, hrtime, [])), armTimer: F((budget, callback) => setTimeout(callback, budget)),
      cancelTimer: F(token => { clearTimeout(token); })
    });
    return await (signer ? runApiCreditSignerInspectionCoordinator : runApiCreditRecoveryInspectionCoordinator)({ arguments: args, ports });
  } catch { FAILED.add(frame); fail(); }
  // A constructor that returned no channel retains its own quarantine. Never
  // compete with an entered constructor by raw-closing/reusing its descriptors.
}
