/* Genuine recorder-v1 wire DATA. No native application, timer or store. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createServiceCreditCapacityRecorder as CREATE } from '../src/service-credit-capacity-recorder.js';

assert.equal(process.env.X402_CURRENT_RECORDER_WIRE_SELECTION, 'current-recorder-wire-data-v1');
let used = 0;
const chunks = [];
for await (const chunk of process.stdin) {
  used += chunk.length; assert.ok(used <= 65536); chunks.push(chunk);
}
const raw = Buffer.concat(chunks, used), selected = JSON.parse(raw.toString('ascii'));
assert.equal(selected.kind, 'CURRENT_REAL_RECORDER_V1_WIRE_DATA');
assert.ok(Array.isArray(selected.cases) && selected.cases.length <= 16);
const result = [];
let observations = 0;
for (const item of selected.cases) {
  const recorder = CREATE(item.limits), handles = new Map();
  assert.ok(Array.isArray(item.events) && item.events.length <= 128);
  for (const event of item.events) {
    if (event.op === 'BEGIN') {
      assert.equal(handles.has(event.id), false);
      handles.set(event.id, recorder.begin(event.phase, BigInt(event.at))); observations++;
    } else if (event.op === 'FINISH') {
      const handle = handles.get(event.id); assert.ok(handle);
      handle.finish('SUCCEEDED', BigInt(event.at)); handles.delete(event.id);
    } else {
      assert.equal(event.op, 'BALANCE');
      const value = { availableUnits: 2n, heldUnits: 0n, consumedUnits: 0n };
      assert.equal(recorder.recordLedgerBalanceCheck({ observed: value, expected: value }), true);
    }
  }
  if (item.serial !== null) {
    const serial = item.serial;
    assert.ok(Number.isSafeInteger(serial.count) && serial.count >= 0 && serial.count <= 4096);
    let at = BigInt(serial.startNs);
    for (let i = 0; i < serial.count; i++) {
      const handle = recorder.begin(serial.phase, at); observations++;
      handle.finish('SUCCEEDED', at + BigInt(serial.durationNs)); at += BigInt(serial.stepNs);
    }
  }
  assert.equal(handles.size, 0);
  const record = recorder.finalize();
  assert.strictEqual(recorder.finalize(), record);
  assert.equal(record.recordingIssue, null); assert.equal(record.pendingObservations, 0);
  assert.equal(record.authority, 'NONE');
  assert.equal(recorder.inspect().retainedDurationReferences, 0);
  result.push({ name: item.name, limits: item.limits, record });
}
process.stdout.write(JSON.stringify({
  event: 'CURRENT_REAL_RECORDER_V1_WIRE_DATA_NOT_NATIVE',
  node: process.version, cases: result, observations, inputBytes: raw.length,
  inputSha256: createHash('sha256').update(raw).digest('hex'), sourceSha256: selected.sourceSha256,
  SDK: false, SQLite: false, clocksRead: false, timers: false, sockets: false,
  signatures: false, nonce: false, nativeApplications: 0, storageRootAccessed: false,
  sourceOrPackageCopies: 0, authority: 'NONE',
}) + '\n');
