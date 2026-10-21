import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, readSync, fstatSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

// One closed DATA-only entry. No other test entry, nonce search, material
// producer, SDK, wallet, network, signing, SQLite or native owner is imported.
// The two legacy validation cases below use declared difficulty ZERO only.
assert.equal(process.argv.length, 2);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.env.X402_DP_PRE_WORK_KEY_OPT_IN, 'reviewed-declared-data-only');
const EXACT_FILES = [
  "package.json",
  "qualification/dynamic-plasma-user-send-pre-work-key-binding.behavior.draft.mjs",
  "src/canonical.js",
  "src/x402-wire.js",
  "src/zenon/bounded-dynamic-plasma-strategy.js",
  "src/zenon/bounded-json-rpc-read-core.js",
  "src/zenon/dynamic-plasma-compatibility.js",
  "src/zenon/dynamic-plasma-json-rpc-read-transport.js",
  "src/zenon/dynamic-plasma-observation-normalizer.js",
  "src/zenon/dynamic-plasma-price-policy.js",
  "src/zenon/dynamic-plasma-required-fused-policy-adapter.js",
  "src/zenon/dynamic-plasma-required-fused-quote.js",
  "src/zenon/dynamic-plasma-user-send-key-binding.js",
  "src/zenon/dynamic-plasma-user-send-pre-work-key-binding.js",
  "src/zenon/dynamic-plasma-user-send-work-binding.js",
  "src/zenon/dynamic-plasma-user-send-work-input.js",
  "src/zenon/plasma-strategy.js",
  "src/zenon/transaction-planner.js"
];
const manifest = JSON.parse(process.env.X402_DP_PRE_WORK_KEY_SOURCE_PINS);
const ident = s => ['dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(k => String(s[k]));
function verifySources() {
  assert.ok(Array.isArray(manifest)); assert.equal(manifest.length, EXACT_FILES.length);
  assert.deepEqual(manifest.map(p => p.path).sort(), EXACT_FILES);
  assert.equal(new Set(manifest.map(p => p.path)).size, EXACT_FILES.length);
  let total = 0; const texts = new Map();
  for (const pin of manifest) {
    assert.deepEqual(Object.keys(pin).sort(), ['LF', 'bytes', 'gitBlob', 'identity', 'path', 'sha256']);
    assert.ok(Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && pin.bytes <= 65536);
    total += pin.bytes; assert.ok(total <= 262144);
    const path = fileURLToPath(new URL('../' + pin.path, import.meta.url));
    const before = lstatSync(path, { bigint: true });
    assert.ok(before.isFile() && !before.isSymbolicLink());
    assert.equal(before.uid, BigInt(process.getuid())); assert.equal(before.nlink, 1n);
    assert.deepEqual(ident(before), pin.identity);
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const data = Buffer.alloc(pin.bytes + 1); let count = 0;
    try {
      assert.deepEqual(ident(fstatSync(fd, { bigint: true })), pin.identity);
      while (count < data.length) {
        const got = readSync(fd, data, count, data.length - count, null);
        if (got === 0) break; count += got;
      }
      assert.deepEqual(ident(fstatSync(fd, { bigint: true })), pin.identity);
    } finally { closeSync(fd); }
    assert.deepEqual(ident(lstatSync(path, { bigint: true })), pin.identity);
    assert.equal(count, pin.bytes);
    const body = data.subarray(0, count), ascii = body.toString('ascii');
    assert.equal(body.includes(0) || body.some(b => b > 127), false);
    assert.equal(createHash('sha256').update(body).digest('hex'), pin.sha256);
    assert.equal(body.filter(b => b === 10).length, pin.LF);
    assert.equal(createHash('sha1').update(Buffer.from('blob ' + body.length + '\0')).update(body).digest('hex'), pin.gitBlob);
    texts.set(pin.path, ascii);
  }
  return texts;
}
const initialSources = verifySources();
after(() => assert.deepEqual(verifySources(), initialSources));
const { validateZenonUnsignedUserSendPreWorkKeyBinding: check }
  = await import('../src/zenon/dynamic-plasma-user-send-pre-work-key-binding.js');
const { snapshotZenonUnsignedUserSendFields: snapshot, computeZenonUnsignedUserSendHash: hash }
  = await import('../src/zenon/transaction-planner.js');
const { validateZenonUnsignedUserSendKeyBinding: legacy }
  = await import('../src/zenon/dynamic-plasma-user-send-key-binding.js');

const OPTIONS = { timeout: 5000, concurrency: false };
const ZERO = '0'.repeat(64), NONCE = '0'.repeat(16);
const PUBLIC = Buffer.alloc(32, 7).toString('base64'); // Fixed PUBLIC bytes, not a test private key or keypair.
const OTHER = Buffer.alloc(32, 9).toString('base64');
const SOURCE = 'src/zenon/dynamic-plasma-user-send-pre-work-key-binding.js';
const source = initialSources.get(SOURCE);
const clone = value => JSON.parse(JSON.stringify(value)); // Owned valid synthetic DATA only.

// Independent fixture encoder, not the implementation's address decoder.
// No search, randomness, key generation or signing occurs here.
function encodeAddress(core) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l', words = [];
  let accumulator = 0, bits = 0, checksum = 1;
  for (const value of core) {
    accumulator = (accumulator << 8) | value; bits += 8;
    while (bits >= 5) { bits -= 5; words.push((accumulator >>> bits) & 31); }
  }
  assert.equal(bits, 0);
  for (const word of [3, 0, 26, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25; checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    for (const [index, generator] of [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].entries())
      if ((top >>> index) & 1) checksum ^= generator;
  }
  checksum = (checksum ^ 1) >>> 0;
  return 'z1' + words.map(word => alphabet[word]).join('')
    + Array.from({ length: 6 }, (_, index) => alphabet[(checksum >>> (5 * (5 - index))) & 31]).join('');
}
function coreFor(publicKey) {
  return Buffer.concat([Buffer.from([0]), createHash('sha3-256').update(Buffer.from(publicKey, 'base64')).digest().subarray(0, 19)]);
}
const PAYER = encodeAddress(coreFor(PUBLIC)), FOREIGN = encodeAddress(coreFor(OTHER));
const DESTINATION = encodeAddress(Buffer.from([0, ...Array(19).fill(34)]));
function block(changes = {}) {
  return { version: 1, chainIdentifier: 73404, blockType: 2, hash: ZERO,
    previousHash: '66'.repeat(32), height: 7, momentumAcknowledged: { hash: '33'.repeat(32), height: 100 },
    address: PAYER, toAddress: DESTINATION, amount: '5', tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    fromBlockHash: ZERO, data: Buffer.alloc(32, 3).toString('base64'), fusedPlasma: 21000,
    difficulty: 0, nonce: NONCE, publicKey: PUBLIC, signature: '', ...changes };
}
function rejected(error) {
  assert.ok(error instanceof TypeError && Object.isFrozen(error));
  const code = 'zenon_user_send_pre_work_key_binding_input_rejected';
  assert.equal(error.code, code); assert.equal(error.message, code); assert.equal(error.stack, 'TypeError: ' + code);
  assert.equal(Object.hasOwn(error, 'cause'), false); assert.equal(error.stack.includes('PRIVATE'), false);
  return true;
}
function frozen(value) {
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) if (child !== null && typeof child === 'object') frozen(child);
}
function prepared(changes = {}) {
  const value = block(changes); assert.equal(value.difficulty, 0);
  value.hash = hash(value); return value;
}

