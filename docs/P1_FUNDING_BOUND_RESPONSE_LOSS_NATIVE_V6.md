# V6 funding response-loss: failed native attempt

The single authorized V6 funding-response-loss attempt executed and failed. The
native Node command exited 1 with complete captured output. Test TLS generation
exited 0. The owned task is CLOSED / FAILURE; this is not physical resource
release evidence.

The failure is an assertion in `closeFundingLossOwners` at line 365 of the pinned
V6 case: the fixture expected four total commands and observed three. Source
review finds exactly three issued commands: prepare, commit and submitFunding.
The session close method is not an input command and does not increment that
counter. The fixture and its result decoder require a reviewed count correction.
The later close assertions and completed-case result were not reached; correcting
an expectation does not turn this failed native attempt into a passing one.

The exact source selection is retained in the
[V6 source manifest](https://github.com/edgepillar/zenon-x402-poc/blob/dbb31c8c32107f6829a2bfbe609d422dcf74a61d/qualification/sdk105-issued-command-application-v6.inputs.json).
The profile used Node 24.19.0 on darwin-arm64, 135 application files and 404
installed-package files. Original application sources were not transformed.
The sanitized [attempt result](../qualification/sdk105-issued-command-application-v6.funding-response-loss.actual-local-result.json)
retains the source, runtime, command-stream and private-evidence digests.

The one-shot scope permitted four new synthetic SQLite paths, one independent
pin file, two in-memory synthetic Ed25519 keys and one transaction signature;
no capability/provider signature or grant creation. It permitted one test-TLS
OpenSSL command and one Node command without Node children, loopback only,
at most 182 connections and 65536 aggregate nonce candidates. These are approved
ceilings, not measurements of effects that the failed case did not emit.

Original failed task files and streams remain preserved. The finite native
allowance is consumed; no native retry, force-close or same-file reopen was
performed. Funding response-loss acceptance, complete same-original recovery,
physical resource release and production readiness remain open. The separate
purchase/recovery component's DATA tests do not qualify this native attempt.
