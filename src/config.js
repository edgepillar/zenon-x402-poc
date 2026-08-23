import { envInt } from './env.js';
import { resolveZenonAsset } from './zenon-payment.js';
import {
  EXPERIMENTAL_LIVE_NETWORK,
  MOCK_NETWORK,
  MOCK_ZENON_CHAIN_PROFILE,
  validateActiveUpfrontRequirement,
  validateCanonicalZenonAmount,
  validateZenonChainProfile,
} from './x402-wire.js';

/**
 * Build the single payment option exposed by the PoC.
 *
 * Live chain identity is deliberately programmatic: this repository does not
 * ship a real testnet chain identifier or genesis Momentum hash.
 */
export async function buildRequirement(
  mode = process.env.PAYMENT_MODE ?? 'mock',
  { zenonChain, resolveAsset = resolveZenonAsset } = {},
) {
  if (mode === 'mock') {
    const requirement = {
      scheme: 'exact',
      network: MOCK_NETWORK,
      asset: 'mock-zts',
      amount: '100',
      payTo: 'mock-seller',
      maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: { ...MOCK_ZENON_CHAIN_PROFILE },
      },
    };
    validateActiveUpfrontRequirement(requirement);
    return requirement;
  }

  if (mode !== 'zenon') throw new Error(`unknown PAYMENT_MODE=${mode}`);
  if (!zenonChain) {
    throw new Error('live mode requires an explicit programmatic Zenon chain profile');
  }
  validateZenonChainProfile(zenonChain);

  const network = process.env.X402_NETWORK ?? EXPERIMENTAL_LIVE_NETWORK;
  if (network !== EXPERIMENTAL_LIVE_NETWORK) {
    throw new Error(`live mode requires X402_NETWORK=${EXPERIMENTAL_LIVE_NETWORK}`);
  }
  const payTo = process.env.ZENON_PAY_TO;
  if (!payTo || payTo.includes('REPLACE')) throw new Error('ZENON_PAY_TO must be configured for live mode');
  const amount = process.env.ZENON_AMOUNT ?? '1';
  validateCanonicalZenonAmount(amount, 'ZENON_AMOUNT');
  const asset = await resolveAsset(process.env.ZENON_ASSET ?? 'ZNN');

  const requirement = {
    scheme: 'exact',
    network,
    asset,
    amount,
    payTo,
    maxTimeoutSeconds: envInt('ZENON_MAX_TIMEOUT_SECONDS', 60),
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: { ...zenonChain },
    },
  };
  validateActiveUpfrontRequirement(requirement);
  return requirement;
}
