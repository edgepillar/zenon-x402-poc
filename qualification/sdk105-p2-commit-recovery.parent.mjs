/* SOURCE ONLY. One actual commit-boundary child, observed SIGKILL termination,
 * then one fresh no-dispatch recovery child. No child or trial automatic retry.
 */
const E = process.env;
if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || E.X402_P2_COMMIT_RECOVERY_ROLE !== 'parent'
    || E.X402_SDK105_ISSUED_COMMAND_SELECTION !== 'sdk105-p2-commit-recovery-v4'
    || E.X402_SDK105_ISSUED_COMMAND_RUN_SCOPE !== 'one-sdk105-p2-commit-recovery-v4'
    || E.X402_SDK105_ISSUED_COMMAND_MODE !== 'commit-kill-recover'
    || !/^[0-9a-f]{64}$/.test(E.X402_P2_COMMIT_RECOVERY_TOKEN || '')
    || process.argv.length !== 3 || process.argv[2] !== E.SPV_TASK_SCRATCH
    || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined)
  throw new TypeError('SDK105_P2_PARENT_NOT_ADMITTED_BEFORE_EFFECT_IMPORTS');
const [{ default: assert }, { spawn }, path, fs, url, io, boundary] = await Promise.all([
  import('node:assert/strict'), import('node:child_process'), import('node:path'), import('node:fs'),
  import('node:url'), import('./sdk105-p2-commit-recovery.io.mjs'), import('./sdk105-p2-recovery-boundary-data.mjs'),
]);
const root = process.argv[2], rootId = io.rootP2(root), directory = path.dirname(url.fileURLToPath(import.meta.url));
const profileRecord = io.readP2(root, rootId, 'p2-child-profiles.json'), profileTable = profileRecord.value;
assert.equal(profileTable.token, E.X402_P2_COMMIT_RECOVERY_TOKEN);
assert.equal(profileTable.kind, io.P2_KIND); assert.equal(profileTable.packageFiles, 404);
assert.ok(Number.isSafeInteger(profileTable.applicationFiles) && profileTable.applicationFiles >= 139 && profileTable.applicationFiles <= 256);
assert.match(profileTable.sourceRowsSha256, /^[0-9a-f]{64}$/);
const fixed = Object.freeze({ 'funding-child': 'sdk105-p2-funding-child.case.mjs',
  'recovery-child': 'sdk105-p2-recovery-child.case.mjs' });
