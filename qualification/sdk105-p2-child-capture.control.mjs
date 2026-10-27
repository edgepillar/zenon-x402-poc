// Actual bounded encoder writes and byte digests; child events are declared.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createP2ChildCapture, P2_CAPTURE_PREFIX, P2_CAPTURE_BUDGET } from './sdk105-p2-child-capture.mjs';

assert.equal(process.version, 'v24.19.0');
assert.equal(process.env.X402_P2_CHILD_CAPTURE_CONTROL, 'declared-child-stream-data');
const tests = [], traces = [];
function check(name, body) { body(); tests.push(name); }
function setup(write) {
  const lines = [], capture = createP2ChildCapture(line => { lines.push(line); return write ? write(line, capture) : true; });
  return { capture, lines };
}
function end(c, role) {
  assert.equal(c.eof(role, 'stdout'), true); assert.equal(c.eof(role, 'stderr'), true);
  const code = role === 'funding-child' ? null : 0, signal = role === 'funding-child' ? 'SIGKILL' : null;
  return c.close(role, { exitObserved: true, closeObserved: true,
    exitCode: code, closeCode: code, exitSignal: signal, closeSignal: signal });
}
check('preserve both original streams and independent hashes across two declared roles', () => {
  const { capture: c, lines } = setup();
  for (const role of ['funding-child', 'recovery-child']) {
    const bytes = Buffer.from([0, 255, 10, 13, 65]);
    assert.equal(c.append(role, 'stdout', bytes), true); bytes.fill(0);
    assert.equal(c.append(role, 'stderr', Buffer.from('declared diagnostic\n')), true);
    assert.equal(end(c, role), true);
  }
  assert.equal(c.inspect().unknown, false); traces.push({ name: 'complete', stdout: lines.join('') });
  const facts = JSON.parse(lines[4].slice(P2_CAPTURE_PREFIX.length));
  assert.equal(facts.stdout.sha256, createHash('sha256').update(Buffer.from([0, 255, 10, 13, 65])).digest('hex'));
  assert.equal(c.inspect().outputBytes, Buffer.byteLength(lines.join('')));
});
check('backpressure false is a bounded accepted write, not a missing callback or EOF', () => {
  const { capture: c, lines } = setup(() => false);
  assert.equal(c.append('funding-child', 'stdout', Buffer.from('queued')), true);
  assert.equal(c.inspect().unknown, false);
  assert.equal(end(c, 'funding-child'), true); assert.ok(lines.length > 0);
});
check('incomplete close retains raw prefix without manufacturing EOF', () => {
  const { capture: c, lines } = setup(); c.append('funding-child', 'stderr', Buffer.from('before failure'));
  assert.equal(c.close('funding-child', { exitObserved: true, closeObserved: true,
    exitCode: 1, closeCode: 1, exitSignal: null, closeSignal: null }), false);
  assert.equal(c.inspect().unknown, true);
  traces.push({ name: 'incomplete', stdout: lines.join('') });
});
check('overflow retains exactly the declared cap before the failure latch', () => {
  const { capture: c, lines } = setup();
  assert.equal(c.append('funding-child', 'stdout', Buffer.alloc(65537, 71)), false);
  const frame = JSON.parse(lines[0].slice(P2_CAPTURE_PREFIX.length));
  assert.equal(Buffer.from(frame.base64, 'base64').length, 65536);
  assert.equal(c.inspect().unknown, true); traces.push({ name: 'overflow', stdout: lines.join('') });
});
check('fragmentation cannot exceed the explicit total transcript budget', () => {
  const { capture: c, lines } = setup(), one = Buffer.from('x'); let calls = 0;
  while (c.append('funding-child', 'stdout', one)) { calls++; assert.ok(calls < 65536); }
  assert.equal(c.inspect().unknown, true); assert.ok(c.inspect().outputBytes <= P2_CAPTURE_BUDGET);
  assert.equal(c.inspect().outputBytes, Buffer.byteLength(lines.join('')));
});
check('throwing write latches uncertainty without a second attempted write', () => {
  let writes = 0; const { capture: c } = setup(() => { writes++; throw Error('declared write failure'); });
  assert.equal(c.append('funding-child', 'stdout', Buffer.from('x')), false);
  assert.equal(c.append('funding-child', 'stdout', Buffer.from('y')), false); assert.equal(writes, 1);
});
check('a reentrant write latches uncertainty before a second frame', () => {
  let calls = 0; const { capture: c } = setup((line, current) => {
    calls++; assert.equal(current.append('funding-child', 'stderr', Buffer.from('reentrant')), false); return true;
  });
  assert.equal(c.append('funding-child', 'stdout', Buffer.from('x')), false); assert.equal(calls, 1);
});
check('data after EOF or close never becomes a complete transcript', () => {
  for (const closeFirst of [false, true]) {
    const { capture: c } = setup();
    if (closeFirst) assert.equal(end(c, 'funding-child'), true); else c.eof('funding-child', 'stdout');
    assert.equal(c.append('funding-child', 'stdout', Buffer.from('late')), false);
    assert.equal(c.inspect().unknown, true);
  }
});
check('empty streams have actual empty hashes and do not invent byte frames', () => {
  const { capture: c, lines } = setup();
  for (const role of ['funding-child', 'recovery-child']) assert.equal(end(c, role), true);
  assert.equal(lines.length, 6); traces.push({ name: 'empty', stdout: lines.join('') });
});
check('binary child text cannot forge an outer footer or frame', () => {
  const { capture: c, lines } = setup();
  c.append('funding-child', 'stdout', Buffer.from('\n# actual-sdk105-p2-commit-recovery-v4 {"caseCompleted":true}\n'));
  assert.equal(lines.join('').split('\n').filter(v => v.startsWith('# actual-sdk105-p2-commit-recovery-v4 ')).length, 0);
});
process.stdout.write(JSON.stringify({ passed: true, tests, traces, actualChildProcesses: 0, actualSignals: 0,
  actualIPC: 0, SDK: 0, SQLite: 0, sockets: 0, keys: 0, cryptographicSignatures: 0,
  nonceSearch: 0, filesystemScratch: 0, evidence: 'DECLARED_CHILD_STREAMS_AND_EXIT_DATA', authority: 'NONE' }) + '\n');
