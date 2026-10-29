# Durable original official funding outcome

This source prerequisite supports G2 original recovery. It does not complete
provider restart or native acceptance. The first SDK entry, each existing
continuation observation and the exact returned outcome have separate durable
records. Intake `BOUND`, official settlement, grant activation and service
delivery remain independent facts.

## Selected source path

The fixed issued-funding provider chooses
`createDurableOfficialFundingPostIntakeComposition`. This constructor requires
the explicit intake official-custody store profile before issuing a challenge
or constructing the SDK server. The legacy standalone composition and two-table
store constructors retain their contracts.

New files use `createZenonFundingIntakeOfficialCustodySqliteStore`; existing
files of that exact profile use `openZenonFundingIntakeOfficialCustodySqliteStore`.
The profile has application ID `0x5a464952` and exactly `intake_meta`,
`intake_challenges` and `intake_official_outcomes`. It uses 4096-byte pages and
a connection limit of 1024 pages. Existing profiles are identified and checked
before applying that connection limit. Old two-table files and foreign files
are refused without migration, rebinding or fallback. No operator is cut over.

The same borrowed intake connection supplies strict compare-and-swap and
readback. One selected challenge has at most one outcome row. The row retains
the original header bytes, issued frame, selected service, BOUND tuple,
transaction hash, fixed observation policy, consumed observation count and
complete official outcome. The record is canonical and at most 65536 UTF-8
bytes; the stored outcome is at most 32768 bytes. The store compares the full
decoded original payment with its previously authenticated publication record.
The pure codec performs no authentication or cryptographic signing.

## Ordering and uncertainty

1. Actual intake binding commits `BOUND` before any official SDK entry.
2. Strict CAS claims `FIRST_IN_FLIGHT` from an empty selected outcome row.
   The identical proposal from a stale second writer is not another claim.
3. Exact synchronous acknowledgement and same-row readback precede SDK entry.
4. The complete SDK outcome is persisted and read back before caching it for
   an HTTP response or exact replay. SDK calls are outside SQL transactions.
5. A pending continuation reserves `OBSERVATION_IN_FLIGHT` and increments the
   persisted count before calling its existing `resume()`. Its outcome follows
   the same acknowledgement/readback rule. The budget is never replenished.

Lost, malformed, asynchronous or changed custody replies keep the owner HELD.
It retains a proposed write or returned outcome without a replacement SDK call,
automatic replay, renewed observation budget or competing closer. Logical close
revokes the custody port; it never closes the borrowed SQL store. Native
physical release remains unqualified.

The exported record digest is an independent-pin candidate. A read projection
checks a separately retained digest before parsing, preserves in-flight states
and returns historical DATA with authority `NONE`. Even a recorded `SETTLED`
result grants no SDK entry, funding, observation, grant activation or service
dispatch authority. A checksum is not settlement authentication.

## Remaining acceptance

The fresh-provider BOUND fence remains in force. No restore constructor, live
continuation deserialization, fresh-process owner transfer or keyless provider
restart is implemented by this prerequisite. A process can stop after BOUND but
before the first intent; that is still an explicit recovery gap. Durable intent
prevents a lost SDK acknowledgement from being treated as permission to repeat.

Local DATA checks exercise the actual codec and custody owner with declared
memory CAS and SDK markers. Parser checks inspect the native source without
evaluating it. Actual SQLite durability/contention, SDK/core/HTTPS composition,
ACK-loss cutpoints, process reopen, stale workers, native release, Linux and
G1's 100-call product scenario remain OPEN. The unchanged hosted 108-control
profile does not execute this new native path. G0-G5 remain OPEN.
