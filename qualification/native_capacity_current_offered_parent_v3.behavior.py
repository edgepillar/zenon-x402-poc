"""Complete V3 parent / genuine V5 child DATA, without native application imports."""
import copy
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
relative="qualification/native_capacity_current_offered_parent_v3.py"
allowed={str(repo/name)for name in[
 relative,"qualification/native_capacity_current_offered_parent_v3.behavior.py",
 "qualification/capacity-native-current-offered-parent-v3.inputs.json",
 "qualification/native_capacity_current_role_profiles_v5.py","qualification/capacity-native-current-roles-v5.inputs.json",
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
        effects["children"]+=1;raise AssertionError("NO_CURRENT_V5_PARENT_CHILD")
    if event.startswith("socket."):effects["sockets"]+=1;raise AssertionError("NO_CURRENT_PARENT_SOCKET")
    if event=="sqlite3.connect":effects["sqlite"]+=1;raise AssertionError("NO_CURRENT_PARENT_SQL")
    if event in("os.remove","os.rename","os.mkdir","os.rmdir","os.link","os.symlink"):
        effects["mutations"]+=1;raise AssertionError("NO_CURRENT_PARENT_MUTATION")
    if event=="open":
        if type(args[2])is int and args[2]&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC):
            effects["writeOpens"]+=1;raise AssertionError("NO_CURRENT_PARENT_WRITE")
        if type(args[0])is str and args[0]not in allowed and not(args[0].startswith(stdlib)and"site-packages"not in Path(args[0]).parts):
            effects["outsideSourceReads"]+=1;raise AssertionError("ONLY_CURRENT_PARENT_SOURCE_STDLIB")
sys.addaudithook(audit)
if not(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)or os.environ.get("X402_CURRENT_V5_PARENT_DATA_SELECTION")!="complete-v3-parent-v5-child-data-only":
    raise ValueError("EXPLICIT_CURRENT_PARENT_DATA")
path=repo/relative;spec=importlib.util.spec_from_file_location("actual_current_v3_parent",path)
p=importlib.util.module_from_spec(spec);sys.modules[spec.name]=p;exec(spec.loader.source_to_code(path.read_bytes(),str(path)),p.__dict__)
deps=p.load_dependencies(repo);base,legacy,child,child_deps=deps
manifest_raw=(repo/p.MANIFEST).read_bytes();manifest=json.loads(manifest_raw)
selection=p.capture_selection(repo,deps,manifest_raw)
allowed.update(str(repo/row["path"][4:])for row in selection["rows"]if row["path"].startswith("app/"))
APP,PACKAGES="/synthetic-v5-app","/synthetic-v5-packages"
def capture(row,index,app=APP,packages=PACKAGES):
    root,relative=(app,row["path"][4:])if row["path"].startswith("app/")else(packages,row["path"][9:])
    return dict(logicalPath=row["path"],url="file://"+quote(root+"/"+relative,safe="/@"),bytes=row["bytes"],LF=row["LF"],sha256=row["sha256"],gitBlob=row["gitBlob"],
        identity=["1",str(index),str(os.getuid()),"20",str(stat.S_IFREG|0o644),"1",str(row["bytes"]),"100","100"])
def registry(app=APP,packages=PACKAGES):
    inputs=[capture(row,100+i,app,packages)for i,row in enumerate(selection["childSelection"]["rows"])]
    index={row["logicalPath"]:row for row in inputs}
    return dict(inputs=inputs,bareBindings=[dict(parentURL=index[e["parent"]]["url"],specifier=e["specifier"],targetURL=index[e["target"]]["url"])for e in selection["childSelection"]["bareBindings"]],
        runtime=dict(node="24.19.0",platform="darwin",arch="arm64",nodeSha256=legacy.NODE_SHA,nodeIdentity=["1","20",str(os.getuid()),"20",str(stat.S_IFREG|0o755),"1",str(legacy.NODE_BYTES),"100","100"]),
        sourceRowsSha256=p.CHILD_SEAL,applicationRoot=app,packageRoot=packages,sourceIdentitiesRead=False,sourcesCopied=False,nativeExecuted=False,authority="NONE")
def extras(app=APP,packages=PACKAGES):return[capture(row,700+i,app,packages)for i,row in enumerate(selection["extraRows"])]
def root(index=0):return dict(path="/synthetic-v5-private/role-"+str(index),identity=["1",str(2000+index),str(os.getuid()),"20",str(stat.S_IFDIR|0o700)])
def context(lane="supervisor"):return dict(runId="a"*64,laneId=lane)
def planner(reg=None,extension=None,selected=None):
    return p._Planner._create(base,legacy,child,registry()if reg is None else reg,extras()if extension is None else extension,selection if selected is None else selected,False)
def children(count=2):
    reg=registry();factory=child._Planner._create(base,legacy,reg,selection["childSelection"]);index={row["logicalPath"]:row for row in reg["inputs"]};out=[]
    for i in range(count):
        role="PAYER"if i%2==0 else"SERVICE";lane="lane-"+str(i//2);owned=root(i+1);value=factory.plan_child(role,context(lane),owned);spec=child.CONTEXT["roleSpecs"][role]
        out.append(dict(reference=dict(role=role,laneId=lane,path="/synthetic-cas/profile-"+str(i)+".json",sha256=value["profileSha256"],
            entryURL=index[spec["entry"]]["url"],preloaderURL=index[spec["preloader"]]["url"],rootPath=owned["path"],rootIdentity=owned["identity"]),profileBytes=value["profileBytes"]))
    return out
def rewrite(bundle,edit,canonical=True):
    value=json.loads(bundle["profileBytes"]);edit(value)
    raw=(json.dumps(value,sort_keys=True,separators=(",",":"))if canonical else json.dumps(value)) .encode("ascii")+b"\n"
    bundle["profileBytes"]=raw;bundle["reference"]["sha256"]=p.sha(raw)
def parent_reference(bundles):
    reg=registry();inputs=sorted(reg["inputs"]+extras(),key=lambda row:row["logicalPath"]);index={row["logicalPath"]:row for row in inputs}
    value=dict(profileVersion=6,profileKind=p.PARENT_KIND,role="SUPERVISOR",runtime=reg["runtime"],
        entryURL=index[p.PARENT_ENTRY]["url"],preloaderURL=index[p.PARENT_PRELOAD]["url"],
        inputs=inputs,bareBindings=reg["bareBindings"],allowedBuiltins=sorted(base.BUILTINS+["node:child_process"]),
        sourceRowsSha256=p.PARENT_SEAL,childSourceRowsSha256=p.CHILD_SEAL,sourceTransform=False,ordinaryInstalledNamespace=False,
        baselineManifestSha256=legacy.BASELINE_SHA,currentManifestSha256=child.CONTEXT["currentManifestSha256"],
        runId=context()["runId"],laneId=context()["laneId"],rootPath=root()["path"],rootIdentity=root()["identity"],
        childProfiles=[row["reference"]for row in bundles])
    return json.dumps(value,sort_keys=True,separators=(",",":")).encode("ascii")+b"\n"
class Parent(unittest.TestCase):pass
names=[];summary={}
def check(name,body):
    def run(self):body(self)
    setattr(Parent,"test_"+name,run);names.append(name)
def actual(self):
    result=p.verify_application_inputs(repo,child,selection)
    self.assertEqual(result["applicationFilesRead"],162);self.assertEqual(result["installedPackageFilesRead"],0)
    summary["actualApplicationFilesRead"]=162
check("all_162_real_current_parent_application_sources_match_without_package_reads",actual)
def graph(self):
    self.assertEqual(len(selection["rows"]),566);self.assertEqual(len(selection["childSelection"]["rows"]),558)
    child_rows={row["path"]:row for row in selection["childSelection"]["rows"]};full={row["path"]:row for row in selection["rows"]}
    for name,row in child_rows.items():self.assertEqual(full[name],row)
    self.assertEqual(len(selection["extraRows"]),8);self.assertEqual(sum(name.startswith("packages/")for name in full),404)
    self.assertIn("app/src/native-profile-byte-fragments.js",full);self.assertNotIn("app/src/native-profile-byte-fragments.js",child_rows)
check("complete_v5_child_graph_is_preserved_with_exactly_eight_parent_only_extensions",graph)
def pair(self):
    bundles=children();plan=planner();result=plan.plan_parent(context(),root(),bundles)
    self.assertEqual(result["profileBytes"],parent_reference(bundles))
    self.assertEqual(result["profileSha256"],p.sha(result["profileBytes"]))
    value=json.loads(result["profileBytes"]);self.assertEqual(value["profileVersion"],6);self.assertEqual(len(value["inputs"]),566)
    self.assertEqual(len(value["childProfiles"]),2);self.assertEqual(plan.info()["completeChildByteComparisons"],2)
check("whole_parent_bytes_equal_independent_reference_with_genuine_complete_v5_children",pair)
def parity(self):
    bundles=children(32);plan=planner()
    for i,bundle in enumerate(bundles):
        ref=bundle["reference"];result=plan.plan_child(ref["role"],context(ref["laneId"]),root(i+1))
        self.assertEqual(result["profileBytes"],bundle["profileBytes"])
    summary["genuineChildProfileBytesCompared"]=sum(len(row["profileBytes"])for row in bundles)
check("all_32_parent_generated_children_equal_the_unmodified_actual_v5_producer",parity)
def all_32(self):
    bundles=children(32);plan=planner();original=p.canonical;large=[]
    def observe(value):
        if type(value)is list and(len(value)in(558,566)or len(value)==16 and all(type(item)is dict for item in value)):large.append(len(value))
        if type(value)is dict and value.get("profileVersion")==5:large.append("whole-child")
        return original(value)
    p.canonical=observe
    try:result=plan.plan_parent(context(),root(),bundles)
    finally:p.canonical=original
    self.assertEqual(large,[]);self.assertEqual(result["profileBytes"],parent_reference(bundles))
    info=plan.info();self.assertEqual(info["completeChildByteComparisons"],32);self.assertEqual(info["sharedFieldSerializations"],4)
    self.assertEqual(info["wholeExpectedChildBytesMaterialized"],0)
    summary.update(sharedCanonicalBytes=info["sharedCanonicalBytes"],completeChildByteComparisons=32,parentProfileBytes=result["profileBytesCount"])
check("all_32_entire_child_byte_sequences_are_checked_without_large_reencoding_or_second_whole_expected_profile",all_32)
def detached(self):
    reg=registry();ext=extras();selected=copy.deepcopy(selection);plan=planner(reg,ext,selected);bundles=children()
    reg["inputs"].clear();reg["runtime"].clear();ext.clear();selected["rows"].clear();selected["childSelection"]["rows"].clear()
    result=plan.plan_parent(context(),root(),bundles);self.assertEqual(result["profileBytes"],parent_reference(bundles))
check("captured_tables_do_not_alias_caller_mutation",detached)
def factory(self):
    result=p.prepare_from_registry_data(repo,deps,registry(),extras(),manifest_raw).plan_parent(context(),root(),children())
    self.assertEqual(result["profileBytes"],parent_reference(children()))
check("real_source_factory_produces_exact_complete_parent_bytes",factory)
def cap(self):
    with self.assertRaises(ValueError):planner(registry("/"+"a"*1000,"/"+"b"*1000),extras("/"+"a"*1000,"/"+"b"*1000))
check("oversized_shared_fields_refuse_without_dropping_sources_or_children",cap)
def constructor(self):
    with self.assertRaises(ValueError):p._Planner()
check("parent_requires_explicit_source_factory",constructor)
def evidence(self):
    info=planner().info()
    for key in("nativeExecuted","privateRootsOpened","profilesWritten","privateProfileIsNativeAuthority"):self.assertFalse(info[key])
    self.assertEqual(info["nativeAuthority"],"NOT_GRANTED");self.assertEqual(info["authority"],"NONE")
check("data_outputs_grant_no_native_source_or_runtime_authority",evidence)
for name,edit in[
 ("missing_extension",lambda x:x.pop()),("duplicate_extension",lambda x:x.__setitem__(1,copy.deepcopy(x[0]))),
 ("wrong_extension_digest",lambda x:x[0].update(sha256="0"*64)),("unknown_extension_path",lambda x:x[0].update(logicalPath="app/unknown.js")),
 ("child_source_alias",lambda x:x[0]["identity"].__setitem__(1,"100")),
 ("node_alias",lambda x:x[0]["identity"].__setitem__(1,"20")),
 ("extension_physical_alias",lambda x:x[1]["identity"].__setitem__(1,x[0]["identity"][1])),
 ("hardlink",lambda x:x[0]["identity"].__setitem__(5,"2")),
 ("symlink",lambda x:x[0]["identity"].__setitem__(4,str(stat.S_IFLNK|0o777))),
 ("wrong_owner",lambda x:x[0]["identity"].__setitem__(2,str(os.getuid()+1))),
 ("noncanonical_identity",lambda x:x[0]["identity"].__setitem__(1,"0700"))]:
    def run(self,edit=edit):
        ext=extras();edit(ext)
        with self.assertRaises(ValueError):planner(extension=ext)
    check("parent_extensions_refuse_"+name,run)
for name,edit in[
 ("missing_parent_row",lambda v:v["rows"].pop()),("changed_parent_digest",lambda v:v["rows"][0].update(sha256="0"*64)),
 ("decoupled_extra_row",lambda v:v["extraRows"][0].update(sha256="0"*64)),
 ("changed_child_context",lambda v:v["childSelection"]["roleSpecs"]["PAYER"].update(kind="WRONG")),
 ("reduced_child_graph",lambda v:v["childSelection"]["rows"].pop()),("extra_selection",lambda v:v.update(extra=None))]:
    def run(self,edit=edit):
        value=copy.deepcopy(selection);edit(value)
        with self.assertRaises(ValueError):planner(selected=value)
    check("selection_refuses_"+name,run)
def reject_bundles(self,bundles,ctx=None,owned=None):
    with self.assertRaises(ValueError):planner().plan_parent(context()if ctx is None else ctx,root()if owned is None else owned,bundles)
for name,edit in[
 ("missing_child",lambda b:b.pop()),("duplicate_child",lambda b:b.__setitem__(1,copy.deepcopy(b[0]))),
 ("duplicate_profile_path",lambda b:b[1]["reference"].update(path=b[0]["reference"]["path"])),
 ("duplicate_digest",lambda b:b[1]["reference"].update(sha256=b[0]["reference"]["sha256"])),
 ("same_child_root",lambda b:b[1]["reference"].update(rootPath=b[0]["reference"]["rootPath"])),
 ("same_physical_child_root",lambda b:b[1]["reference"]["rootIdentity"].__setitem__(1,b[0]["reference"]["rootIdentity"][1])),
 ("parent_root_path",lambda b:b[0]["reference"].update(rootPath=root()["path"])),
 ("parent_root_identity",lambda b:b[0]["reference"].update(rootIdentity=root()["identity"])),
 ("source_root_identity",lambda b:b[0]["reference"]["rootIdentity"].__setitem__(1,"100")),
 ("parent_extension_identity",lambda b:b[0]["reference"]["rootIdentity"].__setitem__(1,"700")),
 ("node_root_identity",lambda b:b[0]["reference"]["rootIdentity"].__setitem__(1,"20")),
 ("redirected_entry",lambda b:b[0]["reference"].update(entryURL=b[1]["reference"]["entryURL"])),
 ("redirected_preload",lambda b:b[0]["reference"].update(preloaderURL=b[1]["reference"]["preloaderURL"])),
 ("wrong_lane",lambda b:b[0]["reference"].update(laneId="other-lane")),
 ("unknown_role",lambda b:b[0]["reference"].update(role="OTHER")),
 ("wrong_digest",lambda b:b[0]["reference"].update(sha256="0"*64)),
 ("bytearray_profile",lambda b:b[0].update(profileBytes=bytearray(b[0]["profileBytes"]))),
 ("extra_reference",lambda b:b[0]["reference"].update(extra=None)),
 ("old_leaf_version_recomputed_digest",lambda b:rewrite(b[0],lambda v:v.update(profileVersion=4))),
 ("wrong_source_seal_recomputed_digest",lambda b:rewrite(b[0],lambda v:v.update(sourceRowsSha256="0"*64))),
 ("reduced_whole_graph_recomputed_digest",lambda b:rewrite(b[0],lambda v:v["inputs"].pop())),
 ("changed_final_input_recomputed_digest",lambda b:rewrite(b[0],lambda v:v["inputs"][-1].update(sha256="0"*64))),
 ("changed_bindings_recomputed_digest",lambda b:rewrite(b[0],lambda v:v["bareBindings"][0].update(specifier="wrong"))),
 ("wrong_run_recomputed_digest",lambda b:rewrite(b[0],lambda v:v.update(runId="b"*64))),
 ("old_current_manifest_recomputed_digest",lambda b:rewrite(b[0],lambda v:v.update(currentManifestSha256="0"*64))),
 ("noncanonical_json_recomputed_digest",lambda b:rewrite(b[0],lambda v:None,False))]:
    def run(self,edit=edit):
        bundles=children();edit(bundles);reject_bundles(self,bundles)
    check("whole_child_admission_refuses_"+name,run)
for name,key,value in[
 ("old_selection","sourceSelectionVersion",2),("reduced_parent","parentApplicationFiles",160),
 ("wrong_parent_digest","parentSourceRowsSha256","0"*64),("native_claim","nativeExecuted",True),
 ("new_authority","nativeAuthority","GRANTED")]:
    def run(self,key=key,value=value):
        changed=copy.deepcopy(manifest);changed[key]=value
        with self.assertRaises(ValueError):p.capture_selection(repo,deps,p.canonical(changed))
    check("exact_manifest_refuses_"+name,run)
if __name__=="__main__":
    output=io.StringIO();result=unittest.TextTestRunner(stream=output,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Parent))
    print(json.dumps(dict(event="CURRENT_V3_PARENT_GENUINE_V5_CHILD_COMPLETE_PROFILE_DATA_NOT_NATIVE",
        testsRun=result.testsRun,failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),
        successful=result.wasSuccessful(),names=names,**summary,auditedEffects=effects,installedPackageFilesRead=0,
        nativeExecuted=False,SDKImported=False,SQLite=False,keysOrSignatures=False,nonce=False,sockets=False,
        profilesWritten=0,managedTasksCreated=0,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(output.getvalue())
    sys.exit(0 if result.wasSuccessful()else 1)

