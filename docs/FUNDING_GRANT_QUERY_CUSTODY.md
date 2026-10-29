# Original grant-query custody before funding dispatch

The fixed API-credit product source now retains the complete original-grant
read profile before committing or sending the original funding transaction.
This is source/DATA evidence. Actual SQL, SDK, signing, HTTPS, reopen, physical
release and Linux product acceptance remain OPEN.

The command sequence remains prepare, commit, submitFunding, handoff and
metered service calls. The product's commit input now contains exactly:

```text
expectedPins: independently retained original checkpoint pins
originalGrantQueryProfile: canonical existing --funding-grant-query-fd input
```

The profile contains the original checkpoint, the retained fourteen-field
funding selection, the exact query digest and an already-created read proof.
The product generates no proof or key. Preparation returns candidate original
bytes; those candidates do not become independent trust pins. An external
holder must supply the selected pins and existing proof before commit. A bad
profile is refused before the write is claimed. The ordinary funding/recovery
command codecs remain closed to the new field. The API-credit codec carries
it only on commit; legacy component clients can still decode their old input,
while the fixed native product requires the custody profile.

`api-credit-funding-grant-recovery-record.js` compares this profile with the
exact original checkpoint deterministically projected from the same retained
SIGNED signer-context record and spending reservation. It preserves the
profile bytes and binds payment ID, original digest, transaction hash,
checkpoint digest and query digest. Signature-shaped fields are DATA here;
only the eventual provider verifier authenticates a read proof. This codec
does not authenticate chain state, funding or a service grant.

The source native product selects one four-table spending-file profile: the
two budget tables, existing signer-context table and a bounded write-once
`original_spending_grant_query_v1` table. It uses the same connection and
owner epoch. Every custody operation validates reservation and signer history
inside the existing transaction; no network, signer or external callback is
inside SQL. One insert and exact readback precede local payer checkpoint commit.
A SPENT transition in this profile requires the retained query record. Each
record is limited to 131072 bytes; its profile is limited to 65536 bytes and
the selected file/record/free-space limits still apply.

The new named opener refuses existing two/three-table files rather than
migrating, resetting or adopting them. Those older opener contracts remain
available. The fixed product selects the four-table owner before wallet entry;
the separate non-product component binding keeps its prior file profile. No
existing file, operator configuration, running listener or automation is changed.

`api-credit-funding-grant-recovery-application.js` checks the selected owner
before and after custody operations, matches the exact persisted readback, and
only then delegates to the original child commit. Before first funding submit
it reads that same record again and checks the owner again. These cooperative
checks do not replace the existing native wire-owner guard or prove atomic
cross-process fencing. A missing, changed, stale, lost, pending or opaque
receipt prevents child entry and latches HELD. A lost retention acknowledgement
may leave a stored profile; it never permits a second insert, commit or send.
Funding response loss retains the same profile and one original submission.
Later callbacks and clean-looking closes cannot repair HELD. Close delegates
once to the original application's owners only after known synchronous custody
has returned. Reentrant close waits for that return. An opaque/pending custody
borrower keeps the whole application HELD without a competing parent close; a
late result cannot repair that verdict. The wrapper never physically closes a
borrowed database or starts a competing cleanup.

The keyless projection requires independent payment/original/checkpoint/query
pins and returns the exact existing profile. It grants no sign, funding send,
service dispatch or activation authority and leaves spending reservations
unchanged. The same query flag now accepts an explicit version-two stored
profile with a separately retained full-profile hash; its source binding reads
only the named existing four-table owner, revokes/closes it and then enters the
existing one-query owner. The ready version-one path remains unchanged. See
[stored query recovery](STORED_GRANT_QUERY_RECOVERY.md). This mount is source
integration, with no native SQL/HTTPS execution.
Fresh-process SQL and funding-ACK-loss recovery are not established by a memory
port test or parser check.

Local qualification composes the actual record/projection, checkpoint/query
codecs, command codec and application controller with declared memory,
file-owner and client ports. No SDK/core package, SQL, socket/TLS, key/signature,
nonce search, PREPARE, actual funding or pilot is executed. The hosted required
108-control profile remains separate from these DATA controls. G0-G5 remain
open until their own source/runtime-bound acceptance evidence exists.
