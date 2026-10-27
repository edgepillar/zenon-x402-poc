import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
if (process.version !== 'v24.19.0' || process.argv.length !== 2
    || process.env.X402_SDK105_LOCAL_FUNDING_SELECTION !== 'builtin-shared-ca-selection')
  throw Error('EXPLICIT_SDK105_LOCAL_SELECTION_CONTROL_REQUIRED');
const file = fileURLToPath(new URL('../qualification/sdk105-local-funding-service-selection.behavior.mjs', import.meta.url));
const stream = run({ files: [file], isolation: 'none', concurrency: false, timeout: 10000 });
let passed = 0, failed = 0, skipped = 0, bytes = 0;
stream.on('data', event => {
  if (event.type === 'test:pass' && event.data.nesting === 0) {
    passed++; if (event.data.skip || event.data.todo) skipped++;
  }
  if (event.type === 'test:fail') failed++;
});
for await (const part of stream.compose(tap)) {
  const text = String(part); bytes += Buffer.byteLength(text);
  if (bytes > 98304) throw Error('SDK105_LOCAL_SELECTION_TAP_CAP');
  process.stdout.write(text);
}
if (passed !== 22 || failed !== 0 || skipped !== 0) process.exitCode = 1;
