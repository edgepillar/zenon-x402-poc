# Non-DP candidate through the original signer owner

`createNonDpCustodiedOriginalCandidate` connects the non-DP observed read chain
to the existing age-bound, context-custodied prepared-hash wallet owner and
the original-funding DATA/checkpoint codecs. It is an explicit source binding,
not the native application entry. That entry, actual payment preflight, V6
custody commit and transport cutover remain **NOT_IMPLEMENTED** for this lane.
G0-G5 acceptance remains open.

The frozen configuration contains the existing `readOptions`, the SAME
`walletOwner`, and its `expectedAddress` and `expectedPublicKey`. Read options
contain the retained two read ports, account exchange and synchronous void
`requireCurrent` guard. The wallet owner must expose the existing age/context
protocol, including `bindOriginalPreparation`, `beginPreSignObservation`,
`bindOriginalPreSignContext` and `sign`. Construction invokes no key, owner,
read or clock callback. The parent retains all stop/close and resource lifetime.
Recreating this component does not grant another economic attempt or owner.

`prepareOriginalFunding(input, fundingResourceUrl)` captures the complete
original context-v7 funding input before any callback: selected intent,
original challenge/header, request/body/context bytes and IDs. The named
non-DP entry requires exactly the fused-only three-field policy. It refuses a
DP policy; zero difficulty does not silently select a different lane.

The one original flow is:

1. Bind that captured preparation to the existing signer owner.
2. Quote and assemble through the actual non-DP account/rule/resource reader.
3. Check shared unsigned hash, zero-work and supplied key/address consistency.
4. Start the owner's existing monotonic admission window before the final
   unsigned read; bind the exact block, original quote and checkpoint context.
5. Call the SAME owner's `sign` port once. Its existing implementation commits
   INTENT before its SDK method and SIGNED before acknowledging the candidate.
   Its current-owner and age checks still run after intent I/O.
6. Encode the original payment/checkpoint DATA once, then perform a new
   original-only account/rule/resource read after the returned signing result.

The generic signer-context schema is reused without invoking a DP checkpoint
reader or inventing a DP quote. Its plan DATA contains
`observedUserSendPlanVersion: 1`; the quote retains
`nonDpFusedQuoteVersion: 1`. The actual branded non-DP read plan stays private.
The custody codec stores exact DATA, not current price or signing authority.

After external independent pin retention and actual cryptographic preflight,
the eventual native custody owner must call `revalidateSignedOriginal()`
immediately before its real V6 commit. This performs the fifth read cycle and
returns the SAME candidate object, wire bytes, hash, checkpoint and pins. It
does not encode again, sign, refresh a quote or enter a store. Passing this
method alone establishes neither independent pin retention nor commit authority.

The explicit original-only reader has at most five cycles: 15 account reads
and at most 60 reads per endpoint, within the parent's existing 18/78 budgets.
The original UNSIGNED projection is historical DATA, not a claim that an
external signer is currently unsigned. No signed block enters a pre-sign
reader or strategy. Post-sign reads compare the captured original directly;
they never invoke the UNSIGNED strategy to obtain fresh authority.

Any post-entry failure permanently holds this component. Lost intent/result
acknowledgements, expired owners, opaque signing results and failed late reads
do not permit another sign, new packet, funding resend or grant. Returned
signature DATA is retained privately even if a later guard/read refuses;
the existing signer owner retains its own exact intent/result for original-only
inspection and recovery. Pending work has no fabricated timeout or release.

DATA qualification uses the actual source wallet owner and record/projection
codecs with declared in-memory RPC, clock and storage methods. Its fake SDK
methods return deliberately invalid signature-shaped fixed bytes. No installed
SDK, signing algorithm, private key, SQLite, socket, nonce search or native
application is run. Signature authenticity, durable/crash behavior, physical
release, chain authentication, Linux and the full native product remain open.
