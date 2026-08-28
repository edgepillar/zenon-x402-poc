import { performance } from 'node:perf_hooks';
import { paymentIntentDigest, sha256Hex } from './canonical.js';
import {
  createPaymentCapabilities,
  EXPERIMENTAL_LIVE_NETWORK,
  MAX_ZENON_AMOUNT,
  sameRequirements,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
  validateRequirement,
  validateZenonChainProfile,
} from './x402-wire.js';
import {
  LIVE_RPC_OUTCOMES,
  LIVE_RUNTIME_ERROR_CODES,
  liveSdkRuntime,
} from './live-runtime.js';
import {
  DELIVERY_STATES,
  EVIDENCE_STATES,
  SettlementJournal,
} from './settlement-journal.js';
import { invokeLegacySdk105SignedComposite } from './zenon/internal/legacy-sdk-1-0-5-signed-composite.js';

const TESTNET_NETWORK_ID = 3;
const MAX_DATA_BYTES = 32;
const MAX_CONFIRMATION_WAIT_MS = 5 * 60_000;
const DEFAULT_RPC_TIMEOUT_MS = 10_000;
const UNCONFIRMED_PAGE_SIZE = 50;
const MAX_UNCONFIRMED_BLOCKS = 200;
const HASH_HEX = /^[0-9a-f]{64}$/;
const NONCE_HEX = /^[0-9a-f]{16}$/;
const CANONICAL_DECIMAL = /^(0|[1-9]\d*)$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CREATE_OBJECT = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const ACCOUNT_BLOCK_FIELDS = new Set([
  'version', 'chainIdentifier', 'blockType', 'hash', 'previousHash', 'height',
  'momentumAcknowledged', 'address', 'toAddress', 'amount', 'tokenStandard',
  'fromBlockHash', 'data', 'fusedPlasma', 'difficulty', 'nonce', 'publicKey', 'signature',
]);
const LIVE_PAYMENT_CAPABILITIES = createPaymentCapabilities([{
  scheme: 'exact',
  network: EXPERIMENTAL_LIVE_NETWORK,
  paymentFlows: ['upfront'],
}]);
const EVIDENCE_RANK = new Map([
  [EVIDENCE_STATES.VALIDATED, 0],
  [EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN, 1],
  [EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED, 2],
  [EVIDENCE_STATES.MOMENTUM_INCLUDED, 3],
]);

let cachedDeps;

async function loadZenonDeps() {
  if (cachedDeps) return cachedDeps;
  const sdk = await import('znn-typescript-sdk');
  const ed = await import('@noble/ed25519');
  const { sha512 } = await import('@noble/hashes/sha2');
  ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
  cachedDeps = { sdk, ed };
  return cachedDeps;
}

export class ZenonSafetyError extends Error {
  constructor(code, cause) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'ZenonSafetyError';
    this.code = code;
  }
}

function safetyError(code, cause) {
  throw new ZenonSafetyError(code, cause);
}

function requireLiveAck() {
  if (process.env.ZENON_LIVE_ACK !== 'I_UNDERSTAND_TESTNET_ONLY') {
    safetyError('live_mode_not_acknowledged');
  }
}

function configuredTestnetNetworkId() {
  const networkId = Number(process.env.ZENON_NETWORK_ID ?? TESTNET_NETWORK_ID);
  if (networkId !== TESTNET_NETWORK_ID) safetyError('configured_network_is_not_testnet');
  return networkId;
}

function validSafeInteger(value, { min = 0 } = {}) {
  return Number.isSafeInteger(value) && value >= min;
}

function isNonArrayObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validNetworkPeer(value) {
  return isNonArrayObject(value) &&
    typeof value.publicKey === 'string' && value.publicKey.length > 0 && value.publicKey.length <= 1024 &&
    typeof value.ip === 'string' && value.ip.length > 0 && value.ip.length <= 512;
}

function configuredRpcTimeout(value = process.env.ZENON_RPC_TIMEOUT_MS ?? DEFAULT_RPC_TIMEOUT_MS) {
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    safetyError('invalid_rpc_timeout');
  }
  return timeoutMs;
}

function decodeCanonicalBase64(value, expectedBytes, field) {
  if (typeof value !== 'string' || !BASE64.test(value)) safetyError(`malformed_${field}`);
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== expectedBytes || bytes.toString('base64') !== value) {
    safetyError(`malformed_${field}`);
  }
  return bytes;
}

/** Reject malformed wire values before SDK deserialization or cryptography. */
export function validateAccountBlockJson(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json) || Object.getPrototypeOf(json) !== Object.prototype) {
    safetyError('malformed_transaction');
  }
  if (Object.keys(json).length !== ACCOUNT_BLOCK_FIELDS.size ||
      Object.keys(json).some(field => !ACCOUNT_BLOCK_FIELDS.has(field))) {
    safetyError('unexpected_or_missing_transaction_field');
  }
  if (json.version !== 1) safetyError('malformed_version');
  if (!validSafeInteger(json.chainIdentifier, { min: 1 })) safetyError('malformed_chain_identifier');
  if (!validSafeInteger(json.blockType, { min: 1 })) safetyError('malformed_block_type');
  for (const field of ['hash', 'previousHash', 'fromBlockHash']) {
    if (typeof json[field] !== 'string' || !HASH_HEX.test(json[field])) safetyError(`malformed_${field}`);
  }
  if (!validSafeInteger(json.height, { min: 1 })) safetyError('malformed_height');
  const acknowledged = json.momentumAcknowledged;
  if (!acknowledged || typeof acknowledged !== 'object' || Array.isArray(acknowledged) ||
      Object.getPrototypeOf(acknowledged) !== Object.prototype ||
      Object.keys(acknowledged).length !== 2 ||
      !Object.hasOwn(acknowledged, 'hash') || !Object.hasOwn(acknowledged, 'height') ||
      !HASH_HEX.test(acknowledged.hash ?? '') || !validSafeInteger(acknowledged.height)) {
    safetyError('malformed_momentum_acknowledged');
  }
  for (const field of ['address', 'toAddress']) {
    if (typeof json[field] !== 'string' || json[field].length < 10 || json[field].length > 128) {
      safetyError(`malformed_${field}`);
    }
  }
  if (typeof json.amount !== 'string' || json.amount.length > 77 || !CANONICAL_DECIMAL.test(json.amount) ||
      BigInt(json.amount) <= 0n || BigInt(json.amount) > MAX_ZENON_AMOUNT) {
    safetyError('malformed_amount');
  }
  if (typeof json.tokenStandard !== 'string' || json.tokenStandard.length < 10 || json.tokenStandard.length > 128) {
    safetyError('malformed_token_standard');
  }
  const data = decodeCanonicalBase64(json.data, MAX_DATA_BYTES, 'data');
  if (!validSafeInteger(json.fusedPlasma) || !validSafeInteger(json.difficulty)) safetyError('malformed_plasma');
  if (typeof json.nonce !== 'string' || !NONCE_HEX.test(json.nonce)) safetyError('malformed_nonce');
  const publicKey = decodeCanonicalBase64(json.publicKey, 32, 'public_key');
  const signature = decodeCanonicalBase64(json.signature, 64, 'signature');
  return { data, publicKey, signature };
}

