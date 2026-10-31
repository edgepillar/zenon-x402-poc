import { types } from 'node:util';
import { encodeBuyerApiCreditCommand } from './buyer-original-funding-command.js';
import { captureServiceCreditHttpExecuteOriginalInput } from './service-credit-http-execute-dispatch.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, PREPARED = new WeakMap();
function fail() { throw new TypeError('API_CREDIT_SERVICE_COMMAND'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const result = {};
  for (const name of names) {
    const d = D(value, name);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
    result[name] = d.value;
  }
  return result;
}
function command(input, id, maxLineBytes) {
  const value = F({ version: 1, id, operation: 'submitService', input });
  const line = encodeBuyerApiCreditCommand(value, maxLineBytes);
  const captured = F({ apiCreditServiceCommandVersion: 1, command: value, line });
  PREPARED.set(captured, { input, maxLineBytes });
  return captured;
}

/** Assemble one explicit service command from an existing request and proof.
 * The actual buyer wire grammar supplies its identities; no second caller copy
 * of grantId/requestId or body is accepted. Proof authentication, signing,
 * handoff, dispatch, retry and delivery remain outside this DATA-only helper.
 * The returned line contains private proof DATA and is not a diagnostic. */
export function captureApiCreditServiceCommand(options) {
  if (arguments.length !== 1) fail();
  try {
    const c = fields(options, ['id', 'serviceResourceUrl', 'originalRequestJson', 'authorizationHeader', 'maxLineBytes']);
    const wire = captureServiceCreditHttpExecuteOriginalInput({ resourceUrl: c.serviceResourceUrl,
      originalRequestJson: c.originalRequestJson, authorizationHeader: c.authorizationHeader });
    return command(F({ grantId: wire.grantId, requestId: wire.requestId, originalRequestJson: wire.originalRequestJson,
      originalBodyBase64: '', serviceResourceUrl: wire.resourceUrl, authorizationHeader: c.authorizationHeader }), c.id, c.maxLineBytes);
  } catch { fail(); }
}

/** Explicit original replay changes only the command-channel correlation ID.
 * The exact frozen original input and byte budget remain the same. This grants
 * no permission to send, replace a proof/payment or resolve an UNKNOWN result. */
export function captureApiCreditServiceReplayCommand(original, id) {
  if (arguments.length !== 2 || original === null || typeof original !== 'object' || types.isProxy(original)) fail();
  const state = PREPARED.get(original);
  if (!state) fail();
  try { return command(state.input, id, state.maxLineBytes); } catch { fail(); }
}
