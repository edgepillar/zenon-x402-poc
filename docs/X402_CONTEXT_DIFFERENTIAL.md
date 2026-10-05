# Inert x402 context and pending-settlement characterization

Status: CORRECTED SOURCE ONLY; NOT PARSED OR EXECUTED.

This bundle is prepared for later integration into an independently
matched repository baseline. It must not be added to the previously
inspected stale checkout.

## Exact scope

Only these paths belong to the slice:

- `test/fixtures/official-x402-context-cases.v1.json`
- `test/official-x402-context-differential.test.js`
- `test/x402-settlement-pending-authority.test.js`
- `docs/X402_CONTEXT_DIFFERENTIAL.md`

The modules are inert on import. They register no node:test tests and
perform no automatic dispatch.

A successful import or test-file discovery is not qualification.

## Complete counting

There are exactly 16 fixture templates.

| Template group | Version-specific slots | Version-independent records |
|---|---:|---:|
| Context method observation | 2 | 0 |
| Six modeled authority subcases | 0 | 6 |
| Three flow subprobes per version | 6 | 0 |
| Nine pending scenarios per version | 18 | 0 |
| Predicted bridge gap per version | 2 | 0 |
| Four bad-implementation controls | 0 | 4 |
| Total | 28 | 10 |

The complete bundle returns at most 38 records.

The context module returns at most 14 records:
eight version-specific slots and six modeled authority subcases.

The pending module returns at most 24 records:
twenty version-specific slots and four synthetic controls.

The two gap slots execute no SDK method. The remaining 26
version-specific slots are potential actual-method observations, subject
to source admission and method availability.

Each actual context or flow subprobe makes at most one SDK method
dispatch. Every flow variant has its own record and counter object.

Each pending scenario makes at most one original SDK helper dispatch.
The typed-error scenario may additionally construct one original
version-specific SettleError.

Thus the structural ceiling is 26 SDK method dispatches plus two typed
error constructions. This is a ceiling, not evidence of execution.
The inspected original 2.23.0 package lacks the pending helper, so its
nine pending slots must remain NOT_RUN rather than use a replacement.

There are at most two accepted synthetic settlement callback entries per
individual pending scenario. Expected counts are enumerated below.

No modeled authority subcase or synthetic bad-implementation control
invokes an SDK or settlement callback.

## Actual versus modeled evidence

The actual lane invokes exact original functions from independently
admitted package namespaces:

- Compiled facilitator buildFacilitatorContext.
- Exported server resolvePaymentFlow, if present.
- Compiled resource-server settleWithPendingRetry, if present.
- Original version-specific SettleError for the typed-error scenario.

These are version-pinned compiled-method observations. They are not
complete public registration or HTTP lifecycle conformance.

The context method has an explicitly synthetic receiver containing an
empty extension map. The pending helper has synthetic facilitator
callbacks. Neither fixture is an actual Zenon implementation.

Modeled checks are reported separately. Their guards and counters are
synthetic assertions, not real-chain identity validation, publication
evidence, operational permits or demonstrated production enforcement.

All reports retain `integration: UNQUALIFIED`.
There is no overall SDK-conformance PASS.

## Source provenance and admission

The prior read-only audit established:

- Published 2.23.0 was available locally and its 70 regular package files
  matched the integrity-verified published archive.
- Published 2.28.0 was statically inspected in memory.
- Published 2.28.0 was not installed or executed.
- Equal version strings do not establish byte identity between a
  published archive and later repository main.

This bundle contains no raw source-pin values and loads no SDK sources.
Existing provenance remains private.

Before either runner is invoked, an independently reviewed host must:

1. Admit the complete four-file bundle.
2. Admit actual package/dependency sources before evaluating them.
3. Supply original same-realm ESM namespaces.
4. Privately register exact binding and original function identities in
   the admission WeakMap defined in the context source.
5. Keep the admitted bindings and native intrinsics stable.
6. Impose a finite aggregate deadline and reviewed memory boundary.

The bundle does not provide or authenticate that host. A version,
scope label, frozen object or fixture cannot populate its admission map.

Registration after evaluation does not retroactively authenticate code.

Missing actual SDK bindings produce NOT_RUN.
Unadmitted or inconsistent bindings produce NOT_ADMITTED.
Absent exact methods produce NOT_RUN / SDK_ENTRY_ABSENT.

