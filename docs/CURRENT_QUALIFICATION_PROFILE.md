# Current qualification profile

## P0 boundary

The current supported entry is npm test on Node 24.19.0. It does not discover
all files under test or qualification. npm run test:plan prints the explicit
selection and checks its source pins without importing any test entry.

The immutable profile is
qualification/profiles/p0-current-p2-node24-v2.json. This second generation selects
12 profile-contract cases, one accepted-run receipt case, seven abort-drain
composition cases, and seven runtime-dependency contract cases: 27 in total.
Those eight component cases exercise the actual local
dispatcher, custody contract, request owner, HTTP-client abstraction, sequential
core and runner with declared in-memory store/transport interfaces. This is
not the complete application test suite. The dependency cases inspect the actual
package/lock text without importing or installing its declared dependencies.
The v1 manifest, validator, launcher, tests and result remain unchanged historical
artifacts; their old package/source pins are not relabeled for this generation.

A successful run requires every named registration to pass without skips, todo,
cancellation, duplicate names, unexpected/nested registrations or incomplete
reporting. The launcher rechecks source hashes and file identities after the
reporter and test streams both end. A zero exit without these conditions is not
a qualification result. Output omits arbitrary diagnostics, stacks and paths.
No duration bound is claimed as hard cancellation or native cleanup proof.

The profile pins exact source bytes, LF counts and SHA-256 values, including
package.json, the launcher, validator and selected test files. The manifest is
also retained by digest for the run. It is not a signature or authentication
against an actor who can replace the checkout and all its qualification code.
Trusted physical checkout selection and runtime provenance remain premises.

## Versions and dependencies

Node 24.19.0 is the selected version; the package engine range >=24 is not a
claim that other admitted Node versions were tested. The same source profile
admits darwin-arm64, linux-x64 and linux-arm64; each actual result must name the
platform it ran on. Listing a platform is not platform qualification.

The declared x402 package remains @x402/core 2.23.0. This profile does not import
that package, qualify its installation, or exercise the Zenon SDK. The separate
real-x402 client/server compositions remain bound to their original results.
The exact 2.23.0 declaration is now a runtime dependency, and its core/zod lock
rows are no longer development-only. Existing versions, registry URLs and
integrity values remain unchanged. This source contract does NOT qualify an
actual --omit=dev installation or ordinary installed-package namespace. Such
execution and any upgrade to 2.28.0 remain separate work. See
docs/X402_RUNTIME_DEPENDENCY_CONTRACT.md.

The default workflow selects this profile and exact Node version without
installing packages. Authored workflow changes are not a hosted result.
Hosted execution requires its own exact-commit review and applicable authority;
local results never establish hosted CI success.

## Historical evidence stays historical

Historical tests, recipes, source guards and result records remain unchanged.
In particular, runner-receipt-qualification.yml retains its older 1+8+5 graph
rather than silently relabeling its pass for newer modules. Running that recipe
at a nonmatching source revision must refuse, not lower the guards.

npm run test:historical returns a fixed refusal and exit 2 without discovering
or running tests. To reproduce historical evidence, select its exact retained
source/runtime and bounded entry under a separate reviewed qualification.
Direct node --test remains broad Node discovery, not the supported current lane,
and may encounter intentionally retained historical source guards.

When application source changes, author a new profile generation and explicitly
select its current assertions. Preserve older profile files and outcomes;
do not edit historical hashes to make an old result appear current.

## Updated roadmap order

1. P0: current source-bound test selection, historical separation and exact-head
   hosted qualification. This initial profile is a bounded foundation, not full
   P0 completion.
2. P1: compose real x402 client/server, native HTTPS, V6 SQLite, one-grant scope
   and exact method/path/resource binding in one application graph.
3. P1: connect DP unsigned preparation to signing, final validation, original
   signed-byte custody and publication/reconciliation; qualify positive PoW
   together with price/horizon changes on that current graph.
4. P2: process interruption, commit/response loss, undrained native socket,
   retained store ownership and reopen without double dispatch or debit.
5. P3: a bounded economic testnet pilot only after actual runtime, chain,
   funding and provider/signing acceptance.
6. P4: measured funding/API latency and ledger capacity after pilot acceptance.

Integration work is GO. Economic DP/service-credit pilot remains NO_GO.
No automatic resigning, replacement, receipt-to-delivery inference, provider
activation, historical cleanup or live-payment authority is introduced.

## Qualification status

Generation v2 ran once on 2026-10-23 with pinned Node 24.19.0 on darwin-arm64:
27 selected tests passed, with no failures, skips, cancellations, todo or stderr.
Both streams completed, source/manifest pins were checked again, and the five
closed records and exact streams received a separate complete primary review.
The actual command used the Node argv declared by package scripts.test; npm CLI,
dependency installation and actual x402/SDK execution were not selected.
See qualification/current-p2-profile-v2.actual-local-result.json. Hosted CI,
ordinary installed namespace, other platforms and full P0/P1 remain unqualified.
The earlier 20-pass result below stays tied to its own v1 source graph.

### Historical v1 local qualification

On 2026-10-23 the exact Node argv declared by package scripts.test ran once
with pinned Node 24.19.0 on darwin-arm64: 20 tests, 20 passes, zero failures,
skips, cancellations or todo. The npm CLI itself was not part of that command.
Both streams completed and the source pins were checked before and after.
The complete retained local evidence received a separate primary review.

See qualification/current-p2-profile-v1.actual-local-result.json for the exact
source graph, manifest digest, runtime, selected names, streams and boundaries.
No hosted CI run, other-platform result, full P0 completion, full application
composition or economic pilot acceptance is established by this local result.
