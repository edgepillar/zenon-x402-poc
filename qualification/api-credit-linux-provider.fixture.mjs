// Coherent pure-codec DATA. Invalid existing signature-shaped bytes, synthetic
// authority text and public CA DATA are not an accepted native fixture.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../src/canonical.js';
import { encodeB64Json } from '../src/x402-wire.js';
import { createFixedZenonFundingPolicy } from '../src/service-credit-zenon-fixed-funding-policy.js';
import { captureZenonFundingResourceConfiguration } from '../src/service-credit-zenon-funding-evidence.js';
import { captureApiCreditPurchaseExpectation } from '../src/api-credit-purchase-expectation.js';
import { captureOriginalFundingSpendingFileProfile } from '../src/original-funding-spending-file-profile.js';
import { captureOriginalFundingSpendingSqliteProfile } from '../src/original-funding-spending-sqlite-profile.js';
import { encodeBuyerApiCreditCommand, encodeBuyerApiCreditCommandResult } from '../src/buyer-original-funding-command.js';
import { OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE,OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,
  OPERATOR_TRUST_ACKNOWLEDGEMENT,TESTNET_LIVE_ACKNOWLEDGEMENT } from '../src/zenon/operator-trusted-testnet-profile.js';
import { fundingGrantCustodyDataFixture } from './funding-grant-custody.behavior.mjs';
import { retainedOriginalInputFixture } from './dynamic-plasma-retained-input.fixture.mjs';
import { createApiCreditLinuxAcceptanceDataFixture } from './api-credit-linux-acceptance.behavior.mjs';
import { decodeNonDpApiCreditOperatorBootstrap } from '../src/api-credit-operator-bootstrap.js';
import { captureApiCreditLinuxAcceptanceFixture } from './api-credit-linux-acceptance-contract.mjs';
import { captureApiCreditLedgerAcceptanceSelection } from './api-credit-linux-ledger-contract.mjs';
import { captureApiCreditBudgetAcceptanceSelection } from './api-credit-linux-budget-contract.mjs';
import { captureApiCreditSignerAcceptanceSelection } from './api-credit-linux-signer-contract.mjs';

