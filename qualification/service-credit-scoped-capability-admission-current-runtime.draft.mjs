// PUBLIC SOURCE DRAFT; launch still requires separate exact review.
// Same four retained scenarios; current-runtime/private-binding recontext only.
// Four admission cases; no execution/cache/close/payment/chain qualification.
// Future caller: explicit opt-in + whole self SHA. Timeouts are cooperative.
// No hard lifetime, native cleanup, loader race-free or OS sandbox claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
 constants, lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

function failure(code) {
 const error = new Error(code);
 error.stack = 'Error: ' + code;
 return error;
}
function requireThat(condition, code) {
 if (!condition) throw failure(code);
}
requireThat(
 process.env.ZENON_SCOPED_CAPABILITY_ADMISSION_V1 === 'reviewed-synthetic-only',
 'SCOPED_CAPABILITY_OPT_IN_REQUIRED',
);
const selfSHA = process.env.ZENON_SCOPED_CAPABILITY_FIXTURE_SHA256;
requireThat(typeof selfSHA === 'string' && /^[0-9a-f]{64}$/.test(selfSHA),
 'SCOPED_CAPABILITY_SELF_PIN_REQUIRED');
const selfURL = new URL(import.meta.url);
requireThat(selfURL.protocol === 'file:' && !selfURL.search && !selfURL.hash,
 'SCOPED_CAPABILITY_FILE_URL_REQUIRED');
const rootURL = new URL('../', selfURL);
const SELF_RELATIVE = 'qualification/service-credit-scoped-capability-admission-current-runtime.draft.mjs';
const entries = [["package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5","ec7193f6fd76f34778515079dc777594175c4c34"],["src/service-credit-http.js",32432,958,"c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d","040da1547c2fa6cc4a4044c47619b253f16d19a1"],["src/service-credit-model.js",55461,1580,"7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a","e6ac17254874584d1a01f70e7abc6f771bd35d73"],["src/service-credit-capability.js",8284,256,"cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3","2e19d42c1b9311a75897c84669849f56ae40f785"]];
const bindingText = process.env.ZENON_SCOPED_CAPABILITY_SOURCE_BINDINGS_JSON;
requireThat(typeof bindingText === 'string' && bindingText.length > 0
 && bindingText.length <= 16384, 'PRIVATE_BINDINGS_REQUIRED');
const sourceBindings = JSON.parse(bindingText);
const bindingKeys = [SELF_RELATIVE, ...entries.map(row => row[0])].sort();
requireThat(sourceBindings !== null && Object.getPrototypeOf(sourceBindings) === Object.prototype
 && JSON.stringify(Object.keys(sourceBindings).sort()) === JSON.stringify(bindingKeys),
 'EXACT_PRIVATE_BINDINGS_REQUIRED');
