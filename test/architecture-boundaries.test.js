import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('Zenon funding and signing compositions remain absent from package and active runtime import graphs', () => {
  const compositionNames = [
    'service-credit-zenon-funding-composition.js',
    'service-credit-zenon-durable-http-composition.js',
    'service-credit-zenon-provider-signing-child-protocol.js',
    'service-credit-zenon-provider-signing-operation.js',
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
