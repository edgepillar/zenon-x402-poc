"""V5 selection and profile DATA. No native application or installed package reads."""
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
names=["qualification/issued_current_close_v5_profile.py","qualification/run-issued-current-close-v5.source.py",
 "qualification/issued-current-close-v5.inputs.json","qualification/issued_current_close_v4_profile.py",
 "qualification/issued-current-close-v4.inputs.json","qualification/issued-funding-post-native-vertical.inputs-v3.json"]
allowed={str(repo/name)for name in names}
stdlib=str(Path(sys.base_prefix)/"lib"/"python3.12")+"/"
effects=dict(children=0,sockets=0,sqlite=0,writeOpens=0,outsideSourceReads=0,mutations=0)
def audit(event,args):
    if event in("subprocess.Popen","os.system","os.fork","os.posix_spawn"):
        effects["children"]+=1;raise AssertionError("NO_CHILD_IN_V5_DATA")
    if event.startswith("socket."):effects["sockets"]+=1;raise AssertionError("NO_SOCKET_IN_V5_DATA")
    if event=="sqlite3.connect":effects["sqlite"]+=1;raise AssertionError("NO_SQL_IN_V5_DATA")
    if event in("os.remove","os.rename","os.mkdir","os.rmdir","os.link","os.symlink"):
        effects["mutations"]+=1;raise AssertionError("NO_MUTATION_IN_V5_DATA")
    if event=="open":
        if type(args[2])is int and args[2]&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC):
            effects["writeOpens"]+=1;raise AssertionError("NO_WRITE_IN_V5_DATA")
        if type(args[0])is str and args[0]not in allowed and not(args[0].startswith(stdlib)and"site-packages"not in Path(args[0]).parts):
            effects["outsideSourceReads"]+=1;raise AssertionError("ONLY_V5_SOURCE_AND_STDLIB")
sys.addaudithook(audit)
if not(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode)or os.environ.get("X402_ISSUED_CLOSE_V5_DATA_SELECTION")!="v5-profile-source-data-only":
    raise ValueError("EXPLICIT_ISOLATED_V5_DATA_ONLY")
path=repo/names[0];raw=path.read_bytes()
expected=json.loads((repo/names[2]).read_bytes())
module_pin=next(row for row in expected["controlInputs"]if row["path"]==names[0])
if hashlib.sha256(raw).hexdigest()!=module_pin["sha256"]:raise ValueError("EXACT_V5_PROFILE_MODULE_PIN")
spec=importlib.util.spec_from_file_location("actual_issued_close_v5_profile",path)
p=importlib.util.module_from_spec(spec);sys.modules[spec.name]=p
exec(spec.loader.source_to_code(raw,str(path)),p.__dict__)
manifest_raw=(repo/p.MANIFEST).read_bytes();manifest_sha=p.sha(manifest_raw)
selected=p.capture_selection(repo,manifest_raw,manifest_sha)
rows=selected.rows_data()
allowed.update(str(repo/row["path"][4:])for row in rows if row["path"].startswith("app/"))
summary={"actualApplicationFilesRead":0,"installedPackageFilesRead":0}
def ident(inode,mode,size=0):return["1",str(inode),str(os.getuid()),"20",str(mode),"1",str(size),"100","100"]
def registry(app="/synthetic-current-app",packages="/synthetic-current-packages"):
    inputs=[]
    for index,row in enumerate(rows):
        root,relative=(app,row["path"][4:])if row["path"].startswith("app/")else(packages,row["path"][9:])
        inputs.append(dict(logicalPath=row["path"],url="file://"+quote(root+"/"+relative,safe="/@"),
            bytes=row["bytes"],sha256=row["sha256"],identity=ident(100+index,stat.S_IFREG|0o644,row["bytes"])))
    return dict(applicationRoot=dict(path=app,identity=ident(10,stat.S_IFDIR|0o700)),
        packageRoot=dict(path=packages,identity=ident(11,stat.S_IFDIR|0o700)),
        runtime=dict(node="24.19.0",platform="darwin",arch="arm64",nodeSha256=p.NODE_SHA,nodeIdentity=ident(20,stat.S_IFREG|0o755,p.NODE_BYTES)),
        inputs=inputs)
class Forward(unittest.TestCase):pass
case_names=[]
def check(name,body):
    def run(self):body(self)
    setattr(Forward,"test_"+name,run);case_names.append(name)
def actual_sources(self):
    value=selected.verify_application_inputs(repo)
    self.assertEqual(value["applicationFilesRead"],123);self.assertEqual(value["installedPackageFilesRead"],0)
    summary["actualApplicationFilesRead"]=value["applicationFilesRead"]
