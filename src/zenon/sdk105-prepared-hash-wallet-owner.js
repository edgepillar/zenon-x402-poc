import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { createPreparedHashWalletAdapter } from './prepared-hash-wallet-adapter.js';
import { canonicalJson } from '../canonical.js';
import { decodeOriginalFundingSignerRecord } from '../original-funding-signer-custody.js';
import { captureOriginalFundingSignerPreparation, captureOriginalFundingSignerPreSignContext, decodeOriginalFundingSignerContextRecord,
  createOriginalFundingSignerContextResult } from '../original-funding-signer-context-custody.js';

const ADAPTER = createPreparedHashWalletAdapter, F = Object.freeze;
const APPLY = Reflect.apply, DESC = Object.getOwnPropertyDescriptor, PROTO = Object.getPrototypeOf;
const OWN = Object.hasOwn, KEYS = Reflect.ownKeys, PROXY = utilTypes.isProxy, IS_PROMISE = utilTypes.isPromise;
const NativePromise = Promise, PROMISE = NativePromise.prototype, THEN = PROMISE.then;
const THEN_DESC = DESC(PROMISE, 'then'), CTOR = DESC(PROMISE, 'constructor'), SPECIES = DESC(NativePromise, Symbol.species);
const ARRAY = PROTO(Uint8Array.prototype), LENGTH = DESC(ARRAY, 'byteLength').get, BUFFER = DESC(ARRAY, 'buffer').get;
const ALLOC = Buffer.alloc, TEXT = Buffer.prototype.toString, SHARED = utilTypes.isSharedArrayBuffer;

/**
 * Own an EXCLUSIVE existing KeyPair with the pinned SDK1.0.5 method protocol:
 * synchronous getPublicKey/getAddress, synchronous signature bytes and clear.
 * Normalize copied signature bytes into the generic adapter's native Promise
 * without assimilating an arbitrary SDK result or touching its then getter.
 * Construction invokes no key method and creates no key or SDK instance.
 *
 * Successful construction transfers key cleanup to this owner. The caller must
 * stop using aliases; failure before return leaves key ownership with caller.
 * Close blocks admission immediately and joins the actual adapter operation
 * before invoking captured clear ONCE. A result observed after close stays
 * inspectable but cannot escape as a new prepared candidate. Unknown signing
 * stays unknown after clear. CLEAR_RETURNED is a method receipt, not proof of
 * private-memory erasure, GC or physical cleanup. Unsupported async SDK results
 * hold the key; they are never awaited, retried or treated as sync completion.
 */
export function createSdk105PreparedHashWalletOwner(configuration) {
  if (arguments.length !== 1 || !invariant()) fail('configuration_rejected');
  return createOwner(configuration, null);
}
/** Fixed application lane. Real native bindings supply the original owned
 * spending-store port; DATA controls declare it. Commit an intent before SDK
 * entry, then exact returned signed bytes before candidate acknowledgement.
 * Neither a record read nor an existing intent permits another sign attempt. */
export function createSdk105CustodiedPreparedHashWalletOwner(configuration, custodyConfiguration) {
  if (arguments.length !== 2 || !invariant()) fail('configuration_rejected');
  return createOwner(configuration, captureCustody(custodyConfiguration));
}
/** Fixed application lane with an explicit monotonic read-to-SDK admission
 * budget. Begin before the last pre-sign read, then recheck after intent I/O.
 * This is local elapsed time, not current chain/price or signature authority. */
