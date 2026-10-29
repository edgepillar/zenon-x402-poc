# Read-to-signer age admission

The current native API-credit source selects
`createSdk105AgeBoundSignerContextWalletOwner` with a fixed first-product
1000 ms read-to-signer admission budget and captured `hrtime.bigint` clock.
There is no public JSON clock, module, callback or budget override. Previous
generic wallet exports retain their existing contracts; the current application
selects the bounded lane rather than silently falling back to them.

The actual retained-candidate planner starts one monotonic window before its
last pre-sign account/balance/price read cycle. Read and validation latency,
context capture, intent persistence and returned-record decoding consume that
same window. Context binding checks it, signer intent entry checks it, and the
captured synchronous SDK signer has a final check after intent I/O. No await,
database/key callback or renewal occurs between that check and signer entry.
An exact deadline, clock regression, malformed clock result or clock loss
refuses admission. A second begin cannot reset or renew the original window.

This budget is a local admission constraint, not the Zenon quote TTL, Momentum
age, authenticated chain time or proof of a current price. Existing original
quote/horizon and post-sign/current-read checks remain selected. No extra RPC
cycle, quote, material request, nonce search, signature or replacement is added.
A synchronous callback or the SDK signer itself may exceed the budget after
entry: this check neither interrupts it nor promises an OS lifetime bound.

An expired pre-intent run leaves the spending reservation in place. Expiry or
clock uncertainty after a committed intent retains that exact intent/context
and refuses SDK entry; it never resets exposure or grants a second attempt.
After SDK entry the exact returned original result is still retained, even if
elapsed time later exceeds the limit. No renewal, re-sign or history-derived
action follows. Raw monotonic times are process-local and are not serialized
into a durable funding record or restored across a process restart.

The source profile records this 1000 ms choice explicitly. Current DATA controls
use declared clock/store/key-method/wire ports, fixed public bytes and invalid
signature-shaped data. Five compositions run the actual planner, context bridge
and wallet source with zero-difficulty supplied material. Each composition's
existing material-wait timer is started once and cleared before the final read.
No SDK package, SQL, socket, cryptographic signer, nonce search or real PREPARE
is executed. Current native latency feasibility, SQL durability, actual signer
loss, fresh-process recovery, external dispatch fencing, physical release and
Linux acceptance remain OPEN.
