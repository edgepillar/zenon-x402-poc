/**
 * Stateless display data, not a backend lifecycle or authorization decision.
 * Both arguments are canonical JSON strings (max 1024 UTF-16 code units).
 * Ordered identity keys: viewVersion, paymentHash, requestId; observation
 * appends fundingStatus and serviceStatus. Labels and original identity are
 * caller declarations, not authenticated funding, context, READY or delivery.
 * Original bytes/context and durable ambiguity/recovery stay in external custody.
 * A false reconciliation flag proves neither effect absence nor recovery safety.
 * Standard pristine JSON/Object/string intrinsics are assumed; the input bound
 * is not a whole-native resource/lifetime guarantee. No state, I/O or dispatch.
 */
export function getServiceCreditPilotStatusView(originalIdentityJson, observationJson) {
  const bad = new Error('INVALID_STATUS_VIEW_INPUT');
  const values = [];
  for (let i = 0; i < 2; i += 1) {
    const text = i === 0 ? originalIdentityJson : observationJson;
    if (typeof text !== 'string' || text.length > 1024) throw bad;
    let v;
    try { v = JSON.parse(text); } catch { throw bad; }
    if (v === null || typeof v !== 'object' ||
        Object.getPrototypeOf(v) !== Object.prototype ||
        JSON.stringify(Object.keys(v)) !== '["viewVersion","paymentHash","requestId"' +
          (i ? ',"fundingStatus","serviceStatus"]' : ']') ||
        JSON.stringify(v) !== text || v.viewVersion !== 1) throw bad;
    const h = v.paymentHash, r = v.requestId;
    if ((h !== null && (typeof h !== 'string' || !/^[0-9a-f]{64}(?![\s\S])/.test(h))) ||
        (r !== null && (typeof r !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?![\s\S])/.test(r)))) throw bad;
    values[i] = v;
  }
  const [a, o] = values;
  const { paymentHash: h, requestId: r, fundingStatus: f, serviceStatus: s } = o;
  if (!['NOT_STARTED','PENDING','UNKNOWN','INCLUDED','FAILED'].includes(f) ||
      !['NOT_STARTED','IDLE','EXECUTING','OUTCOME_UNKNOWN',
        'SUCCEEDED','CLOSED','UNAVAILABLE'].includes(s)) throw bad;
  if (a.paymentHash !== h || a.requestId !== r) {
    throw new Error('ORIGINAL_IDENTITY_MISMATCH');
  }
  if ((h === null && (r !== null || f !== 'NOT_STARTED' || s !== 'NOT_STARTED')) ||
      (r === null && ['EXECUTING','OUTCOME_UNKNOWN','SUCCEEDED'].includes(s))) throw bad;
  const phase = f === 'UNKNOWN' || s === 'OUTCOME_UNKNOWN' ? 'RECOVERY_REQUIRED'
    : f === 'PENDING' ? 'FUNDING_PENDING'
    : f === 'FAILED' ? 'FUNDING_REVIEW_REQUIRED'
    : s === 'CLOSED' ? 'CLOSED'
    : f === 'NOT_STARTED' ? 'FUNDING_NOT_STARTED'
    : {
      NOT_STARTED: 'FUNDED_NO_SESSION', IDLE: 'SERVICE_IDLE',
      EXECUTING: 'SERVICE_BUSY', SUCCEEDED: 'RESULT_REPORTED',
      UNAVAILABLE: 'SERVICE_UNAVAILABLE'
    }[s];
  if (phase === undefined) throw bad;
  return Object.freeze({
    viewVersion: 1, evidence: 'DECLARED_DATA_ONLY', phase,
    paymentHash: h, requestId: r,
    reconciliationRequired: phase === 'RECOVERY_REQUIRED' || phase === 'FUNDING_PENDING',
    authorization: 'NONE', mayStartPayment: false, maySignPayment: false,
    mayDispatchService: false, deliveryConfirmed: false
  });
}
