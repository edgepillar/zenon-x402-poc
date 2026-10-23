import { types as utilTypes } from 'node:util';
import { createOfficialSelectedSettlementServer } from './x402-official-selected-settlement-server.js';
import { captureOfficialUpfrontHttpsRoute } from './x402-official-https-request-binding.js';
import { createOfficialUpfrontServiceCreditHttpsRouter } from './x402-official-upfront-https-router.js';
import { createDurableServiceCreditHttpSession } from './service-credit-durable-http-session.js';
import { SERVICE_CREDIT_HTTP_PATH } from './service-credit-http.js';
import {
  createServiceCreditBoundedHttpsIngressOwnerForOfficialX402,
} from './service-credit-bounded-https-ingress-owner.js';

const CREATE_OFFICIAL = createOfficialSelectedSettlementServer;
const CREATE_SESSION = createDurableServiceCreditHttpSession;
const CREATE_ROUTER = createOfficialUpfrontServiceCreditHttpsRouter;
const CREATE_INGRESS = createServiceCreditBoundedHttpsIngressOwnerForOfficialX402;
const FREEZE = Object.freeze, DESC = Object.getOwnPropertyDescriptor;
const OWN = Object.hasOwn, KEYS = Reflect.ownKeys, PROTO = Object.getPrototypeOf;
const IS_PROXY = utilTypes.isProxy;
const LIMITS = FREEZE(['maxHeaderBytes', 'maxHeaderCount', 'maxConcurrentSockets',
  'maxConnectionStarts', 'maxConcurrentRequests', 'maxRequestStarts',
  'tlsHandshakeDeadlineMs', 'headerDeadlineMs', 'requestResponseDeadlineMs',
  'idleSocketDeadlineMs', 'startDeadlineMs', 'closeGraceMs', 'metricsCounterLimit']);

function fail(kind) {
  const code = 'OFFICIAL_X402_SERVICE_CREDIT_HTTPS_APPLICATION_' + kind;
  const error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw FREEZE(error);
}
function record(value, keys) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== keys.length)
    fail('CONFIGURATION');
  const out = {};
  for (const key of keys) {
    const d = DESC(value, key);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('CONFIGURATION');
    Object.defineProperty(out, key, { value: d.value, enumerable: true });
  }
  return FREEZE(out);
}

/**
 * Default-off application composition, not a new protocol or store version.
 *
 * Create ONE actual official x402 server and ONE durable service session with
 * an explicit admittedGrantId. Mount both on the SAME bounded HTTPS generation:
 * GET /paid is fixed to official.resource.url; POST /service-credit/v1/execute
 * is independently admitted by the existing capability/grant/debit contract.
 * The caller supplies the existing bounded native Node HTTPS factory explicitly;
 * construction never starts a listener or invents TLS material.
 *
 * The service store is borrowed, already initialized, and owned/closed by its
 * host. The payer's existing V6 owner belongs on the client side of this SAME
 * application flow; it is not substituted by a second server-side payer DB.
 * This server does not create/migrate/open a payer store, prepare/sign/fund,
 * activate a grant from a 200 receipt, or obtain funding/checkpoint pins from DB.
 * The caller retains the independent original-payment pins and explicit grant
 * activation authority. Service requests use the exact original request proof.
 *
 * Close returns the actual ingress close Promise. That owner revokes admission,
 * drains this router/session/pending continuation, and owns the listener/socket
 * close verdict. UNKNOWN/CLOSE_UNCERTAIN is never replaced by a late success.
 * Pending funding cache is MEMORY_ONLY, not durable replay after reconstruction.
 * Production native TLS, V6 integration, restart and economic acceptance require
 * their exact current-source qualification; this constructor is not that proof.
 */
export async function createOfficialServiceCreditHttpsApplication(options) {
  if (arguments.length !== 1) fail('CONFIGURATION');
  let official, service, transport;
  try {
    const c = record(options, ['official', 'service', 'transport']);
    official = record(c.official, ['requirement', 'resource', 'localFacilitator',
      'validateChallenge', 'reconcilePendingSettlement', 'maxPendingReconciliations', 'contextLimit']);
    service = record(c.service, ['store', 'execute', 'deadlineRuntime', 'selectedDurationMs', 'admittedGrantId']);
    const input = record(c.transport, ['origin', 'generation', 'limits', 'deadlineRuntime', 'httpsServerFactory']);
    // Snapshot transport DATA before the first await. The existing ingress then
    // performs its full validation; caller mutation cannot switch the profile.
    transport = FREEZE({ origin: input.origin,
      generation: record(input.generation, ['generationId', 'generationVersion']),
      limits: record(input.limits, LIMITS),
      deadlineRuntime: record(input.deadlineRuntime, ['schedule', 'cancel']),
      httpsServerFactory: input.httpsServerFactory });
    const resource = record(official.resource, ['url', 'description', 'mimeType']);
    official = FREEZE({ ...official, resource });
    const route = captureOfficialUpfrontHttpsRoute(resource.url);
    if (typeof transport.origin !== 'string'
        || route.resourceUrl !== transport.origin + '/paid'
        || SERVICE_CREDIT_HTTP_PATH !== '/service-credit/v1/execute'
        || !Number.isSafeInteger(official.contextLimit)
        || official.contextLimit < 1 || official.contextLimit > 64) fail('CONFIGURATION');
  } catch { fail('CONFIGURATION'); }
  finally { options = null; }

  let session = null, router = null, ingress = null, server = null;
  try {
    // Do not derive the grant scope from a request, settlement or mutable store
    // selection. The existing constructor checks the actual borrowed SQL store.
    session = CREATE_SESSION({ ...service });
    server = await CREATE_OFFICIAL({ ...official });
    router = CREATE_ROUTER({ resourceUrl: official.resource.url, officialServer: server,
      serviceSession: session, maxFundingPayments: official.contextLimit });
    ingress = CREATE_INGRESS({ ...transport,
      requestTargets: FREEZE(['/paid', SERVICE_CREDIT_HTTP_PATH]),
      downstream: FREEZE({ handle: router.handle, close: router.close }) });
  } catch {
    // No listener has started and no application operation was exposed. Drain
    // only the session acquired by this root; never close the borrowed store.
    try {
      if (router !== null) {
        await new Promise((resolve, reject) => router.close(FREEZE({
          success: FREEZE(() => resolve()), failure: FREEZE(() => reject(new Error('close unavailable'))),
        })));
      } else if (session !== null) { await session.close(); }
    } catch { fail('CONSTRUCTION_CLOSE_UNCERTAIN'); }
    fail('CONSTRUCTION_UNAVAILABLE');
  } finally {
    official = null; service = null; transport = null; session = null;
  }
  const INGRESS = ingress, ROUTER = router, SERVER = server;
  ingress = null; router = null; server = null;
  const snapshot = FREEZE(function snapshot() {
    if (arguments.length !== 0) fail('INPUT');
    return FREEZE({ profile: 'OFFICIAL_X402_2_23_UPFRONT_SCOPED_SERVICE_CREDIT_HTTPS',
      ingress: INGRESS.snapshotMetrics(), router: ROUTER.snapshot(), official: SERVER.getSnapshot(),
      selectedGrantScope: true, serviceStore: 'BORROWED_ALREADY_INITIALIZED',
      grantActivation: 'EXTERNAL_AUTHORITY_REQUIRED', originalPaymentCustody: 'CLIENT_V6_REQUIRED',
      serviceDelivery: 'NOT_ESTABLISHED', production: 'NOT_ESTABLISHED' });
  });
  return FREEZE({ start: INGRESS.start, close: INGRESS.close, snapshot });
}
