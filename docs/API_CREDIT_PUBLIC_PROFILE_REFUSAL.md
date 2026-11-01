# Public-profile admission refusal: source candidate

The fixed API-credit coordinator records `publicProfileAdmission` as
`NOT_ATTEMPTED`, `REFUSED` or `ACCEPTED`. Only an exception from the actual
selected public bootstrap decoder records `REFUSED`. Failed or expired reads,
invalid byte views and malformed UTF-8 do not become decoder observations.
`credentialReadEntered` is set immediately before entering that credential port;
key and application-opening entry flags retain their existing meanings.

RUN emits the constant terminal stderr marker
`API_CREDIT_OPERATOR_PUBLIC_PROFILE_REFUSED` only for a frozen, own-data result
with `BOOTSTRAP_REFUSED`/exit 1, PROFILE stage, a decoder refusal, no credential,
key or application-opening entry, a known clean input stop and no key lease.
The source has no private reason, profile bytes, path, proof or credential in
that marker. Other known bootstrap refusals keep the existing generic marker.
Unknown closes keep exit 4 and their existing marker. Success and every command
reply/close protocol are unchanged. The result predicate uses captured plain-data
intrinsics; it invokes no getter, proxy hook, owner or cleanup callback.

This distinction prevents a valid profile followed by credential EOF from
passing a changed-offer rejection scenario. It does not authenticate the
metadata or caller, establish physical release or key erasure, authorize retry,
or resolve a payment/grant outcome. The coordinator's actual state selects the
marker; a fabricated DATA object supplies no operational authority.

The Linux V7 candidate adds one fixed RUN attempt with the independently selected
purchase offer version changed, the original challenge retained, and empty EOFs
on credential/command pipes. It provides no credential bytes or commands and
requires no result-pipe output, the specific terminal marker, exit 1 and complete
EOF before the provider journal, TLS material or credential file is entered.
The existing independent positive profile must still complete its actual
one-grant/100-request scenario and exact replay. Package/runtime/context errors,
generic bootstrap refusals and CLOSE_UNKNOWN do not pass the negative attempt.

The handoff layer already compares the exact externally supplied original
checkpoint, pins and challenge with its retained original before custody read or
grant lookup. That comparison is unchanged. Different-payment handoff acceptance,
concurrency, interruption and physical release remain separate open requirements.

Current qualification is pure coordinator/result DATA and source/parser review.
For this revision, the actual CLI and Linux harness, SDK/core, SQLite, pipes,
keys, signatures, sockets and payments remain unexecuted. V7 is an unexecuted candidate;
G0-G5 remain OPEN.
