/*
 * SOURCE DRAFT V2: bounded source-operation diagnostics, NOT RUN.
 * Preserve the frozen V1 child and its actual failures. Same real issued x402/HTTPS/DP/V6 funding seed, committed service
 * cutpoint and a separate no-dispatch recovery process. NOT RUN; no native
 * allowance is implied by a profile/selection flag. The complete current
 * namespace and managed parent launcher must be admitted first.
 * Seed keeps actual app/RPC/SQL/socket owners OPEN at the selected cutpoint.
 * An existing native store afterCommit hook blocks BEFORE the service response.
 * No same-store callback reentry, module alias, fabricated BOUND/grant or smaller
 * SQLite-only substitute is used. All chain/settlement callbacks remain declared
 * synthetic evidence. SIGKILL/SQLite recovery is not power-loss durability.
 */
const E=process.env;
if(process.version!=='v24.19.0'||process.platform!=='darwin'||process.arch!=='arm64'
    ||process.argv.length!==4||process.argv[2]!==E.SPV_TASK_SCRATCH||!['seed','recover'].includes(process.argv[3])
    ||E.X402_RECOVERY_CRASH_CHILD_SELECTION!=='one-owned-committed-intent-source-draft'
    ||E.X402_ISSUED_NATIVE_VERTICAL_SELECTION!=='current-native-issued-post-source-draft-v1'
    ||E.X402_RECOVERY_CRASH_DIAGNOSTIC_SELECTION!=='full-committed-child-v2-source-draft'
    ||typeof process.send!=='function'||process.connected!==true
    ||E.NODE_DISABLE_COMPILE_CACHE!=='1'||E.NODE_OPTIONS!==undefined||E.NODE_PATH!==undefined
    ||E.NODE_TEST_CONTEXT!==undefined||E.NODE_V8_COVERAGE!==undefined
    ||!process.execArgv.some(v=>v.startsWith('--import=')))throw new TypeError('RECOVERY_CRASH_CHILD_NOT_ADMITTED');
const [
  {default:assert},{Buffer},crypto,fs,path,net,https,{DatabaseSync},
  {canonicalJson},checkpoint,
  {getPinnedRecoveryCrashNamespaceSnapshotV2:NAMESPACE},
  {createNativeQualificationOperationDiagnostics:CREATE_DIAGNOSTICS},
]=await Promise.all([
  import('node:assert/strict'),import('node:buffer'),import('node:crypto'),import('node:fs'),import('node:path'),
  import('node:net'),import('node:https'),import('node:sqlite'),import('../src/canonical.js'),
  import('../src/service-credit-pilot-original-payment-checkpoint.js'),
  import('./recovery-crash-full-namespace-v2.preload.draft.mjs'),
  import('../src/native-qualification-operation-diagnostics.js'),
]);
let ed=null,sha512=null,wire=null,capability=null,deriveZenonUserSendWorkInput=null;
let CREATE_V6=null,CLIENT=null,APPLICATION=null,NATIVE_FACTORY=null,GRANTS=null,RPC=null,DRAIN=null;
async function loadSeedModules(){
  [
    ed,{sha512},wire,capability,{deriveZenonUserSendWorkInput},
    {createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6:CREATE_V6},
    {openZenonDynamicPlasmaNativeFundingServiceClientForLocalQualification:CLIENT},
    {createOfficialIssuedFundingPostNativeApplication:APPLICATION},
    {createServiceCreditBoundedNodeHttpsServerFactory:NATIVE_FACTORY},
    {createNativeIssuedFundingPostCrashGrantOperatorFixture:GRANTS},
    {createNativeIssuedFundingPostRpcPeerFixture:RPC},
    {observeServiceCreditOperationDrain:DRAIN},
  ]=await Promise.all([
    import('@noble/ed25519'),import('@noble/hashes/sha2'),import('../src/x402-wire.js'),
    import('../src/service-credit-capability.js'),import('../src/zenon/dynamic-plasma-user-send-work-input.js'),
    import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js'),
    import('../src/zenon/dynamic-plasma-native-funding-service-client.js'),
    import('../src/x402-official-issued-funding-post-native-application.js'),
    import('../src/service-credit-bounded-node-https-server-factory.js'),
    import('./issued-funding-post-native-crash-grant-operator.fixture.draft.mjs'),
    import('./issued-funding-post-native-rpc-peer.fixture.draft.mjs'),
    import('../src/service-credit-bounded-operation-drain.js'),
  ]);
}
const F = Object.freeze, ROOT = process.argv[2], MODE = process.argv[3];
const DIAGNOSTIC=CREATE_DIAGNOSTICS();DIAGNOSTIC.mark('BOOT');
const ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx', ZERO = '0'.repeat(64);
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const CHAIN = F({ version: 1, chainIdentifier: '73404', genesisMomentumHash: '11'.repeat(32) });
const retained = { portOwner: null, grantOperator: null, rpc: null, app: null, client: null,
  initialV6: null, clientOpening: false, appOpening: false, walletKey: null, capabilities: [],
  raw: new Set(), nativeClosePromises: [], held: false, cleanupFailures: 0 };
const counts = { walletKeys: 0, walletAddresses: 0, walletSignatures: 0, capabilityKeys: 0,
  capabilitySignatures: 0, referenceCandidates: 0, referenceWindows: 0, independentPinFiles: 0,
  verify: 0, firstSettle: 0, pendingObserve: 0, executions: 0, rawClientStarts: 0,
  rawAuthenticated: 0, rawCleanCloses: 0, originalClientRepeatRefusals: 0, backendExactReplays: 0,
  foreignGrantRefusals: 0, sameFileInitialCloses: 0, borrowedSqlCloses: 0 };
const ingressTimers = new Set(), serviceTimers = new Set();
let tlsKey = null, certificate = null, signedOriginal = null, signedOriginalText = null;
let originalPacketText = null, officialTuple = null, clientClose = null;

