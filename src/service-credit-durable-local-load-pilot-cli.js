import { writeSync as fsWriteSync } from 'node:fs';
import { types as utilTypes } from 'node:util';

import {
  runDurableServiceCreditLocalLoadPilot,
} from './service-credit-durable-local-load-pilot.js';

const SUCCESS = 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_SUCCESS\n';
const FAILURE = 'SERVICE_CREDIT_DURABLE_LOCAL_LOAD_PILOT_FAILED\n';
const BUFFER_FROM = Buffer.from;
const IS_PROMISE = utilTypes.isPromise;
const IS_PROXY = utilTypes.isProxy;
const NATIVE_PROMISE = Promise;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS = Object.is;
const OBJECT_FREEZE = Object.freeze;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const REFLECT_GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const RUN_PILOT = runDurableServiceCreditLocalLoadPilot;
const WRITE_SYNC = fsWriteSync;
const PINNED_PROMISE_CONSTRUCTOR_DESCRIPTOR = OBJECT_FREEZE({
  configurable: false,
  enumerable: false,
  writable: false,
  value: NATIVE_PROMISE,
});

function writeFixedDescriptor(descriptor, line) {
  const bytes = REFLECT_APPLY(BUFFER_FROM, Buffer, [line, 'utf8']);
  const written = REFLECT_APPLY(WRITE_SYNC, undefined, [
    descriptor,
    bytes,
    0,
    bytes.length,
  ]);
  if (written !== bytes.length) throw new Error('fixed output write failed');
}

function main() {
  if (process.argv.length !== 2) throw new Error('invalid invocation');
  return REFLECT_APPLY(RUN_PILOT, undefined, []);
}

function pinPilotPromise(value) {
  try {
    if (
      REFLECT_APPLY(IS_PROXY, undefined, [value])
      || !REFLECT_APPLY(IS_PROMISE, undefined, [value])
      || REFLECT_APPLY(REFLECT_GET_PROTOTYPE_OF, Reflect, [value])
        !== PROMISE_PROTOTYPE
      || REFLECT_APPLY(OBJECT_HAS_OWN, Object, [value, 'constructor'])
      || REFLECT_APPLY(OBJECT_HAS_OWN, Object, [value, 'then'])
    ) return false;
    REFLECT_APPLY(OBJECT_DEFINE_PROPERTY, undefined, [
      value,
      'constructor',
      PINNED_PROMISE_CONSTRUCTOR_DESCRIPTOR,
    ]);
    const descriptor = REFLECT_APPLY(
      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,
      Reflect,
      [value, 'constructor'],
    );
    return (
      descriptor !== undefined
      && REFLECT_APPLY(REFLECT_OWN_KEYS, Reflect, [descriptor]).length === 4
      && REFLECT_APPLY(OBJECT_HAS_OWN, Object, [descriptor, 'value'])
      && REFLECT_APPLY(OBJECT_HAS_OWN, Object, [descriptor, 'writable'])
      && REFLECT_APPLY(OBJECT_HAS_OWN, Object, [descriptor, 'enumerable'])
      && REFLECT_APPLY(OBJECT_HAS_OWN, Object, [descriptor, 'configurable'])
      && REFLECT_APPLY(OBJECT_IS, Object, [descriptor.value, NATIVE_PROMISE])
      && REFLECT_APPLY(OBJECT_IS, Object, [descriptor.writable, false])
      && REFLECT_APPLY(OBJECT_IS, Object, [descriptor.enumerable, false])
      && REFLECT_APPLY(OBJECT_IS, Object, [descriptor.configurable, false])
    );
  } catch {
    return false;
  }
}

async function report() {
  try {
    const completion = main();
    if (!pinPilotPromise(completion)) throw FAILURE;
    await completion;
    writeFixedDescriptor(1, SUCCESS);
  } catch {
    process.exitCode = 1;
    try {
      writeFixedDescriptor(2, FAILURE);
    } catch {
      // Nonzero termination remains the only signal if stderr is unavailable.
    }
  }
}

report();