function uintBE(value, bytes) {
  let integer = BigInt(value);
  if (integer < 0n) safetyError('negative_hash_integer');
  const output = Buffer.alloc(bytes);
  for (let index = bytes - 1; index >= 0; index -= 1) {
    output[index] = Number(integer & 0xffn);
    integer >>= 8n;
  }
  if (integer !== 0n) safetyError('oversized_hash_integer');
  return output;
}

function materializeBlock(json, sdk) {
  const { publicKey, signature } = validateAccountBlockJson(json);
  let block;
  try {
    block = sdk.AccountBlockTemplate.fromJson(json);
  } catch (error) {
    safetyError('malformed_transaction', error);
  }
  block.publicKey = publicKey;
  block.signature = signature;
  return block;
}

function normalizeObservedByteField(value, expectedBytes, field) {
  let direct;
  try {
    direct = Buffer.from(value);
  } catch (error) {
    safetyError('malformed_observed_account_block', error);
  }
  if (direct.length === expectedBytes) return direct;

  // SDK 1.0.5 AccountBlock.fromJson() uses Buffer.from(base64String)
  // without an encoding argument for publicKey/signature. Accept only that
  // precise canonical-Base64-in-an-ASCII-buffer representation in addition to
  // correctly decoded bytes; all other representations still fail closed.
  const encoded = direct.toString('ascii');
  if (!Buffer.from(encoded, 'ascii').equals(direct)) {
    safetyError('malformed_observed_account_block');
  }
  try {
    return decodeCanonicalBase64(encoded, expectedBytes, field);
  } catch (error) {
    safetyError('malformed_observed_account_block', error);
  }
}

/**
 * Mirrors the installed SDK's non-exported utilities/block.getTxHash.
 * The valid payment range is narrower than this 32-byte serialization field.
 */
export function computeBlockHash(block, sdk) {
  const emptyHash = sdk.Hash.digest(Buffer.alloc(0));
  const dataHash = sdk.Hash.digest(block.data);
  return sdk.Hash.digest(Buffer.concat([
    uintBE(block.version, 8),
    uintBE(block.chainIdentifier, 8),
    uintBE(block.blockType, 8),
    Buffer.from(block.previousHash.getBytes()),
    uintBE(block.height, 8),
    Buffer.from(block.momentumAcknowledged.getBytes()),
    Buffer.from(block.address.getBytes()),
    Buffer.from(block.toAddress.getBytes()),
    uintBE(block.amount.toString(), 32),
    Buffer.from(block.tokenStandard.getBytes()),
    Buffer.from(block.fromBlockHash.getBytes()),
    Buffer.from(emptyHash.getBytes()),
    Buffer.from(dataHash.getBytes()),
    uintBE(block.fusedPlasma, 8),
    uintBE(block.difficulty, 8),
    Buffer.from(block.nonce, 'hex'),
  ]));
}

/**
 * Validate an RPC observation as the exact signed AccountBlock that passed
 * offline preflight. A matching lookup key alone is not trusted as evidence.
 */
export function validateObservedAccountBlock(observed, preflight, sdk) {
  if (!observed || typeof observed !== 'object' || typeof observed.toJson !== 'function') {
    safetyError('malformed_observed_account_block');
  }

  let serialized;
  let observedJson;
  let decoded;
  let computedHash;
  let observedPublicKey;
  let observedSignature;
  try {
    serialized = observed.toJson();
    if (!serialized || typeof serialized !== 'object' || Array.isArray(serialized)) {
      safetyError('malformed_observed_account_block');
    }
    observedJson = {};
    for (const field of ACCOUNT_BLOCK_FIELDS) {
      if (!Object.hasOwn(serialized, field)) safetyError('malformed_observed_account_block');
      observedJson[field] = serialized[field];
    }
    observedPublicKey = normalizeObservedByteField(observed.publicKey, 32, 'public_key');
    observedSignature = normalizeObservedByteField(observed.signature, 64, 'signature');
    observedJson.publicKey = observedPublicKey.toString('base64');
    observedJson.signature = observedSignature.toString('base64');
    decoded = validateAccountBlockJson(observedJson);
    computedHash = computeBlockHash(observed, sdk).toString();
  } catch (error) {
    if (error instanceof ZenonSafetyError) throw error;
    safetyError('malformed_observed_account_block', error);
  }

  if (sha256Hex(observedJson) !== sha256Hex(preflight.signedAccountBlock) ||
      computedHash !== preflight.transactionHash ||
      observed.hash?.toString() !== preflight.transactionHash ||
      !observedPublicKey.equals(decoded.publicKey) ||
      !observedSignature.equals(decoded.signature) ||
      !observedPublicKey.equals(Buffer.from(preflight.block.publicKey)) ||
      !observedSignature.equals(Buffer.from(preflight.block.signature))) {
    safetyError('observed_transaction_mismatch');
  }
  if (observed.confirmationDetail !== undefined && observed.confirmationDetail !== null) {
    normalizeConfirmationDetail(observed.confirmationDetail);
  }
  return observed;
}

function chainProfilesEqual(left, right) {
  return left?.version === right?.version &&
    left?.chainIdentifier === right?.chainIdentifier &&
    left?.genesisMomentumHash === right?.genesisMomentumHash;
}

function cloneChainProfile(profile) {
  return {
    version: profile.version,
    chainIdentifier: profile.chainIdentifier,
    genesisMomentumHash: profile.genesisMomentumHash,
  };
}

function clearConnection(zenon) {
  if (zenon?.client) zenon.clearConnection();
}

function runRead(scope, zenon, timeoutMs, operation, execute) {
  return scope.runRpcWithDeadline({
    category: 'read',
    operation,
    timeoutMs,
    execute,
    teardown: () => clearConnection(zenon),
  });
}

function runPublication(scope, zenon, timeoutMs, operation, execute) {
  return scope.runRpcWithDeadline({
    category: 'publication',
    operation,
    timeoutMs,
    execute,
    teardown: () => clearConnection(zenon),
  });
}

/**
 * Check node health and authenticate the exact expected chain profile.
 * Network information and the frontier Momentum are node self-reports; only
 * the injected profile authenticator is intended to establish chain identity.
 */
