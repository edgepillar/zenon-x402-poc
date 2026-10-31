# Explicit non-DP operator configuration: source draft

The fixed first-product source selects the named non-DP coordinator, bootstrap,
product token, application and native funding client. A JSON field, a zero
difficulty reply or a failed DP attempt cannot select this path. V78 repins the source catalogs to this candidate. Native application
qualification remains NOT_EXECUTED. Catalog equality and passing DATA controls
do not establish native acceptance. G0-G5 remain open.

The funding configuration has these public DATA fields:

| Boundary | Fields |
| --- | --- |
| Public bootstrap product | `readSessionOptions`, `expectedPublicKey`, `expectedAddress`, `deadlineMs`, `fundingTransportOptions` |
| Operational capture | `readSessionOptions`, `expectedPublicKey`, `deadlineMs`, `fundingTransportOptions` |
| Existing-key selection | The public bootstrap fields plus the SAME explicit `keyPair` capability |
| Native client | The operational fields plus the SAME owned `wallet` capability |

No nonce, material exchange, difficulty, attempt count or work wait is required
or synthesized. Such extra fields are refused, including accessors, before
credential acquisition in the fixed coordinator. The canonical 32-byte public
key is public identity DATA; it is not a private key or proof that the existing
key owns that identity. The SAME native wallet owner must verify the existing
key later. These changes do not derive or create a replacement key.

Public endpoint grammar, two distinct read routes, the one-start funding POST,
CA equality, request/handshake/close deadlines, separate spending/funding roots,
the fixed offer and the 100-call service floor retain their existing checks.
Explicit non-DP preparation still requires its three-field resource policy
and a current observed PRE_DP context. Configuration admission neither
authenticates the chain/rules nor grants permission to sign or send.

Both selection WeakMaps retain their source-selected lane privately. DP and
non-DP consumers refuse a token from the other lane before consuming it; a
copied object cannot become a selection. The genuine token still has the same
one-use consumption, CA-copy custody and release owner. No lane flag or factory
is accepted from public DATA. The existing named DP entry points keep their
original work grammar.

The actual native application continues to use the original key lease,
age/context signer owner, wire/store owner, spending file, original packet,
payment preflight and V6 atomic commit/readback. Stop/close ownership and
UNKNOWN/HELD behavior remain with those existing owners. No dispatch, retry,
replacement, re-signing, grant issuance or new recovery authority is added.

The new controls exercise inert configuration/selection owners and the actual
coordinator with declared memory ports. Dummy credential-shaped bytes are
ordinary test DATA passed to a declared callback, never an installed SDK or
cryptographic constructor. Four native source files receive parsing only.
Real SDK/core/SQLite/HTTPS, private-key handling, signatures, work, physical
release, fresh-process recovery, Linux and economic acceptance remain
unestablished. Passing these controls cannot qualify the native product.
