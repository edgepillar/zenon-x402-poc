import fs from 'node:fs';
import { registerHooks, syncBuiltinESMExports } from 'node:module';

const FIXTURE_URL = new URL('./local-devnet-readiness-sdk-fixture.js', import.meta.url).href;
const originalArgv = process.argv;
const hasArgument = value => Array.prototype.includes.call(originalArgv, value);

if (hasArgument('broken-writer.json') || hasArgument('short-writer.json')) {
  const originalWriteSync = fs.writeSync;
  const short = hasArgument('short-writer.json');
  let calls = 0;
  fs.writeSync = function fixtureWriteSync(...args) {
    calls += 1;
    if (calls === 1) {
      if (short) return Math.max(0, Buffer.byteLength(args[1]) - 1);
      throw new Error('fixture_write_failed');
    }
    return Reflect.apply(originalWriteSync, fs, args);
  };
  syncBuiltinESMExports();
}

if (hasArgument('proxy-argv.json')) {
  let traps = 0;
  process.argv = new Proxy(originalArgv, {
    get(target, key, receiver) {
      traps += 1;
      return Reflect.get(target, key, receiver);
    },
    getOwnPropertyDescriptor(target, key) {
      traps += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    getPrototypeOf(target) {
      traps += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      traps += 1;
      return Reflect.ownKeys(target);
    },
  });
  process.once('exit', () => {
    if (traps !== 0) process.exitCode = 91;
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'znn-typescript-sdk') {
      return { shortCircuit: true, url: FIXTURE_URL };
    }
    return nextResolve(specifier, context);
  },
});
