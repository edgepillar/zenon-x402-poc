// Extract only the nested stream definition. No native pair/process/pipe import.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer as NativeBuffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
if (process.version !== 'v24.19.0'
    || process.env.X402_PREFIX_STREAM_DATA_SELECTION !== 'exact-v4-prefix-stream-data-v1')
  throw new TypeError('EXACT_PREFIX_STREAM_DATA_SELECTION_REQUIRED');
function extract(name) {
  const s = readFileSync(new URL(name, import.meta.url), 'utf8');
  const begin = s.indexOf('    function stream(cap){'), end = s.indexOf('\n    return F({command,exit:', begin);
  assert.ok(begin >= 0 && end > begin); return s.slice(begin, end);
}
const current = extract('./capacity-native-current-offered-pair-v4.supervisor.draft.mjs');
const baseline = extract('./capacity-native-current-offered-pair-v3.supervisor.draft.mjs');
const names = [], metrics = {};
let entered = 0, completed = 0;
function check(name, body) {
  names.push(name);
  test(name, { concurrency: false, timeout: 10000 }, () => { entered++; body(); completed++; });
}
const plain = v => JSON.parse(JSON.stringify(v));
const digest = b => createHash('sha256').update(b).digest('hex');
const generated = (n, start = 0) => NativeBuffer.from(Array.from({ length: n }, (_, i) => (i * 71 + start) & 255));
function harness(source, cap, onBad = () => undefined) {
  const observed = { constructionsDuringAdd: 0, bad: 0 };
  let adding = false, stream;
  const capabilities = {};
  for (const method of ['from', 'alloc', 'concat']) capabilities[method] = (...args) => {
    if (adding) observed.constructionsDuringAdd++;
    return Reflect.apply(NativeBuffer[method], NativeBuffer, args);
  };
  const context = createContext({ F: Object.freeze, Buffer: Object.freeze(capabilities), createHash,
    bad() { observed.bad++; return onBad(stream); }, cap }, { codeGeneration: { strings: false, wasm: false } });
  stream = new Script(source + '\nstream(cap);', { filename: 'exact-pair-prefix-stream-definition' })
    .runInContext(context, { timeout: 1000 });
  return { stream, observed, add(bytes) { adding = true; try { stream.add(bytes); } finally { adding = false; } } };
}
function equalBytes(actual, expected) {
  assert.equal(NativeBuffer.isBuffer(actual), true); assert.equal(actual.equals(expected), true);
}
function run(source, cap, chunks) {
  const h = harness(source, cap), seen = [];
  let total = 0;
  for (const chunk of chunks) {
    seen.push(NativeBuffer.from(chunk)); total += chunk.length; h.add(chunk);
    const prefix = NativeBuffer.concat(seen).subarray(0, cap);
    assert.deepEqual(plain(h.stream.facts()), { observedBytes: total, retainedBytes: prefix.length,
      overflow: total > cap, eof: false, prefixSha256: digest(prefix) });
    equalBytes(h.stream.privateBytes(), prefix); assert.equal(h.observed.bad, total > cap ? 1 : 0);
  }
  h.stream.eof = true;
  const prefix = NativeBuffer.concat(seen).subarray(0, cap);
  assert.deepEqual(plain(h.stream.facts()), { observedBytes: total, retainedBytes: prefix.length,
    overflow: total > cap, eof: true, prefixSha256: digest(prefix) });
  equalBytes(h.stream.privateBytes(), prefix);
  return { facts: plain(h.stream.facts()), bytes: prefix.toString('hex'), bad: h.observed.bad };
}
check('one-byte chunks construct at most one capture buffer before snapshots', () => {
  const h = harness(current, 8192);
  for (let i = 0; i < 8192; i++) h.add(generated(1, i));
  assert.equal(h.observed.constructionsDuringAdd, 1); assert.equal(h.observed.bad, 0);
  assert.equal(h.stream.facts().retainedBytes, 8192);
});
check('empty chunks construct no capture buffers', () => {
  const h = harness(current, 8192), empty = NativeBuffer.alloc(0);
  for (let i = 0; i < 10000; i++) h.add(empty);
  assert.equal(h.observed.constructionsDuringAdd, 0); assert.equal(h.stream.facts().retainedBytes, 0);
  assert.equal(h.stream.facts().prefixSha256, digest(empty));
});
for (const cap of [1024, 8192]) {
  const cases = { empty: [], one: [generated(1)], mixed: [generated(3), generated(11, 3), generated(7, 14)],
    exact: [generated(cap)], oversize: [generated(cap + 7)],
    crossing: [generated(cap - 1), generated(4, cap - 1)],
    after_overflow: [generated(cap + 1), generated(9), generated(0), generated(2)],
    empty_boundaries: [generated(0), generated(0), generated(cap), generated(0)] };
  for (const [label, chunks] of Object.entries(cases))
    check('exact prefix facts and bytes match baseline / ' + cap + ' / ' + label,
      () => assert.deepEqual(run(current, cap, chunks), run(baseline, cap, chunks)));
  check('private snapshots are independent and prefix-only / ' + cap, () => {
    const h = harness(current, cap), bytes = generated(cap); h.add(bytes);
    const first = h.stream.privateBytes(), second = h.stream.privateBytes();
    assert.notStrictEqual(first, second); first.fill(0); second.fill(255);
    equalBytes(h.stream.privateBytes(), bytes); assert.equal(h.stream.facts().prefixSha256, digest(bytes));
    h.add(generated(3)); equalBytes(h.stream.privateBytes(), bytes);
  });
}
for (const type of ['Buffer', 'Uint8Array'])
  check('caller ' + type + ' mutation after add never changes captured bytes', () => {
    const original = generated(99), bytes = type === 'Buffer' ? NativeBuffer.from(original) : new Uint8Array(original);
    const h = harness(current, 1024); h.add(bytes); bytes.fill(0);
    equalBytes(h.stream.privateBytes(), original); assert.equal(h.stream.facts().prefixSha256, digest(original));
  });
