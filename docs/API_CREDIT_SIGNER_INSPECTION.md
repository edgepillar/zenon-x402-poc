# Keyless original signer inspection

```sh
node src/api-credit-cli.js --signer-inspect-fd 3 --output-fd 6 --bootstrap-ms 1000
```

This SOURCE candidate uses the same CLI and fixed inspection pipe/coordinator
owner as funding/backend inspection. Supply two distinct, exclusive owned
POSIX FIFO ends. Input is one canonical JSON envelope, newline and EOF, at most
16384 UTF-8 bytes, depth 16 and 1024 nodes. All profiles require
`signerInspectionVersion`, `spendingFile` and `expectedOriginal`.

| Input version | Additional required fields | Existing file owner | Historical output |
| --- | --- | --- | --- |
| 1 | None | Three-table signer context | Version 1 |
| 2 | `uncertaintyAgeLimits` | Three-table signer context | Version 2 with age |
| 3 | `uncertaintyAgeLimits`, `spendingStoreProfile: "GRANT_RECOVERY_V1"` | Four-table current API-credit grant recovery | Version 2 with age |

Version 3 explicitly selects the current application's retained grant-query
schema. Versions 1 and 2 retain their previous schema selection. There is no
automatic schema discovery, retry through a different opener or missing-field
default. The version-two historical output grammar is unchanged: selecting the
current file format adds no result, signing, submission or release authority.

`spendingFile` is the existing explicit spending-file configuration: version 1
storage profile, OPEN_EXISTING mode, selected policy/account, database path,
independently retained owner token, private root/device and file/space bounds.
The first-product policy has one recipient. `expectedOriginal` contains the
independent paymentId, original-input digest and fundingResourceUrl. No owner
is discovered from the file; missing data cannot select create/adopt/migrate.
The selected opener validates the exact existing table profile. Old files and
exposed account ledgers are preserved, never reset to make inspection pass.
All profile, account, owner-token, device, root and capacity selections must
match the admitted input. The consumed profile can issue one fixed opener and
enter it once; profile release or opening expiry prevents acquisition.

The envelope and EOF pass DATA admission before the literal native file import.
No wallet, key, SDK package, signer, transport, quote, work or payment path is
selected. The actual file owner opens the existing private ledger and performs
one selected signer-record read under its current epoch/profile checks.
Versions 2 and 3 also bracket the same owner's spending-history loads with
current-owner guards and apply the selected uncertainty-age limit. They keep
UNKNOWN reservations unchanged, including after the escalation age. This
is not SQLite readOnly: normal opening PRAGMAs/transactions remain real local
operations. Neither physical checks nor owner tokens are an OS/same-user lease.

Output is one bounded JSON record on the owned output FIFO only:

- NOT_RECORDED: no signer record was observed, with no inferred signing right.
- INTENT_ONLY: original intent/hash is present; a missing signature is not
  invented or regenerated and the spending reservation is not released.
- SIGNED_DATA: exact retained originals deterministically encode the original
  funding checkpoint and its pins. No new block, quote, signature or authority.

SIGNED_DATA contains sensitive existing signed-payment material. Protect this
private result pipe and its recipient as carefully as the retained original;
it is never written to process stdout/stderr or environment. Strings are not
promised erased. Checkpoint/pins/hash/origin correspondence is DATA checking,
not signature authenticity, current pricing, inclusion, delivery or permission
to commit/resend funding. Every action/retry flag remains false.

Known file ownership is revoked once and physically stopped only after a void
revoke receipt and clean REVOKED view. A void physical-close receipt and fresh
CLOSED/database-not-open view precede output. An unreturned/malformed owner,
failed revoke or unknown close is retained without raw close, reopen or retry.
The shared startup budget includes EOF, inspection and output; expiry never
cancels native work or permits a late result to write/upgrade UNKNOWN. Channel
close has its own 1000 ms observation budget. These are not OS lifetime limits.

DATA controls declare file/clock/pipe ports. Native CLI/SQLite reads, real signer
loss, process restart, fencing, physical release and Linux remain unqualified.
The ordinary funding RUN and backend inspection modes retain their contracts.
