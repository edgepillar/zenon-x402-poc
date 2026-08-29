import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as sdk from 'znn-typescript-sdk';

import { paymentIntentDigest } from '../src/canonical.js';
import {
  LIVE_EVIDENCE_VERSION,
  LiveEvidenceError,
  assembleLiveEvidenceBundle,
  createLiveEvidenceTemplate,
  parseLiveEvidenceBundle,
  parseLiveEvidenceFragment,
  serializeLiveEvidenceBundle,
  verifyLiveEvidenceBundle,
} from '../src/live-evidence.js';
import { runLiveEvidenceCli } from '../src/live-evidence-cli.js';
import { computeBlockHash, preflightZenonPayment } from '../src/zenon-payment.js';
import {
  OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE,
} from '../src/zenon/operator-trusted-testnet-profile.js';

const NON_CLAIM_FIELDS = Object.freeze([
  'authoritativeCurrentNetworkRelease',
  'signedTrustArtifact',
  'authenticatedRpcEndpoint',
  'canonicalRemoteChainIdentity',
  'verifiedFrontierLineage',
  'authenticatedChainIdentity',
  'canonicalNetworkIdentity',
  'irreversibleFinality',
  'facilitatorAuthorship',
  'productionReadiness',
  'phase2C',
  'hardwareWallet',
  'crossProcessExactlyOnce',
  'replayPreventionProvided',
  'resourceAuthorizationProvided',
  'bundleOriginAuthenticated',
  'bundleIntegrityAuthenticated',
  'chainObservationIndependentlyAttested',
  'httpExchangeIndependentlyAttested',
  'facilitatorPublicationProven',
  'buyerReceiptCryptographicallyProven',
  'recipientReceiveObserved',
  'secretAbsenceProven',
]);

const PHASES = Object.freeze([
  ['runner', 'challenge_request_started', 0, 0],
  ['runner', 'challenge_402_received', 1_000, 1_000],
  ['buyer', 'buyer_owner_wait_started', 1_100, 0],
  ['buyer', 'buyer_owner_acquired', 1_200, 100],
  ['buyer', 'buyer_readiness_started', 1_300, 200],
  ['buyer', 'buyer_readiness_finished', 1_400, 300],
  ['buyer', 'prepare_block_started', 1_500, 400],
  ['buyer', 'prepare_block_finished', 1_600, 500],
  ['buyer', 'buyer_owner_released', 1_700, 600],
  ['facilitator', 'facilitator_owner_wait_started', 1_800, 0],
  ['facilitator', 'facilitator_owner_acquired', 1_900, 100],
  ['facilitator', 'facilitator_readiness_started', 2_000, 200],
  ['facilitator', 'facilitator_readiness_finished', 2_100, 300],
  ['facilitator', 'publication_started', 2_200, 400],
  ['facilitator', 'publication_acknowledged', 2_500, 700],
  ['facilitator', 'inclusion_wait_started', 2_600, 800],
  ['facilitator', 'momentum_inclusion_observed', 3_000, 1_100],
  ['facilitator', 'facilitator_owner_released', 3_100, 1_200],
  ['facilitator', 'delivery_started', 3_200, 1_300],
  ['facilitator', 'delivery_finished', 5_000, 3_100],
  ['runner', 'paid_response_received', 5_100, 5_100],
]);

const CLOCKS = Object.freeze({
  runner: 'runner-monotonic-v1',
  buyer: 'buyer-monotonic-v1',
  facilitator: 'facilitator-monotonic-v1',
});

function utc(milliseconds) {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0, milliseconds)).toISOString();
}

function falseNonClaims() {
  const result = {};
  for (const field of NON_CLAIM_FIELDS) result[field] = false;
  return result;
}

function timingFragment() {
  return {
    fragmentVersion: 1,
    fragmentType: 'timing',
    timing: {
      events: PHASES.map(([role, phase, utcOffset, monotonicMs], sequence) => ({
        sequence,
        phase,
        role,
        clockDomain: CLOCKS[role],
        utc: utc(utcOffset),
        monotonicMs,
      })),
      durationsMs: {
        challenge: 1_000,
        total: 4_100,
        buyerOwnerWait: 100,
        buyerOwnerHeld: 500,
        buyerReadiness: 100,
        prepareBlock: 100,
        facilitatorOwnerWait: 100,
        facilitatorOwnerHeld: 1_100,
        facilitatorReadiness: 100,
        publication: 300,
        inclusionWait: 300,
        delivery: 1_800,
      },
    },
  };
}

function protectedBody(network, payer, transaction) {
  return {
    ok: true,
    message: 'paid resource unlocked',
    network,
    payer,
    transaction,
    generatedAt: utc(4_000),
  };
}

