# Committed crash selection: one actual local failure

The one separately approved attempt against [source 35df768](https://github.com/edgepillar/zenon-x402-poc/commit/35df768f63101acedb786d9fb8fa72ad9e708d30) failed. This is not a successful commit-to-crash-to-reopen result. The allowance is consumed and was not reused.

See the [sanitized actual record](../qualification/recovery-crash-committed-v1.actual-local-failure.json). The complete private parent capture and interrupted files remain protected; no original payment, proof, key, private path, raw diagnostic or database is included here.

## What actually happened

The managed launcher admitted the unchanged 130 application and 404 package files in place. Test TLS succeeded. The Node parent exited 1 with complete captured streams. Its single seed admitted all 534 files and supplied the independent funding-original witness. The last protocol phase was `FUNDING_ORIGINAL_FIXED`.

The selected committed service cutpoint was not reached. No service-original witness was fixed, no selected cutpoint kill was requested, and no recovery child started. An owned failure-only stop sent SIGKILL to the seed; its actual exit, stream EOF and IPC disconnect were observed. This failure-only stop must not be relabeled as the selected crash scenario.

The task closed as `FAILURE`. Cleanup correctly held the child-created files, including the payer database and interrupted journal. A later bounded process snapshot found no owned groups or selected seed PID live. That snapshot is not native cleanup qualification and does not authorize deletion or reopening the held SQLite files.

## Source follow-up, not a retrospective pass

V1 retained no exact failing-guard location. Source inspection found that its writable-directory guard includes `nlink`, a mutable directory counter. The observed fault's exact cause remains unconfirmed; the directory issue is a candidate, not a fabricated diagnosis from a missing trace.

The new [identity helper](../src/native-private-directory-identity.js) selects only device, inode, owner, group and private directory mode. Real callers still have to inspect directory kind and ancestors. Regular-file single-link, NOFOLLOW and full identity/content checks must remain unchanged.

The [17 actual DATA checks](../qualification/native-private-directory-identity.actual-local-result.json) exercise this helper, not a new native directory, SDK, SQLite, process-pair or crash experiment. An earlier DATA output collector failed decoding the default reporter; that collection failure is preserved separately and is not counted as a pass.

P2 crash/recovery, physical durability, live-chain authentication, delivery, pilot and production remain unqualified. Main CI's existing 27 DATA/component checks are a separate selection; they do not run these 17 checks or the native crash case.
