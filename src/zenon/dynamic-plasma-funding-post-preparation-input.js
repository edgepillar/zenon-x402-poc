import { captureFundingPostCheckpointRoute } from '../x402-funding-post-checkpoint-route.js';
import { captureZenonDynamicPlasmaOriginalFundingInputV2 } from './dynamic-plasma-original-funding-data.js';

const ROUTE = captureFundingPostCheckpointRoute;
const CAPTURE = captureZenonDynamicPlasmaOriginalFundingInputV2;
const FREEZE = Object.freeze, DEFINE = Object.defineProperty;
const ErrorType = TypeError;

/**
 * Synchronous DATA admission for the native client's fixed POST /funding path,
 * before its real preparer, wallet/read/material work or checkpoint commit.
 * The general contextv7 capture deliberately supports nonempty original bodies;
 * that contract is unchanged. This separate consumer requires the SAME exact
 * empty-body route used by the later funding POST checkpoint client.
 *
 * Return the generic capture's detached frozen input directly, without adding
 * fields, stripping a body, re-encoding originals or inventing a prepared block.
 * A coherent nonempty body is rejected, never silently converted into an empty
 * one after signing. Wrong routes and old context versions cannot be upgraded.
 * No callback, SDK, SQL, wallet, signing, work/nonce search, transport or current
 * observation is invoked. Passing DATA is neither consent nor any native,
 * funds, signature, durability, dispatch, grant or service-delivery proof.
 */
export function captureZenonDynamicPlasmaFundingPostPreparationInput(input, fundingResourceUrl) {
  try {
    if (arguments.length !== 2) reject();
    const route = ROUTE(fundingResourceUrl);
    const original = CAPTURE(input, route.resourceUrl);
    if (original.originalRequest.requestBodyBase64 !== route.originalBodyBase64) reject();
    return original;
  } catch { reject(); }
}
function reject() {
  const code = 'zenon_dynamic_plasma_funding_post_preparation_input_rejected';
  const error = new ErrorType(code);
  DEFINE(error, 'code', { value: code, enumerable: true });
  DEFINE(error, 'stack', { value: 'TypeError: ' + code });
  throw FREEZE(error);
}
