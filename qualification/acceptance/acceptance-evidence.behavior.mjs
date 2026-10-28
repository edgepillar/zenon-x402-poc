import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { evaluateAcceptanceEvidence as evaluate } from '../../scripts/report-acceptance-evidence.mjs';
const checks = [];
function check(id, run) { checks.push({ id, run }); }
function fixture(status = 'PASS', classification = 'COMPONENT_DATA_PASS') {
  const raw = Buffer.from(JSON.stringify({ status }));
  const manifest = { version: 1, profile: 'API_CREDIT_V1_G0_INVENTORY', sourceBaseline: 'a'.repeat(40),
    product: { supportedProfileEstablished: false, acceptedEntryCommand: null, capacityClaim: false, distinctRequestAcceptanceCount: 100 },
    gates: ['G0', 'G1', 'G2', 'G3a', 'G3b', 'G4', 'G5'].map(id => ({ id, status: id === 'G3b' ? 'PROFILE_DEPENDENT_OPEN' : 'OPEN' })),
    evidence: [{ id: 'fixture', path: 'qualification/fixture.json', bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex'), expectedStatus: status,
      classification, establishesFullProductAcceptance: false }] };
  let reads = 0; return { raw, manifest, read() { reads++; return raw; }, get reads() { return reads; } };
}
check('passing-component-evidence-does-not-establish-a-product-or-accepted-gate', () => {
  const f = fixture(), r = evaluate(f.manifest, f.read); assert.equal(r.artifactIntegrity, 'VERIFIED'); assert.equal(r.retainedPasses, 1);
  assert.equal(r.productAcceptance, 'NOT_ESTABLISHED'); assert.equal(r.nativeExecutions, 0); assert.equal(r.historicalProgramsExecuted, 0);
  assert.equal(r.gates.some(g => g.status === 'PASS'), false); assert.ok(Object.isFrozen(r.records));
});
check('product-contract-failures-remain-visible-without-changing-their-original-status', () => {
  const f = fixture('FAILURE', 'PRODUCT_INTEGRATION_CONTRACT'), r = evaluate(f.manifest, f.read);
  assert.equal(r.retainedFailures, 1); assert.equal(r.records[0].classification, 'PRODUCT_INTEGRATION_CONTRACT'); assert.equal(r.records[0].status, 'FAILURE');
});
check('native-program-pass-with-rejected-qualification-is-not-promoted-to-pass', () => {
  const f = fixture('NATIVE_PROGRAM_PASS_QUALIFICATION_REJECTED', 'HARNESS_REPORTING'), r = evaluate(f.manifest, f.read);
  assert.equal(r.retainedPasses, 0); assert.equal(r.retainedFailures, 1); assert.equal(r.productAcceptance, 'NOT_ESTABLISHED');
});
check('altered-artifact-bytes-or-size-refuse-the-entire-inventory', () => {
  const f = fixture(); assert.throws(() => evaluate(f.manifest, () => Buffer.from('changed')), /EVIDENCE_IDENTITY_CHANGED/);
  f.manifest.evidence[0].bytes++; assert.throws(() => evaluate(f.manifest, f.read), /EVIDENCE_IDENTITY_CHANGED/);
});
check('a-self-consistent-new-hash-does-not-hide-an-unexpected-report-status', () => {
  const f = fixture(), changed = Buffer.from('{"status":"FAILURE"}'); f.manifest.evidence[0].bytes = changed.length;
  f.manifest.evidence[0].sha256 = createHash('sha256').update(changed).digest('hex');
  assert.throws(() => evaluate(f.manifest, () => changed), /EVIDENCE_STATUS_CHANGED/);
});
check('traversal-unknown-status-and-unreviewed-classification-are-refused', () => {
  for (const edit of [r => { r.path = 'qualification/../private.json'; }, r => { r.expectedStatus = 'SKIPPED'; }, r => { r.classification = 'HISTORICAL_IGNORE'; }]) {
    const f = fixture(); edit(f.manifest.evidence[0]); assert.throws(() => evaluate(f.manifest, f.read)); assert.equal(f.reads, 0);
  }
});
check('unproven-product-and-gate-completion-is-rejected-before-reading-any-evidence', () => {
  for (const edit of [m => { m.product.supportedProfileEstablished = true; }, m => { m.product.acceptedEntryCommand = 'invented'; },
    m => { m.gates[0].status = 'PASS'; }, m => { m.evidence[0].establishesFullProductAcceptance = true; }]) {
    const f = fixture(); edit(f.manifest); assert.throws(() => evaluate(f.manifest, f.read)); assert.equal(f.reads, 0);
  }
});
check('manifest-accessors-and-proxies-are-rejected-without-getter-entry', () => {
  const f = fixture(); let calls = 0;
  Object.defineProperty(f.manifest, 'version', { enumerable: true, get() { calls++; return 1; } });
  assert.throws(() => evaluate(f.manifest, f.read)); assert.equal(calls, 0); assert.equal(f.reads, 0);
  assert.throws(() => evaluate(new Proxy(fixture().manifest, {}), f.read)); assert.equal(f.reads, 0);
});
const cases = [];
for (const { id, run } of checks) {
  try { run(); cases.push({ id, status: 'PASS' }); }
  catch (e) { cases.push({ id, status: 'FAIL', error: String(e?.message ?? e) }); }
}
const failed = cases.filter(c => c.status !== 'PASS').length;
console.log(JSON.stringify({ qualification: 'G0_API_CREDIT_EVIDENCE_INVENTORY_DATA', passed: cases.length - failed, failed, cases,
  nativeExecutions: 0, SDK: 0, SQLite: 0, keys: 0, signatures: 0, sockets: 0, nonceSearches: 0, nodeChildren: 0, grants: 0, serviceExecutions: 0, payouts: 0,
  productAcceptance: 'NOT_ESTABLISHED', historicalProgramsExecuted: 0, filesWritten: 0 }));
if (failed) process.exitCode = 1;
