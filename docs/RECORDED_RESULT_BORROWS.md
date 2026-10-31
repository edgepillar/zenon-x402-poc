# Recorded response inspection and read ownership

The recorded-response wrapper inspects the current application before reading
the original service result. A declared synchronous inspection can request
close and still return its earlier OPEN snapshot. A read callback can also
request close before returning its receipt. The wrapper must account for both
borrowers before it admits more work or enters the original child stop.

The wrapper now tracks inspection and record-read callbacks before entry. It
rejects nested work while either callback is active, checks close and held
state after inspection, and checks the same state after the record read.
Calling close caches the original stop request immediately. Child close waits
until the synchronous borrower returns and is requested at most once.

A throwing, opaque, proxy or accessor-bearing receipt cannot establish that
the borrower returned the required synchronous data. The wrapper retains the
receipt, remains HELD and rejects the cached close with CLOSE_UNKNOWN without
starting a competing child stop. It does not assimilate thenables. A late
promise result cannot clear HELD, request another stop or admit another call.
An ordinary original-request conflict remains a nonfatal refusal: the exact
retained original response can still be replayed.

The input and result schemas, CLI, request budgets and economic authority are
unchanged. First observation reports `replayed: false` and
`newDispatchRequested: true`; original replay reports `replayed: true` and
`newDispatchRequested: false`. Response bytes, payment identity and retained
model/spending state stay unchanged, with one reference execution.

The controls use the actual recorded-response, product and reference owners
over declared memory application/read ports and cooperative component timers.
They do not execute installed SDK packages, SQLite, sockets, keys, signatures,
nonce search, actual PREPARE, payments or native application entry points.
These controls do not establish physical resource release, native reopening,
Linux acceptance or economic delivery. G0-G5 acceptance gates remain OPEN.
