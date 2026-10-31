# Recorded result and execution commitment

The recorded-result inspection projection now compares the returned cache with
the successful execution's `resultCommitment` before releasing either cache
metadata or exact local response JSON. The original request and execution must
still match, and the backend and request-ledger cache copies must still agree.

Previously, those checks alone could accept two coherently changed cache copies
while the execution retained the commitment to a different result. For example,
changing both cache result codes to `different.result` did not change the request
identity or the `SUCCEEDED` terminal classification. The new projection refuses
that observation before producing output.

The comparison uses the existing durable store's v1 byte contract:

```text
sha256("zenon-x402:service-credit-sqlite-result-v1" + NUL + canonicalJson(cache))
```

The closed cache contains `statusCode`, `contentType` and `resultCode`. The result
is the lowercase hexadecimal digest with the `sha256:` prefix. Canonical key
ordering preserves valid records with different object insertion order. Missing,
null, foreign-domain or altered commitments are refused without invoking a
commitment accessor or treating an opaque object as a capability.

The SQLite store already validates this relationship. Its source, schema,
commitment domain and persisted records are unchanged. The projection adds the
same check at the result boundary. Its inspection fixture now supplies the
actual v1 commitment instead of an arbitrary digest. An independently calculated
fixed vector pins the byte contract.

UNKNOWN history does not consume a late commitment or release a result. A
refusal retains the existing owner's single read and close path; the coordinator
withholds output and does not requery, dispatch, debit, sign or create another
grant. Output schemas and the existing NONE-authority history remain unchanged.

## Qualification scope

The DATA controls compose the actual result projection, pure request/execution
contracts and reference ledger with declared memory file, SQL, proof, epoch and
channel ports. They include a full 100-request model history under one declared
funding/grant, unchanged counters after inspection, exact response preservation,
coherent cache substitution, malformed commitments and owner/coordinator refusal.

These controls establish source behavior. Native SDK/core/SQLite/HTTPS, proof
authentication, durable reopen, physical release, Linux and G1/G2 acceptance
remain unestablished. The hosted 108-control/22-input selection is unchanged and
does not include the new local cases. See the source profile, proof manifest and
actual local result for exact source/runtime and retained-control bindings.
