import { Buffer } from 'node:buffer';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

import { SettlementJournal } from '../settlement-journal.js';

const IPC_VERSION = 1;
const OFFLINE_TEST_MODE = '--fixed-payer-offline-test-v1';
const OFFLINE_TEST_FIXTURE = new URL(
  '../../test-support/fixed-payer-settlement-child.js',
  import.meta.url,
);
const ENTRYPOINT = fileURLToPath(import.meta.url);
const JOURNAL_DIRECTORY = 'journal';
const JOURNAL_FILE = 'settlement-journal.json';
const JOURNAL_MARKER = '.settlement-journal.initialized';
const JOURNAL_ENTRIES = Object.freeze([JOURNAL_FILE, JOURNAL_MARKER]);
const MAX_PATH_BYTES = 4096;
const SAFE_ASCII = /^[\x21-\x7e]+$/;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE = Object.getPrototypeOf;
const HAS_OWN = Object.hasOwn;
const IS_PROXY = utilTypes.isProxy;
const OWN_KEYS = Reflect.ownKeys;

export const FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE =
  '.fixed-payer-settlement.one-use-v1';
export const FIXED_PAYER_SETTLEMENT_STARTUP_STDOUT_BOUNDARY =
  'FIXED_PAYER_STARTUP_STDOUT_BOUNDARY_V1\n';
export const FIXED_PAYER_SETTLEMENT_STARTUP_STDERR_BOUNDARY =
  'FIXED_PAYER_STARTUP_STDERR_BOUNDARY_V1\n';

export const FIXED_PAYER_SETTLEMENT_CHILD_STARTUP_ERROR_CODES = Object.freeze({
  INVALID_CONFIGURATION: 'FIXED_PAYER_CHILD_STARTUP_INVALID_CONFIGURATION',
  ROOT_UNSAFE: 'FIXED_PAYER_CHILD_STARTUP_ROOT_UNSAFE',
  CLAIM_RETAINED: 'FIXED_PAYER_CHILD_STARTUP_CLAIM_RETAINED',
  CLAIM_UNCERTAIN: 'FIXED_PAYER_CHILD_STARTUP_CLAIM_UNCERTAIN',
  JOURNAL_NOT_FRESH: 'FIXED_PAYER_CHILD_STARTUP_JOURNAL_NOT_FRESH',
  AUTHORITY_REQUIRED: 'FIXED_PAYER_CHILD_STARTUP_AUTHORITY_REQUIRED',
});
const CODES = FIXED_PAYER_SETTLEMENT_CHILD_STARTUP_ERROR_CODES;

export class FixedPayerSettlementChildStartupError extends Error {
  constructor(code) {
    super(code);
    this.name = 'FixedPayerSettlementChildStartupError';
    this.code = code;
    this.stack = `FixedPayerSettlementChildStartupError: ${code}`;
  }
}

function fail(code) {
  throw new FixedPayerSettlementChildStartupError(code);
}

function exactRecord(value, fields) {
  if (!value || typeof value !== 'object' || IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      GET_PROTOTYPE(value) !== Object.prototype) fail(CODES.INVALID_CONFIGURATION);
  const keys = OWN_KEYS(value);
  if (keys.length !== fields.length || keys.some(key =>
    typeof key !== 'string' || !fields.includes(key))) fail(CODES.INVALID_CONFIGURATION);
  const captured = Object.create(null);
  for (const field of fields) {
    const descriptor = GET_DESCRIPTOR(value, field);
    if (!descriptor || !HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
      fail(CODES.INVALID_CONFIGURATION);
    }
    captured[field] = descriptor.value;
  }
  return captured;
}

function safeAscii(value, maximum) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum ||
      Buffer.byteLength(value, 'utf8') > maximum || !SAFE_ASCII.test(value)) {
    fail(CODES.INVALID_CONFIGURATION);
  }
  return value;
}

function absolutePath(value) {
  if (typeof value !== 'string' || value.length < 1 ||
      Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES || value.includes('\0') ||
      !isAbsolute(value) || resolve(value) !== value) fail(CODES.INVALID_CONFIGURATION);
  return value;
}

function sameNode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function ownedByCurrentUser(stat) {
  return typeof process.getuid !== 'function' || stat.uid === process.getuid();
}

