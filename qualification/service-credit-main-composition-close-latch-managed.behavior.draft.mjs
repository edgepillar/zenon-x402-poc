/*
 * Explicit, listener-free current-main composition close-latch qualification.
 * No automatic test registration or CLI. A reviewed inline caller must guard
 * this entry before import and invoke each selected case at most once.
 *
 * Only new private task-storage source/seed aliases and fixture children are
 * used. The two seed images are exact retained synthetic outputs of the prior
 * one-grant case; original files remain read-only and are never opened by SQL.
 * Source and read-only seed aliases are independent APFS clones. Mutable case
 * databases are explicit, quota-accounted byte-image copies registered by the
 * approved manager as RETAIN_ON_FAILURE, not an implicit clone fallback.
 * Their exact hashes and independent identities are guarded before SQL opens.
 * The earlier Node-clone setup failure and its complete evidence stay intact.
 *
 * This case generates no key, capability proof or provider attestation. It
 * does not start funding, a listener, SDK, wallet, payment, child or worker.
 * Existing committed synthetic attestation envelopes are verified by the
 * actual composition/observer modules when the new fixture stores are opened.
 *
 * The fault is one data-only own Symbol on an owned observer instance, not a
 * method/prototype replacement or a fake composition/store. After the real
 * boundary refuses close, removing that Symbol must not authorize a retry.
 * The original rejected close Promise and its original error must survive.
 *
 * Cooperative deadlines cannot guarantee hard lifetime, cancellation, native
 * cleanup, durability or an OS/network sandbox. Failure retains all bytes.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync,
  openSync, readSync, readdirSync, realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENTRY = 'qualification/service-credit-main-composition-close-latch-managed.behavior.draft.mjs';
const CANDIDATE_SHA = '24dbd24e40f30c1be3827c68e9c67664219e8a6522b67f94361a5bfbd0a34fdd';
const ID_KEYS = ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'];
const MAX_SOURCE_BYTES = 786432;
const SOURCE_PINS = Object.freeze({
  "package.json": [
    1413,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ],
  "src/service-credit-capability.js": [
    8284,
    "cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3"
  ],
  "src/service-credit-durable-execution-owner.js": [
    40833,
    "a63a795dda77489f7da0682d83a0683cf07240f83b803f449668cb687a956863"
  ],
  "src/service-credit-durable-http-session.js": [
    13978,
    "a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf"
  ],
  "src/service-credit-durable-session-close.js": [
    2470,
    "5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7"
  ],
  "src/service-credit-execution-contract.js": [
    30258,
    "298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73"
  ],
  "src/service-credit-http.js": [
    32432,
    "c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d"
  ],
  "src/service-credit-model.js": [
    55461,
    "7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a"
  ],
  "src/service-credit-sqlite-store.js": [
    83516,
    "eea4032830dc1f641c4832e0dab33066633ba487eaf19581e3295cf8810460f3"
  ],
  "src/service-credit-zenon-durable-http-composition.js": [
    37227,
    "24dbd24e40f30c1be3827c68e9c67664219e8a6522b67f94361a5bfbd0a34fdd"
  ],
  "src/service-credit-zenon-funding-composition.js": [
    30736,
    "44ad33d3b773053978b474978e7c45c8f29a4796b08b6cf4299b1c6e2fab900a"
  ],
  "src/service-credit-zenon-funding-evidence.js": [
    48694,
    "459c6cc2cdb57df1b648b2a56244935085770d9c3d1eee05ad56ddbf1bd98d80"
  ],
  "src/service-credit-zenon-funding-observer-sqlite-store.js": [
    87075,
    "899a79ce7b3003b1f32ef7c23adcf06e55a74486abc4bd1cb63cb44f1c087d0c"
  ],
  "src/service-credit-zenon-funding-observer-state.js": [
    58614,
    "8f8f4e4b7bcbb95229eecc62cd82638e4adbcfda0ad54a3a7a089273457f5d8a"
  ],
  "src/service-credit-zenon-funding-provider-attestation.js": [
    33736,
    "87329f823d9459539246974909e8974db0792f047724f2a3d55c239af080cbdc"
  ],
  "src/x402-wire.js": [
    39886,
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  ]
});
const SEED_PINS = Object.freeze({
  'observer.sqlite': [28672, '5ecf53b98bb6a7993200f205666700870a204114d629b85240607babf7336671'],
  'service.sqlite': [24576, 'c13ea2649bde56cf5030a2564deb8e354c5e0b3b9248747262be5ed6e223f118'],
});
const PREFIX = 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_';
const seen = new Set();
let active = false;

function identity(stat) {
  return Object.fromEntries(ID_KEYS.map(key => [key, String(stat[key])]));
}
function data(value, keys) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort());
  const out = {};
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(d && d.enumerable && Object.hasOwn(d, 'value'));
    out[key] = d.value;
  }
  return out;
}
function expectedIdentity(value) {
  const out = data(value, ID_KEYS);
  for (const value of Object.values(out)) assert.match(value, /^[0-9]+$/);
  return out;
}
function directory(root, expected, stableOnly = false) {
  assert.equal(typeof root, 'string');
  assert.ok(isAbsolute(root) && resolve(root) === root);
  assert.equal(realpathSync(root), root);
  const stat = lstatSync(root, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.equal(stat.uid, BigInt(process.getuid()));
  assert.equal(stat.mode & 0o7777n, 0o700n);
  if (expected) {
    const want = expectedIdentity(expected);
    if (stableOnly) {
      for (const key of ID_KEYS.slice(0, 5)) assert.equal(identity(stat)[key], want[key]);
    } else assert.deepEqual(identity(stat), want);
  }
  return stat;
}
function pinnedBytes(file, pin, check, modes = [0o400n, 0o600n]) {
  check();
  const before = lstatSync(file, { bigint: true });
  assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.equal(before.uid, BigInt(process.getuid()));
  assert.equal(before.nlink, 1n);
  assert.ok(modes.includes(before.mode & 0o7777n));
  assert.equal(realpathSync(file), file);
  if (pin.identity) assert.deepEqual(identity(before), expectedIdentity(pin.identity));
  assert.equal(before.size, BigInt(pin.bytes));
  assert.ok(constants.O_NOFOLLOW);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW
    | (constants.O_NONBLOCK ?? 0));
  const digest = createHash('sha256'), chunks = [];
  let total = 0;
  try {
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), identity(before));
    for (;;) {
      check();
      const buffer = Buffer.alloc(Math.min(65536, pin.bytes - total + 1));
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      total += count;
      assert.ok(total <= pin.bytes);
      const block = buffer.subarray(0, count);
      digest.update(block); chunks.push(block);
    }
    assert.equal(total, pin.bytes);
    assert.equal(digest.digest('hex'), pin.sha256);
    assert.deepEqual(identity(fstatSync(fd, { bigint: true })), identity(before));
    assert.deepEqual(identity(lstatSync(file, { bigint: true })), identity(before));
    return Buffer.concat(chunks, total);
  } finally { closeSync(fd); }
}
function childSource(root, path) {
  assert.match(path, /^(?:package\.json|src\/[a-z0-9-]+\.js|qualification\/[a-z0-9.-]+\.mjs)$/);
  const file = resolve(root, path), rel = relative(root, file);
  assert.ok(rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
  directory(dirname(file));
  return file;
}
function inventory(root) {
  const files = [];
  let dirs = 0;
  function visit(path, depth) {
    assert.ok(++dirs <= 4 && depth <= 2);
    directory(path);
    const names = readdirSync(path);
    assert.ok(names.length <= 32);
    for (const name of names) {
      assert.ok(name !== '.' && name !== '..' && !name.includes(sep));
      const child = join(path, name), stat = lstatSync(child, { bigint: true });
      assert.ok(!stat.isSymbolicLink());
      if (stat.isDirectory()) visit(child, depth + 1);
      else {
        assert.ok(stat.isFile() && stat.nlink === 1n);
        files.push(relative(root, child).split(sep).join('/'));
        assert.ok(files.length <= 17);
      }
    }
  }
  visit(root, 0);
  return files.sort();
}
function guardContext(context, selection) {
  const ctx = data(context, ['source','seeds','fixture','entry','admissions','timeoutMs']);
  const admitted = data(ctx.admissions, ['source','native','environment','sqlite','storage','mount','leases','seedReuse']);
  for (const value of Object.values(admitted)) {
    assert.equal(typeof value, 'string');
    assert.ok(value.length > 0 && value.length <= 512);
  }
  assert.equal(ctx.timeoutMs, 5000);
  const stop = performance.now() + ctx.timeoutMs;
  const check = () => assert.ok(performance.now() <= stop, 'COOPERATIVE_TIMEOUT: HOLD');
  const source = data(ctx.source, ['root','identity','files']);
  const seeds = data(ctx.seeds, ['root','identity','files']);
  const fixture = data(ctx.fixture, ['root','identity','files']);
  directory(source.root, source.identity); directory(seeds.root, seeds.identity);
  directory(fixture.root, fixture.identity);
  for (const a of [source.root,seeds.root,fixture.root]) {
    for (const b of [source.root,seeds.root,fixture.root]) {
      if (a === b) continue;
      const rel = relative(a, b);
      assert.ok(rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel));
    }
  }
  assert.deepEqual(readdirSync(fixture.root).sort(), ['case-1','case-2']);
  assert.equal(fixture.files.length,4);
  assert.deepEqual(fixture.files.map(p=>p.path).sort(),[
    'case-1/observer.sqlite','case-1/service.sqlite',
    'case-2/observer.sqlite','case-2/service.sqlite',
  ]);
  for(const p of fixture.files){
    assert.match(p.path,/^case-[12]\/(?:observer|service)\.sqlite$/);
    const pair=SEED_PINS[p.path.split('/')[1]];
    assert.equal(p.bytes,pair[0]);assert.equal(p.sha256,pair[1]);
  }
  assert.equal(source.files.length, 17);
  assert.equal(new Set(source.files.map(p => p.path)).size, 17);
  assert.ok(source.files.reduce((n,p) => n + p.bytes, 0) <= MAX_SOURCE_BYTES);
  const paths = source.files.map(p => p.path).sort();
  assert.deepEqual(paths, [...Object.keys(SOURCE_PINS), ENTRY].sort());
  for (const [path, [bytes, sha256]] of Object.entries(SOURCE_PINS)) {
    const p = source.files.find(p => p.path === path);
    assert.equal(p.bytes, bytes); assert.equal(p.sha256, sha256);
  }
  assert.equal(fileURLToPath(import.meta.url), childSource(source.root, ENTRY));
  const entry = data(ctx.entry, ['bytes','sha256']);
  const entryPin = source.files.find(p => p.path === ENTRY);
  assert.equal(entryPin.bytes, entry.bytes); assert.equal(entryPin.sha256, entry.sha256);
  assert.ok(entry.bytes > 0 && entry.bytes <= 49152);
  assert.equal(seeds.files.length, 2);
  assert.deepEqual(seeds.files.map(p => p.path).sort(), Object.keys(SEED_PINS).sort());
  for (const p of seeds.files) {
    const pair = SEED_PINS[p.path];
    assert.equal(p.bytes, pair[0]); assert.equal(p.sha256, pair[1]);
  }
  const guardAll = () => {
    check(); directory(source.root, source.identity); directory(seeds.root, seeds.identity);
    directory(fixture.root, fixture.identity);
    assert.deepEqual(inventory(source.root), paths);
    for (const p of source.files) {
      const bytes = pinnedBytes(childSource(source.root,p.path),p,check);
      if (p.path === 'package.json') assert.equal(JSON.parse(bytes.toString('utf8')).type,'module');
    }
    assert.deepEqual(readdirSync(seeds.root).sort(), Object.keys(SEED_PINS).sort());
    for (const p of seeds.files) pinnedBytes(join(seeds.root,p.path),p,check,[0o400n]);
    for (const p of fixture.files) {
      const file=join(fixture.root,p.path);
      directory(dirname(file));pinnedBytes(file,p,check,[0o600n]);
    }
    for(const name of ['case-1','case-2']){
      assert.deepEqual(readdirSync(join(fixture.root,name)).sort(),Object.keys(SEED_PINS).sort());
    }
  };
  guardAll();
  return { ctx, check, guardAll, sourceRoot:source.root, seedRoot:seeds.root, fixtureRoot:fixture.root };
}
function fixedError(error, code, rootModule) {
  assert.equal(error instanceof rootModule.ZenonDurableHttpCompositionError, true);
  assert.equal(error.code, code); assert.equal(error.message, code);
  assert.equal(error.name, 'ZenonDurableHttpCompositionError');
  assert.equal(error.stack, 'ZenonDurableHttpCompositionError: ' + code);
  return error;
}
function observed(promise) {
  assert.equal(Object.getPrototypeOf(promise), Promise.prototype);
  return promise.then(value => ({ok:true,value}), error => ({ok:false,error}));
}
async function unavailable(owner) {
  let body = null;
  const response = {
    destroyed:false, writableEnded:false, statusCode:0,
    setHeader() {},
    end(value) { assert.equal(this.writableEnded,false); body=Buffer.from(value); this.writableEnded=true; },
    destroy() { this.destroyed=true; },
  };
  await owner.handle(Object.freeze({}), response);
  assert.equal(response.destroyed,false); assert.equal(response.statusCode,503);
  assert.equal(body.toString('utf8'),'{"error":"service_unavailable"}');
}
function authorityFromNewFixture(path) {
  const db = new DatabaseSync(path, {
    readOnly:true, allowExtension:false, enableDoubleQuotedStringLiterals:false,
    enableForeignKeyConstraints:true, timeout:1000,
  });
  try {
    db.exec('PRAGMA trusted_schema = OFF');
    const row = db.prepare('SELECT record_key, envelope FROM zenon_funding_observer_state WHERE singleton = 1').get();
    assert.match(row.record_key,/^sha256:[a-f0-9]{64}$/);
    assert.equal(typeof row.envelope,'string');
    assert.ok(Buffer.byteLength(row.envelope) <= 65536);
    const envelope=JSON.parse(row.envelope);
    assert.equal(typeof envelope.authorityRecordText,'string');
    assert.ok(Buffer.byteLength(envelope.authorityRecordText) <= 65536);
    return { recordKey:row.record_key, authorityRecord:envelope.authorityRecordText };
  } finally { db.close(); }
}
function preparedCase(g, selection) {
  const root=join(g.fixtureRoot,'case-'+selection);
  directory(root);
  const selected=g.ctx.fixture.files.filter(p=>p.path.startsWith('case-'+selection+'/'));
  assert.equal(selected.length,2);
  for(const p of selected){
    const file=join(g.fixtureRoot,p.path);
    pinnedBytes(file,p,g.check,[0o600n]);
    const seed=join(g.seedRoot,p.path.split('/')[1]);
    assert.notEqual(lstatSync(seed,{bigint:true}).ino,lstatSync(file,{bigint:true}).ino);
    assert.equal(lstatSync(file,{bigint:true}).nlink,1n);
  }
  return root;
}
function pWithoutIdentity(p) { return {bytes:p.bytes,sha256:p.sha256}; }

export async function runCompositionCloseLatchCase(context, selection) {
  assert.ok(selection===1 || selection===2);
  assert.equal(active,false,'no overlapping native case');
  assert.equal(seen.has(selection),false,'no replay of a consumed local selection');
  seen.add(selection); active=true;
  const stores={service:null,observer:null};
  let owner=null, nativeRootClosed=false, manualCloses=0, fault=null;
  let output;
  const cleanupErrors=[];
  try {
    const g=guardContext(context,selection);
    const moduleAt=p=>pathToFileURL(childSource(g.sourceRoot,p)).href;
    const rootModule=await import(moduleAt('src/service-credit-zenon-durable-http-composition.js'));
    const serviceModule=await import(moduleAt('src/service-credit-sqlite-store.js'));
    const observerModule=await import(moduleAt('src/service-credit-zenon-funding-observer-sqlite-store.js'));
    g.guardAll();
    const caseRoot=preparedCase(g,selection);
    const authority=authorityFromNewFixture(join(caseRoot,'observer.sqlite'));
    stores.service=serviceModule.ServiceCreditSqliteStore.openExisting({
      databasePath:join(caseRoot,'service.sqlite'), allowedRoot:caseRoot,
      deriveCost:()=>2, now:()=>2000000000000,
    });
    stores.observer=observerModule.openZenonFundingObserverSqliteStore({
      databasePath:join(caseRoot,'observer.sqlite'), allowedRoot:caseRoot,
      expectedRecordKey:authority.recordKey, authorityRecord:authority.authorityRecord,
    });
    const callbacks={policy:0,clock:0,execute:0,deadline:0};
    owner=rootModule.createZenonDurableHttpComposition({
      serviceCreditStore:stores.service, fundingObserverStore:stores.observer,
      authorityRecord:authority.authorityRecord,
      deriveFundingTerms:()=>{callbacks.policy++; throw Error('UNEXPECTED_POLICY');},
      now:()=>{callbacks.clock++; return 2000000000000;},
      durableExecution:{
        ledgerId:'ledger.zenon.runtime',
        policy:{policyId:'execution.zenon.runtime',policyVersion:1,maxDurationMs:1000},
        capacity:8,selectedDurationMs:1000,
      },
      execute:()=>{callbacks.execute++; throw Error('UNEXPECTED_EXECUTION');},
      deadlineRuntime:{
        monotonicNowNs:()=>{callbacks.deadline++; return 0n;},
        schedule:()=>{callbacks.deadline++; throw Error('UNEXPECTED_SCHEDULE');},
        cancel:()=>{callbacks.deadline++; throw Error('UNEXPECTED_CANCEL');},
      },
    });
    const snapshot=()=>structuredClone({
      service:stores.service.load(), observer:stores.observer.load(),
      ledger:stores.service.getDurableExecutionSnapshot(),
    });
    const before=snapshot();
    assert.equal(before.service.state.grants.length,2);
    assert.equal(before.observer.outbox.status,'READY');
    assert.deepEqual(callbacks,{policy:0,clock:0,execute:0,deadline:0});
    let closeCalls=0;
    const close=(...args)=>{closeCalls++; return owner.close(...args);};
    if(selection===1) {
      const invalid=await observed(close('extra'));
      assert.equal(invalid.ok,false); fixedError(invalid.error,PREFIX+'INVALID_INPUT',rootModule);
      assert.deepEqual(snapshot(),before,'invalid close arguments do not mutate the stores');
      const first=close(), duplicate=close();
      assert.equal(duplicate,first,'same original successful close Promise');
      assert.deepEqual(await observed(first),{ok:true,value:undefined});
      nativeRootClosed=true;
      assert.equal(close(),first,'completed close retains its original Promise');
      assert.throws(()=>stores.service.load(),e=>e.code==='SERVICE_CREDIT_STORE_CLOSED');
      assert.throws(()=>stores.observer.load(),e=>e.code==='ZENON_FUNDING_OBSERVER_STORE_CLOSED');
      const started=await observed(owner.start({intent:{},paymentRequired:{}}));
      assert.equal(started.ok,false); fixedError(started.error,PREFIX+'CLOSED',rootModule);
      assert.equal(closeCalls,4);
    } else {
      fault=Symbol('owned synthetic boundary data');
      Object.defineProperty(stores.observer,fault,{configurable:true,value:1});
      const first=close(), result=await observed(first);
      assert.equal(result.ok,false); fixedError(result.error,PREFIX+'CLOSE_FAILED',rootModule);
      assert.deepEqual(snapshot(),before,'boundary failure closes neither actual store');
      assert.equal(Reflect.deleteProperty(stores.observer,fault),true); fault=null;
      assert.deepEqual(Reflect.ownKeys(stores.observer),[],'actual store shape is repaired');
      const again=close();
      assert.equal(again,first,'repair cannot reset a rejected close result or authorize retry');
      const againResult=await observed(again);
      assert.equal(againResult.ok,false); assert.equal(againResult.error,result.error);
      const third=close();
      assert.equal(third,first);
      assert.equal((await observed(third)).error,result.error,'same original rejection object');
      assert.deepEqual(snapshot(),before,'no second close or store mutation after repair');
      const started=await observed(owner.start({intent:{},paymentRequired:{}}));
      assert.equal(started.ok,false);
      fixedError(started.error,PREFIX+'PRE_ACTIVATION_UNAVAILABLE',rootModule);
      assert.equal(closeCalls,3);
    }
    assert.throws(()=>owner.getActiveGrantDescriptor(),
      e=>e.code===PREFIX+'ACTIVATED_UNAVAILABLE');
    await unavailable(owner);
    assert.deepEqual(callbacks,{policy:0,clock:0,execute:0,deadline:0});
    if(!nativeRootClosed) {
      assert.equal(stores.observer.close(),undefined); manualCloses++;
      assert.equal(stores.service.close(),undefined); manualCloses++;
    }
    for(const p of g.ctx.seeds.files) pinnedBytes(join(caseRoot,p.path),pWithoutIdentity(p),g.check,[0o600n]);
    assert.deepEqual(readdirSync(caseRoot).sort(),Object.keys(SEED_PINS).sort());
    g.guardAll();
    output=Object.freeze({
      kind:'P0A_COMPOSITION_CLOSE_LATCH',selection,status:'ASSERTIONS_COMPLETED',
      scenario:selection===1?'NEW_VALID_CLOSE':'BOUNDARY_FAULT_REPAIRED_NO_RETRY',
      rootCloseCalls:closeCalls,manualStoreCloses:manualCloses,
      rawSeedBytesPreserved:true,newSqliteFixtures:2,
      fixtureInitialization:'EXPLICIT_REGISTERED_BYTE_IMAGE_COPY',sourceFiles:17,
      newKeyPairs:0,newProviderSignatures:0,newCapabilitySignatures:0,
      fundingStarts:0,applicationExecutions:0,networkCalls:0,
      originalClosePromiseRetained:true,originalRejectionRetained:selection===2,
      candidateSha256:CANDIDATE_SHA,
      qualification:'SYNTHETIC_BEFORE_START_ROOT_ONLY',
    });
  } catch(error) {
    cleanupErrors.push(error);
  } finally {
    if(fault!==null && stores.observer!==null) Reflect.deleteProperty(stores.observer,fault);
    if(output===undefined) {
      for(const store of [stores.observer,stores.service]) {
        if(store!==null) { try {store.close();}catch(error){cleanupErrors.push(error);} }
      }
    }
    active=false;
  }
  if(cleanupErrors.length===1) throw cleanupErrors[0];
  if(cleanupErrors.length>1) throw new AggregateError(cleanupErrors,
    'CASE_AND_CLOSE_FAILURE: HOLD',{cause:cleanupErrors[0]});
  return output;
}
