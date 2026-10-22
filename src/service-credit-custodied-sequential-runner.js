import {
  createServiceCreditCustodiedHttpClient,
  createServiceCreditCustodiedHttpClientV3,
  createServiceCreditCustodiedHttpClientV4,
  createServiceCreditCustodiedHttpClientV5,
} from './service-credit-custodied-http-client.js';
import {
  snapshotOriginalServiceRequestCustodyKey,
} from './service-credit-original-request-custody-contract.js';
import {
  createServiceCreditCustodiedSequentialRunnerCore,
  exact,
  failure,
} from './service-credit-custodied-sequential-runner-core.js';

const FREEZE = Object.freeze;
const CREATE_CLIENT = createServiceCreditCustodiedHttpClient;
const CREATE_CLIENT_V3 = createServiceCreditCustodiedHttpClientV3;
const CREATE_CLIENT_V4 = createServiceCreditCustodiedHttpClientV4;
const CREATE_CLIENT_V5 = createServiceCreditCustodiedHttpClientV5;
const CREATE_CORE = createServiceCreditCustodiedSequentialRunnerCore;
const KEY = snapshotOriginalServiceRequestCustodyKey;
const CONFIG_FIELDS = FREEZE([
  'store', 'fundingResourceUrl', 'custodyPolicy', 'selectedGrantId',
  'requestImpl', 'deadlineMs',
]);

/**
 * One admitted batch, one actual borrowed-store client, at most eight entries.
 *
 * The default factory retains V2. The explicit V3 factory selects the actual
 * intent-fenced V3 client with the same sequential, replay, close and borrowed
 * store boundaries; neither factory adds ownership or dispatch authority.
 *
 * Batch admission checks shape, primitive string bounds, explicit key scope,
 * duplicate keys and the existing empty-body profile. It does not parse original
 * JSON or Authorization, verify proof, validate current authority or add a route.
 * The actual client performs semantic validation immediately before each submit.
 * A later invalid original/auth leaves earlier completed submissions retained;
 * there is no rollback, retry, resend, reconciliation, funding or reset.
 *
 * The original accepted array is remembered only by a weak identity receipt.
 * Repeating that same array returns the cached run Promise without rereading
 * mutable contents. A different array is refused, including after termination.
 * Invalid structural admission does not claim the one-shot run.
 *
 * Queue entries are owned frozen copies of six primitive strings. Started and
 * terminal queue references are released where feasible. Counts bound retained
 * field text, not heap/native allocation. No JavaScript/caller/native string
 * erasure, hard lifetime, cancellation or OS-cleanup guarantee is made.
 *
 * Every admitted run auto-closes the same actual client after completion or
 * failure. close returns that client's cached Promise directly. Manual close
 * gates admission/queued-next synchronously; already-started work is observed
 * through the actual owner/dispatch. A partial stopped run rejects even when
 * its already-started callback and close finish normally.
 *
 * The store remains borrowed and is never closed here. Callback completion is
 * not delivery, provider READY, current authority, persistence or restart proof.
 * Captured pristine intrinsics and the actual private component/native Promise
 * contracts remain premises. Transport must independently emit its own closes;
 * it must not depend on this run or close Promise to finish.
 */
export function createServiceCreditCustodiedSequentialRunner(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return createRunner(configuration, false);
}
export function createServiceCreditCustodiedSequentialRunnerV3(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return createRunner(configuration, true);
}
/**
 * Explicit V4 client/owner binding, retaining the same one-shot queue and close
 * core. A persisted quarantine refuses the child submission before transport;
 * attempted still counts child calls, not HTTP requests or delivery. Detected
 * uncertainty is persisted only by the actual V4 owner. No store close,
 * migration, resend, authority reset or default-path adoption is introduced.
 */
export function createServiceCreditCustodiedSequentialRunnerV4(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return createRunner(configuration, true, true);
}
/**
 * Explicit V5 child binding. Reuse the one-shot sequential core unchanged.
 * The actual V5 HTTP owner confirms declared-response observations before each
 * child completion and fences old unobserved intents. Counts still describe
 * child calls/completions, never authenticated delivery or payment authority.
 * Borrowed close never closes the store. V4/default factories remain unchanged.
 */
export function createServiceCreditCustodiedSequentialRunnerV5(configuration) {
  if (arguments.length !== 1) throw failure('INVALID_CONFIGURATION');
  return createRunner(configuration, true, true, true);
}
function createRunner(configuration, dispatchIntentEnabled, persistentCustody = false,
  responseObservationEnabled = false) {
  let config, selected, child;
  try {
    config = exact(configuration, CONFIG_FIELDS);
    selected = KEY({ grantId: config.selectedGrantId, requestId: 'scope' });
    child = (responseObservationEnabled ? CREATE_CLIENT_V5 : persistentCustody ? CREATE_CLIENT_V4
      : dispatchIntentEnabled ? CREATE_CLIENT_V3 : CREATE_CLIENT)(config);
  } catch {
    throw failure('INVALID_CONFIGURATION');
  }
  const selectedGrantId = selected.grantId;
  const CHILD_SUBMIT = child.submitOriginal;
  const CHILD_SNAPSHOT = child.snapshot;
  const CHILD_CLOSE = child.close;
  config = null;
  selected = null;
  child = null;
  configuration = null;

  return CREATE_CORE({
    submitOriginal: CHILD_SUBMIT,
    snapshot: CHILD_SNAPSHOT,
    close: CHILD_CLOSE,
    selectedGrantId,
    storeOwnership: 'BORROWED',
  });
}