const stampKeys = ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'];
function sameStamp(left, right) {
 return stampKeys.every(key => left[key] === right[key]);
}
function physical(path, stat) {
 return stat.isFile() && stat.uid === BigInt(process.getuid())
  && stat.nlink === 1n && (stat.mode & 0o7777n) === 0o644n
  && realpathSync(path) === path;
}
const checked = [];
function readPinned(url, spec) {
 let fd;
 try {
  const path = fileURLToPath(url);
  const before = lstatSync(path, { bigint: true });
  requireThat(physical(path, before), 'PIN_PHYSICAL');
  const relative = spec ? spec[0] : SELF_RELATIVE;
  const expected = sourceBindings[relative];
  requireThat(Array.isArray(expected) && expected.length === 8
   && expected.every(value => typeof value === 'string' && /^[0-9]+$/.test(value)),
   'PIN_PRIVATE_IDENTITY');
  requireThat(stampKeys.every((key, index) => String(before[key]) === expected[index]),
   'PIN_PRIVATE_IDENTITY');
  const size = Number(before.size);
  if (spec) {
   requireThat(size === spec[1], 'PIN_IDENTITY');
  } else {
   requireThat(size > 0 && size <= 24576, 'PIN_SELF_SIZE');
  }
  fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  requireThat(sameStamp(before, fstatSync(fd, { bigint: true })), 'PIN_OPEN');
  const bytes = Buffer.alloc(size + 1);
  let count = 0;
  while (count < bytes.length) {
   const n = readSync(fd, bytes, count, bytes.length - count, null);
   if (n === 0) break;
   count += n;
  }
  requireThat(count === size
   && sameStamp(before, fstatSync(fd, { bigint: true }))
   && sameStamp(before, lstatSync(path, { bigint: true }))
   && realpathSync(path) === path, 'PIN_STABILITY');
  const raw = bytes.subarray(0, size);
  const sha = createHash('sha256').update(raw).digest('hex');
  requireThat(sha === (spec ? spec[3] : selfSHA), 'PIN_SHA256');
  if (spec) {
   const blob = createHash('sha1').update('blob ' + size + '\0').update(raw).digest('hex');
   let lines = 0;
   for (const byte of raw) {
    requireThat(byte < 128, 'PIN_ASCII');
    if (byte === 10) lines += 1;
   }
   requireThat(blob === spec[4] && lines === spec[2] && raw[size - 1] === 10,
    'PIN_BLOB_LINES');
  }
  checked.push({ path, stamp: before });
 } catch {
  throw failure('SCOPED_CAPABILITY_PIN_REFUSED');
 } finally {
  if (fd !== undefined) {
   try { closeSync(fd); } catch { throw failure('SCOPED_CAPABILITY_CLOSE_REFUSED'); }
  }
 }
}
function unchangedFiles() {
 try {
  for (const entry of checked) {
   const current = lstatSync(entry.path, { bigint: true });
   requireThat(physical(entry.path, current) && sameStamp(entry.stamp, current),
    'PIN_CHANGED');
  }
 } catch {
  throw failure('SCOPED_CAPABILITY_METADATA_CHANGED');
 }
}
// Explicit read closure: self/package/three sources. Loader TOCTOU is not closed.
readPinned(selfURL, null);
for (const entry of entries) readPinned(new URL(entry[0], rootURL), entry);
let http, modelModule, capability;
try {
 [http, modelModule, capability] = await Promise.all([
  import(new URL('src/service-credit-http.js', rootURL).href),
  import(new URL('src/service-credit-model.js', rootURL).href),
  import(new URL('src/service-credit-capability.js', rootURL).href),
 ]);
} catch {
 throw failure('SCOPED_CAPABILITY_IMPORT_REFUSED');
}
unchangedFiles();
const { InMemoryServiceCreditModel, SERVICE_CREDIT_MODEL_VERSION } = modelModule;
const {
 deriveServiceCreditCapabilityCommitment,
 createServiceCreditCapabilitySigningBytes,
 verifyServiceCreditCapability,
 SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
} = capability;
const { createServiceCreditHttpAdmission, SERVICE_CREDIT_HTTP_PATH,
 SERVICE_CREDIT_HTTP_ROUTE_ID } = http;