async function evidenceFixture({
  sourceSchemaVersion = 1,
  resource = {},
  fusedPlasma = 0,
  difficulty = 0,
  nonce = '0'.repeat(16),
} = {}) {
  const buyer = sdk.KeyPair.fromPrivateKey(randomBytes(32));
  const seller = sdk.KeyPair.fromPrivateKey(randomBytes(32));
  try {
    const requirement = {
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: sdk.ZNN_ZTS.toString(),
      amount: '1',
      payTo: seller.getAddress().toString(),
      maxTimeoutSeconds: 60,
      extra: {
        poc: true,
        settlement: 'account-block',
        zenonChain: { ...OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE },
        paymentFlow: 'upfront',
      },
    };
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: `https:${'//'}example.invalid/paid`,
        ...resource,
      },
      accepts: [requirement],
    };
    const intentDigest = paymentIntentDigest(paymentRequired, requirement);
    const block = sdk.AccountBlockTemplate.send(
      sdk.Address.parse(requirement.payTo),
      sdk.TokenStandard.parse(requirement.asset),
      1n,
    );
    block.chainIdentifier = Number(OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.chainIdentifier);
    block.address = buyer.getAddress();
    block.height = 1;
    block.momentumAcknowledged = new sdk.HashHeight(
      sdk.Hash.digest(Buffer.from('offline evidence acknowledged momentum')),
      1,
    );
    block.data = Buffer.from(intentDigest, 'hex');
    block.fusedPlasma = fusedPlasma;
    block.difficulty = difficulty;
    block.nonce = nonce;
    block.publicKey = buyer.getPublicKey();
    block.hash = computeBlockHash(block, sdk);
    block.signature = buyer.sign(block.hash.getBytes());
    const accountBlock = block.toJson();
    const paymentPayload = {
      x402Version: 2,
      resource: structuredClone(paymentRequired.resource),
      accepted: structuredClone(requirement),
      payload: { transaction: accountBlock, intentDigest },
    };
    const preflight = await preflightZenonPayment(paymentPayload, requirement, paymentRequired);
    const confirmation = {
      observedAt: utc(3_000),
      numConfirmations: 1,
      momentumHeight: 11,
      momentumHash: sdk.Hash.digest(Buffer.from('offline evidence inclusion momentum')).toString(),
      momentumTimestamp: 1,
    };
    const body = protectedBody(requirement.network, preflight.payer, preflight.transactionHash);
    const bodyText = JSON.stringify(body, null, 2);
    const record = {
      authorizationKey: preflight.authorizationKey,
      transactionHash: preflight.transactionHash,
      chainProfile: structuredClone(preflight.chainProfile),
      intentDigest,
      resourceIdentity: structuredClone(paymentRequired.resource),
      resourceDigest: preflight.resourceDigest,
      payer: preflight.payer,
      signedAccountBlock: structuredClone(accountBlock),
      evidenceState: 'MOMENTUM_INCLUDED',
      momentumEvidence: {
        observedAt: confirmation.observedAt,
        confirmationDetail: {
          numConfirmations: confirmation.numConfirmations,
          momentumHeight: confirmation.momentumHeight,
          momentumHash: confirmation.momentumHash,
          momentumTimestamp: confirmation.momentumTimestamp,
        },
      },
      deliveryState: 'DELIVERED',
      cachedResponse: {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
      },
      createdAt: utc(2_150),
      updatedAt: utc(4_500),
    };
    return {
      manifest: {
        fragmentVersion: 1,
        fragmentType: 'manifest',
        source: {
          repository: 'edgepillar/zenon-x402-poc',
          revision: 'a'.repeat(40),
          packageVersion: '0.2.0',
          nodeMajor: 24,
        },
        trust: {
          mode: 'operator-trusted-historical-observation',
          profileName: OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
          chainIdentifier: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.chainIdentifier,
          genesisMomentumHash: OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE.genesisMomentumHash,
          provenance: structuredClone(OPERATOR_TRUSTED_PUBLIC_TESTNET_PROVENANCE),
          remoteChainAuthenticated: false,
        },
        payment: {
          paymentRequired,
          selectedIndex: 0,
          intentDigest,
          authorizationKey: preflight.authorizationKey,
        },
        nonClaims: falseNonClaims(),
      },
      chain: {
        fragmentVersion: 1,
        fragmentType: 'chain',
        chain: { accountBlock, confirmation },
      },
      http: {
        fragmentVersion: 1,
        fragmentType: 'http',
        http: {
          initial: { status: 402, observedAt: utc(1_000) },
          final: {
            status: 200,
            observedAt: utc(5_100),
            paymentResponse: {
              success: true,
              network: requirement.network,
              transaction: preflight.transactionHash,
              payer: preflight.payer,
              state: 'MOMENTUM_INCLUDED',
            },
            contentType: 'application/json; charset=utf-8',
            cacheControl: 'private, no-store, max-age=0',
            vary: 'PAYMENT-SIGNATURE',
            bodyText,
          },
        },
      },
      journal: {
        fragmentVersion: 1,
        fragmentType: 'journal',
        journal: {
          sourceSchemaVersion,
          sourceRevision: 4,
          activeRecordCount: 1,
          tombstoneCount: 0,
          record,
        },
      },
      timing: timingFragment(),
    };
  } finally {
    buyer.clear();
    seller.clear();
  }
}

function assertFixedFailure(error) {
  assert.ok(error instanceof LiveEvidenceError);
  assert.equal(error.code, 'live_evidence_invalid');
  assert.equal(error.cause, undefined);
  assert.equal(error.stack, 'LiveEvidenceError: live_evidence_invalid');
  return true;
}

function independentCanonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) {
    let encoded = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) encoded += ',';
      encoded += independentCanonicalJson(value[index]);
    }
    return `${encoded}]`;
  }
  const keys = Object.keys(value).sort();
  let encoded = '{';
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) encoded += ',';
    const key = keys[index];
    encoded += `${JSON.stringify(key)}:${independentCanonicalJson(value[key])}`;
  }
  return `${encoded}}`;
}

function independentDigest(prefix, value, { newline = false } = {}) {
  const encoded = `${independentCanonicalJson(value)}${newline ? '\n' : ''}`;
  return createHash('sha256').update(prefix, 'utf8').update(encoded, 'utf8').digest('hex');
}

function recomputeIndependentIntegrity(bundle) {
  const sectionNames = [
    'source', 'trust', 'payment', 'chain', 'http', 'journal', 'timing', 'nonClaims',
  ];
  const sectionDigests = {};
  for (const name of sectionNames) {
    sectionDigests[name] = independentDigest(
      `zenon-x402-live-evidence-v1:section:${name}\0`,
      bundle[name],
    );
  }
  const target = {
    evidenceVersion: 1,
    source: bundle.source,
    trust: bundle.trust,
    payment: bundle.payment,
    chain: bundle.chain,
    http: bundle.http,
    journal: bundle.journal,
    timing: bundle.timing,
    nonClaims: bundle.nonClaims,
    integrity: { algorithm: 'sha256', sectionDigests },
  };
  bundle.integrity = {
    algorithm: 'sha256',
    sectionDigests,
    bundleDigest: independentDigest('zenon-x402-live-evidence-v1:bundle\0', target),
  };
  return bundle;
}

test('offline live-evidence contract exposes only the deterministic checklist template', async () => {
  assert.equal(LIVE_EVIDENCE_VERSION, 1);
  const template = createLiveEvidenceTemplate();
  assert.deepEqual(template, {
    templateVersion: 1,
    requiredFragments: {
      manifest: null,
      chain: null,
      http: null,
      journal: null,
      timing: null,
    },
  });
  assert.equal(Object.isFrozen(template), true);
  assert.equal(Object.isFrozen(template.requiredFragments), true);
  await assert.rejects(verifyLiveEvidenceBundle(template), assertFixedFailure);
});

test('live-evidence CLI module is import-safe and exposes only an explicit runner', () => {
  assert.equal(typeof runLiveEvidenceCli, 'function');
});

