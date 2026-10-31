// SOURCE ONLY. Native process/reopen/release acceptance remains OPEN.
import process, { hrtime } from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { createBuyerOwnedPipeStreams } from '../buyer-owned-pipe-streams.js';
import { createBuyerCommandLineChannel } from '../buyer-command-line-channel.js';
import { createApiCreditRecoveryInspectionCoordinator, createApiCreditSignerInspectionCoordinator, createApiCreditRecordedResultInspectionCoordinator, createApiCreditFundingInspectionCoordinator, createApiCreditOriginalGrantQueryCoordinator } from '../api-credit-recovery-inspection-coordinator.js';

const F = Object.freeze, CLOCK = hrtime.bigint, SIGNAL_ON = process.on, SIGNAL_OFF = process.off, FAILED = new Set();
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
export async function runNativeApiCreditRecordedResultInspection(args) {
  if (arguments.length !== 1) fail(); return runInspection(args, false, true);
}
export async function runNativeApiCreditFundingInspection(args) {
  if (arguments.length !== 1) fail(); return runInspection(args, false, false, true);
}
export async function runNativeApiCreditOriginalGrantQuery(args) {
  if (arguments.length !== 1) fail(); return runInspection(args, false, false, false, true);
}
async function runInspection(args, signer, recorded = false, funding = false, grantQuery = false) {
  if (entered || FAILED.size !== 0 || args.mode !== (grantQuery ? 'ORIGINAL_GRANT_QUERY' : funding ? 'FUNDING_INSPECT' : signer ? 'SIGNER_INSPECT' : recorded ? 'RECORDED_RESULT' : 'INSPECT')) fail(); entered = true;
  const frame = { streams: null, channel: null, inspectionEntered: false,
    coordinator: null, stopRequested: false, signalUnknown: false, signals: [] };
  const onSignal = F(() => {
    frame.stopRequested = true;
    try { if (frame.coordinator !== null) frame.coordinator.requestStop(); }
    catch { frame.signalUnknown = true; FAILED.add(frame); }
  });
  let result;
  try {
    // Subscribe before descriptor adoption; retain each matching removal.
    for (const name of ['SIGINT', 'SIGTERM']) {
      frame.signals.push(name); Reflect.apply(SIGNAL_ON, process, [name, onSignal]);
    }
    if (frame.stopRequested) fail();
    frame.streams = createBuyerOwnedPipeStreams({ inputFd: grantQuery ? args.originalGrantQueryFd : funding ? args.fundingInspectionFd : signer ? args.signerInspectionFd : recorded ? args.recordedResultFd : args.inspectionFd, outputFd: args.outputFd });
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
          if (grantQuery) {
            guard(); const { inspectNativeApiCreditOriginalGrant } = await import('./native-api-credit-original-grant-query.js');
            guard(); frame.inspectionEntered = true; return await inspectNativeApiCreditOriginalGrant(profile, guard);
          }
          if (funding) {
            guard(); const { inspectNativeApiCreditFundingOriginal } = await import('./native-api-credit-funding-inspection.js');
            guard(); frame.inspectionEntered = true; return await inspectNativeApiCreditFundingOriginal(profile, guard);
          }
          if (signer) {
            guard(); const { inspectNativeApiCreditSignerOriginal } = await import('./native-api-credit-signer-inspection.js');
            guard(); frame.inspectionEntered = true; return await inspectNativeApiCreditSignerOriginal(profile, guard);
          }
          if (recorded) {
            guard(); const { inspectServiceCreditCapturedRecordedResult } = await import('../service-credit-recovery-inspect-cli.js');
            guard(); frame.inspectionEntered = true; return await inspectServiceCreditCapturedRecordedResult(profile, guard);
          }
          guard(); const { inspectServiceCreditCapturedOriginal } = await import('../service-credit-recovery-inspect-cli.js');
          guard(); frame.inspectionEntered = true; return await inspectServiceCreditCapturedOriginal(profile, guard);
        } finally { if (!frame.inspectionEntered) profile.release(); }
      }),
      writeResult: F((line, guard) => { guard(); if (typeof line !== 'string' || Buffer.byteLength(line) > (grantQuery ? 8192 : signer ? 131072 : funding ? 65536 : recorded ? 4096 : 2048)) fail(); return frame.channel.writeResult(line); }),
      close: F(() => frame.channel.close()), inspect: F(() => frame.channel.inspect()),
      clock: F(() => Reflect.apply(CLOCK, hrtime, [])), armTimer: F((budget, callback) => setTimeout(callback, budget)),
      cancelTimer: F(token => { clearTimeout(token); })
    });
    frame.coordinator = (grantQuery ? createApiCreditOriginalGrantQueryCoordinator : funding ? createApiCreditFundingInspectionCoordinator : signer ? createApiCreditSignerInspectionCoordinator : recorded ? createApiCreditRecordedResultInspectionCoordinator : createApiCreditRecoveryInspectionCoordinator)({ arguments: args, ports });
    if (frame.stopRequested) frame.coordinator.requestStop();
    result = await frame.coordinator.run();
  } catch { FAILED.add(frame); fail(); }
  finally {
    for (const name of frame.signals) {
      try { Reflect.apply(SIGNAL_OFF, process, [name, onSignal]); }
      catch { frame.signalUnknown = true; FAILED.add(frame); }
    }
  }
  if (frame.signalUnknown) { FAILED.add(frame); fail(); }
  return result;
  // A constructor that returned no channel retains its own quarantine. Never
  // compete with an entered constructor by raw-closing/reusing its descriptors.
}
