# API credit RUN module admission source candidate

This is a source and pure DATA result. The native reader, synchronous Node
hooks, ordinary installed namespace, CLI and Linux entry remain unexecuted.
G0/G1/G2 acceptance stays OPEN. Existing native qualifications retain their
original source and controlled-resolver scope.

## Fixed byte policy before credential acquisition

RUN uses `src/api-credit-native-package-admission.js` after argument, runtime
and visible context admission. It reads the fixed catalog next to that source,
checks its compiled byte count and SHA-256 before parsing, then eagerly admits
every listed file. There is no path or policy input from a descriptor, argv,
environment, package lock, old cache or operator JSON. Missing ordinary
`node_modules` is a refusal, never an instruction to install or use a cache.
Keyless inspection keeps its separate SDK-free graph.

The catalog contains 555 rows: 150 application files, root `package.json` and
404 retained package-source files. The package rows span 69 package roots,
including nested versions, and match the current lock's corresponding versions.
This is a reviewed selection; the lock, version labels and an old reachable
subset do not establish a complete ordinary installation. All resolved/loaded
non-builtin targets must still be catalog members. Nine direct SDK/core/Noble
edges also have exact parent/specifier/target contracts, including four fixed
imports in `api-credit-native-package-entries.js`. The CLI dynamically imports
that entry under the guard before importing/calling the operator launcher.
This eagerly loads the package entries without constructing a key or client.

The source reader bounds regular-file reads, rejects observed symlink ancestors
and multi-link files, compares path/descriptor identities around each read,
requires exact bytes and EOF, and closes each opened descriptor once. It also
checks every existing ancestor `package.json` inside the project root against
the catalog; unexpected metadata is refused. A close failure retains the known
descriptor privately as UNKNOWN. There is no automatic close retry or cleanup.
These are cooperative observations, not atomic filesystem exclusion.

## Ordinary resolution and actual loader source

[Node 24.19 synchronous hooks](https://nodejs.org/download/release/v24.19.0/docs/api/module.html#customization-hooks)
can be registered programmatically before subsequent dynamic imports. Static
imports of the bootstrap have already run. The fixed binding uses
`registerHooks`, delegates the same arguments/context to `nextResolve` and
`nextLoad`, and returns the identical admitted result objects. It supplies no
bare-import overrides, source replacement, format transformation or builtin
aliases. Synchronous hooks also expose CommonJS source through `nextLoad`.

The pure guard rechecks selected source bytes around loading and compares the
actual returned source bytes, final format and optional response URL with the
catalog. Only genuine builtins delegated to their normal canonical `node:` URL
are admitted as builtins. Unlisted resolved modules, including optional native
addons or global-folder targets, are sticky refusal. An ordinary lookup that
throws without producing any target propagates unchanged; this permits a
package's normal missing-optional-dependency fallback without admitting code.

Caught refusal does not reset the guard. The CLI checks its state after launcher
import and before invoking any function that can adopt pipes or read the key.
Unknown ownership, reentry and loader uncertainty stay UNKNOWN. Hook ownership
is retained for the process lifetime, with no deregistration or retry API.

## Bounds and trust premises

The pure guard caps the catalog at 1024 rows, 8 MiB total source and 1 MiB per
file. Its lifetime limits are 8192 source reads/64 MiB declared source bytes,
32768 resolutions and 8192 loads. The native reader separately caps 32768
file reads/64 MiB planned allocations and 65536 read calls, including metadata.
These are resource bounds, not wall-clock deadlines or OS-enforced quotas.

The Node executable, already-executed CLI/bootstrap sources, these two guard
modules and the deployment's protection of their compiled catalog pin remain
trusted control plane. The catalog cannot authenticate its own checker. The
visible context gate cannot undo preloads, authenticate process metadata or
detect all hidden hooks/caches. The guard is not a hostile-code, worker, network
or permissions sandbox; it does not restrict general builtin capabilities.
Future source/dependency changes require a new reviewed catalog and pin.

## Evidence boundary

The DATA entry exercises the actual pure guard with declared in-memory byte,
resolver and loader ports. It never evaluates those source bytes, imports a
package, touches an installed namespace, opens a file or registers a hook.
Native files receive parser/source-contract checks only. The unchanged 108
hosted controls are a separate profile and do not include these new controls.

A new source-bound ordinary-install/native/Linux qualification is still needed
before claiming runtime acceptance. No SDK construction, signature, SQLite,
socket, nonce search, PREPARE, payment or live pilot is authorized by these
source/DATA results.
