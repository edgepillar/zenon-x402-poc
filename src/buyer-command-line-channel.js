import { Buffer } from 'node:buffer';
import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { TextDecoder, types as utilTypes } from 'node:util';
import { captureBuyerOriginalFundingCommandLimits } from './buyer-original-funding-command.js';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor;
const PROXY = utilTypes.isProxy, OWN = Object.hasOwn;
const ON = Readable.prototype.on, W_ON = Writable.prototype.on;
const PAUSE = Readable.prototype.pause, RESUME = Readable.prototype.resume;
const R_DESTROY = Readable.prototype.destroy, W_DESTROY = Writable.prototype.destroy;
const WRITE = Writable.prototype.write;
const NativePromise = Promise, THEN = NativePromise.prototype.then;
const COUNT = EventEmitter.prototype.listenerCount;
const RESERVED = new WeakSet(), FAILED_CONSTRUCTIONS = new Set();

/** Validate before native acquisition; streams remain caller-owned here. */
export function captureBuyerCommandLineChannelConfiguration(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  const c = fields(configuration, ['input', 'output', 'limits']);
  const limits = captureBuyerOriginalFundingCommandLimits(c.limits);
  const input = c.input, output = c.output;
  if (FAILED_CONSTRUCTIONS.size >= 16 || PROXY(input) || PROXY(output)
      || !(input instanceof Readable) || !(output instanceof Writable)
      || RESERVED.has(input) || RESERVED.has(output)
      || input === output || input.destroyed || output.destroyed || input.readableEnded
      || output.writableEnded || input.readableObjectMode || output.writableObjectMode
      || input.readableEncoding !== null || input.readableFlowing === true
      || APPLY(COUNT, input, ['data']) !== 0 || APPLY(COUNT, input, ['readable']) !== 0
      || APPLY(COUNT, input, ['newListener']) !== 0
      || APPLY(COUNT, output, ['newListener']) !== 0) fail('configuration_rejected');
  return F({ input, output, limits });
}

/**
 * Transfer exclusive ownership after inert validation, before listener setup.
 * A failed setup retains its owners privately and attempts both stops once.
 * Already reserved streams cannot be acquired by another channel. Input starts
 * paused. One read and one callback/backpressure-aware write may be pending.
 * close requests BOTH destroys; its caller supplies the whole-close deadline.
 * A write callback establishes no remote receipt, payment or delivery.
 */
