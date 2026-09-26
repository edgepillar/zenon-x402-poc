import { createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST,
  GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER,
  parseGateBQuickTunnelHostnameSource,
} from './gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from
  './gate-b-public-ws-private-workspace.js';
import {
  claimGateBQuickTunnelHostnameSourceHandoff,
  readGateBQuickTunnelHostnameSourceHandoffProvenance,
} from
  './gate-b-quick-tunnel-launcher.js';
import { generateGateBResetEpochV4ExclusiveOutputs } from
  './gate-b-reset-epoch-v4-exclusive-output.js';
import {
  bindGateBResetEpochV4Approval,
  prepareGateBResetEpochV4Review,
} from './gate-b-reset-epoch-v4-review.js';
import { parseResetEpochWssOnceRoleInput } from './live-evidence-runner.js';

const ERROR_CODE = 'gate_b_reset_epoch_v4_fresh_input_owner_invalid';
const FILE_MAX_BYTES = 64 * 1024;
const PRIVATE_FILE_MODE = 0o600n;
const LOWERCASE_HASH_64 = /^[0-9a-f]{64}$/;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const BUFFER_FILL = Buffer.prototype.fill;
const BUFFER_FROM = Buffer.from;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_EQUALS = Buffer.prototype.equals;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const BIGINT_TO_STRING = BigInt.prototype.toString;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const OBJECT_CREATE = Object.create;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const WEAK_MAP_DELETE = WeakMap.prototype.delete;
const WEAK_MAP_GET = WeakMap.prototype.get;
const WEAK_MAP_SET = WeakMap.prototype.set;
const COMPLETION_CAPABILITY_STATES = new WeakMap();
const VALIDATION_CAPABILITY_STATES = new WeakMap();

const INPUT_LEAVES = OBJECT_FREEZE([
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
]);
const HANDOFF_INPUT_LEAVES = OBJECT_FREEZE(INPUT_LEAVES.slice(0, 3));
const OUTPUT_LEAVES = OBJECT_FREEZE([
  GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
]);
const ALL_LEAVES = OBJECT_FREEZE([
  ...INPUT_LEAVES,
  ...OUTPUT_LEAVES,
]);
const HANDOFF_PRE_OUTPUT_LEAVES = OBJECT_FREEZE([
  GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.leaf,
  ...INPUT_LEAVES,
]);
const HANDOFF_ALL_LEAVES = OBJECT_FREEZE([
  GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.leaf,
  ...ALL_LEAVES,
]);
const HANDOFF_COMPLETE_LEAVES = OBJECT_FREEZE([
  ...HANDOFF_ALL_LEAVES,
  GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.leaf,
]);
const COMPLETION_MANIFEST_KEYS = OBJECT_FREEZE([
  'completionManifestVersion',
  'kind',
  'markerGeneration',
  'protectedRecords',
  'reviewedConfigDigest',
  'runName',
]);
const GENERATION_KEYS = OBJECT_FREEZE([
  'ctimeNs',
  'dev',
  'gid',
  'ino',
  'mode',
  'mtimeNs',
  'nlink',
  'size',
  'uid',
]);
const PROTECTED_RECORD_KEYS = OBJECT_FREEZE([
  'bytesSha256',
  'generation',
  'leaf',
]);
const HANDOFF_EXCLUSIVE_OUTPUT_OPTIONS = OBJECT_FREEZE({
  handoffPendingMarkerVersion: GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.version,
});
const NON_AUTHORIZING_VALIDATION_STATUS =
  'source_only_completion_validated_non_authorizing';
const CAPTURED_DEFAULT_DEPENDENCY_MODE = 'captured-default-dependencies';
const INJECTED_TEST_ONLY_DEPENDENCY_MODE = 'injected-test-only-dependencies';
const AUTHORITATIVE_DETACHED_PROCESS_GROUP_MODE =
  'authoritative-detached-process-group';
const INHERITED_PROCESS_GROUP_MODE =
  'inherited-process-group-outer-ownership-unproven';
const SUCCESS = OBJECT_FREEZE({
  status: 'source_only_fresh_inputs_and_outputs_written_non_authorizing',
});

