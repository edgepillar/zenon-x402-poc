# Native provider attestor draft

`make conformance BUILD_DIR=<temporary-directory>` builds the cross-language
protocol vector executable. `make conformance-only
BUILD_DIR=<temporary-directory>` builds the FD3/FD4 protocol child outside the
checkout. The latter accepts exactly one bounded
frame followed by EOF and emits nothing unless an independently fixed authority
record and digest are provisioned together, the record is canonical, and the
request passes strict protocol parsing. No authority is provisioned in this
draft, so it exits nonzero and closes FD4 without a response even for a valid
request. These executables are conformance aids, not deployable signers.
`make conformance-test-child CHILD_TEST_PINS_HEADER=<temporary-header>` builds
a distinct synthetic authority-pinned test child. A valid frame reaches
`APPROVAL_REQUIRED`, while semantic and framing errors close FD4; this variant
cannot be built as a release and never signs.

The journal/runtime test runner is a separate `PA_TESTING` binary with a
compile-time synthetic authority-record digest, public key, and exact canonical
generation-configuration commitment. Its test-only pins are supplied by a
temporary header at build time. Its fixed-byte synthetic READY is for journal
ordering and replay only; the JS parent verifier rejects that fake signature
as non-cryptographic. Missing pins fail the strict runtime build; changed
bytes, including a self-claimed configuration or executable digest,
fail before JSON parsing or journal access. The generation configuration has
no `executableSha256` field. A non-test runtime requires separately reviewed
release pins at compile time, and a test fixture cannot compile as a release.
`release-syntax-check` is only a strict source check, not a release artifact.

The separately opt-in disposable-token conformance test bridges a real
SoftHSM Ed25519 signature into this same `PA_TESTING` journal through its
`PATestSigner` hook. It generates a fresh key in a private temporary token,
builds test-only pins from the resulting public key and configuration, and
passes its random test PIN through a one-shot inherited FD 5 for each child,
never a source literal, argument, environment variable, or log. The test checks the pinned JS
verifier, committed `SIGN_ATTEMPTED` before signing, durable READY before
response emission, exact replay after response loss, and fail-closed PIN/sign
failures. It runs only with explicit `PA_RUN_DISPOSABLE_TOKEN_TEST=1`; normal
`node --test` skips it. Normal test cleanup removes the temporary token;
abnormal termination can leave disposable test files behind, and pipe/runtime
copies of the PIN cannot be proven fully zeroized. This test does not exercise
the denied production signer-loader entrypoints, real approval, Keychain, a
deployed key, or a live node/payment.

Both disposable-token test children check the module's on-disk SHA-256 against
the test-pinned digest before `dlopen` and again immediately after it, before
reading the one-shot PIN. Mismatched bytes fail closed without reading that
credential. These checks reduce the test's module-substitution exposure but do
not prove mapped-image provenance or eliminate same-UID replacement races
between checks and loading; they do not qualify the release loader.

`make development-testnet-child DEV_TESTNET_PINS_HEADER=<temporary-header>
BUILD_DIR=<temporary-directory>` builds a separate, explicitly pinned
`PA_TESTING` child; it is absent from `all`, release, and package scripts.
Building it does not show a dialog or create a key. Its zero-argument run
contract is one bounded FD3 request followed by EOF and at most one FD4
response, with no standard-output/error channel. It derives a dedicated
effective-user Application Support root separate from the release root; an
exact canonical generation configuration, token configuration, and disposable
software token must be provisioned beforehand. It accepts no argument or
inherited environment selector for that root or PIN. The test-only compiled
pins bind authority, public key, configuration, module, token identity, and
token-configuration bytes. This source-only milestone does not provision,
install, launch, or authorize the child in an ordinary runtime.

The development child uses an AppKit review of the full frozen operation with
Cancel as the default button and an explicit Approve selection. Approval is
latched durably before the display; the one-shot `NSSecureTextField` PIN dialog
appears only after `SIGN_ATTEMPTED` is durable and the pinned configuration,
module, and token-configuration checks have passed. A successful READY frame
is committed before FD4 emission; its replay needs no UI, PIN, or second sign.
Review cancellation is a durable rejection before signing. PIN cancellation,
failure, process interruption, or uncertain signing is quarantined without
retry. The JS parent allows at most 60 seconds, including both dialogs; a
timeout is not approval. The fake-UI offline variant exercises the FD and
journal paths but never shows real dialogs or handles an operator PIN. The
framework-managed PIN field and string copies cannot be proven zeroized, the
software token is copyable by the effective user, and same-UID replacement
races and mapped-image provenance remain unresolved. This is no Keychain,
biometric, hardware-HSM, live-chain, payment, or release qualification.
After its single `C_Sign`, the test/dev signer uses that same SoftHSM module to
verify the exact frozen message and signature against the unique pinned public
object before READY can be committed. Verification failure quarantines without
another sign. This catches accidental signature corruption; it is not an
independent attestation or a substitute for the JS parent's pinned-key
verification, which remains the final acceptance gate.

