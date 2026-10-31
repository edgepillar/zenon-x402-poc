import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureBuyerApiCreditCommandLimits, encodeBuyerApiCreditCommand, encodeBuyerApiCreditCommandResult } from './buyer-original-funding-command.js';
import { captureSdk105ApiCreditProductOperatorData, captureSdk105ApiCreditProductSelection, captureSdk105NonDpApiCreditProductOperatorData, captureSdk105NonDpApiCreditProductSelection } from './zenon/sdk105-api-credit-product-profile.js';

const F = Object.freeze, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn, PREPARED = new WeakMap();
function fail() { throw new TypeError('API_CREDIT_OPERATOR_BOOTSTRAP'); }
function fields(value, names) {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = DESC(value, name); if (!d?.enumerable || !OWN(d, 'value')) fail(); out[name] = d.value; }
  return out;
}
function freezeJson(value, depth = 0, budget = { nodes: 4096 }) {
  if (--budget.nodes < 0 || depth > 16) fail();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail(); return value; }
  if (typeof value !== 'object' || types.isProxy(value)) fail();
  if (Array.isArray(value)) { for (const item of value) freezeJson(item, depth + 1, budget); return F(value); }
  if (Object.getPrototypeOf(value) !== Object.prototype) fail();
  for (const name of Reflect.ownKeys(value)) { const d = DESC(value, name); if (typeof name !== 'string' || !d?.enumerable || !OWN(d, 'value')) fail(); freezeJson(d.value, depth + 1, budget); }
  return F(value);
}
/** Conservative arithmetic bounds for the fixed 100-call and one-replay
 * scenario. Empty checkpoint/pin/proof strings and one-character IDs minimize
 * wire lengths only. They are never returned as commands, used as credentials
 * or dispatched. Passing these floors does not guarantee runtime acceptance. */
export function captureApiCreditOperatorCommandByteFloor(paymentRequiredHeader,serviceResourceUrl) {
  if (arguments.length!==2 || typeof paymentRequiredHeader!=='string' || typeof serviceResourceUrl!=='string') fail();
  const command=(operation,input)=>F({version:1,id:'a',operation,input});
  const phases=[
    [command('prepare',{}),F({phase:'AWAITING_INDEPENDENT_PINS',packet:F({serializedCheckpoint:'',expectedPins:F({}),
      pair:F({challenge:F({paymentRequiredHeader})})})})],
    [command('commit',{expectedPins:{},originalGrantQueryProfile:''}),F({phase:'LOCAL_STORE_READBACK_MATCHED'})],
    [command('submitFunding',{expectedPins:{}}),F({phase:'FUNDING_INTAKE_BOUND',fundingIntakeStatus:'BOUND'})],
    [command('handoff',{originalPayment:{},selectedGrantId:'a',paymentRequiredHeader}),F({phase:'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED'})],
  ];
  const service=command('submitService',{grantId:'a',requestId:'a',originalRequestJson:'',originalBodyBase64:'',serviceResourceUrl,authorizationHeader:''});
  const result=replayed=>F({apiCreditServiceResultVersion:1,grantId:'a',requestId:'a',responseJson:'{"ok":true,"resultCode":"a"}',
    resultCode:'a',replayed,source:'LOCAL_RECORDED_RESPONSE',newDispatchRequested:!replayed,authority:'NONE',serviceDelivery:'NOT_ESTABLISHED'});
  const bytes=text=>Buffer.byteLength(text,'utf8');
  const inputs=phases.map(([c])=>bytes(encodeBuyerApiCreditCommand(c)));
  const outputs=phases.map(([c,r])=>bytes(encodeBuyerApiCreditCommandResult(c,r)));
  const serviceInput=bytes(encodeBuyerApiCreditCommand(service));
  const firstOutput=bytes(encodeBuyerApiCreditCommandResult(service,result(false)));
  const replayOutput=bytes(encodeBuyerApiCreditCommandResult(service,result(true)));
  const closeInput=bytes(encodeBuyerApiCreditCommand(command('close',{})));
  // The current session consumes close without emitting a close reply. Channel
  // totals include LF; maxLineBytes excludes the single framing LF.
  return F({version:1,minimumCommands:106,
    minimumLineBytes:Math.max(...inputs,...outputs,serviceInput,firstOutput,replayOutput,closeInput)-1,
    minimumInputBytes:inputs.reduce((a,b)=>a+b,0)+101*serviceInput+closeInput,
    minimumOutputBytes:outputs.reduce((a,b)=>a+b,0)+100*firstOutput+replayOutput,
    distinctServiceRequests:100,exactReplays:1,lowerBoundOnly:true});
}
/** Canonical non-secret operator DATA, completely admitted before reading the
 * separate credential channel. No key/clock placeholder or SDK is constructed. */