test('pre-work key guard returns only a frozen detached public-byte address consistency receipt', OPTIONS, () => {
  const value = block(), result = check(value); frozen(result);
  assert.deepEqual(Object.keys(result), [
    'preWorkKeyValidationVersion', 'scope', 'stage', 'algorithm', 'subjectDigest', 'fieldDigest',
    'publicKey', 'address', 'addressCoreHex', 'keyAddressBinding', 'keyPossession', 'hashValidation',
    'workValidation', 'nonceGeneration', 'signatureValidation', 'preparation', 'signing',
    'publication', 'chainAuthentication', 'authority', 'afterSigningAction',
  ]);
  assert.equal(result.preWorkKeyValidationVersion, 1);
  assert.equal(result.scope, 'DECLARED_PRE_WORK_USER_SEND_PUBLIC_KEY_ADDRESS_CONSISTENCY');
  assert.equal(result.stage, 'BEFORE_NONCE_GENERATION');
  assert.equal(result.publicKey, PUBLIC); assert.equal(result.address, PAYER);
  assert.equal(result.addressCoreHex, coreFor(PUBLIC).toString('hex'));
  assert.equal(result.keyAddressBinding, 'MATCHES_SUPPLIED_PUBLIC_KEY_BYTES');
  assert.equal(Object.hasOwn(result, 'accountBlock'), false);
});

