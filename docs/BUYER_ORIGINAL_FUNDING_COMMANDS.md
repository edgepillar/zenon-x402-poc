# Explicit original funding buyer commands

Date: 2026-10-27. The owned-stream entry passed 17 fresh builtin controls. Prior
62 pipe controls and 124 component/four pipe controls were reused only after
their exact 45 and 48 source/control inputs respectively remained unchanged.
The native SDK105 command host is SOURCE ONLY and available on development.
The ordinary buyer/default and Phase2C routes remain unchanged.

The command session connects explicit operator commands to the existing SDK105
funding/service client's real public API. The development-only named export
openBuyerOriginalFundingCommandSession in src/buyer-cli.js lazily opens the
hardwired native host. It accepts an existing closed SDK105 configuration and
exclusive Node byte streams; it creates no key, KeyStore, mnemonic or supplied
SDK/client/store factory.

A host that already owns those resources can select the entry explicitly:

    const session = await openBuyerOriginalFundingCommandSession({
      configuration: existingSdk105Configuration,
      input: ownedCommandInput,
      output: ownedResultOutput,
      limits: { maxCommands: 16, closeWaitMs: 250 },
    });
    await session.run();

This is an opt-in programmatic CLI host, not a new standalone shell wallet mode.
It never borrows global process stdio implicitly. Its current native SDK, store,
HTTPS and real-key composition has not been executed by these component cases.

## Command protocol

Each command is one canonical UTF-8 JSON object followed by LF:

    { version: 1, id: 'unique-id', operation: 'prepare', input: originalInput }

Use encodeBuyerOriginalFundingCommand from src/buyer-original-funding-command.js
to serialize the envelope and append LF. Object key order and escaping are
canonical; duplicate keys, noncanonical encodings, malformed UTF-8, lone
surrogates, accessors, proxies and truncated final records are refused.
The id must be unique within the session and contain 1-64 permitted ASCII
letters/digits or . _ : - characters, starting with a letter or digit.

| operation | Explicit input | Existing client operation |
| --- | --- | --- |
| prepare | Original funding preparation DATA | prepareOriginalFunding |
| commit | expectedPins | commitOriginalFunding |
| submitFunding | expectedPins supplied again | submitOriginalFunding |
| handoff | originalPayment, selectedGrantId, paymentRequiredHeader | handoffToService |
| submitService | grantId, requestId, originalRequestJson, originalBodyBase64, serviceResourceUrl, authorizationHeader | submitOriginal |
| inspect | Empty object | Bounded local session/client/channel view |
| close | Empty object | Revoke command admission and join both owners |

Preparation returns the exact serialized checkpoint, original challenge and
candidatePins. Candidate pins are displayed DATA, not independent approval.
The session never learns trust from that output or feeds candidate pins into
commit, funding submission or handoff. Each of those steps requires a new
explicit command. The underlying real owner remains responsible for validating
the supplied original bytes, independent pins, grant and original service request.

The outer command codec detaches ordinary plain DATA records, as required by
the actual native input codecs. Original checkpoint/request/header/body strings
are retained exactly; only the outer command envelope is canonicalized.

Service completion is the real Promise<void> contract. Its response says
callbackCompleted and serviceDelivery NOT_ESTABLISHED. A manufactured service
result record cannot become a success or settlement receipt. Unknown funding
intake is returned as unknown and latches HELD; subsequent commands cannot turn
it into service admission or another payment.

A close command is terminal and emits no wire success receipt. EOF is accepted
only between complete records and also requests close. The host must observe
the actual run/close Promise. A malformed command terminates the session with a
sanitized failure and resource stop requests; private diagnostics are not copied
to the output stream.

## Resource ownership, limits and uncertainty

One actual Node Readable and Writable are owned exclusively. A second channel
cannot acquire either reserved stream. Existing data/readable consumers and
newListener setup hooks are refused before acquisition. A listener setup failure
after acquisition privately retains the owners and requests both stops. At most
16 failed construction holds are retained per process before new admission stops.