test('valid schema-v1 and schema-v2 source assertions round-trip deterministically', async () => {
  for (const sourceSchemaVersion of [1, 2]) {
    const fragments = await evidenceFixture({ sourceSchemaVersion });
    const bundle = await assembleLiveEvidenceBundle(fragments);
    assert.deepEqual(await verifyLiveEvidenceBundle(bundle), { valid: true, evidenceVersion: 1 });
    const first = await serializeLiveEvidenceBundle(bundle);
    const parsed = parseLiveEvidenceBundle(first);
    const second = await serializeLiveEvidenceBundle(parsed);
    assert.equal(second, first);
    assert.equal(first.endsWith('\n'), true);
    assert.equal(first.endsWith('\n\n'), false);
    assert.equal(Object.isFrozen(bundle), true);
    assert.equal(Object.isFrozen(bundle.chain.accountBlock), true);
    assert.equal(Object.isFrozen(parsed.timing.events), true);
  }
});

test('final included and delivered evidence requires the production revision floor', async t => {
  for (const sourceSchemaVersion of [1, 2]) {
    for (const sourceRevision of [0, 1, 2, 3]) {
      await t.test(`schema ${sourceSchemaVersion} revision ${sourceRevision}`, async () => {
        const fragments = await evidenceFixture({ sourceSchemaVersion });
        fragments.journal.journal.sourceRevision = sourceRevision;
        await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);

        const valid = await assembleLiveEvidenceBundle(await evidenceFixture({ sourceSchemaVersion }));
        const impossible = structuredClone(valid);
        impossible.journal.sourceRevision = sourceRevision;
        recomputeIndependentIntegrity(impossible);
        await assert.rejects(verifyLiveEvidenceBundle(impossible), assertFixedFailure);
      });
    }
  }
});

test('schema-v1 and schema-v2 final evidence preserves valid equal journal timestamps', async () => {
  for (const sourceSchemaVersion of [1, 2]) {
    const fragments = await evidenceFixture({ sourceSchemaVersion });
    const sameUtc = utc(0);
    for (const event of fragments.timing.timing.events) event.utc = sameUtc;
    fragments.http.http.initial.observedAt = sameUtc;
    fragments.http.http.final.observedAt = sameUtc;
    fragments.chain.chain.confirmation.observedAt = sameUtc;
    const record = fragments.journal.journal.record;
    record.createdAt = sameUtc;
    record.updatedAt = sameUtc;
    record.momentumEvidence.observedAt = sameUtc;
    record.cachedResponse.body.generatedAt = sameUtc;
    fragments.http.http.final.bodyText = JSON.stringify(record.cachedResponse.body, null, 2);

    const bundle = await assembleLiveEvidenceBundle(fragments);
    assert.equal(bundle.journal.sourceRevision, 4);
    assert.equal(bundle.journal.record.updatedAt, bundle.journal.record.createdAt);
    assert.deepEqual(await verifyLiveEvidenceBundle(bundle), { valid: true, evidenceVersion: 1 });
  }
});

test('ResourceInfo optional presence and ordered duplicate tags remain significant', async () => {
  const minimal = await assembleLiveEvidenceBundle(await evidenceFixture());
  assert.deepEqual(minimal.payment.paymentRequired.resource, {
    url: `https:${'//'}example.invalid/paid`,
  });
  const resource = {
    description: 'Offline evidence',
    mimeType: 'application/json',
    serviceName: 'evidence',
    tags: ['same', 'same', 'last'],
    iconUrl: `https:${'//'}example.invalid/icon`,
  };
  const complete = await assembleLiveEvidenceBundle(await evidenceFixture({ resource }));
  assert.deepEqual(complete.payment.paymentRequired.resource.tags, ['same', 'same', 'last']);
  const reordered = await evidenceFixture({ resource: { ...resource, tags: ['same', 'last', 'same'] } });
  assert.notEqual(reordered.manifest.payment.intentDigest, complete.payment.intentDigest);
  const emptyTags = await assembleLiveEvidenceBundle(await evidenceFixture({ resource: { tags: [] } }));
  assert.deepEqual(emptyTags.payment.paymentRequired.resource.tags, []);
});

test('work classification derives from signed fields for all four cases', async () => {
  const cases = [
    [0, 0, 'none'],
    [1, 0, 'fused_plasma_only'],
    [0, 1, 'pow_only'],
    [1, 1, 'fused_plasma_and_pow'],
  ];
  for (const [fusedPlasma, difficulty, classification] of cases) {
    const bundle = await assembleLiveEvidenceBundle(await evidenceFixture({ fusedPlasma, difficulty }));
    assert.deepEqual(bundle.timing.work, { classification, fusedPlasma, difficulty });
    const differentNonce = await assembleLiveEvidenceBundle(await evidenceFixture({
      fusedPlasma,
      difficulty,
      nonce: '1'.repeat(16),
    }));
    assert.deepEqual(differentNonce.timing.work, bundle.timing.work);
  }
});

test('resource and icon URLs reject credentials, queries, fragments, and bare delimiters', async t => {
  const cases = [
    ['resource non-HTTPS protocol', 'url', `http:${'//'}example.invalid/paid`],
    ['resource relative URL', 'url', 'relative/paid'],
    ['resource query', 'url', `https:${'//'}example.invalid/paid?value`],
    ['resource empty query', 'url', `https:${'//'}example.invalid/paid?`],
    ['resource fragment', 'url', `https:${'//'}example.invalid/paid#value`],
    ['resource empty fragment', 'url', `https:${'//'}example.invalid/paid#`],
    ['resource both delimiters', 'url', `https:${'//'}example.invalid/paid?#`],
    ['resource credentials', 'url', `https:${'//'}user@example.invalid/paid`],
    ['icon query', 'iconUrl', `https:${'//'}example.invalid/icon?value`],
    ['icon empty query', 'iconUrl', `https:${'//'}example.invalid/icon?`],
    ['icon fragment', 'iconUrl', `https:${'//'}example.invalid/icon#value`],
    ['icon empty fragment', 'iconUrl', `https:${'//'}example.invalid/icon#`],
    ['icon both delimiters', 'iconUrl', `https:${'//'}example.invalid/icon?#`],
    ['icon credentials', 'iconUrl', `https:${'//'}user@example.invalid/icon`],
    ['icon unsupported protocol', 'iconUrl', 'data:text/plain,icon'],
    ['icon relative URL', 'iconUrl', 'relative/icon'],
  ];
  for (const [name, field, value] of cases) {
    await t.test(name, async () => {
      const fragments = await evidenceFixture();
      fragments.manifest.payment.paymentRequired.resource[field] = value;
      fragments.journal.journal.record.resourceIdentity[field] = value;
      await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
    });
  }
});

