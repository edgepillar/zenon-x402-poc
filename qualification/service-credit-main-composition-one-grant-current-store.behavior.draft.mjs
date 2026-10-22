/*
 * DRAFT / NOT_RUN. Current-store listener-free actual-composition regression.
 * This distinct fixture retains the original draft and its stopped run contract.
 * It targets the retained three-edit main candidate with the current main store.
 * This file is deliberately outside automatic test discovery and has no CLI.
 * Exported functions do nothing until an independently reviewed caller invokes
 * runOneGrantCompositionCase with separately admitted Source/Native context.
 *
 * Synthetic PROVIDER key generation/signing in this draft is NOT execution
 * permission. Its human approval was pending at authorship. Capability-signing
 * and synthetic-SQLite exceptions do not grant provider-signing authority.
 * No real payment/key/wallet, network, listener, SDK, child, worker or addon.
 *
 * The caller must create NEW approved task-storage source and fixture units,
 * verify mount identity, process/lease ownership, reservations and the 10 GiB
 * free-space floor plus allocations, and keep both leases/exclusive ownership
 * throughout. Stage the candidate and its complete reviewed module graph once;
 * never overwrite production sources or use links/historical data. The caller
 * must guard this entry BEFORE importing it; self-checking here cannot
 * retroactively guard entry evaluation. Every staged file is pinned below or
 * by the caller's independently reviewed closed-graph manifest, including
 * canonical.js and this entry. No query-string module copies are used.
 *
 * Context (private values come only from the future reviewed inline caller):
 *   source: { root, identity, files:[{path,bytes,sha256,identity,reviewReceipt}] }
 *   fixture: { root, identity }
 *   entry: { bytes, sha256 } -- same reviewed entry pin as source.files
 *   admissions: nonempty receipt strings for source, native, environment,
 *     providerSigning, capabilitySigning, sqlite, storage, mount, leases
 *   expectations: { httpSourceSha256, foreignStatus, foreignBodyUtf8,
 *     storeSourceSha256, serviceClosedCode, reviewReceipt }
 *   timeoutMs: integer 1000..30000, a COOPERATIVE elapsed-time check only.
 * identity uses decimal strings for dev/ino/uid/gid/mode/nlink/size/mtimeNs/ctimeNs.
 * Receipt strings reference external approvals; this file creates none.
 * Exact denial status/body and service-closed code are mandatory caller inputs
 * from the retained reviewed HTTP/store sources, not guessed test constants.
 *
 * No allocation/cleanup manager or launcher is implemented here. Only public
 * store APIs may create the three fresh synthetic SQLite files. On every
 * failure, retain the unit and all evidence as HOLD; the caller closes its
 * owned task. Graceful same-process reopen is not crash/process/host proof.
 * Cooperative checks cannot interrupt synchronous native work or cancel an
 * unresolved Promise; lease/process checks remain mandatory after uncertainty.
 */
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readSync,
  readdirSync, realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENTRY = 'qualification/service-credit-main-composition-one-grant-current-store.behavior.draft.mjs';
const CANDIDATE_SHA = '82b5f36c4576f4e3241bce53e97fb187fcb8ba231e4a1ef8ad2eb8f57a9c36b3';
const HTTP_SHA = 'c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d';
const STORE_SHA = 'eea4032830dc1f641c4832e0dab33066633ba487eaf19581e3295cf8810460f3';
const ID_KEYS = ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'];
const DIGEST = /^[0-9a-f]{64}$/;
const MAX_FILES = 64;
const MAX_TOTAL = 4 * 1024 * 1024;
let invocationUsed = false;
const KNOWN = Object.freeze({
  'package.json': [1413, '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
  'src/canonical.js': [967, '0d55ddf1727cafb0dcd46df2922305568615552a4d2ae34a5c30e90b9d8d998c'],
  'src/service-credit-zenon-durable-http-composition.js': [37328, CANDIDATE_SHA],
  'src/service-credit-zenon-funding-composition.js': [30736, '44ad33d3b773053978b474978e7c45c8f29a4796b08b6cf4299b1c6e2fab900a'],
  'src/service-credit-zenon-funding-provider-attestation.js': [33736, '87329f823d9459539246974909e8974db0792f047724f2a3d55c239af080cbdc'],
  'src/service-credit-zenon-funding-observer-sqlite-store.js': [87075, '899a79ce7b3003b1f32ef7c23adcf06e55a74486abc4bd1cb63cb44f1c087d0c'],
  'src/service-credit-zenon-funding-observer-state.js': [58614, '8f8f4e4b7bcbb95229eecc62cd82638e4adbcfda0ad54a3a7a089273457f5d8a'],
  'src/service-credit-zenon-funding-evidence.js': [48694, '459c6cc2cdb57df1b648b2a56244935085770d9c3d1eee05ad56ddbf1bd98d80'],
  'src/service-credit-activation.js': [24719, '9e1a2ce00b2950b290ebd0797d3a770f51ad252288c630ada5ebcd6cef54233a'],
  'src/x402-wire.js': [39886, '5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56'],
  'src/service-credit-sqlite-store.js': [83516, STORE_SHA],
  'src/service-credit-model.js': [55461, '7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a'],
  'src/service-credit-execution-contract.js': [30258, '298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73'],
  'src/service-credit-durable-http-session.js': [13978, 'a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf'],
  'src/service-credit-durable-session-close.js': [2470, '5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7'],
  'src/service-credit-durable-execution-owner.js': [40833, 'a63a795dda77489f7da0682d83a0683cf07240f83b803f449668cb687a956863'],
  'src/service-credit-http.js': [32432, HTTP_SHA],
  'src/service-credit-capability.js': [8284, 'cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3'],
});

function dataObject(value, keys) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype, 'plain context required');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort(), 'context keys');
  const copy = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
    copy[key] = descriptor.value;
  }
  return copy;
}

