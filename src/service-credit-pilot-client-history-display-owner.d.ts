// Uncompiled declaration; no runtime authority or live qualification.
export type ServiceCreditPilotClientHistoryDisplayOwner = Readonly<{
  receive: (nextHistorySnapshotJson: string) => string;
  getHtml: () => string;
  getSnapshotJson: () => string;
}>;

export declare function createServiceCreditPilotClientHistoryDisplayOwner(
  initialHistorySnapshotJson: string
): ServiceCreditPilotClientHistoryDisplayOwner;