test('resource and icon URL length limits accept the boundary and reject boundary plus one', async () => {
  const resourcePrefix = `https:${'//'}example.invalid/`;
  const iconPrefix = `https:${'//'}example.invalid/`;
  const resourceUrl = `${resourcePrefix}${'r'.repeat(4096 - resourcePrefix.length)}`;
  const iconUrl = `${iconPrefix}${'i'.repeat(2048 - iconPrefix.length)}`;
  const valid = await assembleLiveEvidenceBundle(await evidenceFixture({
    resource: { url: resourceUrl, iconUrl },
  }));
  assert.equal(valid.payment.paymentRequired.resource.url.length, 4096);
  assert.equal(valid.payment.paymentRequired.resource.iconUrl.length, 2048);

  const resourceTooLong = await evidenceFixture();
  resourceTooLong.manifest.payment.paymentRequired.resource.url = `${resourceUrl}r`;
  resourceTooLong.journal.journal.record.resourceIdentity.url = `${resourceUrl}r`;
  await assert.rejects(assembleLiveEvidenceBundle(resourceTooLong), assertFixedFailure);

  const iconTooLong = await evidenceFixture();
  iconTooLong.manifest.payment.paymentRequired.resource.iconUrl = `${iconUrl}i`;
  iconTooLong.journal.journal.record.resourceIdentity.iconUrl = `${iconUrl}i`;
  await assert.rejects(assembleLiveEvidenceBundle(iconTooLong), assertFixedFailure);
});

test('every required nonclaim is exact and false', async t => {
  const fragments = await evidenceFixture();
  assert.deepEqual(Object.keys(fragments.manifest.nonClaims).sort(), [...NON_CLAIM_FIELDS].sort());
  for (const field of NON_CLAIM_FIELDS) {
    await t.test(field, async () => {
      fragments.manifest.nonClaims[field] = true;
      await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
      fragments.manifest.nonClaims[field] = false;
    });
  }
  fragments.manifest.nonClaims.unexpected = false;
  await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
});

test('semantic verification rejects cryptographic, payment, journal, HTTP, and confirmation tampering', async t => {
  const cases = [
    ['source repository', fragments => { fragments.manifest.source.repository = 'different'; }],
    ['source package', fragments => { fragments.manifest.source.packageVersion = '9.9.9'; }],
    ['trust mode', fragments => { fragments.manifest.trust.mode = 'authenticated'; }],
    ['trust profile', fragments => { fragments.manifest.trust.profileName = 'different'; }],
    ['trust provenance', fragments => { fragments.manifest.trust.provenance.path = 'different'; }],
    ['trust authentication claim', fragments => { fragments.manifest.trust.remoteChainAuthenticated = true; }],
    ['selected index', fragments => { fragments.manifest.payment.selectedIndex = 1; }],
    ['intent digest', fragments => { fragments.manifest.payment.intentDigest = 'b'.repeat(64); }],
    ['authorization key', fragments => { fragments.manifest.payment.authorizationKey = 'b'.repeat(64); }],
    ['block hash', fragments => { fragments.chain.chain.accountBlock.hash = 'b'.repeat(64); }],
    ['block nonce', fragments => { fragments.chain.chain.accountBlock.nonce = '1'.repeat(16); }],
    ['block data', fragments => {
      fragments.chain.chain.accountBlock.data = Buffer.alloc(32, 1).toString('base64');
    }],
    ['block public key', fragments => {
      fragments.chain.chain.accountBlock.publicKey = Buffer.alloc(32, 1).toString('base64');
    }],
    ['block signature', fragments => {
      const signature = fragments.chain.chain.accountBlock.signature;
      fragments.chain.chain.accountBlock.signature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    }],
    ['confirmation', fragments => { fragments.chain.chain.confirmation.momentumHeight += 1; }],
    ['journal transaction', fragments => { fragments.journal.journal.record.transactionHash = 'b'.repeat(64); }],
    ['journal evidence', fragments => { fragments.journal.journal.record.evidenceState = 'VALIDATED'; }],
    ['journal delivery', fragments => { fragments.journal.journal.record.deliveryState = 'NONE'; }],
    ['journal signed block', fragments => { fragments.journal.journal.record.signedAccountBlock.nonce = '1'.repeat(16); }],
    ['journal resource', fragments => { fragments.journal.journal.record.resourceIdentity.description = 'added'; }],
    ['journal cached body', fragments => {
      fragments.journal.journal.record.cachedResponse.body.message = 'different';
    }],
    ['HTTP transaction', fragments => { fragments.http.http.final.paymentResponse.transaction = 'b'.repeat(64); }],
    ['HTTP state', fragments => { fragments.http.http.final.paymentResponse.state = 'VALIDATED'; }],
    ['HTTP cache policy', fragments => { fragments.http.http.final.cacheControl = 'public'; }],
    ['HTTP body bytes', fragments => { fragments.http.http.final.bodyText += '\n'; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const fragments = await evidenceFixture();
      mutate(fragments);
      await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
    });
  }
});

test('HTTP and cached-response boundaries reject every isolated status, header, and body drift', async t => {
  const cases = [
    ['initial status', fragments => { fragments.http.http.initial.status = 409; }],
    ['initial missing field', fragments => { delete fragments.http.http.initial.observedAt; }],
    ['initial extra field', fragments => { fragments.http.http.initial.extra = false; }],
    ['final status', fragments => { fragments.http.http.final.status = 201; }],
    ['final missing field', fragments => { delete fragments.http.http.final.paymentResponse; }],
    ['final extra field', fragments => { fragments.http.http.final.extra = false; }],
    ['final content type', fragments => { fragments.http.http.final.contentType = 'application/json'; }],
    ['final vary', fragments => { fragments.http.http.final.vary = 'Accept'; }],
    ['body missing field', fragments => {
      delete fragments.journal.journal.record.cachedResponse.body.message;
    }],
    ['body extra field', fragments => {
      fragments.journal.journal.record.cachedResponse.body.extra = false;
    }],
    ['body exact message', fragments => {
      fragments.journal.journal.record.cachedResponse.body.message = 'changed';
      fragments.http.http.final.bodyText = JSON.stringify(
        fragments.journal.journal.record.cachedResponse.body,
        null,
        2,
      );
    }],
    ['cached status equality', fragments => {
      fragments.journal.journal.record.cachedResponse.status = 201;
    }],
    ['cached header equality', fragments => {
      fragments.journal.journal.record.cachedResponse.headers['content-type'] = 'application/json';
    }],
    ['cached body equality', fragments => {
      fragments.journal.journal.record.cachedResponse.body.generatedAt = utc(4_001);
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const fragments = await evidenceFixture();
      mutate(fragments);
      await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
    });
  }
});

