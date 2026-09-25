import { readdir } from 'node:fs/promises';
import { types as utilTypes } from 'node:util';

import { canonicalJson } from './canonical.js';
import {
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  parseGateBQuickTunnelHostnameSource,
} from './gate-b-public-ws-inputs-schema.js';
import { openGateBPublicWsPrivateWorkspace } from
  './gate-b-public-ws-private-workspace.js';
import { generateGateBResetEpochV4ExclusiveOutputs } from
  './gate-b-reset-epoch-v4-exclusive-output.js';
import {
  bindGateBResetEpochV4Approval,
  prepareGateBResetEpochV4Review,
} from './gate-b-reset-epoch-v4-review.js';
import { parseResetEpochWssOnceRoleInput } from './live-evidence-runner.js';

const ERROR_CODE = 'gate_b_reset_epoch_v4_fresh_input_owner_invalid';
const FILE_MAX_BYTES = 64 * 1024;
const ARRAY_IS_ARRAY = Array.isArray;
const BUFFER_FILL = Buffer.prototype.fill;
const BUFFER_FROM = Buffer.from;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_TO_STRING = Buffer.prototype.toString;
const IS_PROXY = utilTypes.isProxy;
const JSON_STRINGIFY = JSON.stringify;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const REFLECT_APPLY = Reflect.apply;

const INPUT_LEAVES = OBJECT_FREEZE([
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.hostnameSource,
]);
const ALL_LEAVES = OBJECT_FREEZE([
  ...INPUT_LEAVES,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig,
  GATE_B_PUBLIC_WS_INPUT_LEAVES.resetLiveApproval,
]);
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
      if (!reads[index].equals(expected[index])) fail();
    }
  } finally {
    wipeBuffers(reads);
  }
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
