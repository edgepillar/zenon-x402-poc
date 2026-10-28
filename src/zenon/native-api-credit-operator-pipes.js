import { Buffer } from 'node:buffer';
import { closeSync, fstatSync } from 'node:fs';
import { Socket } from 'node:net';
import process from 'node:process';
import { Readable } from 'node:stream';
import { setTimeout, clearTimeout } from 'node:timers';
import { types } from 'node:util';
import { createBuyerOwnedPipeStreams } from '../buyer-owned-pipe-streams.js';

const F = Object.freeze, ON = Readable.prototype.on, RESUME = Readable.prototype.resume, PAUSE = Readable.prototype.pause;
const DESTROY = Readable.prototype.destroy, FILL = Buffer.prototype.fill, GETUID = process.getuid, FAILED = new Set();
let used = false;
function fail() { throw new TypeError('API_CREDIT_OPERATOR_PIPES'); }
function cap() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
  promise.then(() => {}, () => {}); return { promise, resolve, reject }; }
function identity(fd, requirePipe = true) {
  const s = fstatSync(fd, { bigint: true });
  if (requirePipe && (!s.isFIFO() || s.uid !== BigInt(Reflect.apply(GETUID, process, [])))) fail();
  return F({ dev: s.dev, ino: s.ino, uid: s.uid, gid: s.gid, mode: s.mode });
}
function same(a, b) { return a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.gid === b.gid && a.mode === b.mode; }
/** Adopt four explicit, distinct FIFO descriptors after inert validation.
 * Profile/key readers are lazy. Command descriptors transfer to the existing
 * command-stream owner before its constructors are entered. Never raw-close a
 * descriptor after a stream constructor has entered or ownership transferred. */
