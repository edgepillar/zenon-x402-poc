# Existing-key ownership at the operator boundary

`createSdk105ApiCreditExistingKeyLease` owns one exclusive already-existing SDK
KeyPair. It invokes no key method during construction and adds no key derivation,
secret input, module loader or environment default. A repeated lease for that
same key object is refused, including after close. Unknown leases have a finite
16-owner retention limit.

The fixed native application claims a branded handle synchronously before
constructing its actual SDK wallet owner, then binds that exact returned owner
before opening the native funding/service client. Bare existing keys retain the
previous programmatic ownership contract. Operator JSON cannot choose a wallet
owner or invoke this internal binding.

Before native claim, launcher close revokes claim admission first and calls the
captured SDK clear method once. A late opening therefore cannot claim a key
after that cleanup. After claim and wallet binding, launcher close delegates to
that original wallet owner's stop. It never raw-clears in competition with an
active wallet operation. The actual wallet owner remains responsible for joining
its operation and retaining any returned original signing DATA before clear.

A claim without a returned wallet remains HELD. If that wallet arrives late,
it is stopped once; its cleanup facts can be recorded, but the original UNKNOWN
close cannot become success or authorize another opening. Malformed promises,
thenables, thrown/non-void clear returns and unproved owner stops remain HELD
without retry. A clean-looking wallet snapshot cannot replace the actual single
clear receipt. No key material or signature is exposed by lease inspection.

The source usage is an ownership sequence: create the lease around an existing
exclusive key, supply only its `keyPair` handle to the fixed product entry, and
join `lease.close()` on success or refusal. The lease delegates after native
transfer; callers must not independently clear or continue using other key
aliases. Descriptor checks cannot enforce that cooperative exclusivity premise
against trusted code which already possesses the original key.

Current qualification uses declared JavaScript method ports, including methods
named getAddress/getPublicKey/sign/clear. They are counters and constant DATA,
not an SDK KeyPair, key construction, cryptographic signing or memory-erasure
test. The actual native application's integration receives parser checks only.
An SDK clear return is not proof of physical erasure, signer recovery, funding,
delivery or native release. Native execution remains disabled by user
instruction; the operator secret/bootstrap and single shell launch command,
native SDK/core/SQLite/HTTPS, Linux and G2 acceptance remain open. The required
108-control hosted CI lane is unchanged.
