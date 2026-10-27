# P1 profile and funding wire checkpoint - 2026-10-27

The corrected file-URL producer now passes the current P1 native namespace
admission. The complete clean application case still **fails** at funding:
`submitFunding` returns `SUBMISSION_OUTCOME_UNKNOWN` instead of
`FUNDING_INTAKE_BOUND`. This is not full P1 acceptance or a default cutover.

## Qualified local components

The [POSIX profile producer](../qualification/node_file_url_profile.py) builds
fresh profiles from verified source bytes and identities. It preserves Node's
canonical literal `@` for scoped packages, including the input and bare-binding
URLs. The original Python `Path.as_uri()` spelling used `%40` and was refused
by the unchanged native preloader. No consumer check, builtin, module source,
physical path, signature or existing failed profile is replaced.

Its [32 actual pure controls](../qualification/node-file-url-profile.actual-local-result.json)
cover URL spelling, unsupported paths, complete inventories, exact versions,
source drift, alias refusal and closed bare bindings. These controls run Python
and do not execute SDK, SQL, sockets, keys, signatures or nonce work. The later
native observation independently verified 134 application files, 404 installed
package files and all nine selected bare-import edges before entering the case.
The versioned Node reference is [pathToFileURL in v24.19.0](https://github.com/nodejs/node/blob/v24.19.0/src/node_url.cc).

The [route-scoped response writer](../src/x402-issued-application-response-writer.js)
preserves the funding POST-v1 exact `Vary: PAYMENT-SIGNATURE` contract. Service
and unclassified responses keep `PAYMENT-SIGNATURE, Authorization`. Protected
headers cannot be overridden by optional frame headers; unavailable responses,
invalid routes, accessor/proxy records and write exceptions never report a
successful local end entry. The [32 actual writer controls](../qualification/issued-application-response-writer.actual-local-result.json)
use declared response capabilities and builtins only. They do not import the
funding client or execute HTTPS, SDK, SQLite, signatures or nonce work.

## Actual clean result and repair boundary

The [retained native result](../qualification/sdk105-issued-command-application-v3.clean.actual-local-failure.json)
reports one clean case, zero passes and one failure, with complete captured
streams and zero stderr. It belongs to the exact application selection at
[development candidate 3d952b51](https://github.com/edgepillar/zenon-x402-poc/tree/3d952b51306b5055049bf4329c92a2e0451319bf).
The original application graph, preloaders, controller, manifests and earlier
failure remain unchanged. The native host/storage adapter remains private;
public commitments do not expose its machine paths or fixture contents.

Source review found a deterministic mismatch: the combined application's
funding response writer added `Authorization` to `Vary`, while the exact funding
client accepts only `PAYMENT-SIGNATURE`. The first actual transport refusal was
not captured, so this source finding is not relabeled as an observed HTTP trace.
The new writer fixes that wire contract at the server, without weakening the
client or changing an UNKNOWN record.

The explicit V2 application source uses this writer only after route validation.
It remains on the development branch at
`src/x402-official-issued-funding-post-native-application-v2.js`; the old V1 file
and default payment paths stay unchanged. The complete V2 SDK/HTTPS/SQLite
composition is **NOT_EXECUTED**, and no old native permission transfers to it.

Next acceptance is a separately scoped corrected full composition, then pending,
response-loss/exact-original behavior and P2 interruption/recovery. Keep economic
pilot, physical resource release and sustained native capacity separate. The
hosted 108-control workflow is unchanged and does not run these new local controls;
a later green CI result is not a P1 native pass.
