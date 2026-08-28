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
 * Live chain identity remains programmatic. The CLI may inject its one exact
 * historical operator-trusted profile; arbitrary environment-supplied profile
 * values are not accepted here.
 */
export async function buildRequirement(
  mode = process.env.PAYMENT_MODE ?? 'mock',
  { zenonChain, resolveAsset = resolveZenonAsset } = {},
  environment = process.env,
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

  const network = environment.X402_NETWORK ?? EXPERIMENTAL_LIVE_NETWORK;
  if (network !== EXPERIMENTAL_LIVE_NETWORK) {
    throw new Error(`live mode requires X402_NETWORK=${EXPERIMENTAL_LIVE_NETWORK}`);
  }
  const payTo = environment.ZENON_PAY_TO;
  if (!payTo || payTo.includes('REPLACE')) throw new Error('ZENON_PAY_TO must be configured for live mode');
  const amount = environment.ZENON_AMOUNT ?? '1';
  validateCanonicalZenonAmount(amount, 'ZENON_AMOUNT');
  const asset = await resolveAsset(environment.ZENON_ASSET ?? 'ZNN');

  const requirement = {
    scheme: 'exact',
    network,
    asset,
    amount,
    payTo,
    maxTimeoutSeconds: envInt('ZENON_MAX_TIMEOUT_SECONDS', 60, environment),
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
