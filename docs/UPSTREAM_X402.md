# Mapping this PoC to the official x402 SDK

This repository intentionally keeps the runnable demo dependency-light and implements the x402 v2 HTTP wire shape directly. An upstream-quality integration should use `@x402/core` instead of maintaining its own HTTP helpers.

## Proposed package API

```ts
import { x402Client } from '@x402/core/client';
import { ExactZenonScheme } from '@x402/zenon/exact/client';

const client = new x402Client()
  .register('zenon:*', new ExactZenonScheme(zenonSigner));
```

Server:

```ts
import { x402ResourceServer } from '@x402/core/server';
import { ExactZenonScheme } from '@x402/zenon/exact/server';

const server = new x402ResourceServer(facilitatorClient)
  .register('zenon:*', new ExactZenonScheme());
```

Facilitator:

```ts
import { x402Facilitator } from '@x402/core/facilitator';
import { registerExactZenonScheme } from '@x402/zenon/exact/facilitator';

const facilitator = new x402Facilitator();
registerExactZenonScheme(facilitator, {
  networks: ['zenon:<experimental-reference>'],
  rpcUrl: '...',
});
```

No canonical Zenon network identifier is asserted here. The current PoC label `zenon:testnet` is descriptive only and must not be used as authenticated chain identity.

## Local supported-offer negotiation boundary

The current PoC does not replace the official registered-scheme-handler model. Its dependency-light HTTP client uses an internal, immutable `paymentCapabilities` descriptor solely to route among advertised offers for the injected payment client. The built-in mock and live clients each declare their exact local Zenon network and `upfront` flow; wrappers must explicitly copy the descriptor for multi-offer support. This descriptor is a local compatibility mechanism, not a proposed substitute for `@x402/core` registration interfaces.

Every offer first receives generic stable-v2 structural validation. Selection preserves advertised order and skips structurally valid alternatives that do not match the client's x402 version, scheme, network, and exact `upfront` flow. A matching route then receives complete strict Zenon validation; failure invalidates the challenge before payment construction. Descriptor-less clients retain single-offer behavior but reject multi-offer challenges as ambiguous.

Selection performs no speculative payload construction, signing, SDK initialization, RPC, PoW, settlement, or resource delivery. For both single-offer and multi-offer challenges, payment construction receives a detached internal view containing only the selected offer. Success and recovery retain the untouched original challenge, so mutation of the client-owned view cannot change the authoritative resource or selected requirement. The missing-flow compatibility option remains confined to the single-offer Phase 2A characterization lane. This boundary does not establish complete stable-v2 compatibility, official registration, a canonical Zenon network identifier, Phase 2C activation, or hardware-wallet support.

## Local ResourceInfo metadata boundary

The strict local profile requires `ResourceInfo.url`. `description` and `mimeType` are optional strings, and empty strings are accepted for interoperability with official server defaults. `serviceName` is an optional 1–32 character printable-ASCII string. `tags` is an optional array containing zero through five printable-ASCII strings of 1–32 characters each. `iconUrl` is optional and, when present, must be a non-empty absolute HTTP or HTTPS URL of at most 2048 JavaScript UTF-16 code units with a hostname and no non-empty username or password. Selection, payment construction, intent binding, journal persistence, reload, success, and recovery preserve exact field presence, `tags: []`, tag order, duplicate multiplicity, and the original accepted `iconUrl` string without normalization. Buyer and server equality use the same strict representation; a valid but mismatched submitted resource fails with the current `402` challenge before facilitator invocation.

`iconUrl` remains inert metadata: the PoC neither normalizes nor fetches, renders, probes, resolves DNS for, or otherwise dereferences it. Parser-accepted IP literals, localhost and private hostnames, public hostnames, and internationalized hostnames are not rejected solely by host class. This is not an SSRF-safety claim for future dereferencing. Malformed types, descriptors, and overlength strings use the private `400` lane; correctly typed strings that fail the strict URL policy remain `402`. Explicit `null`, unknown ResourceInfo members, non-empty extensions maps, and valid mismatches also remain unsupported in the `402` lane; the PoC-specific uncertain-settlement lane remains `409`.

At the top-level wire envelope, an absent `extensions` property and an empty plain-object `extensions: {}` are treated as equivalent. Malformed containers and unsafe descriptors use the private `400` lane, while `null` and non-empty well-formed maps use the unsupported-policy `402` lane. This is empty-container compatibility only: the PoC does not add or advertise the empty field by default, register or execute extensions, echo extension entries, or change intent binding, signing, settlement, journal, or recovery behavior.

