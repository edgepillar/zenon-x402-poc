# Same-run stop for recovery inspection

The fixed API-credit source launcher now subscribes to SIGINT and SIGTERM
before adopting either inspection pipe. Each entered subscription has its
matching removal, including a partially failed subscription. A stop observed
before adoption cannot open the pipes. Unknown subscription/removal outcomes
retain the same failed-launch frame; they establish no physical release.

The existing coordinator frame now exposes a frozen `run` and `requestStop`
controller for each of the five existing modes: recovery history, signer
history, recorded result, funding history and original grant query. Command
arguments, profile schemas, output schemas and fixed native bindings remain.
The previous asynchronous `run...Coordinator` exports retain their signatures
and immediate entry through the same implementation.

The controller reserves its one run promise before clock, timer or inspection
port entry. Reentrant and repeated calls join that promise. `requestStop`
synchronously revokes the current stage guard. A pre-entry stop prevents the
profile read; a stop from the first clock prevents startup timer entry. A stop
from timer arming still retires the actual returned timer handle once.

Entered inspection or output stays unknown. Late profile bytes, inspection
results and write completions cannot start another stage, repeat output or
upgrade the stopped result. The existing coordinator requests its channel close
once under the same absolute close window. Timer cancellation and callback
latency cannot renew that window. A stop while closing remains CLOSE_UNKNOWN.
A stop after a terminal receipt leaves that immutable historical receipt intact.

This controller does not cancel or raw-close an opaque native inspection.
The same existing inspector owns its file/query/profile cleanup and receives
the revoked guard. A profile transferred to that inspector remains under its
custody until it returns. No second opener, key access, payment, grant authority,
service dispatch, output retry or recovery mechanism is introduced.

The twenty new DATA controls execute the actual pure coordinator and codecs
over declared memory channel and timer ports. Early-stop/profile-wait controls
cover every named mode; current-stage controls cover inspection, output,
reentrant run, timer arming and retirement. Existing affected DATA entries retain
their complete case sets. Native launcher source is parsed only.

Actual signals, FIFO adoption, SDK/core packages, SQLite, sockets, keys,
signatures, nonce search, PREPARE, payment, process interruption/reopening and
native release have not been executed by these controls. Linux and G0-G5
acceptance remain open. The separate approved 108-control hosted selection and
its 22 pinned inputs remain unchanged.
