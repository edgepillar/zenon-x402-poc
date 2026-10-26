# SDK1.0.5 owned wallet and funding close

Date: 2026-10-27. All 27 current builtin component controls passed.

The pinned SDK1.0.5 source has a different result protocol from the earlier
generic KeyPair bridge: KeyPair.sign synchronously delegates to Crypto.sign,
which returns a Buffer. The generic prepared-hash adapter intentionally requires
a native Promise. Passing a raw SDK1.0.5 KeyPair directly could therefore create
a signature and then refuse its unsupported result.

The new [SDK105 wallet owner](../src/zenon/sdk105-prepared-hash-wallet-owner.js)
copies synchronous signature bytes into its own bounded Buffer before native
Promise resolution. It does not read an SDK result's then getter or assimilate
a Promise/thenable. The generic adapter and its original-field/hash checks stay
unchanged. Seven existing package sources, matching exact recorded SDK1.0.5
hashes, were inspected as text; no package was installed or evaluated.

## Existing-key ownership

Configuration is exactly {keyPair, expectedAddress, expectedPublicKey}.
The existing KeyPair must be exclusively transferred; callers must stop using
aliases. No mnemonic, seed, KeyStore, key derivation or private-key getter is
used. Constructor checks capture methods without entering any key operation.
The owner checks copied public bytes before address/sign entry and passes only
the original unsigned block's exact 32-byte hash to the synchronous callback.

One sign attempt is allowed. Close blocks new operations immediately, joins the
actual generic-adapter operation and invokes the captured clear method once.
Close reentry from signing or address access cannot clear an active callback.
A signed result observed after close remains inspectable, while the pending
public operation refuses to release it as a new prepared candidate.

A returned clear receipt does not upgrade unknown signing or permit another
attempt. A clear throw/non-undefined result remains HELD and is not retried.
An unsupported async, proxy or unobservable SDK result also holds the key:
it is not awaited or assumed to have stopped using private bytes. A descriptor-safe
native Promise rejection is observed only to prevent a later unhandled Node
error; its completion never joins or releases the held key. Arbitrary thenables
and proxies remain untouched.
CLEAR_RETURNED records only the method's undefined completion. It proves
neither private-memory erasure, GC, native resource release nor funding outcome.

## Funding owner

The [funding coordinator](../src/zenon/sdk105-original-funding-owner.js) owns the
actual funding owner and SDK105 wallet owner together. It returns the existing
child prepare/commit/submit Promises unchanged. Its cached close first revokes
admission, requests both stops independently and requires both undefined
completions. A failure in one stop cannot suppress the other. A pre-existing
HELD outcome cannot become clean because later close receipts succeed.

On the development branch x402/p1-router-late-pending-close-integration-v2,
createZenonDynamicPlasmaBoundedSdk105OriginalFundingSubmission now hardwires this
wallet owner, the actual bounded material producer, actual retained context-v7
preparer/preflight/V6 funding owner and the close coordinator. Existing generic
and legacy factory bodies are preserved exactly. Independent pins, explicit
prepare/commit/submit and original-payment-only recovery remain in place.
There is no fallback to legacy preparation after a failure.

The enclosing native constructor transfers the existing store and KeyPair only
on success. If it fails, the caller retains both close/quarantine duties; an
existing local store-object claim may already be consumed. Construction invokes
no address, signing or clear callback and creates no key.

That changed SDK/SQLite native entry remains SOURCE AND PARSER ONLY on the
development branch. One parser-only command passed; its 61-file relative source
closure was retained without evaluating it or loading SDK/Noble dependencies.
The unchanged native root reuses that completed parser receipt. The final
61-file source closure differs only in the new wallet owner, whose current
syntax and behavior ran in the 27 component controls.
Main receives only the six new builtin component/fixture/runner/evidence paths
and preserves its existing native binding.

## Verification

The [actual local result](../qualification/sdk105-owned-wallet-funding.actual-local-result.json)
pins the 44-file component import closure, SDK source facts, selected 27 cases,
actual exits and stream hashes. A synchronous SDK-shaped double reproduces the
old direct-protocol refusal and exercises the named owner with one callback.
The added regression first reproduced an unhandled late native rejection:
27 cases ran with 26 passes and one failure. After the narrow rejection observer
fix, all 27 pass; both the failed receipt and the earlier 26-case success are
preserved. The fix retains HELD and never clears or retries the unknown signer.
Other controls cover copied signature bytes, public identity drift, close/sign/
address/clear reentry, unknown results, exact close-Promise identity, independent
stop failures, retained original DATA and sticky HELD outcomes.

Two controls run the actual six-cycle DP preparer with the new owner and
declared synchronous byte callbacks. The two allowed price advances retain the
same encoded checkpoint; sixth-cycle refusal stays refused after key cleanup.
Material is a fixed zero-difficulty nonce and signatures are deliberately invalid
constant DATA. Fake clear changes only fixture public bytes.

No actual SDK, real key/private material, cryptographic signature, SQL, socket,
positive-work search or native funding application is executed. No package/source
tree copy, database, managed task or Node child is created. Source inspection
establishes the method protocol, not actual SDK/cryptographic interoperability,
ordinary installation, real key erasure or full native custody/recovery.

The existing 108-case hosted selection remains unchanged and does not execute
these 27 local controls. All 123 sources in the separately approved V6 selection
remain unchanged and its allowance is unconsumed. The ordinary buyer/Phase 2C
cutover, native SDK/signature/V6/transport qualification, interruption/lost-ACK/
HELD recovery and economic acceptance remain unfinished.
