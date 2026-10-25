// Fixed, synthetic original-request DATA. No wallet, signing, SDK or native I/O.
import { Buffer } from 'node:buffer';
import { encodeB64Json } from '../src/x402-wire.js';
import { captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint }
  from '../src/service-credit-pilot-original-payment-checkpoint.js';

function address(byte) {
  // Bech32 encoding of fixed public address-core DATA, not key generation.
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const value of [0, ...Array(19).fill(byte)]) {
    accumulator = (accumulator << 8) | value; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
  }
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries())
      if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({ length: 6 }, (_, index) => alphabet[(checksum >>> (5 * (5 - index))) & 31]).join('');
}
const PAYER = address(17), PAYEE = address(34), copy = value => JSON.parse(JSON.stringify(value));

export function fundingPostPreparationInputFixture({
  resourceUrl = 'https://funding-input.invalid/funding', bodyBase64 = '', contextVersion = 7,
} = {}) {
  const accepted = { scheme: 'exact', network: 'zenon:testnet', asset: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    amount: '5', payTo: PAYEE, maxTimeoutSeconds: 60, extra: { paymentFlow: 'upfront', poc: true,
      settlement: 'account-block', zenonChain: { version: 1, chainIdentifier: '73404', genesisMomentumHash: '11'.repeat(32) } } };
  const required = { x402Version: 2, resource: { url: resourceUrl,
    description: 'Synthetic funding admission DATA', mimeType: 'application/json' }, accepts: [copy(accepted)] };
  const header = encodeB64Json(required);
  const input = { plannerContext: { plannerContextVersion: contextVersion, readInput: {
    observedUserSendReadVersion: 3, phase: 'UNSIGNED', paymentRequired: copy(required), accepted: copy(accepted),
    payerAddress: PAYER, compiledSporkIds: { dynamicPlasmaId: '02'.repeat(32), libp2pId: '01'.repeat(32) },
    policy: { policyVersion: 1, maxPriceChangePercent: 10, maxMomentumAdvances: 2, maxFusedPlasma: 30000, maxDifficulty: 0 },
    runtimeContextDigest: 'sha256:' + 'b'.repeat(64),
  } }, challenge: { status: 'PAYMENT_REQUIRED', resourceUrl, paymentRequiredHeader: header,
    paymentRequired: copy(required) }, originalRequest: { requestId: 'post-input.original.1',
    contextId: 'post-input.context.1', requestBodyBase64: bodyBase64,
    contextBase64: Buffer.from('declared independent request context').toString('base64') } };
  function checkpoint() {
    // The POST DATA core validates original bytes, not a cryptographic payment.
    // Deliberately NOT a signed/prepared transaction or signature-shaped output.
    const payload = { x402Version: 2, resource: copy(required.resource), accepted: copy(accepted), payload: {
      transaction: { hash: 'a'.repeat(64), signature: 'DECLARED_NOT_A_SIGNATURE', nonce: '0000000000000000' },
      intentDigest: 'b'.repeat(64) } };
    const captured = captureOriginalPaymentCheckpoint({ binding: { requestId: input.originalRequest.requestId,
      paymentHash: 'a'.repeat(64), origin: new URL(resourceUrl).origin, contextId: input.originalRequest.contextId },
    originalBytes: { requestBody: bodyBase64, paymentPayload: encodeB64Json(payload), paymentRequirements: header,
      context: input.originalRequest.contextBase64 } });
    return { resourceUrl, serializedCheckpoint: encodeOriginalPaymentCheckpoint(captured.checkpoint),
      expectedPins: copy(captured.pins) };
  }
  return { resourceUrl, input, checkpoint };
}
