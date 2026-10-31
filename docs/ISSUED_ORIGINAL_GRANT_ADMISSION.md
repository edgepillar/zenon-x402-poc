# Admit the existing original grant after result loss

The existing explicit `restoreIssuedFundingGrantNativeApplication` source entry
adds `admitOriginalCommittedServiceGrant()`, a LOCAL operator method with no
grant ID or payment argument. It finds an already committed grant through the
same actual service store's original-funding index, then calls the existing
provider's actual committed-grant admission. No grant is created or activated.
Native execution remains unqualified.

This closes a source integration gap after a local activation result is lost:
the grant can exist even when its ID was not returned to the operator. The
separate original-funding HTTP query remains read-only and keeps its proof
contract. Query/history alone still grants no service or activation authority.

## Fixed read and admission sequence

1. Claim one bounded local operation before callbacks. Require an idle, healthy,
   open recorded provider with retained BOUND, official SETTLED and no service
   session. PENDING, EXHAUSTED and in-flight official history remain NOT_READY;
   they never trigger lookup, settlement or grant activation.
2. Check the independently selected full BOUND-row and outcome digests before
   parsing or lookup. Validate the same issued frame, selection, route, original
   header/publication and persisted observation policy. Full BOUND rows surround
   the outcome read.
3. Derive the existing 14-field original-funding identity from those exact
   retained bytes. Match transaction, chain, asset, amount, payee, holder and
   original intent/data. Retain resource, requirement and funding commitments.
   No supplied grant ID, similar payment or new checkpoint replaces this source.
4. Invoke only the fixed actual `readOriginalFundingGrant` prototype method.
   Validate its NONE-authority historical result and recheck the complete
   original rows/outcome/provider. NOT_RECORDED or stored inactive history is
   NOT_READY. At most 16 explicit local attempts are admitted per owner.
5. For a recorded ACTIVE grant, claim the one admission entry before calling
   the existing `admitCommittedServiceGrant`. That controller rechecks original
   outcome and reads the actual full grant record before opening the scoped
   session. Check its exact return, provider admission state and original
   history again before returning local ADMITTED metadata.

The historical lookup never refreshes expiry, prices or units. Live validity is
still the existing actual grant/session admission's responsibility. Zero
available units do not erase history: an exhausted ACTIVE grant can still admit
its original session for exact cached replay. Neither this method nor lookup
resets consumed/held units, reserves credit, executes a service, releases payer
exposure, signs, settles or creates a grant.

## Ownership and uncertainty

The original manual-ID admission keeps its synchronous contract when this
local operation is idle. It is fenced during lookup/admission. No HTTP route is
added, and there is no automatic startup admission or provider handover.

Malformed/foreign/drifting history, unknown read/admission receipts or close
reentry keeps the owner HELD and requests the same provider close once. An
admission entry is never repeated after an uncertain result. The old failed
activation owner stays HELD; this explicit later reader does not repair it.
Caller-owned SQL stores remain borrowed and are never force-closed, migrated or
reopened. The intake retains only read capabilities; no custody writer, intake
issuer, SDK server, observer opener or grant-mint capability is captured.

DATA checks compose the actual owner, recorded provider/backend and reference
ledger with declared store/session/listener/proof ports. Controller/model state
reconstruction after a lost local grant ID is not a native process restart.
The exhausted 100-unit state and original exact replay preserve unit and
execution counts. Activation-shaped metadata remains unauthenticated DATA.

Actual SQLite/index durability, cryptographic authentication, fresh-process
recovery, stale-owner fencing, native release, Linux and full G1/G2 acceptance
remain OPEN. The unchanged hosted 108-control CI is separate hosted evidence.

## Retained expired-funding history

The existing READ_ORIGINAL_GRANT command returns a closed originalFundingHistoryVersion: 1 envelope for retained V2 official records. It keeps grantHistory and expiredFundingHistory separate and rebinds the receipt to the pinned original challenge commitment and absolute expiry before lookup. Both histories remain NONE-authority; absence or revocation of a grant never discharges the retained obligation. V1 originals keep their existing closed bytes. The same owner, full row and exact record must survive lookup before output; lost output grants no retry or admission authority. [Contract and DATA evidence](EXPIRED_FUNDING_HISTORY.md). Native durability, fresh-process recovery, Linux and physical release remain OPEN.
