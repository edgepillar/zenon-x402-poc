import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';

if (process.version !== 'v24.19.0' || process.argv.length !== 2
    || process.env.X402_BUYER_COMMAND_CONTROL !== 'builtin-memory-stream-originals'
    || process.env.X402_SDK105_SERVICE_LIFETIME !== 'builtin-only-original-key-close-handoff')
  throw Error('EXPLICIT_BUYER_COMMAND_COMPONENT_CONTROL_REQUIRED');
const files = [
  '../qualification/sdk105-funding-service-lifecycle.behavior.mjs',
  '../qualification/buyer-original-funding-command.behavior.mjs',
].map(name => fileURLToPath(new URL(name, import.meta.url)));
const stream = run({ files, isolation: 'none', concurrency: false, timeout: 20000 });
let passed = 0, failed = 0, skipped = 0, bytes = 0;
const names = new Set();
stream.on('data', event => {
  if (event.type === 'test:pass' && event.data.nesting === 0) {
    passed++;
    if (event.data.skip || event.data.todo || names.has(event.data.name)) skipped++;
    names.add(event.data.name);
  }
  if (event.type === 'test:fail') failed++;
});
for await (const part of stream.compose(tap)) {
  const text = String(part); bytes += Buffer.byteLength(text);
  if (bytes > 196608) throw Error('BUYER_COMMAND_TAP_CAP');
  process.stdout.write(text);
}
if (passed !== 52 || names.size !== 52 || failed !== 0 || skipped !== 0) process.exitCode = 1;
