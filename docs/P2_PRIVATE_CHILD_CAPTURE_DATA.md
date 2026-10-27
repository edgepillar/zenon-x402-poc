# Bounded private child-output preservation

The current P2 recovery candidate forwards child stdout/stderr byte frames into
the managed parent's single private stdout CAS object. The earlier candidate
kept raw child output only in parent memory and emitted hashes on success;
those hashes could not recover a failed child's original diagnostics.

Each stream retains at most 64 KiB. Byte offsets and canonical base64 preserve
binary prefixes independently of text framing. Declared EOF, matching exit/close
and per-stream digests are checked separately. A 448 KiB total transcript cap
also bounds overhead from fragmented writes. The proposed managed parent stdout
cap is 512 KiB; its stderr cap remains the existing manager's policy-derived
limit, at most 1 MiB. No storage policy or task quota changes.

Raw prefixes are forwarded before an overflow requests the owned child stop.
A write throw, reentrant write, missing EOF, changed byte/digest, late frame or
cap refusal leaves the transcript incomplete/unknown. A parent killed during a
write can leave a partial final frame; such bytes remain private failure evidence
and never qualify a complete trial. Normal success requires the managed parent
capture to be complete and both reconstructed child streams to match the exact
parent-reported sizes/digests. No second raw-output file or ZIP is created.

[Actual local controls](../qualification/sdk105-p2-child-capture.actual-local-result.json)
cover ten encoder behaviors, two JavaScript/Python byte round trips and ten
decoder refusals. They use declared byte chunks and child-event DATA. They do
not create children, IPC, signals, SDK/SQLite/native sockets, keys or signatures.
The same encoder and decoder are wired into the development P2 candidate;
actual child-process interruption and same-file recovery remain unexecuted.

The prior candidate and its source-only reports remain at their original
immutable revisions. This change does not transfer an earlier finite native
permission or claim delivery, physical resource release, pilot or production
acceptance. Public reports contain counts and source digests, not raw private
child output.
