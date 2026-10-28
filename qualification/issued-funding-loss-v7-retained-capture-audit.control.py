"""Audit retained native output, then exercise declared refusal mutations.

The raw output, rejected qualification and original task remain unchanged.
This command executes no application, SDK, SQL engine, socket or work search.
"""
import argparse, copy, hashlib, importlib.util, json, os, stat, sys
from pathlib import Path

def sha(raw): return hashlib.sha256(raw).hexdigest()
def read(path, expected, cap):
    path=Path(path)
    for ancestor in (path,*path.parents): assert not ancestor.is_symlink()
    token=lambda s:tuple(getattr(s,k) for k in ('st_dev','st_ino','st_uid','st_gid','st_mode','st_nlink','st_size','st_mtime_ns','st_ctime_ns'))
    before=path.lstat()
    assert stat.S_ISREG(before.st_mode) and before.st_uid==os.getuid() and before.st_nlink==1 and before.st_size<=cap
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW),'rb')as stream:
        assert token(os.fstat(stream.fileno()))==token(before)
        raw=stream.read(cap+1);assert len(raw)==before.st_size and token(os.fstat(stream.fileno()))==token(before)
    assert token(path.lstat())==token(before) and sha(raw)==expected
    return raw
def load(row,name):
    p=Path(row['path']);raw=read(p,row['sha256'],65536)
    value=importlib.util.module_from_spec(importlib.util.spec_from_file_location(name,p));sys.modules[name]=value
    exec(compile(raw,str(p),'exec'),value.__dict__);return value

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binding',required=True);parser.add_argument('--binding-sha256',required=True)
    args=parser.parse_args();assert sys.dont_write_bytecode
    binding=json.loads(read(args.binding,args.binding_sha256,16384))
    report=json.loads(read(binding['observation']['path'],binding['observation']['sha256'],1048576))
    assert report['profileSha256']==binding['profileSha256'] and report['authoritySha256']==binding['authoritySha256']
    assert report['status']=='REFUSED_OR_UNKNOWN' and report['reason']=='NO_SECOND_ECONOMIC_OPERATION'
    assert report['nativeCommandsStarted']==2 and report['closedTask']['state']=='CLOSED' and report['closedTask']['outcome']=='FAILURE'
    receipt=report['nativeReceipt']
    for key in ('stdout','stderr'):
        assert receipt[key]['sha256']==binding[key]['sha256'] and receipt[key]['bytes']==binding[key]['bytes']
    stdout=read(binding['stdout']['path'],binding['stdout']['sha256'],65536)
    stderr=read(binding['stderr']['path'],binding['stderr']['sha256'],65536)
    controller=load(binding['controller'],'v7_original_rejected_decoder')
    repo=Path(binding['repo']);selected=controller.source_selection(repo,binding['applicationManifestSha256'])
    auditor=load(binding['auditor'],'v7_retained_auditor')
    result=auditor.audit_known_v7_summary_defect(stdout,stderr,receipt,selected[3])
    assert result['nativeCaseCompleted']is True and result['rawSummaryConsistent']is False
    source=read(binding['caseSource']['path'],binding['caseSource']['sha256'],65536).decode('ascii')
    assert source.count('actualStreamCommands: 4, actualStreamResults: 4')==1
    assert 'assert.equal(counts.commandStarts, 3); assert.equal(counts.commandResults, 3);'in source
    cases=[]
    def check(name,work):work();cases.append(dict(id=name,status='PASS'))
    def original_refuses():
        try:controller.native_result(stdout,stderr,receipt,selected[3],'funding-response-loss')
        except ValueError as error:assert str(error)=='NO_SECOND_ECONOMIC_OPERATION';return
        raise AssertionError('ORIGINAL_REJECTION_MUST_REMAIN')
    check('ACTUAL_COMPLETED_CAPTURE_WITH_ORIGINAL_REJECTION_PRESERVED',original_refuses)
    case=result['observedCase'];namespace=result['observedNamespace']
    def declared(c,n,r):
        raw=('# actual-sdk105-issued-command-application-v7 '+json.dumps(c)+'\n'
            +'# pinned-sdk105-issued-command-application-v7-namespace '+json.dumps(n)+'\n'
            +'# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n').encode()
        try:auditor.audit_known_v7_summary_defect(raw,b'',r,selected[3])
        except ValueError:return
        raise AssertionError('DECLARED_MUTATION_MUST_BE_REFUSED')
    for path,value in [(('counts','observedSignedTransactions'),2),(('counts','executions'),1),
        (('fundingProof','grants'),1),(('fundingProof','originalPacketUnchanged'),False),
        (('closeProof','fundingOutcomeUnknown'),False),(('closeProof','currentOwnersClosed'),True),
        (('responseLoss','physicalResourceRelease'),'QUALIFIED')]:
        changed=copy.deepcopy(case);changed[path[0]][path[1]]=value
        check('REFUSE-' + '.'.join(path),lambda changed=changed:declared(changed,namespace,receipt))
    changed=copy.deepcopy(case);changed['actualStreamCommands']=changed['actualStreamResults']=3
    check('CANNOT_SILENTLY_REPLACE_RAW_SUMMARY',lambda:declared(changed,namespace,receipt))
    check('OTHER_NAMESPACE_IS_REFUSED',lambda:declared(case,dict(namespace,sourceRowsSha256='0'*64),receipt))
    check('FAILED_NATIVE_EXIT_IS_REFUSED',lambda:declared(case,namespace,dict(receipt,actual_exit=1)))
    selected[-2]()
    assert read(binding['stdout']['path'],binding['stdout']['sha256'],65536)==stdout
    assert read(binding['stderr']['path'],binding['stderr']['sha256'],65536)==stderr
    print(json.dumps(dict(qualification='V7_RETAINED_NATIVE_CAPTURE_AUDIT_AND_DECLARED_REFUSALS',
        audit=result,cases=cases,passed=len(cases),failed=0,rawCapturePreserved=True,
        nativeExecutions=0,SDK=0,SQLite=0,sockets=0,keys=0,signatures=0,nonceSearches=0,
        originalTaskOutcome='FAILURE',originalQualificationStatus='REFUSED_OR_UNKNOWN')))

if __name__=='__main__':main()