test('timing uses role-local monotonic arithmetic and frozen UTC correlations', async t => {
  const valid = await assembleLiveEvidenceBundle(await evidenceFixture());
  assert.equal(valid.timing.events[2].monotonicMs < valid.timing.events[1].monotonicMs, true);
  const cases = [
    ['sequence', fragments => { fragments.timing.timing.events[3].sequence += 1; }],
    ['duplicate phase', fragments => {
      fragments.timing.timing.events[3].phase = fragments.timing.timing.events[2].phase;
    }],
    ['clock domain', fragments => { fragments.timing.timing.events[3].clockDomain = CLOCKS.runner; }],
    ['same-domain monotonic rollback', fragments => { fragments.timing.timing.events[4].monotonicMs = 50; }],
    ['duration', fragments => { fragments.timing.timing.durationsMs.prepareBlock += 1; }],
    ['global UTC order', fragments => { fragments.timing.timing.events[4].utc = utc(1_150); }],
    ['challenge equality', fragments => { fragments.http.http.initial.observedAt = utc(1_001); }],
    ['final equality', fragments => { fragments.http.http.final.observedAt = utc(5_099); }],
    ['inclusion equality', fragments => { fragments.chain.chain.confirmation.observedAt = utc(3_001); }],
    ['journal inclusion equality', fragments => {
      fragments.journal.journal.record.momentumEvidence.observedAt = utc(3_001);
    }],
    ['creation after publication', fragments => { fragments.journal.journal.record.createdAt = utc(2_300); }],
    ['generated body before delivery start', fragments => {
      fragments.journal.journal.record.cachedResponse.body.generatedAt = utc(3_100);
      fragments.http.http.final.bodyText = JSON.stringify(
        fragments.journal.journal.record.cachedResponse.body,
        null,
        2,
      );
    }],
    ['journal update after delivery finish', fragments => {
      fragments.journal.journal.record.updatedAt = utc(5_050);
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const fragments = await evidenceFixture();
      mutate(fragments);
      await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
    });
  }
});

test('coordinated confirmation tampering cannot reuse the acknowledged Momentum', async () => {
  const fragments = await evidenceFixture();
  const acknowledged = fragments.chain.chain.accountBlock.momentumAcknowledged;
  fragments.chain.chain.confirmation.momentumHeight = acknowledged.height;
  fragments.chain.chain.confirmation.momentumHash = acknowledged.hash;
  fragments.journal.journal.record.momentumEvidence.confirmationDetail.momentumHeight = acknowledged.height;
  fragments.journal.journal.record.momentumEvidence.confirmationDetail.momentumHash = acknowledged.hash;
  await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
});

test('same-UTC permutations cannot invert any cross-role protocol edge', async t => {
  const edges = [
    ['challenge to buyer', 1, 2],
    ['buyer to facilitator', 8, 9],
    ['facilitator owner to delivery', 17, 18],
    ['delivery to paid response', 19, 20],
  ];
  for (const [name, beforeIndex, afterIndex] of edges) {
    await t.test(name, async () => {
      const fragments = await evidenceFixture();
      const events = fragments.timing.timing.events;
      events[afterIndex].utc = events[beforeIndex].utc;
      const before = events[beforeIndex];
      const after = events[afterIndex];
      events[beforeIndex] = after;
      events[afterIndex] = before;
      events[beforeIndex].sequence = beforeIndex;
      events[afterIndex].sequence = afterIndex;
      await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
    });
  }
});

test('independent vectors pin section NUL domains, bundle domain, integrity removal, and newline exclusion', async () => {
  const bundle = await assembleLiveEvidenceBundle(await evidenceFixture());
  const sectionNames = [
    'source', 'trust', 'payment', 'chain', 'http', 'journal', 'timing', 'nonClaims',
  ];
  const expectedSectionDigests = {};
  for (const name of sectionNames) {
    expectedSectionDigests[name] = independentDigest(
      `zenon-x402-live-evidence-v1:section:${name}\0`,
      bundle[name],
    );
  }
  assert.deepEqual(bundle.integrity.sectionDigests, expectedSectionDigests);
  const bundleTarget = {
    evidenceVersion: 1,
    source: bundle.source,
    trust: bundle.trust,
    payment: bundle.payment,
    chain: bundle.chain,
    http: bundle.http,
    journal: bundle.journal,
    timing: bundle.timing,
    nonClaims: bundle.nonClaims,
    integrity: { algorithm: 'sha256', sectionDigests: expectedSectionDigests },
  };
  const expectedBundleDigest = independentDigest(
    'zenon-x402-live-evidence-v1:bundle\0',
    bundleTarget,
  );
  assert.equal(bundle.integrity.bundleDigest, expectedBundleDigest);
  assert.notEqual(
    bundle.integrity.sectionDigests.source,
    independentDigest('zenon-x402-live-evidence-v1:section:source', bundle.source),
  );
  assert.notEqual(
    bundle.integrity.sectionDigests.source,
    independentDigest('zenon-x402-live-evidence-v1:section:source\0', bundle.source, { newline: true }),
  );
  assert.notEqual(
    bundle.integrity.bundleDigest,
    independentDigest('zenon-x402-live-evidence-v1:bundle\0', {
      ...bundleTarget,
      integrity: { ...bundleTarget.integrity, bundleDigest: expectedBundleDigest },
    }),
  );
  const digests = Object.values(bundle.integrity.sectionDigests);
  assert.equal(new Set(digests).size, digests.length);

  const sectionTamper = structuredClone(bundle);
  sectionTamper.integrity.sectionDigests.source = 'b'.repeat(64);
  await assert.rejects(verifyLiveEvidenceBundle(sectionTamper), assertFixedFailure);

  const bundleTamper = structuredClone(bundle);
  bundleTamper.integrity.bundleDigest = 'b'.repeat(64);
  await assert.rejects(verifyLiveEvidenceBundle(bundleTamper), assertFixedFailure);

  const contentTamper = structuredClone(bundle);
  contentTamper.source.nodeMajor += 1;
  await assert.rejects(verifyLiveEvidenceBundle(contentTamper), assertFixedFailure);
});