`make development-testnet-synthetic-manual-gui
DEV_TESTNET_PINS_HEADER=<private-synthetic-header>
BUILD_DIR=<private-temporary-build-directory>` is a distinct opt-in,
test-root-only AppKit target. Its compiled root must be private and temporary;
the header supplies only a 16-character temporary-root tag, not an arbitrary
path. At runtime the child derives a fixed leaf below canonical `/private/tmp`,
requires that system base to remain root-owned and sticky, and requires the
pre-existing leaf to be a non-symlink owner-private directory. It also refuses
the fixed development root and its descendants. The OS per-user temporary
directory lookup is unavailable with the JS parent's required empty child
environment; no environment-derived fallback is accepted.
The build checks tag length, but cannot establish filesystem existence or
ownership until invocation. It links the
same protocol, journal, disposable signer, and real review/PIN adapter as the
development child, but the display is explicitly marked SYNTHETIC/OFFLINE.
It is absent from `all`, release, and package paths, accepts zero arguments,
and still uses only FD3/FD4 for signing requests and responses. Building it
does not run it. The separate `development-testnet-synthetic-manual-gui-no-dialog-test`
variant compiles out both dialogs so automated malformed-frame, fail-closed,
and exact READY-replay checks cannot ask for approval or a PIN. Those checks
reuse an inert synthetic READY journal fixture with a deliberately invalid
signature and no token; they validate neither GUI acceptance nor a real sign
or the JS parent's final signature verification. No real manual dialog,
disposable token, Keychain/HSM, fixed-root installation, authoritative chain
observation, live funding, or testnet operation is qualified by this target.
The separate opt-in `disposable-token-bootstrap-synthetic-gui` collector is a
source-only, synthetic/offline GUI-to-FD5 bridge for that bootstrap. Its
private build header must pin the exact absolute test bootstrap executable and
module paths, both expected SHA-256 digests, and a 16-lowercase-hex root tag.
It derives only `ProviderAttestorSyntheticBootstrap-<tag>` below canonical
`/private/tmp`; it has no runtime path or PIN selector and never uses the fixed
development root. The root must be absent before review. The real adapter
requests foreground AppKit activation, then uses a Cancel-default bounded
`NSSecureTextField` dialog; an explicit second-button selection and exact
16-digit PIN are required before the root is created with exclusive owner-only
permissions. Whether a CLI process can reliably present this dialog on a
given virtual macOS host is unverified; an app-bundle/LaunchServices acceptance
gate may be needed before any supervised manual run.

After creation, the root is a one-shot latch. The collector rechecks pinned
image bytes, spawns the fixed executable once with fixed nonsecret arguments,
an empty environment and only the required private FD4/FD5 pipes, and
suppresses child standard output/error. It sends 16 PIN bytes followed by EOF,
accepts only 64 metadata bytes followed by EOF and a zero child exit before
writing `bootstrap-metadata.bin` privately and durably. Cancellation or bad
input leaves the root absent; every post-root failure, timeout, or uncertainty
preserves it for manual reconciliation and refuses a second run. Do not
improvise a shell, argument, environment, or logged PIN bridge or delete an
ambiguous root for a retry. The `-fake-ui-test` target replaces AppKit with a
test-only FD6 input; fake bootstrap fixtures test framing, failure, timeout,
isolation and replay refusal without launching the real GUI/bootstrap, loading
SoftHSM, or creating a key/token. Building the real target also does not run it.
Inherited ignored/no-child-wait SIGCHLD disposition is reset to a waitable
default before consent and again immediately before spawn. Timeout cleanup
checks the exact child with nonblocking `waitpid` before signaling; an
already-reaped or uncertain PID is never killed, and the root remains unknown.
The collector does not produce a live or fixed-development-root candidate.
Operator review of the bootstrap/module pins, a real public authority plan,
and a later separately authorized local acceptance remain required.