function privateDirectory(stat) {
  return stat.isDirectory() && !stat.isSymbolicLink() &&
    (stat.mode & 0o777) === 0o700 && ownedByCurrentUser(stat);
}

function privateFile(stat, size = undefined) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 &&
    (stat.mode & 0o777) === 0o600 && ownedByCurrentUser(stat) &&
    (size === undefined || stat.size === size);
}

async function closeHandle(handle, code) {
  if (handle === undefined) return;
  try {
    await handle.close();
  } catch {
    fail(code);
  }
}

async function inspectPrivateRoot(privateRoot) {
  let pathState;
  let canonical;
  let handle;
  try {
    pathState = await lstat(privateRoot);
    if (!privateDirectory(pathState)) fail(CODES.ROOT_UNSAFE);
    canonical = await realpath(privateRoot);
    if (canonical !== privateRoot) fail(CODES.ROOT_UNSAFE);
    if (!Number.isInteger(fsConstants.O_DIRECTORY) ||
        !Number.isInteger(fsConstants.O_NOFOLLOW)) fail(CODES.ROOT_UNSAFE);
    const flags = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;
    handle = await open(privateRoot, flags);
    const handleState = await handle.stat();
    if (!privateDirectory(handleState) || !sameNode(pathState, handleState)) {
      fail(CODES.ROOT_UNSAFE);
    }
    return { handle, state: handleState };
  } catch (error) {
    try { await handle?.close(); } catch {}
    if (error instanceof FixedPayerSettlementChildStartupError) throw error;
    fail(CODES.ROOT_UNSAFE);
  }
}

async function claimOneUse(privateRoot, rootHandle, rootState) {
  const markerPath = join(privateRoot, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE);
  let markerHandle;
  let created = false;
  try {
    if (!Number.isInteger(fsConstants.O_NOFOLLOW)) fail(CODES.CLAIM_RETAINED);
    const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL |
      fsConstants.O_NOFOLLOW;
    markerHandle = await open(markerPath, flags, 0o600);
    created = true;
    const descriptorState = await markerHandle.stat();
    if (!privateFile(descriptorState, 0)) fail(CODES.CLAIM_UNCERTAIN);
    await markerHandle.sync();
    await rootHandle.sync();
    const [markerState, currentRoot, currentCanonical] = await Promise.all([
      lstat(markerPath),
      lstat(privateRoot),
      realpath(privateRoot),
    ]);
    if (!privateFile(markerState, 0) || !sameNode(markerState, descriptorState) ||
        !privateDirectory(currentRoot) || !sameNode(currentRoot, rootState) ||
        currentCanonical !== privateRoot) fail(CODES.CLAIM_UNCERTAIN);
  } catch (error) {
    try { await markerHandle?.close(); } catch {}
    if (error instanceof FixedPayerSettlementChildStartupError) throw error;
    if (!created && error?.code === 'EEXIST') fail(CODES.CLAIM_RETAINED);
    fail(created ? CODES.CLAIM_UNCERTAIN : CODES.CLAIM_RETAINED);
  }
  const markerState = await markerHandle.stat().catch(() => fail(CODES.CLAIM_UNCERTAIN));
  await closeHandle(markerHandle, CODES.CLAIM_UNCERTAIN);
  return Object.freeze({ dev: markerState.dev, ino: markerState.ino });
}

async function existingJournalMode(directory) {
  try {
    const state = await lstat(directory);
    if (!privateDirectory(state) || await realpath(directory) !== directory) {
      fail(CODES.JOURNAL_NOT_FRESH);
    }
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    if (error instanceof FixedPayerSettlementChildStartupError) throw error;
    fail(CODES.JOURNAL_NOT_FRESH);
  }
}

async function assertExactJournalEntries(directory) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch {
    fail(CODES.JOURNAL_NOT_FRESH);
  }
  if (entries.length !== JOURNAL_ENTRIES.length ||
      JOURNAL_ENTRIES.some(entry => !entries.includes(entry))) {
    fail(CODES.JOURNAL_NOT_FRESH);
  }
}

function exactInitialLoad(value) {
  return value && GET_PROTOTYPE(value) === Object.prototype &&
    value.schemaVersion === 1 && value.revision === 0 &&
    ARRAY_IS_ARRAY(value.records) && value.records.length === 0;
}