test('serialize performs full semantic and integrity revalidation for detached caller bundles', async () => {
  const valid = structuredClone(await assembleLiveEvidenceBundle(await evidenceFixture()));
  assert.equal((await serializeLiveEvidenceBundle(valid)).endsWith('\n'), true);

  const tampered = structuredClone(valid);
  tampered.http.final.vary = 'Accept';
  await assert.rejects(serializeLiveEvidenceBundle(tampered), assertFixedFailure);

  const incomplete = structuredClone(valid);
  delete incomplete.integrity;
  await assert.rejects(serializeLiveEvidenceBundle(incomplete), assertFixedFailure);

  const customPrototype = structuredClone(valid);
  Object.setPrototypeOf(customPrototype, { branded: false });
  await assert.rejects(serializeLiveEvidenceBundle(customPrototype), assertFixedFailure);
});

test('strict parsing rejects decoded duplicate keys, missing and extra fields, templates, and null finals', async () => {
  const bundle = await assembleLiveEvidenceBundle(await evidenceFixture());
  const serialized = await serializeLiveEvidenceBundle(bundle);
  const duplicateTop = serialized.replace(
    '"evidenceVersion":1',
    '"evidenceVersion":1,"\\u0065videnceVersion":1',
  );
  assert.throws(() => parseLiveEvidenceBundle(duplicateTop), assertFixedFailure);
  const duplicateNested = serialized.replace('"source":{', '"source":{},"\\u0073ource":{');
  assert.throws(() => parseLiveEvidenceBundle(duplicateNested), assertFixedFailure);

  const extra = JSON.parse(serialized);
  extra.unexpected = false;
  assert.throws(() => parseLiveEvidenceBundle(JSON.stringify(extra)), assertFixedFailure);
  delete extra.unexpected;
  delete extra.integrity;
  assert.throws(() => parseLiveEvidenceBundle(JSON.stringify(extra)), assertFixedFailure);
  assert.throws(() => parseLiveEvidenceBundle(JSON.stringify(createLiveEvidenceTemplate())), assertFixedFailure);
  extra.integrity = null;
  assert.throws(() => parseLiveEvidenceBundle(JSON.stringify(extra)), assertFixedFailure);
});

test('every typed fragment and final envelope rejects wrong, missing, and extra envelope fields', async t => {
  const fragments = await evidenceFixture();
  const names = ['manifest', 'chain', 'http', 'journal', 'timing'];
  for (const name of names) {
    await t.test(name, () => {
      assert.deepEqual(
        parseLiveEvidenceFragment(JSON.stringify(fragments[name]), name),
        fragments[name],
      );
      const wrongVersion = structuredClone(fragments[name]);
      wrongVersion.fragmentVersion = 2;
      assert.throws(
        () => parseLiveEvidenceFragment(JSON.stringify(wrongVersion), name),
        assertFixedFailure,
      );
      const wrongType = structuredClone(fragments[name]);
      wrongType.fragmentType = names[(names.indexOf(name) + 1) % names.length];
      assert.throws(
        () => parseLiveEvidenceFragment(JSON.stringify(wrongType), name),
        assertFixedFailure,
      );
      const missingVersion = structuredClone(fragments[name]);
      delete missingVersion.fragmentVersion;
      assert.throws(
        () => parseLiveEvidenceFragment(JSON.stringify(missingVersion), name),
        assertFixedFailure,
      );
      const missingContent = structuredClone(fragments[name]);
      delete missingContent[name === 'manifest' ? 'source' : name];
      assert.throws(
        () => parseLiveEvidenceFragment(JSON.stringify(missingContent), name),
        assertFixedFailure,
      );
      const extra = structuredClone(fragments[name]);
      extra.unexpected = false;
      assert.throws(
        () => parseLiveEvidenceFragment(JSON.stringify(extra), name),
        assertFixedFailure,
      );
    });
  }

  const bundle = structuredClone(await assembleLiveEvidenceBundle(fragments));
  const topLevel = [
    'evidenceVersion', 'source', 'trust', 'payment', 'chain', 'http',
    'journal', 'timing', 'nonClaims', 'integrity',
  ];
  for (const field of topLevel) {
    const missing = structuredClone(bundle);
    delete missing[field];
    assert.throws(() => parseLiveEvidenceBundle(JSON.stringify(missing)), assertFixedFailure);
  }
  const wrongVersion = structuredClone(bundle);
  wrongVersion.evidenceVersion = 2;
  assert.throws(() => parseLiveEvidenceBundle(JSON.stringify(wrongVersion)), assertFixedFailure);
  const wrongType = structuredClone(bundle);
  wrongType.fragmentType = 'manifest';
  assert.throws(() => parseLiveEvidenceBundle(JSON.stringify(wrongType)), assertFixedFailure);
  const extra = structuredClone(bundle);
  extra.unexpected = false;
  assert.throws(() => parseLiveEvidenceBundle(JSON.stringify(extra)), assertFixedFailure);
});

test('each fragment raw-size limit accepts the exact boundary and rejects one byte more', async () => {
  const fragments = await evidenceFixture();
  const limits = {
    manifest: 64 * 1024,
    chain: 64 * 1024,
    http: 128 * 1024,
    journal: 192 * 1024,
    timing: 64 * 1024,
  };
  for (const [name, maximumBytes] of Object.entries(limits)) {
    const encoded = JSON.stringify(fragments[name]);
    const padding = maximumBytes - Buffer.byteLength(encoded, 'utf8');
    assert.ok(padding >= 0);
    const exact = `${encoded}${' '.repeat(padding)}`;
    assert.equal(Buffer.byteLength(exact, 'utf8'), maximumBytes);
    assert.deepEqual(parseLiveEvidenceFragment(exact, name), fragments[name]);
    assert.throws(() => parseLiveEvidenceFragment(`${exact} `, name), assertFixedFailure);
  }
});

test('strict parser accepts the exact raw limit and rejects limit plus one', async () => {
  const bundle = await assembleLiveEvidenceBundle(await evidenceFixture());
  const serialized = await serializeLiveEvidenceBundle(bundle);
  const maximum = 512 * 1024;
  const padding = maximum - Buffer.byteLength(serialized, 'utf8');
  assert.ok(padding > 0);
  const exact = `${' '.repeat(padding)}${serialized}`;
  assert.equal(Buffer.byteLength(exact, 'utf8'), maximum);
  assert.deepEqual(parseLiveEvidenceBundle(exact), bundle);
  assert.throws(() => parseLiveEvidenceBundle(`${exact} `), assertFixedFailure);
});

