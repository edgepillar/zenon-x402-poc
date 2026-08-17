/**
 * Transitional locked SDK 1.0.5 legacy signed-composite comparator and
 * default production path. This is not unsigned preparation, a transaction
 * planner, a WalletAdapter, or a PlasmaStrategy. It must not be removed,
 * bypassed, or replaced before a separately approved Phase 2C cutover.
 * Phase 2C may compare a future path against it only in deterministic isolated
 * tests; production must never execute both paths for one real payment.
 * Invocation transparently delegates the existing effectful SDK operation.
 */
export function invokeLegacySdk105SignedComposite(
  zenon,
  accountBlockTemplate,
  keyPair,
) {
  return zenon.prepareBlock(accountBlockTemplate, keyPair);
}