export async function assertZenonNodeReady(
  zenon,
  sdk,
  authenticateChainProfile,
  expectedChainProfile,
  { callRead = (_operation, execute) => execute() } = {},
) {
  validateZenonChainProfile(expectedChainProfile);
  let networkInfo;
  let syncInfo;
  let frontierMomentum;
  try {
    // Sequential calls are intentional. Promise.all could abandon sibling SDK
    // continuations when one shared-client request fails first.
    networkInfo = await callRead('stats.networkInfo', () => zenon.stats.networkInfo());
    syncInfo = await callRead('stats.syncInfo', () => zenon.stats.syncInfo());
    frontierMomentum = await callRead('ledger.getFrontierMomentum', () => zenon.ledger.getFrontierMomentum());
  } catch (error) {
    if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
        error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
    safetyError('node_health_unavailable', error);
  }
  if (!networkInfo || !validSafeInteger(networkInfo.numPeers, { min: 1 }) ||
      !validNetworkPeer(networkInfo.self) || !Array.isArray(networkInfo.peers) ||
      networkInfo.peers.some(peer => !validNetworkPeer(peer))) {
    safetyError('malformed_node_network_info');
  }
  if (!syncInfo || syncInfo.state !== sdk.SyncState.SyncDone ||
      !validSafeInteger(syncInfo.currentHeight, { min: 1 }) ||
      !validSafeInteger(syncInfo.targetHeight, { min: 1 }) ||
      syncInfo.currentHeight < syncInfo.targetHeight) {
    safetyError('node_not_synchronized');
  }
  const chainId = frontierMomentum?.chainIdentifier;
  if (!validSafeInteger(chainId, { min: 1 }) || !validSafeInteger(frontierMomentum?.height)) {
    safetyError('malformed_frontier_momentum');
  }
  if (String(chainId) !== expectedChainProfile.chainIdentifier) safetyError('node_chain_identifier_mismatch');
  if (typeof authenticateChainProfile !== 'function') safetyError('node_network_identity_unavailable');

  let authenticatedProfile;
  try {
    authenticatedProfile = await callRead('authenticateChainProfile', () => authenticateChainProfile({
      zenon,
      networkInfo,
      syncInfo,
      frontierMomentum,
      expectedChainProfile: cloneChainProfile(expectedChainProfile),
    }));
    validateZenonChainProfile(authenticatedProfile);
  } catch (error) {
    if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
        error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
    safetyError('node_network_identity_unavailable', error);
  }
  if (!chainProfilesEqual(authenticatedProfile, expectedChainProfile)) {
    safetyError('connected_node_chain_profile_mismatch');
  }
  return { chainId, syncInfo, frontierMomentum, authenticatedProfile: cloneChainProfile(authenticatedProfile) };
}

function parseRpcUrl() {
  const rpcUrl = process.env.ZENON_RPC_URL ?? 'wss://testnet.zenonhub.io:35998';
  let parsed;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    // ERR_INVALID_URL retains the full input (which may contain credentials or
    // private host metadata), so never attach it to the exported error chain.
    safetyError('invalid_rpc_url');
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') safetyError('invalid_rpc_protocol');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    safetyError('rpc_url_must_not_contain_credentials_or_parameters');
  }
  return rpcUrl;
}

async function withOwnedZenonSession({
  owner,
  expectedChainProfile,
  authenticateChainProfile,
  runtime,
  rpcTimeoutMs,
  work,
}) {
  if (typeof authenticateChainProfile !== 'function') safetyError('node_network_identity_unavailable');
  return runtime.withOwner(owner, async scope => {
    const { sdk, ed } = await loadZenonDeps();
    const networkId = configuredTestnetNetworkId();
    const rpcUrl = parseRpcUrl();
    sdk.Zenon.setNetworkID(networkId);
    const zenon = sdk.Zenon.getInstance();
    if (zenon.client) {
      try {
        clearConnection(zenon);
      } catch (error) {
        scope.poison(error);
        safetyError('sdk_connection_cleanup_failed', error);
      }
    }
    try {
      try {
        await runRead(scope, zenon, rpcTimeoutMs, 'zenon.initialize', () => zenon.initialize(rpcUrl));
      } catch (error) {
        if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
            error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
        safetyError('node_connection_unavailable', error);
      }
      const readiness = await assertZenonNodeReady(
        zenon,
        sdk,
        authenticateChainProfile,
        expectedChainProfile,
        { callRead: (operation, execute) => runRead(scope, zenon, rpcTimeoutMs, operation, execute) },
      );
      sdk.Zenon.setChainID(readiness.chainId);
      return await work({ sdk, ed, zenon, ...readiness }, scope);
    } finally {
      const alreadyPoisoned = runtime.poisoned;
      try {
        clearConnection(zenon);
      } catch (error) {
        scope.poison(error);
        // A prior RPC timeout keeps its stronger evidence classification.
        // Otherwise failed teardown becomes the current operation's error as
        // well as permanently preventing another singleton session.
        if (!alreadyPoisoned) safetyError('sdk_connection_cleanup_failed', error);
      }
    }
  });
}

export async function resolveZenonAsset(assetConfig = process.env.ZENON_ASSET ?? 'ZNN') {
  const { sdk } = await loadZenonDeps();
  if (assetConfig.toUpperCase() === 'ZNN') return sdk.ZNN_ZTS.toString();
  if (assetConfig.toUpperCase() === 'QSR') return sdk.QSR_ZTS.toString();
  return sdk.TokenStandard.parse(assetConfig).toString();
}

export async function assertAssetExists(zenon, sdk, tokenStandard, callRead = (_operation, execute) => execute()) {
  if (tokenStandard.toString() === sdk.ZNN_ZTS.toString() ||
      tokenStandard.toString() === sdk.QSR_ZTS.toString()) return;
  let token;
  try {
    token = await callRead('embedded.token.getByZts', () => zenon.embedded.token.getByZts(tokenStandard));
  } catch (error) {
    if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
        error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
    safetyError('asset_lookup_failed', error);
  }
  if (!token || token.tokenStandard?.toString() !== tokenStandard.toString()) safetyError('asset_not_found');
}

/** Complete the node's paginated unconfirmed-block snapshot or fail closed. */
export async function assertNoConflictingUnconfirmedBlocks({
  ledger,
  address,
  transactionHash,
  callRead = (_operation, execute) => execute(),
  maximum = MAX_UNCONFIRMED_BLOCKS,
}) {
  const fetchPage = async (page) => {
    try {
      return await callRead(
        `ledger.getUnconfirmedBlocksByAddress.page${page}`,
        () => ledger.getUnconfirmedBlocksByAddress(address, page, UNCONFIRMED_PAGE_SIZE),
      );
    } catch (error) {
      if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
          error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
      safetyError('unconfirmed_lookup_failed', error);
    }
  };
  const first = await fetchPage(0);
  const count = first?.count;
  if (!validSafeInteger(count) || count > maximum || !Array.isArray(first?.list) ||
      first.list.length > UNCONFIRMED_PAGE_SIZE || first.list.length > count) {
    safetyError(count > maximum ? 'too_many_unconfirmed_blocks' : 'malformed_unconfirmed_blocks');
  }

  const pages = Math.ceil(count / UNCONFIRMED_PAGE_SIZE);
  const blocks = [];
  for (let page = 0; page < pages; page += 1) {
    const result = page === 0 ? first : await fetchPage(page);
    if (!result || result.count !== count || !Array.isArray(result.list) ||
        result.list.length > UNCONFIRMED_PAGE_SIZE) {
      safetyError('unconfirmed_snapshot_changed');
    }
    const expectedLength = Math.min(UNCONFIRMED_PAGE_SIZE, count - page * UNCONFIRMED_PAGE_SIZE);
    if (result.list.length !== expectedLength) safetyError('incomplete_unconfirmed_snapshot');
    blocks.push(...result.list);
  }
  if (blocks.length !== count) safetyError('incomplete_unconfirmed_snapshot');
  const hashes = new Set();
  for (const block of blocks) {
    let hash;
    try {
      hash = block?.hash?.toString();
    } catch {
      safetyError('malformed_unconfirmed_blocks');
    }
    if (!HASH_HEX.test(hash ?? '') || hashes.has(hash)) safetyError('malformed_unconfirmed_blocks');
    hashes.add(hash);
    if (hash !== transactionHash) safetyError('payer_has_conflicting_unconfirmed_block');
  }

  // Re-read the first page so a changing count/list is not mistaken for a
  // complete snapshot. This remains a best-effort node view, not a consensus lock.
  const check = await fetchPage(0);
  if (!check || check.count !== count || !Array.isArray(check.list) ||
      check.list.length !== first.list.length || check.list.length > UNCONFIRMED_PAGE_SIZE) {
    safetyError('unconfirmed_snapshot_changed');
  }
  let firstHashes;
  let checkHashes;
  try {
    firstHashes = first.list.map(block => block?.hash?.toString());
    checkHashes = check.list.map(block => block?.hash?.toString());
  } catch (error) {
    safetyError('malformed_unconfirmed_blocks', error);
  }
  if (checkHashes.some(hash => !HASH_HEX.test(hash ?? '')) ||
      JSON.stringify(firstHashes) !== JSON.stringify(checkHashes)) {
    safetyError('unconfirmed_snapshot_changed');
  }
}

