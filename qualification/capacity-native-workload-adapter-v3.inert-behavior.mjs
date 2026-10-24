import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeCapacityWorkloadAdapter as create } from './capacity-native-workload-adapter-v3.draft.mjs';

// Inert admission only. Never call run()/stop() with valid arity: those methods
// enter REAL native timers/pairs and require separate finite native approval.
// No fake namespace getter, process factory, SDK or SQL substitute is installed.
import { createNativeCapacityServiceWindowOwner as createWindow } from './capacity-native-service-window-v3.owner.draft.mjs';
if(process.version!=='v24.19.0'||process.env.X402_CAPACITY_WINDOW_INERT_SELECTION!=='full-windowed-native-inert-v3')
  throw new TypeError('CAPACITY_WINDOW_INERT_SELECTION_REQUIRED');
console.log('# full-windowed-native-INERT '+JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,nativeEffects:false}));
const F = Object.freeze;
function config() {
  return { context: { runId: '1'.repeat(64) }, plan: { warmupCallsPerLane: 1, measurementCallsPerLane: 2,
    setupBudgetMs: 500, measurementWindowMs: 100, drainGraceMs: 10, maxLedgerTransactionsPerOperation: 3 },
    recordingLimits: { maxSamplesPerPhase: 128, maxInFlightPerPhase: 4 },
    laneProfiles: F([F({ laneId: 'lane.one', payerProfile: F({ path: '/synthetic-payer-profile.json', sha256: 'a'.repeat(64) }),
      serviceProfile: F({ path: '/synthetic-service-profile.json', sha256: 'b'.repeat(64) }) })]),
    payeeAddress: 'z1' + 'q'.repeat(38), commandBudgetMs: 1000, closeBudgetMs: 6000 };
}

test('actual hardwired adapter constructs without native pair acquisition or runtime entry', () => {
  const owner = create(config()), s = owner.inspect();
  assert.equal(s.runRequested, false); assert.equal(s.core.phase, 'CREATED');
  assert.equal(s.pairAcquisitionsEntered, 0); assert.equal(s.pairHandlesCaptured, 0);
  assert.equal(s.nativeResourcesQualified, false); assert.equal(s.authority, 'NONE'); assert.equal(Object.isFrozen(owner), true);
});

test('inert public metadata and empty private evidence contain no profile paths', () => {
  const owner = create(config()); assert.equal(JSON.stringify(owner.inspect()).includes('synthetic-payer'), false);
  const rows = owner.privateEvidence(); assert.equal(rows.length, 1); assert.equal(rows[0].privateStreams.length, 0);
  assert.equal(rows[0].payerOperationTimings.length, 0); assert.equal(rows[0].serviceWriterIntervals.length, 0);
  assert.equal(JSON.stringify(rows).includes('/synthetic'), false);
});

test('closed adapter configuration cannot inject worker clock SDK SQL or process factories', () => {
  for (const name of ['createPair', 'runtime', 'SDK', 'Sqlite', 'fork']) {
    const c = config(); c[name] = () => { throw new Error('unreachable'); }; assert.throws(() => create(c));
  }
});

test('inert adapter rejects getters and proxies without invoking hooks', () => {
  let calls = 0; const c = config();
  Object.defineProperty(c, 'laneProfiles', { enumerable: true, get() { calls++; throw new Error('unreachable'); } });
  assert.throws(() => create(c)); assert.throws(() => create(new Proxy(config(), { getPrototypeOf() { calls++; return Object.prototype; } })));
  const d = config(); d.laneProfiles = new Proxy(d.laneProfiles, { getPrototypeOf() { calls++; return Array.prototype; } });
  assert.throws(() => create(d)); assert.equal(calls, 0);
});

test('inert adapter rejects aliased lanes and role-profile paths or digests', () => {
  for (const kind of ['lane', 'path', 'digest']) {
    const c = config(), first = c.laneProfiles[0];
    const second = F({ laneId: kind === 'lane' ? first.laneId : 'lane.two',
      payerProfile: F({ path: kind === 'path' ? first.payerProfile.path : '/synthetic-payer-2.json',
        sha256: kind === 'digest' ? first.payerProfile.sha256 : 'c'.repeat(64) }),
      serviceProfile: F({ path: '/synthetic-service-2.json', sha256: 'd'.repeat(64) }) });
    c.laneProfiles = F([first, second]); assert.throws(() => create(c));
  }
});

test('inert native plan remains bounded and core recording capacity cannot be silently expanded', () => {
  for (const edit of [{ warmupCallsPerLane: 255, measurementCallsPerLane: 2 }, { drainGraceMs: 1001 },
    { measurementWindowMs: 0 }, { maxLedgerTransactionsPerOperation: 17 }]) {
    const c = config(); Object.assign(c.plan, edit); assert.throws(() => create(c));
  }
  const c = config(); c.recordingLimits.maxSamplesPerPhase = 1; assert.throws(() => create(c));
});

test('public arity rejection keeps the real native run and stop paths unentered', async () => {
  const owner = create(config());
  await assert.rejects(owner.run('extra')); await assert.rejects(owner.stop('extra'));
  assert.throws(() => owner.inspect('extra')); assert.throws(() => owner.privateEvidence('extra')); assert.throws(() => create(config(), 'extra'));
  assert.equal(owner.inspect().runRequested, false); assert.equal(owner.inspect().pairAcquisitionsEntered, 0);
});


