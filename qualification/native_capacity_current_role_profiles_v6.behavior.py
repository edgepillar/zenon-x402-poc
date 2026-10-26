"""Actual V6 role producer DATA controls; native sources are read, never imported."""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import unittest
from urllib.parse import quote

repo=Path(__file__).absolute().parents[1]
relative="qualification/native_capacity_current_role_profiles_v6.py"
allowed={str(repo/name)for name in[
 relative,"qualification/native_capacity_current_role_profiles_v5.py","qualification/capacity-native-current-roles-v5.inputs.json","qualification/native_capacity_current_role_profiles_v6.behavior.py","qualification/capacity-native-current-roles-v6.inputs.json",
 "qualification/native_capacity_current_role_profiles_v4.py","qualification/capacity-native-current-roles-v4.inputs.json",
 "qualification/recovery_crash_native_profile.py","qualification/issued_current_close_v4_profile.py",
 "qualification/issued_current_close_v5_profile.py","qualification/run-issued-current-close-v5.source.py",
 "qualification/issued-current-close-v4.inputs.json","qualification/issued-current-close-v5.inputs.json",
 "qualification/native_capacity_full_profile_v3.py","qualification/capacity-native-full-graph-v3.inputs.json",
 "qualification/issued-funding-post-native-vertical.inputs-v3.json"]}
stdlib=str(Path(sys.base_prefix)/"lib"/"python3.12")+"/"
effects=dict(children=0,sockets=0,sqlite=0,writeOpens=0,outsideSourceReads=0,mutations=0)
def audit(event,args):
    if event in("subprocess.Popen","os.system","os.fork","os.posix_spawn"):
        effects["children"]+=1;raise AssertionError("NO_NATIVE_V6_CHILD")
    if event.startswith("socket."):effects["sockets"]+=1;raise AssertionError("NO_V6_DATA_SOCKET")
    if event=="sqlite3.connect":effects["sqlite"]+=1;raise AssertionError("NO_V6_DATA_SQL")
    if event in("os.remove","os.rename","os.mkdir","os.rmdir","os.link","os.symlink"):
        effects["mutations"]+=1;raise AssertionError("NO_V6_DATA_MUTATION")
    if event=="open":
        if type(args[2])is int and args[2]&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC):
            effects["writeOpens"]+=1;raise AssertionError("NO_V6_DATA_WRITE")
        if type(args[0])is str and args[0]not in allowed and not(args[0].startswith(stdlib)and"site-packages"not in Path(args[0]).parts):
            effects["outsideSourceReads"]+=1;raise AssertionError("ONLY_V6_DATA_SOURCE_STDLIB")
sys.addaudithook(audit)
if not(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)or os.environ.get("X402_CURRENT_V6_ROLES_DATA_SELECTION")!="complete-v6-roles-data-only":
    raise ValueError("EXPLICIT_ISOLATED_V6_ROLES_DATA")
path=repo/relative;spec=importlib.util.spec_from_file_location("actual_v6_roles",path)
p=importlib.util.module_from_spec(spec);sys.modules[spec.name]=p;exec(spec.loader.source_to_code(path.read_bytes(),str(path)),p.__dict__)
deps=p.load_dependencies(repo);base,current,legacy,old,forward,previous=deps
manifest_raw=(repo/p.MANIFEST).read_bytes();manifest=json.loads(manifest_raw)
selection=p.capture_selection(repo,deps,manifest_raw);rows=selection["rows"]
allowed.update(str(repo/row["path"][4:])for row in rows if row["path"].startswith("app/"))
APP,PACKAGES="/synthetic-v5-app","/synthetic-v5-packages"
def ident(inode,mode,size=0):return["1",str(inode),str(os.getuid()),"20",str(mode),"1",str(size),"100","100"]
def registry(app=APP,packages=PACKAGES):
    inputs=[]
    for index,row in enumerate(rows):
        root,relative=(app,row["path"][4:])if row["path"].startswith("app/")else(packages,row["path"][9:])
        inputs.append(dict(logicalPath=row["path"],url="file://"+quote(root+"/"+relative,safe="/@"),
            bytes=row["bytes"],LF=row["LF"],sha256=row["sha256"],gitBlob=row["gitBlob"],identity=ident(100+index,stat.S_IFREG|0o644,row["bytes"])))
    indexed={row["logicalPath"]:row for row in inputs}
    return dict(inputs=inputs,bareBindings=[dict(parentURL=indexed[row["parent"]]["url"],specifier=row["specifier"],targetURL=indexed[row["target"]]["url"])for row in selection["bareBindings"]],
        runtime=dict(node="24.19.0",platform="darwin",arch="arm64",nodeSha256=legacy.NODE_SHA,nodeIdentity=ident(20,stat.S_IFREG|0o755,legacy.NODE_BYTES)),
        sourceRowsSha256=p.SOURCE_SEAL,applicationRoot=app,packageRoot=packages,sourceIdentitiesRead=False,sourcesCopied=False,nativeExecuted=False,authority="NONE")
