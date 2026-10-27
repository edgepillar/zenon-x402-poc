// Actual retained-original checkpoint, custody DATA and recovery owner code.
// Native/store/official-client callbacks below are explicitly declared. No
// SDK, SQL, socket, key, cryptographic signature or nonce search is executed.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { assembleZenonDynamicPlasmaOriginalFundingDataV2 as ASSEMBLE } from '../src/zenon/dynamic-plasma-original-funding-data.js';
import { createFundingPostOriginalPaymentCheckpointClient as CORE } from '../src/x402-original-payment-checkpoint-client.js';
import { restoreOriginalPaymentCheckpoint as RESTORE } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { captureOriginalServiceRequestCustody as CUSTODY, captureOriginalServiceDispatchIntent as INTENT } from '../src/service-credit-original-request-custody-contract.js';
import { captureBuyerOriginalRecoverySelection as SELECT, createBuyerOriginalRecoveryClient as CLIENT } from '../src/buyer-original-recovery-client.js';

export const F = Object.freeze, copy = value => structuredClone(value);
export function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); F(value); }
  return value;
}
export function recoveryFixture(mode = {}) {
  const base = retainedOriginalInputFixture(), packet = ASSEMBLE(base.input, base.candidate, base.resourceUrl);
  const key = F({ grantId: 'grant.recovery.1', requestId: 'request.recovery.1' });
  const originalPayment = { resourceUrl: base.resourceUrl, serializedCheckpoint: packet.serializedCheckpoint,
    expectedPins: copy(packet.expectedPins) };
  const selection = SELECT({ originalPayment, selectedGrantId: key.grantId,
    paymentRequiredHeader: base.input.challenge.paymentRequiredHeader });
  const required = JSON.parse(Buffer.from(selection.paymentRequiredHeader, 'base64').toString());
  const checkpoint = RESTORE(packet.serializedCheckpoint, packet.expectedPins);
  const payload = JSON.parse(Buffer.from(checkpoint.originalBytes.paymentPayload, 'base64').toString());
  const origin = new URL(base.resourceUrl).origin, serviceResourceUrl = origin + '/service-credit/v1/execute';
  const request = { modelVersion: 1, ...key, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    selectedContentType: 'application/json', maxCostUnits: 1 };
  const original = CUSTODY({ originalRequestJson: JSON.stringify(request), originalBodyBase64: '', serviceResourceUrl },
    { fundingResourceUrl: base.resourceUrl, paymentHash: packet.expectedPins.binding.paymentHash, network: payload.accepted.network });
  const f = { base, packet, selection, key, original, checkpoint, restores: 0, checkpointReads: 0,
    stateReads: 0, services: 0, closes: 0, phase: 'OPEN', unknown: false, active: false,
    comparisonHeader: null, restoreCoreReads: 0, serviceInput: null };
  f.state = freeze({ original, funding: { revision: 1, status: 'BOUND', ambiguityLatched: false,
    fundingResourceUrl: base.resourceUrl, paymentHash: original.paymentHash, network: original.network },
    uncertainty: { custody: false, submission: false, undrained: false, declaredFundingAmbiguitySeen: false },
    dispatchIntent: null, responseObservation: null, responseStatus: 'NOT_OBSERVED' });
  f.change = changes => { f.state = freeze({ ...f.state, ...changes }); };
  f.intent = () => INTENT(original, { fundingRevision: 1,
    challengeDigest: 'sha256:' + 'ab'.repeat(32), paymentDigest: 'sha256:' + 'cd'.repeat(32),
    custodyPolicy: { policyVersion: 1, maxRequests: 8, serviceResourceUrl } });
  const native = F({
    restoreOriginalPayment: F(async function restore(input) {
      f.restores++;
      const core = CORE({ ...selection.originalPayment, readOriginalPaymentCheckpoint: F(pins => {
        f.restoreCoreReads++; return RESTORE(packet.serializedCheckpoint, pins);
      }) });
      const challenge = core.captureChallenge(input);
      const retained = core.localClient.createPaymentPayload(required, required.accepts[0]);
      // Different property order, same complete DATA: never return this header.
      f.comparisonHeader = Buffer.from(JSON.stringify({ payload: retained.payload, accepted: retained.accepted,
        resource: retained.resource, x402Version: retained.x402Version })).toString('base64');
      const header = core.selectOriginalPaymentHeader(f.comparisonHeader, challenge.expectedPins);
      assert.equal(header, checkpoint.originalBytes.paymentPayload); core.close();
      if (f.onRestore) await f.onRestore();
      return F({ resourceUrl: base.resourceUrl, paymentSignatureHeader: header,
        requestProfile: packet.requestProfile, source: 'EXACT_RETAINED_V6_ORIGINAL',
        signatureCreated: false, transport: 'NOT_INVOKED', authority: 'NONE',
        fundingAcknowledgement: 'NOT_ESTABLISHED', grantActivation: 'NOT_ESTABLISHED', serviceDelivery: 'NOT_ESTABLISHED' });
    }),
    readOriginalPaymentCheckpoint: F(function checkpointRead(pins) {
      f.checkpointReads++; assert.deepEqual(pins, packet.expectedPins);
      return f.onCheckpoint ? f.onCheckpoint(f.checkpointReads) : checkpoint;
    }),
    readOriginalRecoveryState: F(function stateRead(selected) {
      f.stateReads++; assert.deepEqual(selected, key);
      return f.onState ? f.onState(f.stateReads) : f.state;
    }),
    submitOriginal: F(function submit(input) {
      f.services++; f.serviceInput = input;
      f.change({ dispatchIntent: f.intent() });
      return f.onService ? f.onService(input) : Promise.resolve(Object.hasOwn(mode, 'serviceResult') ? mode.serviceResult : undefined);
    }),
    snapshot: F(function snapshot() {
      if (f.onSnapshot) f.onSnapshot();
      return F({ profile: 'NATIVE_OFFICIAL_X402_FUNDING_POST_ORIGINAL_V6_CLIENT', lifecycle: f.phase,
        operationActive: f.active, native: F({ phase: f.phase, unknown: f.unknown }),
        fundingPostTransport: 'NOT_PROVIDED', authority: 'NONE', serviceDelivery: 'NOT_ESTABLISHED' });
    }),
    close: F(function close() {
      f.closes++; if (f.onClose) return f.onClose();
      f.phase = 'CLOSED'; return Promise.resolve(undefined);
    }),
  });
  f.native = native; f.client = CLIENT({ client: native, selection });
  f.restoreInput = () => ({ paymentRequiredHeader: selection.paymentRequiredHeader, expectedPins: copy(packet.expectedPins) });
  f.readInput = () => ({ key: copy(key), expectedPins: copy(packet.expectedPins) });
  f.service = () => ({ ...key, originalRequestJson: original.originalRequestJson, originalBodyBase64: '',
    serviceResourceUrl, authorizationHeader: 'ServiceCredit declared-proof-no-cryptography', expectedPins: copy(packet.expectedPins) });
  return f;
}
