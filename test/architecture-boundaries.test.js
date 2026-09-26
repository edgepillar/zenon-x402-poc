import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
import { ExactZenonFacilitator } from '../src/zenon-payment.js';
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

const assertSourceOrder = (section, markers) => {
  let offset = 0;
  for (const marker of markers) {
    const index = section.indexOf(marker, offset);
    assert.notEqual(index, -1, `missing ordered source marker: ${marker}`);
    offset = index + marker.length;
  }
};

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

test('retained-transition inspector stays source-only and test-imported', () => {
  const inspectorName = 'inspectZenonExactHashRecoveryRetainedTransition';
  const runnerUrl = new URL('../src/live-evidence-runner.js', import.meta.url);
  const focusedTest =
    'test/live-evidence-reset-epoch-exact-hash-transition-inspector.test.js';
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const packageJson = JSON.parse(packageText);
  assert.equal(packageJson.exports, undefined);
  assert.equal(packageJson.bin, undefined);
  assert.equal(packageText.includes(inspectorName), false);

  const rootUrls = [
    ['src/', new URL('../src/', import.meta.url)],
    ['test/', new URL('../test/', import.meta.url)],
  ];
  const users = [];
  for (const [prefix, rootUrl] of rootUrls) {
    const pending = [rootUrl];
    while (pending.length > 0) {
      const directory = pending.pop();
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const candidate = new URL(entry.name, directory);
        if (entry.isDirectory()) {
          pending.push(new URL(`${entry.name}/`, directory));
          continue;
        }
        if (!entry.isFile() || !candidate.pathname.endsWith('.js') ||
            candidate.href === import.meta.url || candidate.href === runnerUrl.href) continue;
        const source = readFileSync(candidate, 'utf8');
        if (source.includes(inspectorName)) {
          users.push(`${prefix}${candidate.href.slice(rootUrl.href.length)}`);
        }
      }
    }
  }
  assert.deepEqual(users, [focusedTest]);
});

