# P2 V5: V2 application binding and role profile DATA

The versioned P2 V5 source selection now uses the V2 issued-funding application
and its Vary-aware response writer, through the retained P1 V5 definitions.
The existing canonical Node file-URL producer supplies the parent, funding-child
and recovery-child profiles. The public controller admits source only and has
no native execution flag. **P2 V5 native recovery remains NOT_EXECUTED.**

The new `sdk105_p2_role_profile_bundle.py` checks the exact mode, profile kind
and three distinct role entries before requesting one verified source inventory.
All three role views derive from that inventory and retain the same source-row
digest, input identities and import bindings. Scoped-package `@` characters use
the canonical producer's literal spelling. Role metadata grants no execution
authority.

One local Python DATA command passed all 13 controls, with complete stdout,
exit 0 and empty stderr. The actual helper and canonical producer operated on
declared, in-memory source bytes: 151 application rows and 404 package rows.
A successful bundle invoked 555 declared reads once, two root callbacks and
one identity recheck. These are fixture callbacks; no installed package was
opened or evaluated. Refusals cover wrong mode/kind/roles, duplicate or missing
entries, traversal, physical aliases, changed source bytes and source-row digest
drift. See the [actual DATA result](../qualification/sdk105-p2-role-profile-bundle.actual-local-result.json).

P2 V4 already derived its role views from one inventory pass. V5 preserves that
property; no threefold speedup is claimed. Removing the two unreachable P1 test
entry/preload rows reduces the selected source inventory from 4,779,569 to
4,722,979 bytes, a reduction of 56,590 bytes. This is source-inventory size,
not a measured runtime latency or disk-reclaim result. V5 declares 151 application
files, 404 unchanged package rows, 667 reviewed literal imports and 9 bare imports.
No source or dependency directory was copied for the DATA command.

The development branch retains the versioned V5 controller, manifest, preload,
parent, two children, I/O and commit-boundary fixture. Its manifest SHA-256 is
`a3cd6e869a2ad627ac7f8c46951f9665d6066a3ea65b81bd8e547613730bc9b1`.
Existing V4 files and every earlier qualification record remain unchanged.
The actual commit boundary, matching original pins and five file identities,
owned child exit and close before recovery, fresh recovery process, private
child capture and no-duplicate-dispatch assertions remain in the V5 source.
The effect ceilings are unchanged; a source selection is not permission to run
them. A separately reviewed finite native scope is still required.

Main receives only the pure Python bundle helper, its DATA control, the sanitized
actual result and this document. It does not adopt the different P2 application
graph. The existing 108-control CI workflow is unchanged and does not run the
new Python DATA control or any native application test.

Roadmap state after this work:

- P1: retain the earlier V4 clean PASS and actual V4 pending FAILURE. The V5
  exhausted-budget expectation repair and response-loss mode remain unqualified
  by native execution.
- P2: V2/canonical-profile source integration and the new role-bundle DATA
  controls are complete. Actual same-file interruption/recovery, HELD-store and
  nonclosing-socket behavior, and physical resource release remain open.
- P3/P4: live pilot acceptance, real payments and sustained native capacity,
  latency and concurrency remain unqualified.

The DATA command used no Node, SDK, SQLite, keys, signatures, sockets, nonce
search, child process, IPC or signal. Its empty owned scratch was closed
successfully; earlier retained native evidence was not reopened or cleaned.
No OS or network sandbox, full application success, production readiness or
pilot activation is claimed.