export function createNativeApiCreditOperatorPipes(argumentsData) {
  if (arguments.length !== 1 || used || process.platform === 'win32' || typeof GETUID !== 'function'
      || argumentsData === null || typeof argumentsData !== 'object' || types.isProxy(argumentsData)) fail();
  const rows = [];
  for (const name of ['profileFd', 'keyFd', 'inputFd', 'outputFd']) {
    const d = Object.getOwnPropertyDescriptor(argumentsData, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail();
    const fd = d.value; if (!Number.isSafeInteger(fd) || fd < 3 || fd > 1023) fail();
    rows.push({ name, fd, identity: identity(fd), stage: 'RAW', socket: null, chunks: [], bytes: 0, read: null,
      readTerminal: false, ended: false, destroyEntered: false, closeObserved: false, rawCloseEntered: false, held: false, timer: null });
  }
  if (new Set(rows.map(r => r.fd)).size !== 4) fail();
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < i; j++) if (same(rows[i].identity, rows[j].identity)) fail();
    for (const fd of [0, 1, 2]) if (same(rows[i].identity, identity(fd, false))) fail();
  }
  used = true;
  const frame = { rows, closing: null, stopped: false, held: false, commandStreams: null, commandSessionEntered: false };
  function wipeChunks(r) { for (const b of r.chunks) Reflect.apply(FILL, b, [0]); r.chunks = []; r.bytes = 0; }
  function cancel(r) { if (r.timer !== null) { clearTimeout(r.timer); r.timer = null; } }
  function rejectRead(r) { if (!r.readTerminal && r.read !== null) { r.readTerminal = true; cancel(r); r.read.reject(new TypeError('API_CREDIT_OPERATOR_INPUT')); } }
  function decideClose() {
    if (frame.closing === null) return;
    if (frame.held || rows.some(r => r.held || r.stage === 'CONSTRUCTING')) { FAILED.add(frame); frame.closing.reject(new TypeError('API_CREDIT_OPERATOR_PIPE_CLOSE_UNKNOWN')); return; }
    if (rows.every(r => r.stage === 'CLOSED' || r.stage === 'TRANSFERRED')) frame.closing.resolve(undefined);
  }
  function destroy(r) {
    if (r.socket === null || r.destroyEntered || r.closeObserved) return;
    r.destroyEntered = true;
    try { Reflect.apply(DESTROY, r.socket, []); } catch { r.held = true; frame.held = true; FAILED.add(frame); }
  }
  function read(r, maximumBytes, guard, budgetMs) {
    if (frame.stopped || r.stage !== 'RAW' || r.read !== null || typeof guard !== 'function' || types.isProxy(guard)
        || !Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > 60000) fail();
    guard(); if (!same(r.identity, identity(r.fd))) fail(); r.read = cap();
    try {
      r.stage = 'CONSTRUCTING';
      r.socket = new Socket({ fd: r.fd, readable: true, writable: false, allowHalfOpen: true });
      r.stage = 'STREAM';
      Reflect.apply(ON, r.socket, ['error', () => { rejectRead(r); destroy(r); decideClose(); }]);
      Reflect.apply(ON, r.socket, ['close', () => { r.closeObserved = true; r.stage = 'CLOSED'; if (!r.ended) rejectRead(r); wipeChunks(r); decideClose(); }]);
      Reflect.apply(PAUSE, r.socket, []);
      Reflect.apply(ON, r.socket, ['data', chunk => {
        if (!Buffer.isBuffer(chunk)) { rejectRead(r); destroy(r); return; }
        if (frame.stopped || r.readTerminal || r.bytes + chunk.length > maximumBytes) {
          Reflect.apply(FILL, chunk, [0]); rejectRead(r); destroy(r); wipeChunks(r); return;
        }
        r.chunks.push(chunk); r.bytes += chunk.length;
      }]);
      Reflect.apply(ON, r.socket, ['end', () => {
        r.ended = true; if (frame.stopped || r.readTerminal) { rejectRead(r); wipeChunks(r); return; }
        try {
          guard(); const output = Buffer.concat(r.chunks, r.bytes); wipeChunks(r); r.readTerminal = true; cancel(r);
          // This owned byte result never assimilates an inherited then getter.
          Object.defineProperty(output, 'then', { value: undefined }); r.read.resolve(output);
        } catch { rejectRead(r); wipeChunks(r); destroy(r); }
      }]);
      r.timer = setTimeout(() => { rejectRead(r); wipeChunks(r); destroy(r); }, budgetMs);
      guard(); Reflect.apply(RESUME, r.socket, []);
    } catch {
      rejectRead(r); wipeChunks(r);
      if (r.socket !== null) destroy(r); else { r.held = true; frame.held = true; FAILED.add(frame); }
    }
    return r.read.promise;
  }
  const close = F(function close() {
    if (arguments.length !== 0) fail(); if (frame.closing !== null) return frame.closing.promise;
    frame.closing = cap(); frame.stopped = true;
    for (const r of rows) {
      rejectRead(r); cancel(r); wipeChunks(r);
      if (r.stage === 'RAW') {
        r.rawCloseEntered = true;
        try { if (!same(r.identity, identity(r.fd))) fail(); closeSync(r.fd); r.closeObserved = true; r.stage = 'CLOSED'; }
        catch { r.held = true; frame.held = true; FAILED.add(frame); }
      } else if (r.stage === 'STREAM') destroy(r);
    }
    decideClose(); return frame.closing.promise;
  });
  const adoptCommands = F(function adoptCommands(guard) {
    if (arguments.length !== 1 || frame.stopped || frame.commandStreams !== null) fail(); guard();
    const input = rows[2], output = rows[3];
    if (input.stage !== 'RAW' || output.stage !== 'RAW' || !same(input.identity, identity(input.fd)) || !same(output.identity, identity(output.fd))) fail();
    input.stage = output.stage = 'TRANSFERRED';
    try { frame.commandStreams = createBuyerOwnedPipeStreams({ inputFd: input.fd, outputFd: output.fd }); return frame.commandStreams; }
    catch { frame.held = true; FAILED.add(frame); fail(); }
  });
  return F({ readProfile: F((guard, budget) => read(rows[0], 262144, guard, budget)),
    readCredential: F((guard, budget) => read(rows[1], 32, guard, budget)), adoptCommands, close,
    inspect: F(() => F({ operatorPipeOwnerVersion: 1, stopped: frame.stopped, held: frame.held,
      descriptors: F(rows.map(r => F({ role: r.name, ownership: r.stage, closeObserved: r.closeObserved, destroyEntered: r.destroyEntered }))),
      nativeResourceRelease: 'NOT_ESTABLISHED', bootstrapDescriptorsOnly: true, authority: 'NONE' })) });
}