export class GateBResetEpochV4FreshInputOwnerError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochV4FreshInputOwnerError';
    this.code = ERROR_CODE;
    this.stack = `GateBResetEpochV4FreshInputOwnerError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBResetEpochV4FreshInputOwnerError();
}

function currentQuickTunnelLaunchProvenance(
  handoff,
  expectedProvenance,
) {
  let provenance;
  try {
    provenance = readGateBQuickTunnelHostnameSourceHandoffProvenance(handoff);
  } catch {
    fail();
  }
  if (!provenance || OBJECT_GET_PROTOTYPE_OF(provenance) !== null ||
      (expectedProvenance !== undefined && provenance !== expectedProvenance)) fail();
  const provenanceKeys = REFLECT_OWN_KEYS(provenance);
  if (provenanceKeys.length !== 2 ||
      provenanceKeys[0] !== 'dependencySelection' ||
      provenanceKeys[1] !== 'processGroupSelection') fail();
  const dependencySelection = provenance.dependencySelection;
  const processGroupSelection = provenance.processGroupSelection;
  if (!dependencySelection ||
      (dependencySelection.mode !== CAPTURED_DEFAULT_DEPENDENCY_MODE &&
        dependencySelection.mode !== INJECTED_TEST_ONLY_DEPENDENCY_MODE)) fail();
  if (!processGroupSelection ||
      (processGroupSelection.mode === AUTHORITATIVE_DETACHED_PROCESS_GROUP_MODE &&
        processGroupSelection.authoritativeGroup !== true) ||
      (processGroupSelection.mode === INHERITED_PROCESS_GROUP_MODE &&
        processGroupSelection.authoritativeGroup !== false) ||
      (processGroupSelection.mode !== AUTHORITATIVE_DETACHED_PROCESS_GROUP_MODE &&
        processGroupSelection.mode !== INHERITED_PROCESS_GROUP_MODE)) fail();
  return provenance;
}

function wipeBuffer(value) {
  if (!BUFFER_IS_BUFFER(value)) return;
  try {
    REFLECT_APPLY(BUFFER_FILL, value, [0]);
  } catch {}
}

function wipeBuffers(values) {
  for (let index = 0; index < values.length; index += 1) {
    wipeBuffer(values[index]);
  }
}

function copyBoundedBuffer(value) {
  if (!BUFFER_IS_BUFFER(value) || IS_PROXY(value) ||
      OBJECT_GET_PROTOTYPE_OF(value) !== Buffer.prototype ||
      value.length < 1 || value.length > FILE_MAX_BYTES ||
      (typeof SharedArrayBuffer === 'function' &&
        value.buffer instanceof SharedArrayBuffer)) fail();
  const copy = BUFFER_FROM(value);
  if (copy.length !== value.length) {
    wipeBuffer(copy);
    fail();
  }
  return copy;
}

function copyInputs(values) {
  const copies = [];
  try {
    for (let index = 0; index < values.length; index += 1) {
      copies.push(copyBoundedBuffer(values[index]));
    }
    return copies;
  } catch {
    wipeBuffers(copies);
    fail();
  }
}

function bufferText(value) {
  return REFLECT_APPLY(BUFFER_TO_STRING, value, ['utf8']);
}

function configFromReview(review) {
  return {
    runnerVersion: review.runnerVersion,
    executionMode: review.executionMode,
    eventId: review.eventId,
    rpcEndpoint: review.rpcEndpoint,
    sourceRevision: review.sourceRevision,
    profileName: review.profileName,
    payer: review.payer,
    acknowledgements: review.acknowledgements,
    expectedPaymentRequired: review.expectedPaymentRequired,
    quickTunnel: review.quickTunnel,
    runtime: review.runtime,
  };
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertCanonicalText(actual, value) {
  const expected = `${canonicalJson(value)}\n`;
  if (actual !== expected || Buffer.byteLength(expected, 'utf8') < 2 ||
      Buffer.byteLength(expected, 'utf8') > FILE_MAX_BYTES) fail();
}

function assertBoundedText(value) {
  if (typeof value !== 'string') fail();
  const length = Buffer.byteLength(value, 'utf8');
  if (length < 2 || length > FILE_MAX_BYTES) fail();
}

function validateBeforeMutation(
  inputBuffers,
  runConfigJson,
  approvalJson,
  reviewedConfigDigest,
  runName,
) {
  assertBoundedText(runConfigJson);
  assertBoundedText(approvalJson);
  const review = prepareGateBResetEpochV4Review(runConfigJson, runName);
  const bound = bindGateBResetEpochV4Approval(
    approvalJson,
    reviewedConfigDigest,
    review,
  );
  if (review.runnerVersion !== 4) fail();
  assertCanonicalText(runConfigJson, configFromReview(bound.review));
  assertCanonicalText(approvalJson, bound.approval);

  const buyerRpcText = bufferText(inputBuffers[1]);
  const facilitatorRpcText = bufferText(inputBuffers[2]);
  const buyerRpc = parseResetEpochWssOnceRoleInput(buyerRpcText, 'buyer-rpc');
  const facilitatorRpc = parseResetEpochWssOnceRoleInput(
    facilitatorRpcText,
    'facilitator-rpc',
  );
  const hostnameSource = parseGateBQuickTunnelHostnameSource(inputBuffers[3]);
  assertCanonicalText(buyerRpcText, buyerRpc);
  assertCanonicalText(facilitatorRpcText, facilitatorRpc);
  if (buyerRpc.secretVersion !== 4 || facilitatorRpc.secretVersion !== 4 ||
      buyerRpc.rpcEndpoint !== facilitatorRpc.rpcEndpoint ||
      buyerRpc.rpcEndpoint !== bound.review.rpcEndpoint ||
      buyerRpc.rpcEndpoint !== bound.approval.rpcEndpoint ||
      bound.review.expectedPaymentRequired.resource.url !==
        `https://${hostnameSource.hostname}/paid` ||
      !sameJson(hostnameSource.quickTunnel, bound.review.quickTunnel) ||
      !sameJson(hostnameSource.quickTunnel, bound.approval.quickTunnel)) fail();
  return bound;
}

