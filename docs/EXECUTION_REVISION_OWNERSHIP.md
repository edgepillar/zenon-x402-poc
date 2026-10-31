# Execution runtime revision ownership

[36 new DATA cases passed](../qualification/execution-revision-owner.actual-local-result.json) over declared synchronous memory CAS ports. Another 1,813 retain exact source/runtime matches, for 1,849 distinct source-bound DATA controls. Four parser checks passed; 49 current source files have exact parser proofs. The actual SQL claim, native execution-owner binding, competing processes, Linux and physical release are NOT_ESTABLISHED. G0-G5 acceptance remains OPEN.

The existing durable runtime reads a fresh revision before each request. A CAS
protects one transition; that fact alone does not establish runtime ownership.
This candidate keeps the runtime's own revision instead of treating every fresh
snapshot as renewed ownership. Native behavior remains unqualified.

Construction remains inert. The first initialized execution snapshot performs
one strict `claimDurableExecutionOwnership` CAS and exact readback. The existing
compound row advances by one revision while retaining the exact ledger and
execution state. No credit, request, generation, policy, schema or table changes.
The pure claim selector used by the SQL transaction supplies the same objects;
an uninitialized execution contract is not initialized by this operation.

After the claim, only exact APPLIED acknowledgements advance the runtime's
owned revision. UNCHANGED preserves it. STALE, a foreign snapshot, malformed
receipt, lost acknowledgement or unknown write error retires the controller
into HELD. It cannot adopt the observed winner, reclaim or automatically retry.
The existing store's CAS still compares the expected revision inside its
transaction. A known unchanged business refusal keeps its original error only
after confirming that the owned revision remains current.

Normal writes reuse that atomic CAS and do not add full snapshot reads before
and after every write. Read-only request lookup is checked on both sides. The
fixed native owner additionally checks its revision immediately before entering
the application callback. This reduces redundant metadata reads without using
a newer revision to repair ambiguity. It is not a measured latency claim.

The claim and controller return no reusable invocation capability. Existing
PREPARED/MAY_HAVE_STARTED transitions, deadlines, UNKNOWN reservations, terminal
results and ledger rules still decide the original operation. A new controller
does not cancel an already-started external effect or authorize a second one.
In-flight work remains uncertain until the existing recovery protocol resolves
it. Funding/signing ownership and the two-store provider lifetime are separate.

This barrier applies to runtimes using this exact fixed revision protocol.
It does not prevent an unguarded legacy client or an independent database writer
from using the underlying store. Deployment must pin the supported source graph
and exclude such writers; coexistence with older binaries is not qualified.
Native cross-process and full OWNER_FENCING acceptance remain OPEN.

The DATA entry uses the actual revision controller and pure SQL claim selector
with declared synchronous memory CAS ports. Credit-model composition uses the
real in-memory ledger. Neither supplies actual SQLite or native-owner evidence.
Those bindings require separate native qualification. The approved hosted
108-control profile and its 22 inputs remain unchanged; new local cases are
outside that hosted selection. No installation, SDK, socket, signature, nonce,
actual PREPARE, payment, native reopening or process interruption is authorized
by this source candidate.
