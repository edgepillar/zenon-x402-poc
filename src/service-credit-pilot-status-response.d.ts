// Uncompiled declarations: 200 means construction, not service success.
// Types prove no policy enforcement, authority, native freeze, byte length or compiler/runtime qualification.
export interface ServiceCreditPilotStatusResponseHeaders {
  readonly "content-type": "text/html; charset=utf-8";
  readonly "cache-control": "no-store";
  readonly "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";
  readonly "referrer-policy": "no-referrer";
  readonly "x-content-type-options": "nosniff";
  readonly "x-frame-options": "DENY";
  readonly "content-length": string;
}

export interface ServiceCreditPilotStatusResponse {
  readonly statusCode: 200;
  readonly headers: ServiceCreditPilotStatusResponseHeaders;
  readonly body: string;
}

export function getServiceCreditPilotStatusResponse(
  originalIdentityJson: string,
  observationJson: string
): ServiceCreditPilotStatusResponse;
