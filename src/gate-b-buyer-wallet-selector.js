import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const ERROR_CODE = 'gate_b_buyer_wallet_selector_invalid';
const MAX_PATH_BYTES = 4096;
const GENERATION_TOKEN = /^[0-9a-f]{32}$/u;

export const GATE_B_BUYER_WALLET_LEGACY_WORKSPACE_NAME =
  'zenon-x402-gate-b-wallet';
export const GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME =
  'zenon-x402-gate-b-faucet-receive';

export class GateBBuyerWalletSelectorError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBBuyerWalletSelectorError';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBBuyerWalletSelectorError();
}

function exactAbsolutePath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_PATH_BYTES ||
      Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES || value.includes('\0') ||
      !isAbsolute(value) || resolve(value) !== value) fail();
  return value;
}

export function selectGateBBuyerWalletWorkspace(workspaceRoot, applicationSupportRoot) {
  try {
    const supportRoot = exactAbsolutePath(applicationSupportRoot);
    const selectedRoot = exactAbsolutePath(workspaceRoot);
    if (dirname(selectedRoot) !== supportRoot) fail();
    const leaf = basename(selectedRoot);
    let generationToken = null;
    if (leaf !== GATE_B_BUYER_WALLET_LEGACY_WORKSPACE_NAME) {
      const prefix = `${GATE_B_BUYER_WALLET_LEGACY_WORKSPACE_NAME}-`;
      if (!leaf.startsWith(prefix)) fail();
      generationToken = leaf.slice(prefix.length);
      if (!GENERATION_TOKEN.test(generationToken)) fail();
    }
    const stateLeaf = generationToken === null
      ? GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME
      : `${GATE_B_TESTNET_FAUCET_RECEIVE_LEGACY_STATE_NAME}-${generationToken}`;
    return Object.freeze({
      generationToken,
      stateWorkspaceRoot: join(supportRoot, stateLeaf),
      walletWorkspaceRoot: selectedRoot,
    });
  } catch {
    fail();
  }
}
