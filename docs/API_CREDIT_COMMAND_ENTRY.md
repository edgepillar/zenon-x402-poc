# Bounded API-credit command entry

The opt-in API-credit command entry admits the funding, handoff and request
commands needed for the roadmap's 100-request correctness scenario. The
original funding entry defaults to 16 commands and accepts at most 64; that
cannot carry 100 service requests. Recovery retains its separate closed
operation sets and its original command limits.

The new programmatic entry is
`openBuyerApiCreditFundingOwnedStreamSession` in
`src/buyer-funding-owned-stream-session.js`. It defaults to 128 commands and
refuses larger counts. Its configuration has the same `input`, `output`,
`limits`, frozen `openClient` binding and optional `openWaitMs` as the original
owned-stream entry. The trusted application supplies that fixed binding; the
command JSON cannot select an opener, module, wallet or store. The application
must supply the intended fresh spending-bounded lifecycle and its explicit
network, asset, recipient and budget policy. This command entry does not create
that policy or authenticate a caller-supplied client.

The opener reserves the streams before invoking the binding, checks the same
fresh-owner conditions and uses the existing opening deadline, late-owner stop,
quarantine and whole-close rules. `runBuyerOriginalCommandHost(session)` accepts
the resulting `FUNDING_API_CREDIT` mode. Its cached run/close observations remain
historical status DATA, with no delivery or cleanup authority.

The lower-level opt-in factories are `captureBuyerApiCreditCommandLimits`,
`createBuyerApiCreditCommandLineChannel` and
`createBuyerApiCreditFundingCommandSession`. Select all three together if
assembling them directly. Supplying a 128-command limit to an original entry
is refused; no limit value implicitly switches modes.

## Command and resource bounds

The command operation, canonical JSON, independent original/pin requirements
and callback-result codecs are unchanged. One preparation, commit, funding
submission and handoff, followed by 100 distinct service requests, one exact
replay and explicit close, consume **106 commands**. Command IDs are unique
even when the service request ID deliberately repeats for exact replay.

Every command, including `inspect` and `close`, counts against the selected
limit. A command beyond that limit is refused before decoding or child
admission. Duplicate IDs cannot reenter an operation. The same stream byte
budgets apply: 256 KiB maximum line, 1 MiB default aggregate input/output and
2 MiB maximum aggregate input/output. The default close wait remains 250 ms
with a 1,000 ms maximum. The larger command budget raises none of these bounds
and introduces no concurrency, retry, re-signing or automatic funding.

## Evidence and remaining acceptance

`qualification/api-credit-command.behavior.mjs` uses the actual command channel,
session, host, spending-bounded pure SDK lifecycle, original codecs and
`InMemoryServiceCreditModel`. Native client/wallet children and the spending
CAS port are explicitly declared test capabilities. The service model receives
a declared mock activation record; its grant is not a verified consequence of
a chain observation. Fixed invalid signature-shaped DTO bytes are DATA only.

The 100-request control checks one declared funding submission, one model grant,
100 debits/executions and one replay with no second debit/execution. Model-state
rehydration checks retained counters and cached results in memory. Additional
controls cover limits, legacy modes, opening ownership, UNKNOWN funding,
foreign grants, changed request bodies, duplicate command IDs and output loss.

This is a source/component step toward G1. It is not the roadmap's supported
product launch command, real SDK/core/SQLite/HTTPS integration, a fresh-process
reopen, Linux qualification, provider authorization, live funding or a capacity
measurement. Those gates remain open. The native-execution refusal is unchanged.
The existing hosted 108-control CI profile is separate from this local DATA
entry and has not been widened.