function sortedNames(value) {
  if (!ARRAY_IS_ARRAY(value) || value.some(name => typeof name !== 'string')) fail();
  return [...value].sort();
}

async function assertExactLeaves(workspaceRoot, expectedLeaves) {
  const actual = sortedNames(await readdir(workspaceRoot));
  const expected = sortedNames(expectedLeaves);
  if (JSON_STRINGIFY(actual) !== JSON_STRINGIFY(expected)) fail();
}

function exactFileGeneration(stat) {
  if (!stat || typeof stat.isFile !== 'function' || !stat.isFile() ||
      typeof stat.isSymbolicLink !== 'function' || stat.isSymbolicLink() ||
      stat.nlink !== 1n || (stat.mode & 0o777n) !== PRIVATE_FILE_MODE ||
      stat.size < 1n || stat.size > BigInt(FILE_MAX_BYTES)) fail();
  return OBJECT_FREEZE({
    ctimeNs: stat.ctimeNs,
    dev: stat.dev,
    gid: stat.gid,
    ino: stat.ino,
    mode: stat.mode,
    mtimeNs: stat.mtimeNs,
    nlink: stat.nlink,
    size: stat.size,
    uid: stat.uid,
  });
}

function sameGeneration(left, right) {
  return left.ctimeNs === right.ctimeNs && left.dev === right.dev &&
    left.gid === right.gid && left.ino === right.ino && left.mode === right.mode &&
    left.mtimeNs === right.mtimeNs && left.nlink === right.nlink &&
    left.size === right.size && left.uid === right.uid;
}

function manifestGeneration(value) {
  const output = {};
  for (let index = 0; index < GENERATION_KEYS.length; index += 1) {
    const field = GENERATION_KEYS[index];
    if (typeof value?.[field] !== 'bigint' || value[field] < 0n) fail();
    output[field] = REFLECT_APPLY(BIGINT_TO_STRING, value[field], [10]);
  }
  return OBJECT_FREEZE(output);
}

function sha256Hex(bytes) {
  if (!BUFFER_IS_BUFFER(bytes) || bytes.length < 1 || bytes.length > FILE_MAX_BYTES) fail();
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (!LOWERCASE_HASH_64.test(digest)) fail();
  return digest;
}

function completionManifestBytes(
  buffers,
  generations,
  markerGeneration,
  runName,
  reviewedConfigDigest,
) {
  if (!ARRAY_IS_ARRAY(buffers) || buffers.length !== ALL_LEAVES.length ||
      !ARRAY_IS_ARRAY(generations) || generations.length !== ALL_LEAVES.length ||
      typeof runName !== 'string' || runName.length < 1 ||
      typeof reviewedConfigDigest !== 'string' ||
      !LOWERCASE_HASH_64.test(reviewedConfigDigest)) fail();
  const protectedRecords = [];
  for (let index = 0; index < ALL_LEAVES.length; index += 1) {
    protectedRecords.push(OBJECT_FREEZE({
      bytesSha256: sha256Hex(buffers[index]),
      generation: manifestGeneration(generations[index]),
      leaf: ALL_LEAVES[index],
    }));
  }
  const manifest = OBJECT_FREEZE({
    completionManifestVersion:
      GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.version,
    kind: GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.kind,
    markerGeneration: manifestGeneration(markerGeneration),
    protectedRecords: OBJECT_FREEZE(protectedRecords),
    reviewedConfigDigest,
    runName,
  });
  const bytes = BUFFER_FROM(`${canonicalJson(manifest)}\n`, 'utf8');
  if (bytes.length < 2 || bytes.length > FILE_MAX_BYTES) {
    wipeBuffer(bytes);
    fail();
  }
  return bytes;
}

function createCompletionCapability(
  handoff,
  quickTunnelLaunchProvenance,
  workspaceRoot,
  markerGeneration,
  manifestGenerationValue,
  runName,
  reviewedConfigDigest,
  injectedDependenciesUsed,
) {
  const capability = OBJECT_FREEZE(OBJECT_CREATE(null));
  REFLECT_APPLY(
    WEAK_MAP_SET,
    COMPLETION_CAPABILITY_STATES,
    [capability, OBJECT_FREEZE({
      handoff,
      injectedDependenciesUsed: injectedDependenciesUsed === true,
      manifestGeneration: manifestGenerationValue,
      markerGeneration,
      quickTunnelDependencySelection:
        quickTunnelLaunchProvenance.dependencySelection,
      quickTunnelLaunchProvenance,
      quickTunnelProcessGroupSelection:
        quickTunnelLaunchProvenance.processGroupSelection,
      reviewedConfigDigest,
      runName,
      workspaceRoot,
    })],
  );
  return capability;
}

function exactJsonObjectValues(value, expectedKeys) {
  if (!value || typeof value !== 'object' || ARRAY_IS_ARRAY(value) ||
      IS_PROXY(value) || OBJECT_GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const actualKeys = REFLECT_OWN_KEYS(value);
  if (actualKeys.length !== expectedKeys.length) fail();
  const values = [];
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const key = expectedKeys[index];
    if (actualKeys[index] !== key) fail();
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    values.push(descriptor.value);
  }
  return values;
}