def root(index=0):return dict(path="/synthetic-v5-private/lane-"+str(index),identity=["1",str(800+index),str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
def context(index=0):return dict(runId="a"*64,laneId="lane-"+str(index))
def planner(data=None,selected=None):
    return p._Planner._create(base,legacy,registry()if data is None else data,selection if selected is None else selected)
def reference(role,ctx,owned,reg):
    spec=manifest["roleSpecs"][role];indexed={row["logicalPath"]:row for row in reg["inputs"]}
    value=dict(profileVersion=6,profileKind=spec["kind"],role=role,runtime=reg["runtime"],
        entryURL=indexed[spec["entry"]]["url"],preloaderURL=indexed[spec["preloader"]]["url"],
        inputs=reg["inputs"],bareBindings=reg["bareBindings"],allowedBuiltins=list(base.BUILTINS),sourceRowsSha256=p.SOURCE_SEAL,
        sourceTransform=False,ordinaryInstalledNamespace=False,baselineManifestSha256=p.CONTEXT["baselineManifestSha256"],
        currentManifestSha256=p.CONTEXT["currentManifestSha256"],runId=ctx["runId"],laneId=ctx["laneId"],
        rootPath=owned["path"],rootIdentity=owned["identity"],childProfiles=[])
    return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode("ascii")+b"\n"
class Roles(unittest.TestCase):pass
names=[];summary={}
def check(name,body):
    def run(self):body(self)
    setattr(Roles,"test_"+name,run);names.append(name)
def actual(self):
    value=p.verify_application_inputs(repo,selection);self.assertEqual(value["applicationFilesRead"],163)
    self.assertEqual(value["installedPackageFilesRead"],0);summary["actualApplicationFilesRead"]=163
check("all_163_actual_application_sources_match_current_v6_without_package_reads",actual)
def full_graph(self):
    self.assertEqual(len(rows),567);self.assertEqual(sum(row["path"].startswith("app/")for row in rows),163)
    prior=previous.capture_selection(repo,deps[:5],(repo/"qualification/capacity-native-current-roles-v5.inputs.json").read_bytes())
    indexed={row["path"]:row for row in rows}
    self.assertEqual(len(prior["rows"]),558)
    for row in prior["rows"]:self.assertEqual(indexed[row["path"]],row)
    self.assertEqual([r for r in rows if r["path"].startswith("packages/")],[r for r in prior["rows"]if r["path"].startswith("packages/")])
    self.assertEqual(len(manifest["additionalNativeRoleInputs"]),8)
    for row in manifest["additionalNativeRoleInputs"]+manifest["additionalMetadataInputs"]:self.assertEqual(indexed[row["path"]],row)
    self.assertEqual(len(selection["bareBindings"]),19)
    self.assertIn("app/qualification/capacity-native-service-window-v3.owner.draft.mjs",indexed)
    self.assertIn("app/qualification/capacity-native-current-service-window-v6.owner.draft.mjs",indexed)
check("complete_previous_558_rows_and_new_current_window_keep_all_404_packages",full_graph)
def whole_profiles(self):
    plan=planner()
    for i,role in enumerate(("PAYER","SERVICE")):
        actual=plan.plan_child(role,context(i),root(i));self.assertEqual(actual["profileBytes"],reference(role,context(i),root(i),registry()))
        self.assertEqual(actual["profileSha256"],p.sha(actual["profileBytes"]));self.assertEqual(actual["nativeAuthority"],"NOT_GRANTED")
        data=json.loads(actual["profileBytes"]);self.assertEqual(len(data["inputs"]),567);self.assertEqual(data["childProfiles"],[])
    self.assertEqual(plan.info()["profilesPlanned"],2)
check("both_real_v6_role_producer_outputs_equal_complete_independent_profile_reference",whole_profiles)
def all_32(self):
    plan=planner();encoded=0;previous=p.canonical;large=[]
    def observe(value):
        if type(value)is list and len(value)>=16 and all(type(item)is dict for item in value):large.append(len(value))
        if type(value)is dict and"value"not in value and value.get("profileVersion")==6:large.append("full-profile")
        return previous(value)
    p.canonical=observe
    try:
        for i in range(32):
            role="PAYER"if i%2==0 else"SERVICE";result=plan.plan_child(role,context(i//2),root(i))
            self.assertEqual(result["profileBytes"],reference(role,context(i//2),root(i),registry()));encoded+=len(result["profileBytes"])
    finally:p.canonical=previous
    self.assertEqual(large,[]);info=plan.info();self.assertEqual(info["sharedFieldSerializations"],3);self.assertEqual(info["profilesPlanned"],32)
    summary.update(sharedCanonicalBytes=info["sharedCanonicalBytes"],completeChildProfilesCompared=32,completeProfileBytesCompared=encoded)
check("all_32_complete_profiles_reuse_three_shared_serializations_without_whole_table_reencoding",all_32)
def detached(self):
    reg=registry();selected=copy.deepcopy(selection);plan=planner(reg,selected);expected=reference("PAYER",context(),root(),registry())
    reg["inputs"].clear();reg["runtime"].clear();selected["rows"].clear();selected["roleSpecs"]["PAYER"]["kind"]="WRONG"
    self.assertEqual(plan.plan_child("PAYER",context(),root())["profileBytes"],expected)
check("caller_mutation_does_not_change_reserved_registry_selection_or_complete_profile",detached)
def no_constructor(self):
    with self.assertRaises(ValueError):p._Planner()
check("planner_requires_explicit_current_source_factory",no_constructor)
def factories(self):
    plan=p.prepare_from_registry_data(repo,deps,registry(),manifest_raw)
    self.assertEqual(plan.plan_child("SERVICE",context(),root())["profileBytes"],reference("SERVICE",context(),root(),registry()))
check("real_source_capture_factory_produces_the_same_full_service_bytes",factories)
def oversize(self):
    plan=planner(registry("/"+"a"*750,"/"+"b"*750))
    self.assertLessEqual(plan.info()["sharedCanonicalBytes"],p.MAX_SHARED)
    with self.assertRaises(ValueError):plan.plan_child("PAYER",context(),root())
    self.assertEqual(plan.info()["profilesPlanned"],0)
check("complete_over_cap_profile_refuses_without_shrinking_567_inputs",oversize)
def space(self):
    reg=registry("/synthetic app","/synthetic packages");plan=planner(reg)
    result=plan.plan_child("PAYER",context(),root());self.assertEqual(result["profileBytes"],reference("PAYER",context(),root(),reg))
    self.assertIn(b"%20",result["profileBytes"])
check("spaced_source_roots_preserve_canonical_file_urls",space)
def metadata(self):
    info=planner().info()
    for name in("nativeExecuted","privateRootsOpened","profilesWritten"):self.assertIs(info[name],False)
    self.assertEqual(info["installedPackageFilesRead"],0);self.assertEqual(info["authority"],"NONE")
    self.assertEqual(info["nativeAuthority"],"NOT_GRANTED");self.assertTrue(info["profileFactsAreCallerDeclared"])
check("synthetic_profile_data_cannot_claim_native_source_or_root_authority",metadata)
def setat(value,path,new):
    for key in path[:-1]:value=value[key]
    value[path[-1]]=new
registry_edits=[
 ("missing_input",lambda v:v["inputs"].pop()),("duplicate_input",lambda v:v["inputs"].__setitem__(1,copy.deepcopy(v["inputs"][0]))),
 ("unknown_input",lambda v:v["inputs"][0].update(logicalPath="app/unknown.js")),("wrong_bytes",lambda v:v["inputs"][0].update(bytes=0)),
 ("boolean_bytes",lambda v:v["inputs"][0].update(bytes=True)),("wrong_digest",lambda v:v["inputs"][0].update(sha256="0"*64)),
 ("wrong_LF",lambda v:v["inputs"][0].update(LF=0)),("wrong_blob",lambda v:v["inputs"][0].update(gitBlob="0"*40)),
 ("wrong_url",lambda v:v["inputs"][0].update(url="file:///elsewhere")),("query_url",lambda v:v["inputs"][0].update(url=v["inputs"][0]["url"]+"?x")),
 ("physical_alias",lambda v:v["inputs"][1]["identity"].__setitem__(1,v["inputs"][0]["identity"][1])),
 ("wrong_identity_size",lambda v:v["inputs"][0]["identity"].__setitem__(6,"0")),
 ("noncanonical_identity",lambda v:v["inputs"][0]["identity"].__setitem__(1,"0100")),
 ("hardlink",lambda v:v["inputs"][0]["identity"].__setitem__(5,"2")),
 ("symlink",lambda v:v["inputs"][0]["identity"].__setitem__(4,str(stat.S_IFLNK|0o777))),
 ("wrong_owner",lambda v:v["inputs"][0]["identity"].__setitem__(2,str(os.getuid()+1))),
 ("wrong_node_version",lambda v:v["runtime"].update(node="26.0.0")),("wrong_node_hash",lambda v:v["runtime"].update(nodeSha256="0"*64)),
 ("wrong_node_size",lambda v:v["runtime"]["nodeIdentity"].__setitem__(6,"1")),
 ("node_source_alias",lambda v:v["runtime"]["nodeIdentity"].__setitem__(1,"100")),
 ("nonexecutable_node",lambda v:v["runtime"]["nodeIdentity"].__setitem__(4,str(stat.S_IFREG|0o644))),
 ("hardlinked_node",lambda v:v["runtime"]["nodeIdentity"].__setitem__(5,"2")),
 ("source_root_alias",lambda v:v.update(packageRoot=v["applicationRoot"])),
 ("nested_source_root",lambda v:v.update(packageRoot=v["applicationRoot"]+"/nested")),
 ("old_source_seal",lambda v:v.update(sourceRowsSha256=old.SOURCE_SEAL)),
 ("changed_bare_binding",lambda v:v["bareBindings"][0].update(specifier="node:child_process")),
 ("copied_sources",lambda v:v.update(sourcesCopied=True)),("native_claim",lambda v:v.update(nativeExecuted=True)),
 ("new_authority",lambda v:v.update(authority="GRANTED")),("extra_registry_field",lambda v:v.update(extra=None))]
for name,edit in registry_edits:
    def run(self,edit=edit):
        value=registry();edit(value)
        with self.assertRaises(ValueError):planner(value)
    check("registry_refuses_"+name,run)
selection_edits=[
 ("reduced_graph",lambda v:v["rows"].pop()),("wrong_source_hash",lambda v:v["rows"][0].update(sha256="0"*64)),
 ("old_role_entry",lambda v:v["roleSpecs"]["PAYER"].update(entry=old.SPECS["PAYER"]["entry"])),
 ("old_role_kind",lambda v:v["roleSpecs"]["PAYER"].update(kind=old.SPECS["PAYER"]["kind"])),
 ("wrong_namespace",lambda v:v["roleSpecs"]["SERVICE"].update(namespace="WRONG")),
 ("old_current_manifest",lambda v:v.update(currentManifestSha256=old.CURRENT_SHA)),
 ("wrong_baseline",lambda v:v.update(baselineManifestSha256="0"*64)),
 ("changed_edge",lambda v:v["bareBindings"][0].update(target="app/unknown.js")),
 ("extra_selection",lambda v:v.update(extra=None))]
for name,edit in selection_edits:
    def run(self,edit=edit):
        value=copy.deepcopy(selection);edit(value)
        with self.assertRaises(ValueError):planner(selected=value)
    check("selection_refuses_"+name,run)
for name,path,value in[
 ("old_version",["version"],4),("reduced_application_count",["applicationFiles"],153),
 ("changed_seal",["sourceRowsSha256"],"0"*64),("new_authority",["nativeAuthority"],"GRANTED"),
 ("native_claim",["nativeExecuted"],True),("old_entry",["roleSpecs","PAYER","entry"],old.SPECS["PAYER"]["entry"]),
 ("changed_native_hash",["additionalNativeRoleInputs",0,"sha256"],"0"*64)]:
    def run(self,path=path,value=value):
        changed=copy.deepcopy(manifest);setat(changed,path,value);raw=p.canonical(changed)
        self.assertNotEqual(p.sha(raw),p.MANIFEST_SHA)
        with self.assertRaises(ValueError):p.capture_selection(repo,deps,raw)
    check("pinned_manifest_refuses_"+name,run)
for name,role,ctx,owned in[
 ("unknown_role","SUPERVISOR",context(),root()),("boolean_role",True,context(),root()),
 ("short_run","PAYER",dict(runId="a",laneId="lane"),root()),("invalid_lane","PAYER",dict(runId="a"*64,laneId="../lane"),root()),
 ("public_root","PAYER",context(),dict(path=root()["path"],identity=["1","800",str(os.getuid()),"20",str(stat.S_IFDIR|0o755)])),
 ("source_root","PAYER",context(),dict(path=APP,identity=root()["identity"])),
 ("nested_source_root","PAYER",context(),dict(path=APP+"/private",identity=root()["identity"])),
 ("source_identity_alias","PAYER",context(),dict(path=root()["path"],identity=["1","100",str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])),
 ("node_identity_alias","PAYER",context(),dict(path=root()["path"],identity=["1","20",str(os.getuid()),"20",str(stat.S_IFDIR|0o700)]))]:
    def run(self,role=role,ctx=ctx,owned=owned):
        plan=planner()
        with self.assertRaises(ValueError):plan.plan_child(role,ctx,owned)
        self.assertEqual(plan.info()["profilesPlanned"],0)
    check("role_context_refuses_"+name,run)
def current_window_edges(self):
    owner=(repo/"qualification/capacity-native-current-service-v6.owner.draft.mjs").read_text()
    worker=(repo/"qualification/capacity-native-current-service-v6.worker.draft.mjs").read_text()
    window=(repo/"qualification/capacity-native-current-service-window-v6.owner.draft.mjs").read_text()
    preload=(repo/"qualification/capacity-native-current-namespace-v6.preload-common.draft.mjs").read_text()
    self.assertIn("from './capacity-native-current-service-window-v6.owner.draft.mjs'",owner)
    self.assertNotIn("from './capacity-native-service-window-v3.owner.draft.mjs'",owner)
    self.assertIn("openNativeCapacityCurrentServiceV6",worker)
    for value in(owner,worker,window,preload):self.assertIn("getPinnedNativeCapacityCurrentServiceNamespaceSnapshotV6",value)
    for value in(worker,window,preload):self.assertIn("native-capacity-current-service-source-draft-v6",value)
    for value in(window,preload):self.assertIn("one-reviewed-native-capacity-current-roles-v6",value)
    self.assertIn("s.applicationFiles!==163",window);self.assertIn("currentV5Application154Preserved:true",preload)
    self.assertIn("applications !== 163",preload);self.assertIn("profile.inputs.length !== 567",preload)
    self.assertIn("expectedEdges.size !== 19",preload)
    summary["matchedCurrentWindowSourceEdges"]=8
check("actual_service_window_worker_and_preloader_share_one_current_role_contract",current_window_edges)
if __name__=="__main__":
    output=io.StringIO();result=unittest.TextTestRunner(stream=output,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Roles))
    print(json.dumps(dict(event="CURRENT_V6_COMPLETE_ROLE_PROFILE_DATA_NOT_NATIVE",testsRun=result.testsRun,
        failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful(),
        names=names,**summary,auditedEffects=effects,installedPackageFilesRead=0,nativeExecuted=False,
        SDKImported=False,SQLite=False,keysOrSignatures=False,nonce=False,sockets=False,
        profilesWritten=0,managedTasksCreated=0,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful()else 1)

