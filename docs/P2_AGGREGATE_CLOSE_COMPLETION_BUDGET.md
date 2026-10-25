# P2 whole-close completion budget

Status: actual component PASS, 24/24. The modified native application is
SOURCE REVIEW + SYNTAX CHECK ONLY, not full native integration qualification.

## Source gap and actual change

The default-off native funding/service client's close path bounded observation
only when an application operation was active. That operation could settle
while funding or service close remained pending; with no active operation,
there was no outer observation budget for the whole close join. This was a
source finding, not a reproduced native-client hang.

The development source now selects
`createServiceCreditBoundedCloseCompletion`. Its reservation is inert and is
created during validated configuration, before native/store construction. The
public close arms it before both independent stop attempts, whether or not an
operation is active. The unchanged bound is the minimum of the two configured
deadlines and 1,000 ms. It is not renewed for each child.

Original-operation settlement remains value/reason-opaque. Funding close,
service close, late service acquisition, pending operations and the existing
current funding/file/store conditions must all join that same budget. Only
then does the owner offer its one completion signal. The owner checks its
current funding and service-close views again after the bounded observer fulfills and before
releasing its application slot. The slot is retained on UNKNOWN.

This replaces the old operation-only observation, rather than adding an
independent polling loop or timer to each child. It does not change stop order,
single-owner claims, same-file checks, original signed bytes/hash, selected
grant admission, payment defaults or recovery/retry policy.

## Actual component evidence

The [source-bound local record](../qualification/bounded-close-completion.actual-local-result.json)
records 24 passed cases, zero failed/cancelled/skipped/todo, actual exit 0,
complete bounded UTF-8/TAP captures, empty stderr, and exact before/after
source/runtime identities. The component command completed in about 0.49 s;
this is command duration, not native close latency or a throughput measurement.

Cases cover inert reservation/cached inspection, exact input grammar, cached
start and completion, the whole-close deadline without an active operation,
pending funding/service facts, permanent expiry, independent observers,
descriptor drift without getters, and actual funding-close component
composition. Three actual funding-close lifecycles use declared zero resource
counts and synthetic local-material release callbacks. No real store callback
is entered. A late UNKNOWN after an offered completion explicitly demonstrates
why the owner's post-await guard remains necessary.

The changed native-client file separately passed `node --check` with exit 0
and empty captures. Its SDK, x402, SQLite and native transport dependencies were
not imported or executed. Source ordering checks establish where the new
observer is selected; they are not an executed application trace.

## Resource and acceptance boundaries

One cached pending signal feeds the existing bounded drain helper. There is
at most one observation start and one completion probe per component;
inspection does not read a clock or start I/O. No download, installation,
source copy, archive, qualification scratch, new managed task/root or old
native allowance was used. The 274 other previously protected source inputs
remain unchanged. Historical native recipes/results were not rebound.

The bound is cooperative: synchronous trusted callbacks can block the event
loop, and timer delivery can be late. It supplies neither OS cancellation nor
native physical-drain evidence. UNKNOWN is permanent; a late result cannot
authorize repair, reopening, re-signing, replacement, replay or another payment.

## Publication split and next gate

Main receives only the independently executed observer, its test/result and
this document. The changed `src/zenon/dynamic-plasma-native-funding-service-client.js`
wiring is development-only. Main's component result must not be described as
a main native-client fix or a complete P1/P2 integration pass.

The automatic 27-control Ubuntu/Node 24.19.0 profile, packages, workflow and
default payment path are unchanged. Its intended-head result is separate from
these 24 local cases. Current-source full SDK/HTTPS/V6 custody, lost-ACK/crash,
HELD-store/reopen and economic/pilot acceptance remain open.