function exactJsonArrayValues(value, expectedLength) {
  if (!ARRAY_IS_ARRAY(value) || IS_PROXY(value) ||
      OBJECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE ||
      value.length !== expectedLength) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== expectedLength + 1 || keys[keys.length - 1] !== 'length') fail();
  const values = [];
  for (let index = 0; index < expectedLength; index += 1) {
    const key = String(index);
    if (keys[index] !== key) fail();
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    values.push(descriptor.value);
  }
  return values;
}

function assertManifestGeneration(value, expected) {
  const values = exactJsonObjectValues(value, GENERATION_KEYS);
  for (let index = 0; index < GENERATION_KEYS.length; index += 1) {
    const field = GENERATION_KEYS[index];
    const expectedText = REFLECT_APPLY(BIGINT_TO_STRING, expected[field], [10]);
    if (typeof values[index] !== 'string' || values[index] !== expectedText) fail();
  }
}

function parseCompletionManifest(bytes) {
  if (!BUFFER_IS_BUFFER(bytes) || bytes.length < 2 || bytes.length > FILE_MAX_BYTES) fail();
  const text = bufferText(bytes);
  assertBoundedText(text);
  const value = JSON_PARSE(text);
  assertCanonicalText(text, value);
  return value;
}

function assertCompletionManifest(
  manifest,
  buffers,
  generations,
  completionState,
) {
  if (!ARRAY_IS_ARRAY(buffers) || buffers.length !== HANDOFF_COMPLETE_LEAVES.length ||
      !ARRAY_IS_ARRAY(generations) ||
      generations.length !== HANDOFF_COMPLETE_LEAVES.length) fail();
  const [
    version,
    kind,
    markerGenerationValue,
    protectedRecordsValue,
    reviewedConfigDigest,
    runName,
  ] = exactJsonObjectValues(manifest, COMPLETION_MANIFEST_KEYS);
  if (version !== GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.version ||
      kind !== GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.kind ||
      reviewedConfigDigest !== completionState.reviewedConfigDigest ||
      runName !== completionState.runName) fail();
  assertManifestGeneration(markerGenerationValue, generations[0]);
  const protectedRecords = exactJsonArrayValues(
    protectedRecordsValue,
    ALL_LEAVES.length,
  );
  for (let index = 0; index < ALL_LEAVES.length; index += 1) {
    const [bytesDigest, generationValue, leaf] = exactJsonObjectValues(
      protectedRecords[index],
      PROTECTED_RECORD_KEYS,
    );
    if (leaf !== ALL_LEAVES[index] || typeof bytesDigest !== 'string' ||
        !LOWERCASE_HASH_64.test(bytesDigest) ||
        bytesDigest !== sha256Hex(buffers[index + 1])) fail();
    assertManifestGeneration(generationValue, generations[index + 1]);
  }
}

function claimCompletionCapability(completionCapability) {
  const state = REFLECT_APPLY(
    WEAK_MAP_GET,
    COMPLETION_CAPABILITY_STATES,
    [completionCapability],
  );
  const deleted = REFLECT_APPLY(
    WEAK_MAP_DELETE,
    COMPLETION_CAPABILITY_STATES,
    [completionCapability],
  );
  if (state === undefined || deleted !== true) fail();
  return state;
}

function createValidationCapability(completionState, injectedDependenciesUsed) {
  const capability = OBJECT_FREEZE(OBJECT_CREATE(null));
  const testOnly = completionState.injectedDependenciesUsed === true ||
    completionState.quickTunnelDependencySelection.mode ===
      INJECTED_TEST_ONLY_DEPENDENCY_MODE ||
    injectedDependenciesUsed === true;
  REFLECT_APPLY(
    WEAK_MAP_SET,
    VALIDATION_CAPABILITY_STATES,
    [capability, OBJECT_FREEZE({
      completionState,
      futureLiveConsumerEligible: false,
      quickTunnelDependencySelection:
        completionState.quickTunnelDependencySelection,
      quickTunnelLaunchProvenance:
        completionState.quickTunnelLaunchProvenance,
      quickTunnelProcessGroupSelection:
        completionState.quickTunnelProcessGroupSelection,
      status: NON_AUTHORIZING_VALIDATION_STATUS,
      testOnly,
    })],
  );
  return capability;
}

async function captureGeneration(workspaceRoot, leaf) {
  return exactFileGeneration(await lstat(join(workspaceRoot, leaf), { bigint: true }));
}

async function assertGeneration(workspaceRoot, leaf, expected) {
  if (!sameGeneration(expected, await captureGeneration(workspaceRoot, leaf))) fail();
}

async function captureGenerations(workspaceRoot, leaves) {
  const generations = [];
  const identities = new Set();
  for (let index = 0; index < leaves.length; index += 1) {
    const generation = await captureGeneration(workspaceRoot, leaves[index]);
    const identity = `${generation.dev}:${generation.ino}`;
    if (identities.has(identity)) fail();
    identities.add(identity);
    generations.push(generation);
  }
  return OBJECT_FREEZE(generations);
}