check("all_123_actual_application_sources_match_the_new_selection_without_package_reads",actual_sources)
def complete(self):
    result=selected.plan_registry_data(registry());profile=json.loads(result["profileBytes"])
    self.assertEqual(len(profile["inputs"]),527);self.assertEqual(profile["profileVersion"],5)
    self.assertEqual(profile["profileKind"],p.PROFILE_KIND);self.assertEqual(result["nativeAuthority"],"NOT_GRANTED")
    self.assertTrue(profile["entryURL"].endswith("issued-current-close-v5.case.mjs"))
    self.assertEqual(len(profile["bareBindings"]),10);self.assertFalse(profile["sourceTransform"])
    self.assertTrue(result["profileFactsAreCallerDeclared"]);self.assertEqual(result["installedPackageFilesRead"],0)
    self.assertEqual(result["profileSha256"],p.sha(result["profileBytes"]))
    summary["candidateProfileBytes"]=result["profileBytesCount"];summary["candidateProfileSha256"]=result["profileSha256"]
check("complete_new_v5_candidate_has_527_inputs_and_no_native_authority",complete)
def previous(self):
    old=p.load_previous(repo);delta=p.decode((repo/p.FROZEN["previousSelection"]["path"]).read_bytes(),65536)
    base=p.decode((repo/p.FROZEN["baseline"]["path"]).read_bytes(),262144);old_rows=old.expand_manifest(delta,base)
    old_packages=[row for row in old_rows if row["path"].startswith("packages/")]
    self.assertEqual([row for row in rows if row["path"].startswith("packages/")],old_packages)
    self.assertEqual(len(old_packages),404);self.assertNotEqual(p.PROFILE_KIND,old.KIND)
    current={row["path"]:row for row in rows}
    for revision in p.FROZEN["applicationReplacements"]:self.assertEqual(current[revision["input"]["path"]],revision["input"])
    self.assertNotIn("app/qualification/issued-current-close-v4.case.mjs",current)
    self.assertNotIn("app/qualification/issued-current-close-v4.preload.mjs",current)
    self.assertIn("app/qualification/issued-current-close-v4-grant.fixture.mjs",current)
    self.assertIn("app/qualification/issued-current-close-v4-rpc.fixture.mjs",current)
check("all_404_package_rows_and_reused_fixtures_preserve_their_original_bytes",previous)
def detached(self):
    value=registry();built=selected.plan_registry_data(value);saved=built["profileBytes"]
    value["inputs"][0]["identity"][0]="999";value["inputs"].clear()
    copied=selected.rows_data();copied[0]["sha256"]="0"*64
    self.assertEqual(selected.plan_registry_data(registry())["profileBytes"],saved)
    self.assertEqual(json.loads(saved)["inputs"][0]["identity"][0],"1")
check("profile_bytes_and_private_selection_do_not_alias_caller_mutation",detached)
def once(self):
    original=p.canonical;calls=[]
    def spy(value):
        if type(value)is dict and value.get("profileVersion")==5:calls.append(True)
        return original(value)
    p.canonical=spy
    try:result=selected.plan_registry_data(registry())
    finally:p.canonical=original
    self.assertEqual(calls,[True]);self.assertEqual(result["profileSerializations"],1)
check("complete_profile_is_serialized_only_once",once)
def spaced(self):
    result=selected.plan_registry_data(registry("/synthetic app","/synthetic packages"))
    self.assertIn(b"%20",result["profileBytes"]);self.assertTrue(result["profileFactsAreCallerDeclared"])
check("spaced_roots_are_canonical_declared_urls_without_accessing_them",spaced)
def capped(self):
    with self.assertRaises(ValueError):selected.plan_registry_data(registry("/"+"a"*4095,"/"+"b"*4095))
check("over_cap_candidate_is_not_returned_as_a_valid_profile",capped)
def no_direct(self):
    with self.assertRaises(ValueError):p._Selection()
check("selection_requires_the_explicit_source_capture_factory",no_direct)
manifest_mutations=[
 ("old_version",["version"],4),("boolean_version",["version"],True),("wrong_kind",["kind"],"OLD"),
 ("old_source_parent",["sourceParent"],"61f7c11967afcb4310fb50700c8e91d7acdb8a25"),
 ("reduced_application_graph",["resolvedApplicationFiles"],122),("reduced_packages",["packageFiles"],403),
 ("boolean_package_count",["packageFiles"],True),("forged_source_seal",["resolvedSourceRowsSha256"],"0"*64),
 ("expanded_native_authority",["nativeAuthority"],"GRANTED"),("claimed_native_case",["nativeCasesExecuted"],1),
 ("boolean_native_case",["nativeCasesExecuted"],False),("package_read_claim",["installedPackageFilesRead"],1),
 ("source_transform",["sourceTransforms"],True),("historical_rebinding",["historicalEvidenceRebound"],True),
 ("new_network_scope",["effectsCeiling","externalNetwork"],True),("new_child_scope",["effectsCeiling","nodeChildren"],1),
 ("new_nonce_scope",["effectsCeiling","maxAggregateCandidates"],65537),("new_quota",["taskPolicy","quotaBytes"],8388608),
 ("lower_floor",["taskPolicy","minimumFreeBytes"],0),("old_entry",["entry"],"app/qualification/issued-current-close-v4.case.mjs"),
 ("old_preloader",["preload"],"app/qualification/issued-current-close-v4.preload.mjs"),
 ("changed_package_version",["packageVersions","packages/@x402/core/package.json"],"2.28.0"),
 ("changed_replacement_hash",["applicationReplacements",0,"input","sha256"],"0"*64),
 ("changed_previous_hash",["applicationReplacements",0,"before","sha256"],"0"*64),
 ("added_builtin",["allowedBuiltins"],p.FROZEN["allowedBuiltins"]+["node:child_process"]),
 ("empty_bare_edges",["bareBindings"],[]),("empty_control_set",["controlInputs"],[]),
 ("forged_control_hash",["controlInputs",0,"sha256"],"0"*64),("extra_field",["extra"],False)]