Owner/mode/ACL, digest, pre/post-spawn checks reduce substitution risk but do
not prove the executable's mapped-image provenance or eliminate same-UID path
replacement races. The shared sticky parent is not an HSM boundary. The
framework-managed secure field, string, pipe, and bootstrap memory copies
cannot be proven fully zeroized. The process has a foreground activation check,
not a tested GUI delivery guarantee. No Keychain, biometric, hardware custody,
live-chain observation, payment, or release qualification follows from this
source-only collector.
The shared sticky parent and same-UID replacement races in the temporary
leaf and software-token files remain outside this offline validation.
Private native roots, journal/configuration files, and the test-only token
configuration now reject extended macOS ACL entries as well as unsafe mode
bits; ACL lookup uncertainty fails closed. This does not eliminate same-UID
replacement between separate path checks or qualify the software token as
hardware custody.

The opt-in `tests/development_testnet_provision_plan.mjs` is only a read-only
preflight for a privately stored, canonical public plan. The plan must supply
an independently operator-reviewed testnet authority template, including its
chain identity, checkpoint, and source policy, plus expected digests for the
bootstrap executable and module. The preflight checks their current bytes and
requires both the fixed development root and staging target to be absent. It
prints only a fixed PASS/FAIL status. It does not create a token, stage a root,
show a GUI, accept a PIN, launch bootstrap, generate configuration or pin
headers, or authorize child activation. Synthetic offline tests use fictitious
authority values and inert image files; they are not live funding evidence.
No real public authority plan or final installed-child digest has been
operator approved, so provisioning and activation remain blocked. A later
provisioner must repeat image checks immediately before launch, preserve any
partial bootstrap state for manual reconciliation, and account for same-user
replacement races; this preflight alone cannot eliminate them.

There is no approved release pin set, separately operator-approved installed
executable digest manifest, root-owned release deployment, or qualified dynamic
library dependency closure. The signer now requires a fixed compile-time image
directory and root ownership, a non-symlink `openat` walk from `/`, no non-root
mode-bit writers or extended ACLs on ancestors/images, and a pinned digest
and inode/metadata recheck around each
`dlopen`, and a thin host Mach-O allowlist that rejects rpath, non-system direct
imports, and unknown load commands. It also rejects loader and provider-module
environment overrides. These source checks do not bind dyld's mapped image to
the checked descriptor or prove runtime `dlopen`/provider-plugin behavior.
Local Homebrew SoftHSM imports a non-system OpenSSL image, so that layout does
not satisfy this policy. A root-installed, reviewed image and dependency set,
independent mapped-image identity evidence, platform signing/hardened-runtime
qualification (including library-validation entitlements and system-library
trust), fixed provider configuration without environment lookup, and release
pins remain explicit gates. The signer and verifier entry points therefore
retain an unconditional source-level deny before library loading/signing.
The owner-policy test seam compiles only into an isolated test binary and uses
synthetic Mach-O files; its non-root positive case is not release evidence.
The development-only SoftHSM 2.7.0 key-profile v1
requires a unique public/private pair on the pinned token serial and exact
16-byte `CKA_ID`, both `CKK_EC_EDWARDS`, and exact 14-byte RFC 8032 DER
PrintableString curveName on both objects. It accepts only DER OCTET STRING
`04 20` plus the exact pinned 32-byte public point, with token/visibility and
sign/verify flags checked fail-closed. RFC 8410 OID DER is not an alias: the
SoftHSM OID-template generation produced a mixed public OID/private curveName
pair, which this profile rejects. A separate test-only isolated token probe
exercises exact attributes, missing/duplicate/mismatched objects and flags,
pure parameterless `CKM_EDDSA`, and independently verified deterministic
signatures; it never bypasses the production deny gate. These bounded offline
checks do not qualify the root-owned module loader or authorize deployment.
The non-test runtime never signs;
the conformance child only emits a bounded approval-required response when an
independent authority is provisioned, which has not happened in this draft.
The separate macOS approval adapter now has a release-only, zero-argument child
entrypoint: it constructs the concrete AppKit/LocalAuthentication/Keychain
adapter internally, with no argument, environment, or configuration selector
for the fake. `make macos-approval-test BUILD_DIR=<temporary-directory>` compiles
an isolated fake-system runner; it does not show a real prompt or touch a real
Keychain. `make release-candidate` requires independently supplied release pins
and rejects test/mock symbols in its linked artifact, but the candidate remains
non-deployable because the production signer-loader gate is still an
unconditional deny.