function rootIdentity() {
  assert.ok(path.isAbsolute(ROOT) && path.resolve(ROOT) === ROOT);
  for (let at = ROOT; ; at = path.dirname(at)) {
    assert.equal(fs.lstatSync(at).isSymbolicLink(), false);
    if (path.dirname(at) === at) break;
  }
  const s = fs.lstatSync(ROOT, { bigint: true });
  assert.ok(s.isDirectory()); assert.equal(s.uid, BigInt(process.getuid()));
  assert.equal(s.mode & 0o7777n, 0o700n);
  return [s.dev, s.ino, s.uid, s.mode].map(String).join(':');
}
const ROOT_ID = rootIdentity();
function stillRoot() { assert.equal(rootIdentity(), ROOT_ID); }
function privateIdentity(file, cap = 4194304) {
  stillRoot(); assert.equal(path.dirname(file), ROOT);
  const s = fs.lstatSync(file, { bigint: true });
  assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.uid, BigInt(process.getuid()));
  assert.equal(s.mode & 0o7777n, 0o600n); assert.equal(s.nlink, 1n);
  assert.ok(s.size >= 0n && s.size <= BigInt(cap));
  return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink].map(String).join(':');
}
function readPrivate(name, cap) {
  const file = path.join(ROOT, name), id = privateIdentity(file, cap);
  const before = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const identity = s => [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String);
  try {
    assert.deepEqual(identity(fs.fstatSync(fd, { bigint: true })), identity(before));
    const bytes = Buffer.alloc(Number(before.size) + 1); let size = 0;
    while (size < bytes.length) { const n = fs.readSync(fd, bytes, size, bytes.length - size, null); if (!n) break; size += n; }
    assert.equal(size, Number(before.size)); assert.ok(size > 0);
    assert.deepEqual(identity(fs.fstatSync(fd, { bigint: true })), identity(before));
    assert.deepEqual(identity(fs.lstatSync(file, { bigint: true })), identity(before));
    assert.equal(privateIdentity(file, cap), id); return bytes.subarray(0, size);
  } finally { fs.closeSync(fd); }
}
function retainJson(name, value) {
  assert.ok(++counts.independentPinFiles <= 2); stillRoot();
  const file = path.join(ROOT, name), raw = Buffer.from(JSON.stringify(value));
  assert.ok(raw.length <= 65536);
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, raw); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const reread = readPrivate(name, 65536); assert.ok(reread.equals(raw));
  return JSON.parse(reread.toString('utf8')); // Never derive independent originals from SQLite.
}
function scheduleInto(set, callback, delayMs) {
  assert.equal(typeof callback, 'function'); assert.ok(Number.isFinite(delayMs) && delayMs >= 0 && delayMs <= 60000);
  const token = setTimeout(() => { set.delete(token); callback(); }, delayMs);
  set.add(token); return token;
}
const ingressRuntime = F({
  schedule: F(function schedule(callback, ms) { return scheduleInto(ingressTimers, callback, ms); }),
  cancel: F(function cancel(token) { clearTimeout(token); ingressTimers.delete(token); return true; }),
});
const serviceRuntime = F({
  monotonicNowNs: F(function monotonicNowNs() { return process.hrtime.bigint(); }),
  schedule: F(function schedule(callback, ms) { return scheduleInto(serviceTimers, callback, ms); }),
  cancel: F(function cancel(token) { clearTimeout(token); serviceTimers.delete(token); return undefined; }),
}); // Actual distinct contracts: ingress cancel=true; durable-service cancel=undefined.

async function reserveThenReleasePort() {
  let fault = false, closeCallback = false, closeEvent = false, listening = false;
  const server = net.createServer(socket => { fault = true; socket.destroy(); });
  const slot = { server, closePromise: null, stop: null };
  slot.stop = function stop() {
    if (slot.closePromise !== null) return slot.closePromise;
    let yes, no;
    slot.closePromise = new Promise((resolve, reject) => { yes = resolve; no = reject; });
    slot.closePromise.catch(() => undefined); // Cache BEFORE the native call.
    try { server.close(error => { if (error) fault = true; closeCallback = true; }); }
    catch { fault = true; }
    DRAIN(F(() => fault ? 'UNKNOWN' : closeCallback && closeEvent && !server.listening ? 'DRAINED' : 'BUSY'), 1000)
      .then(clean => clean ? yes(undefined) : no(new Error('NATIVE_ISSUED_PORT_CLOSE_UNKNOWN')), no);
    return slot.closePromise;
  };
  retained.portOwner = slot; server.on('error', () => { fault = true; });
  server.once('close', () => { closeEvent = true; });
  const started = new Promise((yes, no) => { server.once('listening', () => { listening = true; yes(); }); server.once('error', no); });
  started.catch(() => undefined);
  server.listen({ host: '127.0.0.1', port: 0, exclusive: true });
  assert.equal(await DRAIN(F(() => fault ? 'UNKNOWN' : listening ? 'DRAINED' : 'BUSY'), 1000), true);
  await started;
  const address = server.address(); assert.equal(address.address, '127.0.0.1');
  assert.ok(Number.isSafeInteger(address.port) && address.port >= 1024 && address.port <= 65535);
  assert.equal(await slot.stop(), undefined);
  retained.portOwner = null; return address.port; // A rebind race MUST refuse; no port retry/fallback.
}

async function nativePost(resourceUrl, extraHeaders = {}) {
  assert.ok(++counts.rawClientStarts <= 3); stillRoot();
  const u = new URL(resourceUrl);
  assert.equal(u.hostname, '127.0.0.1'); assert.equal(u.protocol, 'https:');
  assert.equal(u.search, ''); assert.equal(u.hash, ''); assert.equal(u.username, ''); assert.equal(u.password, '');
  assert.ok(['/funding', '/service-credit/v1/execute'].includes(u.pathname));
  const cell = { request: null, response: null, socket: null, authenticated: false,
    requestClosed: false, responseEnded: false, responseClosed: false, socketClosed: false,
    responseComplete: false, fault: false, timer: null, status: null, headers: null, body: null };
  retained.raw.add(cell); const chunks = []; let bytes = 0;
  function bad() { cell.fault = true; retained.held = true; }
  try {
    const request = https.request({ protocol: 'https:', hostname: '127.0.0.1', family: 4,
      port: Number(u.port), path: u.pathname, method: 'POST', agent: false, ca: certificate,
      rejectUnauthorized: true, servername: '', minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ALPNProtocols: ['http/1.1'],
      maxHeaderSize: 8192, insecureHTTPParser: false,
      headers: { Host: u.host, Connection: 'close', Accept: 'application/json', 'Content-Length': '0', ...extraHeaders },
    }, response => {
      cell.response = response; cell.status = response.statusCode; cell.headers = response.headers;
      response.on('error', bad); response.once('aborted', bad);
      response.once('close', () => { cell.responseClosed = true; });
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 16384) { bad(); response.destroy(); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.once('end', () => {
        cell.responseComplete = response.complete === true; cell.responseEnded = true;
        cell.body = Buffer.concat(chunks, bytes).toString('utf8');
      });
    });
    cell.request = request; request.on('error', bad);
    request.once('close', () => { cell.requestClosed = true; });
    request.once('socket', socket => {
      cell.socket = socket; socket.on('error', bad);
      socket.once('close', () => { cell.socketClosed = true; });
      socket.once('secureConnect', () => {
        try {
          assert.equal(socket.authorized, true); assert.equal(socket.remoteAddress, '127.0.0.1');
          assert.equal(socket.getProtocol(), 'TLSv1.3'); assert.equal(socket.alpnProtocol, 'http/1.1');
          assert.equal(socket.isSessionReused(), false); cell.authenticated = true; counts.rawAuthenticated++;
        } catch { bad(); request.destroy(); }
      });
    });
    cell.timer = setTimeout(() => { bad(); request.destroy(); }, 2000);
    request.end();
    const drained = await DRAIN(F(function realNativeEvents() {
      if (cell.fault) return 'UNKNOWN';
      return cell.authenticated && cell.requestClosed && cell.responseEnded && cell.responseClosed
        && cell.responseComplete && cell.socketClosed ? 'DRAINED' : 'BUSY';
    }), 1000);
    assert.equal(drained, true); assert.equal(cell.fault, false);
    clearTimeout(cell.timer); cell.timer = null; retained.raw.delete(cell); counts.rawCleanCloses++;
    return F({ status: cell.status, headers: cell.headers, body: cell.body });
  } catch (error) {
    bad(); if (cell.timer !== null) { clearTimeout(cell.timer); cell.timer = null; }
    // Failure-only stop is not clean native release. Keep every handle/evidence.
    try { cell.request?.destroy(); } catch { /* remains HELD */ }
    throw error;
  }
}

