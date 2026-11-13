# Stored grant query opening receipts

The stored and purchased grant recovery reader requires synchronous, void
opening permission at every file-open, read, projection and output boundary.
Rejecting a non-void receipt alone is insufficient: the receipt can represent an
unjoined borrower of the same owner, so ordinary cleanup must not revoke or close
that owner while its state is uncertain.

The candidate retains the exact opening receipt, selected profile and known owner
in the existing bounded HELD frame. No later lifecycle port or ready-profile
publication follows that receipt. This also retains uncertainty observed before
file entry or after a recorded close. Late promise fulfillment or rejection does
not resume the operation. Sixteen retained frames prevent new owner acquisition;
the limit is unchanged. A synchronous guard exception continues to permit the
existing once-only cleanup of an independently known quiescent owner.

Only supported native promises are observed for rejection handling. Opaque
thenables, proxies, constructor/species accessors and altered array methods are
not used to discover cleanup authority. No new payment, signing, grant activation,
query retry or service-dispatch permission is introduced.

The new DATA entry selects twenty-one cases: stored/purchased success controls,
synchronous revocation, all nine guard boundaries, late receipts, opaque receipt
hooks and the existing sixteen-frame bound. File, lifecycle and guard callbacks
are declared memory ports. SQLite-looking paths and signature-shaped fields are
inert fixture data.

This remains a candidate for the complete application source profile.
Native SQLite/SDK/HTTPS composition, fresh-process reopen and physical release
remain unqualified. All G0-G5 product gates remain open.


## Focused DATA result

The actual comparison against source baseline `bc45c650` passed all 21 new
boundary controls, 41 existing stored-query controls and 37 purchased-recovery
controls. The same new entry on the reference source returned exit 1 with 13
failures and 8 passes. Those failures are preserved; the outer comparison exit 0
does not reclassify the reference as a passing implementation.

One owned managed command captured four fresh Node processes and 120 total case
executions. Its task closed SUCCESS. An independent read-only consumer verified
the original source archive, manifest, command/stream digests and every case ID
from owned retained objects. No test was repeated for that consumption.

See the [focused result](../qualification/stored-grant-opening-guard.focused.actual-local-result.json).
The remaining 229 affected regression controls require a separate proof and are
outside this focused record. The source candidate does not establish a complete
current application profile, fresh-process recovery, native release or product
acceptance. The existing 16-frame bound and all G0-G5 gates remain unchanged.
