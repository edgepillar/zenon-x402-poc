// Pure, stateless HTML text only; no DOM mounting, listener, I/O or actions.
// Pristine intrinsics and a qualified embedding consumer remain premises.
// This view does not change separately authorized original-payment reconciliation
// or PR193's VALIDATED same-block boundary; it supplies no such authority.
import { getServiceCreditPilotStatusView } from './service-credit-pilot-status-view.js';

function escapeText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderServiceCreditPilotStatusHtml(originalIdentityJson, observationJson) {
  const view = getServiceCreditPilotStatusView(originalIdentityJson, observationJson);
  const labels = {
    RECOVERY_REQUIRED: 'Unknown funding or service outcome reported; original reconciliation required.',
    FUNDING_PENDING: 'Funding reported pending; original reconciliation required.',
    FUNDING_REVIEW_REQUIRED: 'Funding failure reported; original payment review required.',
    CLOSED: 'Service reported closed.',
    FUNDING_NOT_STARTED: 'Funding reported not started.',
    FUNDED_NO_SESSION: 'Funding inclusion reported; no session reported.',
    SERVICE_IDLE: 'Service reported idle.',
    SERVICE_BUSY: 'Service execution reported in progress.',
    RESULT_REPORTED: 'Service result reported; delivery remains unconfirmed.',
    SERVICE_UNAVAILABLE: 'Service reported unavailable.'
  };
  if (!Object.hasOwn(labels, view.phase)) throw new Error('UNSUPPORTED_STATUS_VIEW_PHASE');
  const warning = 'Caller-declared data only; not evidence of funding, provider READY, ' +
    'current-context authority, authorization, delivery receipt or durable recovery. ' +
    'Included labels or a false reconciliation flag prove neither effect absence nor recovery safety. ' +
    'Original bytes/context remain in external custody. This view authorizes no reset, replacement, resigning, retry or new charge.';
  return `<section aria-label="Service credit pilot status">
<h2>Service credit pilot status</h2>
<p><strong>Status:</strong> ${escapeText(labels[view.phase])}</p>
<dl><dt>Declared original payment hash</dt><dd>${escapeText(view.paymentHash ?? 'Not supplied')}</dd>
<dt>Declared original request ID</dt><dd>${escapeText(view.requestId ?? 'Not supplied')}</dd></dl>
<p><strong>${escapeText(warning)}</strong></p>
</section>`;
}
