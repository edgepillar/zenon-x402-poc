# Funding response-loss V7 source candidate

V7 corrects the qualification fixture and result decoder after the
[V6 failed native attempt](P1_FUNDING_BOUND_RESPONSE_LOSS_NATIVE_V6.md).
That attempt expected four total commands while observing three. The selected
branch issues exactly prepare, commit and submitFunding. It never sends the
input close command; the session close method does not add a command or result.

The V7 case, decoder and selected ceilings consistently require three command
lines and three result lines. Namespace/profile identifiers select the new
candidate explicitly. The selection still contains 135 application files;
its case and preload are the two changed qualification rows. Every application
runtime row and all 404 installed-package rows are preserved. No wallet, store,
transport or application method is replaced.
The old V6 files, failed attempt, stream captures and allowance remain preserved.

The [local result](../qualification/sdk105-issued-command-application-v7.source.actual-local-result.json)
records 23 source/declared-transcript controls and two JavaScript syntax checks.
The controls refuse the previous four-command/four-result interpretation and
retain exact original, HELD, unknown-outcome, no-second-payment/grant and physical
release boundaries. Declared decoder input is not an actual application result.
Syntax checks do not evaluate the JavaScript modules.

A separate read-only preparation checked existing runtime/package bytes, the
canonical profile and capacity. It opened no task and ran no SDK, SQL engine,
key/signature operation, socket or work search. The installed Node 24.19.0 binary
was selected explicitly; no download or dependency installation occurred.

Candidate implementation files are on the development branch:
`qualification/sdk105-issued-command-application-v7.case.mjs`,
`qualification/sdk105-issued-command-application-v7.preload.mjs`,
`qualification/run-sdk105-issued-command-application-v7.local.py`,
`qualification/sdk105-issued-command-application-v7.inputs.json`, and
`qualification/issued-funding-loss-v7-source.control.py`.

Native V7 execution remains a separately authorized, finite step. The earlier V6
failure is not converted into success. Full funding response-loss acceptance,
same-original process recovery and physical resource release remain open.
