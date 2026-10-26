# Offered-window clock return fence

The offered-window owner now revalidates its captured Promise contract after the
trusted monotonic clock returns. A changed contract cannot use the returned
timestamp to admit a new timer, balance callback, service call or ledger
observation. Existing originals retain their pending/HELD accounting.

The source parent is c2c9ed9b1e663a69a780c3f12ba463fe6af88317; the reviewed main
base is cb273da6c09b8ad58658eef716e06d090f422460. Exact runtime and development
profile bindings, before/after observations and actual control stream receipts
are in the [local result](../qualification/service-credit-capacity-offered-clock-return-fence.actual-local-result.json).

## Confirmed behavior

The previous owner checked Promise intrinsics before calling its injected clock,
then used the result without checking whether that callback changed the contract.
Twelve actual synthetic cases reproduced one unintended entry each. Depending on
the clock boundary, this was a timer installation, balance callback, service call
or ledger handle. The later HELD result did not undo that earlier entry.

The correction performs the same invariant check again before accepting the
timestamp. Twelve corresponding cases now admit no new work under the changed
contract. All remain HELD. A service original that had already entered before its
ledger-clock failure remains pending; the fix does not replace it, retry it,
invent closure, or upgrade its historical result.

The tests change only descriptor enumerability for the captured Promise then,
constructor and species descriptors. They cover initial setup, precheck,
dispatch and ledger clock returns. Each descriptor is restored in the same
process before its case ends. These are trusted-callback protocol controls,
not an external-network test or a claim that arbitrary runtime mutation is safe.

## Actual local validation

- Thirteen focused scenarios passed after the correction: one healthy baseline
  and twelve changed-contract cases. The baseline still dispatched three calls.
- All 67 existing offered-window cases passed, including the 16-lane/4,096-slot
  virtual overload, independent arrivals, unknown originals and bounded drain.
- All 45 existing workload-composition cases passed with the genuine inner owner.
- All 311 development pipeline DATA cases passed, with zero failures, errors or
  skips. Its source-only gate read 160 current application files and zero
  installed-package files. Python audit counters recorded no child process,
  socket, SQLite connection, write open, outside-source read or mutation.

Node 24.19.0 executed the runtime controls in separate filesystem-permission
restricted DATA processes. Python 3.12.14 executed the existing audited metadata
suite. All selected source identities matched before and after their command.
No OS/network sandbox, native workload or live-operation proof is claimed.

The corrected regression stdout was 4,185 bytes, SHA-256
35b24453cb7f3185694c79744d73b4d75618bdd7589d61ed092a49eca8942a6e.
Complete actual outputs are retained privately once; public receipts expose only
their counts and digests.

## Source integration and main scope

The forward development selection binds the corrected window source into the
same full 160-application/404-package parent graph. Exactly one application row
changed; the 153-application child graph and all 404 package rows are unchanged.
The parent manifest, producer, resource/command/capture bindings and launcher
selection were updated together. Native effects, resource policy and authority
flags did not expand. Historical result files remain unchanged and refer to
their original source revisions.

The main candidate contains only the existing runtime correction, focused
regression entry, this report and its result JSON. Development profile and native
launcher changes remain on the development branch. The existing approved hosted
CI profile remains 27 controls; it does not execute this new regression entry.
Observe the transferred main commit's own CI result separately.

No SDK/x402/Noble import, SQLite file, key, signature, nonce search, socket, TLS
endpoint, task-storage task or native application was used. Existing clean/R4
native allowances were not consumed. Native P1/P2/P4, runtime/operator/economic
acceptance and production qualification remain open.
