// Pure provider/buyer fixture binding. No provider process, key, file or RPC.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalJson } from '../src/canonical.js';
import { decodeIssuedProviderOperatorBootstrap, readIssuedProviderOperatorBootstrap } from '../src/issued-provider-operator-bootstrap.js';
import { decodeIssuedProviderJournalSetup } from '../src/issued-provider-journal-setup.js';
import { decodeIssuedProviderControlCommand } from '../src/issued-provider-operator-control.js';
import { captureApiCreditSignerAcceptanceSelection } from './api-credit-linux-signer-contract.mjs';

const F=Object.freeze,STATES=new WeakMap();
const BASE=['runProfile','commands','runReplies','recoveryProfile','recoveryReply','ledgerProfile','signerProfile'];
const EXTRA=['providerProfile','providerJournalProfile','providerActivation'];
function fail(stage='INPUT'){const e=new TypeError('API_CREDIT_LINUX_PROVIDER_ACCEPTANCE');Object.defineProperty(e,'stage',{value:stage});throw e;}
function fields(v,names){
  if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
  const out={};for(const name of names){const d=Object.getOwnPropertyDescriptor(v,name);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();out[name]=d.value;}return out;
}
function hash(text){return createHash('sha256').update(text).digest('hex');}
function pin(text){return F({bytes:Buffer.byteLength(text),sha256:hash(text)});}
function same(a,b){if(canonicalJson(a)!==canonicalJson(b))fail();}
function line(v){return canonicalJson(v)+'\n';}
function reply(id,operation,result){return line({version:1,id,operation,outcome:'RETURNED',result});}
function state(token){if(token===null||typeof token!=='object'||types.isProxy(token)||!STATES.has(token))fail();return STATES.get(token);}
function loopbackOrigin(text){const u=new URL(text);if(u.protocol!=='https:'||u.origin!==text||u.hostname!=='127.0.0.1')fail();return u;}

/** The same existing V4 scenario stays intact. The additional provider profile,
 * explicit empty-journal setup and one ACTIVATE command are independent inputs,
 * selected before any process or secret. No expectation is learned from output. */