function address(core) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = []; let bits = 0, acc = 0, checksum = 1;
  for (const byte of core) { acc = (acc << 8) | byte; bits += 8; while (bits >= 5) { bits -= 5; words.push((acc >>> bits) & 31); } }
  assert.equal(bits, 0);
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [i, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries())
      if ((top >>> i) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(v => alphabet[v]).join('')
    + Array.from({ length: 6 }, (_, i) => alphabet[(checksum >>> (5 * (5 - i))) & 31]).join('');
}
function capabilityKey() {
  assert.ok(++counts.capabilityKeys <= 2); const pair = crypto.generateKeyPairSync('ed25519');
  retained.capabilities.push(pair);
  const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');
  return { privateKey: pair.privateKey, publicKey,
    commitment: capability.deriveServiceCreditCapabilityCommitment({ publicKey }) };
}
function serviceOriginal(grant, key, requestId, serviceResourceUrl) {
  assert.ok(++counts.capabilitySignatures <= 3);
  // This exact property order is the original-request custody JSON contract.
  const request = { modelVersion: 1, grantId: grant.grantId, requestId, method: 'POST',
    routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY, selectedContentType: 'application/json', maxCostUnits: 2 };
  const proof = { proofVersion: 1, grantId: grant.grantId, requestId, publicKey: key.publicKey, maxCostUnits: 2,
    signature: crypto.sign(null, capability.createServiceCreditCapabilitySigningBytes(request), key.privateKey).toString('base64url') };
  assert.equal(capability.verifyServiceCreditCapability({ grant: { grantId: grant.grantId,
    capabilityCommitment: grant.capabilityCommitment }, request, proof }).verified, true);
  return { grantId: grant.grantId, requestId, originalRequestJson: JSON.stringify(request), originalBodyBase64: '', serviceResourceUrl,
    authorizationHeader: 'ServiceCredit ' + Buffer.from(canonicalJson(proof)).toString('base64url') };
}
function reference(subject) {
  const { subjectVersion, ...block } = subject; assert.equal(subjectVersion, 1);
  const work = deriveZenonUserSendWorkInput({ ...block, hash: ZERO, fusedPlasma: 25409, difficulty: 3000,
    nonce: '0000000000000000', publicKey: '', signature: '' });
  const message = Buffer.alloc(40); Buffer.from(work.dataHash, 'hex').copy(message, 8);
  const threshold = (1n << 64n) - (1n << 64n) / 3000n;
  for (let window = 0n; window < 8n; window++) {
    assert.ok(++counts.referenceWindows <= 8);
    for (let offset = 0n; offset < 4096n; offset++) {
      const nonce = window * 4096n + offset; assert.ok(++counts.referenceCandidates <= 32768);
      message.writeBigUInt64LE(nonce);
      if (crypto.createHash('sha3-256').update(message).digest().readBigUInt64LE(0) >= threshold) {
        const start = Buffer.alloc(8), found = Buffer.alloc(8); start.writeBigUInt64LE(window * 4096n); found.writeBigUInt64LE(nonce);
        return F({ startNonce: start.toString('hex'), nonce: found.toString('hex') });
      }
    }
  }
  throw new Error('NATIVE_ISSUED_REFERENCE_EXHAUSTED_NO_REKEY_OR_NEW_RANGE');
}
function untouched(packet) {
  assert.equal(JSON.stringify(packet), originalPacketText); assert.equal(JSON.stringify(signedOriginal), signedOriginalText);
  assert.equal(signedOriginal.hash, packet.transactionHash); assert.equal(counts.walletSignatures, 1);
}
function expectCredit(operator, primaryId, foreignId, spent) {
  const primary = operator.serviceStore.getGrant(primaryId), foreign = operator.serviceStore.getGrant(foreignId);
  assert.equal(primary.availableUnits, 10 - spent); assert.equal(primary.heldUnits, 0); assert.equal(primary.consumedUnits, spent);
  assert.equal(foreign.availableUnits, 10); assert.equal(foreign.heldUnits, 0); assert.equal(foreign.consumedUnits, 0);
}
function sdkTuple(args, packet) {
  assert.equal(args.length, 3); assert.ok(packet !== null);
  const [payload, requirements] = args;
  assert.equal(payload.payload.transaction.hash, packet.transactionHash);
  assert.equal(canonicalJson(requirements), canonicalJson(packet.pair.challenge.paymentRequired.accepts[0]));
  const text = canonicalJson({ payload, requirements });
  if (officialTuple === null) officialTuple = text; else assert.equal(text, officialTuple);
}
function settled(payload, requirements, success) {
  return { success, ...(success ? { payer: payload.payload.transaction.address } : { errorReason: 'settlement_pending' }),
    transaction: payload.payload.transaction.hash, network: requirements.network,
    publicationStatus: success ? 'ACKNOWLEDGED' : 'UNKNOWN' }; // Declared local callback result, NOT publication evidence.
}

async function stopOwnersAfterFailure() {
  retained.held = true;
  if (retained.portOwner !== null) {
    try { const p = retained.portOwner.stop(); retained.nativeClosePromises.push(p); p.catch(() => undefined); }
    catch { retained.cleanupFailures++; }
  }
  // Independent actual stop attempts; a rejection never skips the other owner.
  for (const owner of [retained.client, retained.app, retained.rpc]) {
    if (owner === null) continue;
    try {
      const p = owner.close(); retained.nativeClosePromises.push(p);
      p.catch(() => undefined);
    } catch { retained.cleanupFailures++; }
  }
  const outcomes = retained.nativeClosePromises.map(p => { const cell = { done: false }; p.then(() => { cell.done = true; }, () => { cell.done = true; }); return cell; });
  await DRAIN(F(() => outcomes.every(cell => cell.done) ? 'DRAINED' : 'BUSY'), 1000);
  // No direct close/reopen of V6, no SQL-owner force close, file deletion,
  // timer-set clearing, root adoption or fabricated success after uncertainty.
}