export function decodeApiCreditOperatorBootstrap(text) {
  if (arguments.length !== 1) fail();
  return decodeBootstrap(text, false);
}
/** Fixed source selection, not a JSON work/lane switch. */
export function decodeNonDpApiCreditOperatorBootstrap(text) {
  if (arguments.length !== 1) fail();
  return decodeBootstrap(text, true);
}
function decodeBootstrap(text, nonDp) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 262144 || Buffer.from(text).toString('utf8') !== text) fail();
  let raw; try { raw = freezeJson(JSON.parse(text)); } catch { fail(); }
  if (canonicalJson(raw) !== text) fail();
  const c = fields(raw, ['operatorBootstrapVersion', 'productProfileVersion', 'paymentRequiredHeader', 'purchaseExpectationJson', 'publicCaPem', 'configuration', 'spendingFile', 'spending', 'limits']);
  if (c.operatorBootstrapVersion !== 2 || c.productProfileVersion !== 2 || typeof c.publicCaPem !== 'string'
      || Buffer.byteLength(c.publicCaPem) > 65536 || !c.publicCaPem.startsWith('-----BEGIN CERTIFICATE-----\n')
      || !c.publicCaPem.endsWith('-----END CERTIFICATE-----\n') || /[^\x09\x0a\x0d\x20-\x7e]/.test(c.publicCaPem)) fail();
  const config = fields(c.configuration, ['storeOptions', 'fundingOptions', 'serviceOptions']);
  const funding = fields(config.fundingOptions, nonDp
    ? ['readSessionOptions', 'expectedPublicKey', 'expectedAddress', 'deadlineMs', 'fundingTransportOptions']
    : ['readSessionOptions', 'materialOptions', 'materialWaitMs', 'expectedAddress', 'deadlineMs', 'fundingTransportOptions']);
  const fundingTransport = fields(funding.fundingTransportOptions, ['resourceUrl', 'maxRequestStarts', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
  const service = fields(config.serviceOptions, ['assetInfo', 'contextLimit', 'transportOptions', 'deadlineMs']);
  const serviceTransport = fields(service.transportOptions, ['origin', 'maxRequestStarts', 'maxConcurrentRequests', 'requestDeadlineMs', 'handshakeDeadlineMs', 'closeGraceMs']);
  const ca = Buffer.from(c.publicCaPem, 'ascii');
  let admitted;
  try {
    admitted = (nonDp ? captureSdk105NonDpApiCreditProductOperatorData : captureSdk105ApiCreditProductOperatorData)({ productProfileVersion: 2, paymentRequiredHeader: c.paymentRequiredHeader, purchaseExpectationJson: c.purchaseExpectationJson,
      configuration: { storeOptions: config.storeOptions, fundingOptions: { ...funding, fundingTransportOptions: { ...fundingTransport, ca } },
        serviceOptions: { ...service, transportOptions: { ...serviceTransport, ca } } }, spendingFile: c.spendingFile, spending: c.spending });
    const limits = captureBuyerApiCreditCommandLimits(c.limits);
    const floor = captureApiCreditOperatorCommandByteFloor(c.paymentRequiredHeader, admitted.profile.serviceResourceUrl);
    if (limits.maxCommands < floor.minimumCommands || limits.maxLineBytes < floor.minimumLineBytes
        || limits.maxInputBytes < floor.minimumInputBytes || limits.maxOutputBytes < floor.minimumOutputBytes) fail();
    const state = { admitted, header: c.paymentRequiredHeader, purchaseExpectationJson: c.purchaseExpectationJson, consumed: false, released: false, nonDp };
    const release = F(function release() { if (arguments.length !== 0) fail(); if (!state.released) { state.released = true; ca.fill(0); } });
    const prepared = F({ operatorBootstrapVersion: 2, expectedIdentity: admitted.walletIdentity, product: admitted.profile, limits, release });
    PREPARED.set(prepared, state); return prepared;
  } catch { ca.fill(0); fail(); }
}
/** Attach explicit operational key/day capabilities to the previously admitted
 * product DATA. This calls no key method; the native wallet still verifies its
 * identity. The actual selector takes independent CA copies before release. */
export function bindApiCreditOperatorBootstrap(prepared, keyPair, readDay) {
  if (arguments.length !== 3 || prepared === null || typeof prepared !== 'object' || types.isProxy(prepared)) fail();
  const state = PREPARED.get(prepared); if (!state || state.consumed || state.released) fail(); state.consumed = true;
  const c = state.admitted, service = c.configuration.serviceOptions;
  try {
    return (state.nonDp ? captureSdk105NonDpApiCreditProductSelection : captureSdk105ApiCreditProductSelection)({ productProfileVersion: 2, paymentRequiredHeader: state.header, purchaseExpectationJson: state.purchaseExpectationJson,
      configuration: { storeOptions: c.configuration.storeOptions, fundingOptions: { ...c.configuration.fundingOptions, keyPair, expectedAddress: c.walletIdentity.expectedAddress },
        serviceOptions: { assetInfo: service.official.assetInfo, contextLimit: service.official.contextLimit, transportOptions: service.transportOptions, deadlineMs: service.deadlineMs } },
      spendingFile: { storageProfile: c.spendingFile.storageProfile, allowedRoot: c.spendingFile.allowedRoot, filePolicy: c.spendingFile.filePolicy },
      spending: { paymentId: c.spending.paymentId, readDay } });
  } finally { prepared.release(); }
}