def setat(value,path,new):
    for key in path[:-1]:value=value[key]
    value[path[-1]]=new
for name,path,value in manifest_mutations:
    def run(self,path=path,value=value):
        changed=copy.deepcopy(expected);setat(changed,path,value);encoded=p.canonical(changed)
        with self.assertRaises(ValueError):p.capture_selection(repo,encoded,p.sha(encoded))
    check("recomputed_manifest_digest_cannot_hide_"+name,run)
registry_mutations=[
 ("missing_inputs",lambda v:v["inputs"].pop()),
 ("duplicate_inputs",lambda v:v["inputs"].__setitem__(1,copy.deepcopy(v["inputs"][0]))),
 ("unknown_path",lambda v:v["inputs"][0].update(logicalPath="app/unknown.js")),
 ("forged_bytes",lambda v:v["inputs"][0].update(bytes=0)),
 ("boolean_bytes",lambda v:v["inputs"][0].update(bytes=True)),
 ("forged_digest",lambda v:v["inputs"][0].update(sha256="0"*64)),
 ("different_url",lambda v:v["inputs"][0].update(url="file:///unrelated.js")),
 ("url_query",lambda v:v["inputs"][0].update(url=v["inputs"][0]["url"]+"?other")),
 ("wrong_identity_size",lambda v:v["inputs"][0]["identity"].__setitem__(6,"0")),
 ("physical_alias",lambda v:v["inputs"][1]["identity"].__setitem__(1,v["inputs"][0]["identity"][1])),
 ("root_alias",lambda v:v.update(packageRoot=copy.deepcopy(v["applicationRoot"]))),
 ("relative_root",lambda v:v["applicationRoot"].update(path="relative")),
 ("root_traversal",lambda v:v["applicationRoot"].update(path="/synthetic/../other")),
 ("new_node_version",lambda v:v["runtime"].update(node="26.0.0")),
 ("wrong_node_hash",lambda v:v["runtime"].update(nodeSha256="0"*64)),
 ("wrong_node_size",lambda v:v["runtime"]["nodeIdentity"].__setitem__(6,"1")),
 ("node_source_alias",lambda v:v["inputs"][0]["identity"].__setitem__(1,"20")),
 ("node_application_root_alias",lambda v:v["runtime"]["nodeIdentity"].__setitem__(1,"10")),
 ("node_package_root_alias",lambda v:v["runtime"]["nodeIdentity"].__setitem__(1,"11")),
 ("noncanonical_identity",lambda v:v["inputs"][0]["identity"].__setitem__(1,"0100")),
 ("symlink_mode",lambda v:v["inputs"][0]["identity"].__setitem__(4,str(stat.S_IFLNK|0o777))),
 ("hardlink_count",lambda v:v["inputs"][0]["identity"].__setitem__(5,"2")),
 ("extra_input_field",lambda v:v["inputs"][0].update(extra=None)),
 ("extra_registry_field",lambda v:v.update(authority="GRANTED"))]
for name,edit in registry_mutations:
    def run(self,edit=edit):
        value=registry();edit(value)
        with self.assertRaises(ValueError):selected.plan_registry_data(value)
    check("declared_registry_refuses_"+name,run)
for name,raw in[
 ("duplicate_key",b'{"version":5,"version":5}'),("floating_json",b'{"x":1.0}'),
 ("nonfinite_json",b'{"x":NaN}'),("non_ascii_json",b'{"x":"\xff"}')]:
    def run(self,raw=raw):
        with self.assertRaises(ValueError):p.capture_selection(repo,raw,p.sha(raw))
    check("source_json_refuses_"+name,run)
if __name__=="__main__":
    capture=io.StringIO();result=unittest.TextTestRunner(stream=capture,verbosity=0).run(unittest.defaultTestLoader.loadTestsFromTestCase(Forward))
    print(json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V5_ACTUAL_SOURCE_DATA_NOT_NATIVE",testsRun=result.testsRun,
        failures=len(result.failures),errors=len(result.errors),skipped=len(result.skipped),successful=result.wasSuccessful(),
        names=case_names,**summary,auditedEffects=effects,nativeExecuted=False,SDKImported=False,SQLite=False,
        signatures=False,nonce=False,sockets=False,storageRootRead=False,profilesWritten=0,authority="NONE")),flush=True)
    if not result.wasSuccessful():sys.stderr.write(capture.getvalue())
    sys.exit(0 if result.wasSuccessful()else 1)
