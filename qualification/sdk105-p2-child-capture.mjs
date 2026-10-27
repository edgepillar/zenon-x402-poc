// Private child bytes are framed into the ONE managed parent stdout object.
// A declared EOF/exit is DATA here, never independent native process proof.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

export const P2_CAPTURE_PREFIX = '# sdk105-p2-private-child-capture-v1 ';
export const P2_CAPTURE_BUDGET = 458752;
const ROLES = ['funding-child', 'recovery-child'], STREAMS = ['stdout', 'stderr'];
const CAP = 65536, F = Object.freeze;
function fail() { throw new TypeError('P2_CHILD_CAPTURE_REFUSED_OR_UNKNOWN'); }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

export function createP2ChildCapture(write) {
  if (arguments.length !== 1 || typeof write !== 'function') fail();
  let outputBytes = 0, unknown = false, writing = false;
  const roles = new Map();
  function emit(value) {
    if (unknown || writing) { unknown = true; return false; }
    const line = P2_CAPTURE_PREFIX + JSON.stringify(value) + '\n';
    const size = Buffer.byteLength(line);
    if (outputBytes + size > P2_CAPTURE_BUDGET) { unknown = true; return false; }
    // Claim before the caller writes; a throw or reentrant write stays unknown.
    outputBytes += size; writing = true;
    try {
      const result = write(line);
      if (result !== true && result !== false) unknown = true;
    } catch { unknown = true; }
    finally { writing = false; }
    return !unknown;
  }
  function role(name) {
    if (!ROLES.includes(name)) fail();
    let value = roles.get(name);
    if (value === undefined) {
      if (roles.size !== ROLES.indexOf(name)) fail();
      value = { closed: false, stdout: stream(), stderr: stream() }; roles.set(name, value);
    }
    return value;
  }
  function stream() { return { observedBytes: 0, retainedBytes: 0, chunks: [], eof: false }; }
  function facts(value) {
    const bytes = Buffer.concat(value.chunks, value.retainedBytes);
    return F({ observedBytes: value.observedBytes, retainedBytes: value.retainedBytes,
      eof: value.eof, sha256: sha(bytes), overflow: value.observedBytes > CAP });
  }
  const append = F(function append(name, streamName, bytes) {
    if (arguments.length !== 3 || !STREAMS.includes(streamName) || !Buffer.isBuffer(bytes)) fail();
    const r = role(name), value = r[streamName];
    if (r.closed || value.eof || writing) { unknown = true; return false; }
    value.observedBytes += bytes.length;
    if (!Number.isSafeInteger(value.observedBytes)) { unknown = true; return false; }
    const length = Math.min(bytes.length, CAP - value.retainedBytes);
    if (length > 0 && !unknown) {
      const prefix = Buffer.from(bytes.subarray(0, length)), offset = value.retainedBytes;
      value.chunks.push(prefix); value.retainedBytes += length;
      emit({ version: 1, kind: 'bytes', role: name, stream: streamName, offset, base64: prefix.toString('base64') });
    }
    if (value.observedBytes > CAP) unknown = true;
    return !unknown;
  });
  const eof = F(function eof(name, streamName) {
    if (arguments.length !== 2 || !STREAMS.includes(streamName)) fail();
    const r = role(name), value = r[streamName];
    if (r.closed || value.eof || writing) { unknown = true; return false; }
    value.eof = true;
    return emit({ version: 1, kind: 'eof', role: name, stream: streamName });
  });
  const close = F(function close(name, exit) {
    if (arguments.length !== 2) fail();
    const r = role(name);
    if (r.closed || writing) { unknown = true; return false; }
    r.closed = true;
    const complete = !unknown && r.stdout.eof && r.stderr.eof
      && exit.exitObserved === true && exit.closeObserved === true;
    const emitted = emit({ version: 1, kind: 'close', role: name, complete,
      exitCode: exit.exitCode, exitSignal: exit.exitSignal, closeCode: exit.closeCode, closeSignal: exit.closeSignal,
      stdout: facts(r.stdout), stderr: facts(r.stderr) });
    if (!complete) unknown = true;
    return emitted && complete;
  });
  const inspect = F(function inspect() { return F({ outputBytes, unknown, childRoles: roles.size,
    evidence: 'CALLER_SUPPLIED_STREAMS_AND_EXIT_DATA', authority: 'NONE' }); });
  return F({ append, eof, close, inspect });
}
