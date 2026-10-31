import { constants, lstatSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import {
  parseCurrentApiCreditSourceProfileArguments,
  planCurrentApiCreditSourceProfile,
  checkCurrentApiCreditSourceProfile,
  combineCurrentApiCreditSourceProfile,
} from '../qualification/acceptance/current-source-profile-core.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST = 'qualification/acceptance/api-credit-current.source-profile.json';
const MAX_FILE = 1048576;
let reads = 0, total = 0;
function fail() { throw new TypeError('API_CREDIT_SOURCE_PROFILE_FILE_REFUSED'); }
function identity(s) {
  return [s.dev,s.ino,s.mode,s.uid,s.gid,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
}
function directories(parent) {
  const result = [];
  for (let current = parent;; current = dirname(current)) {
    const stat = lstatSync(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
    result.push([current, identity(stat)]);
    if (current === parse(current).root) break;
  }
  return result;
}
function recheck(entries) {
  for (const [name, id] of entries) if (identity(lstatSync(name, { bigint: true })) !== id) fail();
}
// Metadata-only source observation. No application/package import, writer or
// child process. Before/open/after identity checks are not an atomic snapshot.
function readRelative(name, exactBytes = null) {
  if (typeof name !== 'string' || name.length > 512 || !/^[-A-Za-z0-9_@.+/]+$/.test(name)
    || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..')
    || name.startsWith('node_modules/') || ++reads > 2048) fail();
  const target = join(ROOT, name), ancestors = directories(dirname(target));
  const before = lstatSync(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || before.size < 1n || before.size > BigInt(MAX_FILE)
    || exactBytes !== null && before.size !== BigInt(exactBytes)) fail();
  const size = Number(before.size);
  if ((total += size) > 16777216) fail();
  const id = identity(before), fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let raw;
  try {
    if (identity(fstatSync(fd, { bigint: true })) !== id) fail();
    raw = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(fd, raw, offset, size - offset, offset);
      if (!count) fail();
      offset += count;
    }
    const tail = Buffer.alloc(1);
    if (readSync(fd, tail, 0, 1, size) !== 0 || identity(fstatSync(fd, { bigint: true })) !== id) fail();
  } finally { closeSync(fd); }
  if (identity(lstatSync(target, { bigint: true })) !== id) fail();
  recheck(ancestors);
  return raw;
}
const readSource = Object.freeze((name, size) => readRelative(name, size));
try {
  const args = parseCurrentApiCreditSourceProfileArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('Usage: node scripts/report-current-api-credit-profile.mjs --profile-sha256 HEX [--shard INDEX/COUNT | --merge-receipts qualification/receipts.json]\nSource identities only; no application/package execution or acceptance promotion.\n');
  } else {
    const plan = planCurrentApiCreditSourceProfile(readRelative(MANIFEST), args.profileSha256, readSource);
    let result;
    if (args.receipts !== null) {
      const raw = readRelative(args.receipts);
      if (raw.length > 524288) fail();
      const text = raw.toString('utf8');
      if (!Buffer.from(text, 'utf8').equals(raw)) fail();
      result = combineCurrentApiCreditSourceProfile(plan, JSON.parse(text));
    } else {
      const receipt = checkCurrentApiCreditSourceProfile(plan, readSource, args.shardIndex, args.shardCount);
      result = args.shardCount === 1 ? combineCurrentApiCreditSourceProfile(plan, [receipt]) : receipt;
    }
    process.stdout.write(JSON.stringify(result) + '\n');
  }
} catch {
  process.stderr.write('API_CREDIT_SOURCE_PROFILE_CHECK_REFUSED\n');
  process.exitCode = 1;
}
