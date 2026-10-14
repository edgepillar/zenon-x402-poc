import {
  encodeServiceCreditPilotHistoryEnvelopeResponse,
  decodeServiceCreditPilotHistoryEnvelopeResponse
} from './service-credit-pilot-history-envelope-response-json.js';
import { parseDeclaredPilotHttpHeaders } from './service-credit-pilot-declared-http-headers.js';

/**
 * Opt-in PURE conservative application DATA connection only.
 * Not HTTP/RFC completeness, security-header policy, server/socket
 * enforcement, an allowed-header set, authentication/custody, delivery
 * or pilot qualification. Not wired into existing request paths.
 * Existing parser/codec/receiver/owner/response contracts stay unchanged.
 * Headers use the standalone parser's stricter profile. Opaque body and
 * frame strings remain declared DATA under the existing codec's bounds.
 */
export function encodeDeclaredPilotHttpResponseFrame(status, headersJson, body) {
  if (arguments.length !== 3) throw new TypeError();
  parseDeclaredPilotHttpHeaders(headersJson);
  return encodeServiceCreditPilotHistoryEnvelopeResponse(status, headersJson, body);
}

export function decodeDeclaredPilotHttpResponseFrame(frameJson) {
  if (arguments.length !== 1) throw new TypeError();
  const decoded = decodeServiceCreditPilotHistoryEnvelopeResponse(frameJson);
  parseDeclaredPilotHttpHeaders(JSON.stringify(decoded.headers));
  return decoded;
}