function exactInitialList(value) {
  return value && GET_PROTOTYPE(value) === Object.prototype &&
    ARRAY_IS_ARRAY(value.records) && value.records.length === 0 &&
    ARRAY_IS_ARRAY(value.tombstones) && value.tombstones.length === 0;
}

async function assertFreshJournal(privateRoot, rootState, claimState) {
  const directory = join(privateRoot, JOURNAL_DIRECTORY);
  try {
    const existingOnly = await existingJournalMode(directory);
    if (existingOnly) await assertExactJournalEntries(directory);
    const journal = new SettlementJournal({
      directory,
      allowedRoot: privateRoot,
      existingOnly,
    });
    const first = await journal.load();
    const entries = await journal.list({ includeTombstones: true });
    const second = await journal.load();
    if (!exactInitialLoad(first) || !exactInitialList(entries) ||
        !exactInitialLoad(second)) fail(CODES.JOURNAL_NOT_FRESH);
    await assertExactJournalEntries(directory);
    const [rootAfter, claimAfter, directoryState, fileState, markerState] = await Promise.all([
      lstat(privateRoot),
      lstat(join(privateRoot, FIXED_PAYER_SETTLEMENT_STARTUP_MARKER_FILE)),
      lstat(directory),
      lstat(join(directory, JOURNAL_FILE)),
      lstat(join(directory, JOURNAL_MARKER)),
    ]);
    if (!privateDirectory(rootAfter) || !sameNode(rootAfter, rootState) ||
        !privateFile(claimAfter, 0) || !sameNode(claimAfter, claimState) ||
        !privateDirectory(directoryState) || !privateFile(fileState) ||
        !privateFile(markerState, 0) || await realpath(privateRoot) !== privateRoot ||
        await realpath(directory) !== directory) fail(CODES.JOURNAL_NOT_FRESH);
    return journal;
  } catch (error) {
    if (error instanceof FixedPayerSettlementChildStartupError) throw error;
    fail(CODES.JOURNAL_NOT_FRESH);
  }
}

export async function prepareFreshFixedPayerSettlementChild(options) {
  if (arguments.length !== 1) fail(CODES.INVALID_CONFIGURATION);
  const captured = exactRecord(options, ['privateRoot', 'shardId', 'payer', 'generation']);
  const privateRoot = absolutePath(captured.privateRoot);
  const shardId = safeAscii(captured.shardId, 64);
  const payer = safeAscii(captured.payer, 128);
  const generation = safeAscii(captured.generation, 64);
  const inspected = await inspectPrivateRoot(privateRoot);
  try {
    const claimState = await claimOneUse(privateRoot, inspected.handle, inspected.state);
    const journal = await assertFreshJournal(privateRoot, inspected.state, claimState);
    const readyFrame = Object.freeze({
      ipcVersion: IPC_VERSION,
      type: 'READY',
      correlationId: `${generation}:${shardId}:startup`,
      shardId,
      payer,
      generation,
      journalSchemaVersion: 1,
      journalRevision: 0,
    });
    return Object.freeze({ journal, readyFrame });
  } finally {
    await closeHandle(inspected.handle, CODES.CLAIM_UNCERTAIN);
  }
}

async function runEntrypoint() {
  if (process.argv.length !== 5 || process.argv[2] !== OFFLINE_TEST_MODE ||
      (process.argv[3] !== 'A' && process.argv[3] !== 'B')) {
    fail(CODES.AUTHORITY_REQUIRED);
  }
  const fixtureModule = await import(OFFLINE_TEST_FIXTURE);
  const descriptor = GET_DESCRIPTOR(fixtureModule, 'runFixedPayerSettlementOfflineFixture');
  if (!descriptor || !HAS_OWN(descriptor, 'value') || typeof descriptor.value !== 'function') {
    fail(CODES.AUTHORITY_REQUIRED);
  }
  await Reflect.apply(descriptor.value, undefined, [{
    label: process.argv[3],
    privateRoot: process.argv[4],
  }]);
}

if (process.argv[1] === ENTRYPOINT) {
  void runEntrypoint().catch(() => {
    process.exitCode = 64;
    try { process.stdin.destroy(); } catch {}
    try {
      if (process.connected) process.disconnect();
    } catch {}
  });
}
