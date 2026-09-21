import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';
import { canonicalJson, paymentIntentDigest } from './canonical.js';
import {
  deriveZenonFundingObserverTarget,
  prepareZenonFundingResource,
} from './service-credit-zenon-funding-evidence.js';
import {
  deriveZenonFundingIntakeSelectionKey,
  snapshotZenonFundingIntakeJson,
  ZenonFundingIntakeSqliteStore,
  ZenonFundingIntakeSqliteStoreError,
} from './service-credit-zenon-funding-intake-sqlite-store.js';
import {
  createZenonFundingObserverSqliteStore,
  deriveZenonFundingObserverSqliteRecordKey,
  openZenonFundingObserverSqliteStore,
  ZenonFundingObserverSqliteStoreError,
} from './service-credit-zenon-funding-observer-sqlite-store.js';
import { createZenonFundingObserverState } from './service-credit-zenon-funding-observer-state.js';
import { parseZenonFundingProviderAttestationAuthorityRecord } from './service-credit-zenon-funding-provider-attestation.js';
import { ServiceCreditSqliteStore } from './service-credit-sqlite-store.js';
import { preflightZenonPayment } from './zenon-payment.js';
import { MAX_X402_HEADER_ENCODED_BYTES } from './x402-wire.js';

const HASH = /^[0-9a-f]{64}$/;
const FUNDING_TAG = 'x402-service-credit-funding-v1';
const BODY = 'Payment Required';
const CREATE_OBJECT = Object.create;
const DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const REFLECT_APPLY = Reflect.apply;

function immutableEnumerableDataDescriptor(value) {
  const descriptor = REFLECT_APPLY(CREATE_OBJECT, undefined, [null]);
  descriptor.value = value;
  descriptor.enumerable = true;
  descriptor.writable = false;
  descriptor.configurable = false;
  return descriptor;
}

function boundResult(transactionHash, observerRecordKey, observerFileName) {
  const result = REFLECT_APPLY(CREATE_OBJECT, undefined, [null]);
  const entries = [
    ['status', 'BOUND'],
    ['transactionHash', transactionHash],
    ['observerRecordKey', observerRecordKey],
    ['observerFileName', observerFileName],
  ];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    REFLECT_APPLY(DEFINE_PROPERTY, undefined, [
      result,
      entry[0],
      immutableEnumerableDataDescriptor(entry[1]),
    ]);
  }
  return REFLECT_APPLY(OBJECT_FREEZE, undefined, [result]);
}

export class ZenonFundingIntakeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonFundingIntakeError';
    this.code = code;
    this.stack = `ZenonFundingIntakeError: ${code}`;
  }
}

function fail(code) {
  throw new ZenonFundingIntakeError(code);
}

function dataObject(value, keys) {
  try {
    if (
      value === null
      || typeof value !== 'object'
      || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) fail('ZENON_FUNDING_INTAKE_INVALID_INPUT');
    const found = Reflect.ownKeys(value);
    if (found.length !== keys.length || found.some(key => !keys.includes(key))) {
      fail('ZENON_FUNDING_INTAKE_INVALID_INPUT');
    }
    const copy = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail('ZENON_FUNDING_INTAKE_INVALID_INPUT');
      }
      copy[key] = descriptor.value;
    }
    return copy;
  } catch {
    fail('ZENON_FUNDING_INTAKE_INVALID_INPUT');
  }
}

function selection(input) {
  const value = dataObject(input, ['offerId', 'offerVersion', 'holderId', 'capabilityCommitment']);
  if (
    typeof value.offerId !== 'string'
    || !Number.isSafeInteger(value.offerVersion)
    || value.offerVersion <= 0
    || typeof value.holderId !== 'string'
    || typeof value.capabilityCommitment !== 'string'
  ) fail('ZENON_FUNDING_INTAKE_INVALID_INPUT');
  return Object.freeze({ ...value });
}

function time(now) {
  try {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) fail('ZENON_FUNDING_INTAKE_CLOCK_UNAVAILABLE');
    return value;
  } catch {
    fail('ZENON_FUNDING_INTAKE_CLOCK_UNAVAILABLE');
  }
}