const options = Object.freeze({ timeout: 5000, concurrency: false });
const digest = character => 'sha256:' + character.repeat(64);
const emptyDigest = 'sha256:' + createHash('sha256').update(Buffer.alloc(0)).digest('hex');
function canonical(value) {
 if (value === null || typeof value !== 'object') return JSON.stringify(value);
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
 return '{' + Object.keys(value).sort().map(
  key => JSON.stringify(key) + ':' + canonical(value[key]),
 ).join(',') + '}';
}
let totalPairs = 0;
let totalSigns = 0;
let activeCase = false;
function freshPair() {
 requireThat(++totalPairs <= 8, 'SCOPED_CAPABILITY_KEYPAIR_CAP');
 return generateKeyPairSync('ed25519');
}
function publicBytes(pair) {
 const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
 assert.equal(spki.length, 44);
 assert.equal(spki.subarray(0, 12).toString('hex'), '302a300506032b6570032100');
 return spki.subarray(12).toString('base64url');
}
function setup() {
 // Declared synthetic setup; two case-owned keypairs, no private export.
 let owner = freshPair();
 let foreign = freshPair();
 const ownerPublic = publicBytes(owner);
 const foreignPublic = publicBytes(foreign);
 let clockCalls = 0, pricingCalls = 0, loadCalls = 0, caseSigns = 0;
 const model = new InMemoryServiceCreditModel({
  now: () => { clockCalls += 1; return 1000; },
  deriveCost: () => { pricingCalls += 1; return 4; },
 });
 const offer = {
  modelVersion: SERVICE_CREDIT_MODEL_VERSION,
  providerId: 'synthetic.provider', serviceId: 'synthetic.service',
  resourceId: 'synthetic.resource', resourceBinding: digest('1'),
  offerId: 'synthetic.offer', offerVersion: 1, costPolicyId: 'synthetic.cost',
  fundingPolicyId: 'synthetic.funding', fundingPolicyVersion: 1,
 };
 model.registerOffer(offer);
 function activate(label, publicKey, character) {
  const holder = 'synthetic.holder.' + label;
  return model.activateGrantFromTrustedRecord({
   activationVersion: 1, authorityProfileId: 'synthetic.authority',
   authorityProfileVersion: 1, verifierVersion: 1,
   authorityRecordDigest: digest(character),
   fundingPolicyId: offer.fundingPolicyId, fundingPolicyVersion: 1,
   sourceSettlementId: 'synthetic.settlement.' + label,
   transactionId: 'mocktx:' + character.repeat(64),
   providerId: offer.providerId, serviceId: offer.serviceId,
   resourceId: offer.resourceId, resourceBinding: offer.resourceBinding,
   offerId: offer.offerId, offerVersion: 1, holderId: holder,
   capabilityCommitment: deriveServiceCreditCapabilityCommitment({ publicKey }),
   totalUnits: 100, expiresAt: 2000, scheme: 'exact', paymentFlow: 'upfront',
   network: 'zenon:mock',
   chainProfile: { version: 1, chainIdentifier: Number.MAX_SAFE_INTEGER.toString(),
    genesisMomentumHash: '0'.repeat(64) },
   asset: 'synthetic.asset', amount: '100', payee: 'synthetic.payee', payer: holder,
   paymentResourceDigest: digest('4'), paymentRequirementDigest: digest('5'),
   paymentIntentDigest: digest('6'), grantFundingCommitment: digest('7'),
   evidenceState: 'MOMENTUM_INCLUDED',
   confirmationPolicy: { policyId: 'mock.momentum-included', policyVersion: 1,
    minimumConfirmations: 1 },
  });
 }
 const target = activate('target', ownerPublic, 'a');
 const other = activate('foreign', foreignPublic, 'b');
 assert.notEqual(target.grantId, other.grantId);
 const state = model.exportState();
 assert.equal(state.grants.length, 2);
 assert.equal(state.requests.length, 0);
 for (const grant of state.grants) {
  assert.equal(grant.availableUnits, 100);
  assert.equal(grant.heldUnits, 0);
  assert.equal(grant.consumedUnits, 0);
 }
 const envelopeData = { schemaVersion: 1, revision: 0, state };
 const checksum = 'sha256:' + createHash('sha256').update(canonical(envelopeData)).digest('hex');
 const envelope = Object.freeze({ ...envelopeData, checksum });
 const store = Object.freeze({ load() { loadCalls += 1; return envelope; } });
 assert.deepEqual(Object.keys(store), ['load']);
 const admission = createServiceCreditHttpAdmission({ store, admittedGrantId: target.grantId });
 assert.equal(Object.isFrozen(admission), true);
 assert.equal(Object.isFrozen(admission.admit), true);
 assert.equal(loadCalls, 1);
 // Decision baselines exclude grant-creation clock calls.
 const baseline = Object.freeze({ clock: clockCalls, pricing: pricingCalls, loads: loadCalls });
 function unchanged() {
  unchangedFiles();
  assert.equal(clockCalls, baseline.clock);
  assert.equal(pricingCalls, baseline.pricing);
  assert.equal(loadCalls, baseline.loads);
  assert.deepEqual(model.exportState(), state);
  assert.equal(state.requests.length, 0);
 }
 function tuple(grant) {
  return Object.freeze({
   modelVersion: SERVICE_CREDIT_MODEL_VERSION, grantId: grant.grantId,
   requestId: 'synthetic.request.1', method: 'POST',
   routeId: SERVICE_CREDIT_HTTP_ROUTE_ID, canonicalBodyDigest: emptyDigest,
   selectedContentType: 'application/json', maxCostUnits: 4,
  });
 }
 function proof(request, signer) {
  requireThat(++caseSigns <= 2 && ++totalSigns <= 6, 'SCOPED_CAPABILITY_SIGN_CAP');
  const pair = signer === 'owner' ? owner : foreign;
  const publicKey = signer === 'owner' ? ownerPublic : foreignPublic;
  return Object.freeze({
   proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
   grantId: request.grantId, requestId: request.requestId,
   publicKey, maxCostUnits: request.maxCostUnits,
   signature: sign(null, createServiceCreditCapabilitySigningBytes(request),
    pair.privateKey).toString('base64url'),
  });
 }
 function requestFor(value) {
  const authorization = 'ServiceCredit ' + Buffer.from(canonical(value), 'utf8').toString('base64url');
  assert.ok(Buffer.byteLength(authorization, 'utf8') <= 1024);
  return Object.freeze({ method: 'POST', url: SERVICE_CREDIT_HTTP_PATH,
   rawHeaders: Object.freeze(['Authorization', authorization]) });
 }
 return {
  target: Object.freeze({ grantId: target.grantId, capabilityCommitment: target.capabilityCommitment }),
  other: Object.freeze({ grantId: other.grantId, capabilityCommitment: other.capabilityCommitment }),
  tuple, proof, requestFor, unchanged,
  admit(request) { const result = admission.admit(request); unchanged(); return result; },
  signCount() { return caseSigns; },
  forget() { owner = null; foreign = null; },
 };
}
function authorized(decision, expected) {
 assert.equal(Object.isFrozen(decision), true);
 assert.deepEqual(Object.keys(decision).sort(), ['request', 'status']);
 assert.equal(decision.status, 'AUTHORIZED');
 assert.equal(Object.isFrozen(decision.request), true);
 assert.notEqual(decision.request, expected);
 assert.deepEqual(decision.request, expected);
 assert.equal(Object.keys(decision.request).length, 8);
}
function unauthorized(decision) {
 assert.equal(Object.isFrozen(decision), true);
 assert.deepEqual(decision, { status: 'UNAUTHORIZED', request: null });
}
function runCase(label, expectedSigns, scenario) {
 requireThat(!activeCase, 'SCOPED_CAPABILITY_CASE_OVERLAP');
 activeCase = true;
 let fixture;
 try {
  unchangedFiles();
  fixture = setup();
  scenario(fixture);
  fixture.unchanged();
  assert.equal(fixture.signCount(), expectedSigns);
 } catch {
  // Fixed errors discard key/proof/admin/native details.
  throw failure('SCOPED_CAPABILITY_' + label + '_FAILED');
 } finally {
  if (fixture) fixture.forget();
  activeCase = false;
 }
}

