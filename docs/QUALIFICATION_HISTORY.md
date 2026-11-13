# Source-bound qualification history

[Current status](../STATUS.md) describes the selected application candidate and
the open acceptance gates. This index keeps historical records reachable without
repeating every prior profile narrative in the current status page.

## Frozen version record

The [full pre-index status record](https://github.com/edgepillar/zenon-x402-poc/blob/a2dac731e9fac2971619c35d89354751fb03880e/STATUS.md)
is preserved at the immutable pre-index revision. It includes the earlier
source candidates, DATA and parser counts, native limitations, failures and
retained qualification links. The source, result, proof and failure files linked
there remain at their original repository paths.

The frozen record is a historical snapshot. Its older baselines and candidate
headings do not select the current application profile.

## Selected evidence families

| Record | Evidence and limits |
| --- | --- |
| Current source selection | [Current manifest](../qualification/acceptance/api-credit-current.source-profile.json) and [V93 source profile](../qualification/profiles/api-credit-application-source-v93.json). The supported runtime/entry and native acceptance fields remain unestablished. |
| V93 historical daily spending validation | [Contract](SPENDING_HISTORICAL_DAILY_VALIDATION.md), [result](../qualification/spending-day-events.actual-local-result.json), [proof](../qualification/spending-day-events.proof-manifest.json), [failure inventory](../qualification/spending-day-events.failure-inventory.json). Start/end aggregation preserves inclusive daily exposure and original record bytes. Local DATA does not establish native concurrency or restart behavior. |
| V92 funded custody hold before grant lookup | [Contract](API_CREDIT_PREQUERY_CUSTODY_HOLD.md), [result](../qualification/prequery-custody-hold.actual-local-result.json), [proof](../qualification/prequery-custody-hold.proof-manifest.json), [failure inventory](../qualification/prequery-custody-hold.failure-inventory.json). Retains the failed original-source command and the corrected source scopes. |
| Current hosted selection | [V3 contract](CURRENT_CAPACITY_QUALIFICATION_PROFILE_V3.md) and [manifest](../qualification/profiles/p0-current-p2-capacity-node24-v3.json). The existing 108-control/22-input lane requires its own exact-head hosted result. |
| Product and recovery acceptance | [Linux harness contract](API_CREDIT_LINUX_ACCEPTANCE_HARNESS.md) and [roadmap](ROADMAP.md). Source/DATA and historical native component results do not close the current G1/G2 product gates. |
| Earlier application and native components | [Frozen full record](https://github.com/edgepillar/zenon-x402-poc/blob/a2dac731e9fac2971619c35d89354751fb03880e/STATUS.md) and [acceptance inventory](../qualification/acceptance/api-credit-v1.evidence.json). Each result retains its original source, runtime, platform and command scope. |

## Evidence reuse

- Reuse a passing command only for unchanged complete inputs, the selected
  runtime and the same declared control scope, with its retained ownership and
  actual exit/completeness evidence intact.
- Preserve failed commands, UNKNOWN outcomes and retention-identity refusals.
  A matching content hash alone cannot repair ownership or reclassify a failed
  task as successful.
- Keep source inspection, DATA, parser checks, hosted CI, native integration,
  network trust and economic acceptance separate.
- Add future evidence to the index with its source-bound result and limits;
  keep the current status focused on the selected profile and open gates.

This index changes documentation navigation. It does not execute qualification,
change the selected workflow, authorize a pilot or delete historical evidence.
