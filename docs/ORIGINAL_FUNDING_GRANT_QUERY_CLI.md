# Original-funding grant history from the operator entry

Source candidate, G2 funding ACK-loss recovery. Native acceptance is OPEN.

```sh
node src/api-credit-cli.js --funding-grant-query-fd 3 --output-fd 6 --bootstrap-ms 1000
```

This explicit mode uses two distinct owned POSIX FIFO ends. The input is one
canonical JSON envelope followed by EOF. It is admitted under the existing
Node 24.19.0/plain-process profile before the fixed native query module is
imported. It accepts no key descriptor, generated key, signer, SDK selector, service
command or payment signature operation. The explicit version-two input selects
only the existing custody file described below. Existing modes,
including the separate local `--funding-inspect-fd` V6 history read, retain their
contracts. Version one opens no store. Version two reads only the explicitly selected
four-table spending custody file and observes its close before HTTPS admission;
it opens no payer V6 or provider store. Neither version proves an earlier owner
closed or permits a reservation release.

The ready-profile version-one input has exactly these fields:

- `originalGrantQueryVersion: 1`.
- `originalPayment`: the retained `resourceUrl`, `serializedCheckpoint` and
  independently retained `expectedPins` used by the funding-history mode.
- `originalFunding`: all 14 independently retained original-funding identity
  fields from the [history API](ORIGINAL_FUNDING_GRANT_LOOKUP.md).
- `query`: `requestId`, an existing capability `proof` for the dedicated read
  namespace, and its independently retained `expectedQueryDigest`.
- `transport`: the selected provider CA in canonical `caBase64`,
  `requestDeadlineMs`, `handshakeDeadlineMs` and `closeGraceMs`.

The checkpoint codec checks the original bytes and all supplied independent
pins. The existing funding POST checkpoint capture checks the resource and
canonical challenge/payment headers without entering a reader. The query
identity must match the original transaction hash, network, chain profile,
asset, amount, payee, holder, resource/requirement/intent digests and the funding
commitment in the resource tags. The transaction intent data must also match.
The retained query digest covers the full query, including offer and capability
selection. These DATA comparisons do not authenticate a transaction, chain,
proof or externally retained pin. The provider still verifies the actual
capability proof before an exact store read. Missing selection/proof material
requires reconciliation; the CLI does not reconstruct or sign it.

The holder owner claims one transport, performs one read and requests its one
cached close after a known read settlement. Its bounded observation includes
construction, read and close. A pending or opaque read keeps its ownership; a
timeout neither creates a competing closer nor admits a late result. A clean
result requires the transport's actual five-field CLOSED receipt and fresh
closed, unheld, zero-count snapshots before and after timer cancellation. An
old void/boolean close return is refused. Rejection, stale state, unknown
constructor/close outcome or timer failure stays HELD. Up to 64 uncertain owner
frames are retained in the process; they are not retried or silently discarded.

Only after query closure can the coordinator write at most 8192 bytes to the
result FIFO, then observe the existing channel close. Results bind the same
funding URL, transaction, request, checkpoint digest and full query digest.
`RECORDED` and `NOT_RECORDED` are historical observations. Both keep
reconciliation required and the spending reservation unchanged; neither
authorizes payment, signing, activation, dispatch, delivery, compensation or
retry. A local close observation is not OS physical-release acceptance.

## Existing custody input

The same flag accepts `originalGrantQueryVersion: 2`, an explicit existing
`spendingFile` profile and eight `expectedOriginal` fields, including an
independently retained SHA-256 of the complete ready-profile text. The record
cannot select its own trusted CA, origin or budgets. One known custody owner
must close before the unchanged one-query transport can open. An unobservable
file operation stays HELD without a competing closer or query. See the
[stored-profile contract](STORED_GRANT_QUERY_RECOVERY.md) for the exact shape,
limits, independent trust inputs and refusal semantics.

## Current evidence boundary

DATA controls use the actual checkpoint/wire/profile codecs, owner and CLI
coordinator with declared transport, clock, timer and FIFO ports. They execute
no native CLI, socket/TLS, SQL, SDK/core package, key/signature, nonce search,
PREPARE, payment or pilot. Native bindings receive source and parser checks.
The [shared issued-provider root](ISSUED_FUNDING_GRANT_PROVIDER.md) now
mounts the query alongside funding/service in source. No active provider or held
listener is replaced. End-to-end ACK loss, fresh-process
reopen, real proof/TLS composition, native release, Linux installation and the
G1 100-call product scenario still require their own acceptance. G0-G5 remain
open. Prior native evidence keeps its original source/runtime binding.

## Independently purchased original recovery: version three

The same `--funding-grant-query-fd` entry accepts explicit `originalGrantQueryVersion: 3`. Its canonical envelope has `spendingFile`, `expectedOriginal`, `originalPayment` and `purchaseExpectationJson`. The original payment contains `resourceUrl`, `serializedCheckpoint` and independent `expectedPins`; retain these outside the row being read. Purchase JSON uses the existing fixed-product contract. The version-three envelope is at most 32768 UTF-8 bytes; generic stored version two keeps its existing 16384-byte bound and ready version one keeps its contract. No implicit upgrade or missing-field default exists.

The decoder compares purchase terms with the exact original funding challenge, independently pinned payment/checkpoint digests and selected spending account before any opener. The same existing four-table spending owner is then selected with OPEN_EXISTING and its existing owner token, free-space floor and file policy. The selection is claimed before opening callbacks, so reentry cannot borrow it twice. The independently retained full ready-profile digest still binds CA, origin, proof and deadlines before row-supplied transport data is used. Purchase comparison cannot replace that digest.

The retained ready profile must match the same exact original bytes/pins, offer/version, holder, capability and funding commitment. The known original file must revoke and close under its existing protocol before the one existing query transport opens. The query must observe its existing close contract before output is compared with the independent purchase. A recorded grant must retain the exact purchased total units and absolute expiry. There is no clock default, expiry refresh, schema change, store migration, new signer/proof, payment or automatic retry.

ACTIVE, EXPIRED and REVOKED records remain historical observations with the original balances. NOT_RECORDED remains absence, with reconciliation required. Expiry does not erase this history or authorize a replacement funding action. Delivery liability is still NOT_QUERIED, grant authority NOT_REVALIDATED and the spending reservation UNCHANGED. No result authorizes service dispatch, payment, signing, activation, compensation or payout. The existing closed output schema and redaction remain unchanged.

This is reviewed source and declared memory DATA. SQL/file open and close, real proof authentication, HTTPS, process reopening, physical release and Linux acceptance are not established. Native execution remains disabled.