check('overflow is latched before a reentrant stop callback', () => {
  for (const source of [baseline, current]) {
    const h = harness(source, 1024, s => s.add(generated(7))); h.add(generated(1025));
    assert.equal(h.observed.bad, 1); assert.equal(h.stream.facts().observedBytes, 1032);
    assert.equal(h.stream.facts().overflow, true); equalBytes(h.stream.privateBytes(), generated(1024));
  }
});
check('throwing stop callback preserves overflow and does not retry', () => {
  for (const source of [baseline, current]) {
    const reason = new Error('declared stop failure'), h = harness(source, 1024, () => { throw reason; });
    assert.throws(() => h.add(generated(1025)), e => e === reason); h.add(generated(3));
    assert.equal(h.observed.bad, 1); assert.equal(h.stream.facts().observedBytes, 1028);
    assert.equal(h.stream.facts().overflow, true); equalBytes(h.stream.privateBytes(), generated(1024));
  }
});
check('digest snapshots do not consume the running hash', () => {
  const h = harness(current, 1024);
  for (let i = 0; i < 20; i++) assert.equal(h.stream.facts().prefixSha256, digest(NativeBuffer.alloc(0)));
  h.add(generated(13)); const first = h.stream.facts(); assert.equal(Object.isFrozen(first), true);
  h.add(generated(17, 13 * 71)); assert.equal(first.retainedBytes, 13);
  assert.equal(h.stream.facts().prefixSha256, digest(generated(30)));
});
check('only a declared EOF changes the EOF receipt field', () => {
  const h = harness(current, 1024); h.add(generated(1025));
  assert.equal(h.stream.facts().eof, false); h.stream.eof = true; h.add(generated(5));
  assert.equal(h.stream.facts().eof, true); assert.equal(h.stream.facts().overflow, true);
});
check('full fragmented 16-lane capture uses 64 capture buffers for identical prefixes', () => {
  function count(source) {
    let constructions = 0, retainedBytes = 0;
    for (let lane = 0; lane < 16; lane++) for (let role = 0; role < 2; role++) for (const cap of [1024, 8192]) {
      const h = harness(source, cap), expected = generated(cap);
      for (let i = 0; i < cap; i++) h.add(expected.subarray(i, i + 1));
      constructions += h.observed.constructionsDuringAdd; retainedBytes += h.stream.facts().retainedBytes;
      equalBytes(h.stream.privateBytes(), expected); assert.equal(h.stream.facts().prefixSha256, digest(expected));
    }
    return { constructions, retainedBytes };
  }
  const before = count(baseline), after = count(current);
  assert.equal(before.constructions, 294912); assert.equal(after.constructions, 64);
  assert.equal(before.retainedBytes, 294912); assert.equal(after.retainedBytes, 294912);
  metrics.fullFragmentedCapture = { lanes: 16, childRolesPerLane: 2, streams: 64,
    stdoutCap: 1024, stderrCap: 8192, captureBufferConstructionsBefore: before.constructions,
    captureBufferConstructionsAfter: after.constructions, retainedPrefixBytesBefore: before.retainedBytes,
    retainedPrefixBytesAfter: after.retainedBytes, actualHeapBytesMeasured: false, independentSnapshotCopies: true };
});
after(() => console.log(JSON.stringify({ event: 'EXACT_V4_PAIR_PREFIX_STREAM_DECLARED_CHUNKS',
  selected: names.length, entered, completed, names, ...metrics, exactStreamDefinitionExtracted: true,
  BufferCapabilitiesInstrumentedForConstructionCounts: true, byteChunksAndEOFDeclared: true, SHA256Executed: true,
  nativePairImported: false, nativePipeOrChildExecuted: false, SDKImported: false, SQLite: false,
  keysOrSignatures: false, nonce: false, sockets: false, storageRootRead: false, managedTasksCreated: 0,
  physicalDrainQualified: false, productionQualified: false, authority: 'NONE' })));

