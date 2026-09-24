import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { types as utilTypes } from 'node:util';

import {
  GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3,
  GATE_B_RESET_EPOCH_STATUS_V3,
  assertGateBResetEpochArtifactPolicyBindingV3,
  createGateBResetEpochAuthorizationArtifactV3,
  createGateBResetEpochBootstrapArtifactV3,
  createGateBResetEpochConfigurationArtifactV3,
  parseGateBResetEpochAuthorizationArtifactV3,
  parseGateBResetEpochBootstrapArtifactV3,
  parseGateBResetEpochConfigurationArtifactV3,
  parseGateBResetEpochReviewArtifactV3,
  serializeGateBResetEpochArtifactV3,
} from './gate-b-reset-epoch-artifacts-v3.js';
import {
  independentlyReviewGateBResetEpochConfigurationV3,
} from './gate-b-reset-epoch-independent-review-v3.js';
import { GATE_B_PUBLIC_WS_INPUT_LEAVES } from './gate-b-public-ws-inputs-schema.js';

const ERROR_CODE = 'gate_b_reset_epoch_filesystem_preflight_v3_invalid';
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MAXIMUM_ARTIFACT_BYTES = 16 * 1024;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const V3_LEAVES = Object.freeze(Object.values(GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3));
const LEGACY_LEAVES = Object.freeze(Object.values(GATE_B_PUBLIC_WS_INPUT_LEAVES));

export class GateBResetEpochFilesystemPreflightV3Error extends Error {
  constructor() {
    super(ERROR_CODE);
    this.name = 'GateBResetEpochFilesystemPreflightV3Error';
    this.code = ERROR_CODE;
    this.stack = undefined;
  }
}

function fail() {
  throw new GateBResetEpochFilesystemPreflightV3Error();
}

function exactPlainObject(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value) ||
      ARRAY_IS_ARRAY(value) || GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE) fail();
  const keys = REFLECT_OWN_KEYS(value);
  if (keys.length !== fields.length) fail();
  const snapshot = Object.create(null);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') ||
        descriptor.enumerable !== true) fail();
    snapshot[field] = descriptor.value;
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== 'string' || !fields.includes(keys[index])) fail();
  }
  return snapshot;
}

function captureDependencies(injected) {
  const output = {
    actualCwd: () => process.cwd(),
    constants: fsConstants,
    getuid: typeof process.getuid === 'function' ? () => process.getuid() : undefined,
    lstatPath: lstat,
    openPath: open,
    realpathPath: realpath,
    reviewConfiguration: independentlyReviewGateBResetEpochConfigurationV3,
  };
  if (injected !== undefined) {
    const supplied = exactPlainObject(injected, Object.keys(output));
    for (const field of Object.keys(output)) output[field] = supplied[field];
  }
  if (!output.constants || typeof output.constants !== 'object' ||
      IS_PROXY(output.constants)) fail();
  for (const field of [
    'actualCwd', 'getuid', 'lstatPath', 'openPath', 'realpathPath',
    'reviewConfiguration',
  ]) if (typeof output[field] !== 'function' || IS_PROXY(output[field])) fail();
  return Object.freeze(output);
}

function missing(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'ENOENT');
}

function mode(stat) {
  return Number(stat.mode & 0o777n);
}

function exactDirectoryStat(stat, uid) {
  return stat && typeof stat.isDirectory === 'function' && stat.isDirectory() &&
    typeof stat.isSymbolicLink === 'function' && !stat.isSymbolicLink() &&
    stat.uid === BigInt(uid) && mode(stat) === PRIVATE_DIRECTORY_MODE;
}

function exactFileStat(stat, uid, expectedSize) {
  return stat && typeof stat.isFile === 'function' && stat.isFile() &&
    typeof stat.isSymbolicLink === 'function' && !stat.isSymbolicLink() &&
    stat.uid === BigInt(uid) && stat.nlink === 1n &&
    mode(stat) === PRIVATE_FILE_MODE && stat.size >= 0n &&
    stat.size <= BigInt(MAXIMUM_ARTIFACT_BYTES) &&
    (expectedSize === undefined || stat.size === BigInt(expectedSize));
}

function sameInode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameGeneration(left, right) {
  return sameInode(left, right) && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs &&
    left.mode === right.mode && left.nlink === right.nlink;
}

async function assertOutsideGit(root, dependencies) {
  let current = root;
  for (;;) {
    try {
      await Reflect.apply(dependencies.lstatPath, undefined, [
        join(current, '.git'),
        { bigint: true },
      ]);
      fail();
    } catch (error) {
      if (!missing(error)) fail();
    }
    const parent = dirname(current);
    if (parent === current) return true;
    current = parent;
  }
}

