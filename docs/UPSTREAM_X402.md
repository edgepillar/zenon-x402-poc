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
