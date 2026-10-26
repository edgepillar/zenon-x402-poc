# Recovery connection close fences

Date: 2026-10-26. All 35 current shared-core component controls passed.

The existing custodied backend recovery connection now uses the SQL-free
[production recovery core](../src/service-credit-custodied-backend-recovery-core.js).
The [native bindings](../src/service-credit-custodied-backend-recovery-client.js)
retain their 15 public factories, four shared connection sites, actual payer/backend
construction, borrowed/owned stores and existing close lifecycle.

## Corrected transitions

A child capability can synchronously close the recovery connection before
returning. The connection now checks closure after its active-state snapshot
and first V6 checkpoint read, before entering a later recovery child.
A standalone checkpoint read also holds the same synchronous read lock and
checks closure before releasing its returned checkpoint.
Nested reads are refused BUSY without poisoning the outer connection.

The initial extracted production core preserved the original private connection
body exactly. Against that code, 31 controls passed and four new regression
controls failed. After the narrow fence changes, all 35 passed with zero failures,
skips, cancellations or todo. The failed baseline is retained.
This reproduced shared connection logic with declared child capabilities;
it did not reproduce or execute a native SQLite incident.

## Preserved recovery contract

A normal combined read still performs two fresh local state reads and, for V6,
two independent checkpoint reads. It compares complete original custody,
funding, uncertainty, dispatch-intent and optional response projections across
the exact backend query. Expectations are not learned from that query.
The existing exact selected-grant key and original eight request fields remain
bound to the caller's unchanged proof.

A cached backend success cannot clear local uncertainty or a dispatch intent.
It supplies no new payment, signing, replay, dispatch or delivery authority.
Only the pre-existing separately selected submit capability can enter its
captured child. Root close keeps the actual child's cached Promise identity;
the recovery reader never closes the borrowed backend store.

## Actual verification and limits

Main and development already carry different versions of the SQLite HTTP client.
Their five ordinary factory bodies selected by this recovery binding are identical.
Development additionally defines a separately selected native-close guard.
This patch preserves each branch's existing dependency blob and uses only the
ordinary V3-V6 factories. The new shared core's actual DATA dependencies match
both branches. This source compatibility review is not native execution proof.

The [actual local result](../qualification/backend-recovery-close-fences.actual-local-result.json)
binds the exact production core, native binding, fixture and explicit runner,
along with complete before/after exits and stream hashes.
The same 35 cases exercise matched V3/V5/V6 reads, independent pins, exact proof
forwarding, changed funding/original/uncertainty/response projections, retained
dispatch intent, active and reentrant reads, close Promise identity and all four
corrected boundaries.

One Node parser-only command passed for the changed native binding.
The 24-file literal relative import closure was inspected as source; it was not
evaluated. SQL/store acquisition and actual backend admission are not qualified
by fake child capabilities or by parsing.

The control imports the actual shared production core and actual DATA codecs.
It provides no SQL, SDK, socket, keys, signatures, work search or native aliases.
It creates no managed task, test database, source tree copy or package copy.
No throughput, heap or durable-recovery improvement is claimed.
The existing 108-case hosted profile stays unchanged and does not execute these
35 local controls.

The separately approved V6 clean native selection retains all 123 of its exact
source rows. Its unconsumed allowance and storage refusal are separate from this
component change. Default buyer transition, full native interruption/lost-ACK/
HELD-store recovery, physical durability and economic acceptance remain open.