The original 2.23.0 pending helper is not synthesized.

## Context authority coverage

The actual context-method observation runs once per available version.
It checks the extension-lookup context shape and separately confirms
that the returned SDK context cannot replace the fixture-owned challenge.

The version-independent matrix runs these six named subcases once:

| Subcase | Modeled expectation |
|---|---|
| ORIGINAL_SERVER_CONTEXT | Original challenge and registered selected view match |
| MISSING_CONTEXT | Missing challenge rejected |
| EXTENSION_CONTEXT_SUBSTITUTED | Synthetic extension context rejected as challenge |
| PAYLOAD_DERIVED_EQUAL_COPY | Equal-looking client-derived challenge and selection rejected |
| MUTATED_SELECTED_REQUIREMENT | Same selected-view identity with changed amount rejected |
| CROSS_RESOURCE | Changed submitted resource rejected |

The equal-copy subcase first checks that its representations equal the
original server challenge and requirement. It then checks that those
distinct client-derived objects still lack original provenance.
Failure is not explained away by accidentally different field values.

The original immutable server challenge is created independently before
these attempts. It is never reconstructed from a client payment.

The outward selected-requirement view has a private relationship to the
original selection. Both that provenance and its unchanged representation
are required.

These are synthetic ownership assertions, not a new production authority
mechanism. Fixture labels, SDK callback contexts and received resource
fields grant no independent authority.

## Flow subprobes

Each variant is a separately counted actual-method subprobe:

| Subprobe | Expected SDK observation | Separate modeled local policy |
|---|---|---|
| EXPLICIT_UPFRONT | Resolve to upfront | Explicit upfront accepted |
| OMITTED_FLOW | Resolve through the scheme's upfront default | Missing explicit local flow remains rejected |
| UNSUPPORTED_FLOW | Reject unsupported authorization flow | Non-upfront remains rejected |

defaultAssetTransferMethod and paymentFlows already existed in 2.23.0.
They are not described as new 2.28.0 capabilities.

The existing separate legacy missing-flow compatibility lane is not
changed or exercised.

## Pending and non-retry scenarios

All counts below apply only when the original helper is present and
admitted. Otherwise the slot remains NOT_RUN or NOT_ADMITTED.

| Scenario | Expected callback entries | Expected terminal observation |
|---|---:|---|
| PENDING_RESULT | 2 | Return the second synthetic success |
| PENDING_TYPED_ERROR | 2 | Retry the qualifying original typed error, then return success |
| PENDING_TWICE | 2 | Return pending without a third call |
| PENDING_WITHOUT_TRANSACTION | 1 | Return nonqualifying pending without retry |
| FIRST_CALL_SUCCESS | 1 | Return first success without retry |
| NONPENDING_FAILED_RESULT | 1 | Return unrelated failure without retry |
| GENERIC_THROWN_ERROR | 1 | Propagate rejection without retry |
| UNKNOWN_IS_NOT_ACKNOWLEDGED | 2 | Return pending while modeled observation stays UNKNOWN |
| TRUTHY_INVALID_TRANSACTION | 2 | Observe broad retry while synthetic strict identity rejects both replies |

The generic error intentionally carries pending-looking reason and
transaction fields. It is a generic Error, not the original SDK
SettleError. Its object, message, stack and thrown value never enter a
report.

For truthy-invalid evidence, the synthetic transaction field is boolean
true. The original helper's broad retry dispatch is observed separately
from the synthetic strict comparison, which rejects both replies.

That rejection does not claim to validate a real chain or prove that the
guard is integrated into the production settlement engine.

The authoritative synthetic transaction baseline remains the original
fixture identity. Neither malformed returned evidence nor a precomputable
matching identity replaces it.

UNKNOWN and ACKNOWLEDGED remain distinct immutable modeled observations.
No SDK result promotes UNKNOWN to ACKNOWLEDGED or authorizes service.

## Binding and no-replacement invariants

Before either permitted synthetic callback entry proceeds, the scenario
checks:

- Original payment and requirement object identities.
- Unchanged complete payment and requirement representations.
- Unchanged encoded payment representation.
- Original server-owned fixture context.
- Zero modeled replacement creation, signing and publication.

