"""Forward V5 full-source candidate. No native command or storage authority."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
from urllib.parse import quote

FROZEN=json.loads("{\"kind\":\"CURRENT_ISSUED_CLOSE_V5_SOURCE_CANDIDATE_NOT_NATIVE_AUTHORITY\",\"version\":5,\"sourceParent\":\"ef7df9c1ab953bea3501edeefb1ce64946463ecb\",\"previousSelection\":{\"path\":\"qualification/issued-current-close-v4.inputs.json\",\"bytes\":10437,\"LF\":300,\"sha256\":\"8339b2a8e04e7e3c573b1c26d8162f1c821df91182738409693d188121a21893\",\"gitBlob\":\"f292abda9f607a7d423f9d32fce2e55472d84a33\"},\"previousProducer\":{\"path\":\"qualification/issued_current_close_v4_profile.py\",\"bytes\":24610,\"LF\":297,\"sha256\":\"b3a8edc522471b0d34f33857e6bd2aae9286b101ec7ea24b6a0f0275e6e447e7\",\"gitBlob\":\"7ce435651b6d853baa06856ce5f0b04aef58c5c4\"},\"baseline\":{\"path\":\"qualification/issued-funding-post-native-vertical.inputs-v3.json\",\"bytes\":138777,\"LF\":3836,\"sha256\":\"51ffb5b0ff0052523c1b7f3d75fa24e9be27e60ca3bcc09236b1f439096aaed1\",\"gitBlob\":\"3dc05ccffd306e97056b4ed168d8121f63acebbc\"},\"runtime\":{\"node\":\"24.19.0\",\"platform\":\"darwin\",\"arch\":\"arm64\"},\"applicationReplacements\":[{\"before\":{\"path\":\"app/src/zenon/dynamic-plasma-original-funding-read-close.js\",\"bytes\":9568,\"LF\":178,\"sha256\":\"5086567b2c0cce0fc3419db69641beb7e5e434d47f83e17015682964ad482a45\",\"gitBlob\":\"f2a1b30bb02a6b192fc3b0fe0b4fc5b65e2d297b\"},\"input\":{\"path\":\"app/src/zenon/dynamic-plasma-original-funding-read-close.js\",\"bytes\":9801,\"LF\":183,\"sha256\":\"b7b33770b774a506b09cef81550a5b39d62480968f1a3c567ad9bc018ad79470\",\"gitBlob\":\"1c7a832c3704b25ee8f5ded10fad5d4b9d54fc8c\"}},{\"before\":{\"path\":\"app/qualification/issued-current-close-v4.case.mjs\",\"bytes\":35758,\"LF\":493,\"sha256\":\"b79e955adffd83cd727e613fa9e54bede5edb06c678e303dbbea3578cfbbf883\",\"gitBlob\":\"d2ad2afcd607d30f9fdf262cefad1cdf1213ec69\"},\"input\":{\"path\":\"app/qualification/issued-current-close-v5.case.mjs\",\"bytes\":35789,\"LF\":493,\"sha256\":\"fc40cdfd0b574f6b9a5ab95eb8837d9240cf1a77e9f673c15a6eb979651444ba\",\"gitBlob\":\"1b4970ed44c1de932c91d984240938e82b03b7cd\"}},{\"before\":{\"path\":\"app/qualification/issued-current-close-v4.preload.mjs\",\"bytes\":12504,\"LF\":175,\"sha256\":\"d105a810a164b717224d69e2c3e975c7412de62c88d5b0cdd7ab85fb17bf6700\",\"gitBlob\":\"44cabd5b5f3c043e6ce88c509d03fb190583b407\"},\"input\":{\"path\":\"app/qualification/issued-current-close-v5.preload.mjs\",\"bytes\":12639,\"LF\":176,\"sha256\":\"eb684c3762a9b34bb8c1c5306486eac65f66001475870a25e8af187fe02989b2\",\"gitBlob\":\"ae41957fde574fe47fc1bd43b00545dbd29c134d\"}}],\"resolvedApplicationFiles\":123,\"packageFiles\":404,\"resolvedSourceRowsSha256\":\"0c270548aceb8bb5589776e5f5a8cdb68bfe5f03472ed1c1e507c044fcddea70\",\"resolvedSourceBytes\":4473559,\"packageRowsSha256\":\"6de2ebf27c64de96e4823d3c504347593490061b0c6510db378311258730a31f\",\"entry\":\"app/qualification/issued-current-close-v5.case.mjs\",\"preload\":\"app/qualification/issued-current-close-v5.preload.mjs\",\"bareBindings\":[{\"parent\":\"app/qualification/issued-funding-post-native-vertical.case.draft.mjs\",\"specifier\":\"@noble/ed25519\",\"target\":\"packages/@noble/ed25519/index.js\"},{\"parent\":\"app/qualification/issued-funding-post-native-vertical.case.draft.mjs\",\"specifier\":\"@noble/hashes/sha2\",\"target\":\"packages/@noble/hashes/esm/sha2.js\"},{\"parent\":\"app/src/zenon-payment.js\",\"specifier\":\"znn-typescript-sdk\",\"target\":\"packages/znn-typescript-sdk/dist/index.js\"},{\"parent\":\"app/src/zenon-payment.js\",\"specifier\":\"@noble/ed25519\",\"target\":\"packages/@noble/ed25519/index.js\"},{\"parent\":\"app/src/zenon-payment.js\",\"specifier\":\"@noble/hashes/sha2\",\"target\":\"packages/@noble/hashes/esm/sha2.js\"},{\"parent\":\"app/src/x402-official-selected-payment-client.js\",\"specifier\":\"@x402/core/client\",\"target\":\"packages/@x402/core/dist/esm/client/index.mjs\"},{\"parent\":\"app/src/x402-official-selected-settlement-server.js\",\"specifier\":\"@x402/core/server\",\"target\":\"packages/@x402/core/dist/esm/server/index.mjs\"},{\"parent\":\"packages/@x402/core/dist/esm/chunk-N4QXZG2Z.mjs\",\"specifier\":\"zod\",\"target\":\"packages/zod/index.js\"},{\"parent\":\"app/qualification/issued-current-close-v5.case.mjs\",\"specifier\":\"@noble/ed25519\",\"target\":\"packages/@noble/ed25519/index.js\"},{\"parent\":\"app/qualification/issued-current-close-v5.case.mjs\",\"specifier\":\"@noble/hashes/sha2\",\"target\":\"packages/@noble/hashes/esm/sha2.js\"}],\"allowedBuiltins\":[\"node:assert/strict\",\"node:async_hooks\",\"node:buffer\",\"node:crypto\",\"node:events\",\"node:fs\",\"node:fs/promises\",\"node:http\",\"node:https\",\"node:module\",\"node:net\",\"node:path\",\"node:perf_hooks\",\"node:sqlite\",\"node:stream\",\"node:test\",\"node:timers\",\"node:tls\",\"node:url\",\"node:util\",\"node:vm\",\"node:zlib\"],\"packageVersions\":{\"packages/@x402/core/package.json\":\"2.23.0\",\"packages/zod/package.json\":\"3.25.76\",\"packages/znn-typescript-sdk/package.json\":\"1.0.5\",\"packages/@noble/ed25519/package.json\":\"2.3.0\",\"packages/@noble/hashes/package.json\":\"1.8.0\"},\"effectsCeiling\":{\"selectedCases\":1,\"maximumRuns\":1,\"opensslCommands\":1,\"nodeCommands\":1,\"nodeChildren\":0,\"newSqlitePaths\":5,\"independentPinFiles\":2,\"syntheticEd25519Keys\":4,\"transactionSignatures\":1,\"capabilitySignatures\":3,\"providerSignatures\":2,\"testTlsMaterialSeparate\":true,\"maxRpcConnections\":174,\"maxApplicationConnections\":8,\"maxTotalConnections\":182,\"expectedTotalConnections\":96,\"maxCandidatesPerSearch\":4096,\"maxReferenceCandidates\":32768,\"producerCandidateReservation\":4096,\"fixedVerificationReservation\":16384,\"maxAggregateCandidates\":65536,\"taskQuotaBytes\":4194304,\"maximumSourceReadBytes\":6291456,\"existingSourcesRecopied\":false,\"externalNetwork\":false,\"install\":false,\"realWallet\":false,\"realPayment\":false,\"sdkPrepareBlock\":false,\"nativeOsNetworkSandbox\":false},\"taskPolicy\":{\"quotaBytes\":4194304,\"minimumFreeBytes\":10737418240,\"existingApprovedRootOnly\":true,\"rootPolicyOverride\":false,\"maximumRuns\":1},\"controlInputs\":[],\"nativeAuthority\":\"NOT_GRANTED\",\"nativeCasesExecuted\":0,\"installedPackageFilesRead\":0,\"sourceTransforms\":false,\"historicalEvidenceRebound\":false}")
MANIFEST="qualification/issued-current-close-v5.inputs.json"
SELF="qualification/issued_current_close_v5_profile.py"
CLI="qualification/run-issued-current-close-v5.source.py"
PROFILE_KIND="OFFICIAL_ISSUED_CURRENT_CLOSE_ONE_CLEAN_NODE24_V5"
NODE_SHA="dbedff294bab84a0a86c04e15fbcbeb1c97ca10bef1b32b0634cd24b36f62100"
NODE_BYTES=121304480
FIELDS=("path","bytes","LF","sha256","gitBlob")
MAX_PROFILE=524288
HASH=re.compile(r"[0-9a-f]{64}")
INTEGER_TEXT=re.compile(r"(?:0|[1-9][0-9]{0,19})")
def require(value,code):
    if not value:raise ValueError(code)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode("ascii")
def pin(name,raw):
    return dict(path=name,bytes=len(raw),LF=raw.count(b"\n"),sha256=sha(raw),
        gitBlob=hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest())
def fields(value,names,code):
    require(type(value)is dict and set(value)==set(names),code)
def pairs(items):
    result={}
    for key,value in items:
        require(key not in result,"NO_DUPLICATE_JSON_KEY");result[key]=value
    return result
def decode(raw,maximum):
    require(type(raw)is bytes and 0<len(raw)<=maximum,"BOUNDED_SOURCE_JSON")
    def invalid(_):raise ValueError("INTEGER_ONLY_SOURCE_JSON")
    try:return json.loads(raw.decode("ascii"),object_pairs_hook=pairs,parse_float=invalid,parse_constant=invalid)
    except (UnicodeError,json.JSONDecodeError,RecursionError):raise ValueError("INVALID_SOURCE_JSON")from None
def identity(s):
    return [str(x)for x in(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)]
def read_owned(path,maximum=1048576):
    path=Path(path)
    require(path.is_absolute()and os.path.normpath(str(path))==str(path),"ABSOLUTE_CANONICAL_SOURCE_PATH")
    for parent in(path,*path.parents):require(not stat.S_ISLNK(parent.lstat().st_mode),"NO_SOURCE_LINK")
    before=path.lstat();ident=identity(before)
    require(stat.S_ISREG(before.st_mode)and before.st_uid==os.getuid()and before.st_nlink==1 and 0<=before.st_size<=maximum,"OWNED_SOURCE_FILE")
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),"rb")as stream:
        require(identity(os.fstat(stream.fileno()))==ident,"SOURCE_OPEN_IDENTITY")
        raw=stream.read(maximum+1)
        require(len(raw)==before.st_size and identity(os.fstat(stream.fileno()))==ident,"SOURCE_READ_IDENTITY")
    require(identity(path.lstat())==ident,"SOURCE_PATH_IDENTITY")
    return raw,ident
def source_root(value):
    path=Path(value)
    require(path.is_absolute()and os.path.normpath(str(path))==str(path),"ABSOLUTE_SOURCE_ROOT")
    for parent in(path,*path.parents):require(not stat.S_ISLNK(parent.lstat().st_mode),"NO_ROOT_LINK")
    s=path.lstat();require(stat.S_ISDIR(s.st_mode)and s.st_uid==os.getuid(),"OWNED_SOURCE_ROOT")
    return path,identity(s)
def load_previous(repo):
    selected=FROZEN["previousProducer"];path=repo/selected["path"];raw,before=read_owned(path,65536)
    require(pin(selected["path"],raw)==selected,"EXACT_PRESERVED_V4_PRODUCER")
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode,"ISOLATED_SOURCE_METADATA_ONLY")
    spec=importlib.util.spec_from_file_location("current_issued_close_v5_preserved_v4",path)
    require(spec is not None and spec.loader is not None,"PREVIOUS_SOURCE_SPEC")
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module
    exec(spec.loader.source_to_code(raw,str(path)),module.__dict__)
    require(read_owned(path,65536)==(raw,before),"PREVIOUS_PRODUCER_STABLE")
    return module
def physical_identity(value,mode,size=None):
    require(type(value)is list and len(value)==9 and all(type(x)is str and INTEGER_TEXT.fullmatch(x)and int(x)<2**64 for x in value),"CANONICAL_NINE_FIELD_IDENTITY")
    numbers=list(map(int,value))
    require(numbers[1]>0 and numbers[2]==os.getuid()and numbers[4]<=0o177777 and stat.S_IFMT(numbers[4])==mode,"DECLARED_IDENTITY_KIND_OWNER")
    if mode==stat.S_IFREG:require(numbers[5]==1 and(size is None or numbers[6]==size),"DECLARED_SINGLE_LINK_FILE_SIZE")
    return tuple(value)
def directory_data(value):
    fields(value,("path","identity"),"EXACT_DECLARED_ROOT")
    path=value["path"]
    require(type(path)is str and len(path)<=4096 and re.fullmatch(r"/[A-Za-z0-9@._ /-]+",path)is not None
        and os.path.normpath(path)==path,"CANONICAL_DECLARED_ROOT_PATH")
    return path,physical_identity(value["identity"],stat.S_IFDIR)
class _Selection:
    __slots__=("_rows","_manifest_sha","_source_sha","_source_bytes")
    def __init__(self):raise ValueError("USE_EXPLICIT_V5_SOURCE_CAPTURE")
    @classmethod
    def _create(cls,rows,manifest_sha):
        self=object.__new__(cls)
        self._rows=tuple(tuple(row[k]for k in FIELDS)for row in rows)
        self._manifest_sha=manifest_sha;self._source_sha=FROZEN["resolvedSourceRowsSha256"]
        self._source_bytes=FROZEN["resolvedSourceBytes"];return self
    def rows_data(self):return[dict(zip(FIELDS,row))for row in self._rows]
    def info(self):
        return dict(selectionVersion=5,applicationFiles=123,packageFilesDeclared=404,sourceRows=527,
            sourceRowsSha256=self._source_sha,sourceBytes=self._source_bytes,manifestSha256=self._manifest_sha,
            nativeProfileKind=PROFILE_KIND,nativeProfileVersion=5,nativeAuthority="NOT_GRANTED",
            nativeExecuted=False,storageAdmissionPerformed=False)
    def verify_application_inputs(self,repo):
        app,before=source_root(repo);captured=[]
        for item in self._rows:
            name,size,lf,digest,git_blob=item
            if not name.startswith("app/"):continue
            raw,ident=read_owned(app/name[4:])
            require(pin(name,raw)==dict(zip(FIELDS,item)),"CURRENT_V5_APPLICATION_SOURCE_PIN")
            captured.append(dict(logicalPath=name,bytes=size,sha256=digest,identity=ident))
        require(len(captured)==123 and identity(app.lstat())==before,"COMPLETE_STABLE_CURRENT_APPLICATION_ROOT")
        for row in captured:require(identity((app/row["logicalPath"][4:]).lstat())==row["identity"],"SOURCE_IDENTITIES_RECHECKED")
        return dict(applicationFilesRead=123,installedPackageFilesRead=0,sourceRowsSha256=self._source_sha,
            sourceAndPackageCopies=0,nativeExecuted=False,storageAdmissionPerformed=False,inputs=captured)
    def plan_registry_data(self,registry):
        fields(registry,("applicationRoot","packageRoot","runtime","inputs"),"EXACT_CALLER_DECLARED_REGISTRY")
        app,app_id=directory_data(registry["applicationRoot"]);packages,package_id=directory_data(registry["packageRoot"])
        require(app!=packages and app_id[:2]!=package_id[:2],"INDEPENDENT_DECLARED_SOURCE_ROOTS")
        runtime=registry["runtime"];fields(runtime,("node","platform","arch","nodeSha256","nodeIdentity"),"EXACT_DECLARED_NODE")
        require({k:runtime[k]for k in("node","platform","arch")}==FROZEN["runtime"]and runtime["nodeSha256"]==NODE_SHA,"PINNED_DECLARED_NODE_VERSION")
        node_id=physical_identity(runtime["nodeIdentity"],stat.S_IFREG,NODE_BYTES)
        require(node_id[:2]not in(app_id[:2],package_id[:2]),"NO_DECLARED_NODE_ROOT_ALIAS")
        raw=registry["inputs"];require(type(raw)is list and len(raw)==527,"ALL_527_DECLARED_INPUTS_REQUIRED")
        indexed={};physical={app_id[:2],package_id[:2],node_id[:2]}
        expected={row[0]:row for row in self._rows}
        for value in raw:
            fields(value,("logicalPath","url","bytes","sha256","identity"),"EXACT_DECLARED_INPUT")
            name=value["logicalPath"]
            require(type(name)is str and name in expected and name not in indexed,"NO_UNKNOWN_DUPLICATE_OR_REDUCED_SOURCE")
            row=expected[name]
            require(type(value["bytes"])is int and value["bytes"]==row[1]and type(value["sha256"])is str and value["sha256"]==row[3],"EXACT_DECLARED_SOURCE_CONTENT")
            root,relative=(app,name[4:])if name.startswith("app/")else(packages,name[9:])
            url="file://"+quote(root+"/"+relative,safe="/@")
            require(type(value["url"])is str and value["url"]==url,"EXACT_CANONICAL_SOURCE_URL")
            ident=physical_identity(value["identity"],stat.S_IFREG,row[1])
            require(ident[:2]not in physical,"NO_PHYSICAL_SOURCE_ALIAS");physical.add(ident[:2])
            indexed[name]=dict(logicalPath=name,url=url,bytes=row[1],sha256=row[3],identity=list(ident))
        inputs=[indexed[row[0]]for row in self._rows]
        bindings=[dict(parentURL=indexed[row["parent"]]["url"],specifier=row["specifier"],targetURL=indexed[row["target"]]["url"])
            for row in FROZEN["bareBindings"]]
        profile=dict(profileVersion=5,profileKind=PROFILE_KIND,runtime=dict(FROZEN["runtime"]),mode="clean",
            entryURL=indexed[FROZEN["entry"]]["url"],inputs=inputs,bareBindings=bindings,
            allowedBuiltins=list(FROZEN["allowedBuiltins"]),sourceRowsSha256=self._source_sha,
            sourceTransform=False,ordinaryInstalledNamespace=False)
        encoded=canonical(profile)+b"\n";require(len(encoded)<=MAX_PROFILE,"BOUNDED_COMPLETE_PROFILE")
        return dict(profileBytes=encoded,profileSha256=sha(encoded),profileBytesCount=len(encoded),
            **self.info(),profileFactsAreCallerDeclared=True,installedPackageFilesRead=0,profileSerializations=1,
            sourceCopies=0,authority="NONE")
def capture_selection(repo,manifest_raw,expected_sha256):
    app,app_id=source_root(repo)
    require(type(expected_sha256)is str and HASH.fullmatch(expected_sha256)and sha(manifest_raw)==expected_sha256,"EXACT_EXPLICIT_V5_MANIFEST_SHA")
    manifest=decode(manifest_raw,65536)
    expected=dict(FROZEN);expected["controlInputs"]=[]
    for name in(SELF,CLI):
        raw,_=read_owned(app/name,65536);expected["controlInputs"].append(pin(name,raw))
    require(type(manifest)is dict and canonical(manifest)==canonical(expected),"EXACT_FORWARD_V5_MANIFEST_NO_NATIVE_AUTHORITY")
    previous=load_previous(app)
    old=FROZEN["previousSelection"];old_raw,_=read_owned(app/old["path"],65536)
    require(pin(old["path"],old_raw)==old,"PRESERVED_V4_SELECTION_BYTES")
    baseline=FROZEN["baseline"];base_raw,_=read_owned(app/baseline["path"],262144)
    require(pin(baseline["path"],base_raw)==baseline,"IMMUTABLE_FULL_BASELINE_BYTES")
    old_rows=previous.expand_manifest(decode(old_raw,65536),decode(base_raw,262144))
    rows={row["path"]:dict(row)for row in old_rows}
    require(len(rows)==527,"COMPLETE_PREVIOUS_527_SOURCE_ROWS")
    for replacement in FROZEN["applicationReplacements"]:
        before,revised=replacement["before"],replacement["input"]
        require(rows.get(before["path"])==before,"EXACT_PREVIOUS_SOURCE_ROW")
        del rows[before["path"]]
        require(revised["path"]not in rows and revised["path"].startswith("app/"),"EXACT_FORWARD_ROW_NO_SHADOW")
        rows[revised["path"]]=dict(revised)
    rows=sorted(rows.values(),key=lambda row:row["path"])
    require(len(rows)==527 and sum(row["path"].startswith("app/")for row in rows)==123
        and sha(canonical(rows))==FROZEN["resolvedSourceRowsSha256"]
        and sum(row["bytes"]for row in rows)==FROZEN["resolvedSourceBytes"],"FULL_FORWARD_GRAPH_SEAL")
    packages=[row for row in rows if row["path"].startswith("packages/")]
    require(len(packages)==404 and sha(canonical(packages))==FROZEN["packageRowsSha256"],"ALL_404_PACKAGE_ROWS_PRESERVED")
    names={row["path"]for row in rows}
    for row in FROZEN["bareBindings"]:require(row["parent"]in names and row["target"]in names,"ALL_BARE_EDGES_EXIST")
    require(identity(app.lstat())==app_id,"SELECTION_ROOT_STABLE")
    return _Selection._create(rows,expected_sha256)
