# Original funding confirmation advancement: source candidate

The journal compare-and-update method previously returned unchanged whenever
the requested evidence state equaled the stored state. A record already marked
MOMENTUM_INCLUDED at one confirmation could therefore remain at one when an
original observation supplied three. This differs from the existing
updateEvidence method, which admits a strictly stronger count for the same
inclusion. A minimum-confirmation policy must not be bypassed to hide this gap.

The CAS source now uses captureJournalMomentumConfirmationAdvance. Equal details
are unchanged. A strictly larger positive safe-integer count is admitted only
when Momentum hash, height and timestamp are identical. A different inclusion,
regression, malformed field, accessor or proxy is refused. The pure comparison
mutates neither input and authenticates no signature, chain or finality.

The actual journal still checks the expected revision and entire expected
record before comparison. On advancement it changes only the count and updatedAt,
preserving the original inclusion identity and observedAt. Existing validation,
revision increment, durable write and exact revision/record readback remain the
same. An identical detail does not write or increment the revision. Existing
state-rank checks, delivery/cache exclusions, first inclusion, all other journal
methods and explicit new-journal setup are unchanged. No publication, resigning,
replacement, grant activation or delivery operation is added.

This is a prerequisite for a complete original-only pending observation path.
The current issued-provider pending observer remains JOURNAL_ONLY. General
maintenance scans other records and can terminalize them; it is not selected as
a fallback. A future live original-only producer must bind the same payment,
chain, resource and journal tuple, consume the existing observation reservation,
perform only the selected observation and retain ambiguity. This change does
not implement or silently enable that RPC binding.

Current qualification executes only the actual pure comparison. The native
journal file is parsed, never imported or opened. Actual CAS persistence,
concurrent writers, revision conflict/lost write, crash/reopen, observer SDK/RPC
binding and physical release are unexecuted. The source catalogs/readers are
repinned; existing package rows and bare edges retain their original policy.
G0/G1/G2 and the full Linux one-grant/100-call/exact-replay acceptance remain OPEN.
