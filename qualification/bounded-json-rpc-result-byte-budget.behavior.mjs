import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Count calls into the captured native character reader, never rewrite/import
// a source copy. Restore the public descriptor before registering any case.
// The count is parser work, not elapsed time, throughput, heap or disk I/O.
const phase = process.env.X402_JSON_RPC_BYTE_BUDGET_PHASE ?? 'optimized';
assert.ok(phase === 'baseline' || phase === 'optimized');
const descriptor = Object.getOwnPropertyDescriptor(String.prototype, 'charCodeAt');
const native = descriptor.value, callNative = Reflect.apply;
let probe = null, dpFactory, fundingFactory;
try {
  Object.defineProperty(String.prototype, 'charCodeAt', { ...descriptor, value: function(index) {
    if (probe !== null && typeof this === 'string') {
      if (this.length === probe.responseUnits) {
        if (!probe.responseChecked) { assert.equal(this, probe.response); probe.responseChecked = true; }
        probe.responseReads++;
      } else if (this.length === probe.resultUnits) {
        if (!probe.resultChecked) { assert.equal(this, probe.result); probe.resultChecked = true; }
        probe.resultReads++;
      }
    }
    return callNative(native, this, [index]);
  } });
  ({ createDynamicPlasmaJsonRpcReadTransport: dpFactory } =
    await import('../src/zenon/dynamic-plasma-json-rpc-read-transport.js'));
  ({ createZenonFundingJsonRpcReadTransport: fundingFactory } =
    await import('../src/service-credit-zenon-funding-json-rpc-read-transport.js'));
} finally { Object.defineProperty(String.prototype, 'charCodeAt', descriptor); }
assert.deepEqual(Object.getOwnPropertyDescriptor(String.prototype, 'charCodeAt'), descriptor);

const LIMIT = 1048576, RESPONSE_LIMIT = LIMIT + 4096;
const wrap = (raw, id = 1) => '{"jsonrpc":"2.0","id":' + id + ',"result":' + raw + '}';
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const rows = [];
const request = Object.freeze({ method: 'ledger.getFrontierMomentum', params: Object.freeze([]) });
const overhead = Buffer.byteLength(wrap(''));
function asciiArray(bytes) {
  const count = Math.ceil((bytes - 1) / (65536 + 3)), parts = [];
  let left = bytes - 1 - 3 * count;
  for (let i = 0; i < count; i++) {
    const n = Math.min(left, 65536); parts.push('"' + 'x'.repeat(n) + '"'); left -= n;
  }
  assert.equal(left, 0);
  const raw = '[' + parts.join(',') + ']';
  assert.equal(Buffer.byteLength(raw), bytes);
  return raw;
}
function multibyteArray(bytes) {
  const count = Math.ceil((bytes - 1) / (65536 + 3)), parts = [];
  let left = bytes - 1 - 3 * count;
  for (let i = 0; i < count; i++) {
    const n = Math.min(left, 65536);
    parts.push('"' + '\u00e9'.repeat(Math.floor(n / 2)) + (n % 2 ? 'x' : '') + '"'); left -= n;
  }
  assert.equal(left, 0);
  const raw = '[' + parts.join(',') + ']';
  assert.equal(Buffer.byteLength(raw), bytes);
  return raw;
}
async function observe(factory, profile, label, raw, options = {}) {
  const response = options.response ?? wrap(raw), accepted = options.accepted ?? true;
  const expectedScans = options.scans ?? (phase === 'baseline' || Buffer.byteLength(response) > LIMIT ? raw.length : 0);
  const current = { response, result: raw, responseUnits: response.length, resultUnits: raw.length,
    responseReads: 0, resultReads: 0, responseChecked: false, resultChecked: false };
  let calls = 0, output, code = null;
  const transport = factory({ exchange: Object.freeze(function exchange(body) {
    assert.equal(JSON.parse(body).id, 1); calls++;
    // Request validation has completed; its short strings cannot contaminate
    // the two response counters. Compare a large string at most once.
    assert.equal(probe, null); probe = current;
    return Promise.resolve(response);
  }) });
  try {
    if (accepted) { output = await transport.callRead(request); assert.equal(output, raw); }
    else {
      await assert.rejects(transport.callRead(request), error => {
        code = error.code;
        assert.equal(code, profile === 'DP' ? 'dynamic_plasma_json_rpc_read_transport_unavailable'
          : 'zenon_funding_json_rpc_read_transport_unavailable');
        assert.equal(Object.isFrozen(error), true);
        assert.deepEqual(Object.keys(error), ['code']); return true;
      });
    }
  } finally { probe = null; }
  assert.equal(calls, 1);
  assert.equal(current.resultReads, expectedScans);
  assert.ok(current.responseReads > 0);
  rows.push({ profile, label, accepted, code, responseBytes: Buffer.byteLength(response),
    resultBytes: Buffer.byteLength(raw), resultUnits: raw.length, exchangeHandoffs: calls,
    responseCharacterReads: current.responseReads, resultCharacterReads: current.resultReads,
    resultSha256: accepted ? digest(output) : null });
}

