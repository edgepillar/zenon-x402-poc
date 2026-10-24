# P1 native funding/service: explicit local RPC read selection

Status: the actual pure DATA helper passed 18 selected cases. The combined
native funding/service actor has a new, separately named local entry and passed
one syntax-only check. The actor was **not imported or executed**. This is not
TLS, SDK, SQLite, signing, positive-work, handoff or service-delivery proof.

## The integration gap and change

The existing combined actor selected only the public V2 retained read session.
That read path uses its unchanged public route grammar, port 443 and runtime
default PKI. Passing a local CA/port in an unrelated configuration could not
select the real loopback read owners. The native vertical fixture must not
replace them with a mocked owner, injected fetch implementation or canned
funding acknowledgement.

The development-source actor now has two explicit entry points:

- `openZenonDynamicPlasmaNativeFundingServiceClient(configuration)` retains
  arity one and selects the actual public V2 read factory.
- `openZenonDynamicPlasmaNativeFundingServiceClientForLocalQualification(configuration, localReadOptions)`
  has arity two and selects the existing actual local retained read factory.
  The second argument is an exact frozen DATA record, `{port, ca}`.
  It does not contain a request, SDK, owner, store or material factory.

Both use the same actual original-funding/V6 service lifecycle. There is no
configuration-driven fallback and no change to the default buyer. The local
variant is not selected by the public entry point.

## Trust and ownership

The new actual pure helper,
`src/zenon/native-funding-service-loopback-read-selection.js`, reuses the
existing closed local read policy to validate and detach the local CA and port.
It requires byte-for-byte equality with the already detached funding/service
CA; equal Buffer object identity is neither necessary nor sufficient.
The actual actor performs this synchronous comparison before claiming the
module owner, constructing native owners, opening its existing V6 store, or
reaching its first await.

The RPC port is an explicit integer from 1024 through 65535. It may differ from
the funding/service application's port. There is no inferred funding URL,
port discovery, external hostname, trust downgrade or global CA mutation.
The actual unchanged read core still enforces localhost, pinned 127.0.0.1,
the first/second/account role paths and its existing request/lifecycle bounds.

Each actual retained owner synchronously copies its own CA bytes. The actor
clears only its temporary selection copy after that construction attempt,
including failure paths. Caller-owned local and application CA buffers are
never cleared. Its separate private service CA retains the existing lifetime
through handoff and close. Buffer clearing is not a physical erasure guarantee.

The actual funding POST transport, existing-file V6 open, original payment
bytes/hash, one funding POST, current native handoff guard and bounded close
remain in the shared actor core. An uncertain HELD owner is not reset.
Source review of this unchanged code is not proof of the new shared core's
runtime public compatibility or healthy native cleanup.

## Current evidence

The result is retained in
`qualification/native-funding-service-loopback-read-selection.actual-local-result.json`.
The selected entry imports only the actual new pure helper and the actual
existing local route policy. The native actor and actual native owners are
outside that test's import graph.

The final component command passed 18/18 cases, with zero skipped, cancelled
or todo cases. They cover exact arity and record shape, identical/different CA
bytes and lengths, port/64 KiB bounds, accessor/proxy/shared-buffer refusal,
buffer adornments/prototypes, caller mutation, independent owned copies,
closed role-policy interoperability and sanitized failures. Certificates are
synthetic bytes, deliberately **not parsed or authenticated**.

The first component command failed case 12 after 11 passes: a test helper
silently replaced an explicitly supplied undefined CA with its default.
That helper was corrected without changing production code. The final command
then completed all 18 cases. The earlier failure's pins, counts and stream
digests are retained; its private raw diagnostics are not public.

There were two pure-component Node commands and one actor syntax-only Node
command. The selected component used Node v24.19.0 on darwin-arm64, four pinned
read-only source files, no addons, no dynamic code generation, no child/worker
or filesystem-write permission and no compile cache. Source identities and
bytes were checked before and after. Its permission flags are not represented
as an OS/network sandbox.

No SDK, SQLite, key generation, signatures, nonce evaluation, OpenSSL, TLS,
sockets, managed task/root, qualification scratch, download or install was
performed. The historical funding TLS attempt allowance was not reused.

## Publication boundary

Only the additive pure helper, selected DATA test, result and this document
are eligible for the small main batch. The modified actual native actor stays
on the development-source branch until its wider runtime graph qualifies.
References to that actor here describe development source, not a main entry
point or default activation.

Current source/main parent refs, full candidate trees, exact selected diffs,
open PR overlap, branch policies and current CI state are checked at
publication. No current CI pass is inferred from zero jobs or earlier results.
No workflow dispatch or protection bypass is part of this change.

The frozen pending full-DP input manifest and its application/launcher inputs
remain unchanged. Prior records stay historical; no old native test profile
or approval is rebound to this new graph. The wider actual
issued-application/native RPC harness still needs source completion and a
separate, exact runtime scope. P0/P1/P2, the full roadmap, live-chain recovery
and production readiness remain incomplete.
