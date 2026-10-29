# API credit failed-opening custody source contract

The native application previously raw-closed its budget file whenever a native
client facade had not returned. A rejected opener does not prove that its
partial client/store/wire owner stopped borrowing that file or its wallet.
The same issue applies to a wallet constructor entered without a returned
owner. G2 requires observed release or controlled HELD ownership.

## Actual source integration

`sdk105-native-api-credit-application.js` records wallet-constructor entry and
native-client-opener entry before invoking them. When neither an application
nor a client facade returned, its existing failure frame retains the actual
file, wallet, wire guard and new failure-custody owner. The native binding
supplies these fixed capabilities; operator JSON cannot choose cleanup code.
The original opening still fails and its module-private failed slot cannot
resume or reopen. Returned application/client owners keep their existing
joined cleanup paths.

The pure failure owner makes these distinctions:

| Failed stage | Budget file handling |
| --- | --- |
| Before any wallet or client borrower entered | Revoke once, require a clean REVOKED view, close once, verify the fresh closed-file view |
| A wallet returned, but native client entry never occurred | Revoke, request the wallet's cached stop, require void completion and its current clean CLOSED/clear-returned view before file close; recheck after close |
| A wallet constructor entered without returning its owner | Revoke new admission and retain the file as HELD; no physical close |
| A native client opener entered without returning its facade | Revoke new admission and retain file/wallet as HELD; no physical close or competing wallet stop from this layer |

The original caller's existing key lease retains its own stop responsibilities.
It can join the same wallet's cached close, without another raw-key clear by
this owner. A promise rejection, nonvoid return, malformed stop, changed view
or unknown revoke/close retains uncertainty. One known physical-close return
remains recorded even if its subsequent view is unknown; the owner is still
HELD and not reported released. No close retry, alternate file, new epoch,
takeover, payment, signing or dispatch is generated.

## Ownership and observation limits

One file claim caches one failure-custody observation. Repeating the exact
owner/entry tuple joins it; a different tuple cannot reset a conservative
decision. The owner is installed before invoking any declared port, so
reentrant joining cannot start another stop. Unknown frames stay privately
retained, with a bound of 16. The facade exposes only frozen inspection DATA
and no operations or cleanup capability.

Known late stop facts may become observable, but an earlier HELD decision never
becomes success and never enables a later file close. An awaited void result
and current views are cooperative evidence, not atomic exclusion or proof of
key erasure/physical resource release. The outer operator retains its existing
bootstrap and close observation budgets; this helper adds no timer or retry.

## Qualification boundary

The DATA entry executes the actual failure-custody owner with declared in-memory
file/wallet methods and native Promise ports. It covers unreturned borrowers,
ordered known-owner stops, rejection/nonvoid/unknown views, reentry and retained
late facts. These are not SDK keys or SQLite/native files.

The modified native application and updated catalog checker receive parser and
source-contract checks only. The new helper is also pinned in the RUN byte
catalog; the 404 package rows and nine bare-edge contracts are unchanged.
Native SDK/core/SQLite/HTTPS, real interruption/reopen/release, Linux and G1/G2
acceptance remain OPEN. The existing 108 hosted controls are a separate,
unchanged profile.
