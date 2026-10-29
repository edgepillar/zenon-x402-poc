# Funding history before a grant is known

The source candidate adds one mode to the existing operator CLI:

```text
node src/api-credit-cli.js --funding-inspect-fd 3 --output-fd 6 --bootstrap-ms 1000
```

After a lost funding response the operator may have the original payment but
no grant ID or service capability. Existing service/result inspection requires
both. This new mode reads only the already-existing V6 payer funding record.
It never asks for a grant, service proof, wallet, signer, backend, network
transport or new payment. The runtime/plain-process admission is unchanged.

## Independent input and bounded output

The two distinct exclusive FIFO ends use the same operator ownership contract
as the other inspection modes. Supply one canonical JSON frame followed by EOF:

- `fundingInspectionVersion: 1`.
- `originalPayment`: exact `resourceUrl`, `serializedCheckpoint` and independently
  retained `expectedPins` with their existing `binding`/`digests` fields.
- `payerOptions`: one `databasePath`, its private `allowedRoot`, and the existing
  `custodyPolicy`. The existing file must be a direct child of that root.

The frame is at most 65536 bytes. The existing POST checkpoint codec admits
the fixed original challenge/payload/resource before any native store import.
There is no default profile, pin learned from the database, callback/module
selector, migration, file/directory creation or fallback to a different store.

The private result FIFO receives at most 65536 bytes. It can include the exact
already-retained signed checkpoint, so protect it as private original-payment
DATA. Input/output strings cannot be reliably erased. The source CLI prints
only sanitized terminal status to stderr, not these private bytes.

## One existing owner and four reads

The fixed native binding uses `openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6`
and captured prototype methods. This is not an SQLite readOnly opening: normal
existing-V6 validation and owner-epoch acquisition remain real local writes.
Those native operations have not executed under this qualification.

The actual pure owner reads the checkpoint with independent pins, reads funding
state twice, then reads the checkpoint with the same pins again. Resource,
challenge/payment headers, status, revision, ambiguity and complete canonical
checkpoint bytes must agree. This is a bounded cooperative observation, not an
atomic multi-query snapshot or independent chain/provider authentication.
There is no `recoverAfterRestart`, resend, signing, grant or spending mutation.

Before returning a result, the owner requests exactly one close of its known
quiescent store. A void close and fresh closed/inactive/non-quarantined native
lifecycle view are required. Unreturned opens, unjoined read promises, active
or unknown owners, nonvoid closes and failed close views retain controlled
uncertainty. No competing raw close or close retry is generated. The outer
coordinator still includes input EOF, inspection and result write in its one
observation budget; it does not cancel a native call or force resource release.

## Historical facts grant no new authority

The result reports `ABSENT` or the recorded local `PREPARED`, `ATTEMPT_FENCED`,
`OUTCOME_UNKNOWN`, `BOUND`, `PAYMENT_REJECTED` or `PAYMENT_CONFLICT` status.
`ATTEMPT_FENCED` is not normalized into another persisted record. An absent
record produces no manufactured stored checkpoint.

Every result keeps reconciliation required, the spending reservation unchanged,
and payment/signing/funding-submit/service-dispatch/grant activation disabled.
A local BOUND row is not current provider funding status, chain inclusion,
finality, grant validity, delivered service, permission to resend or a release
of UNKNOWN exposure. This mode does not recover a lost provider grant or its
delivery-liability record. Those parts of RL-FUNDING-ACK remain separate.

## Qualification boundary

DATA controls execute the actual argument/profile codecs, funding owner and
coordinator using declared store/lifecycle/channel/clock ports and synthetic
original transaction-field DATA. They do not use real keys or signatures.
Native wrapper, CLI, launcher, SQLite lifecycle method and catalog checker
receive source/parser checks only. Native SQL, owner epochs, physical release,
fresh-process recovery, SDK/core/HTTPS and Linux acceptance remain OPEN.
The unchanged 108 hosted controls are separate from these local controls.
