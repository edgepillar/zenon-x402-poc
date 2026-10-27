// SOURCE ONLY. Owned fixture-file observations, not a filesystem lease.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

export const P2_KIND = 'SDK105_P2_COMMIT_KILL_RECOVERY_NODE24_V4';
export const P2_MODE = 'commit-kill-recover';
export const P2_ROLES = Object.freeze(['parent', 'funding-child', 'recovery-child']);
export function requireP2(value) {
  if (!value) throw new TypeError('SDK105_P2_COMMIT_RECOVERY_REFUSED_OR_UNKNOWN');
}
export function digestP2(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function identity(s) {
  return [s.dev, s.ino, s.uid, s.gid, s.mode, s.nlink, s.size, s.mtimeNs, s.ctimeNs].map(String);
}
export function rootP2(root) {
  requireP2(path.isAbsolute(root) && path.resolve(root) === root);
  for (let at = root; ; at = path.dirname(at)) {
    requireP2(!fs.lstatSync(at).isSymbolicLink()); if (path.dirname(at) === at) break;
  }
  const s = fs.lstatSync(root, { bigint: true });
  requireP2(s.isDirectory() && s.uid === BigInt(process.getuid()) && (s.mode & 0o7777n) === 0o700n);
  return [s.dev, s.ino, s.uid, s.mode].map(String).join(':');
}
export function readP2(root, expectedRoot, name, cap = 65536) {
  requireP2(rootP2(root) === expectedRoot && /^[A-Za-z0-9._-]+$/.test(name));
  const file = path.join(root, name), s = fs.lstatSync(file, { bigint: true });
  requireP2(s.isFile() && !s.isSymbolicLink() && s.uid === BigInt(process.getuid())
    && (s.mode & 0o7777n) === 0o600n && s.nlink === 1n && s.size > 0n && s.size <= BigInt(cap));
  const before = identity(s), fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    requireP2(JSON.stringify(identity(fs.fstatSync(fd, { bigint: true }))) === JSON.stringify(before));
    const raw = Buffer.alloc(Number(s.size) + 1); let size = 0;
    while (size < raw.length) { const count = fs.readSync(fd, raw, size, raw.length - size, null); if (!count) break; size += count; }
    requireP2(size === Number(s.size)
      && JSON.stringify(identity(fs.fstatSync(fd, { bigint: true }))) === JSON.stringify(before)
      && JSON.stringify(identity(fs.lstatSync(file, { bigint: true }))) === JSON.stringify(before)
      && rootP2(root) === expectedRoot);
    return Object.freeze({ value: JSON.parse(raw.subarray(0, size).toString('utf8')),
      sha256: digestP2(raw.subarray(0, size)), identity: Object.freeze(before) });
  } finally { fs.closeSync(fd); }
}
export function originalP2(root, rootIdentity) {
  const payment = readP2(root, rootIdentity, 'native-issued-original.pins.json');
  const services = readP2(root, rootIdentity, 'native-issued-service-originals.pins.json');
  const p = payment.value, s = services.value.first;
  requireP2(typeof p.resourceUrl === 'string' && typeof p.transactionHash === 'string'
    && /^[0-9a-f]{64}$/.test(p.transactionHash) && p.expectedPins.binding.paymentHash === p.transactionHash
    && typeof s.grantId === 'string' && typeof s.requestId === 'string'
    && typeof s.originalRequestJson === 'string' && typeof s.authorizationHeader === 'string');
  return Object.freeze({ payment, services });
}
