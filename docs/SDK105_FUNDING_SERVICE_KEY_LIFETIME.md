# SDK105 key lifetime across funding and service

Date: 2026-10-27. All 21 current builtin component controls passed.

The new lifecycle connects the existing SDK105 wallet owner to the actual
funding/service client's public operations. The preparation's original packet
is retained. Handoff validates the caller's exact original bytes, independent
pins, original challenge and explicit grant before consuming a handoff attempt
or requesting key cleanup. It checks the retained hash, signature and public
bytes against the wallet owner's observed signed DATA.

The key's captured clear method must return and its current owner view must be
clean before the child can acquire or restore its service client. The same view
is checked again after handoff and before service admission. Clearing the key
does not re-sign, replace, re-encode or replay the funding payment. The existing
native client retains its genuine funding native/store-close checks, same-file
V6 reopen, exact original restoration and selected-grant/service admission.

Malformed originals, pins, challenge or grant are refused before key cleanup
and do not consume the handoff. Key cleanup failure blocks service acquisition.
Outer close still requests the key stop and client stop independently. It waits
for the original pending operation and both undefined/current-clean close
receipts. Reentry sees the cached close Promise; clear is never retried.
An unknown handoff or close stays HELD after late completions. A later observed
view drift cannot undo a previously returned close; the historical receipt is
retained separately. Close receipts do not prove settlement or memory erasure.

The SOURCE-ONLY native entry openSdk105NativeFundingServiceClient hardwires the
existing real native funding/service client, the SDK105 synchronous wallet
owner and this lifecycle. Configuration replaces the borrowed wallet with an
existing exclusive KeyPair and expectedAddress. Expected public bytes come only
from the captured material selection. No supplied client, wallet, store, SDK or
transport factory is accepted. No new mnemonic, KeyStore or key is created.

Successful construction transfers the existing key's cleanup duty. Before the
actual native client returns, its original construction close/quarantine rules
apply and the caller retains the key cleanup duty. If it returns but the outer
join fails, both owners and actual stop receipts are retained privately, both
stops are attempted independently and that failed acquisition is never reset
because of a late completion. These failure paths are source-reviewed only.

## Actual verification and limits

The [source-bound local result](../qualification/sdk105-funding-service-lifecycle.actual-local-result.json)
pins the 30-file builtin component closure, exact cases, actual exits and stream
hashes. Tests execute the actual SDK105 owner, unsigned-hash/signed-DATA assembly,
original checkpoint codec, external handoff capture and new lifecycle. Native
client capabilities are declared callbacks; fixed public bytes and deliberately
invalid signature bytes are used. Fake clear changes only fixture public DATA.

The cases cover valid original retention and clear-before-handoff ordering,
wrong independent originals/pins/challenge/grant, unknown intake, independent
stop failures, close during signing/preparation/handoff, late child acquisition,
single clear/cached close, same originals after handoff, service admission and
post-close view drift. Coherent foreign hash and signature packets are rejected
even when their own checkpoint and independent pins agree. They cannot be
substituted for this wallet owner's actual returned DATA.

The earlier 20-case result is preserved. The added provenance case exercises
both foreign-hash and foreign-signature variants; all 21 current cases pass.
No SDK/Noble/x402 package, real key/private material, cryptographic signature,
SQLite file, socket, positive-work/nonce search or native application is run.
There is no source-tree/package copy, managed task or Node child.

The new native entry passes one parser-only command. Its 90-file relative
source closure is reviewed without evaluation. Main receives five new builtin
component/test/runner/evidence paths; the SDK/SQLite/native entry is published
only on development. Existing native files and all 123 application sources in
the separately approved V6 selection remain byte-identical. Its different
one-shot native allowance is unconsumed.

The existing 108-case hosted profile does not run these 21 local cases and is
unchanged. Ordinary buyer/default and Phase2C cutover, real SDK/cryptographic
interoperability, native key/native/store close, durable pin retention,
interruption recovery, grant activation, service delivery and economic
acceptance remain unqualified.
