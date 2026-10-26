"""Only verify current V5 application sources; no native execution option."""
import argparse
import hashlib
import importlib.util
import os
from pathlib import Path
import re
import stat
import sys

PROFILE="qualification/issued_current_close_v5_profile.py"
PROFILE_SHA="c96432e2af56c49932e7a403b099b57d4a1028866980ab37e031deb79fd45d6a"
MANIFEST="qualification/issued-current-close-v5.inputs.json"
def identity(s):
    return(s.st_dev,s.st_ino,s.st_uid,s.st_gid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def main():
    parser=argparse.ArgumentParser(prog="run-issued-current-close-v5.source.py",allow_abbrev=False)
    parser.add_argument("--repo",required=True)
    parser.add_argument("--selection-sha256",required=True)
    parser.add_argument("--source-only",action="store_true",required=True)
    args=parser.parse_args()
    if not(sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode and args.source_only):
        raise ValueError("ISOLATED_SOURCE_ONLY_CLI_REQUIRED")
    repo=Path(args.repo)
    if not repo.is_absolute()or str(repo)!=args.repo or os.path.normpath(args.repo)!=args.repo:
        raise ValueError("ABSOLUTE_SOURCE_ROOT_REQUIRED")
    path=repo/PROFILE
    for item in(path,*path.parents):
        if item.is_symlink():raise ValueError("NO_SOURCE_LINK")
    before=path.lstat()
    if not stat.S_ISREG(before.st_mode)or before.st_uid!=os.getuid()or before.st_nlink!=1 or before.st_size>65536:
        raise ValueError("PROFILE_SOURCE_IDENTITY")
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),"rb")as stream:
        if identity(os.fstat(stream.fileno()))!=identity(before):raise ValueError("PROFILE_OPEN_IDENTITY")
        raw=stream.read(65537)
        if len(raw)!=before.st_size or identity(os.fstat(stream.fileno()))!=identity(before):raise ValueError("PROFILE_READ_IDENTITY")
    if hashlib.sha256(raw).hexdigest()!=PROFILE_SHA or identity(path.lstat())!=identity(before):
        raise ValueError("EXACT_V5_PROFILE_PRODUCER_SOURCE")
    spec=importlib.util.spec_from_file_location("current_issued_close_v5_source_cli",path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=module
    exec(spec.loader.source_to_code(raw,str(path)),module.__dict__)
    manifest,_=module.read_owned(repo/MANIFEST,65536)
    selected=module.capture_selection(repo,manifest,args.selection_sha256)
    observed=selected.verify_application_inputs(repo)
    print(module.json.dumps(dict(event="CURRENT_ISSUED_CLOSE_V5_SOURCE_ONLY_VERIFIED",
        **selected.info(),applicationFilesRead=observed["applicationFilesRead"],
        installedPackageFilesRead=0,sourceAndPackageCopies=0,nativeExecutionAttempted=False,
        managedTasksCreated=0,authority="NONE"),sort_keys=True),flush=True)
    return 0
if __name__=="__main__":
    try:sys.exit(main())
    except (OSError,ValueError,KeyError,TypeError,SyntaxError)as error:
        code=str(error)if type(error)is ValueError and re.fullmatch(r"[A-Z0-9_]+",str(error))else"REVIEW_V5_SOURCE_ONLY_SELECTION"
        print('{"event":"CURRENT_ISSUED_CLOSE_V5_SOURCE_ONLY_REFUSED","code":"'+code+'","nativeExecuted":false,"authority":"NONE"}',file=sys.stderr,flush=True)
        sys.exit(1)
