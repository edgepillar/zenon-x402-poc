# V7 funding response-loss: native case and retained report defect

The single authorized V7 native application test completed with Node exit 0 and
TAP 1/1 passing. Its original qualification decoder rejected the output with
`NO_SECOND_ECONOMIC_OPERATION`: measured command/result counters are 3/3, while
two literal summary fields still report 4/4. The original task remains
CLOSED / FAILURE and its rejected qualification record is preserved.

The [native observation](../qualification/sdk105-issued-command-application-v7.funding-response-loss.actual-local-result.json)
retains both the native program result and qualification rejection. The measured
funding flow retained the exact original after a matching intake BOUND and one
known response-socket stop. The client remained OUTCOME_UNKNOWN / HELD. There
was one original signed transaction, one funding POST, no grant, no service
request/execution and no forced close/reopen of borrowed stores. Chain callbacks
were synthetic declarations; real payment and production were not exercised.

The [read-only capture audit](../qualification/issued-funding-loss-v7-retained-capture-audit.actual-local-result.json)
checked the retained, digest-pinned output and eleven actual-capture/declared
refusal controls. It uses measured counters while retaining the raw 4/4 fields
as an explicit defect. It verifies the remaining original custody, no-second
operation, HELD and unknown-outcome conditions. It does not change the original
decoder, native source, raw transcript or failed task. It ran no new SDK, SQLite,
key/signature, socket or nonce operation and does not issue new authority.

The unapplied emitter patch replaces the two literal summary fields with the
actual counters. It is a source correction for a future source-bound candidate,
not a retroactive modification of the executed V7 source. The scoped native
allowance is consumed. No repeat native payment fixture was run to repair report
metadata; the completed capture was reused through its verified CAS reference.

Application close reported CLOSED; the client command session remained HELD with
client close UNKNOWN and channel close CLOSED. Physical release remains
NOT_QUALIFIED. Fresh-process recovery and backend wire replay were not executed.
Full P1 response-loss/reopen acceptance, later economic acceptance and production
readiness remain open. The source-only V7 result and the post-run audit have their
own narrower scopes.