async function assertLeavesAbsent(root, leaves, dependencies) {
  for (let index = 0; index < leaves.length; index += 1) {
    try {
      await Reflect.apply(dependencies.lstatPath, undefined, [
        join(root, leaves[index]),
        { bigint: true },
      ]);
      fail();
    } catch (error) {
      if (!missing(error)) fail();
    }
  }
}

async function openWorkspace(root, dependencies) {
  const canonical = await Reflect.apply(dependencies.realpathPath, undefined, [root]);
  if (canonical !== root || Reflect.apply(dependencies.actualCwd, undefined, []) !== root) fail();
  const uid = Reflect.apply(dependencies.getuid, undefined, []);
  if (!Number.isSafeInteger(uid) || uid < 0) fail();
  const pathStat = await Reflect.apply(dependencies.lstatPath, undefined, [
    root,
    { bigint: true },
  ]);
  if (!exactDirectoryStat(pathStat, uid)) fail();
  await assertOutsideGit(root, dependencies);
  const { O_DIRECTORY, O_NOFOLLOW, O_RDONLY } = dependencies.constants;
  if (![O_DIRECTORY, O_NOFOLLOW, O_RDONLY].every(Number.isInteger) ||
      O_DIRECTORY === 0 || O_NOFOLLOW === 0) fail();
  const handle = await Reflect.apply(dependencies.openPath, undefined, [
    root,
    O_DIRECTORY | O_NOFOLLOW | O_RDONLY,
  ]);
  if (!handle || typeof handle.stat !== 'function' ||
      typeof handle.sync !== 'function' || typeof handle.close !== 'function') fail();
  const descriptorStat = await handle.stat({ bigint: true });
  if (!exactDirectoryStat(descriptorStat, uid) || !sameInode(pathStat, descriptorStat)) {
    try { await handle.close(); } catch {}
    fail();
  }
  return Object.freeze({ descriptorStat, handle, pathStat, root, uid });
}

async function assertWorkspaceStable(workspace, dependencies) {
  const [pathStat, descriptorStat] = await Promise.all([
    Reflect.apply(dependencies.lstatPath, undefined, [
      workspace.root,
      { bigint: true },
    ]),
    workspace.handle.stat({ bigint: true }),
  ]);
  if (!exactDirectoryStat(pathStat, workspace.uid) ||
      !exactDirectoryStat(descriptorStat, workspace.uid) ||
      !sameInode(workspace.pathStat, pathStat) ||
      !sameInode(workspace.descriptorStat, descriptorStat)) fail();
  return true;
}

async function reserveLeaf(workspace, leaf, dependencies) {
  const { O_CREAT, O_EXCL, O_NOFOLLOW, O_RDWR } = dependencies.constants;
  if (![O_CREAT, O_EXCL, O_NOFOLLOW, O_RDWR].every(Number.isInteger) ||
      O_EXCL === 0 || O_NOFOLLOW === 0) fail();
  const path = join(workspace.root, leaf);
  const handle = await Reflect.apply(dependencies.openPath, undefined, [
    path,
    O_CREAT | O_EXCL | O_NOFOLLOW | O_RDWR,
    PRIVATE_FILE_MODE,
  ]);
  if (!handle || typeof handle.stat !== 'function' || typeof handle.write !== 'function' ||
      typeof handle.read !== 'function' || typeof handle.sync !== 'function' ||
      typeof handle.close !== 'function') fail();
  const stat = await handle.stat({ bigint: true });
  if (!exactFileStat(stat, workspace.uid, 0)) {
    try { await handle.close(); } catch {}
    fail();
  }
  return { handle, leaf, path, stat };
}

function assertDistinct(records) {
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      if (sameInode(records[left].stat, records[right].stat)) fail();
    }
  }
}

async function writeRecord(record, bytes, workspace, dependencies) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 ||
      bytes.length > MAXIMUM_ARTIFACT_BYTES) fail();
  let offset = 0;
  while (offset < bytes.length) {
    const result = await record.handle.write(bytes, offset, bytes.length - offset, offset);
    if (!result || !Number.isSafeInteger(result.bytesWritten) || result.bytesWritten < 1 ||
        result.bytesWritten > bytes.length - offset) fail();
    offset += result.bytesWritten;
  }
  await record.handle.sync();
  const [pathStat, descriptorStat] = await Promise.all([
    Reflect.apply(dependencies.lstatPath, undefined, [record.path, { bigint: true }]),
    record.handle.stat({ bigint: true }),
  ]);
  if (!exactFileStat(pathStat, workspace.uid, bytes.length) ||
      !exactFileStat(descriptorStat, workspace.uid, bytes.length) ||
      !sameInode(record.stat, pathStat) || !sameInode(record.stat, descriptorStat) ||
      !sameGeneration(pathStat, descriptorStat)) fail();
  record.stat = descriptorStat;
}

