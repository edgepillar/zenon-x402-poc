/* CURRENT ROLE V6 SOURCE, NOT EXECUTED. Actual service-child-local clock/window owner.
 * No injected clock, timer, namespace getter, process or source substitute.
 * Construction and snapshot are inert. Valid timestamp/marker entry requires
 * the genuine full V6 service preloader and separate native authority.
 * Instrumentation uncertainty is sticky but never closes/changes an SQL store.
 */
import { types as utilTypes } from 'node:util';
const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,A=Reflect.apply;
const NS='getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV6',CLOCK=process.hrtime.bigint;
const MAX_NS=1n<<128n;

export function createNativeCapacityCurrentServiceWindowOwnerV6(configuration) {
  if(arguments.length!==1)fail();
  const c=exact(configuration,['context','totalCalls']);
  const context=F(exact(c.context,['runId','laneId','sourceRowsSha256']));
  if(typeof context.runId!=='string'||!/^[0-9a-f]{64}$/.test(context.runId)
      ||typeof context.laneId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(context.laneId)
      ||typeof context.sourceRowsSha256!=='string'||!/^[0-9a-f]{64}$/.test(context.sourceRowsSha256)
      ||!Number.isSafeInteger(c.totalCalls)||Object.is(c.totalCalls,-0)||c.totalCalls<1||c.totalCalls>256)fail();
  const maximumReads=4*(12*c.totalCalls+64)+2;
  let phase='NOT_OPEN',startNs=null,stopNs=null,stopCause=null,unknown=false,clockReads=0,last=null,namespaceFunction=null;
  configuration=null;
  function bad(){unknown=true;throw problem();}
  function admission(full) {
    const e=process.env,d=D(globalThis,NS);
    if(process.version!=='v24.19.0'||process.platform!=='darwin'||process.arch!=='arm64'
        ||e.X402_NATIVE_CAPACITY_SERVICE_SELECTION!=='native-capacity-current-service-source-draft-v6'
        ||e.X402_NATIVE_CAPACITY_RUN_SCOPE!=='one-reviewed-native-capacity-current-roles-v6'
        ||e.X402_NATIVE_CAPACITY_RUN_ID!==context.runId||e.X402_NATIVE_CAPACITY_LANE_ID!==context.laneId
        ||e.NODE_OPTIONS!==undefined||e.NODE_PATH!==undefined||e.NODE_TEST_CONTEXT!==undefined
        ||process.hrtime.bigint!==CLOCK||typeof CLOCK!=='function'||utilTypes.isProxy(CLOCK)
        ||!d||!O(d,'value')||d.writable||d.configurable||d.enumerable||typeof d.value!=='function'
        ||utilTypes.isProxy(d.value)||!Object.isFrozen(d.value)||namespaceFunction!==null&&d.value!==namespaceFunction)bad();
    if(namespaceFunction===null||full) {
      const s=d.value();
      if(!s||utilTypes.isProxy(s)||!Object.isFrozen(s)||s.profileKind!=='NATIVE_CAPACITY_CURRENT_SERVICE_NODE24_V6'
          ||s.sourceRowsSha256!==context.sourceRowsSha256||s.currentV5Application154Preserved!==true
          ||s.baselinePackages404Preserved!==true||s.applicationFiles!==163||s.packageFiles!==404
          ||s.sourceTransforms!==0||s.nativeBuiltinAliases!==0||s.ordinaryInstalledNamespaceQualified!==false)bad();
      namespaceFunction=d.value;
    }
  }
  function tick(full=false) {
    if(unknown||clockReads>=maximumReads)bad();
    admission(full); // Full identity observation on first entry and each marker.
    clockReads++;const n=A(CLOCK,process.hrtime,[]);
    if(typeof n!=='bigint'||n<0n||n>=MAX_NS||last!==null&&n<last)bad();
    last=n;return n;
  }
  const timestamp=F(function timestamp() {
    if(arguments.length!==0)bad();
    try{return tick();}catch{bad();}
  });
  const open=F(function open() {
    if(arguments.length!==0||phase!=='NOT_OPEN'||unknown)bad();
    try{startNs=tick(true);phase='OPEN';return undefined;}catch{bad();}
  });
  const stop=F(function stop() {
    if(arguments.length!==0||phase!=='OPEN'||unknown)bad();
    try{const n=tick(true);if(n<=startNs)bad();stopNs=n;stopCause='PARENT_STOP';phase='STOPPED';return undefined;}catch{bad();}
  });
  const closeFallback=F(function closeFallback() {
    if(arguments.length!==0)bad();
    if(phase!=='OPEN')return undefined;
    // Not a successful STOP substitute. Preserve a best-effort child-local
    // boundary without withholding operational close or upgrading measurement.
    try{stopNs=tick(true);}catch{stopNs=null;}
    unknown=true;stopCause='OWNER_CLOSE_FALLBACK';phase='STOPPED';return undefined;
  });
  const snapshot=F(function snapshot() {
    if(arguments.length!==0)fail();
    return F({windowVersion:1,context,clockDomain:'SERVICE_CHILD_LOCAL',phase,
      startNs:startNs===null?null:String(startNs),stopNs:stopNs===null?null:String(stopNs),
      stopCause,unknown,clockReads});
  });
  return F({timestamp,open,stop,closeFallback,snapshot});
}
function exact(v,names) {
  if(v===null||typeof v!=='object'||utilTypes.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype
      ||!Object.isFrozen(v)||Reflect.ownKeys(v).length!==names.length)fail();
  const out={};for(const name of names){const d=D(v,name);if(!d||!O(d,'value')||!d.enumerable)fail();
    Object.defineProperty(out,name,{value:d.value,enumerable:true});}return out;
}
function problem(){const e=new TypeError('NATIVE_CAPACITY_SERVICE_WINDOW_UNAVAILABLE');
  Object.defineProperty(e,'stack',{value:'TypeError: NATIVE_CAPACITY_SERVICE_WINDOW_UNAVAILABLE'});return F(e);}
function fail(){throw problem();}

