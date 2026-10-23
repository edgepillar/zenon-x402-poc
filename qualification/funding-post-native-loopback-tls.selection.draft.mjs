// Direct entry only. No --test discovery, child process, package or source copy.
import assert from 'node:assert/strict';
import { resolve, isAbsolute } from 'node:path';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'arm64');
assert.equal(process.env.X402_FUNDING_TLS_SELECTION, 'four-loopback-cases-only');
assert.equal(process.env.X402_FUNDING_TLS_NATIVE_MODE, 'reviewed-loopback-tls');
assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE, '1');
for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE',
  'NODE_TEST_CONTEXT']) assert.equal(process.env[key], undefined);
assert.equal(process.argv.length, 3);
assert.ok(isAbsolute(process.argv[2]));
assert.equal(resolve(process.argv[2]), process.argv[2]);
assert.equal(process.argv[2], process.env.SPV_TASK_SCRATCH);
assert.ok(process.execArgv.includes('--permission'));
assert.ok(!process.execArgv.some(value => /allow-(?:child|worker|addons|fs-write)/.test(value)));
await import('./funding-post-native-loopback-tls.behavior.draft.mjs');