export class PerPayerQueue {
  constructor() {
    this.tails = new Map();
  }

  async run(key, operation) {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    this.tails.set(key, current);
    await previous.catch(() => {});
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === current) this.tails.delete(key);
    }
  }
}

/** Perform every transaction check that does not require an RPC node. */
export async function preflightZenonPayment(paymentPayload, requirements, paymentRequired) {
  try {
    paymentPayload = structuredClone(paymentPayload);
    requirements = structuredClone(requirements);
    paymentRequired = structuredClone(paymentRequired);
  } catch (error) {
    safetyError('malformed_payment', error);
  }
  try {
    validatePaymentRequired(paymentRequired);
    validateRequirement(requirements);
    validatePaymentPayloadEnvelope(paymentPayload);
  } catch (error) {
    safetyError('malformed_payment', error);
  }
  if (requirements.network !== EXPERIMENTAL_LIVE_NETWORK) safetyError('unsupported_network');
  if (new URL(paymentRequired.resource.url).protocol !== 'https:') safetyError('live_resource_requires_https');
  if (paymentPayload.x402Version !== paymentRequired.x402Version) safetyError('unsupported_version');
  if (!sameRequirements(paymentPayload.accepted, requirements) ||
      !paymentRequired.accepts.some(candidate => sameRequirements(candidate, requirements))) {
    safetyError('requirements_mismatch');
  }
  if (sha256Hex(paymentPayload.resource) !== sha256Hex(paymentRequired.resource)) {
    safetyError('resource_mismatch');
  }

  const txJson = structuredClone(paymentPayload.payload.transaction);
  validateAccountBlockJson(txJson);
  const { sdk, ed } = await loadZenonDeps();
  const block = materializeBlock(txJson, sdk);
  const chainProfile = requirements.extra.zenonChain;
  if (block.blockType !== sdk.BlockTypeEnum.UserSend) safetyError('wrong_block_type');
  if (block.chainIdentifier !== Number(chainProfile.chainIdentifier)) safetyError('wrong_chain_identifier');
  if (block.address.toString() !== txJson.address || block.toAddress.toString() !== txJson.toAddress) {
    safetyError('noncanonical_address');
  }
  if (block.toAddress.toString() !== requirements.payTo) safetyError('wrong_recipient');
  if (block.toAddress.toString() === sdk.EMPTY_ADDRESS.toString() ||
      block.toAddress.getBytes()[0] !== sdk.Address.userByte) safetyError('unsupported_recipient_address');
  if (block.amount.toString() !== requirements.amount) safetyError('wrong_amount');
  if (block.tokenStandard.toString() !== requirements.asset || block.tokenStandard.toString() !== txJson.tokenStandard) {
    safetyError('wrong_asset');
  }
  if (block.fromBlockHash.toString() !== sdk.EMPTY_HASH.toString()) safetyError('unexpected_from_block_hash');

  const expectedIntent = paymentIntentDigest(paymentRequired, requirements);
  if (Buffer.from(block.data).toString('hex') !== expectedIntent ||
      paymentPayload.payload.intentDigest !== expectedIntent) safetyError('intent_mismatch');
  if (sdk.Address.fromPublicKey(block.publicKey).toString() !== block.address.toString()) {
    safetyError('payer_key_mismatch');
  }
  const computedHash = computeBlockHash(block, sdk);
  if (computedHash.toString() !== block.hash.toString()) safetyError('block_hash_mismatch');
  let signatureValid;
  try {
    signatureValid = ed.verify(block.signature, computedHash.getBytes(), block.publicKey, { zip215: false });
  } catch (error) {
    safetyError('invalid_signature', error);
  }
  if (typeof signatureValid !== 'boolean' || !signatureValid) safetyError('invalid_signature');

  const resourceIdentity = structuredClone(paymentRequired.resource);
  const resourceDigest = sha256Hex(resourceIdentity);
  const authorizationKey = sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile,
    intentDigest: expectedIntent,
    resourceDigest,
    transactionHash: computedHash.toString(),
  });
  return {
    authorizationKey,
    transactionHash: computedHash.toString(),
    chainProfile: cloneChainProfile(chainProfile),
    intentDigest: expectedIntent,
    resourceIdentity,
    resourceDigest,
    payer: block.address.toString(),
    signedAccountBlock: txJson,
    block,
    tokenStandard: block.tokenStandard,
    requirements,
  };
}