export function createSdk105AgeBoundSignerContextWalletOwner(configuration, custodyConfiguration, entryConfiguration) {
  if (arguments.length !== 3 || !invariant()) fail('configuration_rejected');
  const custody = captureCustody(custodyConfiguration), entry = record(entryConfiguration, ['clock', 'maxReadToSignerMs']);
  if (!custody.contextRequired || typeof entry.clock !== 'function' || PROXY(entry.clock) || !Object.isFrozen(entry.clock)
      || !Number.isSafeInteger(entry.maxReadToSignerMs) || entry.maxReadToSignerMs < 1 || entry.maxReadToSignerMs > 60000) fail('configuration_rejected');
  const current = method(custody.backend, 'assertCurrent');
  if (!Object.isFrozen(current)) fail('configuration_rejected');
  return createOwner(configuration, { ...custody, current }, entry);
}
function captureCustody(custodyConfiguration) {
  const c = record(custodyConfiguration, ['paymentId', 'backend']);
  if (typeof c.paymentId !== 'string' || /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.exec(c.paymentId)?.[0] !== c.paymentId
      || c.backend === null || typeof c.backend !== 'object' || PROXY(c.backend) || !Object.isFrozen(c.backend)) fail('configuration_rejected');
  const begin = method(c.backend, 'beginSignerAttempt'), retain = method(c.backend, 'retainSignerResult');
  for (const fn of [begin, retain]) if (!Object.isFrozen(fn)) fail('configuration_rejected');
  const context = DESC(c.backend, 'requirePreparationContext');
  if (context !== undefined && (!OWN(context, 'value') || !context.enumerable || context.value !== true)) fail('configuration_rejected');
  return { paymentId: c.paymentId, backend: c.backend, begin, retain, contextRequired: context !== undefined };
}
function createOwner(configuration, custody, entry = null) {
  const c = record(configuration, ['keyPair','expectedAddress','expectedPublicKey']);
  let receiver = c.keyPair;
  const ADDRESS = method(receiver,'getAddress'), PUBLIC = method(receiver,'getPublicKey');
  const SIGN = method(receiver,'sign'), CLEAR = method(receiver,'clear');
  const expectedPublicKey = c.expectedPublicKey;
  let pending = null, closing = null, held = false, lifecycle = 'OPEN';
  let signAttempted = false, sdkSignerEntered = false, sdkSignReturned = false;
  let signingOutcome = 'NOT_ENTERED', clearOutcome = 'NOT_REQUESTED', clearCalls = 0;
  let unobservableSdkResult = null, unboundSdkResult = null, closeTerminal = false;
  const saved = { intent: null, intentEntered: false, intentReturned: false, resultEntered: false, resultReturned: false, transactionHash: null,
    currentEntered: false, currentReturned: false };
  const contextRequired = custody !== null && custody.contextRequired, DECODE = contextRequired ? decodeOriginalFundingSignerContextRecord : decodeOriginalFundingSignerRecord;
  let preparedContext = null, preSignContext = null, preparationBindEntered = false, preSignBindEntered = false;
  const window = { entered: false, started: false, refused: false, last: null, deadline: null, checks: 0 };
  function clock() {
    const now = APPLY(entry.clock, undefined, []);
    if (safePromise(now)) { try { APPLY(THEN, now, [discard, discard]); } catch {} }
    if (typeof now !== 'bigint' || now < 0n || window.last !== null && now < window.last) fail('signer_entry_age_refused');
    window.last = now; return now;
  }
  function requireSignerEntryAge() {
    if (entry === null) return;
    try {
      if (!window.started || window.refused || !invariant()) fail('signer_entry_age_refused');
      window.checks += 1; if (clock() >= window.deadline) fail('signer_entry_age_refused');
    } catch { window.refused = true; fail('signer_entry_age_refused'); }
  }
  function beginPreSignObservation() {
    if (arguments.length !== 0 || entry === null || !contextRequired || preparedContext === null || closing !== null || held
        || pending !== null || signAttempted || window.entered || !invariant()) fail('signer_entry_age_unavailable');
    window.entered = true;
    try { window.deadline = clock() + BigInt(entry.maxReadToSignerMs) * 1000000n; window.started = true; }
    catch { window.refused = true; fail('signer_entry_age_refused'); }
  }
  function bindOriginalPreparation(input, resourceUrl) {
    if (arguments.length !== 2 || !contextRequired || closing !== null || held || pending !== null || signAttempted || preparationBindEntered || !invariant()) fail('context_unavailable');
    preparationBindEntered = true;
    try { preparedContext = captureOriginalFundingSignerPreparation(input, resourceUrl); } catch { held = true; fail('context_unknown'); }
  }
  function bindOriginalPreSignContext(input) {
    if (arguments.length !== 1 || !contextRequired || preparedContext === null || closing !== null || held || pending !== null || signAttempted || preSignBindEntered || !invariant()) fail('context_unavailable');
    preSignBindEntered = true;
    try { requireSignerEntryAge(); preSignContext = captureOriginalFundingSignerPreSignContext(preparedContext, input); requireSignerEntryAge(); }
    catch { held = true; fail('context_unknown'); }
  }
  function checkPublicKey() {
    if (closing !== null || receiver === null || !invariant()) fail('closed');
    const bytes = copyBytes(APPLY(PUBLIC,receiver,[]),32);
    if (APPLY(TEXT,bytes,['base64']) !== expectedPublicKey || closing !== null) fail('identity_rejected');
  }
  const shim = F({
    getAddress: F(function getAddress() {
      checkPublicKey();
      const address = APPLY(ADDRESS,receiver,[]);
      if (closing !== null || !invariant()) fail('closed');
      return address;
    }),
    sign: F(function sign(hashBytes) {
      const out = capability();
      try {
        checkPublicKey();
        const hashAtEntry = APPLY(TEXT,hashBytes,['hex']);
        if (custody !== null) {
          const unsigned = APPLY(CHILD_INSPECT, wallet, []).originalUnsignedBlock;
          if (contextRequired && (preSignContext === null || canonicalJson(JSON.parse(preSignContext.preSignContextJson).originalUnsignedBlock) !== canonicalJson(unsigned))) {
            held = true; throw error('context_unknown');
          }
          requireSignerEntryAge(); saved.intentEntered = true;
          try {
            const raw = APPLY(custody.begin, custody.backend, contextRequired ? [custody.paymentId, unsigned, preSignContext] : [custody.paymentId, unsigned]);
            if (safePromise(raw)) { try { APPLY(THEN, raw, [discard, discard]); } catch {} }
            const record = DECODE(raw);
            if (record.phase !== 'INTENT' || record.paymentId !== custody.paymentId || record.transactionHash !== hashAtEntry
                || record.publicKey !== expectedPublicKey || record.accountAddress !== c.expectedAddress
                || record.unsignedBlockJson !== canonicalJson(unsigned)) fail('custody_unknown');
            if (contextRequired && (record.fundingResourceUrl !== preSignContext.fundingResourceUrl || record.preparationInputJson !== preSignContext.preparationInputJson
                || record.preSignContextJson !== preSignContext.preSignContextJson || record.originalDigest !== preparedContext.originalDigest)) fail('custody_unknown');
            saved.intent = raw; saved.transactionHash = record.transactionHash; saved.intentReturned = true;
          } catch { held = true; throw error('custody_unknown'); }
          if (closing !== null || held || !invariant() || APPLY(TEXT, hashBytes, ['hex']) !== hashAtEntry) fail('closed');
          if (entry !== null) {
            requireSignerEntryAge(); saved.currentEntered = true;
            const value = APPLY(custody.current, custody.backend, []);
            if (safePromise(value)) { try { APPLY(THEN, value, [discard, discard]); } catch {} }
            if (value !== undefined) fail('owner_check_unknown');
            saved.currentReturned = true;
            // A guard can block or request close. It cannot extend this run
            // or authorize a changed hash before the final age check below.
            if (closing !== null || held || !invariant() || APPLY(TEXT, hashBytes, ['hex']) !== hashAtEntry) fail('closed');
          }
        }
        // No await, key/DB callback or renewal occurs between this final
        // monotonic check and the captured synchronous SDK signer entry.
        requireSignerEntryAge(); sdkSignerEntered = true; signingOutcome = 'PENDING';
        const value = APPLY(SIGN,receiver,[hashBytes]);
        sdkSignReturned = true;
        let bytes;
        try { bytes = copyBytes(value,64); }
        catch {
          // A Promise/thenable/proxy is not synchronous signature completion.
          // Keep the actual opaque result and key under this owner's hold.
          unobservableSdkResult = value; held = true;
          // Consume only a descriptor-safe native rejection. This observation
          // does not join the operation, release the key or upgrade HELD when
          // it later settles; arbitrary thenables/proxies stay untouched.
          if (safePromise(value)) { try { APPLY(THEN,value,[discard,discard]); } catch {} }
          throw error('sync_result_unobservable');
        }
        unboundSdkResult = F({ hashAtEntry, hashAtReturn: APPLY(TEXT,hashBytes,['hex']),
          signatureBase64: APPLY(TEXT,bytes,['base64']), fieldBinding: 'NOT_ESTABLISHED' });
        out.resolve(bytes); // copyBytes shields this OWNED copy's then property.
      } catch {
        signingOutcome = sdkSignerEntered ? 'UNKNOWN' : 'REFUSED_BEFORE_SDK_ENTRY';
        out.reject(error('signing_refused_or_unknown'));
      }
      return out.promise;
    }),
  });
  const wallet = ADAPTER({ keyPair:shim, expectedAddress:c.expectedAddress, expectedPublicKey });
  const CHILD_ADDRESS = wallet.getAddress, CHILD_SIGN = wallet.sign, CHILD_INSPECT = wallet.inspect;
  configuration = null;

  function finishClose() {
    if (closing === null || closeTerminal || pending !== null) return;
    if (held || !invariant()) {
      held = true; lifecycle = 'HELD'; clearOutcome = 'UNKNOWN'; closeTerminal = true;
      closing.reject(error('clear_unknown')); return;
    }
    if (clearCalls !== 0) return;
    clearCalls = 1; clearOutcome = 'PENDING';
    try {
      const value = APPLY(CLEAR,receiver,[]);
      if (value !== undefined || !invariant()) fail('clear_unknown');
      receiver = null; clearOutcome = 'CLEAR_RETURNED'; lifecycle = 'CLOSED'; closeTerminal = true;
      closing.resolve(undefined);
    } catch {
      held = true; clearOutcome = 'UNKNOWN'; lifecycle = 'HELD'; closeTerminal = true;
      closing.reject(error('clear_unknown'));
    }
  }
  function start(kind,count,input) {
    const out = capability();
    if (count !== (kind === 'sign' ? 1 : 0) || closing !== null || held || pending !== null
        || (kind === 'sign' && signAttempted) || !invariant()) {
      out.reject(error('operation_unavailable')); return out.promise;
    }
    if (kind === 'sign') signAttempted = true;
    const ticket = {kind,out}; pending = ticket;
    try {
      const child = APPLY(kind === 'sign' ? CHILD_SIGN : CHILD_ADDRESS,wallet,kind === 'sign' ? [input] : []);
      if (!safePromise(child)) {
        held = true; lifecycle = 'HELD'; out.reject(error('operation_unknown'));
        return out.promise; // Unobserved operation still owns its pending slot.
      }
      APPLY(THEN,child,[value => {
        try {
          if (kind === 'sign' && custody !== null) {
            const intent = DECODE(saved.intent);
            const expected = contextRequired ? createOriginalFundingSignerContextResult(saved.intent, value) : canonicalJson({ signerCustodyVersion: 1, paymentId: intent.paymentId, originalDigest: intent.originalDigest,
              phase: 'SIGNED', unsignedBlockJson: intent.unsignedBlockJson, signedBlockJson: canonicalJson(value) });
            // The signature is already copied into this original owner. No
            // SQL transaction encloses SDK entry; this second commit only
            // retains its exact public result, including during close.
            saved.resultEntered = true;
            const receipt = APPLY(custody.retain, custody.backend, [custody.paymentId, saved.intent, value]);
            if (safePromise(receipt)) { try { APPLY(THEN, receipt, [discard, discard]); } catch {} }
            DECODE(receipt);
            if (receipt !== expected || !invariant()) fail('custody_unknown'); saved.resultReturned = true;
          }
        } catch {
          held = true; signingOutcome = sdkSignerEntered ? 'UNKNOWN' : 'REFUSED_BEFORE_SDK_ENTRY'; pending = null;
          out.reject(error('custody_unknown')); finishClose(); return;
        }
        if (kind === 'sign') signingOutcome = 'RETURNED_DATA';
        pending = null;
        if (closing !== null) out.reject(error('closed_with_retained_result'));
        else out.resolve(value);
        finishClose();
      },() => {
        if (kind === 'sign') signingOutcome = sdkSignerEntered ? 'UNKNOWN' : 'REFUSED_BEFORE_SDK_ENTRY';
        if (kind === 'sign' && custody !== null && saved.intentEntered) held = true;
        pending = null; out.reject(error('operation_refused_or_unknown')); finishClose();
      }]);
    } catch {
      held = true; lifecycle = 'HELD'; out.reject(error('operation_unknown'));
    }
    return out.promise;
  }
  const close = F(function close() {
    if (arguments.length !== 0) { const out=capability();out.reject(error('input_rejected'));return out.promise; }
    if (closing !== null) return closing.promise;
    closing = capability(); lifecycle = 'CLOSING'; finishClose(); return closing.promise;
  });
  const inspect = F(function inspect() {
    if (arguments.length !== 0 || !invariant()) fail('inspection_rejected');
    const view = APPLY(CHILD_INSPECT,wallet,[]);
    return F({ sdk105WalletOwnerVersion:1,lifecycle,held,activeOperation:pending === null ? null : pending.kind,
      closeRequested:closing !== null,clearCalls,clearOutcome,signAttempted,sdkSignerEntered,sdkSignReturned,
      signingOutcome,unobservableSdkResultHeld:unobservableSdkResult !== null,
      unboundSdkResult:view.signedOriginal === null ? unboundSdkResult : null,wallet:view,
      ...(custody === null ? {} : { signerCustody: F({ version: 1, intentEntered: saved.intentEntered, intentReturned: saved.intentReturned,
        resultEntered: saved.resultEntered, resultReturned: saved.resultReturned, transactionHash: saved.transactionHash,
        ...(contextRequired ? { contextRequired: true, preparationBound: preparedContext !== null, preSignContextBound: preSignContext !== null } : {}),
        ...(entry === null ? {} : { signerEntryAge: F({ version: 1, maxReadToSignerMs: entry.maxReadToSignerMs, observationEntered: window.entered,
          started: window.started, refused: window.refused, checks: window.checks, authority: 'NONE', chainFreshness: 'NOT_ESTABLISHED' }),
          currentOwnerCheck: F({ version: 1, entered: saved.currentEntered, returned: saved.currentReturned,
            authority: 'NONE', atomicExternalDispatchFencing: 'NOT_ESTABLISHED' }) }),
        localCommitReceipt: saved.resultReturned ? 'SIGNED_RESULT_RETURNED' : saved.intentReturned ? 'INTENT_RETURNED' : 'NOT_ESTABLISHED', authority: 'NONE' }) }),
      signatureValidation:'NOT_PERFORMED',keyErasure:'NOT_ESTABLISHED',authority:'NONE' });
  });
  return F({ getAddress:F(function getAddress(){return start('address',arguments.length);}),
    sign:F(function sign(block){return start('sign',arguments.length,block);}),inspect,close,
    ...(contextRequired ? { bindOriginalPreparation: F(bindOriginalPreparation), bindOriginalPreSignContext: F(bindOriginalPreSignContext) } : {}),
    ...(entry === null ? {} : { beginPreSignObservation: F(beginPreSignObservation) }) });
}