async function assertGenerations(workspaceRoot, leaves, expected) {
  if (!ARRAY_IS_ARRAY(expected) || expected.length !== leaves.length) fail();
  const actual = await captureGenerations(workspaceRoot, leaves);
  for (let index = 0; index < leaves.length; index += 1) {
    if (!sameGeneration(expected[index], actual[index])) fail();
  }
}

async function verifyRecords(workspace, records, buffers) {
  if (!ARRAY_IS_ARRAY(records) || records.length !== buffers.length) fail();
  workspace.assertDistinct(records);
  for (let index = 0; index < records.length; index += 1) {
    await workspace.verify(records[index], buffers[index].length);
  }
}

async function assertRecordBytes(workspace, records, expected) {
  const reads = [];
  try {
    for (let index = 0; index < records.length; index += 1) {
      reads.push(await workspace.read(records[index]));
      if (!REFLECT_APPLY(BUFFER_EQUALS, reads[index], [expected[index]])) fail();
    }
  } finally {
    wipeBuffers(reads);
  }
}

async function assertRetainedCompletionRecords(
  workspace,
  records,
  buffers,
  generations,
  workspaceRoot,
) {
  await assertExactLeaves(workspaceRoot, HANDOFF_COMPLETE_LEAVES);
  workspace.assertDistinct(records);
  await verifyRecords(workspace, records, buffers);
  await assertGenerations(
    workspaceRoot,
    HANDOFF_COMPLETE_LEAVES,
    generations,
  );
  await assertRecordBytes(workspace, records, buffers);
  await verifyRecords(workspace, records, buffers);
  await assertGenerations(
    workspaceRoot,
    HANDOFF_COMPLETE_LEAVES,
    generations,
  );
  workspace.assertDistinct(records);
  await assertExactLeaves(workspaceRoot, HANDOFF_COMPLETE_LEAVES);
}

async function assertRetainedHostnameSource(
  handoff,
  workspace,
  hostnameRecord,
  hostnameBytes,
  hostnameGeneration,
  workspaceRoot,
  expectedLeaves,
) {
  const verifyLocal = async () => {
    await assertExactLeaves(workspaceRoot, expectedLeaves);
    await workspace.verify(hostnameRecord, hostnameBytes.length);
    await assertGeneration(
      workspaceRoot,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      hostnameGeneration,
    );
    await assertRecordBytes(workspace, [hostnameRecord], [hostnameBytes]);
    await workspace.verify(hostnameRecord, hostnameBytes.length);
    await assertGeneration(
      workspaceRoot,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      hostnameGeneration,
    );
    await assertExactLeaves(workspaceRoot, expectedLeaves);
  };
  await verifyLocal();
  if (await handoff.assertCurrent() !== true) fail();
  await verifyLocal();
}

async function assertRetainedProtectedRecords(
  handoff,
  workspace,
  records,
  buffers,
  generations,
  protectedLeaves,
  workspaceRoot,
  namespaceLeaves,
) {
  const verifyLocal = async () => {
    await assertExactLeaves(workspaceRoot, namespaceLeaves);
    workspace.assertDistinct(records);
    await verifyRecords(workspace, records, buffers);
    await assertGenerations(workspaceRoot, protectedLeaves, generations);
    await assertRecordBytes(workspace, records, buffers);
    await verifyRecords(workspace, records, buffers);
    await assertGenerations(workspaceRoot, protectedLeaves, generations);
    workspace.assertDistinct(records);
    await assertExactLeaves(workspaceRoot, namespaceLeaves);
  };
  await verifyLocal();
  if (await handoff.assertCurrent() !== true) fail();
  await verifyLocal();
}

async function closeWorkspace(workspace) {
  if (workspace === undefined) return;
  try {
    await workspace.close();
  } catch {}
}

export async function generateGateBResetEpochV4FreshInputs(
  buyerWalletBytes,
  buyerRpcBytes,
  facilitatorRpcBytes,
  hostnameSourceBytes,
  runConfigJson,
  approvalJson,
  reviewedConfigDigest,
  runName,
  workspaceRoot,
  injected,
) {
  const inputBuffers = copyInputs([
    buyerWalletBytes,
    buyerRpcBytes,
    facilitatorRpcBytes,
    hostnameSourceBytes,
  ]);
  let workspace;
  try {
    validateBeforeMutation(
      inputBuffers,
      runConfigJson,
      approvalJson,
      reviewedConfigDigest,
      runName,
    );

    workspace = await openGateBPublicWsPrivateWorkspace(workspaceRoot, injected);
    await assertExactLeaves(workspaceRoot, []);
    await workspace.assertAbsent(ALL_LEAVES);
    await assertExactLeaves(workspaceRoot, []);

    const records = await workspace.reserveOutputs(INPUT_LEAVES);
    workspace.assertDistinct(records);
    for (let index = 0; index < records.length; index += 1) {
      await workspace.verify(records[index], 0);
    }
    await assertExactLeaves(workspaceRoot, INPUT_LEAVES);

    for (let index = 0; index < records.length; index += 1) {
      await assertExactLeaves(workspaceRoot, INPUT_LEAVES);
      await workspace.write(records[index], inputBuffers[index]);
      await workspace.verify(records[index], inputBuffers[index].length);
      await assertExactLeaves(workspaceRoot, INPUT_LEAVES);
    }
    await workspace.syncDirectories();
    await verifyRecords(workspace, records, inputBuffers);
    await assertRecordBytes(workspace, records, inputBuffers);
    await assertExactLeaves(workspaceRoot, INPUT_LEAVES);

    await generateGateBResetEpochV4ExclusiveOutputs(
      runConfigJson,
      approvalJson,
      reviewedConfigDigest,
      runName,
      workspaceRoot,
      injected,
    );

    await assertExactLeaves(workspaceRoot, ALL_LEAVES);
    await verifyRecords(workspace, records, inputBuffers);
    await assertRecordBytes(workspace, records, inputBuffers);
    await workspace.syncDirectories();
    await verifyRecords(workspace, records, inputBuffers);
    await assertExactLeaves(workspaceRoot, ALL_LEAVES);
    await workspace.close();
    workspace = undefined;
    return SUCCESS;
  } catch {
    fail();
  } finally {
    await closeWorkspace(workspace);
    wipeBuffers(inputBuffers);
  }
}