function digest(domain, value) {
  return `sha256:${createHash('sha256').update(domain).update('\0').update(canonicalJson(value)).digest('hex')}`;
}

function freezeJson(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalHeader(paymentRequired) {
  const encoded = Buffer.from(canonicalJson(paymentRequired), 'utf8').toString('base64');
  if (encoded.length > MAX_X402_HEADER_ENCODED_BYTES) fail('ZENON_FUNDING_INTAKE_REJECTED');
  return encoded;
}

function fundingHint(paymentPayload) {
  try {
    const payload = dataObject(paymentPayload, ['x402Version', 'resource', 'accepted', 'payload']);
    const resource = dataObject(payload.resource, ['url', 'tags']);
    const tags = resource.tags;
    if (
      !Array.isArray(tags)
      || utilTypes.isProxy(tags)
      || Object.getPrototypeOf(tags) !== Array.prototype
      || tags.length !== 3
    ) fail('ZENON_FUNDING_INTAKE_REJECTED');
    const keys = Reflect.ownKeys(tags);
    if (keys.length !== 4 || keys[0] !== '0' || keys[1] !== '1'
      || keys[2] !== '2' || keys[3] !== 'length') {
      fail('ZENON_FUNDING_INTAKE_REJECTED');
    }
    const pieces = [0, 1, 2].map(index => {
      const descriptor = Object.getOwnPropertyDescriptor(tags, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail('ZENON_FUNDING_INTAKE_REJECTED');
      }
      return descriptor.value;
    });
    if (
      pieces[0] !== FUNDING_TAG
      || typeof pieces[1] !== 'string'
      || typeof pieces[2] !== 'string'
      || !HASH.test(`${pieces[1]}${pieces[2]}`)
      || pieces[1].length !== 32
      || pieces[2].length !== 32
    ) fail('ZENON_FUNDING_INTAKE_REJECTED');
    return `sha256:${pieces[1]}${pieces[2]}`;
  } catch {
    fail('ZENON_FUNDING_INTAKE_REJECTED');
  }
}

function observerErrorCode(error) {
  return error instanceof ZenonFundingObserverSqliteStoreError ? error.code : null;
}

function rootIdentity(path) {
  try {
    const stat = lstatSync(path, { bigint: true });
    if (
      typeof process.getuid !== 'function'
      || !stat.isDirectory()
      || stat.isSymbolicLink()
      || stat.uid !== BigInt(process.getuid())
      || (stat.mode & 0o777n) !== 0o700n
      || (stat.mode & 0o7000n) !== 0n
      || realpathSync(path) !== path
    ) fail('ZENON_FUNDING_INTAKE_UNSAFE_OBSERVER_ROOT');
    return Object.freeze({
      dev: stat.dev.toString(),
      ino: stat.ino.toString(),
      uid: stat.uid.toString(),
      mode: stat.mode.toString(),
    });
  } catch {
    fail('ZENON_FUNDING_INTAKE_UNSAFE_OBSERVER_ROOT');
  }
}

/**
 * Default-off, offline owner for one durable 402 issuance per exact selection.
 * BOUND means a locally verified signed block, not publication or settlement.
 * The caller owns HTTPS ingress, both store lifetimes, and all live-operation gates.
 */
export function createZenonFundingIntake(options) {
  const value = dataObject(options, [
    'store', 'serviceCreditStore', 'authorityRecord', 'deriveFundingTerms',
    'now', 'observerRoot', 'observerCatchUp',
  ]);
  if (
    utilTypes.isProxy(value.store)
    || !(value.store instanceof ZenonFundingIntakeSqliteStore)
    || Object.getPrototypeOf(value.store) !== ZenonFundingIntakeSqliteStore.prototype
    || ['loadBySelectionKey', 'loadByFundingCommitment', 'loadBound', 'issue', 'bind'].some(
      name => Object.hasOwn(value.store, name),
    )
    || utilTypes.isProxy(value.serviceCreditStore)
    || !(value.serviceCreditStore instanceof ServiceCreditSqliteStore)
    || Object.getPrototypeOf(value.serviceCreditStore) !== ServiceCreditSqliteStore.prototype
    || Object.hasOwn(value.serviceCreditStore, 'getOffer')
    || typeof value.authorityRecord !== 'string'
    || typeof value.deriveFundingTerms !== 'function'
    || utilTypes.isProxy(value.deriveFundingTerms)
    || typeof value.now !== 'function'
    || utilTypes.isProxy(value.now)
    || typeof value.observerRoot !== 'string'
    || !isAbsolute(value.observerRoot)
    || resolve(value.observerRoot) !== value.observerRoot
  ) fail('ZENON_FUNDING_INTAKE_INVALID_CONFIGURATION');
  const catchUp = dataObject(value.observerCatchUp, [
    'maximumPageEntries', 'maximumBackfillSpan', 'maximumMembersPerMomentum',
  ]);
  if (Object.values(catchUp).some(number => !Number.isSafeInteger(number) || number <= 0)) {
    fail('ZENON_FUNDING_INTAKE_INVALID_CONFIGURATION');
  }
  let authority;
  try {
    authority = parseZenonFundingProviderAttestationAuthorityRecord(value.authorityRecord);
  } catch {
    fail('ZENON_FUNDING_INTAKE_INVALID_CONFIGURATION');
  }
  const store = value.store;
  const serviceCreditStore = value.serviceCreditStore;
  const getOffer = ServiceCreditSqliteStore.prototype.getOffer;
  const now = value.now;
  const authorityRecord = authority.canonicalText;
  const observerRoot = value.observerRoot;
  const fixedRootIdentity = rootIdentity(observerRoot);
  let closed = false;
  let latched = false;

  function usable() {
    if (closed) fail('ZENON_FUNDING_INTAKE_CLOSED');
    if (latched) fail('ZENON_FUNDING_INTAKE_QUARANTINED');
  }

  function assertIssueAuthority(issue) {
    if (
      issue.authorityRecord !== authorityRecord
      || issue.authorityRecordDigest !== authority.authorityRecordDigest
      || issue.ledgerDomain !== store.ledgerDomain
      || issue.observerRoot !== observerRoot
      || canonicalJson(issue.observerRootIdentity) !== canonicalJson(fixedRootIdentity)
      || canonicalJson(rootIdentity(observerRoot)) !== canonicalJson(fixedRootIdentity)
    ) fail('ZENON_FUNDING_INTAKE_AUTHORITY_MISMATCH');
  }

  function frameFor(row, resourceUrl) {
    const issue = row.issue;
    assertIssueAuthority(issue);
    if (issue.resourceUrl !== resourceUrl) fail('ZENON_FUNDING_INTAKE_CONFLICT');
    if (row.status !== 'ISSUED') fail('ZENON_FUNDING_INTAKE_ALREADY_BOUND');
    if (time(now) >= issue.challenge.activationIntent.expiresAt) {
      fail('ZENON_FUNDING_INTAKE_EXPIRED');
    }
    return Object.freeze({ ...issue.frame });
  }

  function issue(input) {
    usable();
    const request = dataObject(input, ['selection', 'resourceUrl']);
    const chosen = selection(request.selection);
    if (typeof request.resourceUrl !== 'string') fail('ZENON_FUNDING_INTAKE_INVALID_INPUT');
    let selectionKey;
    try {
      selectionKey = deriveZenonFundingIntakeSelectionKey({
        ledgerDomain: store.ledgerDomain,
        selection: chosen,
      });
      const existing = store.loadBySelectionKey(selectionKey);
      if (existing) return frameFor(existing, request.resourceUrl);
      const offer = Reflect.apply(getOffer, serviceCreditStore, [{
        offerId: chosen.offerId,
        offerVersion: chosen.offerVersion,
      }]);
      if (offer === null) fail('ZENON_FUNDING_INTAKE_REJECTED');
      let issuedAt;
      const prepared = prepareZenonFundingResource({
        offer,
        selection: chosen,
        resourceUrl: request.resourceUrl,
        deriveFundingTerms: value.deriveFundingTerms,
        authorityProfile: authority.authorityProfile,
        now: () => {
          issuedAt = time(now);
          return issuedAt;
        },
      });
      const newIssue = {
        version: 1,
        ledgerDomain: store.ledgerDomain,
        selectionKey,
        selection: chosen,
        resourceUrl: request.resourceUrl,
        offer: prepared.offer,
        challenge: prepared.challenge,
        authorityRecord,
        authorityRecordDigest: authority.authorityRecordDigest,
        observerCatchUp: { ...catchUp },
        observerRoot,
        observerRootIdentity: fixedRootIdentity,
        issuedAt,
        frame: {
          status: 402,
          paymentRequiredHeader: canonicalHeader(prepared.challenge.paymentRequired),
          body: BODY,
        },
      };
      const committed = store.issue(newIssue);
      return frameFor(committed, request.resourceUrl);
    } catch (error) {
      if (error instanceof ZenonFundingIntakeError) throw error;
      if (error instanceof ZenonFundingIntakeSqliteStoreError
        && error.code === 'ZENON_FUNDING_INTAKE_STORE_OUTCOME_UNKNOWN') {
        latched = true;
        fail('ZENON_FUNDING_INTAKE_OUTCOME_UNKNOWN');
      }
      fail('ZENON_FUNDING_INTAKE_REJECTED');
    }
  }

  function ensureObserver(row) {
    const { issue: issued, binding } = row;
    assertIssueAuthority(issued);
    if (!binding || row.status !== 'BOUND') fail('ZENON_FUNDING_INTAKE_REJECTED');
    const databasePath = join(observerRoot, binding.observerFileName);
    let observer;
    try {
      try {
        observer = openZenonFundingObserverSqliteStore({
          databasePath,
          allowedRoot: observerRoot,
          expectedRecordKey: binding.observerRecordKey,
          authorityRecord: issued.authorityRecord,
        });
      } catch (error) {
        if (observerErrorCode(error) !== 'ZENON_FUNDING_OBSERVER_STORE_MISSING') throw error;
        try {
          observer = createZenonFundingObserverSqliteStore({
            databasePath,
            allowedRoot: observerRoot,
            initialState: binding.observerInitialState,
            authorityRecord: issued.authorityRecord,
          });
        } catch (createdError) {
          if (observerErrorCode(createdError) !== 'ZENON_FUNDING_OBSERVER_STORE_ALREADY_EXISTS') {
            throw createdError;
          }
          observer = openZenonFundingObserverSqliteStore({
            databasePath,
            allowedRoot: observerRoot,
            expectedRecordKey: binding.observerRecordKey,
            authorityRecord: issued.authorityRecord,
          });
        }
      }
      const loaded = observer.load();
      if (
        loaded.recordKey !== binding.observerRecordKey
        || canonicalJson(loaded.state.target) !== canonicalJson(binding.observerTarget)
        || canonicalJson(loaded.state.chainProfile) !== canonicalJson(binding.observerInitialState.chainProfile)
        || canonicalJson(loaded.state.confirmationPolicy) !== canonicalJson(binding.observerInitialState.confirmationPolicy)
      ) fail('ZENON_FUNDING_INTAKE_OBSERVER_UNCERTAIN');
    } catch {
      latched = true;
      fail('ZENON_FUNDING_INTAKE_OBSERVER_UNCERTAIN');
    } finally {
      if (observer) {
        try { observer.close(); } catch { latched = true; }
      }
    }
    if (latched) fail('ZENON_FUNDING_INTAKE_OBSERVER_UNCERTAIN');
    return boundResult(
      binding.transactionHash,
      binding.observerRecordKey,
      binding.observerFileName,
    );
  }

  async function bind(paymentPayload) {
    usable();
    let captured;
    try { captured = freezeJson(snapshotZenonFundingIntakeJson(paymentPayload)); }
    catch { fail('ZENON_FUNDING_INTAKE_REJECTED'); }
    const hint = fundingHint(captured);
    let row;
    try {
      row = store.loadByFundingCommitment(hint);
      if (row === null) fail('ZENON_FUNDING_INTAKE_REJECTED');
      assertIssueAuthority(row.issue);
      if (row.status === 'ISSUED' && time(now) >= row.issue.challenge.activationIntent.expiresAt) {
        fail('ZENON_FUNDING_INTAKE_EXPIRED');
      }
    } catch (error) {
      if (error instanceof ZenonFundingIntakeError) throw error;
      fail('ZENON_FUNDING_INTAKE_REJECTED');
    }
    const issued = row.issue;
    let checked;
    try {
      checked = await preflightZenonPayment(
        captured,
        issued.challenge.paymentRequired.accepts[0],
        issued.challenge.paymentRequired,
      );
      if (
        checked.payer !== issued.selection.holderId
        || checked.intentDigest !== paymentIntentDigest(
          issued.challenge.paymentRequired,
          issued.challenge.paymentRequired.accepts[0],
        )
        || canonicalJson(checked.chainProfile) !== canonicalJson(authority.chainProfile)
      ) fail('ZENON_FUNDING_INTAKE_REJECTED');
    } catch {
      fail('ZENON_FUNDING_INTAKE_REJECTED');
    }
    if (row.status === 'ISSUED' && time(now) >= issued.challenge.activationIntent.expiresAt) {
      fail('ZENON_FUNDING_INTAKE_EXPIRED');
    }
    let binding;
    try {
      const target = deriveZenonFundingObserverTarget({
        offer: issued.offer,
        challenge: issued.challenge,
        authorityProfile: authority.authorityProfile,
        transactionHash: checked.transactionHash,
        payer: checked.payer,
        resourceUrl: issued.resourceUrl,
      });
      const initialState = createZenonFundingObserverState({
        observerPolicy: authority.observerPolicy,
        authorityGeneration: authority.authorityGeneration,
        chainProfile: authority.chainProfile,
        confirmationPolicy: authority.confirmationPolicy,
        target,
        checkpoint: authority.bootstrapCheckpoint,
        catchUp: issued.observerCatchUp,
      });
      const observerRecordKey = deriveZenonFundingObserverSqliteRecordKey(
        initialState,
        issued.authorityRecord,
      );
      binding = {
        transactionHash: checked.transactionHash,
        authorizationKey: checked.authorizationKey,
        payloadDigest: digest('zenon-x402:funding-intake-payment-payload-v1', {
          x402Version: 2,
          resource: checked.resourceIdentity,
          accepted: checked.requirements,
          transaction: checked.signedAccountBlock,
          intentDigest: checked.intentDigest,
        }),
        payer: checked.payer,
        observerTarget: target,
        observerInitialState: initialState,
        observerRecordKey,
        observerFileName: `funding-observer-${checked.transactionHash}.sqlite`,
        publication: {
          version: 1,
          paymentPayload: captured,
          acceptedRequirement: issued.challenge.paymentRequired.accepts[0],
          paymentRequired: issued.challenge.paymentRequired,
        },
      };
      if (row.status === 'ISSUED' && time(now) >= issued.challenge.activationIntent.expiresAt) {
        fail('ZENON_FUNDING_INTAKE_EXPIRED');
      }
      usable();
      const committed = store.bind(issued.selectionKey, binding);
      return ensureObserver(committed);
    } catch (error) {
      if (error instanceof ZenonFundingIntakeError) throw error;
      if (error instanceof ZenonFundingIntakeSqliteStoreError
        && error.code === 'ZENON_FUNDING_INTAKE_STORE_OUTCOME_UNKNOWN') {
        latched = true;
        fail('ZENON_FUNDING_INTAKE_OUTCOME_UNKNOWN');
      }
      if (error instanceof ZenonFundingIntakeSqliteStoreError
        && error.code === 'ZENON_FUNDING_INTAKE_STORE_CONFLICT') {
        fail('ZENON_FUNDING_INTAKE_CONFLICT');
      }
      fail('ZENON_FUNDING_INTAKE_REJECTED');
    }
  }

  function recoverBound() {
    usable();
    let rows;
    try { rows = store.loadBound(); } catch { latched = true; fail('ZENON_FUNDING_INTAKE_OUTCOME_UNKNOWN'); }
    const recovered = [];
    for (const row of rows) recovered.push(ensureObserver(row));
    return Object.freeze(recovered);
  }

  function close() {
    closed = true;
  }

  return Object.freeze({ issue, bind, recoverBound, close });
}