function receipt(value) {
  assert.equal(typeof value, 'string', 'external admission receipt required');
  assert.ok(value.length >= 1 && value.length <= 512, 'bounded receipt required');
  return value;
}

function identity(stat) {
  return Object.fromEntries(ID_KEYS.map(key => [key, String(stat[key])]));
}

function expectedIdentity(value) {
  const result = dataObject(value, ID_KEYS);
  for (const key of ID_KEYS) assert.match(result[key], /^[0-9]+$/);
  return result;
}

function privateDirectory(path) {
  const stat = lstatSync(path, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'real directory required');
  assert.equal(stat.uid, BigInt(process.getuid()), 'directory owner');
  assert.equal(stat.mode & 0o7777n, 0o700n, 'private directory mode');
  assert.equal(realpathSync(path), path, 'no symlink ancestors');
  return stat;
}

function rootInput(value) {
  const input = dataObject(value, ['root', 'identity']);
  assert.equal(typeof input.root, 'string');
  assert.ok(isAbsolute(input.root) && resolve(input.root) === input.root);
  assert.deepEqual(identity(privateDirectory(input.root)), expectedIdentity(input.identity));
  return input.root;
}

function childPath(root, path) {
  assert.equal(typeof path, 'string');
  assert.match(path, /^(?:package\.json|src\/[a-z0-9-]+\.js|qualification\/[a-z0-9.-]+\.mjs)$/);
  const file = resolve(root, path);
  const rel = relative(root, file);
  assert.ok(rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
  privateDirectory(dirname(file));
  return file;
}

function assertFileStat(stat) {
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'regular source file');
  assert.equal(stat.uid, BigInt(process.getuid()), 'source file owner');
  assert.equal(stat.nlink, 1n, 'independent source file, no hard links');
  const mode = stat.mode & 0o7777n;
  assert.ok(mode === 0o600n || mode === 0o400n, 'private source file mode');
}

function guardFile(root, pin, check) {
  check();
  const file = childPath(root, pin.path);
  const before = lstatSync(file, { bigint: true });
  assertFileStat(before);
  assert.deepEqual(identity(before), pin.identity, 'source generation changed');
  assert.equal(before.size, BigInt(pin.bytes), 'source size');
  assert.equal(realpathSync(file), file);
  assert.ok(constants.O_NOFOLLOW, 'O_NOFOLLOW is mandatory');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW
    | (constants.O_NONBLOCK ?? 0) | (constants.O_CLOEXEC ?? 0));
  let packageText = '';
  try {
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), identity(before));
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(65536);
    let total = 0;
    for (;;) {
      check();
      const length = Math.min(buffer.length, pin.bytes - total + 1);
      assert.ok(length > 0, 'source cap');
      const count = readSync(fd, buffer, 0, length, null);
      if (count === 0) break;
      total += count;
      assert.ok(total <= pin.bytes, 'source exceeds cap');
      hash.update(buffer.subarray(0, count));
      if (pin.path === 'package.json') packageText += buffer.subarray(0, count).toString('utf8');
    }
    assert.equal(total, pin.bytes, 'complete source EOF');
    assert.equal(hash.digest('hex'), pin.sha256, 'exact source SHA256');
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), identity(before));
    assert.deepEqual(identity(lstatSync(file, { bigint: true })), identity(before));
  } finally {
    closeSync(fd);
  }
  return packageText;
}