The operator review dialog uses a selectable, scrollable native text view for
the complete frozen canonical request plus issuedAt/validUntil. Its DEVELOPMENT/
TESTNET SOFTWARE ATTESTOR label warns that the SoftHSM token is copyable, chain
facts are caller-supplied, and the later system authentication prompt is not
cryptographically bound to the display. A fresh LAContext uses
deviceOwnerAuthentication (macOS password capable, not a biometric assertion),
an explicit zero reuse duration, a one-callback latch, and a bounded timeout.
Explicit cancel/authentication failure is a durable rejection; system
interruption, timeout, or an indeterminate callback is quarantined without
retry. A successful approval is not persisted and expiration is rechecked
against the original frozen validUntil.

The Keychain lookup is after approval only and uses that same context, a fixed
service/account from the independently pinned generation configuration,
non-synchronizing data-protection Keychain matching, and a returned-attribute
check for `WhenUnlockedThisDeviceOnly`. Missing/mismatching attributes fail
closed; no item is created or provisioned here. Actual item migration/access
control, device-local attribute behavior on the target macOS version, and the
framework-managed immutable return buffer's memory lifetime need separate
manual qualification. Only the bounded caller-owned mutable credential can be
explicitly wiped by this source. The real login-session password prompt is a
separate manual acceptance gate and has not been run.

A separate, development-only manual acceptance harness can be built with
`make manual-operator-acceptance BUILD_DIR=<temporary-directory>`; building and
syntax-checking it do not show a prompt or touch the Keychain. It is never part
of `all`, automated tests, or the release child. A future, explicitly approved
local operator may invoke that binary interactively with the single literal
`--manual-one-use-device-owner-keychain` flag. It creates one test-only
generic-password item with a fresh random in-memory value, protected by
`WhenUnlockedThisDeviceOnly` plus
`userPresence`, with synchronization disabled; invokes the concrete production
approval adapter with a fresh, zero-reuse `LAContext`; compares the item value
returned through that same approved context. Before the prompt, an independent
fresh, no-interaction, zero-reuse context must fail to read the exact item value.
After approval, the harness independently checks attributes of that same
persistent-reference item without another prompt. The returned access-control
object must be present and equal the object used at creation; missing metadata
is `FAIL`, since a denied pre-approval read alone does not prove the exact ACL.
Cleanup deletes only by
the nonempty persistent reference returned by successful creation. The fixed
test-only selector makes abnormal-termination
cleanup possible; an existing matching item causes `SecItemAdd` to fail and
is never overwritten or deleted. Cleanup uses a separate no-interaction
context, and any deletion failure makes the result `FAIL`. If creation succeeds
without a usable persistent reference, the harness reports `FAIL` and leaves
the test-only orphan for manual recovery; it never falls back to selector-based
deletion. The harness prints
only `PASS` or `FAIL`. It does not exercise the
attestor signer, SoftHSM, payment, wallet, RPC, WebSocket, or any network path.
Abnormal process termination can leave the disposable item behind; do not use
a broad Keychain cleanup command. Manually inspect and remove only the exact
source-defined test selector after confirming its identity if that happens.
Passing this harness establishes only that
this local macOS user session completed the specific policy-and-item lookup; it
does not prove a biometric factor, content-bound approval, hardware custody,
or deployment readiness.

Keychain-mode execution is **NO-GO** until an authorized code-signing identity,
appropriate provisioning profile and data-protection Keychain entitlement,
app-like signed bundle, and local login-session preflight are independently
verified. Apple TN3137 does not justify assuming that a bare ad-hoc-signed CLI
can access the macOS data-protection Keychain. Do not substitute a file-based
Keychain or weaken `ThisDeviceOnly` or `userPresence` to make the test pass.
None of those provisioning requirements has been verified by the offline build.

The same development-only binary also accepts the distinct literal
`--manual-device-owner-only` flag for a manual LocalAuthentication-only
acceptance. That mode uses the concrete production adapter, a fresh zero-reuse
device-owner context, the full local disclosure display, and one real policy
evaluation if the operator continues. It creates, reads, and deletes no
Keychain item, and touches no signer, token, wallet, chain, or network. It
prints only `PASS` or `FAIL`; even a pass qualifies only this local policy
interaction, not a biometric factor or Keychain custody. No real prompt has
been run as part of this work.
Same-user changes, administrator changes, and VM/filesystem rollback remain
residual threats even after future root-owned provisioning. No live signing,
payment, device-owner authentication, or deployment is authorized by these
offline tests.
