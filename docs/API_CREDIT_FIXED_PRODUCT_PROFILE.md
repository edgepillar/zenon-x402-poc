# Fixed API-credit product entry

The named `runBuyerApiCreditProductCommands` entry in `src/buyer-cli.js` selects
one operator-supplied funding challenge, one provider origin, network, asset and
recipient. It uses the actual existing native API-credit command/application
owners. The generic API-credit component and legacy argv behavior remain
separate. This is an implemented source entry, not an accepted native launch.

The product selection requires exactly `productProfileVersion: 1`, an external
original `paymentRequiredHeader`, `configuration`, `spendingFile` and `spending`.
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