export class ExactZenonClient {
  constructor({
    mnemonic,
    accountIndex = process.env.ZENON_ACCOUNT_INDEX ?? 0,
    authenticateChainProfile,
    authenticateNodeNetwork,
    rpcTimeoutMs,
  } = {}) {
    const configuredMnemonic = mnemonic ?? process.env.ZENON_MNEMONIC;
    const configuredAccountIndex = Number(accountIndex ?? process.env.ZENON_ACCOUNT_INDEX ?? 0);
    const chainAuthenticator = authenticateChainProfile ?? authenticateNodeNetwork;
    const configuredTimeout = configuredRpcTimeout(rpcTimeoutMs);
    Object.defineProperties(this, {
      mnemonic: {
        value: configuredMnemonic,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      runtime: {
        value: liveSdkRuntime,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      accountIndex: {
        value: configuredAccountIndex,
        writable: false,
        configurable: false,
        enumerable: true,
      },
      authenticateChainProfile: {
        value: chainAuthenticator,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      rpcTimeoutMs: {
        value: configuredTimeout,
        writable: false,
        configurable: false,
        enumerable: true,
      },
      paymentCapabilities: {
        value: LIVE_PAYMENT_CAPABILITIES,
        writable: false,
        configurable: false,
        enumerable: false,
      },
    });
  }

  async createPaymentPayload(paymentRequired, accepted = paymentRequired?.accepts?.[0]) {
    try {
      paymentRequired = structuredClone(paymentRequired);
      accepted = structuredClone(accepted);
    } catch (error) {
      safetyError('malformed_requirements', error);
    }
    requireLiveAck();
    configuredTestnetNetworkId();
    try {
      validatePaymentRequired(paymentRequired);
      validateRequirement(accepted);
    } catch (error) {
      safetyError('malformed_requirements', error);
    }
    if (!paymentRequired.accepts.some(candidate => sameRequirements(candidate, accepted))) {
      safetyError('requirements_mismatch');
    }
    if (accepted.network !== EXPERIMENTAL_LIVE_NETWORK) safetyError('unsupported_network');
    if (new URL(paymentRequired.resource.url).protocol !== 'https:') safetyError('live_resource_requires_https');
    if (accepted.asset === 'ZNN' || accepted.asset === 'QSR') safetyError('unresolved_asset');
    if (typeof this.mnemonic !== 'string' || !this.mnemonic || this.mnemonic.startsWith('replace ')) {
      safetyError('mnemonic_not_configured');
    }
    if (!validSafeInteger(this.accountIndex)) safetyError('invalid_account_index');

    const { sdk: offlineSdk } = await loadZenonDeps();
    let offlineTokenStandard;
    let offlinePayTo;
    try {
      offlineTokenStandard = offlineSdk.TokenStandard.parse(accepted.asset);
      offlinePayTo = offlineSdk.Address.parse(accepted.payTo);
    } catch (error) {
      safetyError('malformed_requirements', error);
    }
    if (offlineTokenStandard.toString() !== accepted.asset || offlinePayTo.toString() !== accepted.payTo ||
        offlinePayTo.toString() === offlineSdk.EMPTY_ADDRESS.toString() ||
        offlinePayTo.getBytes()[0] !== offlineSdk.Address.userByte) {
      safetyError('unsupported_recipient_or_asset');
    }

    return withOwnedZenonSession({
      owner: 'buyer.prepare',
      expectedChainProfile: accepted.extra.zenonChain,
      authenticateChainProfile: this.authenticateChainProfile,
      runtime: this.runtime,
      rpcTimeoutMs: this.rpcTimeoutMs,
      work: async ({ sdk, zenon, chainId }, scope) => {
        let keyPair;
        try {
          const tokenStandard = offlineTokenStandard;
          const callRead = (operation, execute) => runRead(scope, zenon, this.rpcTimeoutMs, operation, execute);
          await assertAssetExists(zenon, sdk, tokenStandard, callRead);
          let wallet;
          try {
            wallet = sdk.KeyStore.fromMnemonic(this.mnemonic);
            keyPair = wallet.getKeyPair(this.accountIndex);
          } catch {
            // Do not retain or expose SDK parser/derivation text derived from
            // mnemonic input in the public error chain.
            safetyError('mnemonic_invalid');
          }
          const intentDigest = paymentIntentDigest(paymentRequired, accepted);
          const payTo = offlinePayTo;
          if (payTo.toString() !== accepted.payTo || payTo.toString() === sdk.EMPTY_ADDRESS.toString() ||
              payTo.getBytes()[0] !== sdk.Address.userByte) safetyError('unsupported_recipient_address');
          const block = sdk.AccountBlockTemplate.send(payTo, tokenStandard, BigInt(accepted.amount));
          block.data = Buffer.from(intentDigest, 'hex');

          // prepareBlock() is a composite SDK operation with internal RPC and
          // possible PoW work. SDK 1.0.5 cannot cancel it, so ownership is held
          // until it completes instead of applying a superficial Promise.race.
          const prepared = await invokeLegacySdk105SignedComposite(zenon, block, keyPair);
          if (prepared.chainIdentifier !== chainId ||
              String(prepared.chainIdentifier) !== accepted.extra.zenonChain.chainIdentifier) {
            safetyError('prepared_chain_mismatch');
          }
          const paymentPayload = {
            x402Version: paymentRequired.x402Version,
            resource: structuredClone(paymentRequired.resource),
            accepted: structuredClone(accepted),
            payload: { transaction: prepared.toJson(), intentDigest },
          };
          // Compare the actual SDK-prepared block with the exact request before
          // returning it to the HTTP client. This is local verification only.
          await preflightZenonPayment(paymentPayload, accepted, paymentRequired);
          return paymentPayload;
        } finally {
          if (keyPair?.clear) {
            try {
              keyPair.clear();
            } catch {
              safetyError('key_cleanup_failed');
            }
          }
        }
      },
    });
  }
}

function journalValidatedInput(preflight) {
  return {
    authorizationKey: preflight.authorizationKey,
    transactionHash: preflight.transactionHash,
    chainProfile: preflight.chainProfile,
    intentDigest: preflight.intentDigest,
    resourceIdentity: preflight.resourceIdentity,
    resourceDigest: preflight.resourceDigest,
    payer: preflight.payer,
    signedAccountBlock: preflight.signedAccountBlock,
  };
}

function assertJournalRecordMatches(record, preflight) {
  if (!record || typeof record !== 'object') safetyError('journal_record_invalid');
  const expected = journalValidatedInput(preflight);
  for (const [field, value] of Object.entries(expected)) {
    if (!Object.hasOwn(record, field) || sha256Hex(record[field]) !== sha256Hex(value)) {
      safetyError('journal_identity_conflict');
    }
  }
}

function strongestEvidenceState(...states) {
  let strongest = EVIDENCE_STATES.VALIDATED;
  for (const state of states) {
    if ((EVIDENCE_RANK.get(state) ?? -1) > EVIDENCE_RANK.get(strongest)) strongest = state;
  }
  return strongest;
}

function noteRecordEvidence(attempt, record) {
  if (!record) return;
  attempt.hasDurableRecord = true;
  attempt.evidenceState = strongestEvidenceState(attempt.evidenceState, record.evidenceState);
  if (Object.values(DELIVERY_STATES).includes(record.deliveryState)) {
    attempt.deliveryState = record.deliveryState;
  }
}

function terminalJournalSettlement(requirements, preflight, record) {
  if (!record) return null;
  if (record.deliveryState === DELIVERY_STATES.DELIVERED) {
    return successful(requirements, preflight, record);
  }
  if (record.deliveryState === DELIVERY_STATES.DELIVERY_PENDING) {
    return failed(
      requirements,
      preflight.transactionHash,
      preflight.payer,
      'delivery_outcome_unknown',
      EVIDENCE_STATES.MOMENTUM_INCLUDED,
      {
        authorizationKey: preflight.authorizationKey,
        retrySamePayment: true,
        deliveryState: record.deliveryState,
      },
    );
  }
  return record.evidenceState === EVIDENCE_STATES.MOMENTUM_INCLUDED
    ? successful(requirements, preflight, record)
    : null;
}

export class ExactZenonFacilitator {
  constructor({
    authenticateChainProfile,
    authenticateNodeNetwork,
    journal = new SettlementJournal(),
    rpcTimeoutMs,
  } = {}) {
    if (!(journal instanceof SettlementJournal)) safetyError('invalid_settlement_journal');
    const chainAuthenticator = authenticateChainProfile ?? authenticateNodeNetwork;
    const configuredTimeout = configuredRpcTimeout(rpcTimeoutMs);
    const payerQueue = new PerPayerQueue();
    Object.defineProperties(this, {
      runtime: {
        value: liveSdkRuntime,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      journal: {
        value: journal,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      authenticateChainProfile: {
        value: chainAuthenticator,
        writable: false,
        configurable: false,
        enumerable: false,
      },
      rpcTimeoutMs: {
        value: configuredTimeout,
        writable: false,
        configurable: false,
        enumerable: true,
      },
      payerQueue: {
        value: payerQueue,
        writable: false,
        configurable: false,
        enumerable: false,
      },
    });
  }

  async verify(paymentPayload, requirements, paymentRequired) {
    try {
      requireLiveAck();
      configuredTestnetNetworkId();
      const preflight = await preflightZenonPayment(paymentPayload, requirements, paymentRequired);
      return await withOwnedZenonSession({
        owner: 'facilitator.verify',
        expectedChainProfile: preflight.chainProfile,
        authenticateChainProfile: this.authenticateChainProfile,
        runtime: this.runtime,
        rpcTimeoutMs: this.rpcTimeoutMs,
        work: async (connection, scope) => {
          await this.#verifyNodeState(preflight, connection, scope, { checkFrontier: true });
          return shieldExactFacilitatorResult({ isValid: true, payer: preflight.payer });
        },
      });
    } catch (error) {
      return invalid(errorCode(error));
    }
  }

  async #verifyNodeState(preflight, connection, scope, { checkFrontier }) {
    const { zenon } = connection;
    const callRead = (operation, execute) => runRead(scope, zenon, this.rpcTimeoutMs, operation, execute);
    await this.#verifyChainAndAsset(preflight, connection, callRead);
    if (checkFrontier) await this.#verifyFrontierState(preflight, connection, callRead);
  }

  async #verifyChainAndAsset(preflight, connection, callRead) {
    const { sdk, zenon, chainId } = connection;
    if (preflight.block.chainIdentifier !== chainId ||
        String(chainId) !== preflight.chainProfile.chainIdentifier) safetyError('wrong_chain_identifier');
    await assertAssetExists(zenon, sdk, preflight.tokenStandard, callRead);
  }

  async #verifyFrontierState(preflight, connection, callRead) {
    const { sdk, zenon } = connection;
    let frontier;
    try {
      frontier = await callRead(
        'ledger.getFrontierAccountBlock',
        () => zenon.ledger.getFrontierAccountBlock(preflight.block.address),
      );
    } catch (error) {
      if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
          error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
      safetyError('frontier_lookup_failed', error);
    }
    if (frontier) {
      let frontierHash;
      try {
        frontierHash = frontier.hash?.toString();
      } catch (error) {
        safetyError('malformed_frontier_account_block', error);
      }
      if (!validSafeInteger(frontier.height, { min: 1 }) || !HASH_HEX.test(frontierHash ?? '')) {
        safetyError('malformed_frontier_account_block');
      }
      if (preflight.block.height !== frontier.height + 1) safetyError('stale_height');
      if (preflight.block.previousHash.toString() !== frontierHash) safetyError('stale_frontier');
    } else if (preflight.block.height !== 1 ||
        preflight.block.previousHash.toString() !== sdk.EMPTY_HASH.toString()) {
      safetyError('invalid_first_frontier');
    }
    await assertNoConflictingUnconfirmedBlocks({
      ledger: zenon.ledger,
      address: preflight.block.address,
      transactionHash: preflight.transactionHash,
      callRead,
    });
  }

  async settle(paymentPayload, requirements, paymentRequired) {
    let preflight;
    try {
      requireLiveAck();
      configuredTestnetNetworkId();
      preflight = await preflightZenonPayment(paymentPayload, requirements, paymentRequired);
    } catch (error) {
      return failed(requirements, '', '', errorCode(error), 'VALIDATION_FAILED');
    }
    return this.payerQueue.run(
      preflight.payer,
      () => this.#settleSerialized(preflight, preflight.requirements),
    );
  }

  async #settleSerialized(preflight, requirements) {
    const attempt = {
      evidenceState: EVIDENCE_STATES.VALIDATED,
      deliveryState: DELIVERY_STATES.NONE,
      journalUnavailable: false,
      hasDurableRecord: false,
    };
    let record;
    try {
      // A known hash must be reconciled before any frontier-sensitive node
      // checks. This also prevents a retry from being mistaken for a new send.
      record = await this.#journalCall(
        attempt,
        () => this.journal.findByTransactionHash(preflight.transactionHash),
      );
      if (record) {
        assertJournalRecordMatches(record, preflight);
        noteRecordEvidence(attempt, record);
      }
      const recovered = terminalJournalSettlement(requirements, preflight, record);
      if (recovered) return recovered;

      return await withOwnedZenonSession({
        owner: 'facilitator.settle',
        expectedChainProfile: preflight.chainProfile,
        authenticateChainProfile: this.authenticateChainProfile,
        runtime: this.runtime,
        rpcTimeoutMs: this.rpcTimeoutMs,
        work: async (connection, scope) => this.#settleWithNode(
          preflight,
          requirements,
          connection,
          scope,
          record,
          attempt,
        ),
      });
    } catch (error) {
      let current = record ?? null;
      try {
        current = await this.#currentRecord(preflight);
        if (current) {
          assertJournalRecordMatches(current, preflight);
          noteRecordEvidence(attempt, current);
        }
      } catch (journalError) {
        if (errorCode(journalError) !== 'journal_identity_conflict') attempt.journalUnavailable = true;
      }
      const evidenceState = strongestEvidenceState(attempt.evidenceState, current?.evidenceState);
      return failed(
        requirements,
        preflight.transactionHash,
        preflight.payer,
        errorCode(error),
        evidenceState,
        {
          authorizationKey: preflight.authorizationKey,
          retrySamePayment: attempt.journalUnavailable ||
            attempt.hasDurableRecord ||
            shouldRetrySamePayment(error, evidenceState, this.runtime.poisoned),
          deliveryState: current?.deliveryState ?? attempt.deliveryState,
        },
      );
    }
  }

  async #settleWithNode(preflight, requirements, connection, scope, initialRecord, attempt) {
    const { sdk, zenon } = connection;
    const callRead = (operation, execute) => runRead(scope, zenon, this.rpcTimeoutMs, operation, execute);
    const lookup = async () => {
      let observed;
      try {
        observed = await callRead(
          'ledger.getAccountBlockByHash',
          () => zenon.ledger.getAccountBlockByHash(sdk.Hash.parse(preflight.transactionHash)),
        );
      } catch (error) {
        if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
            error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
        safetyError('account_lookup_failed', error);
      }
      return observed ? validateObservedAccountBlock(observed, preflight, sdk) : null;
    };

    // Another facilitator instance may have journaled this attempt while this
    // caller waited for process-wide SDK ownership. Reconcile it before the
    // frontier check as well.
    if (!initialRecord) {
      initialRecord = await this.#journalCall(
        attempt,
        () => this.journal.findByTransactionHash(preflight.transactionHash),
      );
      if (initialRecord) {
        assertJournalRecordMatches(initialRecord, preflight);
        noteRecordEvidence(attempt, initialRecord);
      }
    }

    // Resolve chain/asset validity before observing the transaction. Once an
    // exact Momentum-included block is observed, no ordinary node RPC remains
    // between that evidence and its durable journal update.
    await this.#verifyChainAndAsset(preflight, connection, callRead);
    let observed = await lookup();
    if (observed?.confirmationDetail) {
      attempt.evidenceState = EVIDENCE_STATES.MOMENTUM_INCLUDED;
    } else if (observed) {
      attempt.evidenceState = strongestEvidenceState(
        attempt.evidenceState,
        EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      );
    }
    if (!observed && (!initialRecord || initialRecord.evidenceState === EVIDENCE_STATES.VALIDATED)) {
      await this.#verifyFrontierState(preflight, connection, callRead);
    }

    const concurrentlyRecovered = terminalJournalSettlement(requirements, preflight, initialRecord);
    if (concurrentlyRecovered) return concurrentlyRecovered;

    if (observed) {
      initialRecord = await this.#ensureValidatedRecord(preflight, initialRecord, attempt);
      const observedRecovery = terminalJournalSettlement(requirements, preflight, initialRecord);
      if (observedRecovery) return observedRecovery;
    }
    if (observed?.confirmationDetail) {
      const included = await this.#recordMomentum(preflight, observed, attempt);
      return successful(requirements, preflight, included);
    }
    if (observed) {
      attempt.evidenceState = strongestEvidenceState(
        attempt.evidenceState,
        EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      );
      initialRecord = await this.#journalCall(
        attempt,
        () => this.journal.updateEvidence(
          preflight.authorizationKey,
          preflight.transactionHash,
          EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
        ),
      );
      noteRecordEvidence(attempt, initialRecord);
    }

    const wake = observed ? createInactiveWakeup() : await subscribeForSettlementWakeup({
      zenon,
      address: preflight.block.address,
      callRead,
    });
    try {
      if (!observed) {
        initialRecord = await this.#ensureValidatedRecord(preflight, initialRecord, attempt);
        const publicationRecovery = terminalJournalSettlement(requirements, preflight, initialRecord);
        if (publicationRecovery) return publicationRecovery;

        // ACKNOWLEDGED/UNKNOWN records are reconciliation-only. VALIDATED may
        // represent a crash immediately before or after submission, so only the
        // exact same signed block may be retried idempotently.
        if (initialRecord.evidenceState === EVIDENCE_STATES.VALIDATED) {
          const publication = await ensurePublished({
            lookup,
            publish: () => runPublication(
              scope,
              zenon,
              this.rpcTimeoutMs,
              'ledger.publishRawTransaction',
              () => zenon.ledger.publishRawTransaction(preflight.block),
            ),
            observed,
          });
          observed = publication.observed;
          if (publication.state === EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN) {
            attempt.evidenceState = strongestEvidenceState(
              attempt.evidenceState,
              EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
            );
            const ambiguous = await this.#journalCall(
              attempt,
              () => this.journal.updateEvidence(
                preflight.authorizationKey,
                preflight.transactionHash,
                EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
              ),
            );
            noteRecordEvidence(attempt, ambiguous);
            return failed(
              requirements,
              preflight.transactionHash,
              preflight.payer,
              'submission_outcome_unknown',
              ambiguous.evidenceState,
              {
                authorizationKey: preflight.authorizationKey,
                retrySamePayment: true,
                deliveryState: ambiguous.deliveryState,
              },
            );
          }
          if (publication.state === EVIDENCE_STATES.MOMENTUM_INCLUDED) {
            const included = await this.#recordMomentum(preflight, observed, attempt);
            return successful(requirements, preflight, included);
          }
          attempt.evidenceState = strongestEvidenceState(
            attempt.evidenceState,
            EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
          );
          initialRecord = await this.#journalCall(
            attempt,
            () => this.journal.updateEvidence(
              preflight.authorizationKey,
              preflight.transactionHash,
              EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
            ),
          );
          noteRecordEvidence(attempt, initialRecord);
        }
      }

      const included = await waitForMomentumInclusion({
        lookup,
        initialObserved: observed,
        timeoutSeconds: requirements.maxTimeoutSeconds,
        wake,
      });
      if (!included) {
        return failed(
          requirements,
          preflight.transactionHash,
          preflight.payer,
          'momentum_inclusion_timeout',
          initialRecord.evidenceState,
          {
            authorizationKey: preflight.authorizationKey,
            retrySamePayment: true,
            deliveryState: initialRecord.deliveryState,
          },
        );
      }
      const record = await this.#recordMomentum(preflight, included, attempt);
      return successful(requirements, preflight, record);
    } finally {
      wake.close();
    }
  }

  async #journalCall(attempt, operation) {
    try {
      return await operation();
    } catch (error) {
      const code = errorCode(error);
      if (code !== 'journal_identity_conflict' && code !== 'journal_capacity_exceeded') {
        attempt.journalUnavailable = true;
      }
      throw error;
    }
  }

  async #ensureValidatedRecord(preflight, record, attempt) {
    if (record) return record;
    const persisted = await this.#journalCall(
      attempt,
      () => this.journal.putValidated(journalValidatedInput(preflight)),
    );
    assertJournalRecordMatches(persisted, preflight);
    noteRecordEvidence(attempt, persisted);
    return persisted;
  }

  async #recordMomentum(preflight, observed, attempt) {
    const confirmationDetail = normalizeConfirmationDetail(observed.confirmationDetail);
    // Retain this strongest observed evidence in memory before attempting the
    // durable write. A write failure must never downgrade the response.
    attempt.evidenceState = EVIDENCE_STATES.MOMENTUM_INCLUDED;
    const record = await this.#journalCall(
      attempt,
      () => this.journal.updateEvidence(
        preflight.authorizationKey,
        preflight.transactionHash,
        EVIDENCE_STATES.MOMENTUM_INCLUDED,
        {
          observedAt: new Date().toISOString(),
          confirmationDetail,
        },
      ),
    );
    noteRecordEvidence(attempt, record);
    return record;
  }

  async #currentRecord(preflight) {
    return this.journal.get(preflight.authorizationKey, preflight.transactionHash);
  }

  async markDeliveryPending(settlement) {
    validateSettlementIdentity(settlement);
    return this.journal.markDeliveryPending(settlement.authorizationKey, settlement.transaction);
  }

  async markDelivered(settlement, cachedResponse) {
    validateSettlementIdentity(settlement);
    return this.journal.markDelivered(settlement.authorizationKey, settlement.transaction, cachedResponse);
  }
}