export function createBuyerCommandLineChannel(configuration) {
  if (arguments.length !== 1) fail('configuration_rejected');
  const { input, output, limits } = captureBuyerCommandLineChannelConfiguration(configuration);
  const bytes = Buffer.alloc(limits.maxInputBytes), decoder = new TextDecoder('utf8', { fatal: true, ignoreBOM: true });
  let start = 0, end = 0, inputBytes = 0, outputBytes = 0, reads = 0, writes = 0;
  let reading = null, writing = null, writeCallbackPending = false;
  let closing = null, held = false, lifecycle = 'OPEN', ended = false;
  let inputClosed = false, outputClosed = false, inputStop = false, outputStop = false;
  let historicalClose = 'NOT_REQUESTED';
  function hold() { held = true; lifecycle = 'HELD'; }
  function checkClose() {
    if (closing === null || closing.settled || !inputStop || !outputStop || !inputClosed || !outputClosed
        || writeCallbackPending) return;
    closing.settled = true;
    if (held || !input.destroyed || !output.destroyed || !input.closed || !output.closed) {
      hold(); historicalClose = 'REJECTED'; closing.reject(error('close_unknown'));
    } else { lifecycle = 'CLOSED'; historicalClose = 'FULFILLED_UNDEFINED'; closing.resolve(undefined); }
  }
  function abandon(kind) {
    hold();
    if (reading !== null) { const p = reading; reading = null; p.reject(error(kind)); }
    if (writing !== null) { const p = writing.out; writing = null; p.reject(error(kind)); }
    close();
  }
  function deliver() {
    if (reading === null || closing !== null) return;
    const at = bytes.indexOf(10, start);
    // Only initialized bytes up to end belong to this channel.
    if (at >= start && at < end) {
      const size = at - start;
      if (size > limits.maxLineBytes) { abandon('input_limit'); return; }
      let line;
      try { line = decoder.decode(bytes.subarray(start, at)); } catch { abandon('utf8_rejected'); return; }
      start = at + 1;
      const out = reading; reading = null; APPLY(PAUSE, input, []); out.resolve(line);
    } else if (end - start > limits.maxLineBytes) abandon('input_limit');
    else if (ended) {
      if (end !== start) { abandon('truncated_line'); return; }
      const out = reading; reading = null; out.resolve(null);
    }
  }
  function incoming(chunk) {
    if (closing !== null) return;
    if (!Buffer.isBuffer(chunk) || PROXY(chunk) || inputBytes + chunk.length > limits.maxInputBytes) {
      abandon('input_limit'); return;
    }
    inputBytes += chunk.length;
    if (end + chunk.length > bytes.length && start > 0) {
      bytes.copy(bytes, 0, start, end); end -= start; start = 0;
    }
    if (end + chunk.length > bytes.length) { abandon('input_limit'); return; }
    chunk.copy(bytes, end); end += chunk.length; deliver();
  }
  function writeDone() {
    const current = writing;
    if (!current || !current.returnKnown || !current.callbackDone || current.needsDrain && !current.drained) return;
    writing = null;
    if (closing !== null) current.out.reject(error('closed'));
    else current.out.resolve(undefined);
  }
  const close = F(function close() {
    if (arguments.length !== 0) return rejected('input_rejected');
    if (closing !== null) return closing.promise;
    closing = pending(); lifecycle = held ? 'HELD' : 'CLOSING';
    if (reading !== null) { const out = reading; reading = null; out.resolve(null); }
    if (writing !== null) { const out = writing.out; writing = null; out.reject(error('closed')); }
    // Reserve and attempt each leg independently before inspecting completion.
    inputStop = true;
    try { APPLY(PAUSE, input, []); APPLY(R_DESTROY, input, []); } catch { hold(); }
    outputStop = true;
    try { APPLY(W_DESTROY, output, []); } catch { hold(); }
    checkClose();
    return closing.promise;
  });
  RESERVED.add(input); RESERVED.add(output);
  try {
    // Error handlers precede pause/data callbacks. Existing newListener hooks
    // are refused by inert validation, before either stream is acquired.
    APPLY(ON, input, ['error', () => abandon('input_unknown')]);
    APPLY(W_ON, output, ['error', () => abandon('output_unknown')]);
    APPLY(ON, input, ['close', () => {
      inputClosed = true;
      if (closing === null && !ended) abandon('input_unknown');
      checkClose();
    }]);
    APPLY(W_ON, output, ['close', () => {
      outputClosed = true;
      if (closing === null) abandon('output_unknown');
      checkClose();
    }]);
    APPLY(ON, input, ['end', () => { ended = true; deliver(); }]);
    APPLY(W_ON, output, ['drain', () => { if (writing !== null) writing.drained = true; writeDone(); }]);
    APPLY(PAUSE, input, []);
    APPLY(ON, input, ['data', incoming]);
  } catch {
    hold();
    FAILED_CONSTRUCTIONS.add(F({ input, output, close }));
    close();
    fail('acquisition_unknown');
  }
  return F({
    readCommand: F(function readCommand() {
      if (arguments.length !== 0 || reading !== null || closing !== null || held) return rejected('read_unavailable');
      const out = pending(); reading = out; reads++; deliver();
      if (reading !== null) {
        try { APPLY(RESUME, input, []); } catch { abandon('input_unknown'); }
      }
      return out.promise;
    }),
    writeResult: F(function writeResult(line) {
      if (arguments.length !== 1 || writing !== null || closing !== null || held) return rejected('write_unavailable');
      if (typeof line !== 'string' || line.indexOf('\n') !== line.length - 1 || !line.endsWith('\n')
          || Buffer.from(line, 'utf8').toString('utf8') !== line) return rejected('output_rejected');
      const chunk = Buffer.from(line, 'utf8');
      if (chunk.length - 1 > limits.maxLineBytes || outputBytes + chunk.length > limits.maxOutputBytes) {
        abandon('output_limit'); return rejected('output_limit');
      }
      const out = pending(), current = { out, returnKnown: false, callbackDone: false, needsDrain: false, drained: false };
      writing = current; writeCallbackPending = true; writes++; outputBytes += chunk.length;
      try {
        const accepted = APPLY(WRITE, output, [chunk, failure => {
          writeCallbackPending = false;
          // Own close can revoke the public write before the actual callback.
          // Retain and join that original callback instead of treating stream
          // close events alone as completion of the whole write.
          if (writing !== current) { checkClose(); return; }
          if (failure) { abandon('output_unknown'); return; }
          current.callbackDone = true; writeDone();
          checkClose();
        }]);
        if (typeof accepted !== 'boolean') { abandon('output_unknown'); return out.promise; }
        current.needsDrain = !accepted; current.returnKnown = true; writeDone();
      } catch { abandon('output_unknown'); }
      return out.promise;
    }),
    close,
    inspect: F(function inspect() {
      if (arguments.length !== 0) fail('input_rejected');
      if (lifecycle === 'CLOSED' && (!input.destroyed || !output.destroyed || !input.closed || !output.closed)) hold();
      return F({ buyerCommandLineChannelVersion: 1, lifecycle, held, closeRequested: closing !== null,
        reading: reading !== null, writing: writing !== null, writeCallbackPending,
        inputBytes, outputBytes, reads, writes,
        inputStopRequested: inputStop, outputStopRequested: outputStop, inputClosed, outputClosed,
        historicalClose, exclusiveStreamsOwned: true, remoteReceipt: 'NOT_ESTABLISHED', authority: 'NONE' });
    }),
  });
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || PROXY(value) || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== names.length) fail('configuration_rejected');
  const out = {};
  for (const key of names) {
    const d = DESC(value, key);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail('configuration_rejected');
    Object.defineProperty(out, key, { value: d.value, enumerable: true });
  }
  return out;
}
function pending() {
  let resolve, reject; const promise = new NativePromise((yes, no) => { resolve = yes; reject = no; });
  Object.defineProperty(promise, 'constructor', { value: NativePromise });
  APPLY(THEN, promise, [() => {}, () => {}]);
  return { promise, resolve, reject, settled: false };
}
function rejected(kind) { const out = pending(); out.reject(error(kind)); return out.promise; }
function error(kind) {
  const code = 'buyer_command_line_channel_' + kind, value = new TypeError(code);
  Object.defineProperty(value, 'code', { value: code, enumerable: true });
  Object.defineProperty(value, 'stack', { value: 'TypeError: ' + code });
  return F(value);
}
function fail(kind) { throw error(kind); }
