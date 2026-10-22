/*
 * Qualification-only synchronous import tripwire; no source replacement,
 * fake module, worker, SDK preload or production hook. Use --import before
 * the selected entry. Native module.registerHooks on the exact recorded
 * Node runtime is a premise, not an OS network/filesystem/hostile-code sandbox.
 * https://github.com/nodejs/node/blob/v24.19.0/doc/api/module.md
 */
import { registerHooks, isBuiltin } from 'node:module';

const repository = new URL('../', import.meta.url).href;
const allowedBuiltins = new Set(['node:module', 'node:crypto', 'node:util', 'node:buffer',
  'node:fs', 'node:fs/promises', 'node:path', 'node:sqlite', 'node:perf_hooks', 'node:async_hooks',
  'node:test', 'node:assert/strict', 'node:events', 'node:url', 'node:process', 'node:os']);
const files = new Set([import.meta.url]);
let sdkImportAttempts = 0, controlRefusals = 0, otherRefusals = 0;
function reject(kind) {
  if (kind === 'sdk') sdkImportAttempts++;
  else if (kind === 'control') controlRefusals++;
  else otherRefusals++;
  const error = new TypeError('FIXED_POLICY_SQLITE_IMPORT_REFUSED');
  error.code = 'FIXED_POLICY_SQLITE_IMPORT_REFUSED';
  error.stack = 'TypeError: FIXED_POLICY_SQLITE_IMPORT_REFUSED';
  throw Object.freeze(error);
}
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'qualification-forbidden-package-control') reject('control');
  if (specifier === 'znn-typescript-sdk' || specifier.startsWith('@noble/')) reject('sdk');
  if (isBuiltin(specifier)) {
    const name = specifier.startsWith('node:') ? specifier : 'node:' + specifier;
    if (!allowedBuiltins.has(name)) reject('other');
    return nextResolve(specifier, context);
  }
  if (!(specifier.startsWith('.') || specifier.startsWith('file:') || specifier.startsWith('/')))
    reject('other');
  const resolved = nextResolve(specifier, context);
  if (typeof resolved.url !== 'string' || !resolved.url.startsWith(repository)
      || resolved.url.includes('/node_modules/') || !/\.(?:js|mjs)$/.test(resolved.url))
    reject(resolved.url?.includes('/node_modules/') ? 'sdk' : 'other');
  files.add(resolved.url);
  return resolved;
} });
export function snapshotQualificationImportGuard() {
  return Object.freeze({ sdkImportAttempts, controlRefusals, otherRefusals,
    sourceModules: Object.freeze([...files].map(url => url.slice(repository.length)).sort()) });
}
