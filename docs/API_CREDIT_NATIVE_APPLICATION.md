# API-credit native application binding candidate

The explicit buyer functions `openBuyerApiCreditCommandSession` and
`runBuyerApiCreditCommands` bind the 128-command entry to the actual existing-key
SDK wallet, native funding/service client, spending SQLite backend and dedicated
spending-file owner. The ordinary buyer argv/default path is unchanged. No
command can select a module, constructor, database factory or key loader.

This is a **source candidate**, not a supported product launch command or a
native acceptance result. The current user instruction disables native
execution. The complete selected graph is pinned in
`qualification/profiles/api-credit-application-source-v1.json`; native package
execution, actual SQLite/TLS, Linux qualification and the complete one-grant,
100-request product acceptance remain open.

## Explicit configuration

The buyer entry requires exactly `configuration`, `spendingFile`, `spending`,
`input`, `output` and `limits`. `configuration` is the existing closed native
funding/service configuration: existing empty V6 checkpoint, explicit read/work
and transport budgets, operator challenge validator, asset and existing KeyPair.
It creates no key or mnemonic and loads no secret from environment/command JSON.

`spendingFile` contains the explicit SQLite `storageProfile`, a separate existing
private `allowedRoot`, and `filePolicy` with:

- `expectedDevice`: canonical decimal filesystem device identity;
- `reservedBytes`: all other operator-declared pending allocations;
- `maxDatabaseBytes`: a multiple of 4,096, between 64 KiB and 4 MiB.

`storageProfile` uses the existing CREATE_NEW/OPEN_EXISTING policy and owner-token
contract. CREATE_NEW requires an empty dedicated directory and exclusive new
file creation. OPEN_EXISTING requires the selected file and never falls back to
creation. No directory is created and no old file, journal or failed initialization
is deleted or adopted. The two database roots must be separate, with neither
nested inside the other. The selected account must match the existing wallet
address and the selected asset must match the official client asset before any
key capability is entered. Accepted network, recipient and amount are still
checked by the actual spending/preparation binding before preparation.

`spending` contains only `paymentId` and a frozen `readDay` capability. This is an
operator capability, not a command-selected clock. Existing explicit original
bytes, independent pins, selected grant and each original service request/proof
remain required. The entry does not learn trust from displayed candidate pins.

## Ownership and failure order

The selector detaches nested trust/configuration DATA before deferred loading.
Only the pre-existing key and selected challenge/day capabilities remain opaque.
Owned CA copies survive until their actual opener settles; an outer opening
deadline does not clear a pending consumer's bytes. Borrowed CA/key material is
never cleared by the selector. A selection can enter the native binding once.

The command streams are reserved before native module loading. The actual
spending file/backend is opened before SDK-client loading and wallet acquisition;
the original opening guard is checked again before each later acquisition.
The actual native funding/service owner is then joined to the existing spending
lifecycle. A returned client/key follows its existing ownership contract. Until
the native client returns, key cleanup remains the original caller's duty.
Partial owners and stop receipts are retained privately; no second opener or
automatic retry resets an unknown acquisition.

Before every application operation, including service dispatch after SPENT,
the actual spending store rechecks the selected owner epoch/revision inside
its existing BEGIN IMMEDIATE transaction. File identity and connection views
are also current checks. An observed stale epoch or nonvoid ownership-check result refuses entry to
preparation, funding or service dispatch. The transaction is not held across
external work: a competing process can change ownership after this check.
These are cooperative preflight checks, not an atomic cross-process dispatch
lease. The complete OWNER-FENCING cutpoint/concurrency acceptance stays open.

At close, the existing client first revokes admission and records any active
UNKNOWN reservation. The spending backend is then logically revoked. Physical
database close is attempted only after the original client/wallet stop returns
undefined and its fresh view is closed and inactive. A failed/nonvoid stop,
still-open database, changed identity or uncertain current view latches HELD.
The original close promise is cached and no unknown close is retried.

The file owner uses a dedicated private directory, no symlink ancestors, exact
owner/device/inode checks, DELETE journal, FULL synchronous writes, memory temp
storage, foreign-key/check enforcement, zero SQLite busy wait and a bounded
page count. Admission requires 10 GiB free plus the declared reserves, two full
database allocations and 64 KiB journal allowance. Logical page/identity checks
are cooperative observations, not an OS quota, atomic path lease or independent
verification of the operator's global reservation ledger. The qualification
launcher separately verifies the actual managed-store ledger and volume identity.

`DatabaseSync.close()` wraps SQLite's close API and `isOpen` reports connection
state. A returned close and false `isOpen` are retained as observations; they do
not establish hardware durability, cross-process fencing or complete OS handle
release. See the [pinned Node 24.19.0 SQLite API](https://nodejs.org/download/release/v24.19.0/docs/api/sqlite.html#databaseclose).

## Qualification boundary

The component entry reuses the 17 command controls and adds file-profile,
selection-consumption, trust-copy and application-close controls. It includes
the existing one-grant/100-request/exact-replay in-memory credit model under the
new application owner, with a declared memory CAS/file capability. Native file,
SQLite, SDK, TLS and signer modules are never imported by those DATA controls.
Selected native sources receive parser checks only. No native execution,
signature, key generation, nonce search, socket or payment is performed.

The existing 108-control hosted CI lane is unchanged and separate. Its success
does not qualify this native graph. Completing the operator bootstrap/launch
command, source/package/runtime admission, real SDK/core/SQLite/HTTPS and Linux
100-call acceptance, restart/owner-fencing and resource-release matrix remains
required for G0/G1/G2 acceptance.
