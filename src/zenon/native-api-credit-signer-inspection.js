// SOURCE ONLY. No native open/read/release execution is established here.
import { types } from 'node:util';
import { consumeApiCreditSignerInspectionProfile, releaseApiCreditSignerInspectionProfile } from '../api-credit-signer-inspection-profile.js';
import { runApiCreditSignerInspectionOwner } from '../original-funding-signer-inspection-owner.js';

const F = Object.freeze;
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
    return runApiCreditSignerInspectionOwner({ fileConfiguration: captured.fileConfiguration, expectedOriginal: captured.expectedOriginal, ports, requireOpening });
  } finally { try { releaseApiCreditSignerInspectionProfile(profile); } catch {} }
}
