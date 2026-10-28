# API-credit admission before acquisition

The API-credit selector now validates the complete operational configuration
before its selection can reach the spending-file opener or wallet owner.
`captureNativeFundingServiceOperationalConfiguration` is shared with the actual
native funding/service opener. This removes the separate, later operational
validation block from that opener rather than maintaining a permissive second
grammar in front of it.

The pure capture checks:

- direct normalized checkpoint path/root and the actual versioned custody policy;
- the exact funding/service origin and fixed role paths;
- one funding POST, bounded service starts, serial service admission and deadlines;
- official asset metadata, context limit and challenge callback shape;
- canonical public-key/nonce DATA and the existing work-count limits, without work;
- two distinct retained read peers and the existing native route/timing grammar;
- bounded, non-shared and matching funding/service CA byte DATA.

The public read hostname/path/pinned-IPv4 predicates moved unchanged to
`native-public-https-read-route.js`. The native read core and early operational
capture call those same functions. The source qualification records the exact
predecessor predicate-body hash and checks correspondence before execution.
Public admission still rejects loopback/private/documentation routes; named
native local qualification alone selects its separate localhost role grammar.
The public API-credit selector has no local fallback.

The existing SDK method protocol is checked by descriptor lookup before a
selection is returned and again when it is consumed. No key method is called
and no wallet is constructed by these checks. The actual wallet owner retains
its existing identity, signing, transfer and cleanup contract.

Nested configuration is detached before deferred native loading. Consumption
revalidates the operational capture and the original CA digests before the
spending-file call. Mutating both owned CA copies to another matching value
therefore cannot substitute admitted trust. A refusal consumes the selection,
clears only its owned CA copies and authorizes no automatic retry. The digests
are local corruption checks, not authentication against an actor rewriting code.
Proxy and accessor checks precede reflective operations that could enter traps.

These are inert configuration and consistency checks. They do not resolve DNS,
authenticate TLS, parse a certificate, inspect an actual database, verify a
provider, call a key/clock/challenge validator, sign, search a nonce or grant
permission to run native work. Current user instructions still disable native
execution. The native source receives parser checks only.

The DATA qualification includes the earlier 38 application/command controls and
new malformed configuration, canonical route, proxy/accessor and consumption
tampering cases. The current 108-control hosted CI lane remains separate and
unchanged. Native SDK/core/SQLite/HTTPS, Linux, operator bootstrap, 100-call and
G2 acceptance remain open.
