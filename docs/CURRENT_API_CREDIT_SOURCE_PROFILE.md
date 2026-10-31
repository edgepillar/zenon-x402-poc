# Current API-credit source profile

The builtin-only source checker compares reviewed buyer/provider source bytes
without importing an application or installed package. Obtain the manifest
SHA-256 independently from the reviewed change. No installation is needed.

```sh
node scripts/report-current-api-credit-profile.mjs --profile-sha256 DIGEST
```

Replace `DIGEST` with the current manifest SHA-256:
`429fda55fb56fa17e70004f70d16cc83b4026bcb2580c28c235a0bbab58a7846`.

The current manifest selects the V69 buyer-stop candidate delta over source
parent `85903bdbffcfcb09529df4b9c1541756d1556eb0`, both catalogs, three extra
admission/guard sources and the application DATA result (568 executed / 1,347
retained exact controls; 1,915 source-bound application controls). The planned
application source union is 240 files / 3,333,829 bytes. The 404 package rows
per catalog are compared only as metadata. Installed files are not opened.
The parent reference is not a claim that its tree already contained the delta.

The unchanged checker/core have [44 retained DATA cases and a prior complete
source observation](../qualification/current-source-profile.actual-local-result.json).
That full observation covered the earlier manifest
`5a04a6bb346cc908edb329cb24ee0a4a9ff92cfac6af206afae6c258ccdbc432`
and its 240 files / 3,330,336 bytes before the buyer-stop delta. It is not a
fresh full observation of this changed candidate.

[The current metadata-plan command](../qualification/buyer-stop-current-profile-plan.actual-result.json)
checked the new manifest/catalog/DATA references with the actual unchanged
reporter core. It read zero application-source files and ran no source-check
shards. This verifies the current reference contract, not full source coverage.
The application DATA and both source catalogs were reviewed separately.

For a complete observation, use the command above or disjoint zero-based
`--shard 0/8` through `--shard 7/8` commands with the same current digest. Retain
the actual complete outputs and place all eight receipts in a JSON array.
Combine them using:

```sh
node scripts/report-current-api-credit-profile.mjs --profile-sha256 DIGEST --merge-receipts qualification/receipts.json
```

Combination requires every shard once with the same profile, baseline and
exact source coverage. Receipts are metadata, not signed attestations. Keep
their actual origins separately. Combination rereads the catalog/DATA references
but does not reread application files. Earlier-profile receipts cannot be
relabelled or mixed into a current-profile full match.

The reader bounds reads, rejects links/non-regular/multiply linked files,
checks before/open/after file and ancestor identities, and closes its own
file descriptors without writing files. These are cooperative checks, not an
atomic snapshot, source/Git/publisher authentication or an OS sandbox.
A failed shard consumes its attempt; a later run is a separate observation.
SOURCE_MATCH is byte identity only. It does not authenticate a runtime,
installed namespace or accepted application entry. Native SDK/core/SQLite,
keys/proofs/signatures, sockets, nonce, PREPARE/payment and Linux/product
acceptance remain unqualified. All G0-G5 gates remain OPEN.

## V70 command admission after stop

The [V70 delta](../qualification/profiles/api-credit-application-source-v70.json) binds the synchronous same-session stop and one remaining parent observation window. 13 new and 568 affected DATA controls passed; 1,347 retain exact source/runtime bindings, for 1,928 source-bound application controls. One parser command passed; 49 current application sources have parser proofs. The unchanged approved hosted selection remains 108 controls and excludes the new local cases. Native/Linux, physical release and G0-G5 acceptance remain OPEN. The metadata reference plan is validated separately; the earlier full source observation retains its original source/manifest binding and is not relabelled as current coverage. The unchanged reporter core retains its separate 44 DATA controls.

## V71 recovery application admission

The [V71 delta](../qualification/profiles/api-credit-application-source-v71.json) binds child-inspection borrowing, post-inspection admission checks and the deferred original child close. 15 new and 718 affected DATA controls passed; 1,210 retain exact source/runtime bindings, for 1,943 source-bound application controls. One parser command passed; 49 current application sources have parser proofs. The unchanged approved hosted selection remains 108 controls and excludes the new local cases. Native/Linux, physical release and G0-G5 acceptance remain OPEN. The metadata reference plan is validated separately; earlier full source observations keep their original source/manifest binding. The unchanged reporter core retains its separate 44 DATA controls. See [the recovery contract](RECOVERY_APPLICATION_ADMISSION.md).

## V72 recorded response borrow ownership

The [V72 delta](../qualification/profiles/api-credit-application-source-v72.json) binds inspection/read admission, deferred original close and retained unknown receipts. 15 new and 1,534 affected DATA controls passed; 409 retain exact source/runtime bindings, for 1,958 source-bound application controls. Two parser commands passed; 49 current application sources have parser proofs. The unchanged approved hosted selection remains 108 controls and excludes the new local cases. Native/Linux, physical release and G0-G5 acceptance remain OPEN. The metadata reference plan is validated separately; earlier full source observations retain their original source/manifest binding. The unchanged reporter core retains its separate 44 DATA controls. See [the recorded-response contract](RECORDED_RESULT_BORROWS.md).

## V73 recovery response provenance

