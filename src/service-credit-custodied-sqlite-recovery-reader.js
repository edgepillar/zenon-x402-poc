import {
  openServiceCreditCustodiedSqliteSequentialRunnerV3,
  openServiceCreditCustodiedSqliteSequentialRunnerV4,
  openServiceCreditCustodiedSqliteSequentialRunnerV5,
} from './service-credit-custodied-sqlite-sequential-runner.js';
import {
  exact, failure,
} from './service-credit-custodied-sequential-runner-core.js';

const FREEZE = Object.freeze;
const OPEN = openServiceCreditCustodiedSqliteSequentialRunnerV3;
const OPEN_V4 = openServiceCreditCustodiedSqliteSequentialRunnerV4;
const OPEN_V5 = openServiceCreditCustodiedSqliteSequentialRunnerV5;
const CONFIG_FIELDS = FREEZE([
  'databasePath', 'allowedRoot', 'fundingResourceUrl', 'custodyPolicy',
  'selectedGrantId', 'deadlineMs',
]);
const NO_DISPATCH = FREEZE(function recoveryReaderDispatchForbidden() {
  throw failure('RECOVERY_READER_DISPATCH_FORBIDDEN');
});

/**
 * Opt-in no-dispatch recovery consumer of the existing owned V3 runner.
 *
 * This is API attenuation, not authentication or an OS/network sandbox.
 * Normal owned acquisition may update owner_epoch; this is NOT SQLite
 * readOnly mode. Existing schema, policy, scope and lifecycle guards apply.
 * No caller transport/factory, root object or batch method is exposed.
 *
 * Current private frozen components and pristine intrinsics are premises.
 * All returned methods are the existing functions, including close and its
 * cached native Promise. Root alone owns acquisition and store close; this
 * adapter adds no close wrapper, retry, repair, migration or authority.
 */
export async function openServiceCreditCustodiedSqliteRecoveryReaderV3(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  let input;
  try {
    input = exact(configuration, CONFIG_FIELDS);
  } catch {
    throw failure('INVALID_CONFIGURATION');
  } finally {
    configuration = null;
  }
  try {
    const root = await OPEN({ ...input, requestImpl: NO_DISPATCH });
    return FREEZE({
      readOriginal: root.readOriginal,
      readOriginalRecoveryState: root.readOriginalRecoveryState,
      readOriginalRecoveryKeys: root.readOriginalRecoveryKeys,
      createOriginalRecoveryPlan: root.createOriginalRecoveryPlan,
      createOriginalRecoveryStatePlan: root.createOriginalRecoveryStatePlan,
      createOriginalRecoveryCollection: root.createOriginalRecoveryCollection,
      createOriginalRecoveryObservationCollection: root.createOriginalRecoveryObservationCollection,
      close: root.close,
      snapshot: root.snapshot,
    });
  } finally {
    input = null;
  }
}

/**
 * Opt-in no-dispatch V4 recovery surface over the same owned V4 runner.
 * Persisted grant quarantine remains UNKNOWN even after the native DB closes.
 * Declared observations/plans/collections never clear it or authorize a send.
 * All nine methods, including the cached close Promise, are the actual root's
 * captured operations. No caller transport, submit, batch or root is exposed.
 * Opening may advance owner_epoch; this is not SQLite readOnly or restart proof.
 * The existing V3 entry and default/application/CLI paths remain unchanged.
 */
export async function openServiceCreditCustodiedSqliteRecoveryReaderV4(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  let input;
  try {
    input = exact(configuration, CONFIG_FIELDS);
  } catch {
    throw failure('INVALID_CONFIGURATION');
  } finally {
    configuration = null;
  }
  try {
    const root = await OPEN_V4({ ...input, requestImpl: NO_DISPATCH });
    return FREEZE({
      readOriginal: root.readOriginal,
      readOriginalRecoveryState: root.readOriginalRecoveryState,
      readOriginalRecoveryKeys: root.readOriginalRecoveryKeys,
      createOriginalRecoveryPlan: root.createOriginalRecoveryPlan,
      createOriginalRecoveryStatePlan: root.createOriginalRecoveryStatePlan,
      createOriginalRecoveryCollection: root.createOriginalRecoveryCollection,
      createOriginalRecoveryObservationCollection: root.createOriginalRecoveryObservationCollection,
      close: root.close,
      snapshot: root.snapshot,
    });
  } finally {
    input = null;
  }
}

/**
 * Explicit no-dispatch reader over the existing owned V5 runner. The same
 * recovery-state read now includes its validated local response observation;
 * neither that DATA nor a declared successful plan establishes delivery or
 * grants action authority. All nine functions are the actual root operations.
 * No caller transport, batch, submit, root or store capability is exposed.
 * Existing V5 acquisition may advance owner_epoch and persist quarantine for
 * an older unobserved intent. This is not SQLite readOnly, authentication or
 * an OS/network sandbox. Close keeps its original cached Promise and UNKNOWN
 * boundary. No V4 adoption, migration, replay, repair or authority reset.
 * Normal reopen is not process restart or crash/power-loss qualification.
 */
export async function openServiceCreditCustodiedSqliteRecoveryReaderV5(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  let input;
  try {
    input = exact(configuration, CONFIG_FIELDS);
  } catch {
    throw failure('INVALID_CONFIGURATION');
  } finally {
    configuration = null;
  }
  try {
    const root = await OPEN_V5({ ...input, requestImpl: NO_DISPATCH });
    return FREEZE({
      readOriginal: root.readOriginal,
      readOriginalRecoveryState: root.readOriginalRecoveryState,
      readOriginalRecoveryKeys: root.readOriginalRecoveryKeys,
      createOriginalRecoveryPlan: root.createOriginalRecoveryPlan,
      createOriginalRecoveryStatePlan: root.createOriginalRecoveryStatePlan,
      createOriginalRecoveryCollection: root.createOriginalRecoveryCollection,
      createOriginalRecoveryObservationCollection: root.createOriginalRecoveryObservationCollection,
      close: root.close,
      snapshot: root.snapshot,
    });
  } finally {
    input = null;
  }
}