test('pre-work key guard reuses exact subject and field digests without claiming block hash validity', OPTIONS, () => {
  const value = block(), fields = snapshot(value), result = check(value);
  assert.equal(result.subjectDigest, fields.subjectDigest); assert.equal(result.fieldDigest, fields.fieldDigest);
  assert.notEqual(hash(value), value.hash);
  assert.equal(result.hashValidation, 'NOT_PERFORMED'); assert.equal(value.hash, ZERO);
});

test('pre-work key guard accepts positive declared difficulty without evaluating a candidate or inventing work evidence', OPTIONS, () => {
  const result = check(block({ difficulty: Number.MAX_SAFE_INTEGER, fusedPlasma: 0 }));
  for (const field of ['hashValidation', 'workValidation', 'nonceGeneration', 'signatureValidation',
    'preparation', 'signing', 'publication']) assert.equal(result[field], 'NOT_PERFORMED');
  assert.equal(result.authority, 'NONE'); assert.equal(result.afterSigningAction, 'NONE');
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED'); assert.equal(result.keyPossession, 'NOT_ESTABLISHED');
});

test('pre-work key guard matches separate fixed public-byte address vectors through an independent fixture encoder', OPTIONS, () => {
  for (const byte of [0, 7, 9]) {
    const publicKey = Buffer.alloc(32, byte).toString('base64'), address = encodeAddress(coreFor(publicKey));
    const result = check(block({ publicKey, address }));
    assert.equal(result.addressCoreHex, coreFor(publicKey).toString('hex'));
    assert.equal(result.publicKey, publicKey); assert.equal(result.keyPossession, 'NOT_ESTABLISHED');
  }
});

test('pre-work key guard rejects another canonical public key rather than repairing the original payer', OPTIONS, () => {
  const value = block({ publicKey: OTHER }), before = clone(value);
  assert.throws(() => check(value), rejected); assert.deepEqual(value, before);
});

test('pre-work key guard rejects another valid payer address rather than returning material for it', OPTIONS, () => {
  const value = block({ address: FOREIGN }), before = clone(value);
  assert.throws(() => check(value), rejected); assert.deepEqual(value, before);
});

test('pre-work key guard does not confuse a non-user address core with the supplied public key user address', OPTIONS, () => {
  const core = coreFor(PUBLIC); core[0] = 1;
  assert.throws(() => check(block({ address: encodeAddress(core) })), rejected);
});

test('pre-work key guard refuses empty malformed noncanonical or non-32-byte public keys', OPTIONS, () => {
  for (const publicKey of ['', 'not-public', 'B'.repeat(43) + '=', Buffer.alloc(31, 7).toString('base64'),
    Buffer.alloc(33, 7).toString('base64'), PUBLIC.replace(/=$/, '')])
    assert.throws(() => check(block({ publicKey })), rejected);
});