function validateSettlementIdentity(settlement) {
  if (!settlement || !HASH_HEX.test(settlement.authorizationKey ?? '') ||
      !HASH_HEX.test(settlement.transaction ?? '')) safetyError('invalid_settlement_identity');
}

export function normalizeConfirmationDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    safetyError('malformed_confirmation_detail');
  }
  let momentumHash;
  try {
    momentumHash = detail.momentumHash?.toString();
  } catch (error) {
    safetyError('malformed_confirmation_detail', error);
  }
  if (!validSafeInteger(detail.numConfirmations, { min: 1 }) ||
      !validSafeInteger(detail.momentumHeight, { min: 1 }) ||
      typeof momentumHash !== 'string' || !HASH_HEX.test(momentumHash) ||
      !validSafeInteger(detail.momentumTimestamp)) {
    safetyError('malformed_confirmation_detail');
  }
  return {
    numConfirmations: detail.numConfirmations,
    momentumHeight: detail.momentumHeight,
    momentumHash,
    momentumTimestamp: detail.momentumTimestamp,
  };
}

function shieldPublicationOutcome(outcome) {
  const descriptor = CREATE_OBJECT(null);
  descriptor.value = undefined;
  descriptor.enumerable = false;
  descriptor.writable = false;
  descriptor.configurable = false;
  DEFINE_PROPERTY(outcome, 'then', descriptor);
  return outcome;
}

