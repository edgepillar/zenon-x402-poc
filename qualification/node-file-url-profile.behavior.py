"""Pure producer controls: no Node, SDK, SQLite, key, signature or socket."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from urllib.parse import unquote,urlsplit

HERE = Path(__file__).absolute().parent


def main():
    assert len(sys.argv) == 2 and sys.dont_write_bytecode
    source = HERE/'node_file_url_profile.py';raw = source.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == sys.argv[1]
    spec = importlib.util.spec_from_file_location('node_url_producer_under_control',source)
    a = importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
    names = []
    def check(name,body):body();names.append(name)
    def vector(path,expected):
        result = a.node24_posix_file_url(path);assert result == expected
        assert unquote(urlsplit(result).path) == path
    vectors = [
        ('/src/main.mjs','file:///src/main.mjs'),
        ('/src/node_modules/@x402/core/index.mjs','file:///src/node_modules/@x402/core/index.mjs'),
        ('/src/node_modules/@noble/ed25519/index.js','file:///src/node_modules/@noble/ed25519/index.js'),
        ('/src/literal%40scope.js','file:///src/literal%2540scope.js'),
        ('/src/with space.js','file:///src/with%20space.js'),
        ('/src/what?hash#percent%.js','file:///src/what%3Fhash%23percent%25.js'),
        ("/src/!$&'()*+,:;=@.js","file:///src/!$&'()*+,:;=@.js"),
        ('/src/[caret^]pipe|tilde~.js','file:///src/%5Bcaret%5E%5Dpipe%7Ctilde%7E.js'),
        ('/src/back\\slash.js','file:///src/back%5Cslash.js'),
        ('/src/quote"less<greater>tick`brace{one}.js','file:///src/quote%22less%3Cgreater%3Etick%60brace%7Bone%7D.js'),
        ('/src/new\nline\treturn\r.js','file:///src/new%0Aline%09return%0D.js'),
        ('/src/f\u00f3\u00f3b\u00e0r.js','file:///src/f%C3%B3%C3%B3b%C3%A0r.js'),
        ('/src/\u20ac.js','file:///src/%E2%82%AC.js'),
        ('/src/\U0001f680.js','file:///src/%F0%9F%9A%80.js'),
    ]
    for number,(path,expected)in enumerate(vectors):
        check('canonical-URL-vector-'+str(number+1),lambda path=path,expected=expected:vector(path,expected))
    for number,bad in enumerate(['relative.js','file:///src/a.js','//host/a.js','/src/../a.js','/src//a.js',
        '/src/./a.js','/src/a/','/src/\0.js','/src/\ud800.js',b'/src/a.js']):
        def reject(bad=bad):
            try:a.node24_posix_file_url(bad)
            except (ValueError,TypeError):return
            raise AssertionError('unsupported path admitted')
        check('unsupported-source-path-'+str(number+1),reject)

    repo,packages = Path('/model/app'),Path('/model/node_modules')
    payload = {'app/entry.mjs':b'/* declared inert bytes */\n'}
    payload.update({'packages/item-'+str(n)+'.js':b'/* inert */\n'for n in range(402)})
    payload.update({'packages/@noble/ed25519/package.json':b'{"version":"2.3.0"}\n',
        'packages/@x402/core/package.json':b'{"version":"2.23.0"}\n'})
    def pin(name,raw):return dict(path=name,bytes=len(raw),LF=raw.count(b'\n'),sha256=hashlib.sha256(raw).hexdigest())
    rows = [pin(name,payload[name])for name in sorted(payload)]
    selected = dict(resolvedSourceRowsSha256=hashlib.sha256(a.canonical(rows)).hexdigest(),
        resolvedSourceBytes=sum(row['bytes']for row in rows),resolvedApplicationFiles=1,packageFiles=404,
        packageVersions={'packages/@noble/ed25519/package.json':'2.3.0','packages/@x402/core/package.json':'2.23.0'},
        bareBindings=[dict(parent='app/entry.mjs',specifier='@x402/core',target='packages/@x402/core/package.json')],
        allowedBuiltins=['node:fs'])
    indexed = {str(repo/name[4:]if name.startswith('app/')else packages/name[9:]):name for name in payload}
    tokens = {name:[str(1),str(n+100),str(501),str(20),str(33152),str(1),str(len(payload[name])),str(100),str(100)]
        for n,name in enumerate(sorted(payload))}
    observations = []
    def read(path):name=indexed[str(path)];return payload[name],tokens[name]
    old = SimpleNamespace(read=read,pin=pin)
    identity_profile = SimpleNamespace(root=lambda path:(path,[str(1),str(1 if path==str(repo)else 2)]),
        recheck_captured_files=lambda captures:observations.append(captures))
    def build(value=selected,source_rows=rows):
        return a.build_profile(repo,packages,old,identity_profile,value,source_rows,'clean',kind='DECLARED_DATA_ONLY',
            entry='entry.mjs',allowed_modes=['clean'])
    def complete_profile():
        built=build();x=json.loads(built['profileBytes'])
        assert len(x['inputs'])==405 and len(observations)==1
        assert all(a.node24_posix_file_url(unquote(urlsplit(row['url']).path))==row['url']for row in x['inputs'])
        assert next(row['url']for row in x['inputs']if '@x402'in row['logicalPath'])=='file:///model/node_modules/@x402/core/package.json'
        assert x['bareBindings'][0]['targetURL']=='file:///model/node_modules/@x402/core/package.json'
        assert built['profileSha256']==hashlib.sha256(built['profileBytes']).hexdigest()
    check('fresh-profile-has-canonical-input-entry-and-binding-URLs',complete_profile)
    def rejected_profile(name,mutate,code):
        value=copy.deepcopy(selected);source_rows=copy.deepcopy(rows);mutate(value,source_rows)
        try:build(value,source_rows)
        except ValueError as error:assert str(error)==code;return
        raise AssertionError(name+' was admitted')
    check('source-digest-drift-refuses',lambda:rejected_profile('digest',lambda s,r:s.update(resolvedSourceRowsSha256='0'*64),'COMPLETE_SELECTED_SOURCE_ROWS'))
    check('missing-package-row-refuses',lambda:rejected_profile('row',lambda s,r:r.pop(),'COMPLETE_SELECTED_SOURCE_ROWS'))
    check('wrong-installed-version-refuses',lambda:rejected_profile('version',lambda s,r:s['packageVersions'].update({'packages/@x402/core/package.json':'0.0.0'}),'EXACT_EXISTING_PACKAGE_VERSIONS'))
    check('unknown-binding-target-refuses',lambda:rejected_profile('target',lambda s,r:s['bareBindings'][0].update(target='packages/missing.js'),'EXACT_DISTINCT_BARE_EDGE'))
    check('duplicate-binding-refuses',lambda:rejected_profile('duplicate',lambda s,r:s['bareBindings'].append(copy.deepcopy(s['bareBindings'][0])),'EXACT_DISTINCT_BARE_EDGE'))
    check('wrong-file-count-refuses',lambda:rejected_profile('count',lambda s,r:s.update(packageFiles=403),'COMPLETE_APPLICATION_AND_PACKAGE_INPUTS'))
    def alias():
        first,second=sorted(tokens)[:2];before=tokens[second];tokens[second]=tokens[first]
        try:
            try:build()
            except ValueError as error:assert str(error)=='EXACT_UNALIASED_EXISTING_INPUT';return
            raise AssertionError('physical alias admitted')
        finally:tokens[second]=before
    check('physical-source-alias-refuses',alias)
    assert hashlib.sha256(source.read_bytes()).hexdigest()==sys.argv[1]
    print(json.dumps(dict(event='NODE24_POSIX_FILE_URL_PROFILE_PURE_CONTROLS',passed=True,cases=len(names),names=names,
        sourceSha256=sys.argv[1],NodeCommands=0,applicationExecutions=0,SDK=0,SQLite=0,keys=0,signatures=0,sockets=0,
        nonceSearches=0,fixtureFilesCreated=0,crossLanguageRuntimeParity='NOT_EXECUTED')))


if __name__=='__main__':main()
