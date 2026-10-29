// SOURCE/PARSER ONLY. No native execution or physical release is established.
import { Buffer } from 'node:buffer';
import { hrtime } from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { types } from 'node:util';
import { consumeApiCreditOriginalGrantQueryProfile, releaseApiCreditOriginalGrantQueryProfile } from '../api-credit-original-grant-query-profile.js';
import { runApiCreditOriginalGrantQueryOwner } from '../api-credit-original-grant-query-owner.js';

const F = Object.freeze, CLOCK = hrtime.bigint, APPLY = Reflect.apply, CONTROLLER = AbortController;
export async function inspectNativeApiCreditOriginalGrant(profile, requireOpening) {
  if (arguments.length !== 2 || typeof requireOpening !== 'function' || types.isProxy(requireOpening) || !Object.isFrozen(requireOpening))
    throw new TypeError('API_CREDIT_NATIVE_ORIGINAL_GRANT_QUERY');
  try {
    requireOpening(); const captured = consumeApiCreditOriginalGrantQueryProfile(profile);
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
    return await runApiCreditOriginalGrantQueryOwner(F({ profile: captured, ports, requireOpening }));
  } finally { releaseApiCreditOriginalGrantQueryProfile(profile); }
}
