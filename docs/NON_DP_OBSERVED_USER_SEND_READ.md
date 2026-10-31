# Borrowed non-DP unsigned read chain

`createNonDpObservedUserSendReadAdapter` connects the non-DP fused-only
strategy to the existing bounded account/RPC, balance, intent, subject and
306-byte unsigned hash codecs. It is a source component. The non-DP native
entry and its signer, spending, funding, grant and recovery binding remain
**NOT_IMPLEMENTED**. G0-G5 acceptance remains open.

The constructor takes frozen `{transports, accountExchange, requireCurrent}`.
`transports` contains the same two frozen `{callRead}` ports exposed by the
existing retained read session. `accountExchange` is its existing account wire.
The parent retains endpoint choice, authentication, deadlines, cancellation,
drain and close. Construction invokes none of these ports. The explicit,
synchronous, void `requireCurrent` callback is checked before every borrowed
handoff and after every await, including local strategy awaits and final
assembly. No new owner, lease, timer, socket, transport factory or release
capability is created. Borrowed ports must prehandle their rejected promises.

Each operation captures bounded descriptor-only input before invoking any
callback. The input fields are `nonDpReadInputVersion: 1`, `phase: "UNSIGNED"`,
`paymentRequired`, `accepted`, `payerAddress`, `compiledSporkIds`, `policy`,
`runtimeContextDigest` and `publicKey`. The last field is canonical public
32-byte base64 DATA; key/address binding is **NOT_PERFORMED**.

The three one-shot operations are:

1. `quote(input)` derives the subject from the observed account frontier and
   selected intent, then selects the original zero-work fused allocation.
2. `assemble(input, originalPlan)` reads again, applies that same branded quote,
   assembles unsigned fields and computes their shared hash.
3. `validateUnsigned(input, originalPlan, originalBlock)` first rejects any
   changed block, then performs a fresh read and returns the same original
   block object and hash. It cannot repair, reprice or replace the original.

Every cycle reads account frontier, selected-token balance, both independent
endpoint observations, and account frontier again. Each endpoint reads
Momentum-before, height-two profile evidence, the complete bounded spork list,
the legacy three-field resource quote, and Momentum-after. It does not call
`embedded.plasma.getVariables` or insert fabricated DP variables. At most eight
128-entry rule pages are accepted. Page counts must remain stable; duplicate
IDs, incomplete lists and endpoint disagreement, including ordering, refuse.
The existing bounded scanner rejects duplicate JSON keys. Numeric primitives
must retain canonical, safe, unsigned integer source lexemes.

Both endpoints must match the declared chain/genesis profile, a stable
version-one Momentum with zero price fields and the complete rule set. An
observed enforced Dynamic Plasma spork refuses this lane even when the header
still reports version one. Zero required difficulty alone does not select
non-DP. Fusion must cover the unchanged original base cost. The original
account sequence, payment intent, policy, runtime, public key, allocation and
acknowledgement remain bound. Later Momentum height changes use the existing
bounded height window; this is **not ancestry proof**.

There are at most three admitted cycles: nine account requests and at most
36 requests per endpoint. They consume the parent's existing budgets without
resetting them. Overlap and repeated stages refuse. Invalid input before a
handoff can be corrected without consuming a cycle. A failure after entering
the ownership/read phase permanently holds this adapter. Pending borrowed
work stays pending; no synthetic timeout or release is asserted.

All observations remain declared DATA. Matching account heights and bracketed
frontiers are not an atomic state snapshot, authenticated funds, spendability,
current chain authority or finality. The component never signs, runs SDK
PREPARE, searches for work, publishes a payment or authorizes one. Native
lifecycle release, Linux execution, installed SDK compatibility and full
product behavior remain unestablished. Existing DP paths are unchanged.
