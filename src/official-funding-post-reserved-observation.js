import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { decodeB64Json } from './x402-wire.js';
import { inspectOfficialFundingPostCustodyRecord,officialFundingPostCustodyRecordDigest } from './official-funding-post-custody-record.js';
import { captureOriginalSelectedFundingJournalBinding } from './official-funding-post-original-journal-observation.js';
import { normalizeSelectedSettlementCallbackResult } from './x402-selected-settlement-context.js';

const F=Object.freeze,RESERVATIONS=new WeakSet();
function fail(){throw new TypeError('OFFICIAL_FUNDING_POST_RESERVED_OBSERVATION');}

/** DATA-only callback admission. The actual custody owner must read its exact
 * current row first and enforce one callback entry per durable reservation.
 * A digest or this DATA receipt never authenticates a payment or chain.
 */
export function captureOfficialFundingPostReservedObservation(raw,payload,requirement,challenge){
 if(arguments.length!==4)fail();const r=inspectOfficialFundingPostCustodyRecord(raw);
 if(r.phase!=='OBSERVATION_IN_FLIGHT'||r.observations<1||r.observations>r.maximumPendingReconciliations)fail();
 const selected=captureOriginalSelectedFundingJournalBinding(payload,requirement,challenge),b=selected.normalizer;
 const original=decodeB64Json(r.originalHeader,{maxEncodedBytes:5464,maxDecodedBytes:4096});
 const issued=JSON.parse(r.issuedFrameJson),required=decodeB64Json(issued.paymentRequiredHeader,{maxEncodedBytes:10924,maxDecodedBytes:8192});
 if(b.payloadJson!==canonicalJson(original)||b.challengeJson!==canonicalJson(required)||b.requirementsJson!==canonicalJson(required.accepts[0])||b.paymentHash!==r.transactionHash)fail();
 const receipt=F({observation:r.observations,maximumPendingReconciliations:r.maximumPendingReconciliations,recordDigest:officialFundingPostCustodyRecordDigest(raw),originalPayer:selected.original.payer,binding:b});
 RESERVATIONS.add(receipt);return receipt;
}

/** Normalize constructed primitives before any Promise resolution. Never
 * assimilate a callback's thenable or serialize its getters/toJSON hooks.
 * The existing bridge will consume the same normalized settlement packet.
 */
export function captureOfficialFundingPostReservedObservationResult(value,reservation){
 if(arguments.length!==2||reservation===null||typeof reservation!=='object'||types.isProxy(reservation)||!RESERVATIONS.has(reservation))fail();
 const packet=normalizeSelectedSettlementCallbackResult(value,reservation.binding),response=JSON.parse(packet.responseJson);
 if(response.success&&response.payer!==reservation.originalPayer)fail();
 return F({...response,disposition:packet.disposition,publicationStatus:packet.publicationStatus});
}
