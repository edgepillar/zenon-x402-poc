import test from 'node:test';
import assert from 'node:assert/strict';
import {
  X402PaymentMechanism,
  assertX402PaymentMechanism,
} from '../src/x402/payment-mechanism.js';
import { ChainProfile } from '../src/zenon/chain-profile.js';
import {
  WalletAdapter,
  assertWalletAdapter,
} from '../src/zenon/wallet-adapter.js';
import {
  ZenonTransactionPlanner,
  assertZenonTransactionPlanner,
} from '../src/zenon/transaction-planner.js';
import {
  PlasmaStrategy,
  assertPlasmaStrategy,
} from '../src/zenon/plasma-strategy.js';
import {
  SettlementRepository,
  assertSettlementRepository,
} from '../src/settlement/settlement-repository.js';
import { SettlementJournal } from '../src/settlement-journal.js';
import {
  sameRequirements,
  validatePaymentPayloadEnvelope,
  validatePaymentRequired,
  validateRequirement,
} from '../src/x402-wire.js';

const PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: 'ab'.repeat(32),
});

test('ChainProfile is an immutable internal wrapper with a plain wire representation', () => {
  const profile = ChainProfile.fromWire(PROFILE);
  const wire = profile.toWire();

  assert.equal(Object.isFrozen(profile), true);
  assert.deepEqual(wire, PROFILE);
  assert.notEqual(wire, PROFILE);
  assert.equal(Object.getPrototypeOf(wire), Object.prototype);
  assert.equal(profile.version, 1);
  assert.equal(profile.chainIdentifier, '7');
  assert.equal(profile.genesisMomentumHash, PROFILE.genesisMomentumHash);
  wire.chainIdentifier = '8';
  assert.equal(profile.chainIdentifier, '7');
});

test('ChainProfile equality compares the complete validated chain identity', () => {
  const profile = ChainProfile.fromWire(PROFILE);

  assert.equal(profile.equals(ChainProfile.fromWire(PROFILE)), true);
  assert.equal(profile.equals({ ...PROFILE }), true);
  assert.equal(profile.equals({ ...PROFILE, chainIdentifier: '8' }), false);
  assert.equal(profile.equals({ ...PROFILE, genesisMomentumHash: 'cd'.repeat(32) }), false);
  assert.equal(profile.equals({ ...PROFILE, unexpected: true }), false);
  assert.equal(profile.equals(null), false);
});

test('ChainProfile delegates strict wire validation to the existing validator', () => {
  assert.throws(
    () => ChainProfile.fromWire({ ...PROFILE, chainIdentifier: '07' }),
    /canonical nonzero decimal string/,
  );
  assert.throws(
    () => ChainProfile.fromWire({ ...PROFILE, unexpected: true }),
    /unexpected field/,
  );
});

test('WalletAdapter defines a minimal signing-only structural boundary', async () => {
  const abstractWallet = new WalletAdapter();
  await assert.rejects(abstractWallet.getAddress(), /WalletAdapter\.getAddress\(\) must be implemented/);
  await assert.rejects(abstractWallet.sign({}), /WalletAdapter\.sign\(\) must be implemented/);

  const wallet = {
    getAddress: async () => 'address',
    sign: async block => block,
  };
  assert.equal(assertWalletAdapter(wallet), wallet);
  assert.throws(() => assertWalletAdapter({}), /getAddress/);
  assert.throws(() => assertWalletAdapter({ ...wallet, sign: undefined }), /sign/);
});

test('ZenonTransactionPlanner requires an unsigned preparation operation', async () => {
  await assert.rejects(
    new ZenonTransactionPlanner().prepareUnsigned({}),
    /ZenonTransactionPlanner\.prepareUnsigned\(\) must be implemented/,
  );
  const planner = { prepareUnsigned: async () => ({}) };
  assert.equal(assertZenonTransactionPlanner(planner), planner);
  assert.throws(() => assertZenonTransactionPlanner({}), /prepareUnsigned/);
});

test('PlasmaStrategy requires separate quote and apply operations', async () => {
  const strategy = new PlasmaStrategy();
  await assert.rejects(strategy.quote({}), /PlasmaStrategy\.quote\(\) must be implemented/);
  await assert.rejects(strategy.apply({}, {}), /PlasmaStrategy\.apply\(\) must be implemented/);

  const implementation = {
    quote: async () => Object.freeze({ mode: 'legacy' }),
    apply: async ({ block }) => block,
  };
  assert.equal(assertPlasmaStrategy(implementation), implementation);
  assert.throws(() => assertPlasmaStrategy({ quote() {} }), /apply/);
});

test('SettlementRepository captures the existing journal operation surface', async () => {
  await assert.rejects(new SettlementRepository().load(), /SettlementRepository\.load\(\) must be implemented/);

  const repository = Object.fromEntries([
    'load',
    'putValidated',
    'get',
    'findByTransactionHash',
    'updateEvidence',
    'markDeliveryPending',
    'markDelivered',
    'list',
  ].map(method => [method, async () => undefined]));

  assert.equal(assertSettlementRepository(repository), repository);
  const currentJournal = new SettlementJournal();
  assert.equal(assertSettlementRepository(currentJournal), currentJournal);
  assert.throws(
    () => assertSettlementRepository({ ...repository, markDelivered: undefined }),
    /markDelivered/,
  );
});

test('X402PaymentMechanism defines the injected mechanism validation surface', () => {
  const mechanism = {
    scheme: 'exact',
    validateRequirement() {},
    validatePaymentRequired() {},
    validatePaymentPayloadEnvelope() {},
    sameRequirements() { return true; },
  };

  assert.equal(assertX402PaymentMechanism(mechanism), mechanism);
  assert.throws(() => new X402PaymentMechanism().scheme, /X402PaymentMechanism\.scheme must be implemented/);
  assert.throws(() => assertX402PaymentMechanism({ ...mechanism, scheme: '' }), /scheme/);
  assert.throws(
    () => assertX402PaymentMechanism({ ...mechanism, validatePaymentPayloadEnvelope: undefined }),
    /validatePaymentPayloadEnvelope/,
  );
});

test('the mechanism contract can facade the current validation functions without rewiring them', () => {
  const mechanism = {
    scheme: 'exact',
    validateRequirement,
    validatePaymentRequired,
    validatePaymentPayloadEnvelope,
    sameRequirements,
  };
  assert.equal(assertX402PaymentMechanism(mechanism), mechanism);
});
