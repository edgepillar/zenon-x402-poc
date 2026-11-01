// SOURCE ONLY. No native open/read/release execution is established here.
import { types } from 'node:util';
import { consumeApiCreditSignerInspectionProfile, releaseApiCreditSignerInspectionProfile } from '../api-credit-signer-inspection-profile.js';
import { runApiCreditSignerInspectionOwner, runApiCreditSignerInspectionWithUncertaintyAgeOwner } from '../original-funding-signer-inspection-owner.js';
import { captureApiCreditOperatorUtcDay } from '../api-credit-operator-clock.js';

const F = Object.freeze, NOW = Date.now;
/** The admitted profile and EOF precede this literal existing-store import.
 * No wallet/SDK/key, signer, transport, migration or discovery fallback. */
export async function inspectNativeApiCreditSignerOriginal(profile, requireOpening) {
  try {
    if (arguments.length !== 2 || typeof requireOpening !== 'function' || types.isProxy(requireOpening) || !Object.isFrozen(requireOpening)) throw new TypeError('API_CREDIT_SIGNER_INSPECTION');
    requireOpening(); const captured = consumeApiCreditSignerInspectionProfile(profile);
    requireOpening(); const { openOriginalFundingSpendingSignerContextFileOwner } = await import('../original-funding-spending-file-owner.js');
    requireOpening(); const ports = F({ openFile: F(function openExistingOriginalFile(configuration) {
      requireOpening(); if (configuration.storageProfile.mode !== 'OPEN_EXISTING') throw new TypeError('API_CREDIT_SIGNER_INSPECTION');
      return openOriginalFundingSpendingSignerContextFileOwner(configuration);
    }) });
    const configuration = { fileConfiguration: captured.fileConfiguration, expectedOriginal: captured.expectedOriginal, ports, requireOpening };
    return Object.hasOwn(captured, 'uncertaintyAgeLimits')
      ? runApiCreditSignerInspectionWithUncertaintyAgeOwner({ ...configuration, uncertaintyAgeLimits: captured.uncertaintyAgeLimits,
        readDay: F(() => captureApiCreditOperatorUtcDay(NOW())) })
      : runApiCreditSignerInspectionOwner(configuration);
  } finally { try { releaseApiCreditSignerInspectionProfile(profile); } catch {} }
}