export async function completeGateBResetEpochV4FreshInputsFromQuickTunnelLease(
  buyerWalletBytes,
  buyerRpcBytes,
  facilitatorRpcBytes,
  runConfigJson,
  approvalJson,
  reviewedConfigDigest,
  runName,
  workspaceRoot,
  quickTunnelLease,
  injected,
) {
  const inputBuffers = copyInputs([
    buyerWalletBytes,
    buyerRpcBytes,
    facilitatorRpcBytes,
  ]);
  const outputBuffers = [];
  let workspace;
  let hostnameBytes;
  let markerBytes;
  let manifestBytes;
  try {
    const handoff = claimGateBQuickTunnelHostnameSourceHandoff(
      quickTunnelLease,
      workspaceRoot,
    );
    const quickTunnelLaunchProvenance = currentQuickTunnelLaunchProvenance(
      handoff,
      undefined,
    );
    if (await handoff.assertCurrent() !== true) fail();

    workspace = await openGateBPublicWsPrivateWorkspace(workspaceRoot, injected);
    await assertExactLeaves(workspaceRoot, [
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ]);
    await workspace.assertAbsent([
      GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.leaf,
      GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.leaf,
      ...HANDOFF_INPUT_LEAVES,
      ...OUTPUT_LEAVES,
    ]);
    await assertExactLeaves(workspaceRoot, [
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ]);

    const hostnameRecords = await workspace.openInputs([
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ]);
    if (!ARRAY_IS_ARRAY(hostnameRecords) || hostnameRecords.length !== 1) fail();
    const hostnameRecord = hostnameRecords[0];
    await workspace.verify(hostnameRecord);
    hostnameBytes = await workspace.read(hostnameRecord);
    const bound = validateBeforeMutation(
      [...inputBuffers, hostnameBytes],
      runConfigJson,
      approvalJson,
      reviewedConfigDigest,
      runName,
    );
    outputBuffers.push(
      BUFFER_FROM(runConfigJson, 'utf8'),
      BUFFER_FROM(`${canonicalJson(bound.approval)}\n`, 'utf8'),
    );
    const hostnameGeneration = await captureGeneration(
      workspaceRoot,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    );
    await assertRetainedHostnameSource(
      handoff,
      workspace,
      hostnameRecord,
      hostnameBytes,
      hostnameGeneration,
      workspaceRoot,
      [GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource],
    );

    const markerRecords = await workspace.reserveOutputs([
      GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.leaf,
    ]);
    if (!ARRAY_IS_ARRAY(markerRecords) || markerRecords.length !== 1) fail();
    const markerRecord = markerRecords[0];
    workspace.assertDistinct([hostnameRecord, markerRecord]);
    await workspace.verify(markerRecord, 0);
    markerBytes = BUFFER_FROM(
      GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.bytes,
      'utf8',
    );
    await workspace.write(markerRecord, markerBytes);
    await workspace.verify(markerRecord, markerBytes.length);
    await workspace.syncDirectories();
    const markerGeneration = await captureGeneration(
      workspaceRoot,
      GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.leaf,
    );
    await assertRetainedProtectedRecords(
      handoff,
      workspace,
      [markerRecord, hostnameRecord],
      [markerBytes, hostnameBytes],
      [markerGeneration, hostnameGeneration],
      [
        GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.leaf,
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      ],
      workspaceRoot,
      [
        GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.leaf,
        GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
      ],
    );

    const records = await workspace.reserveOutputs(HANDOFF_INPUT_LEAVES);
    workspace.assertDistinct([markerRecord, hostnameRecord, ...records]);
    for (let index = 0; index < records.length; index += 1) {
      await workspace.verify(records[index], 0);
    }
    const gateRecords = [markerRecord, hostnameRecord];
    const gateBuffers = [markerBytes, hostnameBytes];
    const gateGenerations = [markerGeneration, hostnameGeneration];
    const gateLeaves = [
      GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.leaf,
      GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
    ];
    await assertRetainedProtectedRecords(
      handoff,
      workspace,
      gateRecords,
      gateBuffers,
      gateGenerations,
      gateLeaves,
      workspaceRoot,
      HANDOFF_PRE_OUTPUT_LEAVES,
    );

    for (let index = 0; index < records.length; index += 1) {
      await assertRetainedProtectedRecords(
        handoff,
        workspace,
        gateRecords,
        gateBuffers,
        gateGenerations,
        gateLeaves,
        workspaceRoot,
        HANDOFF_PRE_OUTPUT_LEAVES,
      );
      await workspace.write(records[index], inputBuffers[index]);
      await workspace.verify(records[index], inputBuffers[index].length);
      await assertRetainedProtectedRecords(
        handoff,
        workspace,
        gateRecords,
        gateBuffers,
        gateGenerations,
        gateLeaves,
        workspaceRoot,
        HANDOFF_PRE_OUTPUT_LEAVES,
      );
    }
    await workspace.syncDirectories();
    await verifyRecords(workspace, records, inputBuffers);
    await assertRecordBytes(workspace, records, inputBuffers);
    const preOutputRecords = [markerRecord, ...records, hostnameRecord];
    const preOutputBuffers = [markerBytes, ...inputBuffers, hostnameBytes];
    const preOutputGenerations = await captureGenerations(
      workspaceRoot,
      HANDOFF_PRE_OUTPUT_LEAVES,
    );
    if (!sameGeneration(markerGeneration, preOutputGenerations[0]) ||
        !sameGeneration(
          hostnameGeneration,
          preOutputGenerations[HANDOFF_PRE_OUTPUT_LEAVES.length - 1],
        )) fail();
    await assertRetainedProtectedRecords(
      handoff,
      workspace,
      preOutputRecords,
      preOutputBuffers,
      preOutputGenerations,
      HANDOFF_PRE_OUTPUT_LEAVES,
      workspaceRoot,
      HANDOFF_PRE_OUTPUT_LEAVES,
    );

    await generateGateBResetEpochV4ExclusiveOutputs(
      runConfigJson,
      approvalJson,
      reviewedConfigDigest,
      runName,
      workspaceRoot,
      injected,
      HANDOFF_EXCLUSIVE_OUTPUT_OPTIONS,
    );

    const outputRecords = await workspace.openInputs(OUTPUT_LEAVES);
    const protectedRecords = [
      markerRecord,
      ...records,
      hostnameRecord,
      ...outputRecords,
    ];
    const protectedBuffers = [
      markerBytes,
      ...inputBuffers,
      hostnameBytes,
      ...outputBuffers,
    ];
    await assertExactLeaves(workspaceRoot, HANDOFF_ALL_LEAVES);
    await verifyRecords(workspace, protectedRecords, protectedBuffers);
    await assertRecordBytes(workspace, protectedRecords, protectedBuffers);
    const protectedGenerations = await captureGenerations(
      workspaceRoot,
      HANDOFF_ALL_LEAVES,
    );
    if (!sameGeneration(markerGeneration, protectedGenerations[0]) ||
        !sameGeneration(
          hostnameGeneration,
          protectedGenerations[HANDOFF_ALL_LEAVES.indexOf(
            GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
          )],
        )) fail();
    await assertRetainedProtectedRecords(
      handoff,
      workspace,
      protectedRecords,
      protectedBuffers,
      protectedGenerations,
      HANDOFF_ALL_LEAVES,
      workspaceRoot,
      HANDOFF_ALL_LEAVES,
    );
    await workspace.syncDirectories();
    await assertRetainedProtectedRecords(
      handoff,
      workspace,
      protectedRecords,
      protectedBuffers,
      protectedGenerations,
      HANDOFF_ALL_LEAVES,
      workspaceRoot,
      HANDOFF_ALL_LEAVES,
    );
    manifestBytes = completionManifestBytes(
      protectedBuffers.slice(1),
      protectedGenerations.slice(1),
      protectedGenerations[0],
      runName,
      reviewedConfigDigest,
    );
    const manifestRecords = await workspace.reserveOutputs([
      GATE_B_RESET_EPOCH_V4_HANDOFF_COMPLETION_MANIFEST.leaf,
    ]);
    if (!ARRAY_IS_ARRAY(manifestRecords) || manifestRecords.length !== 1) fail();
    const manifestRecord = manifestRecords[0];
    workspace.assertDistinct([...protectedRecords, manifestRecord]);
    await workspace.verify(manifestRecord, 0);
    await assertExactLeaves(workspaceRoot, HANDOFF_COMPLETE_LEAVES);
    await verifyRecords(workspace, protectedRecords, protectedBuffers);
    await assertRecordBytes(workspace, protectedRecords, protectedBuffers);
    await assertGenerations(
      workspaceRoot,
      HANDOFF_ALL_LEAVES,
      protectedGenerations,
    );

    await workspace.write(manifestRecord, manifestBytes);
    await workspace.verify(manifestRecord, manifestBytes.length);
    const completeRecords = [...protectedRecords, manifestRecord];
    const completeBuffers = [...protectedBuffers, manifestBytes];
    await verifyRecords(workspace, completeRecords, completeBuffers);
    await assertRecordBytes(workspace, completeRecords, completeBuffers);
    const completeGenerations = await captureGenerations(
      workspaceRoot,
      HANDOFF_COMPLETE_LEAVES,
    );
    for (let index = 0; index < protectedGenerations.length; index += 1) {
      if (!sameGeneration(protectedGenerations[index], completeGenerations[index])) fail();
    }
    const manifestGenerationValue = completeGenerations[completeGenerations.length - 1];
    await assertExactLeaves(workspaceRoot, HANDOFF_COMPLETE_LEAVES);
    workspace.assertDistinct(completeRecords);

    await workspace.syncDirectories();
    await verifyRecords(workspace, completeRecords, completeBuffers);
    await assertRecordBytes(workspace, completeRecords, completeBuffers);
    await assertGenerations(
      workspaceRoot,
      HANDOFF_COMPLETE_LEAVES,
      completeGenerations,
    );
    workspace.assertDistinct(completeRecords);
    await assertExactLeaves(workspaceRoot, HANDOFF_COMPLETE_LEAVES);
    await workspace.close();
    workspace = undefined;
    currentQuickTunnelLaunchProvenance(
      handoff,
      quickTunnelLaunchProvenance,
    );
    return createCompletionCapability(
      handoff,
      quickTunnelLaunchProvenance,
      workspaceRoot,
      markerGeneration,
      manifestGenerationValue,
      runName,
      reviewedConfigDigest,
      injected !== undefined,
    );
  } catch {
    fail();
  } finally {
    await closeWorkspace(workspace);
    wipeBuffers(inputBuffers);
    wipeBuffers(outputBuffers);
    wipeBuffer(hostnameBytes);
    wipeBuffer(markerBytes);
    wipeBuffer(manifestBytes);
  }
}