function copyBytes(value,size) {
  if (value === null || typeof value !== 'object' || PROXY(value)
      || (PROTO(value) !== Buffer.prototype && PROTO(value) !== Uint8Array.prototype)
      || APPLY(LENGTH,value,[]) !== size || SHARED(APPLY(BUFFER,value,[]))) fail('bytes_rejected');
  const bytes = APPLY(ALLOC,Buffer,[size]);
  for (let i=0;i<size;i++) {
    const d=DESC(value,String(i));
    if (!d || !OWN(d,'value') || !Number.isInteger(d.value) || d.value<0 || d.value>255) fail('bytes_rejected');
    bytes[i]=d.value;
  }
  Object.defineProperty(bytes,'then',{value:undefined});return bytes;
}
function method(receiver,name) {
  if (receiver === null || typeof receiver !== 'object' || PROXY(receiver)) fail('configuration_rejected');
  let at=receiver;
  for(let i=0;i<8&&at!==null&&at!==Object.prototype;i++){
    if(PROXY(at))fail('configuration_rejected');const d=DESC(at,name);
    if(d!==undefined){if(!OWN(d,'value')||typeof d.value!=='function'||PROXY(d.value))fail('configuration_rejected');return d.value;}
    at=PROTO(at);
  }
  fail('configuration_rejected');
}
function record(value,fields) {
  if(value===null||typeof value!=='object'||PROXY(value)||PROTO(value)!==Object.prototype||KEYS(value).length!==fields.length)fail('configuration_rejected');
  const out=Object.create(null);for(const name of fields){const d=DESC(value,name);if(!d||!OWN(d,'value')||!d.enumerable)fail('configuration_rejected');out[name]=d.value;}return out;
}
function safePromise(value) {
  if(!invariant()||!IS_PROMISE(value)||PROXY(value)||PROTO(value)!==PROMISE)return false;
  const d=DESC(value,'constructor');return d===undefined||OWN(d,'value')&&d.value===NativePromise;
}
function invariant(){return DESC(Object.prototype,'then')===undefined&&same(DESC(PROMISE,'then'),THEN_DESC)&&same(DESC(PROMISE,'constructor'),CTOR)&&same(DESC(NativePromise,Symbol.species),SPECIES);}
function same(a,b){return !!a&&!!b&&KEYS(a).length===KEYS(b).length&&KEYS(b).every(k=>OWN(a,k)&&a[k]===b[k]);}
function capability(){let resolve,reject;const promise=new NativePromise((a,b)=>{resolve=a;reject=b;});Object.defineProperty(promise,'constructor',{value:NativePromise});return{promise,resolve,reject};}
function error(kind){const code='zenon_sdk105_wallet_owner_'+kind,e=new TypeError(code);Object.defineProperty(e,'code',{value:code,enumerable:true});Object.defineProperty(e,'stack',{value:'TypeError: '+code});return F(e);}
function fail(kind){throw error(kind);}
function discard(){}
