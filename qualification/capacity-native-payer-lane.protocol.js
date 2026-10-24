import { types as utilTypes } from 'node:util';
import { Buffer } from 'node:buffer';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, P = Object.getPrototypeOf;
const K = Reflect.ownKeys, HAS = Object.hasOwn, PROXY = utilTypes.isProxy;
const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const NEXT = F({ OPEN: ['NEW','OPENING','FUNDING_READY'], PREPARE: ['FUNDING_READY','PREPARING','PREPARED'],
  COMMIT: ['PREPARED','COMMITTING','COMMITTED'], SUBMIT: ['COMMITTED','SUBMITTING','BOUND'],
  BIND: ['BOUND','BINDING_SERVICE','SERVICE_READY'], EXECUTE: ['SERVICE_READY','CALL_ACTIVE','SERVICE_READY'] });

/** DATA-only protocol for a future worker owning the genuine native P1 client.
 * No factory, native alias, key, signature, SQLite, clock, socket or retry.
 * A ticket proves only this object's local sequence, never native execution.
 */
export function createNativeCapacityPayerLaneProtocol(context, plan) {
  if (arguments.length !== 2) fail();
  const c = exact(context, ['runId','laneId','sourceRowsSha256']);
  for (const field of ['runId','sourceRowsSha256']) if (!hex(c[field], 64)) fail();
  identifier(c.laneId);
  const selected = captureNativeCapacityLanePlan(plan);
  let phase = 'NEW', active = null, sequence = 0, held = false;
  let closeTicket = null, closeOutcome = 'NOT_REQUESTED';
  let warmupReserved = 0, measurementReserved = 0, completedCalls = 0;
  function hold() { held = true; phase = 'HELD'; }
  function settlePhase() {
    if (held) phase = 'HELD';
    else if (closeTicket !== null) phase = closeOutcome === 'RETURNED' && active === null ? 'CLOSED' : 'CLOSING';
  }
  function claim(kind, selection) {
    if (arguments.length < 1 || arguments.length > 2 || typeof kind !== 'string' || !HAS(NEXT, kind)
        || held || active !== null || closeTicket !== null || phase !== NEXT[kind][0]) fail();
    let row = null;
    if (kind === 'EXECUTE') {
      if (arguments.length !== 2) fail();
      row = exact(selection, ['cohort','ordinal']);
      const expected = warmupReserved < selected.warmupCallsPerLane ? 'WARMUP' : 'MEASUREMENT';
      const reserved = expected === 'WARMUP' ? warmupReserved : measurementReserved;
      const limit = expected === 'WARMUP' ? selected.warmupCallsPerLane : selected.measurementCallsPerLane;
      if (row.cohort !== expected || row.ordinal !== reserved || reserved >= limit || Object.is(row.ordinal, -0)) fail();
      row = F(row);
    } else if (arguments.length !== 1) fail();
    // Reserve before any native caller can reenter. No ticket cloning, reset or reuse.
    const ticket = F({ sequence: ++sequence, kind, selection: row });
    if (row !== null) { if (row.cohort === 'WARMUP') warmupReserved++; else measurementReserved++; }
    active = ticket; phase = NEXT[kind][1]; return ticket;
  }
  function complete(ticket, outcome) {
    if (arguments.length !== 2 || ticket !== active || active === null || PROXY(ticket)
        || !['SUCCESS','UNKNOWN'].includes(outcome)) { hold(); fail(); }
    active = null;
    if (outcome === 'UNKNOWN') hold();
    else {
      if (ticket.kind === 'EXECUTE') completedCalls++;
      if (!held) phase = NEXT[ticket.kind][2];
    }
    settlePhase(); return snapshot();
  }
  function requestClose() {
    if (arguments.length !== 0) fail();
    if (closeTicket !== null) return closeTicket;
    closeTicket = F({ sequence: ++sequence, kind: 'CLOSE' }); closeOutcome = 'PENDING';
    settlePhase(); return closeTicket;
  }
  function completeClose(ticket, outcome) {
    if (arguments.length !== 2 || ticket !== closeTicket || closeTicket === null
        || closeOutcome !== 'PENDING' || !['RETURNED','UNKNOWN'].includes(outcome)) { hold(); fail(); }
    closeOutcome = outcome; if (outcome === 'UNKNOWN') hold(); settlePhase(); return snapshot();
  }
  function snapshot() {
    if (arguments.length !== 0) fail();
    return F({ protocolVersion: 1, phase, held, activeOperation: active !== null,
      closeRequested: closeTicket !== null, closeOutcome, sequence, warmupReserved, measurementReserved, completedCalls,
      requestedCalls: selected.totalCalls, nativeExecution: 'NOT_ESTABLISHED', authority: 'NONE' });
  }
  return F({ context: F(c), plan: selected, claim: F(claim), complete: F(complete), requestClose: F(requestClose),
    completeClose: F(completeClose), markUnknown: F(function markUnknown() {
      if (arguments.length !== 0) fail(); hold(); return snapshot();
    }), snapshot: F(snapshot) });
}

