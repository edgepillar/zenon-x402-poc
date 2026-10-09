import { renderServiceCreditPilotStatusHtml } from './service-credit-pilot-status-html.js';
import { Buffer } from 'node:buffer';

// Declared data: 200 means construction, never service success.
// Buffer/intrinsics, policy enforcement and the embedding consumer remain premises.
export function getServiceCreditPilotStatusResponse(originalIdentityJson, observationJson) {
  if (arguments.length !== 2) throw new Error('INVALID_STATUS_RESPONSE_INPUT');
  const fragment = renderServiceCreditPilotStatusHtml(originalIdentityJson, observationJson);
  const body = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Service credit status — declared data</title></head>
<body><h1>Service credit status — declared data</h1>
${fragment}
</body>
</html>`;
  const headers = Object.freeze({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'content-length': String(Buffer.byteLength(body, 'utf8'))
  });
  return Object.freeze({ statusCode: 200, headers, body });
}