test('v4 quick-tunnel launch provenance stays private and source-only', () => {
  const launcher = readFileSync(
    new URL('../src/gate-b-quick-tunnel-launcher.js', import.meta.url),
    'utf8',
  );
  const owner = readFileSync(
    new URL('../src/gate-b-reset-epoch-v4-fresh-input-owner.js', import.meta.url),
    'utf8',
  );
  const documentation = [
    readFileSync(new URL('../README.md', import.meta.url), 'utf8'),
    readFileSync(new URL('../SECURITY.md', import.meta.url), 'utf8'),
    readFileSync(new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url), 'utf8'),
  ];
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.match(launcher, /const HANDOFF_LAUNCH_PROVENANCE = new WeakMap\(\);/u);
  assert.match(launcher, /captured-default-dependencies/u);
  assert.match(launcher, /injected-test-only-dependencies/u);
  assert.match(
    launcher,
    /export function readGateBQuickTunnelHostnameSourceHandoffProvenance\(handoff\)/u,
  );
  assert.match(launcher, /const attenuated = OBJECT_CREATE\(null\);/u);
  assert.match(launcher, /return provenance\.attenuated;/u);
  assert.match(launcher, /const NATIVE_PROMISE_CONSTRUCTOR_DESCRIPTOR/u);
  assert.match(launcher, /const value = await promise;/u);
  assert.deepEqual(
    [...launcher.matchAll(/async function ([A-Za-z0-9]+)\(/gu)]
      .map(match => match[1])
      .sort(),
    [
      'launchGateBQuickTunnelInternalSettlement',
      'observeNativePromiseSettlement',
      'reapUnvalidatedChildSettlement',
    ],
  );
  assert.match(
    launcher,
    /function observeNativePromise\(promise, fulfilled, rejected\) \{\s*return pinNativePromiseConstructor\(\s*observeNativePromiseSettlement\(promise, fulfilled, rejected\),\s*\);\s*\}/u,
  );
  assert.match(
    launcher,
    /function reapUnvalidatedChild\(snapshot, dependencies, authoritativeGroup\) \{\s*return pinNativePromiseConstructor\(reapUnvalidatedChildSettlement\(/u,
  );
  assert.match(
    launcher,
    /function launchGateBQuickTunnelInternal\([\s\S]*?return pinNativePromiseConstructor\(launchGateBQuickTunnelInternalSettlement\(/u,
  );
  assert.doesNotMatch(launcher, /\bPromise\.(?:resolve|reject|race)\b/u);
  assert.doesNotMatch(launcher, /Promise\.prototype\.then/u);
  assert.match(owner, /quickTunnelLaunchProvenance,/u);
  assert.match(
    owner,
    /quickTunnelDependencySelection:\s*\n\s*quickTunnelLaunchProvenance\.dependencySelection,/u,
  );
  assert.match(
    owner,
    /quickTunnelProcessGroupSelection:\s*\n\s*quickTunnelLaunchProvenance\.processGroupSelection,/u,
  );
  assert.match(
    owner,
    /quickTunnelLaunchProvenance:\s*completionState\.quickTunnelLaunchProvenance,/u,
  );
  assert.doesNotMatch(owner, /quickTunnelLaunchProvenance\.(?:handoff|lease)/u);
  assert.match(
    owner,
    /await workspace\.close\(\);\s*workspace = undefined;\s*currentQuickTunnelLaunchProvenance\(\s*handoff,\s*quickTunnelLaunchProvenance,\s*\);\s*return createCompletionCapability\(/u,
  );
  assert.doesNotMatch(packageText, /launch-provenance|completion-capability/u);
  assert.doesNotMatch(
    launcher,
    /export (?:const|function) .*?DependencySelection/u,
  );
  for (const text of documentation) {
    assert.match(text, /dependency-selection provenance under operator trust/u);
    assert.match(text, /future-live-ineligible/u);
  }

  const validationName = 'validateGateBResetEpochV4CompletionCapability';
  const ownerUrl = new URL(
    '../src/gate-b-reset-epoch-v4-fresh-input-owner.js',
    import.meta.url,
  );
  const users = [];
  const pending = [new URL('../src/', import.meta.url)];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        pending.push(new URL(`${entry.name}/`, directory));
        continue;
      }
      if (!entry.isFile() || !candidate.pathname.endsWith('.js') ||
          candidate.href === ownerUrl.href) continue;
      if (readFileSync(candidate, 'utf8').includes(validationName)) {
        users.push(candidate.href);
      }
    }
  }
  assert.deepEqual(users, []);
});

test('delivery claims carry the authenticated accepted requirement across every concrete boundary', () => {
  assert.equal(
    SettlementRepository.prototype.markDeliveryPending.length,
    3,
    'the repository contract must reject the legacy two-argument claim boundary',
  );
  assert.equal(
    SettlementJournal.prototype.markDeliveryPending.length,
    3,
    'the journal must receive authorization, transaction, and accepted requirement',
  );
  assert.equal(
    ExactZenonFacilitator.prototype.markDeliveryPending.length,
    2,
    'the facilitator must receive settlement evidence and the accepted requirement',
  );
});

test('Zenon funding, signing, and external-holder handoff sources remain inactive', () => {
  const compositionNames = [
    'service-credit-zenon-funding-composition.js',
    'service-credit-zenon-durable-http-composition.js',
    'service-credit-zenon-durable-https-router.js',
    'service-credit-zenon-https-operator-pilot.js',
    'service-credit-zenon-provider-signing-child-protocol.js',
    'service-credit-zenon-provider-signing-operation.js',
    'service-credit-bounded-https-ingress-owner.js',
    'service-credit-bounded-node-https-server-factory.js',
    'service-credit-zenon-funding-intake-sqlite-store.js',
    'service-credit-zenon-funding-intake.js',
    'service-credit-zenon-funding-intake-http.js',
    'service-credit-zenon-funding-intake-http-post-v1.js',
    'service-credit-zenon-funding-intake-https-owner-v1.js',
    'service-credit-zenon-funding-post-v1-client.js',
    'service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js',
    'service-credit-zenon-funding-post-v1-payer-recovery-owner.js',
    'service-credit-zenon-funding-observation-producer.js',
    'service-credit-zenon-funding-observation-source-owner.js',
    'service-credit-zenon-funding-json-rpc-read-transport.js',
    'service-credit-zenon-funding-https-read-transport-owner.js',
    'service-credit-zenon-funding-publication-bridge.js',
    'service-credit-external-holder-grant-descriptor-handoff-http-ingress.js',
    'service-credit-external-holder-grant-descriptor-handoff-http.js',
    'service-credit-external-holder-grant-descriptor-handoff.js',
  ];
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const packageJson = JSON.parse(packageText);
  for (const compositionName of compositionNames) {
    assert.equal(packageText.includes(compositionName), false);
  }
  assert.doesNotMatch(packageText, /native\/provider-attestor|provider-attestor-release-candidate/);
  assert.equal(packageJson.bin, undefined);
  assert.equal(packageJson.exports, undefined);

  const roots = new Set([
    '../src/buyer.js',
    '../src/resource-server.js',
    '../src/zenon-payment.js',
  ].map(path => new URL(path, import.meta.url).href));
  for (const script of Object.values(packageJson.scripts)) {
    if (script === 'node --test') continue;
    const match = /^node (src\/[A-Za-z0-9._/-]+\.js)$/.exec(script);
    assert.ok(match, 'every non-test package script must be an inspected Node CLI');
    roots.add(new URL(`../${match[1]}`, import.meta.url).href);
  }

  const visited = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const href = pending.pop();
    if (visited.has(href)) continue;
    visited.add(href);
    for (const compositionName of compositionNames) {
      assert.equal(href.endsWith(`/${compositionName}`), false);
    }
    const url = new URL(href);
    if (!existsSync(url)) continue;
    const source = readFileSync(url, 'utf8');
    assert.doesNotMatch(source, /native\/provider-attestor|provider-attestor-release-candidate/);
    for (const compositionName of compositionNames.slice(2)) {
      assert.equal(source.includes(compositionName), false);
    }
    for (const match of source.matchAll(
      /(?:from\s+|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g,
    )) {
      const dependency = new URL(match[1], url);
      if (dependency.pathname.endsWith('.js')) pending.push(dependency.href);
    }
  }
});

test('funding observation producer keeps Dynamic Plasma DTO parsing offline and non-authorizing', () => {
  const producerName = 'service-credit-zenon-funding-observation-producer.js';
  const source = readFileSync(new URL(`../src/${producerName}`, import.meta.url), 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.deepEqual(
    [...source.matchAll(/from '([^']+)';/g)].map(match => match[1]),
    [
      'node:util',
      './service-credit-zenon-funding-observer-sqlite-store.js',
      './service-credit-zenon-funding-provider-attestation.js',
    ],
  );
  assert.equal(packageText.includes(producerName), false);
  assert.doesNotMatch(source, /node:(?:https?|http2|net|tls|dns)|\.listen\s*\(|\bfetch\s*\(|WebSocket|process\.env/);
  assert.doesNotMatch(source, /dynamic-plasma-(?:json-rpc|https|observation-collector)/);
  assert.match(source, /\['nextFusionPrice', 'nextWorkPrice'\]/);
  assert.match(source, /if \(result\.data !== ''\) fail\('INVALID_INPUT'\)/);
  assert.match(source, /function validateMomentumVersionLineage\(items\)/);
  assert.match(source, /const VERSION_LINEAGE = STORE_PROTOTYPE\.admitMomentumVersionLineage/);
});

test('funding observation source owner is an exact default-off injected read boundary', () => {
  const ownerName = 'service-credit-zenon-funding-observation-source-owner.js';
  const source = readFileSync(new URL(`../src/${ownerName}`, import.meta.url), 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.deepEqual(
    [...source.matchAll(/from '([^']+)';/g)].map(match => match[1]),
    [
      'node:util',
      './service-credit-zenon-funding-observation-producer.js',
      './service-credit-zenon-funding-observer-sqlite-store.js',
    ],
  );
  assert.equal(packageText.includes(ownerName), false);
  assert.doesNotMatch(source, /node:(?:https?|http2|net|tls|dns)|\.listen\s*\(|\bfetch\s*\(|WebSocket|process\.env/);
  assert.doesNotMatch(source, /dynamic-plasma-(?:json-rpc|https|observation-collector)/);
  assert.doesNotMatch(source, /from '[^']*(?:wallet|signing|publication|grant|service-credit-store)[^']*'/);
  assert.doesNotMatch(source, /\b(?:sign|publish|settle|activateGrant)\s*\(/);
  assert.equal((source.match(/'ledger\.getFrontierMomentum'/g) ?? []).length, 3);
  assert.equal((source.match(/'ledger\.getMomentumByHash'/g) ?? []).length, 2);
  assert.equal((source.match(/'ledger\.getMomentumsByHeight'/g) ?? []).length, 1);
  assert.equal((source.match(/'ledger\.getAccountBlockByHash'/g) ?? []).length, 1);
  assert.match(source, /const MAX_PAGE_ENTRIES = 64/);
  assert.match(source, /snapshotRecord\(store, candidate\.expectedRevision\)/);
  assertSourceOrder(source, [
    'if (finishing || !closeSettled)',
    'if (!closeClean || !invariant())',
    'snapshotRecord(store, candidate.expectedRevision)',
    'producer.apply',
  ]);
});

test('funding and Dynamic Plasma JSON-RPC adapters share only a bounded method-neutral core', () => {
  const coreName = 'bounded-json-rpc-read-core.js';
  const fundingName = 'service-credit-zenon-funding-json-rpc-read-transport.js';
  const core = readFileSync(new URL(`../src/zenon/${coreName}`, import.meta.url), 'utf8');
  const dynamic = readFileSync(
    new URL('../src/zenon/dynamic-plasma-json-rpc-read-transport.js', import.meta.url),
    'utf8',
  );
  const funding = readFileSync(new URL(`../src/${fundingName}`, import.meta.url), 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.equal(packageText.includes(coreName), false);
  assert.equal(packageText.includes(fundingName), false);
  assert.deepEqual([...core.matchAll(/from '([^']+)';/g)].map(match => match[1]), ['node:util']);
  assert.deepEqual([...dynamic.matchAll(/from '([^']+)';/g)].map(match => match[1]), [
    'node:util',
    './bounded-json-rpc-read-core.js',
  ]);
  assert.deepEqual([...funding.matchAll(/from '([^']+)';/g)].map(match => match[1]), [
    'node:util',
    './zenon/bounded-json-rpc-read-core.js',
  ]);
  for (const source of [core, dynamic, funding]) {
    assert.doesNotMatch(source, /node:(?:https?|http2|net|tls|dns|fs)|\.listen\s*\(|\bfetch\s*\(|WebSocket|process\.env/);
    assert.doesNotMatch(source, /JSON\.(?:parse|stringify)\s*\(/);
    assert.doesNotMatch(source, /\b(?:sign|publish|activateGrant)\s*\(/);
  }
  assert.doesNotMatch(core, /ledger\.|embedded\./);
  assert.doesNotMatch(dynamic, /ledger\.getMomentumByHash|ledger\.getAccountBlockByHash/);
  assert.doesNotMatch(dynamic, /'zenon_funding'/);
  assert.doesNotMatch(funding, /embedded\.|'dynamic_plasma'/);
  assert.equal((funding.match(/'ledger\.getFrontierMomentum'/g) ?? []).length, 1);
  assert.equal((funding.match(/'ledger\.getMomentumByHash'/g) ?? []).length, 1);
  assert.equal((funding.match(/'ledger\.getMomentumsByHeight'/g) ?? []).length, 1);
  assert.equal((funding.match(/'ledger\.getAccountBlockByHash'/g) ?? []).length, 1);
  assert.match(funding, /const MAX_REQUESTS = 6/);
  assert.match(core, /const MAX_RESULT_BYTES = 1048576/);
  assert.match(core, /const MAX_RESPONSE_BYTES = MAX_RESULT_BYTES \+ 4096/);
  assert.match(core, /const MAX_DEPTH = 17/);
  const pending = [new URL('../src/', import.meta.url)];
  const importers = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = new URL(entry.name, directory);
      if (entry.isDirectory()) pending.push(new URL(`${entry.name}/`, directory));
      else if (entry.isFile() && candidate.pathname.endsWith('.js')) {
        const candidateSource = readFileSync(candidate, 'utf8');
        if (!candidate.pathname.endsWith(`/${coreName}`)
            && candidateSource.includes('bounded-json-rpc-read-core.js')) {
          importers.push(candidate.pathname.slice(candidate.pathname.lastIndexOf('/src/') + 5));
        }
      }
    }
  }
  assert.deepEqual(importers.sort(), [
    fundingName,
    'zenon/dynamic-plasma-json-rpc-read-transport.js',
  ]);
});

test('closed Dynamic Plasma and funding HTTPS wrappers share one bounded socket core', () => {
  const coreName = 'bounded-json-rpc-https-exchange-owner.js';
  const wrapperName = 'dynamic-plasma-https-read-transport-owner.js';
  const fundingWrapperName = 'service-credit-zenon-funding-https-read-transport-owner.js';
  const core = readFileSync(new URL(`../src/zenon/${coreName}`, import.meta.url), 'utf8');
  const wrapper = readFileSync(new URL(`../src/zenon/${wrapperName}`, import.meta.url), 'utf8');
  const fundingWrapper = readFileSync(
    new URL(`../src/${fundingWrapperName}`, import.meta.url),
    'utf8',
  );
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.equal(packageText.includes(coreName), false);
  assert.equal(packageText.includes(wrapperName), false);
  assert.equal(packageText.includes(fundingWrapperName), false);
  assert.deepEqual([...core.matchAll(/from '([^']+)';/g)].map(match => match[1]), [
    'node:https',
    'node:http',
    'node:net',
    'node:tls',
    'node:events',
    'node:stream',
    'node:buffer',
    'node:util',
    'node:perf_hooks',
    'node:timers',
  ]);
  assert.deepEqual([...wrapper.matchAll(/from '([^']+)';/g)].map(match => match[1]), [
    'node:util',
    './bounded-json-rpc-https-exchange-owner.js',
    './dynamic-plasma-json-rpc-read-transport.js',
  ]);
  assert.deepEqual([...fundingWrapper.matchAll(/from '([^']+)';/g)].map(match => match[1]), [
    'node:crypto',
    'node:util',
    './zenon/bounded-json-rpc-https-exchange-owner.js',
    './service-credit-zenon-funding-json-rpc-read-transport.js',
  ]);
  assert.doesNotMatch(core, /ledger\.|embedded\.|service-credit|dynamic-plasma-json-rpc-read-transport/);
  assert.doesNotMatch(core, /node:(?:fs|dns|child_process|worker_threads)|process\.env|globalThis|\bfetch\s*\(|WebSocket|\.listen\s*\(/);
  for (const closedWrapper of [wrapper, fundingWrapper]) {
    assert.doesNotMatch(closedWrapper, /node:(?:https?|http2|net|tls|dns)|httpsRequest|new HttpsAgent/);
  }
  assert.match(wrapper, /return freeze\(\{ transport, close: exchangeOwner\.close \}\)/);
  assert.match(fundingWrapper, /sourcePolicyCommitment: sourcePolicyCommitment\(sourcePolicyDescriptor\)/);
  assert.doesNotMatch(fundingWrapper, /funding-observation-source-owner|funding-observation-producer/);
  assert.match(core, /const MAX_BODY = 1052672/);
  assert.match(core, /const MAX_REQUEST_BYTES = 1024/);
  assert.match(core, /const MAX_ATTEMPTS = 13/);
  assert.match(core, /const MAX_HEADER_BYTES = 16384/);
  assert.match(core, /const MAX_HEADER_PAIRS = 64/);
  const pending = [new URL('../src/', import.meta.url)];
  const importers = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = new URL(entry.name, directory);
      if (entry.isDirectory()) pending.push(new URL(`${entry.name}/`, directory));
      else if (entry.isFile() && candidate.pathname.endsWith('.js')) {
        const candidateSource = readFileSync(candidate, 'utf8');
        if (!candidate.pathname.endsWith(`/${coreName}`)
            && candidateSource.includes(coreName)) {
          importers.push(candidate.pathname.slice(candidate.pathname.lastIndexOf('/src/') + 5));
        }
      }
    }
  }
  assert.deepEqual(importers.sort(), [
    fundingWrapperName,
    `zenon/${wrapperName}`,
  ]);
});

test('bounded HTTPS owner import is process-global-observer-free', () => {
  const source = readFileSync(
    new URL('../src/service-credit-bounded-https-ingress-owner.js', import.meta.url),
    'utf8',
  );
  const importedModules = [...source.matchAll(/from '([^']+)';/g)]
    .map(match => match[1]);
  assert.deepEqual(importedModules, ['node:events', 'node:http', 'node:net', 'node:util']);
  assert.doesNotMatch(
    source,
    /node:(?:v8|async_hooks)|['"]async_hooks['"]|\bpromiseHooks\b|\bcreateHook\b|\bhook\.enable\b|\bhook\.disable\b|\bAsyncLocalStorage\b/,
  );
  assert.doesNotMatch(
    source,
    /\bprocess\s*\.\s*(?:on|once|addListener|prependListener|prependOnceListener)\s*\(/,
  );
  assert.doesNotMatch(
    source,
    /\bprocess\s*\[\s*['"](?:on|once|addListener|prependListener|prependOnceListener)['"]\s*\]\s*\(/,
  );
  assert.doesNotMatch(
    source,
    /unhandledRejection|rejectionHandled|multipleResolves|uncaughtExceptionMonitor/,
  );
});

test('durable HTTPS router is inert and imported only by its test and default-off pilot', () => {
  const sourceUrl = new URL(
    '../src/service-credit-zenon-durable-https-router.js',
    import.meta.url,
  );
  const focusedTestUrl = new URL(
    '../test/service-credit-zenon-durable-https-router.test.js',
    import.meta.url,
  );
  const pilotSourceUrl = new URL(
    '../src/service-credit-zenon-https-operator-pilot.js',
    import.meta.url,
  );
  const source = readFileSync(sourceUrl, 'utf8');
  const focusedTest = readFileSync(focusedTestUrl, 'utf8');
  const pilotSource = readFileSync(pilotSourceUrl, 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const security = readFileSync(new URL('../SECURITY.md', import.meta.url), 'utf8');
  const implementationPlan = readFileSync(
    new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url),
    'utf8',
  );
  const importedModules = [...source.matchAll(/from '([^']+)';/g)]
    .map(match => match[1]);
  assert.deepEqual(importedModules, ['node:util', './x402-wire.js']);
  assert.doesNotMatch(
    source,
    /node:(?:async_hooks|v8|https|http|http2|net|tls|fs)|['"]async_hooks['"]|\bpromiseHooks\b|\bcreateHook\b|\bAsyncLocalStorage\b/,
  );
  assert.doesNotMatch(
    source,
    /\bprocess\s*\.\s*(?:on|once|addListener|prependListener|prependOnceListener)\s*\(/,
  );
  assert.doesNotMatch(
    source,
    /\bprocess\s*\[\s*['"](?:on|once|addListener|prependListener|prependOnceListener)['"]\s*\]\s*\(/,
  );
  assert.doesNotMatch(
    source,
    /unhandledRejection|rejectionHandled|multipleResolves|uncaughtExceptionMonitor/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask|fetch|WebSocket|createServer)\s*\(/,
  );
  assert.doesNotMatch(source, /process\.env|\.listen\s*\(|\.then\s*\(/);
  assert.match(source, /const PROMISE_THEN = PROMISE_THEN_DESCRIPTOR\.value;/);
  assert.match(source, /const IS_PROMISE = utilTypes\.isPromise;/);
  assert.match(source, /const IS_PROXY = utilTypes\.isProxy;/);
  assert.match(
    source,
    /function observeNativePromise\(promise, fulfilled, rejected\)[\s\S]*?REFLECT_APPLY\(PROMISE_THEN, promise, \[onFulfilled, onRejected\]\)/,
  );
  assert.match(
    source,
    /function serviceCreditZenonDurableHttpsRouterHandle\([\s\S]*?request,[\s\S]*?response,[\s\S]*?transportContext,[\s\S]*?completionValue/,
  );
  assert.match(
    source,
    /function closeServiceCreditZenonDurableHttpsRouter\([\s\S]*?completionValue/,
  );
  assert.match(source, /return OBJECT_FREEZE\(\{ handle, close \}\);/);
  assert.equal(packageText.includes('service-credit-zenon-durable-https-router.js'), false);

  const importNeedle = "from '../src/service-credit-zenon-durable-https-router.js'";
  assert.equal(focusedTest.includes(importNeedle), true);
  assert.equal(
    pilotSource.includes("from './service-credit-zenon-durable-https-router.js'"),
    true,
  );
  assert.equal((focusedTest.match(/createServiceCreditZenonDurableHttpsRouter\(/g) ?? []).length > 1, true);
  assert.equal(
    (pilotSource.match(/createServiceCreditZenonDurableHttpsRouter/g) ?? []).length,
    2,
  );
  assert.equal(pilotSource.includes('settleTrustedOperation'), false);
  assert.equal(pilotSource.includes('sendHandoffFailure'), false);
  assert.equal(pilotSource.includes('const closeRouter'), false);
  assert.equal(pilotSource.includes('const handleRequest'), false);
  for (const documentation of [readme, security, implementationPlan]) {
    assert.equal(
      documentation.includes('src/service-credit-zenon-durable-https-router.js'),
      true,
    );
  }
  assert.match(
    readme,
    /The router does not close the durable composition, stores, TLS, listener, or sockets/,
  );
  assert.match(
    security,
    /A returned value must be a genuine non-Proxy Promise with the exact captured same-realm native prototype/,
  );
  assert.match(
    implementationPlan,
    /`close` gates handles first, invokes the captured handoff close once, then waits for all safely observed request operations and that close/,
  );

  const pending = [
    new URL('../src/', import.meta.url),
    new URL('../test/', import.meta.url),
  ];
  const importers = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        pending.push(new URL(`${entry.name}/`, directory));
      } else if (entry.isFile() && candidate.pathname.endsWith('.js')) {
        const candidateSource = readFileSync(candidate, 'utf8');
        if (
          candidate.href !== import.meta.url
          && candidateSource.includes('service-credit-zenon-durable-https-router.js')
        ) {
          importers.push(candidate.href);
        }
      }
    }
  }
  importers.sort();
  assert.deepEqual(importers, [focusedTestUrl.href, pilotSourceUrl.href].sort());
});

test('fixed-POST Zenon funding HTTPS intake remains unmounted and BOUND-only', () => {
  const postName = 'service-credit-zenon-funding-intake-http-post-v1.js';
  const ownerName = 'service-credit-zenon-funding-intake-https-owner-v1.js';
  const clientName = 'service-credit-zenon-funding-post-v1-client.js';
  const postSource = readFileSync(new URL(`../src/${postName}`, import.meta.url), 'utf8');
  const ownerSource = readFileSync(new URL(`../src/${ownerName}`, import.meta.url), 'utf8');
  const clientSource = readFileSync(new URL(`../src/${clientName}`, import.meta.url), 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const packageJson = JSON.parse(packageText);
  assert.equal(packageText.includes(postName), false);
  assert.equal(packageText.includes(ownerName), false);
  assert.equal(packageText.includes(clientName), false);
  assert.equal(packageJson.exports, undefined);
  assert.equal(packageJson.bin, undefined);
  for (const script of Object.values(packageJson.scripts)) {
    assert.equal(script.includes(postName), false);
    assert.equal(script.includes(ownerName), false);
    assert.equal(script.includes(clientName), false);
  }
  assert.doesNotMatch(postSource, /service-credit-zenon-funding-intake-http\.js/);
  assert.match(
    ownerSource,
    /from '\.\/service-credit-zenon-funding-intake-http-post-v1\.js'/,
  );
  assert.match(
    ownerSource,
    /from '\.\/service-credit-bounded-https-ingress-owner\.js'/,
  );
  assert.match(
    ownerSource,
    /from '\.\/service-credit-bounded-node-https-server-factory\.js'/,
  );
  assert.deepEqual(
    [...ownerSource.matchAll(/from '([^']+)';/g)].map(match => match[1]),
    [
      'node:util',
      './service-credit-bounded-https-ingress-owner.js',
      './service-credit-bounded-node-https-server-factory.js',
      './service-credit-zenon-funding-intake-http-post-v1.js',
    ],
  );
  for (const forbidden of [
    'service-credit-zenon-funding-publication-bridge.js',
    'service-credit-zenon-funding-raw-observation-producer.js',
    'service-credit-zenon-funding-evidence.js',
    'service-credit-activation.js',
    'dynamic-plasma',
  ]) assert.equal(ownerSource.includes(forbidden), false);
  assert.deepEqual(
    [...clientSource.matchAll(/from '([^']+)';/g)].map(match => match[1]),
    ['node:util', './zenon-payment.js', './x402-wire.js'],
  );
  assert.doesNotMatch(clientSource, /node:(?:fs|https|http|net|tls)|\.listen\s*\(|createServer/);
  assert.match(clientSource, /redirect: 'manual'/);
  assert.match(clientSource, /credentials: 'omit'/);
  assert.match(clientSource, /cache: 'no-store'/);

  const postImporters = [];
  const ownerImporters = [];
  const clientImporters = [];
  const pending = [
    new URL('../src/', import.meta.url),
    new URL('../test/', import.meta.url),
  ];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        pending.push(new URL(`${entry.name}/`, directory));
        continue;
      }
      if (!entry.isFile() || !candidate.pathname.endsWith('.js')) continue;
      const relative = candidate.href.startsWith(new URL('../src/', import.meta.url).href)
        ? `src/${candidate.href.slice(new URL('../src/', import.meta.url).href.length)}`
        : `test/${candidate.href.slice(new URL('../test/', import.meta.url).href.length)}`;
      if (relative === 'test/architecture-boundaries.test.js') continue;
      const source = readFileSync(candidate, 'utf8');
      if (!relative.endsWith(`/${postName}`) && source.includes(postName)) {
        postImporters.push(relative);
      }
      if (!relative.endsWith(`/${ownerName}`) && source.includes(ownerName)) {
        ownerImporters.push(relative);
      }
      if (!relative.endsWith(`/${clientName}`) && source.includes(clientName)) {
        clientImporters.push(relative);
      }
    }
  }
  assert.deepEqual(postImporters.sort(), [
    `src/${ownerName}`,
    'test/service-credit-zenon-funding-intake-http-post-v1.test.js',
  ].sort());
  assert.deepEqual(ownerImporters.sort(), [
    'test/service-credit-zenon-funding-intake-https-owner-v1.test.js',
    'test/service-credit-zenon-funding-post-v1-client.test.js',
    'test/service-credit-zenon-https-funding-to-service-offline.test.js',
  ].sort());
  assert.deepEqual(clientImporters.sort(), [
    'src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js',
    'test/service-credit-zenon-funding-post-v1-client.test.js',
    'test/service-credit-zenon-https-funding-to-service-offline.test.js',
  ].sort());
});

test('payer recovery owner remains local, explicit, and test-imported only', () => {
  const storeName = 'service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';
  const ownerName = 'service-credit-zenon-funding-post-v1-payer-recovery-owner.js';
  const focusedName = 'service-credit-zenon-funding-post-v1-payer-recovery.test.js';
  const storeSource = readFileSync(new URL(`../src/${storeName}`, import.meta.url), 'utf8');
  const ownerSource = readFileSync(new URL(`../src/${ownerName}`, import.meta.url), 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const packageJson = JSON.parse(packageText);
  assert.equal(packageText.includes(storeName), false);
  assert.equal(packageText.includes(ownerName), false);
  assert.equal(packageJson.exports, undefined);
  assert.equal(packageJson.bin, undefined);
  for (const script of Object.values(packageJson.scripts)) {
    assert.equal(script.includes(storeName), false);
    assert.equal(script.includes(ownerName), false);
  }
  assert.deepEqual(
    [...ownerSource.matchAll(/from '([^']+)';/g)].map(match => match[1]),
    [
      'node:util',
      './service-credit-zenon-funding-post-v1-client.js',
      './service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js',
      './zenon-payment.js',
    ],
  );
  assert.deepEqual(
    [...storeSource.matchAll(/from '([^']+)';/g)].map(match => match[1]),
    [
      'node:crypto',
      'node:fs',
      'node:path',
      'node:sqlite',
      'node:util',
      './x402-wire.js',
    ],
  );
  for (const source of [storeSource, ownerSource]) {
    assert.doesNotMatch(
      source,
      /publishRawTransaction|prepareBlock|KeyPair|mnemonic|createServer|\.listen\s*\(|WebSocket/,
    );
    assert.doesNotMatch(
      source,
      /service-credit-activation|service-credit-model|funding-publication-bridge|settlement-journal/,
    );
  }
  assert.match(storeSource, /locking_mode = EXCLUSIVE/);
  assert.match(storeSource, /BEGIN IMMEDIATE/);
  assert.match(ownerSource, /recoverAfterRestart/);
  assert.match(ownerSource, /replayUnknown/);

  const storeImporters = [];
  const ownerImporters = [];
  const pending = [
    new URL('../src/', import.meta.url),
    new URL('../test/', import.meta.url),
  ];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        pending.push(new URL(`${entry.name}/`, directory));
        continue;
      }
      if (!entry.isFile() || !candidate.pathname.endsWith('.js')) continue;
      const sourceRoot = new URL('../src/', import.meta.url).href;
      const testRoot = new URL('../test/', import.meta.url).href;
      const relative = candidate.href.startsWith(sourceRoot)
        ? `src/${candidate.href.slice(sourceRoot.length)}`
        : `test/${candidate.href.slice(testRoot.length)}`;
      if (relative === 'test/architecture-boundaries.test.js') continue;
      const source = readFileSync(candidate, 'utf8');
      if (!relative.endsWith(`/${storeName}`) && source.includes(storeName)) {
        storeImporters.push(relative);
      }
      if (!relative.endsWith(`/${ownerName}`) && source.includes(ownerName)) {
        ownerImporters.push(relative);
      }
    }
  }
  assert.deepEqual(storeImporters.sort(), [
    `src/${ownerName}`,
    `test/${focusedName}`,
  ].sort());
  assert.deepEqual(ownerImporters, [`test/${focusedName}`]);
});

test('bounded Node HTTPS factory is inert, constructor-fixed, and test-imported only', () => {
  const sourceUrl = new URL(
    '../src/service-credit-bounded-node-https-server-factory.js',
    import.meta.url,
  );
  const focusedTestUrl = new URL(
    '../test/service-credit-bounded-node-https-server-factory.test.js',
    import.meta.url,
  );
  const compositionTestUrl = new URL(
    '../test/service-credit-zenon-funding-composition.test.js',
    import.meta.url,
  );
  const pilotSourceUrl = new URL(
    '../src/service-credit-zenon-https-operator-pilot.js',
    import.meta.url,
  );
  const fundingHttpsOwnerSourceUrl = new URL(
    '../src/service-credit-zenon-funding-intake-https-owner-v1.js',
    import.meta.url,
  );
  const source = readFileSync(sourceUrl, 'utf8');
  const focusedTest = readFileSync(focusedTestUrl, 'utf8');
  const compositionTest = readFileSync(compositionTestUrl, 'utf8');
  const pilotSource = readFileSync(pilotSourceUrl, 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const security = readFileSync(new URL('../SECURITY.md', import.meta.url), 'utf8');
  const implementationPlan = readFileSync(
    new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url),
    'utf8',
  );

  const importedModules = [...source.matchAll(/from '([^']+)';/g)]
    .map(match => match[1]);
  assert.deepEqual(importedModules, ['node:events', 'node:https', 'node:util']);
  assert.doesNotMatch(
    source,
    /node:(?:async_hooks|v8|fs|child_process)|['"]async_hooks['"]|promiseHooks|createHook|AsyncLocalStorage/,
  );
  assert.doesNotMatch(
    source,
    /\bprocess\s*\.\s*(?:on|once|addListener|prependListener|prependOnceListener)\s*\(/,
  );
  assert.doesNotMatch(
    source,
    /unhandledRejection|rejectionHandled|multipleResolves|uncaughtExceptionMonitor/,
  );
  assert.doesNotMatch(
    source,
    /process\.env|readFile|createSecureContext|SNICallback|keylog|pfx|passphrase|engine|\.then\s*\(/,
  );
  assert.match(
    source,
    /export function createServiceCreditBoundedNodeHttpsServerFactory\(\.\.\.args\)/,
  );
  assert.match(source, /const CONFIGURATION_KEYS = OBJECT_FREEZE\(\['bind', 'tlsMaterial'\]\)/);
  assert.match(source, /const BIND_KEYS = OBJECT_FREEZE\(\['host', 'port', 'exclusive'\]\)/);
  assert.match(source, /const TLS_MATERIAL_KEYS = OBJECT_FREEZE\(\['key', 'cert'\]\)/);
  assert.match(source, /boundedInteger\(captured\.port, 1, 65_535\)/);
  assert.match(source, /captured\.exclusive !== true/);
  assert.match(source, /MAX_TLS_MATERIAL_BYTES = 1024 \* 1024/);
  assert.match(source, /REFLECT_APPLY\(BUFFER_FILL, value, \[0\]\)/);
  const ordinaryBufferSource = source.slice(
    source.indexOf('function ordinaryBoundedBuffer'),
    source.indexOf('function copyBuffer'),
  );
  assertSourceOrder(ordinaryBufferSource, [
    'REFLECT_APPLY(IS_PROXY, undefined, [value])',
    'REFLECT_APPLY(BUFFER_IS_BUFFER, NATIVE_BUFFER, [value])',
    'REFLECT_APPLY(TYPED_ARRAY_BUFFER_GETTER, value, [])',
    'REFLECT_APPLY(TYPED_ARRAY_BYTE_LENGTH_GETTER, value, [])',
    'REFLECT_APPLY(TYPED_ARRAY_LENGTH_GETTER, value, [])',
  ]);
  const copyBufferSource = source.slice(
    source.indexOf('function copyBuffer'),
    source.indexOf('function clearBuffer'),
  );
  assert.match(copyBufferSource, /REFLECT_APPLY\(TYPED_ARRAY_SET, copy, \[value, 0\]\)/);
  assert.doesNotMatch(source, /BUFFER_COPY|BUFFER_PROTOTYPE\.copy/);
  assert.match(source, /if \(state !== 'READY'\) throw failure\(CODE\.alreadyUsed\)/);
  assert.equal((source.match(/createNativeHttpsServer/g) ?? []).length, 2);
  assertSourceOrder(source, [
    'const CREATE_NATIVE_HTTPS_SERVER = createNativeHttpsServer;',
    'return OBJECT_FREEZE(function serviceCreditBoundedNodeHttpsServerFactory',
    'server = REFLECT_APPLY(CREATE_NATIVE_HTTPS_SERVER, undefined, [',
    "register('close', forwarders.close, true);",
    "register('error', forwarders.error, false);",
    'const capability = OBJECT_FREEZE({ listen, close, closeAllConnections });',
    'return capability;',
  ]);
  for (const eventName of [
    'connection', 'secureConnection', 'request', 'checkContinue',
    'checkExpectation', 'upgrade', 'connect', 'clientError', 'tlsClientError',
    'dropRequest', 'drop', 'timeout', 'listening', 'close', 'error',
  ]) assert.match(source, new RegExp(`\\b${eventName}: OBJECT_FREEZE`));
  for (const property of [
    'maxHeadersCount', 'maxConnections', 'maxRequestsPerSocket',
    'headersTimeout', 'requestTimeout', 'keepAliveTimeout',
  ]) assert.equal(
    source.includes(`applyNativeProperty('${property}', capturedOptions.${property});`),
    true,
  );
  assert.match(
    source,
    /REFLECT_APPLY\(SERVER_SET_TIMEOUT, server, \[capturedOptions\.timeout\]\)/,
  );
  assert.match(source, /cleanupPartialSetup\(\)[\s\S]*?SERVER_CLOSE_ALL_CONNECTIONS[\s\S]*?SERVER_CLOSE/);
  const listenSource = source.slice(
    source.indexOf('const listen = OBJECT_FREEZE'),
    source.indexOf('const close = OBJECT_FREEZE'),
  );
  assert.match(listenSource, /\|\| closeRequested/);
  const forwardSource = source.slice(
    source.indexOf('function forward(name, forwardedArgs)'),
    source.indexOf('function detachTerminal()'),
  );
  assert.match(forwardSource, /if \(callbacks === null\) return;/);
  assert.doesNotMatch(forwardSource, /closeRequested/);
  const closeSource = source.slice(
    source.indexOf('const close = OBJECT_FREEZE'),
    source.indexOf('const closeAllConnections = OBJECT_FREEZE'),
  );
  assertSourceOrder(closeSource, [
    'if (dispatchCell.terminal || closeRequested) return;',
    'closeRequested = true;',
    'REFLECT_APPLY(SERVER_CLOSE, activeServer, [])',
  ]);
  const closeForwarderSource = source.slice(
    source.indexOf('close: OBJECT_FREEZE(function boundedNodeHttpsClose'),
    source.indexOf('error: OBJECT_FREEZE(function boundedNodeHttpsError'),
  );
  assertSourceOrder(closeForwarderSource, [
    'const callbacks = detachTerminal();',
    'REFLECT_APPLY(callbacks.close, undefined, [])',
  ]);
  assert.match(source, /const capability = OBJECT_FREEZE\(\{ listen, close, closeAllConnections \}\)/);
  assert.equal(packageText.includes('service-credit-bounded-node-https-server-factory.js'), false);

  const importNeedle =
    "from '../src/service-credit-bounded-node-https-server-factory.js'";
  assert.equal(focusedTest.includes(importNeedle), true);
  assert.equal(compositionTest.includes(importNeedle), false);
  assert.equal(
    pilotSource.includes("from './service-credit-bounded-node-https-server-factory.js'"),
    true,
  );
  assert.equal(compositionTest.includes('createHttpsServer'), false);
  assert.equal(
    (compositionTest.match(/createServiceCreditBoundedNodeHttpsServerFactory\(/g) ?? []).length,
    0,
  );
  assert.match(
    compositionTest,
    /reserveSyntheticHttpsLoopbackPort\(\)[\s\S]*?host: '127\.0\.0\.1', port: 0, exclusive: true/,
  );
  assert.match(
    compositionTest,
    /bind: Object\.freeze\(\{ host: '127\.0\.0\.1', port: bindPort, exclusive: true \}\)/,
  );
  assert.doesNotMatch(compositionTest, /observedCallbacks|raw-connection-accounted/);
  assert.match(
    compositionTest,
    /createServiceCreditZenonHttpsOperatorPilot\(Object\.freeze\(\{[\s\S]*?bind: Object\.freeze\(\{ host: '127\.0\.0\.1', port: bindPort, exclusive: true \}\)/,
  );
  assert.doesNotMatch(compositionTest, /server\.address\(\)/);

  for (const documentation of [readme, security, implementationPlan]) {
    assert.equal(
      documentation.includes('src/service-credit-bounded-node-https-server-factory.js'),
      true,
    );
  }
  assert.match(
    readme,
    /The adapter owns only bounded private copies of constructor-supplied key and certificate bytes and one fixed nonzero exclusive bind/,
  );
  assert.match(
    security,
    /Clearing adapter-owned byte copies is best-effort reference hygiene, not cryptographic zeroization or proof that Node or native TLS retained no copy/,
  );
  assert.match(
    implementationPlan,
    /The native adapter is invoked once only by the bounded ingress owner's later `start`; import and construction create no server or listener/,
  );

  const pending = [
    new URL('../src/', import.meta.url),
    new URL('../test/', import.meta.url),
  ];
  const importers = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        pending.push(new URL(`${entry.name}/`, directory));
      } else if (entry.isFile() && candidate.pathname.endsWith('.js')) {
        const candidateSource = readFileSync(candidate, 'utf8');
        if (
          candidate.href !== import.meta.url
          && candidateSource.includes('service-credit-bounded-node-https-server-factory.js')
        ) importers.push(candidate.href);
      }
    }
  }
  importers.sort();
  assert.deepEqual(importers, [
    focusedTestUrl.href,
    fundingHttpsOwnerSourceUrl.href,
    pilotSourceUrl.href,
  ].sort());
});

test('Zenon HTTPS operator pilot is inert, single-use, default-off, and test-imported only', () => {
  const sourceUrl = new URL(
    '../src/service-credit-zenon-https-operator-pilot.js',
    import.meta.url,
  );
  const focusedTestUrl = new URL(
    '../test/service-credit-zenon-https-operator-pilot.test.js',
    import.meta.url,
  );
  const compositionTestUrl = new URL(
    '../test/service-credit-zenon-funding-composition.test.js',
    import.meta.url,
  );
  const dormantBoundaryTestUrl = new URL(
    '../test/service-credit-external-holder-grant-descriptor-handoff-http-ingress.test.js',
    import.meta.url,
  );
  const fundingToServiceAcceptanceTestUrl = new URL(
    '../test/service-credit-zenon-https-funding-to-service-offline.test.js',
    import.meta.url,
  );
  const source = readFileSync(sourceUrl, 'utf8');
  const focusedTest = readFileSync(focusedTestUrl, 'utf8');
  const compositionTest = readFileSync(compositionTestUrl, 'utf8');
  const dormantBoundaryTest = readFileSync(dormantBoundaryTestUrl, 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const security = readFileSync(new URL('../SECURITY.md', import.meta.url), 'utf8');
  const implementationPlan = readFileSync(
    new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url),
    'utf8',
  );

  const importedModules = [...source.matchAll(/from '([^']+)';/g)]
    .map(match => match[1]);
  assert.deepEqual(importedModules, [
    'node:util',
    './service-credit-bounded-https-ingress-owner.js',
    './service-credit-bounded-node-https-server-factory.js',
    './service-credit-external-holder-grant-descriptor-handoff-http-ingress.js',
    './service-credit-zenon-durable-http-composition.js',
    './service-credit-zenon-durable-https-router.js',
    './service-credit-zenon-funding-composition.js',
  ]);
  assert.doesNotMatch(
    source,
    /node:(?:async_hooks|v8|fs|child_process|net|tls|http|https)|['"]async_hooks['"]|promiseHooks|createHook|AsyncLocalStorage/,
  );
  assert.doesNotMatch(
    source,
    /\bprocess\s*\.\s*(?:on|once|addListener|prependListener|prependOnceListener)\s*\(/,
  );
  assert.doesNotMatch(
    source,
    /unhandledRejection|rejectionHandled|multipleResolves|uncaughtExceptionMonitor|process\.env|\.listen\s*\(/,
  );
  assert.match(
    source,
    /export function createServiceCreditZenonHttpsOperatorPilot\(options\)/,
  );
  assert.match(
    source,
    /return OBJECT_FREEZE\(\{ start, activateCommittedReady, close, snapshot \}\);/,
  );
  assert.match(
    source,
    /const CONFIGURATION_KEYS = OBJECT_FREEZE\(\[[\s\S]*?'transport',[\s\S]*?'routes',[\s\S]*?'funding',[\s\S]*?'durable',[\s\S]*?'handoff'/,
  );
  const shutdownSource = source.slice(
    source.indexOf('function beginShutdown(code = null)'),
    source.indexOf('function failStart(code)'),
  );
  assertSourceOrder(shutdownSource, [
    'shutdownStarted = true;',
    'phase = PHASE.CLOSING;',
    'returned = REFLECT_APPLY(ingressClose, undefined, []);',
  ]);
  assertSourceOrder(source, [
    'function closeDurableAfterTransport()',
    'if (!transportClosed || closeSettled) return;',
    'returned = REFLECT_APPLY(durableClose, undefined, []);',
  ]);
  const activePublication = source.slice(
    source.indexOf('function publishActive(owner)'),
    source.indexOf('function onDurableStartFailure(error)'),
  );
  assertSourceOrder(activePublication, [
    'CREATE_EXTERNAL_HOLDER_HANDOFF_INGRESS',
    'handoffController = nextController;',
    'handoffHandle = captured.handle;',
    'handoffClose = captured.close;',
    'phase = PHASE.ACTIVE;',
    'resolveActivation();',
  ]);
  assert.equal(packageText.includes('service-credit-zenon-https-operator-pilot.js'), false);
  assert.equal(
    focusedTest.includes("from '../src/service-credit-zenon-https-operator-pilot.js'"),
    true,
  );
  assert.equal(
    compositionTest.includes("from '../src/service-credit-zenon-https-operator-pilot.js'"),
    true,
  );
  assert.equal(
    dormantBoundaryTest.includes(
      "test('the dormant ingress has no package export or active import reachability', () => {",
    ),
    true,
  );
  assert.equal(
    dormantBoundaryTest.includes("from '../src/service-credit-zenon-https-operator-pilot.js'"),
    false,
  );
  for (const boundaryAssertion of [
    'assert.equal(packageText.includes(pilotName), false);',
    'assert.equal(packageJson.exports, undefined);',
    'assert.equal(packageJson.bin, undefined);',
    'assert.equal(script.includes(pilotName), false);',
    'assert.deepEqual(ingressImporters.sort(), [pilotName]);',
    'assert.deepEqual(pilotImporters, []);',
    "pilotSource.includes(`from './${ingressName}'`),",
    'assert.equal(pilotSource.split(ingressName).length - 1, 1);',
  ]) assert.equal(dormantBoundaryTest.includes(boundaryAssertion), true);
  for (const legacyTransportConstructor of [
    'createServiceCreditBoundedHttpsIngressOwner',
    'createServiceCreditBoundedNodeHttpsServerFactory',
    'createServiceCreditZenonDurableHttpsRouter',
    'createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress',
  ]) assert.equal(compositionTest.includes(legacyTransportConstructor), false);
  for (const documentation of [readme, security, implementationPlan]) {
    assert.equal(
      documentation.includes('src/service-credit-zenon-https-operator-pilot.js'),
      true,
    );
  }

  const pending = [
    new URL('../src/', import.meta.url),
    new URL('../test/', import.meta.url),
  ];
  const importers = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = new URL(entry.name, directory);
      if (entry.isDirectory()) {
        pending.push(new URL(`${entry.name}/`, directory));
      } else if (entry.isFile() && candidate.pathname.endsWith('.js')) {
        const candidateSource = readFileSync(candidate, 'utf8');
        if (
          candidate.href !== import.meta.url
          && candidateSource.includes('service-credit-zenon-https-operator-pilot.js')
        ) importers.push(candidate.href);
      }
    }
  }
  importers.sort();
  assert.deepEqual(importers, [
    compositionTestUrl.href,
    dormantBoundaryTestUrl.href,
    focusedTestUrl.href,
    fundingToServiceAcceptanceTestUrl.href,
  ].sort());
});

test('bounded HTTPS owner is dormant and keeps TLS material and binding in one factory seam', () => {
  const source = readFileSync(
    new URL('../src/service-credit-bounded-https-ingress-owner.js', import.meta.url),
    'utf8',
  );
  const compositionTest = readFileSync(
    new URL('../test/service-credit-zenon-funding-composition.test.js', import.meta.url),
    'utf8',
  );
  const pilotSource = readFileSync(
    new URL('../src/service-credit-zenon-https-operator-pilot.js', import.meta.url),
    'utf8',
  );
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const security = readFileSync(new URL('../SECURITY.md', import.meta.url), 'utf8');
  const implementationPlan = readFileSync(
    new URL('../docs/IMPLEMENTATION_PLAN.md', import.meta.url),
    'utf8',
  );
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /node:https|createServer|process\.env|console\.|WebSocket/);
  assert.doesNotMatch(source, /remoteAddress|remotePort|x-forwarded|cf-connecting|authorization/iu);
  assert.match(source, /minVersion: 'TLSv1\.3'/);
  assert.match(source, /maxVersion: 'TLSv1\.3'/);
  assert.match(source, /ALPNProtocols: OBJECT_FREEZE\(\['http\/1\.1'\]\)/);
  assert.match(source, /requestCert: false/);
  assert.match(source, /handshakeTimeout: limits\.tlsHandshakeDeadlineMs/);
  assert.match(source, /maxRequestsPerSocket: 1/);
  assert.match(source, /maxConnections: limits\.maxConcurrentSockets/);
  assert.match(source, /joinDuplicateHeaders: false/);
  assert.match(source, /rejectNonStandardBodyWrites: true/);
  assert.match(source, /REFLECT_APPLY\(trustedFactory, undefined, \[serverOptions, callbacks\]\)/);
  assert.match(source, /REFLECT_APPLY\(downstreamHandle, undefined, \[/);
  for (const gate of [
    'let serverShutdownOperationsInFlight = 0;',
    'let socketLifecycleOperationsInFlight = 0;',
    'let closeSetupOperationsInFlight = 0;',
    'if (serverShutdownOperationsInFlight !== 0) return;',
    'if (socketLifecycleOperationsInFlight !== 0) return;',
    'if (closeSetupOperationsInFlight !== 0) return;',
  ]) assert.equal(source.includes(gate), true);
  assert.match(
    source,
    /function invokeServerShutdownOperation\(operation\) \{[\s\S]*?beginServerShutdownOperation\(\)[\s\S]*?REFLECT_APPLY\(operation, undefined, \[\]\)[\s\S]*?result === undefined[\s\S]*?markPermanentUncertainty\(\)[\s\S]*?finally \{\s*endServerShutdownOperation\(\);/,
  );
  assert.match(
    source,
    /if \(!beginCloseSetupOperation\(\)\)[\s\S]*?requestDownstreamClose\(\);[\s\S]*?invokeServerShutdownOperation\(operation\);[\s\S]*?finally \{\s*endCloseSetupOperation\(\);/,
  );
  assert.doesNotMatch(
    source,
    /REFLECT_APPLY\(serverCapability\.(?:close|closeAllConnections), undefined, \[\]\)/,
  );
  assert.match(
    source,
    /function destroySocket\(socket\) \{[\s\S]*?beginSocketLifecycleOperation\(\)[\s\S]*?REFLECT_APPLY\(capability\.destroy, socket, \[\]\)[\s\S]*?finally \{\s*endSocketLifecycleOperation\(\);/,
  );
  assert.match(
    source,
    /function trackSocket\(socket\) \{[\s\S]*?beginSocketLifecycleOperation\(\)[\s\S]*?REFLECT_APPLY\(emitter\.once, socket, \['close', onClose\]\)[\s\S]*?REFLECT_APPLY\(emitter\.once, socket, \['error', onError\]\)[\s\S]*?finally \{\s*endSocketLifecycleOperation\(\);/,
  );
  assert.match(
    source,
    /if \(secureState === undefined\) \{[\s\S]*?weakMapGet\(socketReservations, socket\)[\s\S]*?setupReservation\.state = CONNECTION_STATE\.TERMINATING;[\s\S]*?sendUnavailable\(response\);[\s\S]*?revokeConnectionReservation\(setupReservation\);/,
  );
  for (const capture of [
    'const SET_ADD = NATIVE_SET.prototype.add;',
    'const SET_DELETE = NATIVE_SET.prototype.delete;',
    'const SET_HAS = NATIVE_SET.prototype.has;',
    'const SET_VALUES = NATIVE_SET.prototype.values;',
    'const MAP_DELETE = NATIVE_MAP.prototype.delete;',
    'const MAP_GET = NATIVE_MAP.prototype.get;',
    'const MAP_HAS = NATIVE_MAP.prototype.has;',
    'const MAP_SET = NATIVE_MAP.prototype.set;',
    'const MAP_VALUES = NATIVE_MAP.prototype.values;',
    'const WEAK_MAP_DELETE = NATIVE_WEAK_MAP.prototype.delete;',
    'const WEAK_MAP_GET = NATIVE_WEAK_MAP.prototype.get;',
    'const WEAK_MAP_SET = NATIVE_WEAK_MAP.prototype.set;',
  ]) assert.equal(source.includes(capture), true);
  assert.match(
    source,
    /const SET_SIZE_GETTER = REFLECT_APPLY\([\s\S]*?\[NATIVE_SET\.prototype, 'size'\],[\s\S]*?\)\.get;/,
  );
  assert.match(
    source,
    /const MAP_SIZE_GETTER = REFLECT_APPLY\([\s\S]*?\[NATIVE_MAP\.prototype, 'size'\],[\s\S]*?\)\.get;/,
  );
  for (const [helper, intrinsic] of [
    ['setAdd', 'SET_ADD'],
    ['setDelete', 'SET_DELETE'],
    ['setHas', 'SET_HAS'],
    ['setSize', 'SET_SIZE_GETTER'],
    ['mapDelete', 'MAP_DELETE'],
    ['mapGet', 'MAP_GET'],
    ['mapHas', 'MAP_HAS'],
    ['mapSet', 'MAP_SET'],
    ['mapSize', 'MAP_SIZE_GETTER'],
    ['weakMapDelete', 'WEAK_MAP_DELETE'],
    ['weakMapGet', 'WEAK_MAP_GET'],
    ['weakMapSet', 'WEAK_MAP_SET'],
  ]) assert.match(
    source,
    new RegExp(`function ${helper}\\([\\s\\S]*?REFLECT_APPLY\\(${intrinsic},`),
  );
  const moduleOwnedCollections = [
    'observed',
    'names',
    'allowedTargets',
    'ownedTimers',
    'trackedSockets',
    'connectionReservations',
    'socketCapabilities',
    'socketReservations',
    'seenTlsOutcomeSockets',
    'secureSockets',
    'activeRequests',
    'activeHandlers',
    'downstreamOwnedRequests',
  ].join('|');
  assert.doesNotMatch(
    source,
    new RegExp(`\\b(?:${moduleOwnedCollections})\\.(?:add|delete|get|has|set|values)\\s*\\(`),
  );
  assert.doesNotMatch(source, /\.(?:add|delete|get|has|set|values)\s*\(/);
  assert.doesNotMatch(
    source,
    new RegExp(`\\b(?:${moduleOwnedCollections})\\.size\\b`),
  );
  assert.doesNotMatch(
    source,
    new RegExp(`\\[\\.\\.\\.(?:${moduleOwnedCollections})\\]|\\bof (?:${moduleOwnedCollections})\\b`),
  );
  assert.equal(source.includes('new NATIVE_SET(requestTargets)'), false);
  assert.match(
    source,
    /function snapshotSetValues\(collection\) \{[\s\S]*?REFLECT_APPLY\(SET_VALUES, collection, \[\]\)[\s\S]*?REFLECT_APPLY\(SET_ITERATOR_NEXT, iterator, \[\]\)/,
  );
  assert.match(
    source,
    /function snapshotMapValues\(collection\) \{[\s\S]*?REFLECT_APPLY\(MAP_VALUES, collection, \[\]\)[\s\S]*?REFLECT_APPLY\(MAP_ITERATOR_NEXT, iterator, \[\]\)/,
  );
  assert.match(source, /connectionReservationIsOwned\(connectionReservation\)/);
  assert.doesNotMatch(
    source,
    /connectionAdmissions|pendingSecureAdmissions|RAW_PENDING|rawSocket|rawLive|secureAttached|selectSecureConnectionAdmission|selectSolePendingConnectionReservation|revokePendingConnectionReservation/,
  );
  assert.match(source, /const NATIVE_WEAK_SET = WeakSet;/);
  assert.match(source, /const WEAK_SET_ADD = NATIVE_WEAK_SET\.prototype\.add;/);
  assert.match(source, /const WEAK_SET_HAS = NATIVE_WEAK_SET\.prototype\.has;/);
  assert.match(
    source,
    /REFLECT_APPLY\(WEAK_SET_HAS, seenTlsOutcomeSockets, \[socket\]\)[\s\S]*?REFLECT_APPLY\(WEAK_SET_ADD, seenTlsOutcomeSockets, \[socket\]\)/,
  );
  assert.doesNotMatch(source, /seenTlsOutcomeSockets\.delete/);
  assert.match(source, /const peerToken = REFLECT_APPLY\(NATIVE_SYMBOL, undefined, \[\]\);/);
  assert.doesNotMatch(source, /observePropertyValue/);
  assert.match(
    source,
    /function captureOwnDataProperty\(value, key\)[\s\S]*?REFLECT_GET_OWN_PROPERTY_DESCRIPTOR[\s\S]*?descriptor === undefined \|\| !OBJECT_HAS_OWN\(descriptor, 'value'\)/,
  );
  assert.match(
    source,
    /function captureTlsPolicySnapshot\(socket\)[\s\S]*?captureOwnDataProperty\(socket, 'alpnProtocol'\)[\s\S]*?alpn\.value !== 'http\/1\.1'[\s\S]*?captureOwnDataProperty\(socket, 'servername'\)[\s\S]*?!applicableServernameValid\(servername\.value\)/,
  );
  assert.match(
    source,
    /function sameTlsPolicySnapshot\(socket, snapshot\)[\s\S]*?sameCapturedOwnDataProperty\(socket, 'alpnProtocol', snapshot\.alpn\)[\s\S]*?sameCapturedOwnDataProperty\(socket, 'servername', snapshot\.servername\)/,
  );
  assert.match(
    source,
    /const transportContext = OBJECT_FREEZE\(\{\s*peerToken,\s*abort,\s*\}\);[\s\S]*?abortCapabilityCell\.context = transportContext;[\s\S]*?secureState\.transportContext = transportContext;/,
  );
  assert.match(
    source,
    /\|\| outstandingAcceptedHandshakes !== 0\s*\|\| setSize\(trackedSockets\) !== 0\s*\|\| setSize\(connectionReservations\) !== 0[\s\S]*?\|\| mapSize\(secureSockets\) !== 0/,
  );
  assert.doesNotMatch(source, /\bcreateHook\b|\bhook\.enable\b|\bhook\.disable\b/);
  assert.match(
    source,
    /function createOperationCompletion\(dispatch\)[\s\S]*?const success = OBJECT_FREEZE\(\(\) => \{[\s\S]*?const failure = OBJECT_FREEZE\(\(\) => \{[\s\S]*?cell\.capability = OBJECT_FREEZE\(\{ success, failure \}\);/,
  );
  assert.match(
    source,
    /function finishOperationCall\(cell, returnedNormally, returnedValue\)[\s\S]*?!returnedNormally \|\| returnedValue !== undefined[\s\S]*?dispatch\.violation/,
  );
  assert.match(
    source,
    /function detachOperationCompletion\(cell\)[\s\S]*?cell\.dispatch = null;[\s\S]*?cell\.capability = null;/,
  );
  assert.match(source, /if \(!cancellationClean\) markPermanentUncertainty\(\);/);
  assert.match(source, /if \(timerRuntimeOperationsInFlight !== 0\) return;/);
  assert.match(source, /if \(rawConnectionOperationsInFlight !== 0\) return;/);
  const rawCallback = source.indexOf('function onConnection(socket)');
  const rawLifetimeReservation = source.indexOf(
    "if (!increment('connectionStarts'))",
    rawCallback,
  );
  const handshakeAccountingPublication = source.indexOf(
    'outstandingAcceptedHandshakes += 1;',
    rawLifetimeReservation,
  );
  const rawAcceptance = source.indexOf(
    "increment('connectionsAccepted')",
    handshakeAccountingPublication,
  );
  assert.equal(rawCallback >= 0 && rawCallback < rawLifetimeReservation, true);
  assert.equal(rawLifetimeReservation < handshakeAccountingPublication, true);
  assert.equal(handshakeAccountingPublication < rawAcceptance, true);
  const rawCallbackEnd = source.indexOf(
    'function applicableServernameValid(value)',
    rawCallback,
  );
  const rawCallbackSource = source.slice(rawCallback, rawCallbackEnd);
  assert.doesNotMatch(
    rawCallbackSource,
    /trackSocket|captureSocketCapability|connectionReservations|socketReservations|socketCapabilities|trackedSockets|\.once|\.on|remoteAddress|remotePort/,
  );
  assert.match(
    rawCallbackSource,
    /counters\.connectionStarts >= limits\.maxConnectionStarts[\s\S]*?destroyUntrackedSocket\(socket\)[\s\S]*?outstandingAcceptedHandshakes \+= 1;[\s\S]*?if \(!increment\('connectionsAccepted'\)\) \{\s*outstandingAcceptedHandshakes -= 1;/,
  );
  const trackSocketSourceStart = source.indexOf('function trackSocket(socket)');
  const trackSocketSourceEnd = source.indexOf(
    'function markFirstTlsOutcomeSocket(socket)',
    trackSocketSourceStart,
  );
  const trackSocketSource = source.slice(trackSocketSourceStart, trackSocketSourceEnd);
  const trackedSocketReservation = trackSocketSource.indexOf('setAdd(trackedSockets, socket);');
  const firstSocketListener = trackSocketSource.indexOf(
    "REFLECT_APPLY(emitter.once, socket, ['close', onClose]);",
  );
  assert.equal(trackedSocketReservation >= 0, true);
  assert.equal(trackedSocketReservation < firstSocketListener, true);
  let socketSetupOffset = 0;
  for (const marker of [
    'if (closeTerminal || closePromise !== null) return null;',
    'if (!setHas(trackedSockets, socket)) setAdd(trackedSockets, socket);',
    'const capability = captureSocketCapability(socket);',
    'weakMapGet(socketCapabilities, socket) !== capability',
    'const emitter = capability.emitter;',
    'const abandonTracking = () => {',
    'removeSocketSetupListenersBestEffort(socket, emitter, onClose, onError);',
    'capability.tracked = false;',
    'setDelete(trackedSockets, socket);',
    "REFLECT_APPLY(emitter.once, socket, ['close', onClose]);",
    'if (!socketSetupOwned(socket, capability)) {',
    'abandonTracking();',
    "REFLECT_APPLY(emitter.once, socket, ['error', onError]);",
    'if (!socketSetupOwned(socket, capability)) {',
    'capability.listenersInstalled = true;',
  ]) {
    const index = trackSocketSource.indexOf(marker, socketSetupOffset);
    assert.notEqual(index, -1, `missing ordered socket setup marker: ${marker}`);
    socketSetupOffset = index + marker.length;
  }
  assert.match(
    trackSocketSource,
    /catch \{\s*abandonTracking\(\);\s*return null;/,
  );
  assert.match(
    trackSocketSource,
    /REFLECT_APPLY\(emitter\.once, socket, \['error', onError\]\);[\s\S]*?capability\.listenersInstalled = true;\s*return capability;/,
  );
  assert.match(
    source,
    /function captureSocketCapability\(socket\)[\s\S]*?\|\| closeTerminal[\s\S]*?const destroy = ownOrInheritedValue\(socket, 'destroy'\);[\s\S]*?\|\| closeTerminal\) return null;[\s\S]*?const reentrantCapability = weakMapGet\(socketCapabilities, socket\);[\s\S]*?if \(closeTerminal\) return null;\s*weakMapSet\(socketCapabilities, socket, capability\);/,
  );
  assert.match(
    source,
    /function removeSocketSetupListenersBestEffort\([\s\S]*?REFLECT_APPLY\(emitter\.removeListener, socket, \[name, callback\]\);[\s\S]*?Setup cleanup cannot revise an already fixed terminal result/,
  );
  assert.equal(source.includes('acceptedConnections'), false);
  assert.equal(
    (source.match(/setDelete\(connectionReservations, reservation\)/g) ?? []).length,
    2,
  );
  assert.match(
    source,
    /function revokeConnectionReservation\(reservation, candidateSocket = null\)[\s\S]*?reservation\.state = CONNECTION_STATE\.TERMINATING;[\s\S]*?reservation\.requestEligible = false;[\s\S]*?detachSecureStateForTerminal\(reservation\);[\s\S]*?const secureSocket = reservation\.secureSocket;[\s\S]*?destroySocket\(secureSocket\);/,
  );
  assert.match(
    source,
    /function onSocketClose\(socket\)[\s\S]*?reservation\.secureSocket === socket\) reservation\.secureLive = false;[\s\S]*?reservation\.requestEligible = false;[\s\S]*?revokeConnectionReservation\(reservation\)/,
  );
  assert.match(
    source,
    /function maybeReleaseConnectionReservation\(reservation\)[\s\S]*?reservation\.secureLive[\s\S]*?reservation\.requestEligible[\s\S]*?reservation\.requestState !== null[\s\S]*?setDelete\(connectionReservations, reservation\)/,
  );
  assert.match(
    source,
    /function cleanupRequest\(requestState\)[\s\S]*?connectionReservation\.requestState = null;\s*maybeReleaseConnectionReservation\(connectionReservation\);/,
  );
  assert.doesNotMatch(source, /counters\.(?:connectionStarts|requestStarts)\s*(?:-=|--)/);
  const secureLifetimeMarker = source.indexOf(
    'const outcome = markFirstTlsOutcomeSocket(socket);',
  );
  const handshakeConsumption = source.indexOf(
    'if (!consumeAcceptedHandshakeOutcome())',
    secureLifetimeMarker,
  );
  assert.equal(
    secureLifetimeMarker >= 0 && secureLifetimeMarker < handshakeConsumption,
    true,
  );
  const secureCapacityGate = source.indexOf(
    'setSize(connectionReservations) >= limits.maxConcurrentSockets',
    handshakeConsumption,
  );
  const secureReservationCreation = source.indexOf(
    'const connectionReservation = {',
    secureCapacityGate,
  );
  const secureReservationSetPublication = source.indexOf(
    'setAdd(connectionReservations, connectionReservation);',
    secureReservationCreation,
  );
  const secureReservationMapPublication = source.indexOf(
    'weakMapSet(socketReservations, socket, connectionReservation);',
    secureReservationSetPublication,
  );
  const secureStatePublication = source.indexOf(
    'mapSet(secureSockets, socket, secureState);',
    secureReservationMapPublication,
  );
  const secureTracking = source.indexOf(
    'const secureCapability = trackSocket(socket);',
    secureReservationMapPublication,
  );
  const tlsPolicyCapture = source.indexOf(
    'const tlsPolicySnapshot = captureTlsPolicySnapshot(socket);',
    secureTracking,
  );
  const headerDeadlineSchedule = source.indexOf(
    "'headerDeadline',\n      limits.headerDeadlineMs,",
    secureStatePublication,
  );
  const headerSetupGate = source.indexOf(
    '!secureHeaderSetupOwned(socket, secureCapability, secureState)',
    headerDeadlineSchedule,
  );
  const installedTlsPolicyGate = source.indexOf(
    '|| !sameTlsPolicySnapshot(socket, tlsPolicySnapshot)',
    headerSetupGate,
  );
  const secureEligibility = source.indexOf(
    'secureState.setupState = SECURE_SETUP.REQUEST_ELIGIBLE;',
    installedTlsPolicyGate,
  );
  assert.equal(
    tlsPolicyCapture >= 0
      && secureTracking >= 0
      && handshakeConsumption < secureCapacityGate
      && secureCapacityGate < secureReservationCreation
      && secureReservationCreation < secureReservationSetPublication
      && secureReservationSetPublication < secureReservationMapPublication
      && secureReservationMapPublication < secureTracking
      && secureTracking < tlsPolicyCapture
      && tlsPolicyCapture < secureStatePublication
      && secureStatePublication < headerDeadlineSchedule
      && headerDeadlineSchedule < headerSetupGate
      && headerSetupGate < installedTlsPolicyGate
      && installedTlsPolicyGate < secureEligibility,
    true,
  );
  assert.match(
    source,
    /tlsPolicySnapshot,[\s\S]*?setupState: SECURE_SETUP\.INSTALLING_HEADER_DEADLINE,[\s\S]*?mapSet\(secureSockets, socket, secureState\);/,
  );
  assert.match(
    source,
    /secureCapability === null[\s\S]*?!secureCapability\.listenersInstalled[\s\S]*?connectionReservationIsOwned\(connectionReservation\)[\s\S]*?revokeConnectionReservation\(connectionReservation\);/,
  );
  assert.match(
    source,
    /function destroyTlsOutcomeSocket\(socket\)[\s\S]*?reservation\.secureSocket === socket[\s\S]*?return revokeConnectionReservation\(reservation\);[\s\S]*?return destroyUntrackedSocket\(socket\);/,
  );
  assert.match(
    source,
    /tlsClientError: OBJECT_FREEZE\(function activeBoundedHttpsTlsClientError[\s\S]*?const outcome = markFirstTlsOutcomeSocket\(socket\);[\s\S]*?outcome === 'FIRST'\) consumeAcceptedHandshakeOutcome\(\);[\s\S]*?destroyTlsOutcomeSocket\(socket\);/,
  );
  assert.match(
    source,
    /function onListenerClose\(\) \{\s*outstandingAcceptedHandshakes = 0;/,
  );
  assert.doesNotMatch(
    source,
    /\._parent\b|\._handle\b|remoteAddress|remotePort|localAddress|localPort|firstSetValue|sole pending|FIFO/iu,
  );
  assert.match(
    source,
    /function secureHeaderSetupOwned\(socket, capability, secureState\)[\s\S]*?timerRuntimeOperationsInFlight === 0[\s\S]*?secureState\.tlsPolicySnapshot !== null[\s\S]*?ticket\.active === true[\s\S]*?ticket\.handleReady === true[\s\S]*?setHas\(ownedTimers, ticket\)/,
  );
  assert.match(
    source,
    /secureState\.setupState = SECURE_SETUP\.REQUEST_ELIGIBLE;\s*connectionReservation\.state = CONNECTION_STATE\.REQUEST_ELIGIBLE;\s*connectionReservation\.requestEligible = true;/,
  );
  const requestCallback = source.indexOf('function onRequest(request, response');
  const requestCapture = source.indexOf(
    'const requestAdmission = captureRequestAdmission(',
    requestCallback,
  );
  const requestOneShotMarker = source.indexOf(
    'secureState.requestStarted = true;',
    requestCapture,
  );
  const requestEligibilityGate = source.indexOf(
    'secureState.setupState !== SECURE_SETUP.REQUEST_ELIGIBLE',
    requestCapture,
  );
  const requestTlsPolicyGate = source.indexOf(
    '|| !sameTlsPolicySnapshot(socket, secureState.tlsPolicySnapshot)',
    requestEligibilityGate,
  );
  const requestStartReservation = source.indexOf(
    "if (!increment('requestStarts'))",
    requestOneShotMarker,
  );
  const forcedRejectionGate = source.indexOf(
    'forcedRejection\n      || setSize(activeRequests) >= limits.maxConcurrentRequests',
    requestStartReservation,
  );
  const forcedRejectionCancellation = source.indexOf(
    "cancelTicket(secureState, 'headerDeadline');",
    forcedRejectionGate,
  );
  const forcedRejectionResponse = source.indexOf(
    'rejectParsed(response, socket);',
    forcedRejectionCancellation,
  );
  const requestPublication = source.indexOf('setAdd(activeRequests, requestState)', requestCapture);
  const handlerPublication = source.indexOf(
    'setAdd(activeHandlers, requestState)',
    requestPublication,
  );
  const responseRegistration = source.indexOf(
    'let status = registerResponse(requestState)',
    handlerPublication,
  );
  const responseHeaderCall = source.indexOf(
    "REFLECT_APPLY(requestState.responseSetHeader, response, ['Connection', 'close'])",
    responseRegistration,
  );
  const requestDeadlineSchedule = source.indexOf(
    "'deadline',\n      limits.requestResponseDeadlineMs,",
    responseRegistration,
  );
  const postHeaderStableGate = source.indexOf(
    'status = inspectRequestAdmission(requestState, true);',
    responseHeaderCall,
  );
  const downstreamOwnership = source.indexOf(
    'setAdd(downstreamOwnedRequests, requestState)',
    postHeaderStableGate,
  );
  const requestFinalGate = source.indexOf(
    'status = inspectRequestAdmission(requestState, true);',
    downstreamOwnership,
  );
  const handlerCompletionPublication = source.indexOf(
    'requestState.handlerCompletionCell = handlerCompletionCell;',
    requestFinalGate,
  );
  const downstreamCall = source.indexOf(
    'returnedValue = REFLECT_APPLY(downstreamHandle, undefined, [',
    requestFinalGate,
  );
  assert.equal(requestCallback >= 0 && requestCallback < requestCapture, true);
  assert.equal(requestCapture < requestEligibilityGate, true);
  assert.equal(requestEligibilityGate < requestTlsPolicyGate, true);
  assert.equal(requestTlsPolicyGate < requestOneShotMarker, true);
  assert.equal(requestCapture < requestOneShotMarker, true);
  assert.equal(requestOneShotMarker < requestStartReservation, true);
  assert.equal(requestStartReservation < forcedRejectionGate, true);
  assert.equal(forcedRejectionGate < forcedRejectionCancellation, true);
  assert.equal(forcedRejectionCancellation < forcedRejectionResponse, true);
  assert.equal(requestCapture < requestPublication, true);
  assert.equal(requestPublication < handlerPublication, true);
  assert.equal(handlerPublication < responseRegistration, true);
  assert.equal(responseRegistration < requestDeadlineSchedule, true);
  assert.equal(requestDeadlineSchedule < responseHeaderCall, true);
  assert.equal(responseHeaderCall < postHeaderStableGate, true);
  assert.equal(postHeaderStableGate < downstreamOwnership, true);
  assert.equal(downstreamOwnership < requestFinalGate, true);
  assert.equal(requestFinalGate < handlerCompletionPublication, true);
  assert.equal(handlerCompletionPublication < downstreamCall, true);
  assert.equal(requestFinalGate < downstreamCall, true);
  assert.match(
    source,
    /trackedSockets: setSize\(trackedSockets\),\s*trackedRequests: setSize\(activeRequests\),\s*trackedHandlers: setSize\(activeHandlers\),\s*ownedTimers: setSize\(ownedTimers\),/,
  );
  assert.match(
    source.slice(requestFinalGate, source.indexOf('function onRawSocketEvent', downstreamCall)),
    /createOperationCompletion\(OBJECT_FREEZE\(\{[\s\S]*?handlerCompletionCell\.capability,[\s\S]*?finishOperationCall\(handlerCompletionCell, returnedNormally, returnedValue\);/,
  );
  assert.match(
    source,
    /function captureRequestAdmission\(request,[\s\S]*?REFLECT_APPLY\(IS_PROXY, undefined, \[request\]\)[\s\S]*?REFLECT_GET_OWN_PROPERTY_DESCRIPTOR[\s\S]*?!OBJECT_HAS_OWN\(descriptor, 'value'\)/,
  );
  assert.match(
    source,
    /function sameRequestAdmission\(left, right\)[\s\S]*?samePropertyDescriptor\(left\.descriptors\[key\], right\.descriptors\[key\]\)/,
  );
  const sourceSection = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.equal(end > start, true, `missing source marker: ${endMarker}`);
    return source.slice(start, end);
  };
  assert.match(source, /let trustedFactory = configuration\.httpsServerFactory;/);
  assert.match(source, /let downstreamHandle = downstream\.handle;/);
  assert.match(source, /let downstreamClose = downstream\.close;/);
  assert.match(source, /let schedule = deadlineRuntime\.schedule;/);
  assert.match(source, /let cancel = deadlineRuntime\.cancel;/);
  assert.match(source, /const INERT_CALLBACK_DISPATCH = OBJECT_FREEZE\(\{\}\);/);
  const terminalDetachmentSource = sourceSection(
    'function detachTerminalOwnerReferences() {',
    'function runBestEffortTerminalCleanup(cleanup) {',
  );
  assertSourceOrder(terminalDetachmentSource, [
    'callbackDispatchCell.target = INERT_CALLBACK_DISPATCH;',
    'abortCapabilityCell.operation = null;',
    'abortCapabilityCell.socket = null;',
    'abortCapabilityCell.context = null;',
    'trustedFactory = null;',
    'downstreamHandle = null;',
    'downstreamClose = null;',
    'schedule = null;',
    'cancel = null;',
    'serverCapability = null;',
    'startCapability = null;',
    'closeCapability = null;',
  ]);
  assert.doesNotMatch(
    terminalDetachmentSource,
    /REFLECT_APPLY\(|removeListener\(|cancelHandle\(|destroySocket\(|safeCallable\(/,
  );
  assert.equal(
    (source.match(/const terminalCleanup = detachTerminalOwnerReferences\(\);/g) ?? []).length,
    2,
  );
  assert.match(
    source,
    /const abortCapabilityCell = \{\s*operation: null,\s*socket,\s*context: null,\s*\};[\s\S]*?const abort = OBJECT_FREEZE\(function abortOwnedHttpsSocket\(\) \{\s*const operation = abortCapabilityCell\.operation;\s*if \(operation === null\) return;\s*REFLECT_APPLY\(operation, undefined, \[\]\);\s*\}\);/,
  );
  assert.match(
    source,
    /const callbacks = OBJECT_FREEZE\(\{[\s\S]*?const dispatchTarget = callbackDispatchCell\.target;\s*if \(dispatchTarget === INERT_CALLBACK_DISPATCH\) return;/,
  );
  const callbackShellSource = sourceSection(
    'const callbacks = OBJECT_FREEZE({',
    'function requestDownstreamClose() {',
  );
  assert.equal(
    (callbackShellSource.match(
      /const dispatchTarget = callbackDispatchCell\.target;\s*if \(dispatchTarget === INERT_CALLBACK_DISPATCH\) return;\s*REFLECT_APPLY\(dispatchTarget\./g,
    ) ?? []).length,
    15,
  );

  assertSourceOrder(terminalDetachmentSource, [
    'requestState.terminalDetached = true;',
    'setDelete(activeRequests, requestState);',
    'setDelete(activeHandlers, requestState);',
    'setDelete(downstreamOwnedRequests, requestState);',
    "detachTerminalTicket(requestState, 'deadline', cancellationHandles);",
    "detachTerminalTicket(secureState, 'headerDeadline', cancellationHandles);",
    'mapDelete(secureSockets, secureState.socket);',
    'setDelete(trackedSockets, socket);',
    'weakMapDelete(socketReservations, socket);',
    'weakMapDelete(socketCapabilities, socket);',
    'setDelete(connectionReservations, reservation);',
    "detachTerminalTicket(timerState, 'start', cancellationHandles);",
    "detachTerminalTicket(timerState, 'close', cancellationHandles);",
    'setDelete(ownedTimers, ticket);',
    'abortCapabilityCell.operation = null;',
    'abortCapabilityCell.socket = null;',
    'abortCapabilityCell.context = null;',
    'requestState.socket = null;',
    'secureState.socket = null;',
    'outstandingAcceptedHandshakes = 0;',
  ]);
  assert.doesNotMatch(
    terminalDetachmentSource,
    /increment\('handlersSettled'\)|handlerSettled = true|completed = true/,
  );

  const terminalCleanupSource = sourceSection(
    'function runBestEffortTerminalCleanup(cleanup) {',
    'function finishCloseUncertain() {',
  );
  assertSourceOrder(terminalCleanupSource, [
    'const cancelOperation = cleanup.cancelOperation;',
    'cleanup.cancellationHandles.length',
    'REFLECT_APPLY(',
    'cancelOperation,',
    'cleanup.responseOperations.length',
    'operation.emitter.removeListener',
    'cleanup.socketOperations.length',
    "operation.emitter.removeListener, operation.socket, [\n            'close',",
    "operation.emitter.removeListener, operation.socket, [\n            'error',",
    'REFLECT_APPLY(operation.destroy, operation.socket, []);',
    'cleanup.cancelOperation = null;',
    'cleanup.cancellationHandles.length = 0;',
    'cleanup.responseOperations.length = 0;',
    'cleanup.socketOperations.length = 0;',
  ]);
  assert.doesNotMatch(
    terminalCleanupSource,
    /markPermanentUncertainty\(|finishCloseUncertain\(|increment\(|terminalMetricsSnapshot\s*=/,
  );

  const finishCloseUncertainSource = sourceSection(
    'function finishCloseUncertain() {',
    'function failStart() {',
  );
  assertSourceOrder(finishCloseUncertainSource, [
    'permanentUncertainty = true;',
    'admissionOpen = false;',
    'acceptingConnections = false;',
    'acceptingRequests = false;',
    'phase = PHASE.CLOSE_UNCERTAIN;',
    "increment('closeUncertain');",
    'closeTerminal = true;',
    'const terminalCloseCapability = closeCapability;',
    'const terminalCleanup = detachTerminalOwnerReferences();',
    'terminalMetricsSnapshot = captureMetricsSnapshot();',
    'terminalCloseCapability.reject(failure(CODE.closeUncertain));',
    'runBestEffortTerminalCleanup(terminalCleanup);',
  ]);

  const maybeFinishCloseSource = sourceSection(
    'function maybeFinishClose() {',
    'function destroySocket(socket) {',
  );
  assertSourceOrder(maybeFinishCloseSource, [
    'if (timerRuntimeOperationsInFlight !== 0) return;',
    'if (rawConnectionOperationsInFlight !== 0) return;',
    'if (serverShutdownOperationsInFlight !== 0) return;',
    'if (socketLifecycleOperationsInFlight !== 0) return;',
    'if (closeSetupOperationsInFlight !== 0) return;',
    'if (permanentUncertainty) {',
    'finishCloseUncertain();',
    "const cancellationClean = cancelTicket(timerState, 'close');",
    'if (closeTerminal) return;',
    "if (!increment('closeClean')) {",
    'phase = PHASE.CLOSED;',
    'closeTerminal = true;',
    'const terminalCloseCapability = closeCapability;',
    'const terminalCleanup = detachTerminalOwnerReferences();',
    'terminalMetricsSnapshot = captureMetricsSnapshot();',
    "terminalCloseCapability.resolve(OBJECT_FREEZE({ status: 'CLOSED' }));",
    'runBestEffortTerminalCleanup(terminalCleanup);',
  ]);

  const settleHandlerSource = sourceSection(
    'function settleHandler(requestState, clean) {',
    'function captureResponseListener(listener) {',
  );
  assertSourceOrder(settleHandlerSource, [
    'if (requestState.terminalDetached || closeTerminal || requestState.handlerSettled) return;',
    'requestState.handlerSettled = true;',
    'setDelete(activeHandlers, requestState);',
    "increment('handlersSettled');",
  ]);

  const settleResponseSource = sourceSection(
    'function settleResponse(requestState, clean) {',
    'function onSocketClose(socket) {',
  );
  assertSourceOrder(settleResponseSource, [
    'if (requestState.terminalDetached || closeTerminal || requestState.responseSettled) return;',
    'requestState.responseSettled = true;',
    'requestState.responseClean = clean;',
  ]);

  assert.equal(
    source.includes('const EVENT_EMITTER_ON = EventEmitter.prototype.on;'),
    true,
  );
  assert.equal(
    source.includes(
      'const EVENT_EMITTER_REMOVE_LISTENER = EventEmitter.prototype.removeListener;',
    ),
    true,
  );
  assert.equal(source.includes('EVENT_EMITTER_ONCE'), false);

  const captureDataPropertySource = sourceSection(
    'function captureDataProperty(value, key) {',
    'function sameCapturedDataProperty(value, key, captured) {',
  );
  assertSourceOrder(captureDataPropertySource, [
    'REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,',
    '[owner, key],',
    "if (!OBJECT_HAS_OWN(descriptor, 'value')) return null;",
    'owner,',
    'descriptor: OBJECT_FREEZE(descriptor),',
    'value: descriptor.value,',
  ]);

  const sameCapturedDataPropertySource = sourceSection(
    'function sameCapturedDataProperty(value, key, captured) {',
    'function capturePropertyRoute(value, key) {',
  );
  assertSourceOrder(sameCapturedDataPropertySource, [
    'const current = captureDataProperty(value, key);',
    'current.owner === captured.owner',
    'samePropertyDescriptor(captured.descriptor, current.descriptor)',
  ]);

  const captureResponseTerminalPropertySource = sourceSection(
    'function captureResponseTerminalProperty(response, key, nativeDescriptor, backingKey) {',
    'function sameResponseTerminalProperty(',
  );
  assertSourceOrder(captureResponseTerminalPropertySource, [
    'const route = capturePropertyRoute(response, key);',
    "if (OBJECT_HAS_OWN(route.descriptor, 'value')) {",
    'route.owner !== response',
    'route.descriptor.value !== false',
    'route.owner !== OUTGOING_MESSAGE_PROTOTYPE',
    '!samePropertyDescriptor(nativeDescriptor, route.descriptor)',
    'const backing = captureDataProperty(response, backingKey);',
    'backing.owner !== response',
    'backing.value !== expectedBacking',
    'REFLECT_APPLY(nativeDescriptor.get, response, []) !== false',
  ]);
  const sameResponseTerminalPropertySource = sourceSection(
    'function sameResponseTerminalProperty(',
    'function captureEmitter(value) {',
  );
  assertSourceOrder(sameResponseTerminalPropertySource, [
    'const route = capturePropertyRoute(response, key);',
    'route.owner !== captured.route.owner',
    '!samePropertyDescriptor(captured.route.descriptor, route.descriptor)',
    'if (captured.backing === null) return true;',
    '!sameCapturedDataProperty(response, backingKey, captured.backing)',
    'REFLECT_APPLY(nativeDescriptor.get, response, []) === false',
  ]);
  assert.match(
    source,
    /const OUTGOING_MESSAGE_HEADERS_SENT_DESCRIPTOR = OBJECT_FREEZE\(REFLECT_APPLY\([\s\S]*?\[OUTGOING_MESSAGE_PROTOTYPE, 'headersSent'\]/,
  );
  assert.match(
    source,
    /const OUTGOING_MESSAGE_WRITABLE_ENDED_DESCRIPTOR = OBJECT_FREEZE\(REFLECT_APPLY\([\s\S]*?\[OUTGOING_MESSAGE_PROTOTYPE, 'writableEnded'\]/,
  );

  const captureResponseEmitterSource = sourceSection(
    'function captureResponseEmitter(value) {',
    'function sameResponseMethodSurface(response, emitter, setHeader) {',
  );
  assertSourceOrder(captureResponseEmitterSource, [
    "const on = captureDataProperty(value, 'on');",
    "const removeListener = captureDataProperty(value, 'removeListener');",
    'on === null',
    'removeListener === null',
    'on.value !== EVENT_EMITTER_ON',
    'removeListener.value !== EVENT_EMITTER_REMOVE_LISTENER',
    'on: EVENT_EMITTER_ON,',
    'removeListener: EVENT_EMITTER_REMOVE_LISTENER,',
    'onProperty: on,',
    'removeListenerProperty: removeListener,',
  ]);
  assert.doesNotMatch(captureResponseEmitterSource, /\bonce\b/);

  const sameResponseMethodSurfaceSource = sourceSection(
    'function sameResponseMethodSurface(response, emitter, setHeader) {',
    'function captureResponseBookkeeping(response) {',
  );
  assertSourceOrder(sameResponseMethodSurfaceSource, [
    "sameCapturedDataProperty(response, 'setHeader', setHeader)",
    "sameCapturedDataProperty(response, 'on', emitter.onProperty)",
    "'removeListener',",
    'emitter.removeListenerProperty,',
  ]);
  assert.doesNotMatch(sameResponseMethodSurfaceSource, /\bonce\b/);

  const captureResponseBookkeepingSource = sourceSection(
    'function captureResponseBookkeeping(response) {',
    'function captureResponseAdmission(response) {',
  );
  assertSourceOrder(captureResponseBookkeepingSource, [
    "const eventsCount = captureDataProperty(response, '_eventsCount');",
    "const maxListeners = captureDataProperty(response, '_maxListeners');",
    'eventsCount === null',
    'maxListeners === null',
    'eventsCount.owner !== response',
    'maxListeners.owner !== response',
    '!NUMBER_IS_SAFE_INTEGER(eventsCount.value)',
    'eventsCount.value < 0',
    'eventsCount.descriptor.writable !== true',
    'maxListeners.value !== undefined',
    '!NUMBER_IS_SAFE_INTEGER(maxListeners.value)',
    'maxListeners.value < 0',
    'return OBJECT_FREEZE({ eventsCount, maxListeners });',
  ]);

  const captureResponseAdmissionSource = sourceSection(
    'function captureResponseAdmission(response) {',
    'function sameResponseAdmission(',
  );
  assertSourceOrder(captureResponseAdmissionSource, [
    "const headersSent = captureResponseTerminalProperty(",
    "'headersSent',",
    "const writableEnded = captureResponseTerminalProperty(",
    "'writableEnded',",
    'const bookkeeping = captureResponseBookkeeping(response);',
    'headersSent === null',
    'writableEnded === null',
    'bookkeeping === null',
    'headersSent,',
    'writableEnded,',
    'eventsCount: bookkeeping.eventsCount,',
    'maxListeners: bookkeeping.maxListeners,',
  ]);
  const responseAdmissionCapture = source.indexOf(
    'const responseAdmission = captureResponseAdmission(response);',
    requestCallback,
  );
  const responseEventsCountCapture = source.indexOf(
    'responseEventsCount: responseAdmission.eventsCount,',
    responseAdmissionCapture,
  );
  const responseMaxListenersCapture = source.indexOf(
    'responseMaxListeners: responseAdmission.maxListeners,',
    responseEventsCountCapture,
  );
  assert.equal(
    responseAdmissionCapture >= 0
      && responseAdmissionCapture < responseEventsCountCapture
      && responseEventsCountCapture < responseMaxListenersCapture
      && responseMaxListenersCapture < responseRegistration,
    true,
  );

  const sameResponseAdmissionSource = sourceSection(
    'function sameResponseAdmission(',
    'function scanRawHeaders(rawHeaders, authority, limits) {',
  );
  assert.match(
    sameResponseAdmissionSource,
    /sameResponseTerminalProperty\(\s*response,\s*'headersSent',[\s\S]*?sameResponseTerminalProperty\(\s*response,\s*'writableEnded',/,
  );
  assert.match(
    sameResponseAdmissionSource,
    /sameCapturedDataProperty\(\s*response,\s*'_eventsCount',\s*expectedEventsCount,\s*\)/,
  );
  assert.match(
    sameResponseAdmissionSource,
    /sameCapturedDataProperty\(\s*response,\s*'_maxListeners',\s*expectedMaxListeners,\s*\)/,
  );

  const sameResponseEventSlotSnapshotSource = sourceSection(
    'function sameResponseEventSlotSnapshot(expected, current) {',
    'function sameSettledResponseEventSlotSubset(expected, current, callback) {',
  );
  assertSourceOrder(sameResponseEventSlotSnapshotSource, [
    '!samePropertyDescriptor(expected.eventsDescriptor, current.eventsDescriptor)',
    '!samePropertyDescriptor(expected.eventDescriptor, current.eventDescriptor)',
    'expected.container !== current.container',
    'expected.array !== current.array',
    '!samePropertyDescriptor(expected.lengthDescriptor, current.lengthDescriptor)',
    'expected.indexDescriptors.length !== current.indexDescriptors.length',
    'expected.entries.length !== current.entries.length',
    'expected.entries[index].listener !== current.entries[index].listener',
    'expected.entries[index].listenerDescriptor,',
    'current.entries[index].listenerDescriptor,',
  ]);

  const settledResponseEventSlotSubsetSource = sourceSection(
    'function sameSettledResponseEventSlotSubset(expected, current, callback) {',
    'function responseEventSlotCanAppend(slot) {',
  );
  assertSourceOrder(settledResponseEventSlotSubsetSource, [
    'expected === null',
    'current === null',
    '!expected.array',
    'expected.entries.length < 2',
    'expected.indexDescriptors.length !== expected.entries.length',
    '!samePropertyDescriptor(expected.eventsDescriptor, current.eventsDescriptor)',
    'sameDataPropertyDescriptorSurface(',
    'expected.eventDescriptor,',
    'current.eventDescriptor,',
    'current.entries.length < 1',
    'current.entries.length > expected.entries.length',
    'expected.entries[expectedOwnerIndex].listener !== callback',
    'expected.entries[expectedOwnerIndex].listenerDescriptor !== undefined',
    'current.entries[currentOwnerIndex].listener !== callback',
    'current.entries[currentOwnerIndex].listenerDescriptor !== undefined',
    'if (entry.listener === callback) ownerMatches += 1;',
    'if (entry.listenerDescriptor?.value === callback) return false;',
    'if (ownerMatches !== 1) return false;',
    'current.entries.length < 2',
    'expected.lengthDescriptor,',
    'current.lengthDescriptor,',
    'current.lengthDescriptor.value !== current.entries.length',
    'current.container !== callback',
    'while (expectedIndex < expectedOwnerIndex) {',
    'expected.entries[expectedIndex].listener',
    'current.entries[currentIndex].listener',
    'expected.entries[expectedIndex].listenerDescriptor,',
    'current.entries[currentIndex].listenerDescriptor,',
    'expected.indexDescriptors[expectedIndex],',
    'current.indexDescriptors[currentIndex],',
    'if (!matched) return false;',
    'expected.indexDescriptors[expectedOwnerIndex],',
    'current.indexDescriptors[currentOwnerIndex],',
  ]);
  assert.doesNotMatch(settledResponseEventSlotSubsetSource, /expected\.container/);

  const removeResponseListenerSource = sourceSection(
    'function removeResponseListener(',
    'function cleanupRequest(requestState) {',
  );
  assert.match(
    removeResponseListenerSource,
    /sameResponseEventSlotSnapshot\(slotSnapshot, currentSlot\)[\s\S]*?eventObserved[\s\S]*?sameSettledResponseEventSlotSubset\(slotSnapshot, currentSlot, callback\)/,
  );
  assert.equal(
    (source.match(/sameSettledResponseEventSlotSubset/g) ?? []).length,
    2,
  );

  const captureRegisteredResponseCallbackSource = sourceSection(
    'function captureRegisteredResponseCallback(',
    'function responseSettlementOwned(requestState) {',
  );
  assertSourceOrder(captureRegisteredResponseCallbackSource, [
    'const afterBookkeeping = captureResponseBookkeeping(requestState.response);',
    'const afterSlot = captureResponseEventSlot(requestState, name);',
    'const countIncrement = beforeSlot.eventDescriptor === undefined ? 1 : 0;',
    'const expectedCount = beforeEventsCount.value + countIncrement;',
    'afterBookkeeping.eventsCount.owner !== beforeEventsCount.owner',
    'beforeEventsCount.descriptor,',
    'afterBookkeeping.eventsCount.descriptor,',
    'afterBookkeeping.eventsCount.value !== expectedCount',
    "'_maxListeners',",
    'requestState.responseMaxListeners,',
    'samePropertyDescriptor(beforeSlot.eventsDescriptor, afterSlot.eventsDescriptor)',
    'afterSlot.entries.length !== beforeSlot.entries.length + 1',
    'afterSlot.entries[afterSlot.entries.length - 1].listener !== callback',
    'afterSlot.entries[afterSlot.entries.length - 1].listenerDescriptor !== undefined',
    'if (beforeSlot.eventDescriptor === undefined) {',
    'afterSlot.container !== callback',
    '!standardAssignedDataProperty(afterSlot.eventDescriptor, callback)',
    '} else if (!beforeSlot.array) {',
    'afterSlot.lengthDescriptor?.value !== 2',
    'afterSlot.indexDescriptors.length !== 2',
    'afterSlot.indexDescriptors[0],',
    'beforeSlot.container,',
    'afterSlot.indexDescriptors[1], callback',
    '} else {',
    'afterSlot.container !== beforeSlot.container',
    'afterSlot.lengthDescriptor.value !== beforeSlot.lengthDescriptor.value + 1',
    'afterSlot.indexDescriptors.length !== beforeSlot.indexDescriptors.length + 1',
    'afterSlot.indexDescriptors[afterSlot.indexDescriptors.length - 1],',
    'callback,',
  ]);

  const registerResponseSource = sourceSection(
    'function registerResponse(requestState) {',
    'function requestDeadline(requestState) {',
  );
  assertSourceOrder(registerResponseSource, [
    'const onFinish = OBJECT_FREEZE(() => {',
    'requestState.responseFinishObserved = true;',
    'settleResponse(requestState, true);',
    'const onClose = OBJECT_FREEZE(() => {',
    'requestState.responseCloseObserved = true;',
    'settleResponse(requestState, false);',
    'const onError = OBJECT_FREEZE(() => {',
    'requestState.responseErrorObserved = true;',
    'settleResponse(requestState, false);',
    "const beforeFinish = captureResponseEventSlot(requestState, 'finish');",
    "REFLECT_APPLY(emitter.on, requestState.response, ['finish', onFinish]);",
    'const finishCapture = captureRegisteredResponseCallback(',
    'requestState.responseFinishSlotSnapshot = finishCapture.slotSnapshot;',
    'requestState.responseEventsCount = finishCapture.eventsCount;',
    'let status = inspectRequestAdmission(requestState);',
    "const beforeClose = captureResponseEventSlot(requestState, 'close');",
    "REFLECT_APPLY(emitter.on, requestState.response, ['close', onClose]);",
    'const closeCapture = captureRegisteredResponseCallback(',
    'requestState.responseCloseSlotSnapshot = closeCapture.slotSnapshot;',
    'requestState.responseEventsCount = closeCapture.eventsCount;',
    'status = inspectRequestAdmission(requestState);',
    "const beforeError = captureResponseEventSlot(requestState, 'error');",
    "REFLECT_APPLY(emitter.on, requestState.response, ['error', onError]);",
    'const errorCapture = captureRegisteredResponseCallback(',
    'requestState.responseErrorSlotSnapshot = errorCapture.slotSnapshot;',
    'requestState.responseEventsCount = errorCapture.eventsCount;',
    'requestState.responseListenersInstalled = true;',
    'return inspectRequestAdmission(requestState);',
  ]);
  assert.equal(
    (registerResponseSource.match(/REFLECT_APPLY\(emitter\.on,/g) ?? []).length,
    3,
  );
  assert.equal(
    (registerResponseSource.match(
      /if \(requestState\.terminalDetached \|\| closeTerminal\) return;/g,
    ) ?? []).length,
    3,
  );
  assert.doesNotMatch(registerResponseSource, /\bonce\b|EVENT_EMITTER_ONCE/);

  const responseSettlementOwnedSource = sourceSection(
    'function responseSettlementOwned(requestState) {',
    'function inspectRequestAdmission(requestState, requireDeadline = false) {',
  );
  assertSourceOrder(responseSettlementOwnedSource, [
    "['finish', requestState.onResponseFinish]",
    "['close', requestState.onResponseClose]",
    "['error', requestState.onResponseError]",
    'const currentSlot = captureResponseEventSlot(requestState, name);',
    'if (!sameResponseEventSlotSnapshot(slotSnapshot, currentSlot)) return false;',
    'let matches = 0;',
    'if (entry.listener === callback) {',
    'if (entry.listenerDescriptor !== undefined) return false;',
    'matches += 1;',
    'if (entry.listenerDescriptor?.value === callback) return false;',
    'matches !== 1',
    'entries[entries.length - 1].listener !== callback',
  ]);
  assert.doesNotMatch(responseSettlementOwnedSource, /sameSettledResponseEventSlotSubset/);

  const inspectRequestAdmissionSource = sourceSection(
    'function inspectRequestAdmission(requestState, requireDeadline = false) {',
    'function settleUnstartedHandler(requestState) {',
  );
  assertSourceOrder(inspectRequestAdmissionSource, [
    'if (!sameResponseAdmission(',
    'requestState.responseEventsCount,',
    'requestState.responseMaxListeners,',
    'if (!sameResponseMethodSurface(',
    'requestState.responseSetHeaderProperty,',
    'requestState.responseListenersInstalled',
    '&& !responseSettlementOwned(requestState)',
    'requestState.secureState.setupState !== SECURE_SETUP.REQUEST_ELIGIBLE',
    'if (!sameTlsPolicySnapshot(',
    'requestState.secureState.tlsPolicySnapshot,',
    ")) return 'TLS_POLICY';",
  ]);
  for (const eventName of ['Finish', 'Close', 'Error']) assert.equal(
    (registerResponseSource.match(
      new RegExp(`requestState\\.response${eventName}Observed = true;`, 'g'),
    ) ?? []).length,
    1,
  );
  assert.doesNotMatch(registerResponseSource, /responseSettlementObserved/);
  const cleanupRequestSource = sourceSection(
    'function cleanupRequest(requestState) {',
    'function maybeCompleteRequest(requestState) {',
  );
  for (const [eventName, stateName] of [
    ['finish', 'Finish'],
    ['close', 'Close'],
    ['error', 'Error'],
  ]) assert.match(
    cleanupRequestSource,
    new RegExp(
      `removeResponseListener\\(\\s*requestState,\\s*'${eventName}',`
        + `\\s*requestState\\.onResponse${stateName},`
        + `\\s*requestState\\.response${stateName}SlotSnapshot,`
        + `\\s*requestState\\.response${stateName}Observed,\\s*\\);`,
    ),
  );
  assertSourceOrder(cleanupRequestSource, [
    'requestState.responseListenersInstalled = false;',
    'requestState.responseFinishObserved = false;',
    'requestState.responseCloseObserved = false;',
    'requestState.responseErrorObserved = false;',
  ]);
  assert.match(
    source,
    /responseListenersInstalled: false,[\s\S]*?responseFinishObserved: false,[\s\S]*?responseCloseObserved: false,[\s\S]*?responseErrorObserved: false,[\s\S]*?abortRequested: false,[\s\S]*?terminalDetached: false,[\s\S]*?let status = registerResponse\(requestState\)/,
  );
  assert.doesNotMatch(source, /responseSettlementObserved/);
  const requestFinalReadyCheck = source.indexOf(
    "if (status !== 'READY') {",
    requestFinalGate,
  );
  assert.equal(
    requestFinalGate < requestFinalReadyCheck && requestFinalReadyCheck < downstreamCall,
    true,
  );
  const startCancellation = source.indexOf("if (!cancelTicket(timerState, 'start'))");
  const startRevalidation = source.indexOf('|| counters.listenerErrors !== 0', startCancellation);
  const startSuccess = source.indexOf("increment('startSucceeded')", startRevalidation);
  assert.equal(startCancellation >= 0 && startCancellation < startRevalidation, true);
  assert.equal(startRevalidation < startSuccess, true);
  const closeCancellation = source.indexOf(
    "const cancellationClean = cancelTicket(timerState, 'close');",
  );
  const closeRevalidation = source.indexOf('if (closeTerminal) return;', closeCancellation);
  const closeSuccess = source.indexOf("increment('closeClean')", closeRevalidation);
  assert.equal(closeCancellation >= 0 && closeCancellation < closeRevalidation, true);
  assert.equal(closeRevalidation < closeSuccess, true);
  const requestDownstreamCloseSource = sourceSection(
    'function requestDownstreamClose() {',
    'const start = OBJECT_FREEZE(function startServiceCreditBoundedHttpsIngressOwner',
  );
  assert.equal(
    (requestDownstreamCloseSource.match(/if \(closeTerminal\) return;/g) ?? []).length,
    1,
  );
  assert.match(
    requestDownstreamCloseSource,
    /if \(closeTerminal \|\| downstreamCloseSettled\) return;[\s\S]*?downstreamCloseCompletionCell = createOperationCompletion/,
  );
  const localServerDisposalSource = sourceSection(
    'function disposeLocalServerCapabilityBestEffort(capability) {',
    'const start = OBJECT_FREEZE(function startServiceCreditBoundedHttpsIngressOwner',
  );
  assertSourceOrder(localServerDisposalSource, [
    'for (const operation of [capability.close, capability.closeAllConnections])',
    'REFLECT_APPLY(operation, undefined, []);',
  ]);
  assert.doesNotMatch(
    localServerDisposalSource,
    /capability\.listen|markPermanentUncertainty/,
  );
  const startSource = sourceSection(
    'const start = OBJECT_FREEZE(function startServiceCreditBoundedHttpsIngressOwner',
    'const close = OBJECT_FREEZE(function closeServiceCreditBoundedHttpsIngressOwner',
  );
  assertSourceOrder(startSource, [
    'const attemptStartCapability = startCapability;',
    'const attemptStartPromise = startPromise;',
    'const attemptStartTicket = timerState.start;',
    'returned = REFLECT_APPLY(trustedFactory, undefined, [serverOptions, callbacks]);',
    'let returnedCapability = captureServerCapability(returned);',
    'returned = null;',
    'if (returnedCapability === null) {',
    'closeTerminal',
    'startCapability !== attemptStartCapability',
    'startPromise !== attemptStartPromise',
    'timerState.start !== attemptStartTicket',
    'disposeLocalServerCapabilityBestEffort(returnedCapability);',
    'factoryReturned = true;',
    'serverCapability = returnedCapability;',
    'listenInvoked = true;',
    'listenResult = REFLECT_APPLY(serverCapability.listen, undefined, []);',
  ]);
  assert.equal(packageText.includes('service-credit-bounded-https-ingress-owner.js'), false);

  assert.equal(
    compositionTest.includes(
      "from '../src/service-credit-bounded-https-ingress-owner.js'",
    ),
    false,
  );
  assert.equal(
    pilotSource.includes("from './service-credit-bounded-https-ingress-owner.js'"),
    true,
  );
  assert.equal(compositionTest.includes('createHttpsServer'), false);
  assert.equal(
    compositionTest.includes(
      "from '../src/service-credit-bounded-node-https-server-factory.js'",
    ),
    false,
  );
  assert.equal(
    pilotSource.includes("from './service-credit-bounded-node-https-server-factory.js'"),
    true,
  );
  assert.match(compositionTest, /createServiceCreditZenonHttpsOperatorPilot\(Object\.freeze\(\{/);
  assert.equal(compositionTest.includes('settleTrustedOperation'), false);
  assert.equal(compositionTest.includes('sendHandoffFailure'), false);
  assert.match(
    compositionTest,
    /for \(const \[name, rawRequest\] of rawOuterIngressCases\)[\s\S]*?const responseBytes = await rawPinnedTlsExchange\(route, cert, rawRequest\);[\s\S]*?Number\.isSafeInteger\(responseBytes\) && responseBytes >= 0[\s\S]*?pilot\.handlerAdmissionCount\(\), admissionsBefore/,
  );
  assert.match(
    compositionTest,
    /const wrongCertificate = syntheticWrongPinnedCertificate\(\);[\s\S]*?await assert\.rejects\([\s\S]*?httpsHandoffExchange\(route, wrongCertificate,[\s\S]*?wrongCertificate\.fill\(0\);[\s\S]*?const rawOuterIngressCases = \[/,
  );
  assert.match(
    compositionTest,
    /function syntheticWrongPinnedCertificate\(\) \{[\s\S]*?tlsRootCertificates\[0\][\s\S]*?new X509Certificate\(pinned\);/,
  );
  assert.match(
    compositionTest,
    /'-newkey', 'ec', '-pkeyopt',[\s\S]*?'ec_paramgen_curve:prime256v1'/,
  );
  assert.match(compositionTest, /parsed\.checkIP\('127\.0\.0\.1'\)/);
  assert.doesNotMatch(
    compositionTest,
    /name === 'equal duplicate content length'[\s\S]*?SYNTHETIC_HTTPS_FAILURE\.request/,
  );
  const unresolvedCloseStart = compositionTest.indexOf(
    'async closeWithUnresolvedPreHandshake() {',
  );
  const unresolvedCloseEnd = compositionTest.indexOf(
    'expireHandoffChallenge(publicChallenge)',
    unresolvedCloseStart,
  );
  assert.equal(
    unresolvedCloseStart >= 0 && unresolvedCloseEnd > unresolvedCloseStart,
    true,
  );
  const unresolvedCloseSource = compositionTest.slice(
    unresolvedCloseStart,
    unresolvedCloseEnd,
  );
  assert.equal((unresolvedCloseSource.match(/connectNet\(/g) ?? []).length, 1);
  assert.equal((unresolvedCloseSource.match(/socket\.resume\(\);/g) ?? []).length, 1);
  assertSourceOrder(unresolvedCloseSource, [
    'const before = operator.snapshot().connectionStarts;',
    "const socket = connectNet({ host: '127.0.0.1', port: route.port });",
    'const clientConnected = new Promise(resolve => { resolveConnected = resolve; });',
    'const clientClosed = new Promise(resolve => { resolveClosed = resolve; });',
    'const clientDeadline = new Promise(resolve => { resolveDeadline = resolve; });',
    "socket.once('connect', () => {",
    "socket.once('close', () => {",
    'socket.resume();',
    'const deadlineHandle = setTimeout(() => {',
    '}, 10_000);',
    'const connectionEvidence = await Promise.race([clientConnected, clientDeadline]);',
    'if (operator.snapshot().connectionStarts > before) {',
    'const ownerClose = operator.close().then(result => Object.freeze({ result }));',
    'const ownerCloseEvidence = await Promise.race([ownerClose, clientDeadline]);',
    'const closeEvidence = await Promise.race([clientClosed, clientDeadline]);',
    'return Object.freeze({ result, metrics: operator.snapshot() });',
    '} finally {',
    'clearTimeout(deadlineHandle);',
    'if (!closed) {',
    'socket.destroy();',
  ]);
  assert.doesNotMatch(unresolvedCloseSource, /await operator\.close\(\);|await clientClosed;/);

  const ordinaryReplayStart = compositionTest.indexOf(
    'const first = await httpsExchange(route, cert, authorizationA);',
  );
  const adversarialCloseStart = compositionTest.indexOf(
    'const raceChallenge = await obtainExternalHolderChallenge(route, cert);',
    ordinaryReplayStart,
  );
  assert.equal(
    ordinaryReplayStart >= 0 && adversarialCloseStart > ordinaryReplayStart,
    true,
  );
  const ordinaryReplaySource = compositionTest.slice(
    ordinaryReplayStart,
    adversarialCloseStart,
  );
  assertSourceOrder(ordinaryReplaySource, [
    'const first = await httpsExchange(route, cert, authorizationA);',
    'const afterFirst = context.serviceStore.load();',
    'const replay = await httpsExchange(route, cert, authorizationA);',
    'assert.deepEqual(replay.body, first.body);',
    'assert.deepEqual(context.serviceStore.load(), afterFirst);',
    'assert.equal(executionState.count, 1);',
    "assert.deepEqual(await pilot.close(), { status: 'CLOSED' });",
    'context.serviceStore = ServiceCreditSqliteStore.openExisting(',
    'context.observerStore = openZenonFundingObserverSqliteStore({',
    'pilot = await offlineHttpsPilot(t, context, executionState);',
    "assert.deepEqual(await pilot.activate(), { status: 'ACTIVE' });",
    'const reopenedReplay = await httpsExchange(route, cert, authorizationA);',
    'assert.deepEqual(reopenedReplay.body, first.body);',
    'assert.equal(context.serviceStore.load().state.grants.length, 1);',
    'assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 2);',
    'assert.equal(executionState.count, 1);',
    'const requestB = requestDescription(',
    '(await httpsExchange(route, cert, authorization(requestB, grantDescriptor))).statusCode,',
    'assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 4);',
    'assert.equal(executionState.count, 2);',
    'assert.equal(pilot.ownerReadCount(), 0);',
  ]);

  const adversarialCloseEnd = compositionTest.indexOf(
    "test('offline HTTPS harness denies credit for non-READY synthetic child outcomes'",
    adversarialCloseStart,
  );
  assert.equal(adversarialCloseEnd > adversarialCloseStart, true);
  const adversarialCloseSource = compositionTest.slice(
    adversarialCloseStart,
    adversarialCloseEnd,
  );
  assert.match(
    adversarialCloseSource,
    /const pilotCloseObserver = pilotClose\.then\(\s*\(\) => \{[\s\S]*?pilotCloseOutcome = 'FULFILLED';[\s\S]*?\},\s*error => \{[\s\S]*?pilotCloseOutcome = 'UNKNOWN';[\s\S]*?Object\.getOwnPropertyDescriptor\(error, 'code'\)[\s\S]*?\},\s*\);/,
  );
  assertSourceOrder(adversarialCloseSource, [
    'const pausedRedemption = beginPausedHandoffRedemption(route, cert, raceProof);',
    'await pausedRedemption.firstWrite;',
    'await pilot.waitForHandoffAdmission(admissionsBeforeRace);',
    'const ownerReadsBeforeQuiesce = pilot.ownerReadCount();',
    'const admissionsAtQuiescence = pilot.handlerAdmissionCount();',
    'const durableStateAtQuiescence = context.serviceStore.load();',
    'const observerStateAtQuiescence = context.observerStore.load();',
    'const executionsAtQuiescence = executionState.count;',
    'const signingDispatchesAtQuiescence = observed.dispatches;',
    "'SERVICE_CREDIT_ZENON_HTTPS_OPERATOR_PILOT_CLOSE_UNCERTAIN';",
    'const pilotClose = pilot.closeWithUnresolvedPreHandshake();',
    'const pilotCloseObserver = pilotClose.then(',
    'await Promise.resolve();',
    'assert.equal(pilotCloseSettled, false);',
    'await pausedRedemption.response.then(',
    'await pilotCloseObserver;',
    'assert.equal(pilotCloseOutcome, expectedCloseCode);',
    'await assert.rejects(pilotClose, error => {',
    'await pilot.waitForSocketDrain();',
    'const terminal = pilot.snapshot();',
    'assert.equal(pilot.ownerReadCount(), ownerReadsBeforeQuiesce);',
    'assert.equal(pilot.handlerAdmissionCount(), admissionsAtQuiescence);',
    "assert.equal(terminal.phase, 'TRANSPORT_UNCERTAIN');",
    'assert.equal(terminal.transportCloseClean, 0);',
    'assert.equal(terminal.transportCloseUncertain, 1);',
    'assert.deepEqual(context.serviceStore.load(), durableStateAtQuiescence);',
    'assert.deepEqual(context.observerStore.load(), observerStateAtQuiescence);',
    'assert.equal(context.serviceStore.load().state.grants.length, 1);',
    'assert.equal(context.serviceStore.load().state.grants[0].consumedUnits, 4);',
    'assert.equal(executionState.count, executionsAtQuiescence);',
    'assert.equal(observed.dispatches, signingDispatchesAtQuiescence);',
    'pilot.allowExpectedAdversarialCloseForTestCleanup();',
  ]);
  assert.equal((compositionTest.match(/server\.listen\(/g) ?? []).length, 0);
  assert.match(
    compositionTest,
    /createServiceCreditZenonHttpsOperatorPilot\(Object\.freeze\(\{[\s\S]*?bind: Object\.freeze\(\{ host: '127\.0\.0\.1', port: bindPort, exclusive: true \}\)[\s\S]*?tlsMaterial: Object\.freeze\(\{ key: tls\.key, cert: tls\.cert \}\)/,
  );
  assert.equal(compositionTest.includes('const ownedSockets = new Set()'), false);
  assert.equal(compositionTest.includes('server.closeAllConnections();'), false);
  assert.match(
    readme,
    /configured origin and HTTP authority are only SNI\/Host admission policy; `LISTENING` does not observe or attest the factory's actual bind origin/,
  );
  assert.match(
    security,
    /configured origin and authority are validation policy, not observed bind metadata/,
  );
  assert.match(
    implementationPlan,
    /configured origin and HTTP authority are SNI\/Host policy only; neither they nor a `LISTENING` result are observed proof of the factory's actual bind origin/,
  );
  assert.match(
    readme,
    /Node's documented TLS-server `connection` event is a pre-handshake stream, while `secureConnection` and `tlsClientError` expose the TLS wrapper, and Node supplies no stable public raw-to-TLS mapping/,
  );
  assert.match(
    security,
    /Node's documented TLS-server `connection` event exposes a pre-handshake stream that is not the later TLS wrapper, and Node provides no stable public mapping between them/,
  );
  assert.match(
    implementationPlan,
    /No stable public raw-to-TLS mapping exists/,
  );
  assert.match(
    readme,
    /The raw callback therefore performs lifetime bookkeeping only: it consumes one bounded connection start and increments a scalar count of outstanding accepted handshakes, but it does not inspect or retain the raw wrapper, install listeners on it, create concurrent owner capacity, or attempt later association/,
  );
  assert.match(
    security,
    /An accepted raw callback consumes a lifetime start and increments only a scalar count of outstanding accepted handshakes\. It does not read or retain that wrapper, install terminal listeners, reserve concurrent owner capacity, or later attempt association/,
  );
  assert.match(
    implementationPlan,
    /The raw callback therefore performs lifetime bookkeeping only: it consumes one bounded connection start and increments a scalar count of outstanding accepted handshakes\. It does not inspect or retain the raw wrapper, install listeners, create concurrent owner capacity, or attempt later correlation/,
  );
  assert.match(
    readme,
    /Multiple handshakes may be outstanding and their secure\/error outcomes may arrive in any order\. That scalar is count accounting supplied by the trusted factory, not socket identity, peer identity, FIFO correlation, or request authority/,
  );
  assert.match(
    security,
    /The scalar tolerates multiple concurrent handshakes and out-of-order outcomes; it proves only that the trusted factory has supplied no more first TLS terminal outcomes than accepted starts/,
  );
  assert.match(
    implementationPlan,
    /Multiple handshakes may be outstanding, and failure\/success outcomes may arrive in any order\. This scalar is trusted-factory event accounting only; it is not raw\/TLS identity, physical association, FIFO order, peer identity, or request authority/,
  );
  assert.match(
    readme,
    /A first `secureConnection` outcome must consume one outstanding unit\. It then reserves post-handshake concurrent capacity for that exact secure wrapper and publishes the reservation before any observable socket capability access or listener registration/,
  );
  assert.match(
    security,
    /`secureConnection` is the authoritative post-handshake boundary\. A first exact TLS-wrapper outcome consumes one outstanding unit, then creates one concurrent reservation for that exact secure socket before any observable socket access or listener registration/,
  );
  assert.match(
    implementationPlan,
    /`secureConnection` is the post-handshake ownership boundary\. A first exact TLS-wrapper outcome consumes one outstanding unit, then creates and publishes one concurrent reservation for that exact secure socket before any observable socket capability access or listener registration/,
  );
  assert.match(
    readme,
    /A first `tlsClientError` outcome consumes one outstanding unit when available, increments TLS rejection accounting, and destroys only the exact TLS candidate it receives; it never selects, revokes, or destroys another secure reservation/,
  );
  assert.match(
    security,
    /`tlsClientError` consumes one outstanding unit when available, increments rejection accounting, and destroys only the exact TLS socket it receives\. It never chooses or revokes another reservation/,
  );
  assert.match(
    implementationPlan,
    /A first `tlsClientError` outcome consumes one outstanding unit when available, increments `tlsRejected`, and destroys only the exact candidate wrapper it receives; it never selects or revokes another reservation/,
  );
  assert.match(
    readme,
    /Import performs no I\/O, timer, socket, bind, network-listener, Promise-hook, or other process-global observer operation\. Construction is inert/,
  );
  assert.match(
    security,
    /Module import installs no Promise hook or other process-global observer and performs no I\/O, timer, socket, bind, or network-listener operation; the owner remains absent from active production import roots/,
  );
  assert.match(
    implementationPlan,
    /Import performs no I\/O, timer, socket, bind, network-listener, Promise-hook, or other process-global observer operation\. Construction is inert/,
  );
  assert.match(
    security,
    /an in-progress trusted scheduler or cancellation call cannot be treated as quiescence during synchronous reentry/,
  );
  assert.match(
    implementationPlan,
    /terminal and permanent state are checked again before `closeClean` or `CLOSED` can be committed/,
  );
  assert.match(
    readme,
    /Both clean `CLOSED` and fixed `CLOSE_UNCERTAIN` paths publish their canonical terminal state[\s\S]*?Zero tracked sockets, requests, handlers, and owned timers prove only release of those owner-held references and accounting/,
  );
  assert.match(
    security,
    /Both clean `CLOSED` and fixed `CLOSE_UNCERTAIN` publish terminal and admission-closed state[\s\S]*?prove only release of those owner-held references and accounting/,
  );
  assert.match(
    implementationPlan,
    /Both clean `CLOSED` and fixed `CLOSE_UNCERTAIN` use the same ordered terminal boundary[\s\S]*?prove only release of those owner-held references and accounting, not termination of external operations, sockets, callbacks, or foreign emitters/,
  );
  assert.match(
    readme,
    /Listener `close` is the trusted server's terminal evidence for any still-outstanding pre-handshake accounting; without it, close cannot report clean and remains bounded by the close grace/,
  );
  assert.match(
    security,
    /A requested listener `close` is sufficient terminal evidence to clear unresolved scalar accounting; without that evidence, clean close remains forbidden and the close deadline produces uncertainty/,
  );
  assert.match(
    implementationPlan,
    /Listener `close` is the trusted server's terminal evidence for unresolved pre-handshake accounting; without it, clean close is forbidden and the close grace bounds uncertainty/,
  );
  assert.match(
    implementationPlan,
    /Before any response method can affect admission, the request lifetime start is consumed and tracked request and handler concurrency ownership is published/,
  );
  assert.match(
    readme,
    /Reentrant setup during response registration, deadline scheduling, or `setHeader` sees that reservation and is rejected without a body read or downstream invocation/,
  );
  assert.match(
    security,
    /deterministic use of those module-owned collections after injected callbacks, not isolation of arbitrary same-process code/,
  );
  assert.match(
    implementationPlan,
    /synchronous reentry cannot displace it or become a second authoritative request/,
  );
  assert.match(
    readme,
    /`handle` receives an exact frozen `\{ success, failure \}` completion as its final argument, `close` receives one as its sole argument, and both calls must return exactly `undefined`/,
  );
  assert.match(
    security,
    /No returned Promise, thenable, object, or other producer value can authorize success or clean close/,
  );
  assert.match(
    implementationPlan,
    /These owner-created capabilities, rather than caller returns, are the only downstream lifecycle authority/,
  );
  assert.match(
    implementationPlan,
    /request whose own final lifetime reservation seals acceptance remains eligible/,
  );
  assert.match(
    readme,
    /A returned capability stays local until the same start attempt, phase, ticket, unsettled state, nonterminal lifecycle, and absence of permanent uncertainty are revalidated/,
  );
  assert.match(
    security,
    /Terminal close during factory execution makes callback dispatch inert and prevents publication or `listen`/,
  );
  assert.match(
    implementationPlan,
    /factory result remains local until the exact start capability, Promise, ticket, phase, unsettled state, nonterminal lifecycle, and absence of permanent uncertainty are revalidated/,
  );
  assert.match(
    readme,
    /Secure state remains explicitly request-ineligible during capability capture, terminal-listener registration, and header-deadline installation/,
  );
  assert.match(
    security,
    /Secure tracking and both terminal listeners must succeed while every lifecycle and collection gate remains current; until then the reservation is explicitly request-ineligible/,
  );
  assert.match(
    implementationPlan,
    /Only after secure tracking and both terminal listeners succeed is secure state cleanup-visible, and it remains request-ineligible during header-deadline installation/,
  );
  assert.match(
    readme,
    /If a request reenters before secure state is published, the owner recognizes only the exact pre-eligibility reservation for that request socket, seals it terminal,[\s\S]*?Interrupted setup cannot resume to eligibility, and no unrelated secure reservation is selected or revoked/,
  );
  assert.match(
    readme,
    /Every published `close` and `closeAllConnections` invocation is covered by an owner-held server-shutdown in-flight reservation[\s\S]*?throw or non-`undefined` return latches uncertainty before release/,
  );
  assert.match(
    security,
    /Each published server `close` or `closeAllConnections` call, the encompassing close setup, and every observable socket capability\/setup\/destruction operation has explicit in-flight accounting/,
  );
  assert.match(
    implementationPlan,
    /Each published server `close` and `closeAllConnections` invocation and each observable socket capability\/setup\/destruction operation also holds a dedicated in-flight reservation before invocation through return or throw validation/,
  );
  assert.match(
    readme,
    /For each active handler it detaches the owner-created completion cell, issues the captured abort, and records one failed handler settlement in `handlersSettled` and `handlerFailures`; it does not await, inspect, or react to a returned or native Promise/,
  );
  assert.match(
    security,
    /Owner close detaches an active handler's completion cell, issues abort, and records failed settlement by incrementing `handlersSettled` and `handlerFailures` before removing that handler from owner accounting/,
  );
  assert.match(
    implementationPlan,
    /Before removing an active handler from owner accounting, close detaches its completion cell, issues abort, and increments both `handlersSettled` and `handlerFailures`/,
  );
  assert.doesNotMatch(
    `${readme}\n${security}\n${implementationPlan}`,
    /serialized distinct-wrapper promotion|raw-terminal revocation|forged returned-Promise rejection|safely installed native-Promise reaction|Unknown handlers are detached without being counted as settled|without treating detached unknown handlers as settled/,
  );
  assert.match(
    readme,
    /captures response `headersSent`, `writableEnded`, `finished`, and `destroyed` as false/,
  );
  assert.match(
    security,
    /Response admission additionally binds false `headersSent`, `writableEnded`, `finished`, and `destroyed` state/,
  );
  assert.match(
    implementationPlan,
    /Response admission also retains false `headersSent`, `writableEnded`, `finished`, and `destroyed` state/,
  );
});

test('external-holder ingress keeps native-Promise containment and terminal-safe deadlines local', () => {
  const source = readFileSync(
    new URL(
      '../src/service-credit-external-holder-grant-descriptor-handoff-http-ingress.js',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(source, /const IS_PROMISE = utilTypes\.isPromise;/);
  assert.match(
    source,
    /const PROMISE_THEN_DESCRIPTOR = OBJECT_FREEZE\(REFLECT_APPLY\([\s\S]*?\[PROMISE_PROTOTYPE, 'then'\]/,
  );
  assert.match(
    source,
    /const PROMISE_PROTOTYPE_CONSTRUCTOR_DESCRIPTOR = OBJECT_FREEZE\(REFLECT_APPLY\([\s\S]*?\[PROMISE_PROTOTYPE, 'constructor'\]/,
  );
  assert.match(
    source,
    /const PROMISE_SPECIES_DESCRIPTOR = OBJECT_FREEZE\(REFLECT_APPLY\([\s\S]*?\[NATIVE_PROMISE, PROMISE_SPECIES\]/,
  );
  assert.doesNotMatch(source, /\bpromise\.(?:then|constructor)\b/);
  assert.doesNotMatch(source, /NATIVE_PROMISE\s*\[\s*PROMISE_SPECIES\s*\]/);
  assert.match(
    source,
    /\[promise, 'constructor', temporaryDescriptor\][\s\S]*?REFLECT_APPLY\(PROMISE_THEN, promise, \[onFulfilled, onRejected\]\)[\s\S]*?const restored = restorePromiseConstructorDescriptor\(promise, constructorDescriptor\);[\s\S]*?if \(!attached \|\| !restored\) return PROMISE_OBSERVATION\.UNOBSERVABLE;[\s\S]*?callbacksEnabled = true;/,
  );
  assert.match(
    source,
    /observation === PROMISE_OBSERVATION\.UNOBSERVABLE\) \{\s*unexpectedNativePromises\.add\(operation\);/,
  );
  assert.match(
    source,
    /owner\[slot\] = ticket;[\s\S]*?REFLECT_APPLY\(schedule, undefined, \[onDeadline, milliseconds\]\)/,
  );
  assert.match(
    source,
    /if \(owner\[slot\] === ticket && ticket\.active === true\) \{\s*ticket\.handle = handle;\s*ticket\.handleReady = true;/,
  );
  assert.match(
    source,
    /ticket\.active = false;\s*return cancelHandle\(handle\)[\s\S]*?DEADLINE_OUTCOME\.TERMINATED/,
  );
  assert.doesNotMatch(
    source,
    /(?:bodyDeadline|responseDeadline|closeState\.deadline)\s*=\s*scheduleTicket/,
  );
  assert.match(source, /unexpectedNativePromises\.size !== 0/);
  assert.match(
    source,
    /const cancellationClean = clearCloseDeadline\(\);[\s\S]*?increment\('closeClean'\)/,
  );
  assert.match(
    source,
    /closeTerminal = true;\s*phase = PHASE\.CLOSED;\s*emitEvent\(EVENT\.closeClean\)/,
  );
});

test('native attestor release source excludes test fixtures and keeps signing denied', () => {
  const makefile = readFileSync(new URL('../native/provider-attestor/Makefile', import.meta.url), 'utf8');
  const releaseRule = /^\$\(BUILD_DIR\)\/provider-attestor-release-candidate:([^\n]*)\n\t([^\n]*)$/m.exec(makefile);
  assert.ok(releaseRule, 'the release candidate must have an explicit link recipe');
  const [, prerequisites, compile] = releaseRule;
  assert.match(prerequisites, /src\/provider_attestor_release_child\.m/);
  assert.match(compile, /-DPA_RELEASE_BUILD=1/);
  assert.match(compile, /\$\(RELEASE_PIN_FLAGS\)/);
  for (const text of [prerequisites, compile]) {
    assert.doesNotMatch(text, /tests\/|test_grant_adapter|TEST_PIN_FLAGS|CHILD_TEST_PIN_FLAGS/);
    assert.doesNotMatch(text, /PA_TESTING|PA_SYNTHETIC_CHILD_TESTING|PA_MACOS_APPROVAL_TESTING|PA_SIGNER_PROFILE_TESTING|PA_SIGNER_LOADER_TESTING/);
  }

  const releaseChild = readFileSync(new URL('../native/provider-attestor/src/provider_attestor_release_child.m', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../native/provider-attestor/src/provider_attestor_runtime.m', import.meta.url), 'utf8');
  const signer = readFileSync(new URL('../native/provider-attestor/src/provider_attestor_signer.m', import.meta.url), 'utf8');
  assert.match(releaseChild, /#if !defined\(PA_RELEASE_BUILD\) \|\| defined\(PA_TESTING\) \|\| defined\(PA_MACOS_APPROVAL_TESTING\)/);
  assert.match(releaseChild, /#if defined\(PA_SYNTHETIC_CHILD_TESTING\) \|\| defined\(PA_TEST_AUTHORITY_RECORD\)/);
  assert.match(runtime, /#if defined\(PA_TESTING\) && defined\(PA_RELEASE_BUILD\)/);
  assert.match(runtime, /#if defined\(PA_TEST_FIXTURE_ONLY\)\s*\n#error Synthetic fixture pins cannot be used in a release runtime/);
  assert.match(signer, /static BOOL PADynamicLoaderQualified\(void\) \{\s*return NO;\s*\}/);
  assert.match(signer, /if \(!PADynamicLoaderQualified\(\)\)/);
});

test('development/testnet child is a separate pinned test-only FD3/FD4 target', () => {
  const makefile = readFileSync(new URL('../native/provider-attestor/Makefile', import.meta.url), 'utf8');
  const allRule = /^all: ([^\n]+)$/m.exec(makefile);
  assert.equal(allRule?.[1], 'conformance conformance-only');
  const developmentRule = /^\$\(BUILD_DIR\)\/provider-attestor-development-testnet-child:([^\n]*)\n\t([^\n]*)$/m.exec(makefile);
  assert.ok(developmentRule);
  assert.match(developmentRule[1], /tests\/development_testnet_ui\.m/);
  assert.match(developmentRule[1], /tests\/disposable_token_signer\.m/);
  assert.match(developmentRule[2], /-DPA_TESTING=1/);
  assert.match(developmentRule[2], /-DPA_DEVELOPMENT_TESTNET_CHILD=1/);
  assert.match(developmentRule[2], /\$\(DEV_TESTNET_PIN_FLAGS\)/);
  assert.doesNotMatch(developmentRule[2], /PA_RELEASE_BUILD|PA_DISPOSABLE_SIGNER_TEST_FAULTS|development_testnet_test_ui|test_grant_adapter/);
  const releaseRule = /^\$\(BUILD_DIR\)\/provider-attestor-release-candidate:([^\n]*)\n\t([^\n]*)$/m.exec(makefile);
  assert.ok(releaseRule);
  assert.doesNotMatch(releaseRule[0], /development_testnet|disposable_token_signer|DEV_TESTNET/);
  const child = readFileSync(new URL('../native/provider-attestor/tests/development_testnet_child_main.m', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../native/provider-attestor/tests/development_testnet_ui.m', import.meta.url), 'utf8');
  const sharedSigner = readFileSync(new URL('../native/provider-attestor/tests/disposable_token_signer.m', import.meta.url), 'utf8');
  assert.match(sharedSigner, /C_VerifyInit/);
  assert.match(sharedSigner, /C_Verify\(/);
  assert.match(sharedSigner, /#if defined\(PA_DISPOSABLE_SIGNER_TEST_FAULTS\)\s*if \(self\.corruptSignatureForTesting\)/);
  assert.match(child, /defined\(PA_RELEASE_BUILD\)/);
  assert.match(child, /if \(argc != 1\)/);
  assert.match(child, /PAReadOneFrame\(3\)/);
  assert.match(child, /PAWriteOneFrame\(4, response\)/);
  assert.match(ui, /addButtonWithTitle:@"Cancel"\];\s*NSButton \*approve = \[alert addButtonWithTitle:@"Approve this operation"\]/);
  assert.match(ui, /addButtonWithTitle:@"Cancel"\];\s*NSButton \*unlock = \[alert addButtonWithTitle:@"Unlock once"\]/);
  assert.match(ui, /NSSecureTextField/);
  for (const source of [child, ui, sharedSigner]) {
    assert.doesNotMatch(source, /SecItem|LAContext|CK_GenerateKeyPair|getenv\(/);
  }
});

test('synthetic manual GUI target is isolated and its automated variant cannot show a dialog', () => {
  const makefile = readFileSync(new URL('../native/provider-attestor/Makefile', import.meta.url), 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const manual = /^\$\(BUILD_DIR\)\/provider-attestor-development-testnet-synthetic-manual-gui:([^\n]*)\n\t([^\n]*)$/m.exec(makefile);
  const noDialog = /^\$\(BUILD_DIR\)\/provider-attestor-development-testnet-synthetic-manual-gui-no-dialog-test:([^\n]*)\n\t([^\n]*)$/m.exec(makefile);
  const release = /^\$\(BUILD_DIR\)\/provider-attestor-release-candidate:([^\n]*)\n\t([^\n]*)$/m.exec(makefile);
  assert.ok(manual);
  assert.ok(noDialog);
  assert.ok(release);
  for (const rule of [manual, noDialog]) {
    assert.match(rule[1], /tests\/development_testnet_ui\.m/);
    assert.match(rule[1], /tests\/development_testnet_child_main\.m/);
    assert.match(rule[2], /-DPA_TESTING=1/);
    assert.match(rule[2], /-DPA_SYNTHETIC_MANUAL_GUI_TESTING=1/);
    assert.match(rule[2], /-framework AppKit/);
    assert.doesNotMatch(rule[0], /test_grant_adapter|development_testnet_test_ui|PA_RELEASE_BUILD|PA_DEVELOPMENT_TESTNET_TESTING|PA_DEV_TEST_ROOT/);
  }
  assert.doesNotMatch(manual[2], /PA_SYNTHETIC_MANUAL_NO_DIALOG_TESTING/);
  assert.match(noDialog[2], /-DPA_SYNTHETIC_MANUAL_NO_DIALOG_TESTING=1/);
  assert.doesNotMatch(release[0], /synthetic-manual-gui|PA_SYNTHETIC_MANUAL_GUI_TESTING/);
  assert.doesNotMatch(packageText, /synthetic-manual-gui/);
  const child = readFileSync(new URL('../native/provider-attestor/tests/development_testnet_child_main.m', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../native/provider-attestor/tests/development_testnet_ui.m', import.meta.url), 'utf8');
  assert.match(child, /defined\(PA_DEVELOPMENT_TESTNET_TESTING\) && defined\(PA_SYNTHETIC_MANUAL_GUI_TESTING\)/);
  assert.match(child, /sizeof\(PA_SYNTHETIC_MANUAL_ROOT_TAG\) == 17U/);
  assert.match(child, /const char \*temporary = "\/private\/tmp";/);
  assert.match(child, /before\.st_nlink < 1/);
  assert.match(child, /testRoot isEqualToString:fixedRoot/);
  assert.match(child, /if \(argc != 1\)/);
  assert.match(child, /PAReadOneFrame\(3\)/);
  assert.match(child, /PAWriteOneFrame\(4, response\)/);
  assert.match(ui, /SYNTHETIC\/OFFLINE SOFTWARE ATTESTOR/);
  assert.match(ui, /#if defined\(PA_SYNTHETIC_MANUAL_NO_DIALOG_TESTING\)[\s\S]*?return PAOperatorDisplayOutcomeAmbiguous;/);
  assert.match(ui, /#if defined\(PA_SYNTHETIC_MANUAL_NO_DIALOG_TESTING\)[\s\S]*?return NO;/);
});

test('synthetic bootstrap GUI collector is absent from default and release paths', () => {
  const makefile = readFileSync(new URL('../native/provider-attestor/Makefile', import.meta.url), 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../native/provider-attestor/tests/disposable_token_bootstrap_gui_main.m', import.meta.url), 'utf8');
  const fake = readFileSync(new URL('../native/provider-attestor/tests/disposable_token_bootstrap_fd_fake_main.c', import.meta.url), 'utf8');
  const manual = /^\$\(BUILD_DIR\)\/provider-attestor-disposable-token-bootstrap-synthetic-gui:([^\n]*)\n\t([^\n]*)$/m.exec(makefile);
  const offline = /^\$\(BUILD_DIR\)\/provider-attestor-disposable-token-bootstrap-synthetic-gui-fake-ui-test:([^\n]*)\n\t([^\n]*)$/m.exec(makefile);
  const release = /^\$\(BUILD_DIR\)\/provider-attestor-release-candidate:([^\n]*)\n\t([^\n]*)$/m.exec(makefile);
  assert.ok(manual);
  assert.ok(offline);
  assert.ok(release);
  for (const rule of [manual, offline]) {
    assert.match(rule[2], /-DPA_TESTING=1/);
    assert.match(rule[2], /-DPA_SYNTHETIC_BOOTSTRAP_GUI=1/);
    assert.match(rule[2], /BOOTSTRAP_GUI_PIN_FLAGS/);
  }
  assert.match(manual[2], /-framework AppKit/);
  assert.doesNotMatch(manual[2], /PA_GUI_BOOTSTRAP_FAKE_UI/);
  assert.match(offline[2], /PA_GUI_BOOTSTRAP_FAKE_UI=1/);
  assert.doesNotMatch(release[0], /bootstrap_gui|BOOTSTRAP_GUI|synthetic-gui/);
  assert.doesNotMatch(/^all:[^\n]*/m.exec(makefile)[0], /synthetic-gui/);
  assert.doesNotMatch(packageText, /bootstrap-synthetic-gui/);
  assert.match(source, /defined\(PA_RELEASE_BUILD\)/);
  assert.match(source, /NSSecureTextField/);
  assert.match(source, /addButtonWithTitle:@"Cancel"/);
  assert.match(source, /NSAlertSecondButtonReturn/);
  assert.match(source, /POSIX_SPAWN_CLOEXEC_DEFAULT/);
  assert.match(source, /PAEstablishWaitableSIGCHLD\(\)/);
  assert.match(source, /action\.sa_handler = SIG_DFL/);
  assert.match(source, /if \(valid\) valid = PAEstablishWaitableSIGCHLD\(\);\s*if \(valid\) valid = posix_spawn/);
  assert.match(source, /waitpid\(child, NULL, WNOHANG\)[\s\S]*?if \(waited == 0\) break;[\s\S]*?kill\(child, SIGKILL\)/);
  assert.match(source, /char \*emptyEnvironment\[\] = \{ NULL \}/);
  assert.match(source, /posix_spawn\(&child, PA_GUI_BOOTSTRAP_EXECUTABLE_PATH/);
  assert.match(source, /PAHasNoExtendedACL\(descriptor\)/);
  assert.doesNotMatch(source, /posix_spawnp|system\(|popen\(|getenv\(|SecItem|LAContext/);
  assert.match(fake, /PA_GUI_BOOTSTRAP_OFFLINE_TEST/);
});

test('native private roots and files reject extended ACL entries', () => {
  const acl = readFileSync(new URL('../native/provider-attestor/include/provider_attestor_private_acl.h', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../native/provider-attestor/src/provider_attestor_runtime.m', import.meta.url), 'utf8');
  const child = readFileSync(new URL('../native/provider-attestor/tests/development_testnet_child_main.m', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../native/provider-attestor/tests/disposable_token_bootstrap_main.m', import.meta.url), 'utf8');
  assert.match(acl, /acl_get_fd_np\(descriptor, ACL_TYPE_EXTENDED\)/);
  assert.match(acl, /acl_get_entry\(acl, ACL_FIRST_ENTRY/);
  assert.match(acl, /errno == ENOENT/);
  assert.match(acl, /acl_free\(acl\)/);
  assert.match(runtime, /PAValidatePrivateDirectory[\s\S]*?PAHasNoExtendedACL\(descriptor\)/);
  assert.match(runtime, /PAOpenOwnerPrivateFile[\s\S]*?PAHasNoExtendedACL\(descriptor\)/);
  assert.match(runtime, /PAValidateSidecarIfPresent[\s\S]*?PAHasNoExtendedACL\(descriptor\)/);
  assert.match(child, /PADevDirectoryHasNoACL/);
  assert.match(child, /PADevReadPrivateConfiguration[\s\S]*?PAHasNoExtendedACL\(descriptor\)/);
  assert.match(child, /PADevPinnedTokenConfiguration[\s\S]*?PAHasNoExtendedACL\(descriptor\)/);
  assert.match(bootstrap, /PAWritePrivateConfig[\s\S]*?PAHasNoExtendedACL\(rootDescriptor\)/);
});

test('development provisioning preflight remains a read-only opt-in source', () => {
  const source = readFileSync(new URL('../native/provider-attestor/tests/development_testnet_provision_plan.mjs', import.meta.url), 'utf8');
  const makefile = readFileSync(new URL('../native/provider-attestor/Makefile', import.meta.url), 'utf8');
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.match(source, /parseZenonFundingProviderAttestationAuthorityRecord/);
  assert.match(source, /inspectPinnedImageReadOnly/);
  assert.match(source, /inspectFixedDevelopmentTargetsAbsentReadOnly/);
  assert.match(source, /readSync\(descriptor, probe, 0, 1, null\)/);
  assert.doesNotMatch(source, /readFileSync\(descriptor\)/);
  assert.match(source, /process\.stdout\.write\(passed \? 'PLAN_PREFLIGHT=PASS\\n' : 'PLAN_PREFLIGHT=FAIL\\n'\)/);
  assert.doesNotMatch(source, /process\.stderr|console\.|process\.env/);
  assert.doesNotMatch(source, /\b(?:mkdirSync|writeFileSync|renameSync|unlinkSync|spawn|execFile|dlopen|NSSecureTextField)\b/);
  assert.doesNotMatch(makefile, /development_testnet_provision_plan/);
  assert.doesNotMatch(packageText, /development_testnet_provision_plan/);
});
