# Original funding transition witness

`restoreIssuedFundingGrantNativeWitnessedJournalRecovery` is an explicit source
profile above the existing original-journal observation. It adds one borrowed
`NativeFundingTransitionWitness` to `observation.transitionWitness`. The old
unwitnessed entry keeps its input and behavior contract. Native execution of
either profile remains unqualified.

The gap is result loss: the SQL outcome can change while its new digest was
previously available only in the observation response. The witnessed profile
retains a separate candidate intent BEFORE each reservation and result CAS.
This makes the proposed digest available independently of that response.

## Ordering and meaning

The same provider first closes with a void receipt and clean current metrics.
The original BOUND row, outcome, context and remaining observation budget are
checked as before. Before each SQL CAS, the adapter computes a bounded canonical
witness containing the independent initial anchor, exact expected/proposed
digests, immutable-context digest, original transaction and phase/count change.
Exact synchronous witness retention and readback precede the SQL call. A second
witness read follows its acknowledgement. The original custody owner still
requires exact SQL acknowledgement and readback before returning an outcome.

A retained witness means only that a transition was proposed. It does not prove
SQL was called or committed. Loss before SQL can leave the BEFORE state; lost
SQL acknowledgement can leave either state. Neither repairs the original HELD
owner, refunds a consumed count, starts another observation, creates SDK
authority or activates/delivers a grant. The existing journal remains local
history; no new chain observation or canonicality claim is added.

## Separate bounded file owner

`openNativeFundingTransitionWitness` selects an explicit existing private
directory, expected device and independently retained initial BOUND/outcome
anchor. CREATE_NEW requires an empty directory. It writes one fixed anchor and
at most 32 write-once intent files, each at most 4096 bytes. It never creates a
directory, adopts historical files, renames, unlinks, migrates or retries an
uncertain write. READ_EXISTING checks that same independent anchor and refuses
retention. It cannot adopt writer authority.

The source checks all path ancestors, private directory identity, owner/mode,
device, regular-file identity, one link and NOFOLLOW opens. Writes use EXCL,
bounded complete writes, file sync, known close, directory sync and readback.
Uncertain handles/partial files stay HELD and retained. Directory identity omits
mutable child-count/timestamp fields. Read-only reads are bounded and compare
file identity before/after. There is no OS lease or power-loss guarantee.

This directory is separate from the three-table intake database. The source
does not make the two stores atomic. A dangling witness or unresolved SQL
receipt remains observable history, not permission for a second economic
operation. The caller owns the witness lifetime; the observation adapter never
force-closes it or the borrowed SQL/journal files.

## Lost-response inspection

`inspectOriginalFundingHistory()` is available after the same provider's known
close barrier and an idle observation. It may read a lost-result history while
the original operation stays HELD. Close reentry stops the read without output.
It does not reopen the provider or clear uncertainty.

For an explicit later reader, `inspectIssuedFundingGrantNativeWitnessHistory`
borrows the actual native store and witness prototype readers. Open the witness
in READ_EXISTING with the independently retained INITIAL anchor. No provider,
SDK, signer, CAS, journal observer or new writer owner is constructed by this
history reader. It does not establish external owner fencing.

The pure reader validates the complete anchored, bounded, nonbranching witness
chain and compares only the latest BEFORE or PROPOSED value to actual custody
bytes. An older rollback, foreign context or broken chain is refused. Full
BOUND rows surround outcome/witness reads; a second outcome and detached-chain
check reject drift. Returned history and matching expectation have NONE
authority; a matching value is not a recovered commit receipt. Existing restore
still needs explicit operator ownership selection and an actual matching ACTIVE
grant before any service admission. The old HELD operation remains HELD.

DATA checks use the actual codecs, observation owner and history reader with
declared memory file/store/journal/provider ports. Actual filesystem sync,
SQLite durability, lost-response fresh-process inspection, stale-worker
fencing, native release, Linux and full G1/G2 acceptance remain OPEN. The
unchanged hosted 108-control workflow remains separate from these local cases.