test('pre-work key guard refuses already hashed nonzero nonce or signed blocks without normalization', OPTIONS, () => {
  for (const changes of [{ hash: '11'.repeat(32) }, { nonce: '0102030405060708' }, { signature: 'not-a-signature' }]) {
    const value = block(changes), before = clone(value);
    assert.throws(() => check(value), rejected); assert.deepEqual(value, before);
  }
});

test('pre-work key guard refuses malformed address checksum token or original unsigned field grammar', OPTIONS, () => {
  for (const changes of [{ address: PAYER.slice(0, -1) + (PAYER.endsWith('q') ? 'p' : 'q') },
    { toAddress: 'not-an-address' }, { tokenStandard: 'not-a-token' }, { amount: '05' },
    { difficulty: -0 }, { fusedPlasma: Number.MAX_SAFE_INTEGER + 1 }, { blockType: 3 }])
    assert.throws(() => check(block(changes)), rejected);
});

test('pre-work key guard rejects missing or surplus fields and operational decorations', OPTIONS, () => {
  const missing = block(); delete missing.nonce;
  for (const value of [missing, { ...block(), phase: 'UNSIGNED' }, { ...block(), authority: 'SIGN' },
    { ...block(), signer: () => assert.fail('No signer may run') }, { ...block(), wallet: {} },
    { ...block(), [Symbol('PRIVATE')]: true }]) assert.throws(() => check(value), rejected);
});

test('pre-work key guard checks exact arity and object shape without coercion', OPTIONS, () => {
  assert.throws(() => check(), rejected); assert.throws(() => check(block(), null), rejected);
  for (const value of [null, undefined, [], 'block', 1, Object.create(null)])
    assert.throws(() => check(value), rejected);
});

test('pre-work key guard rejects selected getters and proxies without invoking caller hooks', OPTIONS, () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_HOOK'); };
  const outer = block(), nested = block();
  Object.defineProperty(outer, 'publicKey', { enumerable: true, get: hook });
  Object.defineProperty(nested.momentumAcknowledged, 'hash', { enumerable: true, get: hook });
  for (const value of [outer, nested, new Proxy(block(), { get: hook, ownKeys: hook, getPrototypeOf: hook })])
    assert.throws(() => check(value), rejected);
  assert.equal(hooks, 0);
});

test('pre-work key guard refuses primitive conversion and inherited records without invoking them', OPTIONS, () => {
  let hooks = 0; const hook = () => { hooks++; throw Error('PRIVATE_COERCION'); };
  for (const value of [block({ publicKey: { toString: hook, [Symbol.toPrimitive]: hook } }),
    block({ amount: { toString: hook } }), Object.assign(Object.create({ then: hook }), block())])
    assert.throws(() => check(value), rejected);
  assert.equal(hooks, 0);
});

test('pre-work key guard leaves caller records mutable and never rewrites original fields', OPTIONS, () => {
  const value = block(), before = clone(value), result = check(value);
  assert.deepEqual(value, before); assert.equal(Object.isFrozen(value), false);
  assert.equal(Object.isFrozen(value.momentumAcknowledged), false);
  value.publicKey = OTHER; value.address = FOREIGN; value.amount = '9'; value.momentumAcknowledged.height++;
  assert.equal(result.publicKey, PUBLIC); assert.equal(result.address, PAYER); frozen(result);
});

test('pre-work key guard is a repeatable DATA predicate not an admission reset or signing capability', OPTIONS, () => {
  const value = block(), first = check(value), second = check(value);
  assert.deepEqual(first, second); assert.notEqual(first, second);
  for (const key of ['sign', 'publish', 'reset', 'retry', 'close', 'nonce', 'hash', 'payment', 'payload'])
    assert.equal(Object.hasOwn(first, key), false);
});

test('pre-work key guard reports a closed refusal without raw input paths callbacks or retained causes', OPTIONS, () => {
  let error; try { check(block({ address: 'PRIVATE_ADDRESS' })); } catch (caught) { error = caught; }
  assert.ok(rejected(error)); assert.equal(Object.getOwnPropertyDescriptor(error, 'code').writable, false);
  assert.equal(Object.getOwnPropertyDescriptor(error, 'stack').configurable, false);
  assert.deepEqual(Object.keys(error), ['code']);
});