async function validateClaimedGateBResetEpochV4Completion(
  completionState,
  injected,
) {
  const buffers = [];
  const injectedDependenciesUsed = injected !== undefined;
  const quickTunnelLaunchProvenance = completionState.quickTunnelLaunchProvenance;
  let workspace;
  try {
    if (!quickTunnelLaunchProvenance ||
        completionState.quickTunnelDependencySelection !==
          quickTunnelLaunchProvenance.dependencySelection ||
        completionState.quickTunnelProcessGroupSelection !==
          quickTunnelLaunchProvenance.processGroupSelection) fail();
    currentQuickTunnelLaunchProvenance(
      completionState.handoff,
      quickTunnelLaunchProvenance,
    );
    if (await completionState.handoff.assertCurrent() !== true) fail();

    workspace = await openGateBPublicWsPrivateWorkspace(
      completionState.workspaceRoot,
      injected,
    );
    await assertExactLeaves(
      completionState.workspaceRoot,
      HANDOFF_COMPLETE_LEAVES,
    );
    const records = await workspace.openInputs(HANDOFF_COMPLETE_LEAVES);
    if (!ARRAY_IS_ARRAY(records) ||
        records.length !== HANDOFF_COMPLETE_LEAVES.length) fail();
    workspace.assertDistinct(records);
    for (let index = 0; index < records.length; index += 1) {
      await workspace.verify(records[index]);
    }
    await assertExactLeaves(
      completionState.workspaceRoot,
      HANDOFF_COMPLETE_LEAVES,
    );
    const generations = await captureGenerations(
      completionState.workspaceRoot,
      HANDOFF_COMPLETE_LEAVES,
    );
    for (let index = 0; index < records.length; index += 1) {
      buffers.push(await workspace.read(records[index]));
    }
    await assertRetainedCompletionRecords(
      workspace,
      records,
      buffers,
      generations,
      completionState.workspaceRoot,
    );

    if (bufferText(buffers[0]) !==
        GATE_B_RESET_EPOCH_V4_HANDOFF_PENDING_MARKER.bytes) fail();
    const manifest = parseCompletionManifest(
      buffers[buffers.length - 1],
    );
    assertCompletionManifest(
      manifest,
      buffers,
      generations,
      completionState,
    );
    if (!sameGeneration(completionState.markerGeneration, generations[0]) ||
        !sameGeneration(
          completionState.manifestGeneration,
          generations[generations.length - 1],
        )) fail();

    validateBeforeMutation(
      [buffers[1], buffers[2], buffers[3], buffers[4]],
      bufferText(buffers[5]),
      bufferText(buffers[6]),
      completionState.reviewedConfigDigest,
      completionState.runName,
    );
    await assertRetainedCompletionRecords(
      workspace,
      records,
      buffers,
      generations,
      completionState.workspaceRoot,
    );
    await workspace.close();
    workspace = undefined;
    wipeBuffers(buffers);
  } catch {
    await closeWorkspace(workspace);
    wipeBuffers(buffers);
    fail();
  }

  try {
    if (await completionState.handoff.assertCurrent() !== true) fail();
    currentQuickTunnelLaunchProvenance(
      completionState.handoff,
      quickTunnelLaunchProvenance,
    );
    return createValidationCapability(completionState, injectedDependenciesUsed);
  } catch {
    fail();
  }
}

export function validateGateBResetEpochV4CompletionCapability(
  completionCapability,
  injected,
) {
  const completionState = claimCompletionCapability(completionCapability);
  return validateClaimedGateBResetEpochV4Completion(completionState, injected);
}
