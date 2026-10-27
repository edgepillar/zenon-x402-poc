# SDK105 local funding and command qualification selection

The explicit existing-KeyPair SDK105 path can now select the actual native
funding/service client's existing local HTTPS read entry. This closes a source
wiring gap: the SDK105 wrappers previously selected only the public read entry,
although the underlying client already supported explicit local qualification.
The actual SDK/SQLite/HTTPS composition remains **NOT EXECUTED** at this source.

## Inert trust and configuration capture

`captureSdk105LocalFundingServiceSelection(configuration, localReadOptions)`
uses the existing closed SDK105 configuration and local-read policy. It compares
the explicit RPC CA bytes independently against both funding and service CA
bytes before a key method or native constructor can run. It captures the
existing key reference, expected address, material/nonce limits, transport
fields and one owned CA copy across deferred module loading. It creates no key
and never reads private-key material or derives wallet identity.

The returned frozen object has `configuration` and `localReadOptions`. The
funding, service and RPC selections share that one temporary owned CA copy.
Borrowed operator buffers remain unchanged on both success and refusal. The
caller must retain the copy until its original opening operation settles, then
clear it. The actual native client still performs its own closed configuration,
file/store, route and certificate checks and makes its own trust copies.

This capture does not validate the whole native configuration or certify a
certificate. In particular, its pure controls deliberately use invalid CA DATA.
Nested custody, read and official application policies retain their original
validation contracts; no generic object clone or supplied native factory is
introduced. Selection DATA grants no authority to execute a native trial.

## Fixed actual entries on development

The following exports remain source-only on the development branch:

- `openSdk105NativeFundingServiceClientForLocalQualification(configuration, localReadOptions)`
  captures trust before wallet construction and calls the actual
  `openZenonDynamicPlasmaNativeFundingServiceClientForLocalQualification`.
- `openSdk105NativeFundingCommandSessionForLocalQualification(configuration, localReadOptions)`
  reserves the real command channel through the existing owned-stream session,
  preserves its one opening deadline, imports the fixed SDK105 module and
  rechecks the current-opening guard before calling the actual local entry.

The service wrapper releases only its own temporary CA after actual opening
settles. The command wrapper has a separate temporary copy: after opener entry,
only that original opener's `finally` releases it. An outer opening timeout must
not clear bytes that its pending asynchronous opener may still need. If opening
never entered, the outer wrapper can release its own copy immediately.

Both entries retain the existing native application slot, failed-acquisition
hold, actual wallet close and late-client close contracts. They never clear an
unreturned key, start a second opening, retry funding or infer clean native
resource release. A caller must still exclusively supply an existing KeyPair
and preserve its original cleanup duty when no client returns. The normal
public entries and default buyer select their existing constructors.

## Actual validation and remaining gate

The [local result](../qualification/sdk105-local-funding-service-selection.actual-local-result.json)
records 22 actual builtin-only controls at 15 exact source inputs, plus five
parse-only checks. The commands took about 0.57 seconds in total. The controls
cover all three trust domains, byte/port bounds, descriptor and Proxy refusal,
borrowed-buffer preservation, later caller mutation, deferred configuration
selection and independent owned copies. No key callback ran. The exact current
inputs for 31 opening/session, 62 pipe/startup and 128 other component/pipe
controls are checked before their earlier results are reused; they are not rerun
or relabeled as native results.

Main receives the pure capture, its runner/controls/result and this document.
The two actual SDK105 binding modules remain on development and were parsed and
reviewed as source. Neither installed SDK/Noble/x402 evaluation nor SQLite, TLS,
socket, signing or nonce work was executed. The unchanged authorized 108-control
hosted profile does not include these new 22 controls.

Next acceptance requires one explicitly selected current application using the
actual SDK105 KeyPair, owned command streams, local HTTPS, original signed V6
custody, selected grant and service flow. Its complete current source/package
graph, finite effects and fresh task-storage admission must be reviewed before
execution. The preserved old V6 allowance is not transferred to these entries.
Crash/lost-ACK recovery and physical native resource release remain separate
gates. Delivery, economic pilot and production qualification are not established.