Input starts paused. The next command is not admitted until the preceding
write callback and any required drain event have been observed. The source
follows the selected [Node 24.19 stream write contract](https://nodejs.org/download/release/v24.19.0/docs/api/stream.html#writablewritechunk-encoding-callback).
A callback means local handling, not acknowledgement by a peer or delivery of
the paid service.

Defaults are 16 commands, 256 KiB per line, 1 MiB total input and 1 MiB total
output. Line/aggregate byte caps and command limits are explicit and bounded.
The cooperative whole-close observation budget defaults to 250 ms and is limited
to 1-1000 ms. These controls are not OS, CPU, network or aggregate-memory sandboxes.

Close revokes admission before callbacks, requests client and channel stops
independently, and joins the command work body, actual stop receipts, stream
close events and the original pending write callback. Stream close events alone
cannot erase that callback. Expiry, failed resource views or uncertain output
remain HELD after late completion; an earlier fulfilled close receipt is never
rewritten when a later view drifts.

The exact last returned result line is retained before its write is attempted.
session.retainedResult() retrieves that immutable in-memory DATA with the local
write-callback status and remoteReceipt NOT_ESTABLISHED. It never writes again,
re-signs, re-submits, reconstructs a payment or proves durable recovery.
A write/read failure can preserve an original result while leaving its external
receipt unknown. The actual client retains its original funding state.

The native opener first validates the closed existing-key configuration without
entering a key method. It then uses the actual owned-stream entry to reserve the
channel synchronously, before SDK module loading or native client opening. This
closes the earlier race between inert stream validation and channel construction
after an awaited OPEN: a concurrent/reentrant invocation cannot start a second
native/key acquisition against the same streams. Inert validation still leaves
unacquired streams caller-owned; a partial constructor retains its own quarantine.

The fixed native binding supplies one internal opening capability, never a
factory selected by argv, command DATA or the public native configuration. After
OPEN returns, the entry requires a pristine SDK105 lifecycle, a currently open
owned channel and no active/prepared/funded/handoff state before constructing the
actual command session. The existing named export and configuration shape stay
unchanged. The ordinary/default buyer is not selected by this entry.

On opening rejection or later setup refusal, the entry retains the original
opening and known stop receipts, starts one cooperative cleanup observation,
requests returned-client and channel stops independently, and rechecks current
views after the final await. A throwing, pending or rejected client stop cannot
suppress the channel stop. Late clean callbacks never rewrite the rejection or
request another close. A constructor which returned no channel owns any partial
quarantine; this entry never raw-destroys uncertain streams to compete with it.

Before the real native client returns, its original construction quarantine and
caller existing-key cleanup contract remain in force. This entry never clears
an unreturned key or treats a still-pending opening as key-release evidence.
Native opening itself can remain pending: this change does not add early key
cancellation or alter its custody contract. Cleanup observation establishes
neither actual key erasure nor physical native resource release.

## Verification and remaining gates

The [current owned-entry result](../qualification/buyer-funding-owned-stream-session.actual-local-result.json)
records 17 selected cases, one shared-process Node 24.19.0 command, actual exit,
separate stdout/stderr digests and source pins. All passed in about 0.72 seconds.
It exercises actual Node memory streams, exclusive channel construction,
SDK105 pure wallet/lifecycle owners, command session and host with declared
native/key callbacks and fixed invalid signature DATA. The positive sequence
constructs its expected original packet/pins BEFORE opening or reading any
preparation result, then explicitly prepares, commits, submits funding, hands
off and invokes one original service callback. It does not authenticate real
external pins or perform cryptographic signing, SQL, TLS, network or payment.

The cases also cover preparation-only EOF, concurrent/reentrant same-stream
acquisition, rejected/throwing OPEN, inert thenable/Promise-constructor refusal,
bad session setup, stale prepared client, channel loss during OPEN, rejected or
pending client close, late output close, a throwing stop, inspection accessor
refusal and inert configuration refusal. Original opening and failed cleanup
evidence remains retained; no native test or installation is hidden in this run.

The [earlier component result](../qualification/buyer-owned-pipe-streams.actual-local-result.json)
binds 44 component modules and the package manifest (45 inputs), 124 exact cases,
exit and stream digests. It includes these unchanged 52 case bodies, 28
[local recovery controls](BUYER_ORIGINAL_RECOVERY_COMMANDS.md) and 24
[backend reconciliation controls](BUYER_ORIGINAL_BACKEND_RECOVERY_COMMANDS.md).
The earlier 52-case result remains historical evidence at its original pins.
All 25 existing lifecycle test bodies were preserved and rerun through a shared
fixture; its declared commit phase now matches the actual
LOCAL_STORE_READBACK_MATCHED contract. The other 27 cases exercise actual Node
memory streams and AsyncLocalStorage, explicit flow, original DATA retention,
independent input requirements, malformed protocol, callback/drain ordering,
unknown intake, single ownership, partial acquisition, pending/failed close and
late completion. Node tracing symbol slots are accepted without reading/copying
them or admitting named then/constructor overrides.

The first 49-case run had 31 passes and 18 failures from an overly strict
Promise property guard. The corrected 50-case run passed; two ownership/setup
regressions were then added and the final 52-case run passed. Each actual
attempt and its original selected sources is retained separately.

Native client children/key callbacks remain declared. The real SDK105 owner,
hash/signed-DATA/checkpoint/handoff code and Node streams execute, with fixed
public bytes and deliberately invalid signature DATA. Fake clear only changes
fixture public bytes. No SDK/Noble/x402 package, actual key/signature, SQLite,
application socket, HTTPS, positive-work search or SDK PREPARE is evaluated.

The native binding and buyer named entry remain development-only source. The
changed native funding module has a fresh parser-only check; the literal native
graph is now 118 files. Existing unchanged root-parser observations are reused,
without linking/evaluating SDK/native package modules. Main receives the pure
owned-stream entry, control/runner/result and this documentation. The hosted
108-case profile is unchanged and does not run these 17 entry controls. The
earlier 52/124/62-case results remain at their own source pins; their unchanged
selected inputs were verified rather than their native scope being expanded.
The separate frozen native allowance remains unconsumed and is not
retargeted to this graph. Durable recovery, actual SDK/store/HTTPS/key cleanup,
default buyer cutover, grant activation, service delivery and economic pilot
acceptance remain unqualified.

## Current terminal host integration

The current 124-case selection also includes 20 [host controls](BUYER_ORIGINAL_COMMAND_HOST.md).
They exercise the actual command sessions, separate reconciliation and unknown
outcomes from clean closure, retain original run/close receipts and prevent
repeated host calls from starting work again. Native CLI run adapters remain
source-only on development. Only the changed CLI root was parsed in the current
host step; unchanged native root parser results were reused at identical bytes.
The earlier 104/80/52-case records remain historical evidence at their original
source pins; they have not been relabeled as results for this current graph.

The current result keeps the 124-case componentRegression separate from four
real provided-pipe controls. All 124 cases were rerun after the shared session
write-uncertainty fix; earlier command-host results retain their original pins.
