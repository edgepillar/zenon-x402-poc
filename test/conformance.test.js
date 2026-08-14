import test from 'node:test';
import assert from 'node:assert/strict';
import { sha512 } from '@noble/hashes/sha2';
import * as ed from '@noble/ed25519';
import * as sdk from 'znn-typescript-sdk';
import { computeBlockHash } from '../src/zenon-payment.js';

// Re-expressed from 0x3639/zenon-sdk-spec at pinned commit
// 69f2ecf955bafa4037c73f4b858619ef834e738b. That community specification
// traces these cases to reference SDK behavior; canonical go-zenon remains the
// higher authority for consensus acceptance rules.
ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));

const REFERENCE_PUBLIC_KEY = '881967d6529347a07f73ee2c5f0596b1b4bce44b828ac0a1fd77a0c3f1903559';
const REFERENCE_BLOCK_HASH = '29f94ff770bcd56b7d6b120c8bc2021bc66c992e5fdc68b8147d03a82e02f2dc';

test('portable vector: account-block.hash.user-send-with-data', () => {
  const block = sdk.AccountBlockTemplate.fromJson({
    version: 1,
    chainIdentifier: 1,
    blockType: 2,
    hash: '0'.repeat(64),
    previousHash: '0'.repeat(64),
    height: 1,
    momentumAcknowledged: { hash: '0'.repeat(64), height: 0 },
    address: 'z1qqjnwjjpnue8xmmpanz6csze6tcmtzzdtfsww7',
    toAddress: 'z1qzal6c5s9rjnnxd2z7dvdhjxpmmj4fmw56a0mz',
    amount: '100000000',
    tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
    fromBlockHash: '0'.repeat(64),
    data: 'SGVsbG8gWmVub24=',
    fusedPlasma: 7,
    difficulty: 0,
    nonce: '0000000000000000',
    publicKey: '',
    signature: '',
  });
  assert.equal(computeBlockHash(block, sdk).toString(), REFERENCE_BLOCK_HASH);
});

test('portable vector: account-block.sign.user-send-with-data verifies strictly', () => {
  const signature = Buffer.from(
    'd271501c59ec9ee0e9d374a2d0941c27bf08447e589e78e5b55d4e4ae94e1a76' +
    '82e0e4fb666bf7ef88b46e8eedf0b235f794fd70a6c65bb17943dccdfbb13a07',
    'hex',
  );
  assert.equal(
    ed.verify(
      signature,
      Buffer.from(REFERENCE_BLOCK_HASH, 'hex'),
      Buffer.from(REFERENCE_PUBLIC_KEY, 'hex'),
      { zip215: false },
    ),
    true,
  );
});

test('portable vector: address.from-public-key.reference', () => {
  assert.equal(
    sdk.Address.fromPublicKey(Buffer.from(REFERENCE_PUBLIC_KEY, 'hex')).toString(),
    'z1qq9n7fpaqd8lpcljandzmx4xtku9w4ftwyg0mq',
  );
});

test('portable vector: hash-height.to-bytes.height-100', () => {
  const hashHeight = new sdk.HashHeight(
    sdk.Hash.parse('644bcc7e564373040999aac89e7622f3ca71fba1d972fd94a31c3bfbf24e3938'),
    100,
  );
  assert.equal(
    Buffer.from(hashHeight.getBytes()).toString('hex'),
    '644bcc7e564373040999aac89e7622f3ca71fba1d972fd94a31c3bfbf24e39380000000000000064',
  );
});

test('portable vector: token-standard.from-core.zero', () => {
  assert.equal(
    sdk.TokenStandard.fromCore(Buffer.alloc(10)).toString(),
    'zts1qqqqqqqqqqqqqqqqtq587y',
  );
});
