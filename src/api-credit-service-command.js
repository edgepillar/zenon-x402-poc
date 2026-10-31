import { types } from 'node:util';
import { Buffer } from 'node:buffer';
import { encodeBuyerApiCreditCommand, encodeBuyerApiCreditCommandResult } from './buyer-original-funding-command.js';
import { captureApiCreditRecordedServiceResult } from './api-credit-recorded-service-result.js';
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

/** Decode one complete reply from the already selected private result pipe.
 * Only a genuine captured service command selects the original identity and
 * byte budget. Grammar/correlation supply no authentication or new authority. */
export function decodeApiCreditServiceCommandResult(original, line) {
  if (arguments.length !== 2 || original === null || typeof original !== 'object' || types.isProxy(original)) fail();
  const state = PREPARED.get(original);
  if (!state) fail();
  try {
    if (typeof line !== 'string' || Buffer.byteLength(line) > state.maxLineBytes + 1
        || !line.endsWith('\n') || Buffer.from(line, 'utf8').toString('utf8') !== line) fail();
    const reply = JSON.parse(line.slice(0, -1));
    let nodes = 0;
    function freeze(value, depth = 0) {
      if (++nodes > 4096 || depth > 16) fail();
      if (value === null || typeof value !== 'object') return;
      for (const child of Object.values(value)) freeze(child, depth + 1);
      F(value);
    }
    freeze(reply);
    const captured = fields(reply, ['version', 'id', 'operation', 'outcome', 'result']);
    const result = captureApiCreditRecordedServiceResult(captured.result);
    // The existing encoder checks the original grant/request, projects the
    // closed NONE-authority result and reproduces its canonical wire bytes.
    if (encodeBuyerApiCreditCommandResult(original.command, result, state.maxLineBytes) !== line) fail();
    return result;
  } catch { fail(); }
}