export function captureApiCreditProviderAcceptanceSelection(input){
  if(arguments.length!==1)fail();let stage='SELECTION_INPUT';
  try{
    const c=fields(input,[...BASE,...EXTRA]),base={};for(const name of BASE)base[name]=c[name];
    const signer=captureApiCreditSignerAcceptanceSelection(base);
    for(const [name,cap]of [['providerProfile',262144],['providerJournalProfile',8192],['providerActivation',1024]])
      if(typeof c[name]!=='string'||Buffer.byteLength(c[name])>cap||Buffer.from(c[name]).toString('utf8')!==c[name])fail();
    stage='PROVIDER_PROFILE';
    const provider=readIssuedProviderOperatorBootstrap(decodeIssuedProviderOperatorBootstrap(c.providerProfile));
    if(provider.providerBootstrapVersion!==3||provider.applicationMode!=='FRESH'||provider.funding.pendingObservationMode!=='JOURNAL_ONLY')fail();
    const run=JSON.parse(c.runProfile),purchase=JSON.parse(run.purchaseExpectationJson),ledger=JSON.parse(c.ledgerProfile),signed=JSON.parse(c.signerProfile);
    stage='PROVIDER_PURCHASE';
    same(provider.offer,purchase.offer);same(provider.funding.selection,purchase.selection);same(provider.funding.terms,purchase.terms);
    if(provider.offer.costPolicyId!=='execution-receipt-unit-v1'||provider.service.productId!=='execution-receipt-v1'
        ||provider.funding.resourceUrl!==run.configuration.storeOptions.resourceUrl)fail();
    const origin=loopbackOrigin(provider.transport.origin);
    if(provider.transport.bind.host!=='127.0.0.1'||provider.transport.bind.port!==Number(origin.port||443))fail();
    const rpc=new URL(provider.chain.rpcUrl);
    if(rpc.protocol!=='ws:'||rpc.hostname!=='127.0.0.1'||rpc.username||rpc.password||rpc.search||rpc.hash||rpc.pathname!=='/')fail();
    stage='PROVIDER_LEDGER';
    const limits={};for(const name of ['busyTimeoutMs','maxStateBytes','maxOffers','maxGrants','maxRequests'])limits[name]=provider.serviceStore[name];
    same({databasePath:provider.serviceStore.databasePath,limits},ledger.backendOptions);
    if(provider.serviceStore.allowedRoot!==ledger.allowedRoot||provider.intakeStore.databasePath===run.configuration.storeOptions.databasePath
        ||provider.intakeStore.databasePath===signed.spendingFile.storageProfile.databasePath)fail();
    stage='PROVIDER_JOURNAL';
    const journal=decodeIssuedProviderJournalSetup(c.providerJournalProfile);same(journal.journal,provider.journal);
    if(journal.expectedDevice!==signed.spendingFile.filePolicy.expectedDevice)fail();
    stage='PROVIDER_ACTIVATION';
    const activation=decodeIssuedProviderControlCommand(c.providerActivation,'FRESH',1024);
    if(activation.id!=='acceptance-activate'||activation.operation!=='ACTIVATE')fail();
    const commands=c.commands.trimEnd().split('\n').map(JSON.parse),hashValue=commands[1].input.expectedPins.binding.paymentHash;
    const grantId=commands[3].input.selectedGrantId;
    if(activation.argument.observerFileName!=='funding-observer-'+hashValue+'.sqlite')fail();
    const plan=F({
      journalReply:line({providerJournalSetupResultVersion:1,status:'INITIALIZED',exitCode:0,records:0,revision:0,authority:'NONE',physicalRelease:'NOT_ESTABLISHED',nativeAcceptance:'NOT_ESTABLISHED'}),
      startupReply:reply('startup','START',{status:'LISTENING'}),
      activationCommand:c.providerActivation+'\n',
      activationReply:reply(activation.id,'ACTIVATE',{status:'ADMITTED',grantId,transactionHash:hashValue,activation:'EXPLICIT_LOCAL_OPERATOR',authority:'NONE'}),
      closeCommand:line({version:1,id:'acceptance-close',operation:'CLOSE',argument:null}),
      closeReply:reply('acceptance-close','CLOSE',{status:'CLOSED'}),
    });
    const replyPins={};for(const [name,text]of Object.entries(plan))replyPins[name]=pin(text);
    const inputPins=F({...signer.summary.inputPins,...Object.fromEntries(EXTRA.map(name=>[name,pin(c[name])]))});
    const selectionDigest=hash(canonicalJson({signerSelectionDigest:signer.summary.selectionDigest,inputPins,replyPins}));
    const summary=F({...signer.summary,version:5,inputPins,selectionDigest,signerSelectionDigest:signer.summary.selectionDigest,
      providerReplyPins:F(replyPins),providerProcesses:1,journalSetupProcesses:1,providerActivationCommands:1,afterBuyerReply:2,
      providerBeforeCredential:true,providerClosedBeforeLedgerProbe:true,providerLifecycleAcceptance:'NOT_EXECUTED',
      fundingAcknowledgementCreatesGrantAuthority:false,observerAuthentication:'NOT_ESTABLISHED',loopbackRPCAuthentication:'NOT_ESTABLISHED',
      buyerReadRoutesIsolation:'NOT_ESTABLISHED',nativeFixtureAcceptance:'NOT_ESTABLISHED'});
    const token=F({providerAcceptanceVersion:1,summary});STATES.set(token,{plan,signer});return token;
  }catch{fail(stage);}
}
export function apiCreditProviderAcceptancePlan(token){if(arguments.length!==1)fail();return state(token).plan;}
export function apiCreditProviderAcceptanceSignerSelection(token){if(arguments.length!==1)fail();return state(token).signer;}
