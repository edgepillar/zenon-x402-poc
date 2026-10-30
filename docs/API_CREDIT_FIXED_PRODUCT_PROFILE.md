# Fixed API-credit product entry

The named `runBuyerApiCreditProductCommands` entry in `src/buyer-cli.js` selects
one operator-supplied funding challenge, one provider origin, network, asset and
recipient. It uses the actual existing native API-credit command/application
owners. The generic API-credit component and legacy argv behavior remain
separate. This is an implemented source entry, not an accepted native launch.

The product selection requires exactly `productProfileVersion: 2`, the external
original `paymentRequiredHeader`, canonical `purchaseExpectationJson`,
`configuration`, `spendingFile` and `spending`.
The command entry additionally requires the existing `input`, `output` and
`limits` ports. The service configuration supplies only `assetInfo`,
`contextLimit`, `transportOptions` and `deadlineMs`; its challenge validator is
fixed by this binding, never supplied by the profile or command stream.

The original header must pass the existing bounded wire codec, contain one
active upfront offer and match the fixed funding resource. Its network, asset,
single recipient and amount must fit the existing persistent spending policy.
The local custody/start limits must accommodate 100 distinct service requests
and one exact replay. This is a correctness scenario, not a capacity guarantee.
The fixed operator bootstrap also rejects command/line/input/output budgets
provably too small for the 106-command scenario before credential acquisition.
These codec-derived byte floors are necessary bounds and do not guarantee that
larger real packets fit. Configured limits and ordinary runtime refusals remain.
The selected challenge is detached. Its semantic fields are rechecked by the
fixed official-client callback, and preparation must retain the exact original
header bytes. A coherent different offer is rejected before the application
enters its spending reservation, read/material work or signer. Handoff also
requires the same header; actual original/pin/grant checks remain with the
existing lifecycle and V6 owners.

The caller supplies an exclusive already-existing SDK key handle and frozen
day reader through the existing configuration protocol. This source adds no
secret loading, key construction, environment defaults, caller-selected module,
client/store factory or automatic pin adoption. The [operator CLI source candidate](API_CREDIT_OPERATOR_CLI.md) supplies the
keyless bootstrap and separate existing-key credential channel. Accepted native
startup, Linux execution and physical key/resource release remain open.

One-use product capture feeds the existing one-use native selection. That
selection still rechecks key method shape and the original CA digests before
budget-file/wallet acquisition. The product gate does not create another
signer, reservation journal, funding attempt or retry state. Every result,
UNKNOWN/HELD outcome and close promise remains owned by the original
application. Physical file release follows its existing close chain.

These are declared local offer/trust inputs. Equality and schema checks do not
authenticate a provider, running chain, genesis, finality, grant or delivery.
G3 trust acceptance is required before any actual network run. The complete
SDK/core/SQLite/HTTPS application, Linux, fresh-process reopen, signer loss,
atomic cross-process owner fencing and physical release remain unqualified.
Current user instructions disable native execution. DATA application ports are
declared in memory; native source receives parser checks only. The separate
required 108-control CI workflow is unchanged.

## Explicit purchase expectation

Before credentials or funding, the fixed buyer compares independently operator-selected public terms with the existing provider funding commitment. `purchaseExpectationJson` is at most 16384 UTF-30 bytes of canonical JSON, with exactly `purchaseExpectationVersion: 1`, `offer`, `selection`, `terms` and `authorityProfile`. The existing closed fixed-funding and provider-authority metadata contracts define all nested fields. Copying an untrusted challenge into the expectation and accepting it automatically does not establish approved terms.

`offer` requires the model/provider/service/resource identities, resource binding, offer identity/version, cost-policy identity and funding-policy identity/version. `selection` requires the same offer identity/version, holder and capability commitment. `terms` requires the funding-policy identity/version, total units, absolute expiry and complete active upfront requirement: exact amount, asset, payee, network, timeout, chain identifier/genesis and minimum confirmations. `authorityProfile` requires profile identity/version, verifier version, authority-record digest, matching network/chain and explicit confirmation policy. The [synthetic fixture and independent hash vector](../qualification/api-credit-purchase-expectation.fixture.mjs) show the exact shape without authentic provider, credential or payment data.

The buyer uses the existing fixed-term validator and provider commitment calculation for public metadata only. Its temporary policy callback is not returned, retained, supplied to an owner/store or used for activation. The complete declared requirement and issued resource tags must match the original header. Missing/changed economics, generic untagged headers, duplicate/noncanonical JSON, inconsistent fields and old versions refuse. The header is never rewritten. At least 100 declared units are necessary for the fixed correctness scenario; this does not authenticate the cost policy or promise 100 delivered calls.

No price, lifetime or confirmation default, clock read or expiry refresh is added. An expired-but-equal absolute timestamp can pass metadata comparison; existing issuance/owner clock rules still decide eligibility. Equality authenticates neither provider/policy/chain nor funding/grant/delivery. Selecting coherent new terms is a new operator choice, not permission to replace retained payment bytes. Both product and operator bootstrap require version 2 with the same immutable expectation string; version 1 refuses without migration. The fixed native command binding forwards it unchanged. Generic non-product entries retain their contracts. No expectation table, durable expectation recovery or new grant authority is introduced. Existing original-header preparation/handoff and checkpoint recovery remain; native/restart acceptance stays OPEN.

## Purchased grant handoff

The fixed source product additionally requires the purchase holder to equal the selected existing payer identity before credentials. Its service CA must fit the existing ready-query limit of 8192 base64 characters. The native product captures that same CA and the existing service deadline as immutable lookup policy; it supplies no caller-selected query module, store opener, key or transport factory.

At commit, the already-created ready version-one grant-query profile must match the captured purchase offer/version, holder, capability and funding commitment, the same independently pinned original checkpoint, the selected CA and the existing service deadline for request plus close. Refusal occurs before retaining the query, committing the checkpoint or sending funding. No grant ID is guessed at that stage. Proof bytes remain externally supplied DATA; the product creates no proof or signature.

After BOUND funding, explicit handoff validates its original bytes/pins/header and selected grant before claiming one lookup. The fixed native binding reuses the existing original-grant query owner with the ready profile and the same borrowed spending-file guard. This query opens no second local payer or spending store. It runs outside synchronous custody transactions. The query must return its existing closed-owner observation before the wrapper rereads the same custody record and delegates to the original child handoff. The child must return the same selected grant. The external command grammar and 106-command scenario are unchanged; the lookup is one internal GET in explicit handoff.

The historical result must identify the exact retained original/query and the explicit grant, offer, holder, capability, purchased total units and absolute expiry. NOT_RECORDED, EXPIRED, REVOKED, conflicts or UNKNOWN withhold handoff. ACTIVE is only a historical necessary condition: current service grant/capability/expiry/budget checks remain required. Equality or funding ACK supplies no new grant, payment, signing, dispatch or delivery authority. Late verified funding retains its original obligation even when service handoff cannot proceed; no compensation, refund or second payout is inferred.

Pending/opaque/unknown query ownership keeps the application HELD and blocks a competing child/file close. A returned invalid text receipt is a known synchronous return; after known query closure the existing child may be stopped once, while the semantic conflict and final verdict remain HELD. A throwing/unreturned custody receipt remains unknown and blocks that stop. Reentry and late results cannot repair HELD, restart lookup, resend funding or renew economics. These are cooperative source observations, not atomic process fencing, an OS deadline or physical-release proof. Native/Linux/100-call/reopen acceptance remains OPEN.
