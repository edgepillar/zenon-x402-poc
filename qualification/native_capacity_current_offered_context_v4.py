"""Full V5/V6 installed-source capture for a separately admitted native path.

This module is not called by the default source-only CLI. It reads installed
bytes and hashes Node once; it never imports SDK/SQL, executes Node, or opens
a task-storage/role root. Source observations are not native authority.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys

PARENT="qualification/native_capacity_current_offered_parent_v5.py"
PARENT_SHA="931e186d66b7bb2ccb8be66c16e7f840b1e3ae3b37b22a83ddca415edf66b553"
SELECTION="qualification/capacity-native-current-offered-parent-v5.inputs.json"
SELECTION_SHA="b832012dab133290d248d6fa8ab86baac328d3012c10327d935a3cd62b569dc8"
def require(value,code):
    if not value:raise ValueError(code)
def identity(s):
    return tuple(getattr(s,name)for name in("st_dev","st_ino","st_uid","st_gid","st_mode","st_nlink","st_size","st_mtime_ns","st_ctime_ns"))
def build_source_context(repo,packages,node):
    require(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode,"ISOLATED_V3_V5_SOURCE_CONTEXT")
    repo=Path(repo);path=repo/PARENT
    require(repo.is_absolute()and os.path.normpath(str(repo))==str(repo),"ABSOLUTE_V3_V5_SOURCE_ROOT")
    for parent in(path,*path.parents):require(not parent.is_symlink(),"NO_V3_V5_SOURCE_LINK")
    before=path.lstat()
    require(stat.S_ISREG(before.st_mode)and before.st_uid==os.getuid()and before.st_nlink==1 and before.st_size==16650,"V3_PARENT_SOURCE_IDENTITY")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        opened=os.fstat(fd)
        require(identity(opened)==identity(before),"V3_PARENT_OPEN_IDENTITY")
        with os.fdopen(fd,"rb",closefd=False)as stream:raw=stream.read(65537)
        require(identity(os.fstat(fd))==identity(before)and identity(path.lstat())==identity(before),"V3_PARENT_READ_IDENTITY")
    finally:os.close(fd)
    require(len(raw)==16650 and hashlib.sha256(raw).hexdigest()==PARENT_SHA,"PINNED_REAL_V3_PARENT")
    spec=importlib.util.spec_from_file_location("current_v5_v6_actual_installed_parent",path)
    require(spec is not None and spec.loader is not None,"REAL_V3_PARENT_SPEC")
    parent=importlib.util.module_from_spec(spec);sys.modules[spec.name]=parent
    exec(spec.loader.source_to_code(raw,str(path)),parent.__dict__)
    require(parent.read_owned(path,65536)==(raw,parent.identity(before)),"V3_PARENT_STABLE_BEFORE_CONTEXT")
    base,legacy,child,child_deps=dependencies=parent.load_dependencies(repo)
    selection_raw=parent.read_owned(repo/SELECTION,65536)[0]
    require(parent.sha(selection_raw)==SELECTION_SHA,"EXACT_CURRENT_V5_V6_SELECTION")
    selected=parent.capture_selection(repo,dependencies,selection_raw)
    app,package_root=base._absolute(str(repo)),base._absolute(packages)
    roots_before=(legacy.capture_directory(base,app,False),legacy.capture_directory(base,package_root,False))
    captures=[]
    for row in selected["rows"]:
        root,relative=(app,row["path"][4:])if row["path"].startswith("app/")else(package_root,row["path"][9:])
        content,ident=parent.read_owned(Path(root)/relative)
        require(base.pin(row["path"],content)==row,"ALL_578_INSTALLED_CURRENT_SOURCE_PINS")
        if row["path"]in base.VERSIONS:
            package=json.loads(content.decode("utf8"),object_pairs_hook=base._pairs)
            require(type(package)is dict and package.get("version")==base.VERSIONS[row["path"]],"EXACT_CURRENT_INSTALLED_PACKAGE_VERSION")
        captures.append(dict(logicalPath=row["path"],url=base.source_url(root,relative),
            **{k:row[k]for k in("bytes","LF","sha256","gitBlob")},identity=ident))
    index={row["logicalPath"]:row for row in captures}
    runtime=legacy.node_pin(node)
    registry=dict(inputs=[index[row["path"]]for row in selected["childSelection"]["rows"]],
        bareBindings=[dict(parentURL=index[e["parent"]]["url"],specifier=e["specifier"],targetURL=index[e["target"]]["url"])
            for e in selected["childSelection"]["bareBindings"]],runtime=runtime,sourceRowsSha256=parent.CHILD_SEAL,
        applicationRoot=app,packageRoot=package_root,sourceIdentitiesRead=True,sourcesCopied=False,nativeExecuted=False,authority="NONE")
    for row in captures:
        root,relative=(app,row["logicalPath"][4:])if row["logicalPath"].startswith("app/")else(package_root,row["logicalPath"][9:])
        require(parent.identity((Path(root)/relative).lstat())==row["identity"],"CURRENT_INSTALLED_SOURCE_STABLE")
    require(parent.identity(Path(node).lstat())==runtime["nodeIdentity"]
        and roots_before==(legacy.capture_directory(base,app,False),legacy.capture_directory(base,package_root,False)),"CURRENT_INSTALLED_ROOTS_AND_NODE_STABLE")
    return parent._Planner._create(base,legacy,child,registry,[index[row["path"]]for row in selected["extraRows"]],selected,True)