test('pre-work key guard preserves absence of curve point key possession funding and chain authentication proof', OPTIONS, () => {
  const publicKey = Buffer.alloc(32).toString('base64'), address = encodeAddress(coreFor(publicKey));
  const result = check(block({ publicKey, address }));
  assert.equal(result.keyAddressBinding, 'MATCHES_SUPPLIED_PUBLIC_KEY_BYTES');
  assert.equal(result.keyPossession, 'NOT_ESTABLISHED'); assert.equal(result.signatureValidation, 'NOT_PERFORMED');
  assert.equal(result.chainAuthentication, 'NOT_ESTABLISHED'); assert.equal(result.authority, 'NONE');
});

test('pre-work key guard does not substitute for the unchanged completed hash and zero-work legacy key validator', OPTIONS, () => {
  const value = prepared(), before = clone(value), result = legacy(value);
  assert.equal(result.keyAddressBinding, 'MATCHES_SUPPLIED_PUBLIC_KEY_BYTES');
  assert.equal(result.workBinding.work.validation, 'NOT_REQUIRED_BY_DECLARED_ZERO_DIFFICULTY');
  assert.throws(() => check(value), rejected); assert.deepEqual(value, before);
});

test('pre-work key guard and unchanged legacy validator both refuse canonical key bytes not matching the payer', OPTIONS, () => {
  const value = prepared(); value.publicKey = OTHER;
  assert.throws(() => check(block({ publicKey: OTHER })), rejected);
  assert.throws(() => legacy(value), error => {
    assert.equal(error.code, 'zenon_user_send_key_binding_input_rejected'); return true;
  });
  assert.equal(value.publicKey, OTHER); assert.equal(value.address, PAYER);
});

test('pre-work key guard does not turn coherent changed transfer DATA into authenticated intent or payer authority', OPTIONS, () => {
  const first = check(block()), changed = check(block({ amount: '6', data: Buffer.alloc(32, 8).toString('base64') }));
  assert.equal(first.keyAddressBinding, changed.keyAddressBinding);
  assert.notEqual(first.subjectDigest, changed.subjectDigest); assert.notEqual(first.fieldDigest, changed.fieldDigest);
  assert.equal(changed.authority, 'NONE'); assert.equal(changed.signing, 'NOT_PERFORMED');
});

test('pre-work key guard source is one fixed public-byte validation stage without work producer owner SDK or active cutover', OPTIONS, () => {
  assert.equal((source.match(/^export /gm) ?? []).length, 1);
  assert.match(source, /const SNAPSHOT_FIELDS = snapshotZenonUnsignedUserSendFields/);
  assert.match(source, /const HASH_CORES = decodeZenonUserSendHashCores/);
  assert.match(source, /block.hash !== ZERO_HASH/); assert.match(source, /block.nonce !== ZERO_NONCE/);
  assert.doesNotMatch(source, /nonce-search|bounded-material|node:(?:fs|https?|tls|dns|sqlite|child_process|worker_threads)|fetch\s*\(|setTimeout|generateKeyPair|crypto\.sign|crypto\.verify/);
  assert.match(source, /Full original-quote\/hash\/work\/key checks at assembly must remain in place/);
  assert.match(source, /not a sandbox/);
});

test('pre-work key guard selected import graph excludes every nonce material SDK wallet and operational owner module', OPTIONS, () => {
  assert.equal(manifest.length, 18);
  for (const path of EXACT_FILES)
    assert.doesNotMatch(path, /nonce-search|bounded-material|observed-balance-planner|https-|wallet|settlement-child|node_modules/);
  assert.equal(initialSources.get('src/zenon/dynamic-plasma-user-send-key-binding.js').length, 4237);
  assert.equal(Object.hasOwn(check, 'prepareUnsigned'), false);
});
