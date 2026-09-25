import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { canonicalJson } from './canonical.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  parseGateBQuickTunnelHostnameSource,
} from './gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from
  './gate-b-public-ws-private-workspace.js';
import {
  bindGateBResetEpochV4Approval,
  prepareGateBResetEpochV4Review,
} from './gate-b-reset-epoch-v4-review.js';
import { parseResetEpochWssOnceRoleInput } from './live-evidence-runner.js';

const ERROR_CODE = 'gate_b_reset_epoch_v4_exclusive_output_invalid';
const PRIVATE_FILE_MODE = 0o600n;
const OUTPUT_MAX_BYTES = 64 * 1024;
const ARRAY_IS_ARRAY = Array.isArray;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_FROM = Buffer.from;
const JSON_STRINGIFY = JSON.stringify;
const OBJECT_FREEZE = Object.freeze;
const PROCESS_CWD = process.cwd.bind(process);

const INPUT_LEAVES = OBJECT_FREEZE([
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
]);
const OUTPUT_LEAVES = OBJECT_FREEZE([
  GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
]);
const ALL_LEAVES = OBJECT_FREEZE([...INPUT_LEAVES, ...OUTPUT_LEAVES]);
const NON_WALLET_INPUT_INDEXES = OBJECT_FREEZE([1, 2, 3]);
const SUCCESS = OBJECT_FREEZE({
  status: 'source_only_outputs_written_non_authorizing',
});

export class GateBResetEpochV4ExclusiveOutputError extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochV4ExclusiveOutputError';
    this.code = ERROR_CODE;
    this.stack = `GateBResetEpochV4ExclusiveOutputError: ${ERROR_CODE}`;
  }
}

