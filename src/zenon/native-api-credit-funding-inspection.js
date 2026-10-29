// SOURCE/PARSER ONLY. Existing SQLite/physical close acceptance remains OPEN.
import { types } from 'node:util';
import { consumeApiCreditFundingInspectionProfile, releaseApiCreditFundingInspectionProfile } from '../api-credit-funding-inspection-profile.js';
import { runApiCreditFundingInspectionOwner } from '../api-credit-funding-inspection-owner.js';

const F = Object.freeze, APPLY = Reflect.apply;
export async function inspectNativeApiCreditFundingOriginal(profile, requireOpening) {
  if (arguments.length !== 2 || typeof requireOpening !== 'function' || types.isProxy(requireOpening) || !Object.isFrozen(requireOpening)) throw new TypeError('API_CREDIT_NATIVE_FUNDING_INSPECTION');
  try {
    requireOpening(); const captured = consumeApiCreditFundingInspectionProfile(profile);
    requireOpening(); const module = await import('../service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
    requireOpening(); const OPEN = module.openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6, P = module.ZenonFundingPayerRecoverySqliteStore.prototype;
    const LOAD = P.load, CHECKPOINT = P.getOriginalPaymentCheckpoint, VIEW = P.inspectFundingOriginalLifecycle, CLOSE = P.close;
    const ports = F({
      openExisting: F(c => OPEN({ databasePath: c.databasePath, allowedRoot: c.allowedRoot, resourceUrl: c.fundingResourceUrl, custodyPolicy: c.custodyPolicy })),
      readState: F(store => APPLY(LOAD, store, [])), readCheckpoint: F((store, pins) => APPLY(CHECKPOINT, store, [pins])),
      inspectStore: F(store => APPLY(VIEW, store, [])), closeStore: F(store => APPLY(CLOSE, store, [])),
    });
    return runApiCreditFundingInspectionOwner(F({ profile: captured, ports, requireOpening }));
  } finally { releaseApiCreditFundingInspectionProfile(profile); }
}