test('parser rejects unsafe numbers, negative zero, unpaired surrogates, excessive depth, nodes, and members', () => {
  const invalid = [
    '{"evidenceVersion":-0}',
    '{"evidenceVersion":1.5}',
    '{"evidenceVersion":9007199254740992}',
    JSON.stringify({ value: '\ud800' }),
    `${'['.repeat(22)}null${']'.repeat(22)}`,
    JSON.stringify(Array.from({ length: 8193 }, () => null)),
    JSON.stringify(Object.fromEntries(Array.from({ length: 4097 }, (_, index) => [`k${index}`, null]))),
  ];
  for (const text of invalid) assert.throws(() => parseLiveEvidenceBundle(text), assertFixedFailure);
});

test('programmatic APIs reject proxies, accessors, custom prototypes, cycles, hooks, sparse arrays, and negative zero', async t => {
  await t.test('nested accessor', async () => {
    const fragments = await evidenceFixture();
    let reads = 0;
    Object.defineProperty(fragments.manifest.source, 'repository', {
      enumerable: true,
      get() {
        reads += 1;
        return 'edgepillar/zenon-x402-poc';
      },
    });
    await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
    assert.equal(reads, 0);
  });

  await t.test('proxy', async () => {
    const fragments = await evidenceFixture();
    let traps = 0;
    fragments.chain.chain = new Proxy(fragments.chain.chain, {
      getPrototypeOf() {
        traps += 1;
        throw new Error('unreachable');
      },
      ownKeys() {
        traps += 1;
        throw new Error('unreachable');
      },
    });
    await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
    assert.equal(traps, 0);
  });

  await t.test('custom prototype', async () => {
    const fragments = await evidenceFixture();
    Object.setPrototypeOf(fragments.http.http, { inherited: true });
    await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
  });

  await t.test('cycle', async () => {
    const fragments = await evidenceFixture();
    fragments.manifest.source.cycle = fragments.manifest.source;
    await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
  });

  await t.test('toJSON and then accessors', async () => {
    const fragments = await evidenceFixture();
    let reads = 0;
    for (const field of ['toJSON', 'then']) {
      Object.defineProperty(fragments.manifest.payment, field, {
        enumerable: true,
        get() {
          reads += 1;
          return undefined;
        },
      });
    }
    await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
    assert.equal(reads, 0);
  });

  await t.test('sparse array', async () => {
    const fragments = await evidenceFixture({ resource: { tags: ['one', 'two'] } });
    delete fragments.manifest.payment.paymentRequired.resource.tags[0];
    await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
  });

  await t.test('negative zero', async () => {
    const fragments = await evidenceFixture();
    fragments.manifest.source.nodeMajor = -0;
    await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
  });
});

test('assembler snapshots the complete caller graph before its asynchronous verification boundary', async () => {
  const fragments = await evidenceFixture();
  const originalRepository = fragments.manifest.source.repository;
  const pending = assembleLiveEvidenceBundle(fragments);
  fragments.manifest.source.repository = 'changed-after-call';
  fragments.chain.chain.accountBlock.nonce = '1'.repeat(16);
  const bundle = await pending;
  assert.equal(bundle.source.repository, originalRepository);
  assert.equal(bundle.chain.accountBlock.nonce, '0'.repeat(16));
});

function fragmentTextMap(fragments) {
  return new Map([
    ['manifest.input', JSON.stringify(fragments.manifest)],
    ['chain.input', JSON.stringify(fragments.chain)],
    ['http.input', JSON.stringify(fragments.http)],
    ['journal.input', JSON.stringify(fragments.journal)],
    ['timing.input', JSON.stringify(fragments.timing)],
  ]);
}

function assembleArgv(output = 'bundle.output') {
  return [
    'assemble',
    '--manifest', 'manifest.input',
    '--chain', 'chain.input',
    '--http', 'http.input',
    '--journal', 'journal.input',
    '--timing', 'timing.input',
    '--out', output,
  ];
}

test('CLI assembles and verifies with one bounded read per input and fixed output only', async () => {
  const fragments = await evidenceFixture();
  const inputs = fragmentTextMap(fragments);
  const reads = new Map();
  const writes = [];
  const stdout = [];
  const stderr = [];
  const success = await runLiveEvidenceCli({
    argv: assembleArgv(),
    async readFile(filename, maximumBytes) {
      reads.set(filename, (reads.get(filename) ?? 0) + 1);
      const text = inputs.get(filename);
      assert.equal(typeof text, 'string');
      assert.ok(Buffer.byteLength(text, 'utf8') <= maximumBytes);
      return text;
    },
    async writeExclusiveFile(filename, text) {
      writes.push([filename, text]);
    },
    stdout: line => stdout.push(line),
    stderr: line => stderr.push(line),
  });
  assert.equal(success, true);
  assert.deepEqual(stdout, ['LIVE_EVIDENCE_BUNDLE_ASSEMBLED\n']);
  assert.deepEqual(stderr, []);
  assert.equal(writes.length, 1);
  for (const name of inputs.keys()) assert.equal(reads.get(name), 1);

  const parsed = parseLiveEvidenceBundle(writes[0][1]);
  assert.deepEqual(await verifyLiveEvidenceBundle(parsed), { valid: true, evidenceVersion: 1 });
  const verifyStdout = [];
  const verifyStderr = [];
  let verifyReads = 0;
  assert.equal(await runLiveEvidenceCli({
    argv: ['verify', '--bundle', 'bundle.input'],
    async readFile() {
      verifyReads += 1;
      return writes[0][1];
    },
    async writeExclusiveFile() {
      assert.fail('verify must not write');
    },
    stdout: line => verifyStdout.push(line),
    stderr: line => verifyStderr.push(line),
  }), true);
  assert.equal(verifyReads, 1);
  assert.deepEqual(verifyStdout, ['LIVE_EVIDENCE_VALID\n']);
  assert.deepEqual(verifyStderr, []);
});

test('CLI template is deterministic and all failures use one fixed line', async t => {
  const writes = [];
  const stdout = [];
  const stderr = [];
  assert.equal(await runLiveEvidenceCli({
    argv: ['template', '--out', 'template.output'],
    async readFile() {
      assert.fail('template must not read');
    },
    async writeExclusiveFile(filename, text) {
      writes.push([filename, text]);
    },
    stdout: line => stdout.push(line),
    stderr: line => stderr.push(line),
  }), true);
  assert.deepEqual(stdout, ['LIVE_EVIDENCE_TEMPLATE_CREATED\n']);
  assert.deepEqual(stderr, []);
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0][1]), createLiveEvidenceTemplate());

  const invalid = [
    [],
    ['unknown', '--out', 'value'],
    ['template'],
    ['template', '--out', 'one', '--out', 'two'],
    ['template', '--unknown', 'value'],
    ['verify', '--bundle=value'],
  ];
  for (const argv of invalid) {
    await t.test(argv[0] ?? 'missing command', async () => {
      const failureStdout = [];
      const failureStderr = [];
      let reads = 0;
      let failureWrites = 0;
      assert.equal(await runLiveEvidenceCli({
        argv,
        async readFile() {
          reads += 1;
          return '';
        },
        async writeExclusiveFile() {
          failureWrites += 1;
        },
        stdout: line => failureStdout.push(line),
        stderr: line => failureStderr.push(line),
      }), false);
      assert.deepEqual(failureStdout, []);
      assert.deepEqual(failureStderr, ['LIVE_EVIDENCE_FAILED\n']);
      assert.equal(reads, 0);
      assert.equal(failureWrites, 0);
    });
  }
});

