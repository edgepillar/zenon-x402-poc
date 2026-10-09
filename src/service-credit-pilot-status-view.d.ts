// Uncompiled static types for caller-declared display data; no authority or recovery proof.
// Readonly is not native freeze; strings prove no JSON/hash validity, custody, READY or delivery.
export type ServiceCreditPilotStatusPhase =
  | 'RECOVERY_REQUIRED'
  | 'FUNDING_PENDING'
  | 'FUNDING_REVIEW_REQUIRED'
  | 'CLOSED'
  | 'FUNDING_NOT_STARTED'
  | 'FUNDED_NO_SESSION'
  | 'SERVICE_IDLE'
  | 'SERVICE_BUSY'
  | 'RESULT_REPORTED'
  | 'SERVICE_UNAVAILABLE';

export type ServiceCreditPilotStatusView = Readonly<{
  viewVersion: 1;
  evidence: 'DECLARED_DATA_ONLY';
  phase: ServiceCreditPilotStatusPhase;
  paymentHash: string | null;
  requestId: string | null;
  reconciliationRequired: boolean;
  authorization: 'NONE';
  mayStartPayment: false;
  maySignPayment: false;
  mayDispatchService: false;
  deliveryConfirmed: false;
}>;

export function getServiceCreditPilotStatusView(
  originalIdentityJson: string,
  observationJson: string
): ServiceCreditPilotStatusView;