const windowContext=F({runId:'1'.repeat(64),laneId:'declared.inert',sourceRowsSha256:'2'.repeat(64)});
function windowConfig(edit={}){return F({context:windowContext,totalCalls:3,...edit});}
test('actual service clock owner constructs and snapshots without reading the real clock or namespace',()=>{
  const owner=createWindow(windowConfig()),s=owner.snapshot();
  assert.equal(s.phase,'NOT_OPEN');assert.equal(s.clockReads,0);assert.equal(s.startNs,null);
  assert.equal(s.stopNs,null);assert.equal(s.stopCause,null);assert.equal(s.unknown,false);
  assert.equal(s.clockDomain,'SERVICE_CHILD_LOCAL');assert.equal(Object.isFrozen(owner),true);assert.equal(Object.isFrozen(s),true);
  assert.equal(Object.getOwnPropertyDescriptor(globalThis,'getPinnedNativeCapacityServiceLaneNamespaceSnapshotV3'),undefined);
});
test('actual clock owner cannot accept an injected clock timer getter process or store',()=>{
  for(const name of ['clock','now','runtime','namespaceGetter','process','store','SDK']){
    const c=F({...windowConfig(),[name]:F(()=>{throw new Error('unreachable');})});assert.throws(()=>createWindow(c));
  }
});
test('actual clock owner rejects configuration and context accessors without evaluating them',()=>{
  let hooks=0;
  for(const c of [F({get context(){hooks++;return windowContext;},totalCalls:3}),
    windowConfig({context:F({...windowContext,get runId(){hooks++;return '1'.repeat(64);}})}),
    new Proxy(windowConfig(),{getPrototypeOf(){hooks++;return Object.prototype;}})])
    assert.throws(()=>createWindow(c));
  assert.equal(hooks,0);
});
test('actual clock owner finite source budget rejects coercion negative zero and overlarge plans',()=>{
  let hooks=0;
  for(const totalCalls of [0,-0,257,1.5,'3',{valueOf(){hooks++;return 3;}}])
    assert.throws(()=>createWindow(windowConfig({totalCalls})));
  assert.equal(hooks,0);
});
test('actual clock owner configuration is closed frozen DATA and does not retain mutable caller fields',()=>{
  assert.throws(()=>createWindow({...windowConfig()}));
  assert.throws(()=>createWindow(windowConfig({context:{...windowContext}})));
  assert.throws(()=>createWindow(windowConfig({context:F({...windowContext,extra:1})})));
  assert.throws(()=>createWindow(windowConfig(),'extra'));
});
test('actual clock owner invalid marker arity never enters valid native admission or reads the clock',()=>{
  for(const method of ['open','stop','timestamp','closeFallback']){
    const owner=createWindow(windowConfig());
    assert.throws(()=>owner[method]('extra'));const s=owner.snapshot();
    assert.equal(s.clockReads,0);assert.equal(s.startNs,null);assert.equal(s.stopNs,null);
    assert.equal(s.unknown,true);assert.equal(s.phase,'NOT_OPEN');
  }
});
test('actual clock owner snapshot arity is inert and cannot forge OPEN or STOP state',()=>{
  const owner=createWindow(windowConfig());assert.throws(()=>owner.snapshot('extra'));
  assert.equal(owner.snapshot().unknown,false);assert.equal(owner.snapshot().phase,'NOT_OPEN');
});
test('actual clock owner does not expose timestamp mutation or raw override methods',()=>{
  const owner=createWindow(windowConfig());
  assert.deepEqual(Object.keys(owner),['timestamp','open','stop','closeFallback','snapshot']);
  for(const fn of Object.values(owner))assert.equal(Object.isFrozen(fn),true);
  assert.throws(()=>Object.defineProperty(owner,'open',{value:()=>undefined}));
  assert.equal(owner.snapshot().clockReads,0);
});
test('native adapter V3 requires genuine window capabilities without entering them on construction',()=>{
  const owner=create(config()),s=owner.inspect();
  assert.equal(s.core.pendingWindowStarts,0);assert.equal(s.core.pendingWindowStops,0);
  assert.equal(s.core.windowOpenBarrierPending,false);
  assert.equal(owner.privateEvidence()[0].serviceMeasurementWindow,null);
  assert.deepEqual(owner.privateEvidence()[0].serviceWriterAttribution,[]);
  assert.equal(Object.isFrozen(owner.privateEvidence()[0].serviceWriterAttribution),true);
  assert.equal(s.pairHandlesCaptured,0);
});
test('native worker and preloader namespace are never replaced by the inert tests',()=>{
  for(const role of ['PayerLane','ServiceLane','Supervisor'])
    assert.equal(Object.getOwnPropertyDescriptor(globalThis,'getPinnedNativeCapacity'+role+'NamespaceSnapshotV3'),undefined);
  // Valid native run/stop/open/timestamp calls are deliberately NOT made.
});

test('private parent timing capability refuses before finalization without reading a native clock',()=>{
  const owner=create(config());assert.equal(Object.isFrozen(owner.privateParentTimingEvidence),true);
  assert.throws(()=>owner.privateParentTimingEvidence());
  const s=owner.inspect();assert.equal(s.runRequested,false);assert.equal(s.pairAcquisitionsEntered,0);
  assert.equal(s.core.phase,'CREATED');assert.equal(s.core.held,false);
});
test('private parent timing arity rejection cannot enter a native run or expose a profile',()=>{
  const owner=create(config());assert.throws(()=>owner.privateParentTimingEvidence('extra'));
  assert.equal(owner.inspect().runRequested,false);assert.equal(owner.inspect().pairHandlesCaptured,0);
  assert.equal(JSON.stringify(owner.inspect()).includes('/synthetic'),false);
});