Normal valid replies must retain the original synthetic transaction.
The deliberately missing and malformed transaction scenarios remain
non-authorizing negative observations.

No actual create, sign, publish, service or budget-release capability
exists in the bundle.

A hypothetical later reconciliation permission must refer only to the
previous exact payment. This bundle creates no such operational
permission and renews no payment authority.

## Truthful counters and failure handling

Each scenario allocates one counter record before any SDK invocation.
That same record is passed through helpers and retained by every catch.

Flow subprobes, context observations, pending scenarios and synthetic
controls do not replace counters with fresh zeros after failure.

sdkCalls records dispatch attempts immediately before Reflect.apply or
Reflect.construct. It does not claim successful completion.

settleCalls records the first two callback entries, including an entry
that subsequently fails a guard.

A third callback entry is rejected before settlement work. The first
excess entry is latched in rejectedSettleEntries and counterStatus becomes
LOWER_BOUND. Such a record does not claim exact accounting of arbitrary
further erroneous entries.

If a counter record cannot be safely read, the report uses:
counterStatus UNAVAILABLE and counts null.
Aggregate counts then become null. They are never fabricated as zero.

Raw SDK errors and rejected values are discarded into closed outcomes.
A failed probe is not retried, and consumed runner entries are not reset.

## Existing bridge gap

CONSUMED_CONTEXT_GAP remains NOT_RUN / PREDICTED_UNEXECUTED for each
version.

The existing bridge is not imported, copied, reproduced or modified.
Its one-shot consumed-context behavior remains unchanged.

Static inspection predicts that a qualifying 2.28.0 retry encounters the
context consumed before the first settlement call. This bundle does not
claim genuine reproduction or pending-to-reconciled-success conformance.

A test expecting second-call rejection would not resolve that gap.

No remedy may clear consumption, mint another authoritative context,
construct another payment, or automatically retry publication.

## Four distinct synthetic bad-implementation controls

These run once each without SDK version labels:

- CONTROL_MUTATION preserves input object identities while changing both
  payment and requirement representations.
- CONTROL_REPLACEMENT uses replacement objects and modeled forbidden
  create/sign/publish counters.
- CONTROL_TRANSACTION_DRIFT keeps inputs unchanged but supplies a
  different synthetic transaction identity.
- CONTROL_PENDING_AUTHORIZATION models service authorization from pending.

Each must report CONTROL_DETECTED.
These results qualify assertion controls only, not SDK conformance or
actual engine behavior.

## Bounds and qualification

The catalog is limited to 16,384 UTF-8 bytes.

Each representation snapshot is limited to 4,096 UTF-8 bytes.
Encoded payment representations are limited to 8,192 bytes.
No HTTP request or listener is created.

Snapshots reject proxies, accessors, unsupported prototypes, hidden or
symbol members, holes, cycles and shared object aliases. They preserve
property order and do not normalize strings or invoke toJSON.

Each snapshot is bounded to depth 8, 256 nodes and 256 members.
Arrays contain at most 32 elements and records at most 16 members.

Native metadata enumeration and allocator internals still require the
external memory/deadline boundary.

Each public runner is single-use per module instance. Invalid input also
consumes its runner entry. There is no automatic rerun.

Run the two exported entry points serially under one independently
reviewed aggregate wrapper. This source does not choose or execute one.

A previously reviewed deadline or V8 old-space setting is not
automatically admitted for this new subject. V8 old-space limits are not
total/native heap guarantees.

Do not invoke the repository-wide suite as a shortcut. It contains work
outside this source/mock scope.

## Non-goals and rollback

No changes belong to:

- Package manifests, lockfiles or dependency versions.
- Production payment, settlement or discovery code.
- Existing interoperability, recovery or lifecycle tests.
- Journal schemas, persisted records or workflows.
- Private bootstrap contracts or successful prior harnesses.
- Protected receipts or consumed operational admissions.

No filesystem, SQL, process, descriptor, pipe, listener, timer, network,
wallet, signing, payment, publication or Git operation is implemented.

This does not qualify private host custody or current-epoch live
funding-to-service behavior.

Before integration, rollback is to discard this source bundle.
After a source-only integration, rollback removes exactly the four
allowlisted files. No operational state is reset.

The initial private-plan host, genuine inherited-FD custody, trusted EOF,
fresh full-stat custody and post-exit result custody remain unavailable.