const owned = [], CAP = 65536;
function physicalFiles(pins) {
  const hash = pins.payment.value.transactionHash;
  return ['native-issued-service.sqlite', 'native-issued-intake.sqlite', 'native-issued-payer-v6.sqlite',
    'funding-observer-' + hash + '.sqlite', 'declared-foreign-funding-observer.sqlite'].map(name => {
    const s = fs.lstatSync(path.join(root, name), { bigint: true });
    assert.ok(s.isFile() && !s.isSymbolicLink() && s.uid === BigInt(process.getuid()) && s.nlink === 1n);
    assert.equal(s.mode & 0o7777n, 0o600n);
    return { name, identity: [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink].map(String) };
  });
}
function launch(role) {
  assert.ok(Object.hasOwn(fixed, role)); assert.equal(owned.length, role === 'funding-child' ? 0 : 1);
  assert.equal(io.readP2(root, rootId, 'p2-child-profiles.json').sha256, profileRecord.sha256);
  if (role === 'recovery-child') {
    boundary.captureP2TerminatedChildData({ boundaryObserved: owned[0].boundaryValidated,
      plannedKillCalls: owned[0].plannedKillCalls, failureStopCalls: owned[0].failureStopCalls,
      exitObserved: owned[0].exitObserved, closeObserved: owned[0].closeObserved,
      exitCode: owned[0].code, exitSignal: owned[0].signal, closeCode: owned[0].closeCode, closeSignal: owned[0].closeSignal });
    assert.equal(owned[0].code, null); assert.equal(owned[0].signal, 'SIGKILL');
    assert.equal(owned[0].exitObserved, true); assert.equal(owned[0].closeObserved, true);
    assert.equal(owned[0].plannedKillCalls, 1); assert.equal(owned[0].boundaryValidated, true);
    const reread = io.originalP2(root, rootId);
    assert.equal(reread.payment.sha256, owned[0].pins.payment.sha256);
    assert.equal(reread.services.sha256, owned[0].pins.services.sha256);
    assert.deepEqual(physicalFiles(reread), owned[0].files);
  }
  const selected = profileTable[role];
  assert.deepEqual(Object.keys(selected).sort(), ['path', 'sha256']);
  assert.ok(path.isAbsolute(selected.path) && /^[0-9a-f]{64}$/.test(selected.sha256));
  const env = { PATH: '/usr/bin:/bin', LANG: 'C', NODE_DISABLE_COMPILE_CACHE: '1', WS_NO_BUFFER_UTIL: '1', WS_NO_UTF_8_VALIDATE: '1',
    SPV_TASK_SCRATCH: root, X402_SDK105_ISSUED_COMMAND_SELECTION: 'sdk105-p2-commit-recovery-v4',
    X402_SDK105_ISSUED_COMMAND_RUN_SCOPE: 'one-sdk105-p2-commit-recovery-v4', X402_SDK105_ISSUED_COMMAND_MODE: 'commit-kill-recover',
    X402_ISSUED_CLOSE_NATIVE_SELECTION: 'current-native-issued-close-source-v4',
    X402_P2_COMMIT_RECOVERY_ROLE: role, X402_P2_COMMIT_RECOVERY_TOKEN: E.X402_P2_COMMIT_RECOVERY_TOKEN,
    X402_SDK105_ISSUED_COMMAND_PROFILE_PATH: selected.path, X402_SDK105_ISSUED_COMMAND_PROFILE_SHA256: selected.sha256 };
  const argv = ['--no-addons', '--disallow-code-generation-from-strings', '--disable-proto=throw', '--unhandled-rejections=strict',
    '--test-reporter=tap', '--import=' + path.join(directory, 'sdk105-p2-commit-recovery.preload.mjs'), path.join(directory, fixed[role]), root];
  const child = spawn(process.execPath, argv, { cwd: path.dirname(directory), env, detached: false,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json' });
  const row = { role, child, pid: child.pid, stdout: [], stderr: [], stdoutBytes: 0, stderrBytes: 0,
    code: null, signal: null, closeCode: null, closeSignal: null, exitObserved: false, closeObserved: false, plannedKillCalls: 0,
    failureStopCalls: 0, boundaryValidated: false, messages: [], fault: false, timer: null, settle: null };
  owned.push(row);
  row.done = new Promise(resolve => { row.settle = resolve; });
  function fail() { row.fault = true; stopFailure(row); }
  for (const [stream, chunks, count] of [[child.stdout, row.stdout, 'stdoutBytes'], [child.stderr, row.stderr, 'stderrBytes']]) {
    stream.on('data', bytes => { row[count] += bytes.length; if (row[count] > CAP) { fail(); return; } chunks.push(Buffer.from(bytes)); });
    stream.on('error', fail);
  }
  child.on('error', fail);
  child.on('message', message => {
    try {
      assert.equal(role, 'funding-child'); assert.equal(row.messages.length, 0); row.messages.push(message);
      assert.equal(message.boundaryVersion, 1); assert.equal(message.stage, 'COMMITTED_BEFORE_SERVICE_HTTP_CONTINUATION');
      assert.equal(message.token, E.X402_P2_COMMIT_RECOVERY_TOKEN); assert.equal(message.executions, 1);
      assert.equal(message.commandStarts, 6); assert.equal(message.commandResults, 5); assert.equal(message.responseResultWritten, false);
      assert.ok(Number.isSafeInteger(message.committedRevision) && message.committedRevision > 0);
      const pins = io.originalP2(root, rootId); row.pins = pins; row.files = physicalFiles(pins);
      boundary.captureP2CommitBoundaryData(message, { token: E.X402_P2_COMMIT_RECOVERY_TOKEN,
        transactionHash: pins.payment.value.transactionHash, grantId: pins.services.value.first.grantId,
        requestId: pins.services.value.first.requestId, paymentPinsSha256: pins.payment.sha256, servicePinsSha256: pins.services.sha256 });
      assert.equal(message.transactionHash, pins.payment.value.transactionHash);
      assert.equal(message.grantId, pins.services.value.first.grantId); assert.equal(message.requestId, pins.services.value.first.requestId);
      assert.equal(message.paymentPinsSha256, pins.payment.sha256); assert.equal(message.servicePinsSha256, pins.services.sha256);
      assert.equal(row.exitObserved, false); assert.equal(row.closeObserved, false); assert.ok(Number.isSafeInteger(row.pid) && row.pid > 1);
      assert.equal(row.child.pid, row.pid); row.boundaryValidated = true;
      row.plannedKillCalls++; assert.equal(row.child.kill('SIGKILL'), true);
    } catch { fail(); }
  });
  child.on('exit', (code, signal) => { row.exitObserved = true; row.code = code; row.signal = signal; });
  child.on('close', (code, signal) => {
    row.closeObserved = true; row.closeCode = code; row.closeSignal = signal; clearTimeout(row.timer);
    if (!row.exitObserved || code !== row.code || signal !== row.signal) row.fault = true;
    row.settle(row);
  });
  row.timer = setTimeout(fail, role === 'funding-child' ? 40000 : 20000);
  return row;
}
function stopFailure(row) {
  if (row.exitObserved || row.closeObserved || row.failureStopCalls !== 0 || row.plannedKillCalls !== 0) return;
  row.failureStopCalls++;
  // Only the exact owned, returned ChildProcess capability; never a guessed PID
  // or a neighboring process group. No successful reopen follows this path.
  if (Number.isSafeInteger(row.pid) && row.child.pid === row.pid) row.child.kill('SIGKILL');
}
try {
  const first = await launch('funding-child').done;
  assert.equal(first.fault, false); assert.equal(first.boundaryValidated, true);
  assert.equal(first.plannedKillCalls, 1); assert.equal(first.failureStopCalls, 0);
  assert.equal(first.code, null); assert.equal(first.signal, 'SIGKILL');
  assert.equal(first.exitObserved, true); assert.equal(first.closeObserved, true);
  assert.equal(Buffer.concat(first.stdout).toString().includes('# unexpected-sdk105-p2-funding-normal-completion '), false);
  const second = await launch('recovery-child').done;
  assert.equal(second.fault, false); assert.equal(second.code, 0); assert.equal(second.signal, null);
  assert.notEqual(first.pid, second.pid); assert.equal(second.messages.length, 0);
  const prefix = '# actual-sdk105-p2-recovery-child-v4 ', lines = Buffer.concat(second.stdout).toString('utf8').split('\n');
  const matches = lines.filter(line => line.startsWith(prefix)); assert.equal(matches.length, 1);
  const result = JSON.parse(matches[0].slice(prefix.length));
  const namespacePrefix = '# pinned-sdk105-p2-commit-recovery-v4-namespace ';
  const namespaces = lines.filter(line => line.startsWith(namespacePrefix)); assert.equal(namespaces.length, 1);
  const namespace = JSON.parse(namespaces[0].slice(namespacePrefix.length));
  assert.equal(namespace.profileKind, io.P2_KIND); assert.equal(namespace.role, 'recovery-child');
  assert.equal(namespace.applicationFiles, profileTable.applicationFiles); assert.equal(namespace.packageFiles, 404);
  assert.equal(namespace.inputsVerifiedBeforeCase, profileTable.applicationFiles + 404);
  assert.equal(namespace.sourceRowsSha256, profileTable.sourceRowsSha256);
  assert.equal(namespace.sourceTransforms + namespace.nativeBuiltinAliases, 0);
  assert.equal(result.recoveryCompleted, true); assert.equal(result.freshProcessPid, second.pid);
  assert.equal(result.token, E.X402_P2_COMMIT_RECOVERY_TOKEN); assert.equal(result.transactionHash, first.pins.payment.value.transactionHash);
  assert.equal(result.paymentPinsSha256, first.pins.payment.sha256); assert.equal(result.servicePinsSha256, first.pins.services.sha256);
  assert.equal(result.clientStatus, 'CLIENT_RECONCILIATION_REQUIRED'); assert.equal(result.backendStatus, 'CACHED_SUCCESS');
  assert.equal(result.backendRevision, first.messages[0].committedRevision);
  assert.equal(result.existingBackendExecutions, 1); assert.equal(result.consumedUnits, 2);
  assert.equal(result.responseObservationPresent, false); assert.equal(result.originalCheckpointMatched, true);
  assert.equal(result.readerClosed, true); assert.equal(result.backendClosed, true); assert.equal(result.noDispatchSurface, true);
  assert.equal(result.recoveryDispatches + result.recoveryFundingPosts + result.recoverySignatures, 0);
  const finalPins = io.originalP2(root, rootId);
  assert.equal(finalPins.payment.sha256, first.pins.payment.sha256); assert.equal(finalPins.services.sha256, first.pins.services.sha256);
  assert.deepEqual(physicalFiles(finalPins), first.files);
  console.log('# actual-sdk105-p2-commit-recovery-v4 ' + JSON.stringify({ caseCompleted: true,
    boundaryObserved: true, actualSigkillExitObserved: true, actualChildCloseObservedBeforeReopen: true,
    distinctFreshRecoveryProcess: true, childProcesses: 2, plannedKillCalls: 1, failureStopCalls: 0,
    originalCheckpointMatched: true, independentPinsUnchanged: true, sameFiveSqliteFileIdentities: true,
    existingBackendExecutions: 1, consumedUnits: 2, responseObservationPresent: false,
    clientStatus: result.clientStatus, backendStatus: result.backendStatus,
    recoveryDispatches: 0, recoveryFundingPosts: 0, recoverySignatures: 0,
    readerClosed: true, backendClosed: true, noDispatchSurface: true, physicalResourceRelease: 'NOT_QUALIFIED',
    deliveryConfirmed: false, authority: 'NONE', productionQualified: false,
    childCaptures: owned.map(row => ({ role: row.role, code: row.code, signal: row.signal,
      stdoutBytes: row.stdoutBytes, stderrBytes: row.stderrBytes,
      stdoutSha256: io.digestP2(Buffer.concat(row.stdout)), stderrSha256: io.digestP2(Buffer.concat(row.stderr)) })) }));
} finally {
  for (const row of owned) { clearTimeout(row.timer); if (!row.closeObserved) stopFailure(row); }
}
