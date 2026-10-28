// SOURCE ONLY. Select one genuine HTTPS request and read the actual borrowed
// intake row. No response replacement, prototype patch, alternate store, timer,
// polling loop, observer reopen, new server or implicit native authority.
import { Socket } from 'node:net';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/canonical.js';
import { ZenonFundingIntakeSqliteStore } from '../src/service-credit-zenon-funding-intake-sqlite-store.js';
import { createFundingBoundResponseLossGate } from './funding-bound-response-loss-gate.mjs';

const F = Object.freeze, A = Reflect.apply, DESTROY = Socket.prototype.destroy;
const STORE = ZenonFundingIntakeSqliteStore.prototype, READ = STORE.loadBySelectionKey;
const KEYS = F(['connection', 'secureConnection', 'request', 'checkContinue', 'checkExpectation',
  'upgrade', 'connect', 'clientError', 'tlsClientError', 'dropRequest', 'drop', 'timeout', 'listening', 'close', 'error']);
function require(value) { if (!value) throw new TypeError('NATIVE_FUNDING_BOUND_RESPONSE_LOSS_FIXTURE_REFUSED'); }
function singleHeader(request, name, expected) {
  const raw = request.rawHeaders;
  if (!Array.isArray(raw) || raw.length > 32 || raw.length % 2 !== 0) return false;
  let count = 0;
  for (let i = 0; i < raw.length; i += 2) {
    if (typeof raw[i] !== 'string' || typeof raw[i + 1] !== 'string') return false;
    if (raw[i].toLowerCase() === name) { if (raw[i + 1] !== expected) return false; count++; }
  }
  return count === 1;
}

export function createNativeFundingBoundResponseLossSelection(original, store) {
  require(arguments.length === 2 && original !== null && Object.isFrozen(original)
    && Reflect.ownKeys(original).length === 4);
  const { selectionKey, resourceUrl, paymentRequiredHeader, paymentSignatureHeader } = original;
  require(typeof paymentSignatureHeader === 'string' && paymentSignatureHeader.length <= 5464);
  const url = new URL(resourceUrl);
  require(url.protocol === 'https:' && url.hostname === '127.0.0.1' && url.port !== ''
    && url.pathname === '/funding' && url.search === '' && url.hash === '' && url.href === resourceUrl);
  require(store !== null && Object.getPrototypeOf(store) === STORE && Reflect.ownKeys(store).length === 0);
  const payment = JSON.parse(Buffer.from(paymentSignatureHeader, 'base64').toString('utf8'));
  require(payment.resource.url === resourceUrl && payment.resource.tags.length === 3);
  const payloadDigest = 'sha256:' + createHash('sha256')
    .update('zenon-x402:funding-intake-payment-payload-v1').update('\0')
    .update(canonicalJson({ x402Version: payment.x402Version, resource: payment.resource,
      accepted: payment.accepted, transaction: payment.payload.transaction,
      intentDigest: payment.payload.intentDigest }), 'utf8').digest('hex');
  const expected = F({ selectionKey, resourceUrl,
    fundingCommitment: 'sha256:' + payment.resource.tags[1] + payment.resource.tags[2],
    transactionHash: payment.payload.transaction.hash, payloadDigest,
    intentDigest: payment.payload.intentDigest, paymentRequiredHeader });
  const gate = createFundingBoundResponseLossGate(F({ expected,
    readSnapshot: F(function readSnapshot() {
      const row = A(READ, store, [selectionKey]);
      if (row === null || row.binding === null) return null;
      return F({ status: row.status, selectionKey: row.issue.selectionKey,
        resourceUrl: row.issue.resourceUrl, fundingCommitment: row.issue.challenge.fundingCommitment,
        transactionHash: row.binding.transactionHash, payloadDigest: row.binding.payloadDigest,
        intentDigest: row.binding.publication.paymentPayload.payload.intentDigest,
        paymentRequiredHeader: row.issue.frame.paymentRequiredHeader });
    }),
  }));
  return F({ gate, host: url.host, paymentSignatureHeader });
}

export function wrapNativeFundingBoundResponseLossFactory(factory, readSelection) {
  require(arguments.length === 2 && typeof factory === 'function' && Object.isFrozen(factory)
    && typeof readSelection === 'function' && Object.isFrozen(readSelection));
  return F(function actualRequestFactory(options, callbacks) {
    require(arguments.length === 2 && Object.isFrozen(callbacks) && Reflect.ownKeys(callbacks).length === KEYS.length);
    const captured = {};
    for (const key of KEYS) { require(typeof callbacks[key] === 'function'); captured[key] = callbacks[key]; }
    const forward = captured.request;
    captured.request = F(function actualFundingRequest(request, response) {
      const selected = readSelection();
      if (selected !== null && request.method === 'POST' && request.url === '/funding'
          && singleHeader(request, 'host', selected.host)
          && singleHeader(request, 'payment-signature', selected.paymentSignatureHeader)) {
        const socket = request.socket;
        require(Socket.prototype.isPrototypeOf(socket));
        const stop = F(function stopKnownFundingResponseSocket() { A(DESTROY, socket, []); return undefined; });
        if (selected.gate.arm(stop)) {
          require(selected.gate.beginForward());
          try { return A(forward, undefined, [request, response]); }
          catch (error) { selected.gate.refuse(); throw error; }
        }
      }
      return A(forward, undefined, [request, response]);
    });
    return A(factory, undefined, [options, F(captured)]);
  });
}
