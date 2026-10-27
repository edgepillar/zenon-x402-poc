# Explicit original funding buyer commands

Date: 2026-10-27. All 52 selected builtin component cases passed.
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

The native opener validates the closed existing-key and stream selection before
acquisition. If a client was returned but a later facade/channel step fails,
actual owners and stop receipts are retained privately and both applicable stops
are attempted. Before the underlying client returns, its original quarantine
rules and caller key-cleanup duty remain in force. Stream acquisition starts
only when channel construction begins; unacquired streams remain caller-owned.

## Verification and remaining gates

The [actual local result](../qualification/buyer-original-funding-command.actual-local-result.json)
binds the 37-module builtin closure and package manifest (38 inputs), exact cases,
exit and stream digests. All 25 existing lifecycle test bodies were preserved and
rerun through a shared fixture; its declared commit phase now matches the actual
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

The native host and buyer named entry are development-only source. They are
not part of the main builtin component closure. Their two new/changed roots
passed parser-only checks; the native host's 94-file relative graph was inspected
without linking or evaluating its SDK/package imports. Main receives the independently
qualified codec/session/channel, fixture/tests/runner and evidence/documentation.
The existing hosted 108-case profile is unchanged and does not run these 52
local cases. The separate frozen native allowance remains unconsumed and is not
retargeted to this graph. Durable recovery, actual SDK/store/HTTPS/key cleanup,
default buyer cutover, grant activation, service delivery and economic pilot
acceptance remain unqualified.