function fail() {
  throw new GateBResetEpochV4ExclusiveOutputError();
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

function prepareBoundedOutputs(
  runConfigJson,
  approvalJson,
  reviewedConfigDigest,
  runName,
) {
  const review = prepareGateBResetEpochV4Review(runConfigJson, runName);
  const binding = bindGateBResetEpochV4Approval(
    approvalJson,
    reviewedConfigDigest,
    review,
  );
  const config = OBJECT_FREEZE(configFromReview(binding.review));
  const canonicalConfig = `${canonicalJson(config)}\n`;
  const canonicalApproval = `${canonicalJson(binding.approval)}\n`;
  if (runConfigJson !== canonicalConfig ||
      BUFFER_BYTE_LENGTH(canonicalConfig, 'utf8') < 2 ||
      BUFFER_BYTE_LENGTH(canonicalConfig, 'utf8') > OUTPUT_MAX_BYTES ||
      BUFFER_BYTE_LENGTH(canonicalApproval, 'utf8') < 2 ||
      BUFFER_BYTE_LENGTH(canonicalApproval, 'utf8') > OUTPUT_MAX_BYTES) fail();
  return OBJECT_FREEZE({
    config,
    approval: binding.approval,
    configText: canonicalConfig,
    approvalText: canonicalApproval,
  });
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function assertCrossBinding(bound, buyerRpc, facilitatorRpc, hostnameSource) {
  if (buyerRpc.rpcEndpoint !== facilitatorRpc.rpcEndpoint ||
      buyerRpc.rpcEndpoint !== bound.config.rpcEndpoint ||
      buyerRpc.rpcEndpoint !== bound.approval.rpcEndpoint ||
      bound.config.expectedPaymentRequired.resource.url !==
        `https://${hostnameSource.hostname}/paid` ||
      !sameJson(hostnameSource.quickTunnel, bound.config.quickTunnel) ||
      !sameJson(hostnameSource.quickTunnel, bound.approval.quickTunnel)) fail();
}

function exactSortedNames(names) {
  if (!ARRAY_IS_ARRAY(names) || names.some(name => typeof name !== 'string')) fail();
  return [...names].sort();
}

async function assertExactLeaves(workspaceRoot, expectedLeaves) {
  const actual = exactSortedNames(await readdir(workspaceRoot));
  const expected = exactSortedNames(expectedLeaves);
  if (JSON_STRINGIFY(actual) !== JSON_STRINGIFY(expected)) fail();
}

function exactFileGeneration(stat) {
  if (!stat || typeof stat.isFile !== 'function' || !stat.isFile() ||
      typeof stat.isSymbolicLink !== 'function' || stat.isSymbolicLink() ||
      stat.nlink !== 1n || (stat.mode & 0o777n) !== PRIVATE_FILE_MODE) fail();
  return OBJECT_FREEZE({
    dev: stat.dev,
    ino: stat.ino,
    uid: stat.uid,
    gid: stat.gid,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
    mode: stat.mode,
    nlink: stat.nlink,
  });
}

async function captureGenerations(workspaceRoot, leaves) {
  const generations = new Map();
  const identities = new Set();
  for (let index = 0; index < leaves.length; index += 1) {
    const leaf = leaves[index];
    const generation = exactFileGeneration(await lstat(
      join(workspaceRoot, leaf),
      { bigint: true },
    ));
    const identity = `${generation.dev}:${generation.ino}`;
    if (identities.has(identity)) fail();
    identities.add(identity);
    generations.set(leaf, generation);
  }
  return generations;
}

function sameGeneration(left, right) {
  return left.dev === right.dev && left.ino === right.ino &&
    left.uid === right.uid && left.gid === right.gid &&
    left.size === right.size && left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs && left.mode === right.mode &&
    left.nlink === right.nlink;
}

async function assertGenerations(workspaceRoot, expected, leaves) {
  const actual = await captureGenerations(workspaceRoot, leaves);
  for (let index = 0; index < leaves.length; index += 1) {
    const leaf = leaves[index];
    if (!sameGeneration(expected.get(leaf), actual.get(leaf))) fail();
  }
}

async function verifyRecords(workspace, records, leaves, generations) {
  if (!ARRAY_IS_ARRAY(records) || records.length !== leaves.length) fail();
  workspace.assertDistinct(records);
  for (let index = 0; index < records.length; index += 1) {
    const generation = generations?.get(leaves[index]);
    const expectedSize = generation === undefined ? undefined : Number(generation.size);
    if (expectedSize !== undefined && !Number.isSafeInteger(expectedSize)) fail();
    await workspace.verify(records[index], expectedSize);
  }
}

async function readNonWalletInputs(workspace, records) {
  const buffers = [];
  try {
    for (let index = 0; index < NON_WALLET_INPUT_INDEXES.length; index += 1) {
      buffers.push(await workspace.read(records[NON_WALLET_INPUT_INDEXES[index]]));
    }
    const buyerRpc = parseResetEpochWssOnceRoleInput(buffers[0].toString('utf8'), 'buyer-rpc');
    const facilitatorRpc = parseResetEpochWssOnceRoleInput(
      buffers[1].toString('utf8'),
      'facilitator-rpc',
    );
    const hostnameSource = parseGateBQuickTunnelHostnameSource(buffers[2]);
    return { buffers, buyerRpc, facilitatorRpc, hostnameSource };
  } catch {
    for (let index = 0; index < buffers.length; index += 1) buffers[index].fill(0);
    fail();
  }
}

function assertSameBuffers(left, right) {
  if (left.length !== right.length) fail();
  for (let index = 0; index < left.length; index += 1) {
    if (!left[index].equals(right[index])) fail();
  }
}

function wipeBuffers(buffers) {
  for (let index = 0; index < buffers.length; index += 1) {
    if (Buffer.isBuffer(buffers[index])) buffers[index].fill(0);
  }
}

async function closeWorkspace(workspace) {
  if (workspace === undefined) return;
  try {
    await workspace.close();
  } catch {}
}

export async function generateGateBResetEpochV4ExclusiveOutputs(
  runConfigJson,
  approvalJson,
  reviewedConfigDigest,
  runName,
  workspaceRoot = PROCESS_CWD(),
  injected,
) {
  let workspace;
  let initialInputRead;
  let postWriteInputRead;
  let freshRead;
  const outputBuffers = [];
  const freshBuffers = [];
  try {
    const bound = prepareBoundedOutputs(
      runConfigJson,
      approvalJson,
      reviewedConfigDigest,
      runName,
    );
    outputBuffers.push(
      BUFFER_FROM(bound.configText, 'utf8'),
      BUFFER_FROM(bound.approvalText, 'utf8'),
    );

    workspace = await openGateBPublicWsPrivateWorkspace(workspaceRoot, injected);
    await assertExactLeaves(workspaceRoot, INPUT_LEAVES);
    const initialGenerations = await captureGenerations(workspaceRoot, INPUT_LEAVES);
    const inputs = await workspace.openInputs(INPUT_LEAVES);
    await verifyRecords(workspace, inputs, INPUT_LEAVES, initialGenerations);
    await assertGenerations(workspaceRoot, initialGenerations, INPUT_LEAVES);
    await assertExactLeaves(workspaceRoot, INPUT_LEAVES);

    initialInputRead = await readNonWalletInputs(workspace, inputs);
    assertCrossBinding(
      bound,
      initialInputRead.buyerRpc,
      initialInputRead.facilitatorRpc,
      initialInputRead.hostnameSource,
    );
    await verifyRecords(workspace, inputs, INPUT_LEAVES, initialGenerations);
    await assertGenerations(workspaceRoot, initialGenerations, INPUT_LEAVES);
    await assertExactLeaves(workspaceRoot, INPUT_LEAVES);

    const outputs = await workspace.reserveOutputs(OUTPUT_LEAVES);
    workspace.assertDistinct([...inputs, ...outputs]);
    await verifyRecords(workspace, inputs, INPUT_LEAVES, initialGenerations);
    for (let index = 0; index < outputs.length; index += 1) {
      await workspace.verify(outputs[index], 0);
    }
    await assertGenerations(workspaceRoot, initialGenerations, INPUT_LEAVES);
    await assertExactLeaves(workspaceRoot, ALL_LEAVES);

    await workspace.write(outputs[0], outputBuffers[0]);
    await workspace.write(outputs[1], outputBuffers[1]);
    await workspace.syncDirectories();
    await verifyRecords(workspace, inputs, INPUT_LEAVES, initialGenerations);
    await workspace.verify(outputs[0], outputBuffers[0].length);
    await workspace.verify(outputs[1], outputBuffers[1].length);
    workspace.assertDistinct([...inputs, ...outputs]);
    await assertGenerations(workspaceRoot, initialGenerations, INPUT_LEAVES);
    await assertExactLeaves(workspaceRoot, ALL_LEAVES);

    postWriteInputRead = await readNonWalletInputs(workspace, inputs);
    assertSameBuffers(initialInputRead.buffers, postWriteInputRead.buffers);
    assertCrossBinding(
      bound,
      postWriteInputRead.buyerRpc,
      postWriteInputRead.facilitatorRpc,
      postWriteInputRead.hostnameSource,
    );
    await verifyRecords(workspace, inputs, INPUT_LEAVES, initialGenerations);
    await assertGenerations(workspaceRoot, initialGenerations, INPUT_LEAVES);
    await assertExactLeaves(workspaceRoot, ALL_LEAVES);
    const completedGenerations = await captureGenerations(workspaceRoot, ALL_LEAVES);

    await workspace.close();
    workspace = undefined;

    workspace = await openGateBPublicWsPrivateWorkspace(workspaceRoot, injected);
    await assertExactLeaves(workspaceRoot, ALL_LEAVES);
    const reopened = await workspace.openInputs(ALL_LEAVES);
    await verifyRecords(workspace, reopened, ALL_LEAVES, completedGenerations);
    await assertGenerations(workspaceRoot, completedGenerations, ALL_LEAVES);

    freshBuffers.push(await workspace.read(reopened[1]));
    freshBuffers.push(await workspace.read(reopened[2]));
    freshBuffers.push(await workspace.read(reopened[3]));
    freshBuffers.push(await workspace.read(reopened[4]));
    freshBuffers.push(await workspace.read(reopened[5]));
    const [
      buyerRpcBytes,
      facilitatorRpcBytes,
      hostnameBytes,
      configBytes,
      approvalBytes,
    ] = freshBuffers;
    freshRead = {
      buyerRpc: parseResetEpochWssOnceRoleInput(
        buyerRpcBytes.toString('utf8'),
        'buyer-rpc',
      ),
      facilitatorRpc: parseResetEpochWssOnceRoleInput(
        facilitatorRpcBytes.toString('utf8'),
        'facilitator-rpc',
      ),
      hostnameSource: parseGateBQuickTunnelHostnameSource(hostnameBytes),
    };
    assertSameBuffers(initialInputRead.buffers, freshBuffers.slice(0, 3));
    if (!configBytes.equals(outputBuffers[0]) || !approvalBytes.equals(outputBuffers[1])) fail();
    const rebound = prepareBoundedOutputs(
      configBytes.toString('utf8'),
      approvalBytes.toString('utf8'),
      reviewedConfigDigest,
      runName,
    );
    assertCrossBinding(
      rebound,
      freshRead.buyerRpc,
      freshRead.facilitatorRpc,
      freshRead.hostnameSource,
    );
    await verifyRecords(workspace, reopened, ALL_LEAVES, completedGenerations);
    await assertGenerations(workspaceRoot, completedGenerations, ALL_LEAVES);
    await assertExactLeaves(workspaceRoot, ALL_LEAVES);
    await workspace.close();
    workspace = undefined;
    return SUCCESS;
  } catch {
    fail();
  } finally {
    await closeWorkspace(workspace);
    wipeBuffers(outputBuffers);
    wipeBuffers(initialInputRead?.buffers ?? []);
    wipeBuffers(postWriteInputRead?.buffers ?? []);
    wipeBuffers(freshBuffers);
  }
}