The journal schema version is unchanged and existing legitimate records remain readable, but rollback after an `iconUrl`-bearing record is persisted must retain the additive ResourceInfo reader. This narrow compatibility slice changes no dependency, signing, SDK, RPC, PoW, settlement, or delivery semantics and makes no complete stable-v2, official-registration, or production-readiness claim. Phase 2C, hardware wallets, and authenticated live-chain identity remain separate and deferred.

## Malformed paid-request boundary

The local HTTP server distinguishes definitely malformed submitted input from payment policy and settlement outcomes. Missing payment receives the ordinary `402` challenge. A present payment header with invalid transport encoding, excessive size or depth, a malformed V2 envelope, wrong required container or primitive types, or invalid primitive encoding for a declared local Zenon route receives a fixed private `400` response without `PAYMENT-REQUIRED` or `PAYMENT-RESPONSE`. Structurally valid but unsupported versions, routes, flows, optional members, local policy values, and exact-requirement mismatches remain `402`; rejected settlement also remains `402`, while uncertain settlement retains the PoC-specific `409` reconciliation response.

This boundary follows the normative HTTP transport distinction. It does not claim exact behavioral parity with the released TypeScript resource server, complete stable-V2 compatibility, or broader extension support.

## Why a signed prepared block is a reasonable v1 payload

The proposed mapping follows a general exact-payment pattern: the client creates and signs a chain-specific transaction, serializes it into the x402 mechanism payload, and the facilitator verifies and settles it. This repository does not locally verify behavior of any official chain-specific package.

Zenon does not require a facilitator fee-payer signature for a normal transfer. Instead, the buyer can prepare the complete signed account block, including Plasma/PoW, and the facilitator only publishes it.

That keeps the facilitator unable to redirect or increase the payment: recipient, amount, token, account-chain position, data, Plasma/PoW fields and signature are all part of the Zenon block commitment.

The selected `PaymentRequirements.extra` must also commit a versioned chain profile containing the exact `chainIdentifier` and genesis Momentum hash. The signed block commits the chain identifier directly, while the x402 intent digest commits the complete requirement and genesis identity. A future facilitator must authenticate that profile against its chain session; comparing a node self-report or network label is insufficient.

The canonical payment amount range is `1` through `2^255 - 1` atomic units. Wire implementations should reject non-canonical decimal spellings before SDK parsing.

## Recommended upstream split

Do not put Zenon-specific validation inside x402 core.

`@x402/core` should continue to know only the generic types and registration lifecycle. All of the following belong in `@x402/zenon`:

- Zenon address parsing
- ZTS parsing
- account-block hashing
- ed25519 verification
- frontier checks
- Plasma / PoW validation policy
- Zenon RPC publish/confirmation
- default-asset declarations

The client and facilitator interfaces should also make uncertain publication recoverable without encouraging a second payment. A publication timeout may mean the original signed block reached the node.

## Recovery semantics

This PoC uses evidence-oriented internal states:

- `VALIDATED`;
- `SUBMISSION_ACKNOWLEDGED`;
- `SUBMISSION_OUTCOME_UNKNOWN`;
- `MOMENTUM_INCLUDED`;
- `DELIVERY_PENDING`;
- `DELIVERED`.

`MOMENTUM_INCLUDED` is intentionally narrower than `FINAL` and does not imply merchant receipt. The recipient's receive account block remains separate.

While an official x402 extension is unresolved, the PoC returns HTTP `409` plus `PAYMENT-RESPONSE` and `retrySamePayment: true` for an uncertain or pending outcome. The body instructs the client to reuse and reconcile the same payment. This is an experimental compatibility extension, not a claim that x402 v2 standardizes that status.

A first-class package should define an interoperable recovery response that preserves transaction and payment-intent identity, prevents automatic replacement payment, and allows a delivered response to be replayed safely. A transaction hash alone must never authorize a different resource or requirement.

## Facilitator persistence boundary

The current dependency-free journal is deliberately limited to one writer in one process on one host. An upstream production integration needs a transactional settlement/entitlement store and a resource-specific delivery policy. Neither an indexer nor a full node alone provides the atomic boundary between observed payment and protected-resource side effects.
