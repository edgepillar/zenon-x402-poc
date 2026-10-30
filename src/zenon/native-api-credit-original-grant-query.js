// SOURCE/PARSER ONLY. No native execution or physical release is established.
import { resolveApiCreditStoredGrantQueryOwner } from '../api-credit-stored-grant-query-owner.js';
import { Buffer } from 'node:buffer';
import { hrtime } from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { types } from 'node:util';
import { consumeApiCreditOriginalGrantQueryProfile, releaseApiCreditOriginalGrantQueryProfile } from '../api-credit-original-grant-query-profile.js';
import { runApiCreditOriginalGrantQueryOwner } from '../api-credit-original-grant-query-owner.js';
import { captureApiCreditPurchasedGrantRecoveryOutput } from '../api-credit-purchased-grant-recovery.js';

const F = Object.freeze, CLOCK = hrtime.bigint, APPLY = Reflect.apply, CONTROLLER = AbortController;
export async function inspectNativeApiCreditOriginalGrant(profile, requireOpening) {
  if (arguments.length !== 2 || typeof requireOpening !== 'function' || types.isProxy(requireOpening) || !Object.isFrozen(requireOpening))
    throw new TypeError('API_CREDIT_NATIVE_ORIGINAL_GRANT_QUERY');
  try {
    requireOpening(); const selected = consumeApiCreditOriginalGrantQueryProfile(profile);
    let captured = selected, purchaseSelection = null;
    if (Object.hasOwn(selected, 'storedGrantQueryVersion')) {
      requireOpening(); const { openOriginalFundingSpendingGrantRecoveryFileOwner } = await import('../original-funding-spending-file-owner.js');
      requireOpening();
      const recovered = resolveApiCreditStoredGrantQueryOwner(F({ profile: selected, requireOpening,
        ports: F({ openFile: F(configuration => {
          requireOpening(); if (configuration.storageProfile.mode !== 'OPEN_EXISTING') throw new TypeError('API_CREDIT_NATIVE_ORIGINAL_GRANT_QUERY');
          return openOriginalFundingSpendingGrantRecoveryFileOwner(configuration);
        }) }) }));
      if(selected.storedGrantQueryVersion===3){captured=recovered.profile;purchaseSelection=recovered.purchaseSelection;}
      else captured=recovered;
    }
    // A stored profile reaches this point only after independent full-profile
    // binding and observed closure of the same existing spending-file owner.
    requireOpening(); const { createOriginalFundingGrantNativeHttpsTransport } = await import('../service-credit-funding-post-native-https-transport.js');
    requireOpening();
    const ports = F({
      openTransport: F(c => {
        const ca = Buffer.from(c.transport.caBase64, 'base64');
        try { return createOriginalFundingGrantNativeHttpsTransport({ resourceUrl: c.route.queryUrl, ca, maxRequestStarts: 1,
          requestDeadlineMs: c.transport.requestDeadlineMs, handshakeDeadlineMs: c.transport.handshakeDeadlineMs,
          closeGraceMs: c.transport.closeGraceMs }, c.route); }
        finally { ca.fill(0); }
      }),
      read: F((transport, query, proof) => { const controller = new CONTROLLER(); return transport.read(query, proof, controller.signal); }),
      inspect: F(transport => transport.snapshot()), close: F(transport => transport.close()),
      clock: F(() => APPLY(CLOCK, hrtime, [])), armTimer: F((budget, callback) => setTimeout(callback, budget)),
      cancelTimer: F(token => { clearTimeout(token); }),
    });
    const output=await runApiCreditOriginalGrantQueryOwner(F({ profile: captured, ports, requireOpening }));
    if(purchaseSelection===null)return output;
    requireOpening();
    const result=captureApiCreditPurchasedGrantRecoveryOutput(purchaseSelection,output);
    requireOpening();return result;
  } finally { releaseApiCreditOriginalGrantQueryProfile(profile); }
}
