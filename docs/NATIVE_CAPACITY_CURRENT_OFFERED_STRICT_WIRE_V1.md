# Strict recorder-v1 wire validation for the current offered pipeline

The current capture reader now rejects malformed clean-result declarations that
Python previously accepted through boolean/integer equality or incomplete schema
checks. The completed local controls cover the reader and the real JavaScript
recorder's wire format. The native capacity application was not run.

The source parent is 6975c5dd98cd9c765853c3c24a93e12eff58b387. Exact source
bindings and actual control receipts are in the
[local DATA result](../qualification/native-capacity-current-offered-strict-wire-v1.actual-local-result.json).
The earlier pipeline result remains a historical record of its earlier inputs.

## Confirmed behavior and correction

The original reader accepted a correct baseline and eleven malformed variants.
For example, it treated funded: 1 as the expected boolean, accepted boolean
counters and a negative balance sample count, and ignored a wrong recorder scope
or inconsistent empty state. Recomputing each synthetic outer frame and its
receipt digest did not make these malformed declarations valid.

The reader now checks the exact 18-field clean recorder-v1 schema and exact
scalar types. It binds each recorder's limits to the original workload and checks
phase completion counts, in-flight peaks, exact non-success fractions, summary
sample counts, successful/terminal summary agreement, recording state, observed
span and balance-result consistency. Complete lane owner facts also use strict
recursive type comparison.

These checks apply to all five original recorder positions: the prefix,
post-stop prefix ledger, dispatched calls, source start delay, and post-stop
measurement ledger. Post-stop ledger recorders cannot declare funding or funded
calls; the source-start-delay recorder cannot declare ledger transactions.

A balance-only recording stays EMPTY with no observed time span because balance
checks do not advance this recorder's caller-supplied observation clock. Zero
duration is valid. Scalar timing summaries remain caller declarations; this
reader does not authenticate their origin or reconstruct raw timing samples.

The original outer frame is still decoded in place. This correction does not add
a second serialization or a copy of the complete captured input tree. The
default-off launcher and launch selection bind the corrected reader's exact hash;
their native effects and resource policy are unchanged.

## Actual local controls

- The corrected Python suite passed 311 tests, with zero failures, errors or
  skipped tests. This includes 136 additional cases beyond the earlier 175.
  Typed mutations cover every recorder position and complete owner facts, and
  ten omission cases actually remove required recorder or phase fields.
- The first expanded suite attempt had one error: a new regression-loop variable
  shadowed the profile metadata module. Renaming that local snapshot fixed the
  test harness. That failed attempt, its exit and its stream hashes are retained.
- The real JavaScript capacity recorder produced twelve original wire records
  from 4,238 caller-declared observations. The Node DATA harness also asserted
  cached finalization identity and zero retained duration references.
- Python accepted all twelve original records and refused all 216 altered
  records, eighteen mutations per original record. Original JavaScript stdout
  was passed unchanged, with its full byte count and SHA-256 checked.
- Repeating the original twelve-case diagnostic against the corrected reader
  accepted the baseline and refused all eleven malformed variants.

The real-recorder cases include empty and balance-only records, zero duration,
all three phases, overlapping declared calls, balances after phase observations,
the 4,096-sample boundary, a maximum source timestamp, the maximum in-flight
configuration, and 128 serial ledger observations. These are supplied DATA,
not measured service concurrency or ledger latency.

Python 3.12.14 and Node 24.19.0 ran the selected controls. The final Python control
stdout was 64,280 bytes, SHA-256
c2ddd97b4656ca220ab96b0e3fd6ceb1812c4da4d083e41b204b8edc7fb1966d.
The real-recorder wire was 21,123 bytes, SHA-256
2d2f9775e0a12705f1c83bdb5a702401d5c6032fde2f6c777a1bfe2ee959f5a5.

The two verbose controller aggregates were truncated in the stored UI observation.
Their actual command receipts retain complete child-stream byte counts and hashes;
the small result summaries and original JavaScript wire remain retained privately.
The full verbose Python stdout is not claimed to be recoverable. Completed tests
were not repeated to recover an observation.

## Remaining qualification boundary

No SDK, x402 or Noble package was imported; no SQLite file, key, signature, nonce
search, socket, TLS endpoint, native application or task-storage task was created.
The existing storage root was not accessed, and no cleanup or policy change was
performed. Historical evidence remains unchanged.

The current parent still declares 160 application rows and 404 installed-package
rows; the current child graph declares 153 application rows and the same packages.
These graphs were not executed by these DATA controls. Existing clean or R4 native
allowances were not consumed or expanded.

This development-branch source publication does not qualify the full native
pipeline for main, hosted CI for this change, measured latency, sustainable
capacity, economic acceptance or production. Those roadmap gates remain open.
