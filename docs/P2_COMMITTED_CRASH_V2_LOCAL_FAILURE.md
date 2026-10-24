# Committed crash V2: separately approved local failure

The single V2 attempt against [source aab33cd](https://github.com/edgepillar/zenon-x402-poc/commit/aab33cdddece6ceaa2801884dd8910b787de0a85) failed. It used a new private managed root/task and did not reuse the consumed V1 allowance. Both failures remain evidence, not successful crash qualification.

See the [V2 actual record](../qualification/recovery-crash-committed-v2.actual-local-failure.json) and the separate [V1 failure](P2_COMMITTED_CRASH_LOCAL_FAILURE.md).

## Difference actually observed

The unchanged full child admitted 130 application and 404 package inputs. The corrected parent admitted its six pinned control files. Test TLS succeeded; the Node parent exited 1 with complete streams.

Unlike V1's parent-observer fault/failure-only SIGKILL, V2's seed observer reported no fault and sent no kill. The seed itself exited 1 and emitted only the frozen child's generic failure marker. Funding-original custody was captured, but the service-original witness and committed service cutpoint were not reached. The parent correctly refused to authorize recovery from that unsuccessful termination.

The retained V2 stage is `SEED_TERMINATION_ADMISSION`; it identifies the parent's refusal location, NOT the missing child operation/error. Do not invent a native root cause, infer successful BOUND/settlement from a file name, or call this a successful SIGKILL/reopen.

## Retention and next gate

The task is `CLOSED/FAILURE`; nine child/test scratch files totaling 150401 logical bytes remain HOLD, including the interrupted payer journal. A later bounded process snapshot found no owned groups live. No held database or journal was reopened for diagnosis; V1's files were not changed. No cleanup, repair, repeated signing or replay is authorized.

The next safe source task is a separately versioned full seed with bounded operation-stage diagnostics. It must preserve the actual SDK/x402/HTTPS/DP/V6 graph and all original-payment/recovery safeguards. Existing consumed native permissions cannot run that new selection.

The directory helper's 17 DATA passes and main's 27 hosted DATA/component checks remain separate evidence. Neither qualifies this failed native case. P2 recovery, physical durability, live-chain authentication, service delivery, pilot and production remain unqualified.
