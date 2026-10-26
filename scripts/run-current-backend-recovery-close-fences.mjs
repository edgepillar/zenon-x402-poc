import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
if (process.version !== 'v24.19.0' || process.argv.length !== 2
    || process.env.X402_BACKEND_RECOVERY_CLOSE_FENCES !== 'builtin-only-captured-capabilities') {
  throw new Error('EXPLICIT_RECOVERY_CORE_CONTROL_REQUIRED');
}
const file = fileURLToPath(new URL('../qualification/backend-recovery-close-fences.behavior.mjs', import.meta.url));
const stream = run({ files: [file], isolation: 'none', concurrency: false, timeout: 20000 });
let passed = 0, failed = 0, skipped = 0;
stream.on('data', event => {
  if (event.type === 'test:pass' && event.data.nesting === 0) { passed++; if (event.data.skip || event.data.todo) skipped++; }
  if (event.type === 'test:fail') failed++;
});
let output = 0;
for await (const part of stream.compose(tap)) {
  const text = String(part); output += Buffer.byteLength(text);
  if (output > 196608) throw new Error('RECOVERY_CORE_TAP_CAP');
  process.stdout.write(text);
}
if (passed !== 35 || failed !== 0 || skipped !== 0) process.exitCode = 1;
