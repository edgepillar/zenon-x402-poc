# Owner admission at native request construction

The actual API-credit source creates one opaque guard from its selected budget
file owner and captured monotonic clock. It passes that same guard through the
fixed funding/service constructor to both native HTTPS adapters. Public product
JSON cannot select a guard, clock, opener, callback or module. Legacy exports and
their configuration shapes retain their existing behavior; the application
selects the mandatory guarded path for funding and service.

The outer application already checks current ownership before command entry.
An asynchronous child can outlive that observation. Each guarded native adapter
therefore admits its exact URL/method/header/signal input first, then checks the
same selected owner immediately before reserving/constructing a native request.
It observes a clean OPEN file view, requires a synchronous undefined receipt
from the existing current-token/epoch check, and observes a clean view again.
No owner is learned, acquired, advanced or transferred by the guard.

Guard time consumes the existing requestDeadlineMs budget. Negative, malformed,
regressed or expired clocks refuse before request entry. The native request
timer uses the returned remaining milliseconds, rather than a fresh full
budget. Whole-millisecond rounding is less than one timer quantum; native
constructor/setup time and OS scheduling are not a hard lifetime guarantee.
The signer retains its separate unchanged 1000 ms read-to-signer window.

After the guard, each adapter rechecks its own close/admission/count state; the
funding adapter also rechecks abort. A refusal occurs before request-start
counting, native request/socket ownership, abort-listener attachment or request
timer creation. It cannot leave a fabricated native handle to close. The guard
stays HELD across funding and service after refusal, reentry or an uncertain
receipt. A supported native Promise rejection is observed without awaiting it;
late resolution cannot upgrade the first refusal or authorize retry.

An unused native transport can still close and release its own local CA after a
pre-entry veto. That receipt cannot release the borrowed budget file or prove
service delivery. The guard owns no native stop, DB close, retry or replacement
capability. It exposes only bounded historical counters and NONE authority.

This check is at native request construction. It cannot cancel an entered
request or independently fence a later end()/kernel send. The current service
dispatch source calls end synchronously, without an await after requestImpl.
Another process can change ownership after any point-in-time check: atomic
cross-process dispatch fencing remains OPEN. Native request/end timing, SQL/SDK
cutpoints, process restart, physical release and Linux also remain unqualified.

DATA controls execute the guard and actual outer application/spending source
with declared file/CAS/clock/asynchronous-child/wire ports. They do not execute
the native HTTP adapters. Those adapters and their actual constructor selection
are source/parser checked only. No TLS/socket, SQLite, SDK package, key,
cryptographic signature, nonce search, real PREPARE or payment is run. Existing
native receipts retain their original source scopes and are not promoted here.
