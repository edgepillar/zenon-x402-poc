# Service rejection stays uncertain through command and recovery ownership

The actual SDK105 funding/service lifecycle now latches HELD when an entered
asynchronous service receipt rejects. Previously only synchronous service
failure and malformed completion latched that state. An async rejection left
the wrapper open, so a caller could enter a second declared service callback.
The baseline reproduced two callback entries after the first response failed.
The current owner admits one, refuses the second and keeps its original close
receipt rejected even when its known child later closes.

The wrapper cannot establish whether an entered rejection happened before
dispatch, after a durable attempt, or after response loss. It grants no retry,
new request, signing, replacement or resend authority. Synchronous admission
checks which reject before the service delegate remain unconsumed. Existing
late successful void completion during explicit close keeps its previous
cleanup semantics; it still cannot return application success through close.
Both actual stop legs are attempted independently. HELD is not proof of a leaked
native handle, and a declared child close is not physical native qualification.

## Current command-to-recovery controls

Ten focused cases execute the actual Node channel, original funding commands,
SDK105 wallet/lifecycle owner, command host and recovery code. They cover:

- Async service rejection, rejection during close, harmless pre-service refusal,
  malformed completion and preserved late void-close behavior.
- A declared unknown funding result which stops queued handoff/service commands.
- A service rejection and lost local command-output acknowledgement, with no
  execution of the queued second service command.
- Explicit close during a pending service operation; late completion leaves the
  already returned unknown host observation unchanged.
- Recovery of the exact original checkpoint and request using independent pins.
  A declared backend CACHED_SUCCESS assertion still leaves local reconciliation
  required and grants no dispatch, payment or signing authority.

Every case retains the same packet and signed-original hash, with one declared
signing callback, one key-clear callback and one funding call. Native, key and
store callbacks and the shared durable record are explicitly DECLARED. The
recovery case is a same-process DATA/ownership composition, not a real database
reopen, restart, process interruption or independent storage durability proof.
The output-loss case loses the local command write acknowledgement; it is not
native HTTPS response-loss qualification.

The [actual local result](../qualification/sdk105-command-uncertainty.actual-local-result.json)
records all ten focused cases plus 124 shared command/lifecycle cases, 41
funding-opening cases and 22 local selection cases: 197 current controls in
about 5.65 seconds. Only source-affected profiles were rerun. Unchanged recovery
and pipe evidence remains bound to its original inputs. No installed SDK/x402/
Noble package, SQLite, socket, generated key, cryptographic signature, nonce
search, managed scratch or native application ran. The hosted 108-control
profile is unchanged and does not include these 197 controls.

## Remaining native application work

The V1 and V2 native candidate files and old reports are preserved. V2's frozen
manifest correctly refuses the changed shared lifecycle before native entry;
its old source-only admission is not current-head evidence. A distinct current
candidate must include this source and the real pending-remains-pending and
native HTTPS response-loss scenarios before new native qualification. Its finite
authority and capacity admission remain separate. No old permission is reused.

The default buyer, current workflow, storage roots/policies and original payment
bytes are unchanged. Full current HTTPS/x402/SQLite composition, interruption/
HELD-store recovery, native resource release, service delivery, economic pilot
and production remain open acceptance gates.