function sourceInventory(root) {
  const files = [];
  let directories = 0;
  const visit = (directory, depth) => {
    directories += 1;
    assert.ok(directories <= 8, 'owned source directory cap');
    assert.ok(depth <= 2, 'owned source unit depth');
    privateDirectory(directory);
    const names = readdirSync(directory);
    assert.ok(names.length <= MAX_FILES, 'owned unit inventory cap');
    for (const name of names) {
      assert.ok(name !== '.' && name !== '..' && !name.includes(sep));
      const path = join(directory, name);
      const stat = lstatSync(path, { bigint: true });
      assert.ok(!stat.isSymbolicLink(), 'unexpected link: HOLD');
      if (stat.isDirectory()) visit(path, depth + 1);
      else {
        assertFileStat(stat);
        files.push(relative(root, path).split(sep).join('/'));
        assert.ok(files.length <= MAX_FILES, 'owned source file cap');
      }
    }
  };
  visit(root, 0);
  return files.sort();
}

function guardContext(context) {
  const ctx = dataObject(context, [
    'source', 'fixture', 'entry', 'admissions', 'expectations', 'timeoutMs',
  ]);
  const admitted = dataObject(ctx.admissions, [
    'source', 'native', 'environment', 'providerSigning', 'capabilitySigning',
    'sqlite', 'storage', 'mount', 'leases',
  ]);
  for (const value of Object.values(admitted)) receipt(value);
  assert.ok(Number.isSafeInteger(ctx.timeoutMs) && ctx.timeoutMs >= 1000 && ctx.timeoutMs <= 30000);
  const stopAt = performance.now() + ctx.timeoutMs;
  const check = () => {
    assert.ok(performance.now() <= stopAt, 'COOPERATIVE_TIMEOUT: HOLD; not cancellation');
  };
  const source = dataObject(ctx.source, ['root', 'identity', 'files']);
  const sourceRoot = rootInput({ root: source.root, identity: source.identity });
  const fixtureRoot = rootInput(ctx.fixture);
  const separation = relative(sourceRoot, fixtureRoot);
  const reverse = relative(fixtureRoot, sourceRoot);
  for (const rel of [separation, reverse]) {
    assert.ok(rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel), 'disjoint owned units');
  }
  assert.deepEqual(readdirSync(fixtureRoot), [], 'NEW empty fixture unit required');
  assert.ok(Array.isArray(source.files) && source.files.length <= MAX_FILES);
  const pins = source.files.map(raw => {
    const pin = dataObject(raw, ['path', 'bytes', 'sha256', 'identity', 'reviewReceipt']);
    receipt(pin.reviewReceipt);
    assert.ok(Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && pin.bytes <= 131072);
    assert.match(pin.sha256, DIGEST);
    return { ...pin, identity: expectedIdentity(pin.identity) };
  });
  const paths = pins.map(pin => pin.path);
  assert.equal(new Set(paths).size, paths.length, 'duplicate source path');
  assert.ok(pins.reduce((sum, pin) => sum + pin.bytes, 0) <= MAX_TOTAL);
  for (const [path, [bytes, sha256]] of Object.entries(KNOWN)) {
    const pin = pins.find(item => item.path === path);
    assert.ok(pin, 'required reviewed module missing');
    assert.equal(pin.bytes, bytes);
    assert.equal(pin.sha256, sha256);
  }
  assert.deepEqual([...paths].sort(), [...Object.keys(KNOWN), ENTRY].sort(),
    'only the exact 19-file reviewed current-store graph is admitted');
  const entry = dataObject(ctx.entry, ['bytes', 'sha256']);
  assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= 49152);
  assert.match(entry.sha256, DIGEST);
  const entryPin = pins.find(pin => pin.path === ENTRY);
  assert.ok(entryPin);
  assert.equal(entryPin.bytes, entry.bytes);
  assert.equal(entryPin.sha256, entry.sha256);
  assert.equal(fileURLToPath(import.meta.url), childPath(sourceRoot, ENTRY), 'entry must be staged with graph');
  const expected = dataObject(ctx.expectations, [
    'httpSourceSha256', 'foreignStatus', 'foreignBodyUtf8', 'storeSourceSha256',
    'serviceClosedCode', 'reviewReceipt',
  ]);
  receipt(expected.reviewReceipt);
  assert.equal(expected.httpSourceSha256, HTTP_SHA);
  assert.equal(expected.storeSourceSha256, STORE_SHA);
  assert.ok(Number.isSafeInteger(expected.foreignStatus)
    && expected.foreignStatus >= 400 && expected.foreignStatus < 500);
  assert.equal(typeof expected.foreignBodyUtf8, 'string');
  assert.ok(Buffer.byteLength(expected.foreignBodyUtf8) <= 1024);
  const denied = JSON.parse(expected.foreignBodyUtf8);
  assert.equal(typeof denied.error, 'string');
  assert.match(expected.serviceClosedCode, /^[A-Z][A-Z0-9_]{1,127}$/);
  const guardAll = () => {
    check();
    assert.deepEqual(sourceInventory(sourceRoot), [...paths].sort(), 'closed owned source inventory');
    for (const pin of pins) {
      const packageText = guardFile(sourceRoot, pin, check);
      if (pin.path === 'package.json') assert.equal(JSON.parse(packageText).type, 'module');
    }
    privateDirectory(fixtureRoot);
  };
  guardAll();
  return { sourceRoot, fixtureRoot, expected, check, guardAll };
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function hex(label) {
  return createHash('sha256').update('one-grant.synthetic:' + label).digest('hex');
}