export function captureNativeCapacityLanePlan(plan) {
  if (arguments.length !== 1) fail();
  const p = exact(plan, ['warmupCallsPerLane','measurementCallsPerLane']);
  integer(p.warmupCallsPerLane, 0, 256); integer(p.measurementCallsPerLane, 1, 256);
  const totalCalls = p.warmupCallsPerLane + p.measurementCallsPerLane;
  // This is the actual native client's transport limit, not silent truncation.
  if (totalCalls > 256) fail();
  return F({ ...p, totalCalls });
}

/** Capture all immutable service originals before any service dispatch. This
 * validates the existing empty-body DATA profile, NOT capability signatures.
 * The real client/backend must still authenticate and custody the exact proof.
 */
export function captureNativeCapacityServiceOriginals(input, plan) {
  if (arguments.length !== 2) fail();
  const p = captureNativeCapacityLanePlan(plan);
  const top = exact(input, ['selectedGrantId','serviceResourceUrl','originals']);
  identifier(top.selectedGrantId);
  text(top.serviceResourceUrl, 4096);
  if (!/^https:\/\/(?:localhost|127\.0\.0\.1):[1-9][0-9]{3,4}\/service-credit\/v1\/execute$/.test(top.serviceResourceUrl)) fail();
  const port = Number(new URL(top.serviceResourceUrl).port); integer(port, 1024, 65535);
  const array = top.originals;
  if (!Array.isArray(array) || PROXY(array) || P(array) !== Array.prototype
      || array.length !== p.totalCalls || K(array).length !== array.length + 1) fail();
  const seen = new Set(), rows = [];
  let bytes = 0;
  for (let index = 0; index < array.length; index++) {
    const d = D(array, String(index)); if (!d || !HAS(d, 'value') || !d.enumerable) fail();
    const row = exact(d.value, ['cohort','ordinal','original']);
    const cohort = index < p.warmupCallsPerLane ? 'WARMUP' : 'MEASUREMENT';
    const ordinal = cohort === 'WARMUP' ? index : index - p.warmupCallsPerLane;
    if (row.cohort !== cohort || row.ordinal !== ordinal || Object.is(row.ordinal, -0)) fail();
    const o = exact(row.original, ['grantId','requestId','originalRequestJson','originalBodyBase64','serviceResourceUrl','authorizationHeader']);
    identifier(o.requestId);
    if (o.grantId !== top.selectedGrantId || o.serviceResourceUrl !== top.serviceResourceUrl
        || o.originalBodyBase64 !== '' || seen.has(o.requestId)) fail();
    text(o.originalRequestJson, 4096); text(o.authorizationHeader, 16384);
    if (!/^ServiceCredit [A-Za-z0-9_-]+$/.test(o.authorizationHeader)) fail();
    let request; try { request = JSON.parse(o.originalRequestJson); } catch { fail(); }
    const r = exact(request, ['modelVersion','grantId','requestId','method','routeId',
      'canonicalBodyDigest','selectedContentType','maxCostUnits']);
    const canonical = { modelVersion: 1, grantId: o.grantId, requestId: o.requestId, method: 'POST',
      routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY_BODY_SHA256,
      selectedContentType: 'application/json', maxCostUnits: 2 };
    if (D(Object.prototype, 'toJSON') !== undefined || D(Object.prototype, 'then') !== undefined
        || JSON.stringify(canonical) !== o.originalRequestJson
        || Object.keys(canonical).some(k => canonical[k] !== r[k])) fail();
    seen.add(o.requestId); rows.push(F({ cohort, ordinal, original: F(o) }));
    bytes += Buffer.byteLength(o.originalRequestJson) + Buffer.byteLength(o.authorizationHeader) + 512;
    if (bytes > 524288) fail();
  }
  return F({ selectedGrantId: top.selectedGrantId, serviceResourceUrl: top.serviceResourceUrl, originals: F(rows) });
}

function exact(value, fields) {
  if (value === null || typeof value !== 'object' || PROXY(value) || P(value) !== Object.prototype
      || K(value).length !== fields.length) fail();
  const out = {};
  for (const field of fields) {
    const d = D(value, field); if (!d || !HAS(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, field, { value: d.value, enumerable: true });
  }
  return out;
}
function identifier(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail(); }
function hex(value, length) { return typeof value === 'string' && value.length === length && /^[0-9a-f]+$/.test(value); }
function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < low || value > high) fail();
}
function text(value, maximum) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum
      || Buffer.byteLength(value) > maximum || /[\r\n\0]/.test(value)) fail();
}
function fail() { throw new TypeError('NATIVE_CAPACITY_LANE_DATA_REJECTED'); }