The [V73 delta](../qualification/profiles/api-credit-application-source-v73.json) binds the shared pure original/dispatch-intent validator to recorded-result recovery before local response bytes are projected. 23 new and 1,549 affected DATA controls passed; 409 retain exact source/runtime bindings, for 1,981 source-bound application controls. Two parser commands passed; 49 current application sources have parser proofs. The unchanged approved hosted selection remains 108 controls and excludes the new local cases. Native/Linux, physical release and G0-G5 acceptance remain OPEN. The metadata reference plan is validated separately; earlier full source observations retain their original source/manifest binding. The unchanged reporter core retains its separate 44 DATA controls. See [the recovery response contract](RECOVERY_RESPONSE_PROVENANCE.md).

## V74 provider wire-route alignment

The [V74 delta](../qualification/profiles/api-credit-application-source-v74.json) binds the fixed receipt provider to the existing buyer/server service-credit wire route. Product identity and one-unit pricing remain. 8 new and 155 affected DATA controls passed; 1,826 retain exact source/runtime bindings, for 1,989 source-bound application controls. One parser command passed; 49 current application sources have parser proofs. The unchanged approved hosted selection remains 108 controls and excludes the new local cases. Native/Linux, physical release and G0-G5 acceptance remain OPEN. The new controls compose actual wire capture and provider callbacks with one declared mock reference grant, including 100 distinct requests, replay, reconstruction and held/unknown budgets. The metadata reference plan is checked separately; prior full source observations retain their original binding. See [the wire contract](PROVIDER_WIRE_ROUTE.md).

## V75 explicit service-command helper

The [V75 additive delta](../qualification/profiles/api-credit-application-source-v75.json) assembles existing service requests through the actual wire grammar and command codec. Explicit replay changes only the command correlation ID, preserving the frozen original input and byte limit. 12 new DATA controls passed in one local command; 1,989 prior controls retain exact source/runtime bindings without reexecution, for 2,001 source-bound controls. The unchanged hosted selection remains 108 controls and excludes these new local cases. No parser-only or native command ran. Native/Linux, physical release and G0-G5 acceptance remain OPEN. The helper is outside both unchanged native entry graphs; the native source plan remains 240 sources and 3,337,054 bytes. Its own source and DATA graph are separately pinned. See [the helper contract](API_CREDIT_SERVICE_COMMAND.md).

## V76 explicit non-DP fusion-only policy and draft

The [V76 additive delta](../qualification/profiles/api-credit-application-source-v76.json) starts the independent non-DP product path required by the roadmap. It adds the existing PlasmaStrategy SPI for declared PRE_DP UserSend observations, base-fusion-only allocation and a shared-codec unsigned draft. It refuses DP activation, work, resource shortage, changed intent/base/runtime and expired height windows without repricing or fallback. 24 new DATA controls passed in one local command; 2,001 prior controls retain exact source/runtime bindings without reexecution, for 2,025 source-bound controls. The unchanged hosted selection remains 108 controls and excludes these new local cases. No parser-only or native command ran. Native non-DP entry binding, Linux acceptance, physical release and G0-G5 remain OPEN. The source component is outside both unchanged native entry graphs; their plan remains 240 sources and 3,337,054 bytes. Native read/sign/store/recovery ownership still needs connection. See [the contract](NON_DP_FUSED_PLASMA_STRATEGY.md).

## V77 fixed non-DP native source connection

The [V77 delta](../qualification/profiles/api-credit-application-source-v77.json) brings the existing three non-DP components into the fixed buyer source graph. Its 177-source buyer graph and unchanged 104-source provider graph form a 243-source union with the three fixed supplemental admission/guard files, totaling 3,381,087 bytes. All 404 installed-package catalog rows and bare import edges retain their previous pins. The two-field retained read-options object keeps its identity; the void current-owner check is borrowed through a private candidate view. The SAME real preflight and genuine V6 atomic method remain in source. 12 new and 64 affected DATA controls passed in one local command; 2,025 prior controls retain exact command-input/runtime matches without reruns, for 2,101 distinct source-bound controls. Twelve parser-only commands passed across the source change and catalog repin; 51 current sources have parser receipts. The approved 108-control hosted selection is unchanged and excludes the new DATA cases. Native application execution, Linux acceptance, physical release and G0-G5 acceptance remain unestablished. [The metadata reference plan](../qualification/non-dp-native-current-profile-plan.mjs) reads metadata only. Historical observations retain their original source binding; native runtime admission, signing/persistence and recovery require separate authorized evidence.

## V78 non-DP configuration and private selection custody

The [V78 delta](../qualification/profiles/api-credit-application-source-v78.json) removes unused DP work fields across the actual fixed operator/coordinator/bootstrap, product and generic selection, SDK configuration capture, application and native-client source chain. Explicit named DP entries retain their work grammar. The buyer remains 177 sources, provider 104 and union 243 sources, now 3,386,931 bytes. Provider, all 404 package rows and bare edges retain their pins. 29 new and 760 affected DATA controls passed; 1,341 unchanged controls retain exact current command-input/runtime matches, for 2,130 distinct source-bound controls. Five parser-only commands passed; 51 current sources have parser receipts. The approved 108-control/22-input hosted selection is unchanged and excludes the new DATA cases. Native application execution, installed namespace, Linux, physical release and G0-G5 acceptance remain unestablished. The [metadata reference plan](../qualification/non-dp-configuration-current-profile-plan.mjs) is separate from native qualification. Parser provenance now points directly at verified command origins while preserving the original wrappers and failed/unknown evidence; no historical data was deleted. See [the source contract](NON_DP_OPERATOR_CONFIGURATION.md).
