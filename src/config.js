import { types as utilTypes } from 'node:util';
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

const MINIMUM_MOMENTUM_CONFIRMATIONS_ENV = 'ZENON_MINIMUM_MOMENTUM_CONFIRMATIONS';
const CANONICAL_MINIMUM_MOMENTUM_CONFIRMATIONS = /^(?:[2-9]|[12][0-9]|30)$/;

function liveMinimumMomentumConfirmations(environment) {
  if (environment === null || typeof environment !== 'object' || utilTypes.isProxy(environment)) {
    throw new Error(`${MINIMUM_MOMENTUM_CONFIRMATIONS_ENV} requires a trusted environment object`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(
    environment,
    MINIMUM_MOMENTUM_CONFIRMATIONS_ENV,
  );
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) {
    throw new Error(`${MINIMUM_MOMENTUM_CONFIRMATIONS_ENV} must be an own data property`);
  }
  const value = descriptor.value;
  if (value === '' || value === '1') return undefined;
  if (typeof value !== 'string' || !CANONICAL_MINIMUM_MOMENTUM_CONFIRMATIONS.test(value)) {
    throw new Error(`${MINIMUM_MOMENTUM_CONFIRMATIONS_ENV} must be 1 or a canonical integer from 2 to 30`);
  }
  return Number(value);
}

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
  const minimumMomentumConfirmations = liveMinimumMomentumConfirmations(environment);

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
      ...(minimumMomentumConfirmations === undefined
        ? {}
        : { minimumMomentumConfirmations }),
    },
  };
  validateActiveUpfrontRequirement(requirement);
  return requirement;
}
