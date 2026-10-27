import { types as utilTypes } from 'node:util';

const F = Object.freeze, APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor, OWN = Object.hasOwn;
const PROXY = utilTypes.isProxy, HELD = new Set(), NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;

/** Own one already-open backend store through its fixed native close capability,
 * and transfer one fenced reader. Neither capability can come from pipe DATA.
 * Reader close returns CLOSED DATA; actual store close must return undefined.
 * No store is opened, queried or physically qualified by this constructor. */
export function createBuyerOwnedBackendRecoveryResource(configuration) {
  if (arguments.length !== 1 || HELD.size >= 16) fail();
  const c = fields(configuration, ['reader', 'closeStore']);
  const READ = method(c.reader, 'readExactOriginal'), CLOSE_READER = method(c.reader, 'close');
  if (typeof c.closeStore !== 'function' || PROXY(c.closeStore) || !Object.isFrozen(c.closeStore)) fail();
  const frame = { reader: c.reader, closeStore: c.closeStore, active: false, held: false,
    readerStopRequested: false, readerStop: null, readerClosed: false,
    storeStopRequested: false, storeStop: null, storeClosed: false };
  function hold() { frame.held = true; HELD.add(frame); }
  const reader = F({
    readExactOriginal: F(function readExactOriginal(envelope, expected) {
      if (arguments.length !== 2 || frame.active || frame.held || frame.readerStopRequested
          || frame.storeStopRequested) fail();
      frame.active = true;
      let result = null;
      try {
        result = APPLY(READ, frame.reader, [envelope, expected]);
        const status = data(result, 'status');
        if (typeof status !== 'string' || !/^[A-Z_]{1,64}$/.test(status)) fail();
        if (frame.held || frame.readerStopRequested || frame.storeStopRequested) fail();
        return result;
      } catch { consume(result); hold(); fail(); }
      finally { frame.active = false; }
    }),
    close: F(function closeReader() {
      if (arguments.length !== 0 || frame.active) { hold(); fail(); }
      if (frame.readerStopRequested) {
        if (frame.readerClosed) return frame.readerStop;
        fail();
      }
      frame.readerStopRequested = true;
      try {
        frame.readerStop = APPLY(CLOSE_READER, frame.reader, []);
        if (data(frame.readerStop, 'status') !== 'CLOSED'
            || data(frame.readerStop, 'executionAuthorized') !== false
            || data(frame.readerStop, 'paymentAuthorized') !== false
            || data(frame.readerStop, 'signingAuthorized') !== false
            || data(frame.readerStop, 'deliveryStatus') !== 'NOT_ESTABLISHED') fail();
        frame.readerClosed = true; return frame.readerStop;
      } catch { consume(frame.readerStop); hold(); fail(); }
    }),
  });
  return F({ reader, closeStore: F(function closeOwnedStore() {
    if (arguments.length !== 0 || frame.active || !frame.readerClosed || frame.storeStopRequested) {
      hold(); fail();
    }
    frame.storeStopRequested = true;
    try {
      frame.storeStop = APPLY(frame.closeStore, undefined, []);
      if (frame.storeStop !== undefined) fail();
      frame.storeClosed = true; frame.reader = null; frame.closeStore = null;
      return undefined;
    } catch { consume(frame.storeStop); hold(); fail(); }
  }) });
}
function consume(value) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !utilTypes.isPromise(value)
      || Object.getPrototypeOf(value) !== PROMISE
      || Object.getOwnPropertyNames(value).some(name => name !== 'constructor')) return;
  const d = DESC(value, 'constructor');
  if (d !== undefined && (!OWN(d, 'value') || d.value !== NativePromise)) return;
  try { APPLY(THEN, value, [() => {}, () => {}]); } catch {}
}
function fields(value, names) {
  if (value === null || typeof value !== 'object' || PROXY(value)
      || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== names.length) fail();
  const out = {};
  for (const name of names) {
    const d = DESC(value, name);
    if (!d || !OWN(d, 'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true });
  }
  return out;
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !Object.isFrozen(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = DESC(value, name);
  if (!d || !OWN(d, 'value') || !d.enumerable) fail();
  return d.value;
}
function method(value, name) {
  const fn = data(value, name);
  if (typeof fn !== 'function' || PROXY(fn) || !Object.isFrozen(fn)) fail();
  return fn;
}
function fail() {
  const code = 'buyer_owned_backend_recovery_resource_unknown', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code }); throw F(error);
}
