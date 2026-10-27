import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
const selection = process.env.X402_FUNDING_OWNED_STREAM_CONTROL;
if (process.version !== 'v24.19.0' || process.argv.length !== 2
    || !['builtin-exclusive-before-native', 'builtin-opening-budget'].includes(selection))
  throw Error('EXPLICIT_FUNDING_OWNED_STREAM_CONTROL_REQUIRED');
const budget = selection === 'builtin-opening-budget';
const files = [fileURLToPath(budget
  ? new URL('../qualification/buyer-funding-owned-stream-deadline.behavior.mjs', import.meta.url)
  : new URL('../qualification/buyer-funding-owned-stream-session.behavior.mjs', import.meta.url))];
const expected = budget ? 14 : 17;
const stream = run({ files, isolation: 'none', concurrency: false, timeout: 6000 });
let passed = 0, failed = 0, skipped = 0, bytes = 0;
const names = new Set();
stream.on('data', event => {
  if (event.type === 'test:pass' && event.data.nesting === 0) {
    passed++; if (event.data.skip || event.data.todo || names.has(event.data.name)) skipped++;
    names.add(event.data.name);
  }
  if (event.type === 'test:fail') failed++;
});
for await (const part of stream.compose(tap)) {
  const text = String(part); bytes += Buffer.byteLength(text);
  if (bytes > 65536) throw Error('FUNDING_OWNED_STREAM_TAP_CAP');
  process.stdout.write(text);
}
if (passed !== expected || names.size !== expected || failed !== 0 || skipped !== 0) process.exitCode = 1;
