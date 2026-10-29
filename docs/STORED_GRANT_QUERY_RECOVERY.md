# Read the original grant-query profile from existing custody

Source candidate for G2 original-payment recovery. Native SQL/TLS, fresh-process
reopen, physical release and Linux acceptance are not established.

The existing operator entry accepts an explicit stored-profile input:

```sh
node src/api-credit-cli.js --funding-grant-query-fd 3 --output-fd 6 --bootstrap-ms 1000
```

The canonical JSON input has exactly three fields:

- `originalGrantQueryVersion: 2`.
- `spendingFile`: the existing explicit spending-file profile, allowed root and
  file policy. Only `OPEN_EXISTING` with a supplied owner token and one selected
  recipient is admitted. The named four-table opener refuses older files; it
  does not create, discover, migrate or reset a file or owner.
- `expectedOriginal`: independently retained `paymentId`, `originalDigest`,
  `fundingResourceUrl`, `paymentHash`, `requestId`, `checkpointDigest`,
  `queryDigest` and `profileDigest`.

The version-two envelope is limited to 16384 UTF-8 bytes. `originalDigest`
and the domain-separated `queryDigest` use `sha256:` followed by 64 lowercase
hexadecimal characters. `checkpointDigest`, `profileDigest` and `paymentHash`
use 64 lowercase hexadecimal characters, matching the existing ready profile.
`profileDigest` is the SHA-256 of the **complete exact canonical ready-profile
version-one text**, retained independently before recovery. Its input includes
the existing proof, selected provider CA, route and transport budgets. It must
not be learned from the custody row being checked. The four original record
pins alone do not authenticate a replacement CA or new transport policy.

`api-credit-stored-grant-query-profile.js` captures the closed input before file
entry. `api-credit-stored-grant-query-owner.js` requests one named file owner,
checks its current state, reads one original record and checks the current
owner again. The actual record projection matches the four original pins.
The independently supplied full-profile hash must then match before the
retained ready profile can select transport configuration. The funding URL,
transaction, request, checkpoint/query digests and holder/network/asset/payee
are also rebound to the selected original expectations and spending policy.
The reader does not capture or call custody writers or signer methods.

Before returning a ready profile, the reader logically revokes and physically
closes that same known file owner, requiring fresh unheld REVOKED/CLOSED views
and synchronous receipts. The native binding imports and opens the existing
one-query HTTPS transport only after this sequence. It never opens payer V6,
creates a key/proof, evaluates the Zenon SDK, commits a checkpoint or dispatches
a payment. Version one still takes the ready profile directly and opens no
custody file. Both versions retain the existing result grammar and one-query
history-only authority.

An opaque or pending open, read, state check, revoke or close is not repaired
by a late result. The same uncertain frame remains HELD, with no competing
closer, reopen or query. The reader retains at most sixteen active/uncertain
file frames in a process. A known synchronous missing/malformed record may
close its known owner and refuse the query. Opening guards surround the
synchronous file protocol and later query admission; they cannot preempt a
blocked synchronous operation or provide an OS deadline/sandbox.

`RECORDED` and `NOT_RECORDED` remain historical results with authority `NONE`
and unchanged spending reservations. This read cannot settle an UNKNOWN,
release budget, activate a grant, run a service, compensate or authorize retry.
Cooperative same-epoch owner checks are not atomic cross-process fencing.

The local DATA entry exercises the actual profile/record codecs, file protocol,
query owner and CLI coordinator with declared memory file/transport/timer/FIFO
ports. It uses existing unauthenticated signature-shaped fields; no SQL,
socket/TLS, SDK/core package, keys, signatures, nonce search, PREPARE, payment
or native CLI runs. Source/parser checks cover the native mount separately.
The unchanged hosted 108-control CI profile does not include this new DATA
entry. G0-G5 retain their own acceptance gates.
