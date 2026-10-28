import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { constants, lstatSync, fstatSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATES = ['G0', 'G1', 'G2', 'G3a', 'G3b', 'G4', 'G5'];
const CLASS = ['PRODUCT_INTEGRATION_CONTRACT', 'HARNESS_EXPECTATION', 'HARNESS_REPORTING', 'RETAINED_PASS', 'COMPONENT_DATA_PASS'];
function fail(code) { const e = new Error(code); Object.defineProperty(e, 'stack', { value: 'Error: ' + code }); throw e; }
function data(o, k) {
  if (o === null || typeof o !== 'object' || types.isProxy(o) || Object.getPrototypeOf(o) !== Object.prototype) fail('INVENTORY_OBJECT');
  const d = Object.getOwnPropertyDescriptor(o, k); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail('INVENTORY_FIELD'); return d.value;
}
function path(value) {
  if (typeof value !== 'string' || !/^qualification\/[A-Za-z0-9_./-]+\.json$/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) fail('INVENTORY_PATH'); return value;
}
/** Verify retained artifact identity/status; never execute historical recipes or accept a product gate. */
export function evaluateAcceptanceEvidence(manifest, readArtifact) {
  if (data(manifest, 'version') !== 1 || data(manifest, 'profile') !== 'API_CREDIT_V1_G0_INVENTORY'
      || typeof readArtifact !== 'function' || types.isProxy(readArtifact)) fail('INVENTORY_PROFILE');
  const baseline = data(manifest, 'sourceBaseline'); if (typeof baseline !== 'string' || !/^[0-9a-f]{40}$/.test(baseline)) fail('INVENTORY_BASELINE');
  const product = data(manifest, 'product');
  if (data(product, 'supportedProfileEstablished') !== false || data(product, 'acceptedEntryCommand') !== null || data(product, 'capacityClaim') !== false
      || data(product, 'distinctRequestAcceptanceCount') !== 100) fail('UNPROVEN_PRODUCT_ACCEPTANCE');
  const gates = data(manifest, 'gates');
  if (!Array.isArray(gates) || types.isProxy(gates) || gates.length !== GATES.length
      || gates.some((g, i) => data(g, 'id') !== GATES[i] || data(g, 'status') !== (GATES[i] === 'G3b' ? 'PROFILE_DEPENDENT_OPEN' : 'OPEN'))) fail('UNPROVEN_GATE_ACCEPTANCE');
  const input = data(manifest, 'evidence'); if (!Array.isArray(input) || types.isProxy(input) || input.length < 1 || input.length > 64) fail('INVENTORY_RECORDS');
  const ids = new Set(), paths = new Set(), records = [];
  for (const row of input) {
    const id = data(row, 'id'), name = path(data(row, 'path')), bytes = data(row, 'bytes'), expected = data(row, 'sha256');
    const status = data(row, 'expectedStatus'), classification = data(row, 'classification');
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(id) || ids.has(id) || paths.has(name)
        || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > 262144 || typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected)
        || !['PASS', 'FAILURE', 'NATIVE_PROGRAM_PASS_QUALIFICATION_REJECTED'].includes(status) || !CLASS.includes(classification)
        || (status === 'PASS') !== ['RETAINED_PASS', 'COMPONENT_DATA_PASS'].includes(classification)
        || data(row, 'establishesFullProductAcceptance') !== false) fail('INVENTORY_RECORD');
    ids.add(id); paths.add(name); const raw = readArtifact(name);
    if (!Buffer.isBuffer(raw) || types.isProxy(raw) || raw.length !== bytes || createHash('sha256').update(raw).digest('hex') !== expected) fail('EVIDENCE_IDENTITY_CHANGED');
    let parsed; try { parsed = JSON.parse(raw.toString('utf8')); } catch { fail('EVIDENCE_JSON'); }
    if (data(parsed, 'status') !== status) fail('EVIDENCE_STATUS_CHANGED');
    records.push(Object.freeze({ id, path: name, sha256: expected, status, classification, establishesFullProductAcceptance: false }));
  }
  return Object.freeze({ kind: 'API_CREDIT_V1_RETAINED_EVIDENCE_INVENTORY', sourceBaseline: baseline, artifactIntegrity: 'VERIFIED',
    retainedPasses: records.filter(r => r.status === 'PASS').length, retainedFailures: records.filter(r => r.status !== 'PASS').length,
    records: Object.freeze(records), gates: Object.freeze(gates.map(g => Object.freeze({ id: data(g, 'id'), status: data(g, 'status') }))),
    productAcceptance: 'NOT_ESTABLISHED', historicalProgramsExecuted: 0, nativeExecutions: 0, filesWritten: 0, authority: 'NONE' });
}
function boundedFile(root, name) {
  const full = resolve(root, name); if (!full.startsWith(root + sep)) fail('INVENTORY_PATH');
  const before = lstatSync(full); if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > 262144) fail('INVENTORY_FILE');
  const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW);
  const same = s => ['dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(k => s[k] === before[k]);
  try {
    if (!same(fstatSync(fd))) fail('INVENTORY_FILE_CHANGED'); const raw = Buffer.alloc(before.size + 1); let used = 0, n;
    do { n = readSync(fd, raw, used, raw.length - used, null); used += n; } while (n && used < raw.length);
    if (used !== before.size || !same(fstatSync(fd)) || !same(lstatSync(full))) fail('INVENTORY_FILE_CHANGED'); return raw.subarray(0, used);
  } finally { closeSync(fd); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) fail('INVENTORY_ARGUMENTS');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const manifest = JSON.parse(boundedFile(root, 'qualification/acceptance/api-credit-v1.evidence.json').toString('utf8'));
    console.log(JSON.stringify(evaluateAcceptanceEvidence(manifest, name => boundedFile(root, name))));
  } catch (e) {
    const message = e && !types.isProxy(e) ? Object.getOwnPropertyDescriptor(e, 'message')?.value : null;
    const code = typeof message === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(message) ? message : 'INVENTORY_IO_OR_PARSE_REFUSED';
    console.log(JSON.stringify({ kind: 'API_CREDIT_V1_RETAINED_EVIDENCE_INVENTORY', artifactIntegrity: 'REFUSED', error: code,
    productAcceptance: 'NOT_ESTABLISHED', historicalProgramsExecuted: 0, nativeExecutions: 0, filesWritten: 0 })); process.exitCode = 1; }
}
