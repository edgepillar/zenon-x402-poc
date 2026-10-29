# Current-owner check before signer entry

The selected age-bound context wallet requires a captured frozen `assertCurrent`
method from its signer-custody backend. The actual context-v2 file owner exposes
its existing method on that backend. It loads the same selected budget state
under the existing owner token/profile/epoch and physical file guards. It does
not acquire, discover or transfer an owner, create a file or reset exposure.
Public product JSON cannot select a guard, opener, callback or module.

One check occurs after the complete original intent has returned and decoded.
The same age window is checked before entering it, so an already expired intent
does not initiate another blocking owner lookup.
It must synchronously return undefined. A throw or any other return, including
a Promise/thenable, is not a valid current-owner receipt. Supported native
Promise rejections are observed without awaiting or permitting a later upgrade.
Unknown values and outcomes are retained without retry or competing cleanup.

After the check, close/hold/intrinsic/hash consistency is rechecked. The same
1000 ms monotonic read-to-signer window is checked last, so guard latency cannot
renew or extend it. There is no await, DB/key callback or renewal between that
final time check and the captured synchronous SDK signer entry. SDK entry is
outside both the intent and current-owner-check transactions.

Known stale/closed/unknown ownership before signer entry retains the original
reservation and intent, with zero signer calls and no second economic attempt.
After signer entry the original signature/result remains with its original
owner. If subsequent result persistence loses ownership or fails, it cannot
grant replacement signing, discard the retained original or manufacture a
successful durable acknowledgement. Close/reentry cannot rerun the owner check.

The check is a point-in-time observation. Another process can change state
after it returns; a same-user alias or hostile process is not fenced by it.
Its returned receipt and inspection metadata grant no action authority. This
does not establish atomic cross-process external dispatch fencing, cancel an
entered signer or prove physical/OS resource release. Those G2 requirements
remain OPEN, together with native SQL/SDK cutpoints, fresh-process recovery,
actual signer loss and Linux acceptance.

DATA controls use the actual wallet/planner source with declared guard, clock,
store, key-method and wire ports. Fixtures contain fixed public bytes and
invalid signature-shaped DATA. The file-owner integration is source/parser
checked only; no SQLite, SDK package, cryptographic signer, socket, nonce search
or real PREPARE is executed. Legacy wallet constructors retain their previous
contracts; the actual API-credit entry selects the mandatory-guard bounded lane.