const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const PRINCIPAL=['native-issued-service.sqlite','native-issued-payer-v6.sqlite'];
let context=null,fixedFunding=null,fixedService=null,serviceSummary=null,seedNowEpochMs=null;
let waiter=null,readonlyOpens=0,cutpointArmed=false,cutpointEntries=0;
process.on('message',message=>{
  if(message===null||typeof message!=='object'||Array.isArray(message)
      ||Buffer.byteLength(JSON.stringify(message))>65536||waiter===null)throw new TypeError('RECOVERY_CRASH_UNEXPECTED_IPC');
  const current=waiter;waiter=null;clearTimeout(current.timer);
  if(message.kind!==current.kind){current.reject(new TypeError('RECOVERY_CRASH_WRONG_IPC'));return;}
  current.resolve(message);
});
function waitParent(kind){
  assert.equal(waiter,null);
  const promise=new Promise((resolve,reject)=>{
    const current={kind,resolve,reject,timer:null};waiter=current;
    current.timer=setTimeout(()=>{if(waiter===current)waiter=null;reject(new TypeError('RECOVERY_CRASH_IPC_TIMEOUT'));},5000);
  });
  promise.catch(()=>undefined);return promise;
}
function sendNative(message){
  assert.equal(process.connected,true);
  return new Promise((yes,no)=>process.send(message,error=>error?no(new TypeError('RECOVERY_CRASH_IPC_SEND_FAILED')):yes(undefined)));
}
function messageBase(event){
  return {protocolVersion:2,event,runId:context.runId,sourceRowsSha256:context.sourceRowsSha256,pid:process.pid};
}
function exactInput(value,fields){
  assert.ok(value!==null&&typeof value==='object'&&!Array.isArray(value));
  assert.equal(Object.getPrototypeOf(value),Object.prototype);
  assert.deepEqual(Object.keys(value),fields);
  return value;
}
function identityParts(name){return privateIdentity(path.join(ROOT,name)).split(':');}
function readonlyFile(name,work){
  assert.ok(PRINCIPAL.includes(name));assert.ok(++readonlyOpens<=4);const id=identityParts(name);
  const database=new DatabaseSync(path.join(ROOT,name),{readOnly:true,allowExtension:false,
    enableDoubleQuotedStringLiterals:false,enableForeignKeyConstraints:true,timeout:0});
  try{return work(database);}finally{database.close();assert.deepEqual(identityParts(name),id);}
}
function nativeRows(){
  const backend=readonlyFile(PRINCIPAL[0],db=>{
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,2);
    const rows=db.prepare('SELECT singleton,envelope FROM service_credit_ledger ORDER BY singleton').all();
    assert.equal(rows.length,1);assert.equal(rows[0].singleton,1);assert.ok(Buffer.byteLength(rows[0].envelope)<=1048576);
    return {text:rows[0].envelope,value:JSON.parse(rows[0].envelope)};
  });
  const payer=readonlyFile(PRINCIPAL[1],db=>{
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);
    assert.equal(db.prepare('PRAGMA application_id').get().application_id,0x5a505252);
    const metadata=db.prepare('SELECT * FROM payer_recovery_meta ORDER BY singleton').all();
    assert.equal(metadata.length,1);assert.equal(metadata[0].singleton,1);
    const names=['payer_recovery_state','original_payment_checkpoint','original_service_requests',
      'original_dispatch_intents','original_response_observations','original_custody_quarantines','original_request_custody_policy'];
    const result={metadata};
    for(const name of names){
      const rows=db.prepare('SELECT * FROM '+name).all();assert.ok(rows.length<=8);result[name]=rows;
    }
    return result;
  });
  return {backend,payer};
}
function assertOriginalRows(rows,funding,service,completed,quarantined){
  const p=rows.payer;
  assert.equal(p.payer_recovery_state.length,1);assert.equal(p.original_payment_checkpoint.length,1);
  assert.equal(p.original_payment_checkpoint[0].envelope,funding.serializedCheckpoint);
  const fundingState=JSON.parse(p.payer_recovery_state[0].envelope);
  assert.equal(fundingState.paymentHeader,funding.paymentSignatureHeader);
  assert.equal(fundingState.challengeHeader,funding.paymentRequiredHeader);
  assert.equal(p.original_service_requests.length,completed?1:0);
  assert.equal(p.original_dispatch_intents.length,completed?1:0);
  assert.equal(p.original_response_observations.length,0);
  assert.equal(p.original_custody_quarantines.length,quarantined?1:0);
  assert.equal(rows.backend.value.physicalVersion,2);
  const ledger=rows.backend.value.ledgerState,executions=rows.backend.value.executionState.executions;
  assert.equal(ledger.requests.length,completed?1:0);assert.equal(executions.length,completed?1:0);
  assert.equal(ledger.grants.length,2);
  const primary=ledger.grants.find(g=>g.grantId===service.grantId);
  assert.ok(primary);assert.equal(primary.totalUnits,10);assert.equal(primary.heldUnits,0);
  assert.equal(primary.consumedUnits,completed?2:0);assert.equal(primary.availableUnits,completed?8:10);
  const foreign=ledger.grants.find(g=>g.grantId!==service.grantId);
  assert.ok(foreign);assert.equal(foreign.consumedUnits,0);assert.equal(foreign.availableUnits,10);
  if(completed){
    const original=JSON.parse(p.original_service_requests[0].envelope),intent=JSON.parse(p.original_dispatch_intents[0].envelope);
    assert.equal(original.originalRequestJson,service.originalRequestJson);assert.equal(original.paymentHash,funding.transactionHash);
    assert.equal(intent.grantId,service.grantId);assert.equal(intent.requestId,service.requestId);
    assert.equal(intent.paymentHash,funding.transactionHash);
    const request=ledger.requests[0],execution=executions[0];
    assert.equal(request.grantId,service.grantId);assert.equal(request.requestId,service.requestId);
    assert.equal(request.state,'SUCCEEDED');assert.equal(request.cachedResult.resultCode,'native.ok');assert.equal(request.costUnits,2);
    assert.equal(execution.terminalClassification,'SUCCEEDED');
    assert.equal(execution.request.grantId,service.grantId);assert.equal(execution.request.requestId,service.requestId);
  }
  if(quarantined){
    const q=JSON.parse(p.original_custody_quarantines[0].envelope);
    assert.equal(q.grantId,service.grantId);assert.equal(q.paymentHash,funding.transactionHash);
    assert.equal(q.status,'CUSTODY_OUTCOME_UNKNOWN');assert.equal(q.authority,'NONE');
  }
  assert.equal(JSON.stringify(rows).includes(service.authorizationHeader),false);
}
function observationSummary(event,rows){
  return {...messageBase(event),grantId:fixedService.grantId,requestId:fixedService.requestId,
    originalRequestSha256:sha(fixedService.originalRequestJson),paymentHash:fixedFunding.transactionHash,
    checkpointSha256:sha(fixedFunding.serializedCheckpoint),checkpointPinsSha256:sha(JSON.stringify(fixedFunding.checkpointPins)),
    ownerEpoch:rows.payer.metadata[0].owner_epoch,retainedOriginals:rows.payer.original_service_requests.length,
    dispatchIntents:rows.payer.original_dispatch_intents.length,responseObservations:rows.payer.original_response_observations.length,
    backendExecutions:rows.backend.value.executionState.executions.length,
    consumedUnits:rows.backend.value.ledgerState.grants.find(g=>g.grantId===fixedService.grantId).consumedUnits,
    availableUnits:rows.backend.value.ledgerState.grants.find(g=>g.grantId===fixedService.grantId).availableUnits,
    payerCloseRequested:false,backendCloseRequested:false};
}
function seedEffects(){
  const operator=retained.grantOperator.snapshot(),aggregate=counts.referenceCandidates+4096+16384;
  assert.equal(counts.walletKeys,1);assert.equal(counts.walletSignatures,1);assert.equal(counts.capabilityKeys,2);
  assert.equal(counts.capabilitySignatures,2);assert.equal(operator.counts.providerKeys,1);
  assert.equal(operator.counts.providerSignatureCalls,2);assert.equal(operator.counts.activations,2);
  assert.equal(counts.executions,1);assert.equal(counts.foreignGrantRefusals,1);assert.equal(counts.independentPinFiles,2);
  assert.equal(counts.verify,1);assert.equal(counts.firstSettle,1);assert.equal(counts.pendingObserve,2);
  assert.ok(aggregate<=65536);assert.equal(readonlyOpens,4);
  return {walletKeys:1,transactionSignatures:1,capabilityKeys:2,capabilitySignatures:2,providerKeys:1,providerSignatures:2,
    referenceCandidates:counts.referenceCandidates,producerCandidateReservation:4096,fixedVerificationReservation:16384,
    aggregateCandidateReservation:aggregate,independentPinFiles:2,readonlySqliteOpens:readonlyOpens,
    fundingPosts:1,serviceExecutions:1,foreignGrantRefusals:1,sdkPrepareBlock:false,realPayment:false};
}
function afterServiceCommit(event){
  if(!cutpointArmed||event.operation!=='completeDurableExecution'||event.changed!==true)return undefined;
  assert.equal(++cutpointEntries,1);
  // Native COMMIT has returned. A separate read-only handle avoids forbidden
  // same-store callback reentry, transaction substitution or a synthetic result.
  DIAGNOSTIC.mark('READ_COMMITTED_CUTPOINT');const rows=nativeRows();assertOriginalRows(rows,fixedFunding,fixedService,true,false);
  const summary=observationSummary('BACKEND_COMMITTED_BEFORE_RESPONSE',rows);
  assert.equal(process.connected,true);
  DIAGNOSTIC.mark('SEND_COMMITTED_CUTPOINT');process.send({kind:'COMMITTED_CUTPOINT',summary,namespace:NAMESPACE(),effects:seedEffects()});
  // Bounded main-thread stop prevents JS response consumption before the parent
  // can inject SIGKILL. No Worker is created. If no signal arrives, FAIL; do not
  // return from afterCommit or turn a timed-out cutpoint into a success.
  DIAGNOSTIC.mark('WAIT_SELECTED_SIGKILL');const stopped=Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5000);
  assert.equal(stopped,'timed-out');throw new Error('RECOVERY_CRASH_CUTPOINT_SIGNAL_NOT_OBSERVED');
}
async function seedActualApplication(){
  DIAGNOSTIC.mark('LOAD_SEED_MODULES');await loadSeedModules();
  let packet=null;seedNowEpochMs=Date.now();
    DIAGNOSTIC.mark('READ_TEST_TLS');tlsKey = readPrivate('tls-key.pem', 16384); certificate = readPrivate('tls-cert.pem', 16384);
    DIAGNOSTIC.mark('RESERVE_APPLICATION_PORT');const appPort = await reserveThenReleasePort(), origin = 'https://127.0.0.1:' + appPort;
    const resourceUrl = origin + '/funding', serviceResourceUrl = origin + '/service-credit/v1/execute';
    DIAGNOSTIC.mark('CREATE_SYNTHETIC_IDENTITIES');counts.walletKeys++; assert.equal(counts.walletKeys, 1); retained.walletKey = crypto.randomBytes(32);
    ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
    const publicBytes = Buffer.from(ed.getPublicKey(retained.walletKey)), publicKey = publicBytes.toString('base64');
    const payer = address([0, ...crypto.createHash('sha3-256').update(publicBytes).digest().subarray(0, 19)]);
    const payee = address([0, ...Array(19).fill(34)]), primaryKey = capabilityKey(), foreignKey = capabilityKey();
    const primarySelection = F({ offerId: 'native.primary', offerVersion: 1, holderId: payer, capabilityCommitment: primaryKey.commitment });
    const foreignSelection = F({ offerId: 'native.foreign', offerVersion: 1, holderId: payer, capabilityCommitment: foreignKey.commitment });
    DIAGNOSTIC.mark('CREATE_GRANT_OPERATOR');const operator = GRANTS(F({ root: ROOT, resourceUrl, ledgerDomain: 'native.issued.vertical', primarySelection, foreignSelection, payee,
      chainProfile: CHAIN, bootstrapCheckpoint: F({ height: 100, hash: '33'.repeat(32) }), nowEpochMs: seedNowEpochMs, afterServiceCommit: F(afterServiceCommit) }));
    retained.grantOperator = operator;
    DIAGNOSTIC.mark('START_RPC_PEER');const peer = await RPC(F({ tlsMaterial: F({ key: tlsKey, cert: certificate }), payerAddress: payer, payeeAddress: payee }));
    retained.rpc = peer;
    const validateChallenge = F(function validateChallenge(value) {
      wire.validatePaymentRequired(value); assert.equal(value.accepts.length, 1); wire.validateActiveUpfrontRequirement(value.accepts[0]);
      assert.equal(value.accepts[0].asset, ASSET); assert.equal(value.accepts[0].payTo, payee);
    });
    const execute = F(function execute(identity) {
      assert.ok(Object.isFrozen(identity)); assert.equal(typeof identity.executionId,'string');
      assert.equal(++counts.executions,1); return {resultCode:'native.ok'};
    });
    const factory = NATIVE_FACTORY(F({ bind: F({ host: '127.0.0.1', port: appPort, exclusive: true }),
      tlsMaterial: F({ key: tlsKey, cert: certificate }) }));
    retained.appOpening = true;
    DIAGNOSTIC.mark('CONSTRUCT_APPLICATION');const app = await APPLICATION(F({
      funding: F({ intake: F({ store: operator.intakeStore, serviceCreditStore: operator.serviceStore,
        authorityRecord: operator.authorityRecord, deriveFundingTerms: operator.deriveFundingTerms, now: operator.now,
        observerRoot: ROOT, observerCatchUp: operator.observerCatchUp, selection: primarySelection, resourceUrl }),
      official: F({ localFacilitator: {
        verify(...args) { sdkTuple(args, packet); assert.equal(++counts.verify, 1); return { isValid: true, payer }; },
        settle(...args) { sdkTuple(args, packet); assert.equal(++counts.firstSettle, 1); return settled(args[0], args[1], false); },
      }, validateChallenge,
      reconcilePendingSettlement: F(function reconcile(...args) {
        sdkTuple(args, packet); assert.ok(++counts.pendingObserve <= 2); return settled(args[0], args[1], counts.pendingObserve === 2);
      }), maxPendingReconciliations: 2 }), maxIntakeAttempts: 1, closeBudgetMs: 1000 }),
      service: F({ store: operator.serviceStore, execute, deadlineRuntime: serviceRuntime, selectedDurationMs: 1000 }),
      transport: F({ origin, generation: F({ generationId: 'native.issued.vertical', generationVersion: 1 }),
        limits: F({ maxHeaderBytes: 16384, maxHeaderCount: 16, maxConcurrentSockets: 2, maxConnectionStarts: 8,
          maxConcurrentRequests: 1, maxRequestStarts: 8, tlsHandshakeDeadlineMs: 1000, headerDeadlineMs: 2000,
          requestResponseDeadlineMs: 5000, idleSocketDeadlineMs: 2000, startDeadlineMs: 1000, closeGraceMs: 5000, metricsCounterLimit: 10000 }),
        deadlineRuntime: ingressRuntime, httpsServerFactory: factory }),
    }));
    retained.app = app; retained.appOpening = false;
    DIAGNOSTIC.mark('START_APPLICATION');assert.equal((await app.start()).status, 'LISTENING');
    DIAGNOSTIC.mark('READ_UNPAID_CHALLENGE');const unpaid = await nativePost(resourceUrl);
    assert.equal(unpaid.status, 402); assert.equal(unpaid.body, 'Payment Required');
    const frame = F({ status: unpaid.status, paymentRequiredHeader: unpaid.headers['payment-required'], body: unpaid.body });
    DIAGNOSTIC.mark('BIND_CHALLENGE_AND_REFERENCE');const bound = peer.bindIssuedChallenge(F({ resourceUrl, frame })), expected = reference(bound.unsignedSubject);
    assert.ok(counts.referenceCandidates + 4096 + 16384 <= 65536);
    const wallet = F({
      getAddress: F(function getAddress() { assert.equal(++counts.walletAddresses, 1); return Promise.resolve(payer); }),
      sign: F(function sign(block) {
        assert.equal(++counts.walletSignatures, 1); assert.equal(block.publicKey, publicKey);
        assert.equal(block.nonce, expected.nonce); assert.equal(block.difficulty, 3000); assert.equal(block.fusedPlasma, 25409);
        assert.equal(block.momentumAcknowledged.height, 100); assert.ok(Object.isFrozen(block));
        signedOriginal = block; signedOriginalText = JSON.stringify(block);
        const signature = Buffer.from(ed.sign(Buffer.from(block.hash, 'hex'), retained.walletKey)).toString('base64');
        return Promise.resolve({ ...JSON.parse(signedOriginalText), signature });
      }),
    });
    const databasePath = path.join(ROOT, 'native-issued-payer-v6.sqlite');
    for (const suffix of ['', '-journal', '-wal', '-shm']) assert.throws(() => fs.lstatSync(databasePath + suffix), e => e.code === 'ENOENT');
    const storeOptions = { databasePath, allowedRoot: ROOT, resourceUrl,
      custodyPolicy: { policyVersion: 1, maxRequests: 4, serviceResourceUrl } };
    DIAGNOSTIC.mark('CREATE_EMPTY_V6');retained.initialV6 = CREATE_V6(storeOptions); assert.equal(retained.initialV6.load(), null);
    DIAGNOSTIC.mark('CLOSE_EMPTY_V6');assert.equal(retained.initialV6.close(), undefined); counts.sameFileInitialCloses++;
    retained.initialV6 = null; const fileId = privateIdentity(databasePath);
    retained.clientOpening = true;
    DIAGNOSTIC.mark('OPEN_PAYER_CLIENT');const client = await CLIENT({ storeOptions,
      fundingOptions: { readSessionOptions: peer.readSessionOptions(),
        materialOptions: { publicKey, startNonce: expected.startNonce, limits: { maxAttempts: 4096, maxDifficulty: 38115000 } },
        materialWaitMs: 5000, wallet, deadlineMs: 5000,
        fundingTransportOptions: F({ resourceUrl, ca: certificate, maxRequestStarts: 1, requestDeadlineMs: 5000,
          handshakeDeadlineMs: 1000, closeGraceMs: 500 }) },
      serviceOptions: { official: { validateChallenge, assetInfo: { asset: ASSET, decimals: 8, symbol: 'ZNN' }, contextLimit: 1 },
        transportOptions: F({ origin, ca: certificate, maxRequestStarts: 2, maxConcurrentRequests: 1,
          requestDeadlineMs: 5000, handshakeDeadlineMs: 1000, closeGraceMs: 500 }), deadlineMs: 5000 },
    }, F({ port: peer.port, ca: certificate }));
    retained.client = client; retained.clientOpening = false;
    DIAGNOSTIC.mark('PREPARE_ORIGINAL_FUNDING');const prepared = await client.prepareOriginalFunding({ plannerContext: { plannerContextVersion: 7, readInput: bound.plannerReadInput },
      challenge: bound.challenge, originalRequest: { requestId: 'native.original', contextId: 'native.context',
        requestBodyBase64: '', contextBase64: Buffer.from('independent-native-original').toString('base64') } });
    DIAGNOSTIC.observeReturnedPhase(prepared);assert.equal(prepared.phase, 'AWAITING_INDEPENDENT_PINS'); packet = prepared.packet; originalPacketText = JSON.stringify(packet);
    DIAGNOSTIC.mark('RETAIN_FUNDING_PINS');fixedFunding = retainJson('native-issued-original.pins.json', {
      witnessVersion:2,fundingResourceUrl:resourceUrl,serviceResourceUrl,transactionHash:packet.transactionHash,
      paymentRequiredHeader:packet.pair.challenge.paymentRequiredHeader,paymentSignatureHeader:packet.pair.paymentSignatureHeader,
      serializedCheckpoint:packet.serializedCheckpoint,checkpointPins:packet.expectedPins,nowEpochMs:seedNowEpochMs,
    });
    const independent = {transactionHash:fixedFunding.transactionHash,
      paymentRequiredHeader:fixedFunding.paymentRequiredHeader,paymentSignatureHeader:fixedFunding.paymentSignatureHeader,
      serializedCheckpoint:fixedFunding.serializedCheckpoint,expectedPins:fixedFunding.checkpointPins};
    const fundingSummary = {...messageBase('FUNDING_ORIGINAL_FIXED_BEFORE_SUBMISSION'),
      paymentHash:fixedFunding.transactionHash,checkpointSha256:sha(fixedFunding.serializedCheckpoint),
      checkpointPinsSha256:sha(JSON.stringify(fixedFunding.checkpointPins))};
    assert.equal(counts.verify,0);assert.equal(app.snapshot().paidCalls,0);
    DIAGNOSTIC.mark('FIX_FUNDING_WITNESS_WITH_PARENT');const fundingAck=waitParent('FUNDING_ORIGINAL_FIXED');
    await sendNative({kind:'FUNDING_ORIGINAL_WITNESS',summary:fundingSummary,witnessJson:JSON.stringify(fixedFunding)});
    assert.deepEqual(await fundingAck,{kind:'FUNDING_ORIGINAL_FIXED',runId:context.runId});
    DIAGNOSTIC.mark('COMMIT_ORIGINAL_FUNDING');const committedFunding=await client.commitOriginalFunding({ expectedPins: independent.expectedPins });
    DIAGNOSTIC.observeReturnedPhase(committedFunding);assert.equal(committedFunding.phase, 'LOCAL_STORE_READBACK_MATCHED');
    untouched(packet); assert.equal(privateIdentity(databasePath), fileId);
    DIAGNOSTIC.mark('SUBMIT_ORIGINAL_FUNDING');const submittedFunding=await client.submitOriginalFunding({ expectedPins: independent.expectedPins });
    DIAGNOSTIC.observeReturnedPhase(submittedFunding);assert.equal(submittedFunding.phase, 'FUNDING_INTAKE_BOUND');
    untouched(packet); assert.equal(app.snapshot().paidCalls, 1); assert.equal(app.snapshot().binding.officialPhase, 'PENDING');
    DIAGNOSTIC.mark('OBSERVE_FIRST_PENDING');const firstPending=await app.resumeOriginalSettlement();
    DIAGNOSTIC.observeReturnedPhase(firstPending);assert.equal(firstPending.phase, 'PENDING');
    DIAGNOSTIC.mark('OBSERVE_SECOND_PENDING');const secondPending=await app.resumeOriginalSettlement();
    DIAGNOSTIC.observeReturnedPhase(secondPending);assert.equal(secondPending.phase, 'SETTLED');
    assert.equal(counts.verify, 1); assert.equal(counts.firstSettle, 1); assert.equal(counts.pendingObserve, 2);
    DIAGNOSTIC.mark('ACTIVATE_PRIMARY_GRANT');const primary = (await operator.activateBoundOriginal({ transactionHash: independent.transactionHash,
      paymentRequiredHeader: independent.paymentRequiredHeader })).grant;
    DIAGNOSTIC.mark('ACTIVATE_FOREIGN_GRANT');const foreign = (await operator.activateDeclaredForeign({ declaredTransactionHash: '99'.repeat(32) })).grant;
    assert.notEqual(primary.grantId, foreign.grantId);
    DIAGNOSTIC.mark('INITIALIZE_DURABLE_EXECUTION');assert.equal(operator.serviceStore.initializeDurableExecution({ expectedRevision: operator.serviceStore.getMetadata().revision,
      ledgerId: 'native.issued.execution', policy: { policyId: 'native.fixed', policyVersion: 1, maxDurationMs: 1000 }, capacity: 8 }).disposition, 'APPLIED');
    DIAGNOSTIC.mark('ADMIT_PRIMARY_GRANT');assert.equal(app.admitCommittedServiceGrant(primary.grantId).status, 'ADMITTED');
    DIAGNOSTIC.mark('HANDOFF_TO_SERVICE');const handoff = await client.handoffToService({ originalPayment: { resourceUrl, serializedCheckpoint: independent.serializedCheckpoint,
      expectedPins: independent.expectedPins }, selectedGrantId: primary.grantId, paymentRequiredHeader: independent.paymentRequiredHeader });
    DIAGNOSTIC.observeReturnedPhase(handoff);assert.equal(handoff.phase, 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED'); assert.equal(privateIdentity(databasePath), fileId); untouched(packet);

    DIAGNOSTIC.mark('CREATE_SERVICE_ORIGINALS');const first=serviceOriginal(primary,primaryKey,'native.crash',serviceResourceUrl);
    const foreignOriginal=serviceOriginal(foreign,foreignKey,'native.foreign',serviceResourceUrl);
    DIAGNOSTIC.mark('CHECK_FOREIGN_GRANT_REFUSAL');const denied=await nativePost(serviceResourceUrl,{Authorization:foreignOriginal.authorizationHeader});
    assert.equal(denied.status,401);counts.foreignGrantRefusals++;
    assert.equal(operator.serviceStore.getRequest({grantId:foreign.grantId,requestId:'native.foreign'}),null);
    DIAGNOSTIC.mark('RETAIN_SERVICE_PINS');fixedService=retainJson('native-issued-service-originals.pins.json',{
      witnessVersion:2,grantId:first.grantId,requestId:first.requestId,originalRequestJson:first.originalRequestJson,
      authorizationHeader:first.authorizationHeader,fundingWitnessSha256:sha(JSON.stringify(fixedFunding)),
      payerIdentity:identityParts(PRINCIPAL[1]),backendIdentity:identityParts(PRINCIPAL[0]),
    });
    DIAGNOSTIC.mark('READ_BEFORE_DISPATCH');const before=nativeRows();assertOriginalRows(before,fixedFunding,fixedService,false,false);
    expectCredit(operator,primary.grantId,foreign.grantId,0);untouched(packet);
    serviceSummary={...messageBase('ORIGINALS_FIXED_BEFORE_DISPATCH'),
      grantId:fixedService.grantId,requestId:fixedService.requestId,originalRequestSha256:sha(fixedService.originalRequestJson),
      paymentHash:fixedFunding.transactionHash,checkpointSha256:sha(fixedFunding.serializedCheckpoint),
      checkpointPinsSha256:sha(JSON.stringify(fixedFunding.checkpointPins))};
    DIAGNOSTIC.mark('FIX_SERVICE_WITNESS_WITH_PARENT');const serviceAck=waitParent('ORIGINAL_WITNESS_FIXED');
    await sendNative({kind:'ORIGINAL_WITNESS',summary:serviceSummary,witnessJson:JSON.stringify(fixedService)});
    assert.deepEqual(await serviceAck,{kind:'ORIGINAL_WITNESS_FIXED',runId:context.runId});
    cutpointArmed=true;
    DIAGNOSTIC.mark('SUBMIT_SERVICE_ORIGINAL');await client.submitOriginal(first);
    throw new Error('RECOVERY_CRASH_SELECTED_CUTPOINT_NOT_REACHED');
}
async function recoverActualOriginal(witnessJson){
  assert.equal(typeof witnessJson,'string');assert.ok(Buffer.byteLength(witnessJson)<=65536);
  DIAGNOSTIC.mark('CAPTURE_RECOVERY_ORIGINALS');const bundle=exactInput(JSON.parse(witnessJson),['funding','service']);
  fixedFunding=exactInput(bundle.funding,['witnessVersion','fundingResourceUrl','serviceResourceUrl','transactionHash',
    'paymentRequiredHeader','paymentSignatureHeader','serializedCheckpoint','checkpointPins','nowEpochMs']);
  fixedService=exactInput(bundle.service,['witnessVersion','grantId','requestId','originalRequestJson',
    'authorizationHeader','fundingWitnessSha256','payerIdentity','backendIdentity']);
  assert.equal(fixedFunding.witnessVersion,2);assert.equal(fixedService.witnessVersion,2);
  assert.equal(fixedService.fundingWitnessSha256,sha(JSON.stringify(fixedFunding)));
  for(const [name,id]of [[PRINCIPAL[0],fixedService.backendIdentity],[PRINCIPAL[1],fixedService.payerIdentity]])
    assert.deepEqual(identityParts(name),id);
  const restored=checkpoint.restoreOriginalPaymentCheckpoint(fixedFunding.serializedCheckpoint,fixedFunding.checkpointPins);
  assert.equal(checkpoint.encodeOriginalPaymentCheckpoint(restored),fixedFunding.serializedCheckpoint);
  assert.equal(restored.binding.paymentHash,fixedFunding.transactionHash);
  assert.equal(restored.originalBytes.paymentPayload,fixedFunding.paymentSignatureHeader);
  assert.equal(restored.originalBytes.paymentRequirements,fixedFunding.paymentRequiredHeader);
  DIAGNOSTIC.mark('READ_BEFORE_RECOVERY');const before=nativeRows();assertOriginalRows(before,fixedFunding,fixedService,true,false);
  DIAGNOSTIC.mark('LOAD_RECOVERY_MODULES');const [{ServiceCreditSqliteStore:Backend},{openServiceCreditCustodiedSqliteBackendRecoveryClientV6:OPEN_READER}]
    =await Promise.all([import('../src/service-credit-sqlite-store.js'),import('../src/service-credit-custodied-backend-recovery-client.js')]);
  DIAGNOSTIC.mark('OPEN_EXISTING_BACKEND');const backend=Backend.openExisting({databasePath:path.join(ROOT,PRINCIPAL[0]),allowedRoot:ROOT,
    deriveCost(){throw new Error('RECOVERY_CRASH_RECOVERY_COST_FORBIDDEN');},now(){return fixedFunding.nowEpochMs;}});
  DIAGNOSTIC.mark('OPEN_RECOVERY_READER');const reader=await OPEN_READER({databasePath:path.join(ROOT,PRINCIPAL[1]),allowedRoot:ROOT,backendStore:backend,
    fundingResourceUrl:fixedFunding.fundingResourceUrl,
    custodyPolicy:{policyVersion:1,maxRequests:4,serviceResourceUrl:fixedFunding.serviceResourceUrl},
    selectedGrantId:fixedService.grantId,deadlineMs:5000});
  for(const name of ['submitOriginal','runOriginals','sign','pay','requestImpl'])assert.equal(Object.hasOwn(reader,name),false);
  const key={grantId:fixedService.grantId,requestId:fixedService.requestId};
  DIAGNOSTIC.mark('READ_RECOVERY_CHECKPOINT');const current=reader.readOriginalPaymentCheckpoint(fixedFunding.checkpointPins);
  assert.equal(checkpoint.encodeOriginalPaymentCheckpoint(current),fixedFunding.serializedCheckpoint);
  DIAGNOSTIC.mark('READ_RECOVERY_BACKEND_STATE');const observed=reader.readOriginalBackendRecoveryState(key,fixedService.authorizationHeader,fixedFunding.checkpointPins);
  assert.equal(observed.status,'CLIENT_RECONCILIATION_REQUIRED');assert.equal(observed.backend.status,'CACHED_SUCCESS');
  assert.equal(observed.local.original.originalRequestJson,fixedService.originalRequestJson);
  assert.equal(observed.local.responseStatus,'NOT_OBSERVED');assert.equal(observed.local.responseObservation,null);
  assert.equal(observed.local.uncertainty.custody,true);assert.equal(observed.deliveryConfirmed,false);assert.equal(observed.authority,'NONE');
  const owner=reader.snapshot().client.client.owner;
  assert.equal(owner.custodyQuarantine.status,'PERSISTED_UNKNOWN');assert.equal(owner.custodyQuarantine.writeAttempted,true);
  assert.equal(owner.counts.quarantineWrites,1);assert.equal(owner.counts.quarantineReadbackConfirmations,1);
  DIAGNOSTIC.mark('CLOSE_RECOVERY_READER');const close=reader.close();assert.equal(reader.close(),close);
  await assert.rejects(close,{code:'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_CHILD_OUTCOME_UNKNOWN'});
  assert.equal(reader.close(),close);const closed=reader.snapshot().client;
  assert.equal(closed.resource.storeCloseAttempts,1);assert.equal(closed.resource.storeCloseOutcome,'RETURNED');
  assert.equal(closed.resource.phase,'RELEASED');assert.equal(closed.resource.slotHeld,false);
  assert.equal(closed.close.outcome,'CHILD_UNKNOWN');DIAGNOSTIC.mark('CLOSE_RECOVERY_BACKEND');assert.equal(backend.close(),undefined);
  DIAGNOSTIC.mark('READ_AFTER_RECOVERY');const after=nativeRows();assertOriginalRows(after,fixedFunding,fixedService,true,true);
  assert.equal(after.backend.text,before.backend.text);
  assert.equal(after.payer.metadata[0].owner_epoch,before.payer.metadata[0].owner_epoch+1);
  const {owner_epoch:oldEpoch,...oldMetadata}=before.payer.metadata[0];
  const {owner_epoch:newEpoch,...newMetadata}=after.payer.metadata[0];
  assert.equal(newEpoch,oldEpoch+1);assert.deepEqual(newMetadata,oldMetadata);
  for(const name of ['payer_recovery_state','original_payment_checkpoint','original_service_requests',
    'original_dispatch_intents','original_response_observations','original_request_custody_policy'])
    assert.deepEqual(after.payer[name],before.payer[name]);
  for(const[name,id]of [[PRINCIPAL[0],fixedService.backendIdentity],[PRINCIPAL[1],fixedService.payerIdentity]])
    assert.deepEqual(identityParts(name),id);
  assert.equal(readonlyOpens,4);
  const summary={...observationSummary('RECOVERED_ORIGINAL_NO_DISPATCH',after),
    payerCloseRequested:true,backendCloseRequested:true,samePhysicalFiles:true,
    backendStatus:observed.backend.status,clientStatus:observed.status,quarantine:'PERSISTED_UNKNOWN',
    recoveryDispatches:0,recoverySignatures:0,payerStoreCloseOutcome:'RETURNED',payerOwnerCloseOutcome:'CHILD_UNKNOWN',
    backendStoreCloseOutcome:'RETURNED',cachedOwnerClosePromise:true,authority:'NONE',deliveryConfirmed:false};
  DIAGNOSTIC.mark('SEND_RECOVERED_ORIGINAL');await sendNative({kind:'RECOVERED_ORIGINAL',summary,namespace:NAMESPACE(),
    effects:{walletKeys:0,transactionSignatures:0,capabilityKeys:0,capabilitySignatures:0,providerKeys:0,providerSignatures:0,
      referenceCandidates:0,producerCandidateReservation:0,fixedVerificationReservation:0,aggregateCandidateReservation:0,
      independentPinFiles:0,readonlySqliteOpens:4,fundingPosts:0,serviceExecutions:0,foreignGrantRefusals:0,
      sdkPrepareBlock:false,realPayment:false}});
  DIAGNOSTIC.mark('DISCONNECT_RECOVERY_IPC');process.disconnect(); // Let the known closed owners/EOF exit naturally, not forced success.
}
async function main(){
  DIAGNOSTIC.mark('WAIT_PARENT_INPUT');const incoming=waitParent(MODE==='seed'?'SEED_INPUT':'RECOVERY_INPUT');
  await sendNative({kind:'CHILD_BOOT_READY',mode:MODE,namespace:NAMESPACE()});
  const input=await incoming;
  exactInput(input,MODE==='seed'?['kind','context','seedInputJson']:['kind','context','witnessJson']);
  context=exactInput(input.context,['runId','sourceRowsSha256']);
  for(const value of Object.values(context))assert.match(value,/^[0-9a-f]{64}$/);
  assert.equal(context.sourceRowsSha256,NAMESPACE().sourceRowsSha256);
  if(MODE==='seed'){
    assert.equal(input.seedInputJson,'{"seedInputVersion":1,"maximumCutpointWaitMs":5000}');
    await seedActualApplication();
  }else await recoverActualOriginal(input.witnessJson);
}
await main().catch(async caught=>{
  // Metadata only. Do not inspect/close/reopen SQL, retry an operation, or
  // serialize a raw error/material-bearing owner snapshot to locate failure.
  DIAGNOSTIC.fail(caught);
  let line='RECOVERY_CRASH_ACTUAL_CHILD_FAILED_PRESERVE_EVIDENCE\n';
  try{
    const safe=DIAGNOSTIC.snapshot();
    line='# x402-native-operation-failure '+JSON.stringify(safe)+'\n';
    if(Buffer.byteLength(line)>4096)line='RECOVERY_CRASH_ACTUAL_CHILD_FAILED_PRESERVE_EVIDENCE\n';
  }catch{} // A diagnostic failure must not replace the actual failed outcome.
  await new Promise(done=>{
    try{process.stderr.write(line,()=>done());}catch{done();}
  });
  process.exit(1); // Failure-only owned exit, never graceful cleanup or PASS.
});