export async function ensurePublished({ lookup, publish, observed = undefined }) {
  let known = observed;
  if (known === undefined) known = await lookup();
  if (known) {
    return shieldPublicationOutcome({
      state: known.confirmationDetail ? EVIDENCE_STATES.MOMENTUM_INCLUDED : EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      observed: known,
    });
  }

  // In this adapter the publication callback returns the asynchronous SDK
  // request promise. A synchronous throw therefore occurs before that request
  // was started and is a definite local failure, not an uncertain submission.
  // Once a promise has been returned, any rejection is reconciled by hash and
  // remains uncertain when the node still cannot show the exact block.
  const publication = publish();
  try {
    await publication;
    return shieldPublicationOutcome({
      state: EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
      observed: null,
    });
  } catch (publicationError) {
    try {
      known = await lookup();
    } catch {
      known = null;
    }
    if (known) {
      return shieldPublicationOutcome({
        state: known.confirmationDetail ? EVIDENCE_STATES.MOMENTUM_INCLUDED : EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
        observed: known,
      });
    }
    return shieldPublicationOutcome({
      state: EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
      observed: null,
      publicationError,
    });
  }
}

function createInactiveWakeup() {
  return {
    wait: timeoutMs => new Promise(resolve => setTimeout(resolve, timeoutMs)),
    close() {},
  };
}

