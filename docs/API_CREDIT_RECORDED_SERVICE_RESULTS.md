# Recorded API results and exact replay

The fixed native API-credit product now returns the exact bounded response JSON
already observed and retained by its existing V6 service owner. Previously the
command exposed only a void callback-completion observation. Repeating an
original entered the no-resend owner and raised `RECOVERY_REQUIRED`, even when
that owner's validated response observation was present.

The product binding uses the same application's private V6 recovery-state reader.
The native budget-file owner is checked synchronously before and after that
read. The service reader requires the existing SERVICE phase, current funding
handoff, no close/active operation and an unheld budget-owner guard. Neither JSON
nor the command stream supplies a reader, module, factory or callback.

An explicit service command first passes the same existing canonical URL,
original-request and Authorization-metadata grammar used by the dispatcher.
The gate then reads the selected grant/request key. It compares the complete
original JSON, empty body and service URL, plus the funding identity/network,
revision, intent and declared response context. A different original is a
conflict, not a new attempt. Missing intent/response or uncertain custody,
submission, drain or funding history cannot authorize a resend.

For an exact recorded original, the response is returned without entering the
submission callback, creating a dispatcher, reserving units or executing again.
For a genuinely absent original, only the existing application submits once.
Its void callback must return successfully before a fresh current-state read can
return the stored response. A rejected/lost callback is never upgraded using a
later history read. The V3/V4/V5 owner's original no-resend/UNKNOWN policy is not
weakened. No second journal, grant, payment, signature or retry authority exists.

The API-credit command codec projects a closed versioned result with grant and
request IDs, exact response JSON/result code, replay status and local-observation
labels. Ordinary funding/recovery codecs remain void-only for service calls.
The original Authorization string is not returned or stored by the result gate;
secure erasure of strings or caller/native copies is not promised. Request/auth
metadata parsing is not cryptographic proof verification. The command transport
remains the existing private owned FIFO boundary.

The gate rejects concurrent/reentrant work and revokes result publication on
close. It invokes the original close once, joins its own pending result work,
and keeps uncertain outcomes HELD. A late callback cannot change a refused
result or admit another attempt. Reading historical success supplies no future
dispatch, economic, cleanup or ownership-transfer authority.

Qualification uses the actual product gate, application, command/channel codecs
and in-memory service-credit reference model. The funding/grant activation,
native children, file owner and V6 history are declared memory ports; the model
activation is the existing trusted MOCK reference record. Two deterministic
100-request scenarios verify 100 unit consumptions, one declared funding/grant,
and an exact replay with no second submission/reservation/execution. Model
serialization/reconstruction is same-process DATA, not SQLite reopen or restart.
Changed native wiring receives parser checks only. No SDK/core package, SQLite,
socket/TLS, key/signature, nonce search, native child, real PREPARE or payment is
executed. G1 native 100-call acceptance, authenticated funding/grant, fresh-process
recovery, Linux and G2 remain open.