const F=Object.freeze,copy=v=>JSON.parse(JSON.stringify(v));
function frozen(v){if(v&&typeof v==='object'){Object.values(v).forEach(frozen);F(v);}return v;}
export async function createApiCreditLinuxProviderDataFixture(){
  const old=await createApiCreditLinuxAcceptanceDataFixture(),run=JSON.parse(old.runProfile),origin='https://127.0.0.1:4443',url=origin+'/funding';
  const expectation=JSON.parse(run.purchaseExpectationJson),chain=copy(OPERATOR_TRUSTED_PUBLIC_TESTNET_CHAIN_PROFILE);
  expectation.offer.costPolicyId='execution-receipt-unit-v1';
  expectation.offer.resourceBinding='sha256:'+createHash('sha256').update('zenon-x402-service-credit-resource-binding-v1\0')
    .update(canonicalJson({resourceId:expectation.offer.resourceId,resourceUrl:url})).digest('hex');
  expectation.authorityProfile.chainProfile=chain;expectation.terms.requirement.extra.zenonChain=copy(chain);
  const deriveFundingTerms=createFixedZenonFundingPolicy({offer:expectation.offer,selection:expectation.selection,terms:expectation.terms});
  const resource=captureZenonFundingResourceConfiguration({offer:expectation.offer,selection:expectation.selection,resourceUrl:url,
    deriveFundingTerms,authorityProfile:expectation.authorityProfile});
  const purchaseText=canonicalJson(expectation),header=encodeB64Json(resource.challenge.paymentRequired);
  const purchase=captureApiCreditPurchaseExpectation(purchaseText,header,url);
  const f=retainedOriginalInputFixture({resourceUrl:url,paymentRequired:resource.challenge.paymentRequired});
  f.candidate.originalUnsignedBlock.chainIdentifier=Number(chain.chainIdentifier);
  // The actual custody fixture rehashes that unsigned DTO before retaining
  // its independently selected checkpoint. No signature is made or checked.
  const d=fundingGrantCustodyDataFixture({fundingFixture:f,purchase,paymentId:run.spending.paymentId});
  run.purchaseExpectationJson=purchaseText;run.paymentRequiredHeader=header;
  run.configuration.storeOptions.resourceUrl=url;
  run.configuration.storeOptions.custodyPolicy.serviceResourceUrl=origin+'/service-credit/v1/execute';
  run.configuration.fundingOptions.fundingTransportOptions.resourceUrl=url;
  run.configuration.serviceOptions.transportOptions.origin=origin;
  const commands=old.commands.trimEnd().split('\n').map(JSON.parse),replies=old.runReplies.trimEnd().split('\n').map(JSON.parse);
  commands[0].input=f.input;commands[1].input={expectedPins:d.packet.expectedPins,originalGrantQueryProfile:d.text};
  commands[2].input={expectedPins:d.packet.expectedPins};
  commands[3].input={...commands[3].input,originalPayment:copy(d.profile.originalPayment),paymentRequiredHeader:header};
  const prepared=encodeBuyerApiCreditCommandResult(commands[0],frozen({phase:'AWAITING_INDEPENDENT_PINS',packet:d.packet}));
  replies[0]=JSON.parse(prepared);replies[2].result.transactionHash=d.packet.transactionHash;
  for(const command of commands.slice(4,105))command.input.serviceResourceUrl=origin+'/service-credit/v1/execute';
  const recovery=JSON.parse(old.recoveryProfile);recovery.selection=copy(commands[3].input);
  recovery.payerOptions.fundingResourceUrl=url;
  recovery.payerOptions.custodyPolicy.serviceResourceUrl=origin+'/service-credit/v1/execute';
  recovery.backendOptions.limits.maxOffers=1;recovery.backendOptions.limits.maxGrants=1;recovery.backendOptions.limits.maxStateBytes=1048576;
  const ledger={ledgerAcceptanceVersion:1,backendOptions:recovery.backendOptions,allowedRoot:recovery.payerOptions.allowedRoot,expectedCostUnits:1};
  const originalFile=captureOriginalFundingSpendingFileProfile(run.spendingFile),storage=captureOriginalFundingSpendingSqliteProfile(originalFile.storageProfile);
  const spendingFile={storageProfile:{version:1,mode:'OPEN_EXISTING',databasePath:storage.databasePath,policy:storage.policy,ownerToken:storage.ownerToken},
    allowedRoot:originalFile.allowedRoot,filePolicy:originalFile.filePolicy};
  const signer={signerInspectionVersion:3,spendingStoreProfile:'GRANT_RECOVERY_V1',spendingFile,
    expectedOriginal:{paymentId:run.spending.paymentId,originalDigest:d.row.originalDigest,fundingResourceUrl:url},
    uncertaintyAgeLimits:{version:1,maximumUnresolvedAgeDays:1}};
  const provider={providerBootstrapVersion:3,applicationMode:'FRESH',
    serviceStore:{...recovery.backendOptions.limits,databasePath:recovery.backendOptions.databasePath,allowedRoot:ledger.allowedRoot},
    intakeStore:{databasePath:'/synthetic/provider/intake.sqlite',allowedRoot:'/synthetic/provider',ledgerDomain:'provider.once',maxChallenges:1},
    offer:copy(expectation.offer),funding:{authorityRecord:'declared unauthenticated public authority DATA',terms:copy(expectation.terms),
      selection:copy(expectation.selection),resourceUrl:url,pendingObservationMode:'JOURNAL_ONLY',observerRoot:'/synthetic/provider/observers',
      observerCatchUp:{maximumPageEntries:1,maximumBackfillSpan:1,maximumMembersPerMomentum:1},maxPendingReconciliations:2,maxIntakeAttempts:1,closeBudgetMs:1000},
    service:{productId:'execution-receipt-v1',selectedDurationMs:100},
    transport:{origin,generation:{generationId:'provider.once',generationVersion:1},bind:{host:'127.0.0.1',port:4443,exclusive:true},
      limits:{maxHeaderBytes:16384,maxHeaderCount:64,maxConcurrentSockets:8,maxConnectionStarts:128,maxConcurrentRequests:8,maxRequestStarts:128,
        tlsHandshakeDeadlineMs:50,headerDeadlineMs:50,requestResponseDeadlineMs:100,idleSocketDeadlineMs:100,startDeadlineMs:100,closeGraceMs:200,metricsCounterLimit:1000}},
    journal:{directory:'/synthetic/provider/journal',allowedRoot:'/synthetic/provider',maxRecords:1,maxFileBytes:4194304},
    chain:{selection:{profileName:OPERATOR_TRUSTED_PUBLIC_TESTNET_PROFILE_NAME,operatorTrustAcknowledgement:OPERATOR_TRUST_ACKNOWLEDGEMENT,
      liveAcknowledgement:TESTNET_LIVE_ACKNOWLEDGEMENT},rpcUrl:'ws://127.0.0.1:35997/',rpcTimeoutMs:1000},recovery:null,witness:null,
    executionSetup:{ledgerId:'acceptance.synthetic',policy:{policyId:'acceptance.synthetic',policyVersion:1,maxDurationMs:1000},capacity:100},
    control:{maxCommands:2,maxLineBytes:16384,maxInputBytes:1048576,maxOutputBytes:1048576,closeWaitMs:100,operationBudgetMs:1000}};
  const journal={providerJournalSetupVersion:1,journal:copy(provider.journal),expectedDevice:spendingFile.filePolicy.expectedDevice,operationBudgetMs:1000};
  const activation={version:1,id:'acceptance-activate',operation:'ACTIVATE',argument:{
    observerFileName:'funding-observer-'+d.packet.transactionHash+'.sqlite',recordKey:'sha256:'+'b'.repeat(64)}};
  const input={runProfile:canonicalJson(run),commands:commands.map(c=>encodeBuyerApiCreditCommand(c)).join(''),
    runReplies:replies.map(r=>canonicalJson(r)+'\n').join(''),recoveryProfile:canonicalJson(recovery),recoveryReply:old.recoveryReply,
    ledgerProfile:canonicalJson(ledger),signerProfile:canonicalJson(signer),providerProfile:canonicalJson(provider),
    providerJournalProfile:canonicalJson(journal),providerActivation:canonicalJson(activation)};
  // Keep failures attributable to their actual pure codec layer rather than
  // treating a composed rejection as a provider process or native failure.
  const base={};for(const name of ['runProfile','commands','runReplies','recoveryProfile','recoveryReply'])base[name]=input[name];
  for(const [layer,check]of [
    ['BUYER_BOOTSTRAP',()=>{const token=decodeNonDpApiCreditOperatorBootstrap(input.runProfile);token.release();}],
    ['BUYER_TRANSCRIPT',()=>captureApiCreditLinuxAcceptanceFixture(base)],
    ['LEDGER_SELECTION',()=>captureApiCreditLedgerAcceptanceSelection({...base,ledgerProfile:input.ledgerProfile})],
    ['BUDGET_SELECTION',()=>captureApiCreditBudgetAcceptanceSelection({...base,ledgerProfile:input.ledgerProfile})],
    ['SIGNER_SELECTION',()=>captureApiCreditSignerAcceptanceSelection({...base,ledgerProfile:input.ledgerProfile,signerProfile:input.signerProfile})],
  ]){try{check();}catch(e){const error=new TypeError('LINUX_PROVIDER_DATA_FIXTURE');Object.defineProperty(error,'stage',{value:layer+(typeof e?.stage==='string'?':'+e.stage:'')});throw error;}}
  return {input,provider,run,signer,ledger,journal,activation,packet:d.packet};
}
