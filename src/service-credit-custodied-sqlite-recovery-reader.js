import {
  openServiceCreditCustodiedSqliteSequentialRunnerV3,
} from './service-credit-custodied-sqlite-sequential-runner.js';
import {
  exact, failure,
} from './service-credit-custodied-sequential-runner-core.js';

const FREEZE = Object.freeze;
const OPEN = openServiceCreditCustodiedSqliteSequentialRunnerV3;
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
