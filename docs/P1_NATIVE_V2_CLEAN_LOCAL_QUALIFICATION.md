# P1 native V2 clean qualification - 2026-10-27

One newly authorized **P1 clean native case passed**, with no skips or automatic
retry. The exact [actual local result](../qualification/sdk105-issued-command-application-v4.clean.actual-local-result.json)
records real existing SDK 1.0.5, official core 2.23.0, SQLite and loopback HTTPS
composition using synthetic keys, signatures, provider envelopes and chain data.
This closes the current clean selection only. Default activation and production
acceptance remain open.

## Bound implementation and observed behavior

The selected [V2 application](https://github.com/edgepillar/zenon-x402-poc/blob/89527b462783df9fe8f17353d601d6367063a755/src/x402-official-issued-funding-post-native-application-v2.js)
uses the exact funding response writer qualified by the preceding 32 DATA cases.
Funding keeps `Vary: PAYMENT-SIGNATURE`; the client retains its strict metadata
check. The separately versioned V4 entry selects V2 while all original command
and assertion logic is unchanged. It uses the already tested canonical file-URL
producer rather than relaxing the native preloader.

Before case imports, the native namespace verified 135 application files and 404
installed package files (539 total) and admitted all nine selected bare edges.
The selection manifest SHA-256 is
`49cf7277935972adc4a24a0ac5f4a8e178b36427d3cc8c15204aa7036b8c08c2`;
the result binds the complete source-row digest and the exact V2/writer hashes.
133 application blobs match runtime base `89527b46`; two versioned entry/preload
files complete this selection. The V4 case, preload, controller and manifest are
on `x402/p1-router-late-pending-close-integration-v2`.

The actual case completed eight owned stream commands and seven results. One
funding POST reached `FUNDING_INTAKE_BOUND`. The same original settlement was
observed locally through PENDING and SETTLED without a replacement transaction.
The signed original and independent pins were retained through the same V6 file.
The existing owned SDK key closed before funding-to-service handoff.

Two service requests completed. An exact backend replay returned the cached
result without another execution, and a foreign grant was refused. The case
observed one verification, one first settlement, two pending observations, three
authenticated raw-client starts and three clean raw-client closes. Its nonce
reservation was 20,689 candidates including fixed verification reservations,
within the unchanged 65,536 aggregate ceiling; each search window remains bounded
by 4,096 candidates. This is not a throughput measurement.

## Preservation and remaining gates

The Node command and test-TLS command both exited zero, with complete captures;
Node stderr was empty. The owned task closed SUCCESS and the application,
command host, session, channel and current logical owners reported CLOSED.
Five new SQLite files and two independent pin files remain retained. The storage
manager correctly held unregistered child output. No post-trial SQLite engine
was opened and no file was adopted for cleanup.

The [earlier V3 failure](../qualification/sdk105-issued-command-application-v3.clean.actual-local-failure.json)
remains unchanged. The passed V2 case does not rewrite its UNKNOWN outcome or
replay its failed fixture. V1, default buyer paths and historical qualification
records are preserved. Source-only comments in the pinned V2 implementation
predate this run; the actual result here supplies its narrow runtime evidence.

Main has a different runtime graph, including six differing application files
and missing tested runtime modules. This publication carries evidence and the
roadmap update on main; it does not transfer or activate that graph. Native V2
runtime adoption requires its own complete diff/dependency review and appropriate
qualification. The unchanged hosted 108-control profile does not run this native
case, and green CI is not a broader native result.

Next: qualify the separate permanent-pending and response-loss selections,
then bind the corrected V2/canonical producer into the P2 interruption/recovery
selection before any newly scoped native trial. The two pending observations in
clean do not qualify permanent pending. Physical store release, HELD/nonclosing
socket handling, authenticated provider/runtime acceptance, fixed-economics pilot
and sustained native capacity remain open. No further native scope is inferred
from this single clean result.
