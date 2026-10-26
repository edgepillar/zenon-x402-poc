# Current issued-funding close V5 source candidate

V5 gives the issued funding -> Dynamic Plasma -> V6 -> grant -> service close
case a separate source selection that includes the current clean-close
reference-release implementation. The existing V4 case, manifest, producer,
allowances and evidence keep their original source bindings.

The reviewed main source parent is
ef7df9c1ab953bea3501edeefb1ce64946463ecb. Exact source pins and actual local
results are recorded in the
[source result](../qualification/issued-current-close-v5.source.actual-local-result.json).

## Implementation

The V5 producer expands the preserved, pinned V4 producer and full baseline,
then applies exactly three declared replacements: the current read-close
coordinator and separate V5 case/preloader files. The complete selection remains
123 application files and 404 unchanged package rows. Existing grant and RPC
fixture sources are reused. Counts, total bytes, the full source digest and
all ten bare-import edges must match; a smaller or different graph is refused.

The source-only CLI verifies the 123 real application files against their exact
content, Git blob and nine-field filesystem identities. It checks these
identities again before returning. It reads no installed package, creates no
profile file or managed task, and provides no native execution option.

The in-memory profile builder requires all 527 caller-declared inputs. It
refuses unknown, missing or duplicate paths, noncanonical URLs, mismatched
content or runtime pins, linked files and physical identity aliases between
inputs, roots and Node. Returned selection rows and profile bytes do not share
mutable caller data. The complete profile is serialized once per builder call
and refused if its encoded size exceeds 512 KiB. This is an output limit, not
an operating-system memory or network sandbox.

The synthetic registry used in these tests produces a 157,115-byte candidate
profile in memory. These declared identities are test data. A future native
launcher must capture and verify the real installed files, runtime and resource
admission independently. The producer does not turn supplied facts into native
authority.

## Actual local controls

The final isolated Python control passed 65 cases with no failures or skips.
They include real application-source verification, unchanged package rows,
detached returned data, single serialization, size refusal, recomputed-manifest
mutations and conflicting registry identities. The source-only CLI also passed
against the final manifest. Audited effects in the DATA suite recorded zero
children, sockets, SQLite connections, write opens, mutations or outside-source
reads.

The first revision passed 63 cases. Review then identified two missing
Node-to-root alias refusals; the fix and two new cases passed in the final
65-case run. Both actual revisions are retained privately. The two V5 JavaScript
files passed Node 24.19.0 parser-only checks. Their exact bytes and filesystem
identities remained unchanged after the Python-only correction, so those
parser results were reused instead of running them again.

No native case or package import ran. There was no SDK execution, SQLite,
key generation, signature, nonce search, TLS/socket connection, storage-root
inspection or storage admission. No old finite native allowance was consumed.
The new V5 manifest explicitly records NOT_GRANTED native authority. Syntax
checks establish parsing only; these results do not establish native namespace
resolution or funding/service behavior.

## Remaining work

V5 role/parent launch selections and managed native admission still require
their own source bindings and review. Existing P4 role/parent manifests remain
bound to their earlier V4 source graph. They were not upgraded by this change.
No executable native launcher or native capture command was added here.

This increment is suitable for the development branch as reviewed source and
local DATA evidence. The main workflow and its approved 27-control profile are
unchanged; they do not run these new controls. Current-source native integration,
operational and economic acceptance, live payment and production qualification
remain open.
