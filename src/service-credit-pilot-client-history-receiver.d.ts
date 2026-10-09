// UNCOMPILED; UNQUALIFIED declared-data only; no runtime authority.
export type ServiceCreditPilotClientHistoryReceiver=Readonly<{
receive:(nextHistorySnapshotJson:string)=>string;
getSnapshotJson:()=>string;
}>;
export declare function createServiceCreditPilotClientHistoryReceiver(initialHistorySnapshotJson:string):ServiceCreditPilotClientHistoryReceiver;
