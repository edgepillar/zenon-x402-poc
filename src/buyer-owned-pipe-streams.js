import { fstatSync } from 'node:fs';
import { Socket } from 'node:net';
import process from 'node:process';
import { Readable, Writable } from 'node:stream';
import { types as utilTypes } from 'node:util';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor;
const OWN = Object.hasOwn, PROXY = utilTypes.isProxy;
const ON = Readable.prototype.on, PAUSE = Readable.prototype.pause;
const R_DESTROY = Readable.prototype.destroy, W_DESTROY = Writable.prototype.destroy;
const RESERVED = new Set(), FAILED = new Set();
const GETUID = process.getuid;

/** Adopt two fresh, independently supplied POSIX FIFO descriptors. Ownership
 * transfers only after inert validation of both descriptors. Never discover,
 * duplicate, open, connect or listen on a descriptor, or use process stdio.
 * The caller must supply the input read end and output write end and relinquish
 * every other owner. fstat cannot authenticate that premise or descriptor modes.
 * The actual command channel/session owns successful stream shutdown. */
export function createBuyerOwnedPipeStreams(configuration) {
  if (arguments.length !== 1 || process.platform === 'win32' || typeof GETUID !== 'function'
      || FAILED.size !== 0 || RESERVED.size >= 128) fail('configuration_rejected');
  const c = fields(configuration);
  const inputFd = c.inputFd, outputFd = c.outputFd;
  for (const fd of [inputFd, outputFd]) {
    if (!Number.isSafeInteger(fd) || fd < 3 || fd > 1023 || RESERVED.has(fd)) fail('descriptor_rejected');
  }
  if (inputFd === outputFd) fail('descriptor_rejected');
  const inputIdentity = identity(inputFd), outputIdentity = identity(outputFd);
  if (same(inputIdentity, outputIdentity)) fail('descriptor_rejected');
  for (const fd of [0, 1, 2]) {
    const standard = identity(fd, false);
    if (same(inputIdentity, standard) || same(outputIdentity, standard)) fail('descriptor_rejected');
  }
  // No await or caller hook separates the final checks and constructors.
  // Same-process mutation is outside this cooperative transfer contract.
  RESERVED.add(inputFd); RESERVED.add(outputFd);
  const held = { inputFd, outputFd, inputIdentity, outputIdentity, input: null, output: null };
  const observedError = F(() => { FAILED.add(held); });
  try {
    held.input = new Socket({ fd: inputFd, readable: true, writable: false, allowHalfOpen: true });
    APPLY(ON, held.input, ['error', observedError]);
    APPLY(PAUSE, held.input, []);
    held.output = new Socket({ fd: outputFd, readable: false, writable: true, allowHalfOpen: true });
    APPLY(ON, held.output, ['error', observedError]);
    if (!same(inputIdentity, identity(inputFd)) || !same(outputIdentity, identity(outputFd))) fail('acquisition_unknown');
    return F({ input: held.input, output: held.output });
  } catch {
    FAILED.add(held);
    // Retain actual partial owners and independently attempt their stops once.
    // Never raw-close a failed constructor's FD: ownership/reuse is unknown.
    if (held.input !== null) { try { APPLY(R_DESTROY, held.input, []); } catch {} }
    if (held.output !== null) { try { APPLY(W_DESTROY, held.output, []); } catch {} }
    fail('acquisition_unknown');
  }
}

function fields(value) {
  if (value === null || typeof value !== 'object' || PROXY(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 2) fail('configuration_rejected');
  const out = {};
  for (const name of ['inputFd', 'outputFd']) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('configuration_rejected');
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function identity(fd, requirePipe = true) {
  try {
    const s = fstatSync(fd, { bigint: true });
    if (requirePipe && (!s.isFIFO() || s.uid !== BigInt(APPLY(GETUID, process, [])))) fail('descriptor_rejected');
    // Pipe I/O can change times; only the stable object identity is compared.
    return F({ dev: s.dev, ino: s.ino, uid: s.uid, gid: s.gid, mode: s.mode });
  } catch { fail('descriptor_rejected'); }
}
function same(a, b) { return a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.gid === b.gid && a.mode === b.mode; }
function fail(kind) {
  const code = 'buyer_owned_pipe_streams_' + kind, value = new TypeError(code);
  Object.defineProperty(value, 'code', { value: code, enumerable: true });
  Object.defineProperty(value, 'stack', { value: 'TypeError: ' + code });
  throw F(value);
}