test('S1 matching owner proof reaches actual scoped admission', options, () => {
 runCase('S1', 1, fixture => {
  const expected = fixture.tuple(fixture.target);
  const request = fixture.requestFor(fixture.proof(expected, 'owner'));
  authorized(fixture.admit(request), expected);
 });
});
test('S2 valid stored foreign-grant proof is excluded and owner remains usable', options, () => {
 runCase('S2', 2, fixture => {
  const foreignRequest = fixture.tuple(fixture.other);
  const foreignProof = fixture.proof(foreignRequest, 'foreign');
  const verified = verifyServiceCreditCapability({
   grant: fixture.other, request: foreignRequest, proof: foreignProof,
  });
  assert.deepEqual(verified, {
   verified: true, proofVersion: SERVICE_CREDIT_CAPABILITY_PROOF_VERSION,
   grantId: foreignRequest.grantId, requestId: foreignRequest.requestId,
   maxCostUnits: foreignRequest.maxCostUnits,
  });
  assert.equal(Object.isFrozen(verified), true);
  unauthorized(fixture.admit(fixture.requestFor(foreignProof)));
  const expected = fixture.tuple(fixture.target);
  authorized(fixture.admit(fixture.requestFor(fixture.proof(expected, 'owner'))), expected);
 });
});
test('S3 wrong key for target is rejected and owner remains usable', options, () => {
 runCase('S3', 2, fixture => {
  const expected = fixture.tuple(fixture.target);
  unauthorized(fixture.admit(fixture.requestFor(fixture.proof(expected, 'foreign'))));
  authorized(fixture.admit(fixture.requestFor(fixture.proof(expected, 'owner'))), expected);
 });
});
test('S4 byte-identical proof repeat preserves normalized admission identity', options, () => {
 runCase('S4', 1, fixture => {
  const expected = fixture.tuple(fixture.target);
  const request = fixture.requestFor(fixture.proof(expected, 'owner'));
  const first = fixture.admit(request);
  const second = fixture.admit(request);
  authorized(first, expected);
  authorized(second, expected);
  assert.notEqual(first, second);
  assert.notEqual(first.request, second.request);
  assert.deepEqual(first, second);
 });
});