test('CLI rejects input/output aliases, swapped fragments, oversize reads, and write failure', async () => {
  const fragments = await evidenceFixture();
  const inputs = fragmentTextMap(fragments);
  const scenarios = [
    {
      argv: assembleArgv('manifest.input'),
      readFile: async filename => inputs.get(filename),
    },
    {
      argv: assembleArgv(),
      readFile: async filename => filename === 'chain.input'
        ? inputs.get('timing.input')
        : inputs.get(filename),
    },
    {
      argv: assembleArgv(),
      readFile: async (filename, maximumBytes) => filename === 'manifest.input'
        ? ' '.repeat(maximumBytes + 1)
        : inputs.get(filename),
    },
  ];
  for (const scenario of scenarios) {
    const stdout = [];
    const stderr = [];
    let writes = 0;
    assert.equal(await runLiveEvidenceCli({
      argv: scenario.argv,
      readFile: scenario.readFile,
      async writeExclusiveFile() {
        writes += 1;
      },
      stdout: line => stdout.push(line),
      stderr: line => stderr.push(line),
    }), false);
    assert.deepEqual(stdout, []);
    assert.deepEqual(stderr, ['LIVE_EVIDENCE_FAILED\n']);
    assert.equal(writes, 0);
  }

  const stdout = [];
  const stderr = [];
  assert.equal(await runLiveEvidenceCli({
    argv: assembleArgv(),
    readFile: async filename => inputs.get(filename),
    async writeExclusiveFile() {
      throw new Error('suppressed');
    },
    stdout: line => stdout.push(line),
    stderr: line => stderr.push(line),
  }), false);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, ['LIVE_EVIDENCE_FAILED\n']);
});

test('default CLI file capabilities reject symlinks and collisions and create restrictive complete output', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'live-evidence-offline-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const templatePath = join(directory, 'template.json');
  const stdout = [];
  const stderr = [];
  assert.equal(await runLiveEvidenceCli({
    argv: ['template', '--out', templatePath],
    stdout: line => stdout.push(line),
    stderr: line => stderr.push(line),
  }), true);
  const entry = await lstat(templatePath);
  assert.equal(entry.isFile(), true);
  assert.equal(entry.mode & 0o077, 0);
  assert.deepEqual(stdout, ['LIVE_EVIDENCE_TEMPLATE_CREATED\n']);
  assert.deepEqual(stderr, []);
  const original = await readFile(templatePath, 'utf8');
  assert.deepEqual(JSON.parse(original), createLiveEvidenceTemplate());

  const collisionStdout = [];
  const collisionStderr = [];
  assert.equal(await runLiveEvidenceCli({
    argv: ['template', '--out', templatePath],
    stdout: line => collisionStdout.push(line),
    stderr: line => collisionStderr.push(line),
  }), false);
  assert.deepEqual(collisionStdout, []);
  assert.deepEqual(collisionStderr, ['LIVE_EVIDENCE_FAILED\n']);
  assert.equal(await readFile(templatePath, 'utf8'), original);

  const physicalParent = join(directory, 'physical-parent');
  await mkdir(physicalParent);
  const physicalOutput = join(physicalParent, 'physical-template.json');
  assert.equal(await runLiveEvidenceCli({
    argv: ['template', '--out', physicalOutput],
    stdout() {},
    stderr() {},
  }), true);
  const physicalEntry = await lstat(physicalOutput);
  assert.equal(physicalEntry.isFile(), true);
  assert.equal(physicalEntry.mode & 0o077, 0);

  const parentLink = join(directory, 'parent-link');
  await symlink(physicalParent, parentLink);
  const linkedParentOutput = join(parentLink, 'must-not-exist.json');
  assert.equal(await runLiveEvidenceCli({
    argv: ['template', '--out', linkedParentOutput],
    stdout() {},
    stderr() {},
  }), false);
  await assert.rejects(lstat(linkedParentOutput), error => error?.code === 'ENOENT');

  const outputTarget = join(directory, 'output-target.json');
  const outputLink = join(directory, 'output-link.json');
  await writeFile(outputTarget, 'preserved', { mode: 0o600 });
  await symlink(outputTarget, outputLink);
  assert.equal(await runLiveEvidenceCli({
    argv: ['template', '--out', outputLink],
    stdout() {},
    stderr() {},
  }), false);
  assert.equal(await readFile(outputTarget, 'utf8'), 'preserved');

  const temporaryResidue = [];
  for (const name of await readdir(directory)) {
    if (name.startsWith('.live-evidence-')) temporaryResidue.push(name);
  }
  for (const name of await readdir(physicalParent)) {
    if (name.startsWith('.live-evidence-')) temporaryResidue.push(name);
  }
  assert.deepEqual(temporaryResidue, []);

  const bundlePath = join(directory, 'bundle.json');
  const symlinkPath = join(directory, 'bundle-link.json');
  await writeFile(bundlePath, '{}', { mode: 0o600 });
  await symlink(bundlePath, symlinkPath);
  const linkStdout = [];
  const linkStderr = [];
  assert.equal(await runLiveEvidenceCli({
    argv: ['verify', '--bundle', symlinkPath],
    stdout: line => linkStdout.push(line),
    stderr: line => linkStderr.push(line),
  }), false);
  assert.deepEqual(linkStdout, []);
  assert.deepEqual(linkStderr, ['LIVE_EVIDENCE_FAILED\n']);
});

test('raw payment, recovery, and secret-bearing fields are structurally forbidden', async t => {
  for (const field of ['rawPayment', 'paymentSignature', 'recoveryHandle', 'mnemonic', 'privateKey']) {
    await t.test(field, async () => {
      const fragments = await evidenceFixture();
      fragments.manifest.payment[field] = 'forbidden';
      await assert.rejects(assembleLiveEvidenceBundle(fragments), assertFixedFailure);
    });
  }
});