function syntheticKeys() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  return {
    privateKey: pair.privateKey, publicKeyObject: pair.publicKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  };
}

async function exchange(owner, auth, routePath) {
  const request = Object.freeze({
    url: routePath, method: 'POST',
    rawHeaders: Object.freeze(['Authorization', auth, 'Content-Length', '0']),
  });
  const headers = Object.create(null);
  let body = null;
  const response = {
    destroyed: false, writableEnded: false, statusCode: 0,
    setHeader(name, value) { headers[String(name).toLowerCase()] = String(value); },
    end(value) {
      assert.equal(this.writableEnded, false);
      const bytes = Buffer.from(value);
      assert.ok(bytes.length <= 65536);
      body = bytes;
      this.writableEnded = true;
    },
    destroy() { this.destroyed = true; },
  };
  const original = owner.handle(request, response);
  assert.equal(Object.getPrototypeOf(original), Promise.prototype);
  await original;
  assert.equal(response.destroyed, false);
  assert.ok(body !== null && response.writableEnded);
  return { statusCode: response.statusCode, headers, body };
}

export async function runOneGrantCompositionCase(context) {
  assert.equal(invocationUsed, false, 'single-use case; no overlapping invocation/retry');
  invocationUsed = true;
  // No provider/capability keys, signatures, application imports or stores precede guards.
  const guarded = guardContext(context);
  const { sourceRoot, fixtureRoot, expected, check, guardAll } = guarded;
  const moduleAt = path => pathToFileURL(childPath(sourceRoot, path)).href;
  // The caller attests a fresh owned graph and no preloaded staged URL. Relative
  // imports resolve within this same package; manifest closure is caller-reviewed.
  const root = await import(moduleAt('src/service-credit-zenon-durable-http-composition.js'));
  const storeModule = await import(moduleAt('src/service-credit-sqlite-store.js'));
  const observerModule = await import(moduleAt('src/service-credit-zenon-funding-observer-sqlite-store.js'));
  const stateModule = await import(moduleAt('src/service-credit-zenon-funding-observer-state.js'));
  const evidenceModule = await import(moduleAt('src/service-credit-zenon-funding-evidence.js'));
  const attestation = await import(moduleAt('src/service-credit-zenon-funding-provider-attestation.js'));
  const activation = await import(moduleAt('src/service-credit-activation.js'));
  const capability = await import(moduleAt('src/service-credit-capability.js'));
  const model = await import(moduleAt('src/service-credit-model.js'));
  const http = await import(moduleAt('src/service-credit-http.js'));
  guardAll(); // Detect generation changes before any keys/signatures/store open.
  assert.deepEqual(readdirSync(fixtureRoot), [], 'fixture still fresh after imports');
  // Use the reviewed exported route without a listener/router replacement.
  assert.equal(typeof http.SERVICE_CREDIT_HTTP_PATH, 'string');
  const NOW = 2000000000000;
  const ATTESTATION_NOW = 2000000000;
  const provider = syntheticKeys();
  const capabilityA = syntheticKeys();
  const capabilityB = syntheticKeys();
  check();
  const chain = {
    version: 1, chainIdentifier: '12345', genesisMomentumHash: hex('genesis'),
  };
  const authorityText = canonical({
    authorityRecordVersion: 1, authorityProfileId: 'zenon.provider-attestation',
    authorityProfileVersion: 1, verifierVersion: 1, providerAuthorityId: 'provider.reference',
    generationId: 'provider.attestation.generation', generationVersion: 1,
    keyId: 'provider.attestation.key', algorithm: 'Ed25519',
    publicKey: provider.publicKey, network: 'zenon:testnet', chainProfile: chain,
    observerPolicy: { policyId: 'zenon.injected-observer', policyVersion: 1, verifierVersion: 1 },
    confirmationPolicy: {
      policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 3,
    },
    bootstrapCheckpoint: { height: 10, hash: hex('bootstrap') },
    sourcePolicyCommitment: 'sha256:' + hex('source-policy'),
    maximumAttestationBytes: 4096, maximumCanonicalBytes: 524288,
    maximumInitialAgeSeconds: 300, maximumFutureSkewSeconds: 5, maximumValiditySeconds: 300,
  });
  const authority = attestation.parseZenonFundingProviderAttestationAuthorityRecord(authorityText);
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const offer = {
    modelVersion: model.SERVICE_CREDIT_MODEL_VERSION, providerId: 'provider.reference',
    serviceId: 'service.reference', resourceId: 'resource.zenon.funding',
    resourceBinding: activation.deriveServiceCreditResourceBinding({
      resourceId: 'resource.zenon.funding', resourceUrl,
    }),
    offerId: 'offer.zenon.reference', offerVersion: 1, costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.zenon.observer', fundingPolicyVersion: 1,
  };
  const terms = input => ({
    fundingPolicyId: input.offer.fundingPolicyId,
    fundingPolicyVersion: input.offer.fundingPolicyVersion,
    totalUnits: 10, expiresAt: NOW + 60000,
    requirement: {
      scheme: 'exact', network: 'zenon:testnet', asset: 'zts1syntheticasset',
      amount: '7', payTo: 'z1syntheticpayee', maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront', poc: true, settlement: 'account-block',
        zenonChain: structuredClone(authority.chainProfile), minimumMomentumConfirmations: 3,
      },
    },
  });
  const selection = keys => ({
    offerId: offer.offerId, offerVersion: offer.offerVersion, holderId: 'z1syntheticpayer',
    capabilityCommitment: capability.deriveServiceCreditCapabilityCommitment({ publicKey: keys.publicKey }),
  });
  const serviceOptions = {
    databasePath: join(fixtureRoot, 'service.sqlite'), allowedRoot: fixtureRoot,
    deriveCost: () => 2, now: () => NOW,
  };
  const execution = {
    ledgerId: 'ledger.zenon.runtime',
    policy: { policyId: 'execution.zenon.runtime', policyVersion: 1, maxDurationMs: 1000 },
    capacity: 8, selectedDurationMs: 1000,
  };
  const live = { owner: null, service: null, observer: null };
  let calls = 0;
  const completed = {
    providerSignatures: 0, capabilitySignatures: 0,
    foreignRequestsDenied: 0, selectedExactReplays: 0, rootCloses: 0,
  };
  const execute = () => { calls += 1; return { resultCode: 'runtime.resource.delivered' }; };

  function options() {
    return {
      serviceCreditStore: live.service, fundingObserverStore: live.observer,
      authorityRecord: authorityText, deriveFundingTerms: terms, now: () => NOW,
      durableExecution: structuredClone(execution), execute,
      deadlineRuntime: {
        monotonicNowNs: () => 0n,
        schedule: () => Object.freeze({}), cancel: () => undefined,
      },
    };
  }

  function prepareReady(label, keys) {
    check();
    const selected = selection(keys);
    const issued = evidenceModule.prepareZenonFundingResource({
      offer: live.service.getOffer({ offerId: offer.offerId, offerVersion: offer.offerVersion }),
      selection: selected, resourceUrl, deriveFundingTerms: terms,
      authorityProfile: structuredClone(authority.authorityProfile), now: () => NOW,
    });
    const challenge = issued.challenge;
    const target = evidenceModule.deriveZenonFundingObserverTarget({
      offer: issued.offer, challenge, authorityProfile: structuredClone(authority.authorityProfile),
      transactionHash: hex('transaction.' + label), payer: selected.holderId, resourceUrl,
    });
    const pristine = stateModule.createZenonFundingObserverState({
      observerPolicy: structuredClone(authority.observerPolicy),
      authorityGeneration: structuredClone(authority.authorityGeneration),
      chainProfile: structuredClone(authority.chainProfile),
      confirmationPolicy: structuredClone(authority.confirmationPolicy),
      target, checkpoint: structuredClone(authority.bootstrapCheckpoint),
      catchUp: { maximumPageEntries: 4, maximumBackfillSpan: 8, maximumMembersPerMomentum: 4 },
    });
    assert.equal(pristine.revision, 0);
    assert.equal(pristine.status, stateModule.ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION);
    const databasePath = join(fixtureRoot, 'observer-' + label + '.sqlite');
    live.observer = observerModule.createZenonFundingObserverSqliteStore({
      databasePath, allowedRoot: fixtureRoot, initialState: pristine, authorityRecord: authorityText,
    });
    assert.equal(live.observer.load().outbox.status, 'NONE');
    const before = live.observer.load().state;
    const frontier = { height: 13, hash: hex('momentum.' + label + '.13') };
    const planned = live.observer.planBackfill({ expectedRevision: before.revision, frontier });
    assert.equal(planned.disposition, 'BACKFILL_REQUIRED');
    assert.ok(planned.plan);
    let previousHash = planned.plan.startCheckpoint.hash;
    const momentums = [];
    for (let height = planned.plan.fromHeight; height <= planned.plan.throughHeight; height += 1) {
      const hash = hex('momentum.' + label + '.' + height);
      momentums.push({
        height, hash, previousHash,
        members: height === 11
          ? [{ transactionId: before.target.transactionId, targetBindingDigest: before.targetBindingDigest }]
          : [],
      });
      previousHash = hash;
    }
    const page = live.observer.applyPage({
      expectedRevision: before.revision, plan: planned.plan, momentums,
    });
    assert.equal(page.disposition, 'APPLIED');
    const receipt = page.state.catchUp.lastAppliedPage;
    assert.ok(receipt.targetMembership && receipt.thresholdCheckpoint);
    const threshold = live.observer.applyInclusion({
      expectedRevision: page.state.revision, target: structuredClone(page.state.target),
      observation: {
        status: 'FOUND', transactionId: page.state.target.transactionId,
        targetBindingDigest: page.state.targetBindingDigest,
        momentumHeight: receipt.targetMembership.momentumHeight,
        momentumHash: receipt.targetMembership.momentumHash, pageDigest: receipt.pageDigest,
      },
    });
    assert.equal(threshold.state.status, stateModule.ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
    assert.equal(live.observer.load().outbox.status, 'PREPARED');
    const request = live.observer.peekPreparedAttestation();
    assert.ok(request);
    const issuedAt = ATTESTATION_NOW;
    const validUntil = issuedAt + 120;
    const signingBytes = attestation.createZenonFundingProviderAttestationSigningBytes({
      request, issuedAt, validUntil,
    });
    const envelope = {
      envelopeVersion: 1, attestationId: request.attestationId, keyId: authority.keyId,
      issuedAt, validUntil,
      signature: sign(null, signingBytes, provider.privateKey).toString('base64url'),
    };
    assert.equal(verify(null, signingBytes, provider.publicKeyObject,
      Buffer.from(envelope.signature, 'base64url')), true);
    completed.providerSignatures += 1;
    // Public commit performs INITIAL verification; no verifier is substituted.
    const committed = live.observer.commitAuthenticatedEnvelope({
      expectedObserverRevision: threshold.state.revision, expectedOutboxRevision: 1,
      attestationId: request.attestationId, envelope, nowEpochSeconds: ATTESTATION_NOW,
    });
    assert.equal(committed.disposition, 'READY');
    const ready = live.observer.projectCommittedFundingEvidence();
    assert.deepEqual(ready, committed.fundingEvidence);
    assert.equal(live.observer.load().outbox.status, 'READY');
    assert.equal(live.observer.peekPreparedAttestation(), null);
    const verified = live.observer.matchReadyFundingEvidence(ready);
    assert.equal(verified.capabilityCommitment, selected.capabilityCommitment);
    assert.equal(verified.transactionId, target.transactionId);
    return {
      selected, databasePath, recordKey: live.observer.load().recordKey, ready,
      input: { intent: structuredClone(challenge.activationIntent),
        paymentRequired: structuredClone(challenge.paymentRequired) },
    };
  }

  function proof(grantId, requestId, keys) {
    const request = {
      modelVersion: model.SERVICE_CREDIT_MODEL_VERSION, grantId, requestId, method: 'POST',
      routeId: http.SERVICE_CREDIT_HTTP_ROUTE_ID,
      canonicalBodyDigest: 'sha256:' + createHash('sha256').update(Buffer.alloc(0)).digest('hex'),
      selectedContentType: 'application/json', maxCostUnits: 2,
    };
    const bytes = capability.createServiceCreditCapabilitySigningBytes(request);
    const signature = sign(null, bytes, keys.privateKey);
    assert.equal(verify(null, bytes, keys.publicKeyObject, signature), true);
    completed.capabilitySignatures += 1;
    const authorization = {
      proofVersion: 1, grantId, requestId, publicKey: keys.publicKey,
      maxCostUnits: 2, signature: signature.toString('base64url'),
    };
    return { request, authorization: 'ServiceCredit '
      + Buffer.from(canonical(authorization), 'utf8').toString('base64url') };
  }

  async function send(auth) {
    // Public route value, never a guessed endpoint or a wrapper store.
    check();
    const result = await exchange(live.owner, auth, http.SERVICE_CREDIT_HTTP_PATH);
    check();
    return result;
  }

  async function start(ready) {
    live.owner = root.createZenonDurableHttpComposition(options());
    assert.throws(() => live.owner.getActiveGrantDescriptor(),
      error => error.code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_ACTIVATED_UNAVAILABLE');
    const original = live.owner.start(structuredClone(ready.input));
    assert.equal(Object.getPrototypeOf(original), Promise.prototype);
    assert.equal(live.owner.start(structuredClone(ready.input)), original);
    const outcome = await original;
    check();
    assert.deepEqual(outcome, { status: 'ACTIVE' });
    const descriptor = live.owner.getActiveGrantDescriptorForSelection(ready.selected);
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(descriptor.capabilityCommitment, ready.selected.capabilityCommitment);
    const grant = live.service.getGrant(descriptor.grantId);
    assert.equal(grant.lifecycle, 'ACTIVE');
    assert.equal(grant.capabilityCommitment, ready.selected.capabilityCommitment);
    assert.equal(grant.expiresAt > NOW, true);
    assert.deepEqual(live.observer.projectCommittedFundingEvidence(), ready.ready);
    return descriptor.grantId;
  }

  function snapshot(a, b) {
    return structuredClone({
      store: live.service.load(), ledger: live.service.getDurableExecutionSnapshot(),
      selected: live.service.getGrant(a), foreign: live.service.getGrant(b),
    });
  }

  async function deniedForeign(a, b, foreign) {
    const stored = live.service.getGrant(b);
    assert.equal(stored.lifecycle, 'ACTIVE');
    assert.equal(stored.capabilityCommitment, selection(capabilityB).capabilityCommitment);
    assert.equal(stored.expiresAt > NOW, true);
    assert.notEqual(a, b);
    assert.equal(foreign.request.grantId, b);
    const before = snapshot(a, b);
    const beforeCalls = calls;
    const response = await send(foreign.authorization);
    assert.equal(response.statusCode, expected.foreignStatus);
    assert.equal(response.body.toString('utf8'), expected.foreignBodyUtf8);
    assert.deepEqual(snapshot(a, b), before, 'foreign request must not reserve/debit/write execution');
    assert.equal(calls, beforeCalls, 'foreign request must not reach executor');
    completed.foreignRequestsDenied += 1;
  }

  async function closeRoot(input) {
    const owner = live.owner;
    const service = live.service;
    const observer = live.observer;
    const original = owner.close();
    assert.equal(Object.getPrototypeOf(original), Promise.prototype);
    assert.equal(owner.close(), original, 'preserve actual original close Promise');
    await original;
    check();
    assert.throws(() => service.load(), error => error.code === expected.serviceClosedCode);
    assert.throws(() => observer.load(), error => error.code === 'ZENON_FUNDING_OBSERVER_STORE_CLOSED');
    assert.throws(() => owner.getActiveGrantDescriptor(),
      error => error.code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_ACTIVATED_UNAVAILABLE');
    let closedCode = null;
    try { await owner.start(structuredClone(input)); } catch (error) { closedCode = error.code; }
    assert.equal(closedCode, 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_CLOSED');
    const response = await exchange(owner, 'forbidden', http.SERVICE_CREDIT_HTTP_PATH);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.toString('utf8'), '{"error":"service_unavailable"}');
    completed.rootCloses += 1;
    live.owner = null;
    live.service = null;
    live.observer = null;
  }

  try {
    live.service = storeModule.ServiceCreditSqliteStore.create(serviceOptions);
    live.service.registerOffer(offer);
    // First prove B can activate and serve through this actual root/HTTP graph.
    const b = prepareReady('b', capabilityB);
    const grantB = await start(b);
    const controlB = proof(grantB, 'request.foreign.control', capabilityB);
    const controlResponse = await send(controlB.authorization);
    assert.equal(controlResponse.statusCode, 200);
    assert.equal(calls, 1);
    assert.equal(live.service.getGrant(grantB).consumedUnits, 2);
    const foreign = proof(grantB, 'request.foreign.fresh', capabilityB);
    assert.notEqual(foreign.request.requestId, controlB.request.requestId);
    await closeRoot(b.input);

    live.service = storeModule.ServiceCreditSqliteStore.openExisting(serviceOptions);
    const bBeforeA = structuredClone(live.service.getGrant(grantB));
    assert.equal(bBeforeA.lifecycle, 'ACTIVE');
    const a = prepareReady('a', capabilityA);
    const grantA = await start(a);
    assert.notEqual(grantA, grantB);
    assert.deepEqual(live.service.getGrant(grantB), bBeforeA, 'A activation preserves valid B');
    assert.throws(() => live.owner.getActiveGrantDescriptorForSelection(b.selected),
      error => error.code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_ACTIVATED_UNAVAILABLE');

    const originalA = proof(grantA, 'request.selected.original', capabilityA);
    const selectedBefore = live.service.getGrant(grantA).consumedUnits;
    const first = await send(originalA.authorization);
    assert.equal(first.statusCode, 200);
    assert.equal(calls, 2);
    assert.equal(live.service.getGrant(grantA).consumedUnits, selectedBefore + 2);
    const originalBytes = Buffer.from(first.body);
    await deniedForeign(grantA, grantB, foreign);
    // A previously successful cached B proof is also outside A's admitted scope.
    await deniedForeign(grantA, grantB, controlB);
    const afterA = snapshot(grantA, grantB);
    const replay = await send(originalA.authorization); // EXACT original authorization.
    assert.equal(replay.statusCode, 200);
    assert.deepEqual(replay.body, originalBytes);
    assert.deepEqual(replay.headers, first.headers, 'exact original response headers');
    assert.deepEqual(snapshot(grantA, grantB), afterA);
    completed.selectedExactReplays += 1;
    assert.equal(calls, 2);
    assert.deepEqual(live.observer.projectCommittedFundingEvidence(), a.ready);
    await closeRoot(a.input);

    // Graceful SAME-PROCESS reopen only: no crash, child, host or pilot claim.
    live.service = storeModule.ServiceCreditSqliteStore.openExisting(serviceOptions);
    live.observer = observerModule.openZenonFundingObserverSqliteStore({
      databasePath: a.databasePath, allowedRoot: fixtureRoot,
      expectedRecordKey: a.recordKey, authorityRecord: authorityText,
    });
    assert.equal(await start(a), grantA);
    assert.equal(live.service.load().state.grants.length, 2);
    const reopened = snapshot(grantA, grantB);
    const replayAfterReopen = await send(originalA.authorization);
    assert.equal(replayAfterReopen.statusCode, 200);
    assert.deepEqual(replayAfterReopen.body, originalBytes);
    assert.deepEqual(replayAfterReopen.headers, first.headers, 'reopened original response headers');
    assert.deepEqual(snapshot(grantA, grantB), reopened);
    completed.selectedExactReplays += 1;
    assert.equal(calls, 2);
    await deniedForeign(grantA, grantB, foreign);
    await deniedForeign(grantA, grantB, controlB);
    assert.deepEqual(live.observer.projectCommittedFundingEvidence(), a.ready);
    await closeRoot(a.input);
    check();
    assert.deepEqual(completed, {
      providerSignatures: 2, capabilitySignatures: 3,
      foreignRequestsDenied: 4, selectedExactReplays: 2, rootCloses: 3,
    }, 'all finite selected assertions must have been reached');
    return Object.freeze({
      case: 'actual-composition-one-grant-current-store', status: 'ASSERTIONS_COMPLETED',
      assertions: Object.freeze({ ...completed }),
      scope: 'synthetic listener-free; graceful same-process reopen only',
      executorCalls: calls, fixtureDisposition: 'HOLD_FOR_CALLER_MANAGER',
      candidateSha256: CANDIDATE_SHA, storeSourceSha256: STORE_SHA,
    });
  } catch (error) {
    // Retain all bytes/unknown files. Only close the actual owned objects.
    const closeErrors = [];
    if (live.owner !== null) {
      try {
        const original = live.owner.close();
        await original;
      } catch (closeError) { closeErrors.push(closeError); }
    } else {
      for (const store of [live.observer, live.service]) {
        if (store !== null) {
          try { store.close(); } catch (closeError) { closeErrors.push(closeError); }
        }
      }
    }
    if (closeErrors.length !== 0) {
      throw new AggregateError([error, ...closeErrors], 'CASE_AND_CLOSE_FAILURE: HOLD');
    }
    throw error;
  }
}
