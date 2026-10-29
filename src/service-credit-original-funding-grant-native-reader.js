// SOURCE ONLY: real SQL and capability verification are not executed here.
import { types } from 'node:util';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';
import { verifyServiceCreditCapability } from './service-credit-capability.js';
import { createServiceCreditOriginalFundingGrantReaderCore } from './service-credit-original-funding-grant-reader-core.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, APPLY = Reflect.apply;
const PROTOTYPE = ServiceCreditSqliteStore.prototype, READ = D(PROTOTYPE, 'readOriginalFundingGrant').value;
const VERIFY = verifyServiceCreditCapability;
function fail() {
  const code = 'SERVICE_CREDIT_ORIGINAL_FUNDING_GRANT_NATIVE_READER', e = new TypeError(code);
  Object.defineProperties(e, { code: { value: code, enumerable: true }, stack: { value: 'TypeError: ' + code } }); throw F(e);
}
/** The selected store stays borrowed. No open/create/migrate/close, SDK,
 * signer, funding POST, activation or service dispatch is selected. This does
 * not mount an HTTP route or accept the full funding-ACK recovery graph. */
export function createServiceCreditOriginalFundingGrantNativeReader(store) {
  if (arguments.length !== 1 || store === null || typeof store !== 'object' || types.isProxy(store)
      || Object.getPrototypeOf(store) !== PROTOTYPE || typeof READ !== 'function') fail();
  const core = createServiceCreditOriginalFundingGrantReaderCore({
    readOriginalFundingGrant: F(function readOriginalFundingGrant(identity) {
      if (arguments.length !== 1 || D(PROTOTYPE, 'readOriginalFundingGrant')?.value !== READ) fail();
      return APPLY(READ, store, [identity]);
    }),
    verifyCapability: F(function verifyCapability(input) {
      if (arguments.length !== 1) fail(); return VERIFY(input);
    }),
  });
  return core;
}