for (const [profile, factory] of [['DP', dpFactory], ['FUNDING', fundingFactory]]) {
  const prefix = 'RPC byte budget ' + profile + ' / ';
  test(prefix + 'preserves small raw numeric and whitespace lexemes', async () => {
    await observe(factory, profile, 'small-lossless',
      '{ "height" : 18446744073709551615, "fraction":-0.00e+02,"value":[null,true,false] }');
  });
  test(prefix + 'counts unescaped Unicode without normalizing it', async () => {
    await observe(factory, profile, 'raw-unicode', '["\u00e9","\u03a9","\ud834\udd1e",{"n":1}]');
  });
  test(prefix + 'preserves escaped Unicode and escaped controls byte for byte', async () => {
    await observe(factory, profile, 'escaped-unicode', '["\\u00e9","\\uD834\\uDD1E","\\\\","\\n"]');
  });
  for (const delta of [-1, 0, 1]) {
    test(prefix + 'keeps whole-response threshold ' + (delta < 0 ? 'minus-one' : delta === 0 ? 'exact' : 'plus-one'), async () => {
      const raw = asciiArray(LIMIT + delta - overhead);
      await observe(factory, profile, 'whole-threshold-' + delta, raw);
    });
  }
  test(prefix + 'retains exact independent result budget for a larger envelope', async () => {
    await observe(factory, profile, 'result-exact', asciiArray(LIMIT));
  });
  test(prefix + 'rejects raw ASCII result cap plus one', async () => {
    const raw = asciiArray(LIMIT + 1);
    await observe(factory, profile, 'result-ascii-plus-one', raw, { accepted: false, scans: raw.length });
  });
  test(prefix + 'rejects raw multibyte result cap plus one with fewer code units', async () => {
    const raw = multibyteArray(LIMIT + 1);
    assert.ok(raw.length < LIMIT);
    await observe(factory, profile, 'result-multibyte-plus-one', raw, { accepted: false, scans: raw.length });
  });
  test(prefix + 'keeps complete-envelope cap and cap plus one separate', async () => {
    const raw = '{}', exact = wrap(raw) + ' '.repeat(RESPONSE_LIMIT - Buffer.byteLength(wrap(raw)));
    await observe(factory, profile, 'envelope-exact', raw, { response: exact, scans: raw.length });
    await observe(factory, profile, 'envelope-plus-one', raw, { response: exact + ' ', accepted: false, scans: 0 });
  });
  test(prefix + 'still rejects malformed Unicode duplicate keys and incomplete syntax', async () => {
    for (const [label, raw] of [
      ['lone-raw-surrogate', '["\ud800"]'], ['lone-escaped-surrogate', '["\\uD800"]'],
      ['duplicate-escaped-key', '{"\\u0078":1,"x":2}'], ['dangerous-escaped-key', '{"\\u005f_proto__":1}'],
      ['bad-number', '[01]'], ['truncated', '{"x":'],
    ]) await observe(factory, profile, label, raw, { accepted: false, scans: 0 });
  });
  test(prefix + 'failure retains increasing IDs without retry and permits a new read', async () => {
    const bodies = [];
    const transport = factory({ exchange: Object.freeze(function exchange(body) {
      const id = JSON.parse(body).id; bodies.push(id);
      return Promise.resolve(id === 1 ? wrap('[01]', id) : wrap('{"ok":true}', id));
    }) });
    await assert.rejects(transport.callRead(request), { code: profile === 'DP'
      ? 'dynamic_plasma_json_rpc_read_transport_unavailable' : 'zenon_funding_json_rpc_read_transport_unavailable' });
    assert.equal(await transport.callRead(request), '{"ok":true}');
    assert.deepEqual(bodies, [1, 2]);
  });
}
after(() => {
  assert.equal(probe, null);
  assert.equal(rows.length, 34);
  process.stdout.write('# JSON_RPC_BYTE_BUDGET ' + JSON.stringify({
    phase, measurement: 'CAPTURED_NATIVE_CHARACTER_READER_CALLS_NOT_TIME_OR_HEAP',
    observationRows: rows.length, rows,
  }) + '\n');
});
