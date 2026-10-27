# P2 commit and process-exit DATA checks

The [12 current controls](../qualification/sdk105-p2-recovery-boundary-data.actual-local-result.json)
passed with actual DATA validators and declared receipts. They execute no
application child, IPC channel, signal, SQLite, SDK, signature or nonce search.
Passing these controls does not establish an actual interrupted recovery.

The commit frame binds an external run token, transaction hash, grant/request
identity and both independent pin-file hashes. It requires one committed
execution, six admitted input commands, five returned results and no service
result acknowledgement. Accessors, proxies, changed fields, extra fields and
invalid counters are refused without evaluating supplied getters.

The termination check requires a matching boundary, exactly one planned kill,
no failure stop, both exit and close observations, and consistent null exit
codes with SIGKILL. Its output explicitly identifies CALLER_SUPPLIED_RECEIPTS_ONLY
and carries no action authority or physical-resource-release claim.

The native caller must provide observations from its exact owned ChildProcess;
the DATA check cannot authenticate a PID or turn a successful signal request
into an exit observation. The pinned [Node 24.19.0 child-process contract](https://nodejs.org/download/release/v24.19.0/docs/api/child_process.html#event-close)
distinguishes exit from the later close of the child's output streams. The
native parent must observe both before starting its recovery process.

Existing P1 and SDK105 controls retain their original source-bound evidence.
The hosted 108-control profile is unchanged and does not run these 12 controls.
The actual three-role native application candidate remains separately versioned
and NOT_EXECUTED. No default buyer, payment or service behavior is selected by
importing this qualification module.