async function readHandle(handle, size) {
  if (!Number.isSafeInteger(size) || size < 3 || size > MAXIMUM_ARTIFACT_BYTES) fail();
  const bytes = Buffer.alloc(size);
  let offset = 0;
  try {
    while (offset < size) {
      const result = await handle.read(bytes, offset, size - offset, offset);
      if (!result || !Number.isSafeInteger(result.bytesRead) || result.bytesRead < 1 ||
          result.bytesRead > size - offset) fail();
      offset += result.bytesRead;
    }
    return bytes;
  } catch {
    bytes.fill(0);
    fail();
  }
}

async function readRecord(record) {
  const stat = await record.handle.stat({ bigint: true });
  if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  return readHandle(record.handle, Number(stat.size));
}

async function closeRecords(records) {
  let clean = true;
  for (let index = 0; index < records.length; index += 1) {
    try { await records[index].handle.close(); } catch { clean = false; }
  }
  return clean;
}

async function openInputLeaf(workspace, leaf, dependencies) {
  const { O_NOFOLLOW, O_RDONLY } = dependencies.constants;
  if (![O_NOFOLLOW, O_RDONLY].every(Number.isInteger) || O_NOFOLLOW === 0) fail();
  const path = join(workspace.root, leaf);
  const pathStat = await Reflect.apply(dependencies.lstatPath, undefined, [
    path,
    { bigint: true },
  ]);
  if (!exactFileStat(pathStat, workspace.uid)) fail();
  const handle = await Reflect.apply(dependencies.openPath, undefined, [
    path,
    O_RDONLY | O_NOFOLLOW,
  ]);
  if (!handle || typeof handle.stat !== 'function' || typeof handle.read !== 'function' ||
      typeof handle.close !== 'function') fail();
  const stat = await handle.stat({ bigint: true });
  if (!exactFileStat(stat, workspace.uid) || !sameGeneration(pathStat, stat)) {
    try { await handle.close(); } catch {}
    fail();
  }
  return { handle, leaf, path, stat };
}

function exactReviewedResult(value) {
  const review = exactPlainObject(value, [
    'artifactFamily', 'configurationDigest', 'policySelection', 'reviewVersion', 'status',
  ]);
  if (review.reviewVersion !== 3 ||
      review.status !== GATE_B_RESET_EPOCH_STATUS_V3.REVIEW_VALID) fail();
  return Object.freeze({
    artifactFamily: review.artifactFamily,
    configurationDigest: review.configurationDigest,
    policySelection: review.policySelection,
    reviewVersion: review.reviewVersion,
    status: review.status,
  });
}

export async function preflightGateBResetEpochArtifactsV3(binding, injected = undefined) {
  try {
    createGateBResetEpochBootstrapArtifactV3(binding);
  } catch {
    fail();
  }
  const dependencies = captureDependencies(injected);
  let workspace;
  let records = [];
  const buffers = [];
  try {
    const root = binding.workspaceRoot;
    workspace = await openWorkspace(root, dependencies);
    await assertWorkspaceStable(workspace, dependencies);
    await assertLeavesAbsent(root, LEGACY_LEAVES, dependencies);
    for (let index = 0; index < V3_LEAVES.length; index += 1) {
      records.push(await openInputLeaf(workspace, V3_LEAVES[index], dependencies));
    }
    assertDistinct(records);
    const byLeaf = Object.create(null);
    for (let index = 0; index < records.length; index += 1) {
      const bytes = await readRecord(records[index]);
      buffers.push(bytes);
      byLeaf[records[index].leaf] = bytes;
    }
    const bootstrap = parseGateBResetEpochBootstrapArtifactV3(
      byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.bootstrap],
    );
    const configuration = parseGateBResetEpochConfigurationArtifactV3(
      byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.configuration],
    );
    const review = parseGateBResetEpochReviewArtifactV3(
      byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.review],
    );
    const authorization = parseGateBResetEpochAuthorizationArtifactV3(
      byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.authorization],
    );
    assertGateBResetEpochArtifactPolicyBindingV3(
      binding,
      bootstrap,
      configuration,
      review,
      authorization,
    );
    const independent = exactReviewedResult(Reflect.apply(
      dependencies.reviewConfiguration,
      undefined,
      [byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.configuration]],
    ));
    if (independent.configurationDigest !== review.configurationDigest ||
        review.configurationDigest !== authorization.configurationDigest) fail();
    assertGateBResetEpochArtifactPolicyBindingV3(independent, review, authorization);
    await assertWorkspaceStable(workspace, dependencies);
    for (let index = 0; index < records.length; index += 1) {
      const pathStat = await Reflect.apply(dependencies.lstatPath, undefined, [
        records[index].path,
        { bigint: true },
      ]);
      const descriptorStat = await records[index].handle.stat({ bigint: true });
      if (!exactFileStat(pathStat, workspace.uid, Number(records[index].stat.size)) ||
          !exactFileStat(descriptorStat, workspace.uid, Number(records[index].stat.size)) ||
          !sameGeneration(records[index].stat, pathStat) ||
          !sameGeneration(records[index].stat, descriptorStat)) fail();
    }
    return Object.freeze({
      schemaVersion: 3,
      status: GATE_B_RESET_EPOCH_STATUS_V3.PREFLIGHT_VALID,
    });
  } catch {
    fail();
  } finally {
    for (let index = 0; index < buffers.length; index += 1) {
      try { buffers[index].fill(0); } catch {}
    }
    await closeRecords(records);
    if (workspace) {
      try { await workspace.handle.close(); } catch {}
    }
  }
}

