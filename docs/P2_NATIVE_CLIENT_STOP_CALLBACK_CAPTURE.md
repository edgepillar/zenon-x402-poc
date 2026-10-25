# P2 stop-owner callback capture: own data properties

A narrow runtime correction in
`src/service-credit-native-client-request-stop-owner.js` is verified against
the actual component, not a transformed copy or aliased native implementation.

Main baseline: `417f21b7007590c63b5b0b04de386d5cb19238fe`.
Development baseline: `d4f6085f1b4840173f375987a301d7f35aecbfab`.
These are the parents reviewed before this batch, not claims about later heads.

## Reproduced behavior and change

The old implementation validated two own frozen callback values, then assigned
them into a plain private object. A same-realm inherited accessor for
`destroyRequest` observed the supplied callback through its setter and returned
a different function through its getter. The actual module then called the
substituted function, skipped the supplied request callback, and recorded
`requestDestroyOutcome: RETURNED`.

A bounded direct-module control reproduced one getter entry, one setter entry,
one substituted callback entry and zero supplied-request entries. No real
request, socket, native adapter, signer or payment was used. This is a local
same-realm prototype-mutation finding, not a demonstrated remote exploit.

The private copy now defines an own data property using a captured
`Object.defineProperty` intrinsic. It neither invokes inherited accessors nor
rejects valid callback values because an inherited name is non-writable.
The change is five added/two removed lines, including explanation and the
captured intrinsic. Public methods, validation policy, destroy claims, pump,
first-stop reason, close observations, no-retry behavior and handshake gate are
otherwise unchanged. No transport factory or default route changes.

## Actual local verification

One current component command completed with exit 0, full stream EOF and no
stderr. It ran 38 selected scenarios:

- The original eighteen stop/close-owner cases were imported verbatim against
  the current actual modules. Their historical result was not rewritten.
- Twenty new cases cover both callback names under accessor, getter-only,
  throwing-setter, read-only-data and writable-data prototypes; both captured
  capabilities; invalid second callback/own getter/proxy rejection; later input
  mutation; late assignment; reentry; callback failure; close observations; and
  invalid stop input.
- Inherited getter/setter entries, substituted callback entries and callback
  publication were all zero. Exact supplied callback handles, arguments and
  `this` remained intact.
- Five selected source identities and 254 other protected input identities
  were unchanged across execution. The runtime module was the sole intended
  existing-source change.
- Stdout: 10244 bytes,
  SHA-256 `31b644d9aaf6056ca1dca6c6f5a0314cf5d1467ae523615cc6ef074ce4014912`; stderr: 0 bytes.
- Local component command runtime: 0.085300 seconds.
  This is not a native timing or throughput measurement.

The numeric opaque handles and callbacks are declared fixtures, not native
brands or physical close observations. Node's test framework uses its own
timeouts; the separate bounded command capture, not those timeouts, supplies
the command result. The test imports no actual native client/adapter and
performs no application socket/timer, SDK, SQL, key/signature, nonce or payment
operation. No native OS/network sandbox is claimed.

## Preserve source-bound native gates

The earlier seven-case native-stop harness and managed-controller manifests,
source files and historical records remain unchanged. They still bind the old
stop-owner bytes, so the changed current graph must not be executed under those
records or old permissions. One actual source-only admission command was checked:
it exited 1 with `EXACT_SOURCE_ROW_PIN`, before manager/private-storage/native
entry. This is an expected boundary result, not a failed native test.

A fresh current-source native qualification remains separate. This component
correction does not close full native timing/drain, lost-ACK, crash/reopen,
provider/economic acceptance or production gates.

## Main transfer and CI boundary

Only this independently verified component correction, its exact test and
honest result/report are eligible for the small main/development batch. No
unexecuted native adapter is included. Local dirty work and the unpublished
README are outside the batch.

The reviewed main parent's existing 27-case Ubuntu/Node 24.19.0 run
[40198097631, attempt 1](https://github.com/edgepillar/zenon-x402-poc/actions/runs/40198097631)
was rechecked as successful. It is not the new commit's CI. The automatic profile,
workflow, package contract and defaults remain unchanged; these 38 local
component cases are not silently added to that hosted selection. A later new-head
hosted result must be observed separately. No manual CI run or retry is requested.
