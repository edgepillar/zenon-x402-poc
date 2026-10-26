# Prepared-hash WalletAdapter

Date: 2026-10-26. All 32 current local component controls passed with a declared
KeyPair callback and deliberately invalid constant signature bytes.

The existing [WalletAdapter entry](../src/zenon/wallet-adapter.js) now exports
createPreparedHashWalletAdapter. It adds a concrete sign-only bridge for the
wallet slot already consumed by the DP candidate preparer, while preserving the
abstract class and assertWalletAdapter bodies exactly.

The bridge borrows a previously authorized KeyPair-compatible owner.
Configuration is exactly {keyPair, expectedAddress, expectedPublicKey}.
Its captured getAddress method is synchronous and returns either the address
text or an Address-like value with a data toString method. Its captured sign
method accepts a 32-byte hash Buffer and returns a native Promise for a 64-byte
Buffer or Uint8Array. This is an explicit owner protocol; the local component
result does not qualify an actual SDK KeyPair implementation.

## Preparation and ownership

getAddress returns the independently selected payer only after comparing the
borrowed owner's current address. A sign call admits at most one original:

1. Detach the closed unsigned UserSend DTO and recompute its actual 306-byte
   hash encoding through the existing repository validator.
2. Require its address and publicKey to match the independent selection, and
   derive the same user-address core from those public bytes.
3. Recheck the borrowed owner's address before entering its sign method.
4. Pass only the original 32-byte hash, with no template, planner, chain
   connection, quote request or composite SDK preparation.
5. Detach exactly 64 returned bytes and add their canonical Base64 signature
   to the frozen original DTO, preserving every other field.

Malformed originals are terminal before signer entry. Once the signer is
entered, throws, rejection, unsafe results or changed hash bytes remain
SIGNING_OUTCOME_UNKNOWN. Inspection retains the detached original; a supported
success also retains its exact signed DATA. Reentrant and concurrent second sign
calls cannot overwrite the original operation's state.

The adapter neither creates nor clears a private key. Its independent key owner
retains consent, uncertain-signing reconciliation and key cleanup duties.
A pending signer keeps this attempt pending. There is no replacement, retry,
reset, cancellation or superficial deadline; constructing another adapter
does not renew signing authority. A private copy of the public hash is cleared
after observed completion, which does not prove key release, GC or native drain.

## DP integration boundary

The returned frozen object satisfies the existing WalletAdapter interface and
can supply the wallet option of the current candidate preparer. It does not
invoke the legacy signed-composite preparation operation.

The actual existing unsigned hash validator and funding DATA/checkpoint codecs
are used in the local controls. A composition case takes the adapter's unchanged
block through funding payload assembly and restores the exact original encoded
payment with independent checkpoint pins. This demonstrates DATA compatibility,
not real signature validity, current-price acceptance or database custody.

The existing DP quote/work/current-read validators, real cryptographic payment
preflight, independent durable pin retention and actual V6 atomic custody must
still precede transport. The bridge does not verify a signature, nonce proof,
price, chain state, funding, grant or service delivery. The ordinary buyer and
the separately gated Phase 2C/default cutover remain unchanged. This implements
the sign-only connection point; it does not complete that cutover.

## Actual verification

The [local result](../qualification/prepared-hash-wallet-adapter.actual-local-result.json)
pins the current interface, implementation, 32-case fixture, explicit runner
and complete 24-file literal source import closure. Cases cover exact hash and
field preservation, owner identity drift, malformed input, proxies/accessors,
pending and synchronous reentry, unknown results and original checkpoint DATA.

The first command passed 31 controls and failed one fixture assertion: native
Promise.resolve in the declared owner necessarily reads then before the adapter
sees fulfillment. The corrected fixture counts that lookup separately and
requires zero other proxy accesses. The implementation did not change between
the two commands. The first result and original fixture are retained. The
current command passed all 32 with no failures, skips, cancellations or todo.

One Node 24.19.0 process runs the explicit selection, with zero Node children,
no package installation, source copies or managed task. There is no SDK
execution, real key, cryptographic signing/verification, SQL, socket, nonce
search or native funding application. Hash computations and constant public
DATA are not a real wallet/SDK qualification or a positive-PoW run.

The existing 108-case hosted profile and the separately approved V6 native
selection's 123 source rows remain unchanged. That hosted profile does not run
these 32 new local controls; the unconsumed native allowance is not reused here.
Full native interruption/lost-ACK/HELD recovery and economic acceptance remain
separate unfinished roadmap work.