async function subscribeForSettlementWakeup({ zenon, address, callRead }) {
  const waiters = new Set();
  let active = true;
  const wake = () => {
    for (const waiter of [...waiters]) waiter();
  };
  try {
    const stream = await callRead(
      'subscribe.toAccountBlocksByAddress',
      () => zenon.subscribe.toAccountBlocksByAddress(address),
    );
    stream.onNotification(wake);
  } catch (error) {
    // Ordinary subscription rejection falls back to polling. A deadline error
    // still poisons and must propagate because its continuation is not isolated.
    if (error?.code === LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT ||
        error?.code === LIVE_RUNTIME_ERROR_CODES.POISONED) throw error;
  }
  return {
    wait(timeoutMs) {
      if (!active) return Promise.resolve();
      return new Promise(resolve => {
        let timer;
        const finish = () => {
          clearTimeout(timer);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        timer = setTimeout(finish, timeoutMs);
      });
    },
    close() {
      active = false;
      wake();
      waiters.clear();
    },
  };
}

export async function waitForMomentumInclusion({ lookup, initialObserved, timeoutSeconds, wake }) {
  if (initialObserved?.confirmationDetail) return initialObserved;
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds <= 0 ||
      timeoutSeconds * 1000 > MAX_CONFIRMATION_WAIT_MS) {
    safetyError('invalid_confirmation_timeout');
  }
  const timeoutMs = timeoutSeconds * 1000;
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const observed = await lookup();
    if (observed?.confirmationDetail) return observed;
    const remaining = Math.max(0, deadline - performance.now());
    if (remaining === 0) break;
    await wake.wait(Math.min(1000, remaining));
  }
  return null;
}

function errorCode(error) {
  if (typeof error?.code === 'string' && error.code.length <= 128) return error.code;
  if (error?.outcome === LIVE_RPC_OUTCOMES.SUBMISSION_OUTCOME_UNKNOWN) return 'submission_outcome_unknown';
  return 'verification_failed';
}

function shouldRetrySamePayment(error, evidenceState, runtimePoisoned) {
  if (runtimePoisoned || [
    EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED,
    EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN,
    EVIDENCE_STATES.MOMENTUM_INCLUDED,
  ].includes(evidenceState)) return true;
  return new Set([
    'node_health_unavailable',
    'node_connection_unavailable',
    'node_not_synchronized',
    'node_network_identity_unavailable',
    'malformed_node_network_info',
    'malformed_frontier_momentum',
    'node_chain_identifier_mismatch',
    'connected_node_chain_profile_mismatch',
    'asset_lookup_failed',
    'account_lookup_failed',
    'frontier_lookup_failed',
    'malformed_frontier_account_block',
    'malformed_observed_account_block',
    'observed_transaction_mismatch',
    'malformed_confirmation_detail',
    'unconfirmed_lookup_failed',
    'unconfirmed_snapshot_changed',
    'incomplete_unconfirmed_snapshot',
    'too_many_unconfirmed_blocks',
    LIVE_RUNTIME_ERROR_CODES.READ_TIMEOUT,
    LIVE_RUNTIME_ERROR_CODES.POISONED,
  ]).has(errorCode(error));
}

function shieldExactFacilitatorResult(result) {
  const descriptor = CREATE_OBJECT(null);
  descriptor.value = undefined;
  descriptor.enumerable = false;
  descriptor.writable = false;
  descriptor.configurable = false;
  DEFINE_PROPERTY(result, 'then', descriptor);
  return result;
}

function invalid(reason, payer = '') {
  return shieldExactFacilitatorResult({ isValid: false, invalidReason: reason, payer });
}

function failed(requirements, transaction, payer, errorReason, state, extra = {}) {
  return shieldExactFacilitatorResult({
    success: false,
    network: typeof requirements?.network === 'string' ? requirements.network : '',
    transaction,
    payer: payer ?? '',
    errorReason,
    state,
    ...extra,
  });
}

function successful(requirements, preflight, record) {
  return shieldExactFacilitatorResult({
    success: true,
    network: requirements.network,
    transaction: preflight.transactionHash,
    payer: preflight.payer,
    state: EVIDENCE_STATES.MOMENTUM_INCLUDED,
    authorizationKey: preflight.authorizationKey,
    deliveryState: record.deliveryState,
    ...(record.deliveryState === DELIVERY_STATES.DELIVERED
      ? { cachedResponse: record.cachedResponse }
      : {}),
  });
}