export async function prepareAndPreflightGateBResetEpochArtifactsV3(
  binding,
  injected = undefined,
) {
  try {
    createGateBResetEpochBootstrapArtifactV3(binding);
  } catch {
    fail();
  }
  const dependencies = captureDependencies(injected);
  let workspace;
  let records = [];
  const buffers = [];
  try {
    const root = binding.workspaceRoot;
    workspace = await openWorkspace(root, dependencies);
    await assertWorkspaceStable(workspace, dependencies);
    await assertLeavesAbsent(root, [...LEGACY_LEAVES, ...V3_LEAVES], dependencies);
    for (let index = 0; index < V3_LEAVES.length; index += 1) {
      records.push(await reserveLeaf(workspace, V3_LEAVES[index], dependencies));
    }
    assertDistinct(records);
    await workspace.handle.sync();
    const byLeaf = Object.create(null);
    for (let index = 0; index < records.length; index += 1) {
      byLeaf[records[index].leaf] = records[index];
    }
    const bootstrap = createGateBResetEpochBootstrapArtifactV3(binding);
    const configuration = createGateBResetEpochConfigurationArtifactV3(binding);
    const bootstrapBytes = serializeGateBResetEpochArtifactV3(bootstrap);
    const configurationBytes = serializeGateBResetEpochArtifactV3(configuration);
    buffers.push(bootstrapBytes, configurationBytes);
    await writeRecord(
      byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.bootstrap],
      bootstrapBytes,
      workspace,
      dependencies,
    );
    await writeRecord(
      byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.configuration],
      configurationBytes,
      workspace,
      dependencies,
    );
    const storedConfiguration = await readRecord(
      byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.configuration],
    );
    buffers.push(storedConfiguration);
    const review = exactReviewedResult(Reflect.apply(
      dependencies.reviewConfiguration,
      undefined,
      [storedConfiguration],
    ));
    const authorization = createGateBResetEpochAuthorizationArtifactV3(
      binding,
      configuration,
      review,
    );
    const reviewBytes = serializeGateBResetEpochArtifactV3(review);
    const authorizationBytes = serializeGateBResetEpochArtifactV3(authorization);
    buffers.push(reviewBytes, authorizationBytes);
    await writeRecord(
      byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.review],
      reviewBytes,
      workspace,
      dependencies,
    );
    await writeRecord(
      byLeaf[GATE_B_RESET_EPOCH_ARTIFACT_LEAVES_V3.authorization],
      authorizationBytes,
      workspace,
      dependencies,
    );
    await workspace.handle.sync();
    await assertWorkspaceStable(workspace, dependencies);
    if (!await closeRecords(records)) fail();
    records = [];
    await workspace.handle.close();
    workspace = undefined;
    return await preflightGateBResetEpochArtifactsV3(binding, dependencies);
  } catch {
    fail();
  } finally {
    for (let index = 0; index < buffers.length; index += 1) {
      try { buffers[index].fill(0); } catch {}
    }
    await closeRecords(records);
    if (workspace) {
      try { await workspace.handle.close(); } catch {}
    }
  }
}
