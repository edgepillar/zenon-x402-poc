"""Fresh Node 24.19 POSIX source profiles; no source or package evaluation.

The producer uses Node's canonical file URL spelling for legal, normalized
absolute POSIX source paths. In particular, scoped-package '@' is literal.
Escaping is based on the versioned public Node pathToFileURL implementation,
not a relaxation of the consumer's canonical-URL check. NUL, surrogate text,
relative paths, double-root spelling and implicit path normalization refuse.
"""
import hashlib
import json
import os
import posixpath
from urllib.parse import quote_from_bytes


def require(value, code):
    if not value:raise ValueError(code)


def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode('ascii')


def node24_posix_file_url(path):
    raw = os.fspath(path)
    require(type(raw) is str and raw.startswith('/') and not raw.startswith('//')
        and '\0' not in raw and posixpath.normpath(raw) == raw,'CANONICAL_POSIX_SOURCE_PATH')
    try:encoded = raw.encode('utf8','strict')
    except UnicodeEncodeError:raise ValueError('UTF8_POSIX_SOURCE_PATH')from None
    # Node v24.19 additionally escapes '~'. urllib always leaves it unescaped,
    # regardless of safe=, so encode that literal after quoting the raw path.
    return 'file://'+quote_from_bytes(encoded,safe="/!$&'()*+,-.:;=@_").replace('~','%7E')


def build_profile(repo,packages,old,identity_profile,selected,rows,mode,*,kind,entry,allowed_modes):
    require(mode in allowed_modes,'EXACT_SELECTED_MODE')
    require(type(rows) is list and len(rows) <= 1024 and rows == sorted(rows,key=lambda row:row['path'])
        and len({row['path']for row in rows}) == len(rows),'CLOSED_SORTED_SOURCE_ROWS')
    require(hashlib.sha256(canonical(rows)).hexdigest() == selected['resolvedSourceRowsSha256']
        and sum(row['bytes']for row in rows) == selected['resolvedSourceBytes'] <= 6291456,
        'COMPLETE_SELECTED_SOURCE_ROWS')
    _,app_id = identity_profile.root(str(repo));_,package_id = identity_profile.root(str(packages))
    require(app_id[:2] != package_id[:2],'INDEPENDENT_EXISTING_SOURCE_ROOTS')
    captures = [(str(repo),tuple(app_id)),(str(packages),tuple(package_id))]
    inputs,indexed,physical,versions = [],{},set(),{}
    for row in rows:
        name = row['path']
        require(name.startswith(('app/','packages/')) and all(part not in ('','.','..')for part in name.split('/')),
            'CLOSED_LOGICAL_SOURCE_PATH')
        path = repo/name[4:]if name.startswith('app/')else packages/name[9:]
        raw,identity = old.read(path)
        require(old.pin(name,raw) == row and tuple(identity[:2]) not in physical,'EXACT_UNALIASED_EXISTING_INPUT')
        physical.add(tuple(identity[:2]));captures.append((str(path),tuple(identity)))
        value = dict(logicalPath=name,url=node24_posix_file_url(path),bytes=len(raw),sha256=row['sha256'],identity=identity)
        inputs.append(value);indexed[name] = value
        if name in selected['packageVersions']:versions[name] = json.loads(raw)['version']
    require(sum(row['logicalPath'].startswith('app/')for row in inputs) == selected['resolvedApplicationFiles']
        and sum(row['logicalPath'].startswith('packages/')for row in inputs) == selected['packageFiles'] == 404,
        'COMPLETE_APPLICATION_AND_PACKAGE_INPUTS')
    require(versions == selected['packageVersions'],'EXACT_EXISTING_PACKAGE_VERSIONS')
    require('app/'+entry in indexed,'EXACT_ENTRY_INPUT')
    bindings = [];edges = set()
    for edge in selected['bareBindings']:
        key = edge['parent'],edge['specifier']
        require(key not in edges and edge['parent']in indexed and edge['target']in indexed,'EXACT_DISTINCT_BARE_EDGE')
        edges.add(key);bindings.append(dict(parentURL=indexed[edge['parent']]['url'],specifier=edge['specifier'],
            targetURL=indexed[edge['target']]['url']))
    value = dict(profileVersion=1,profileKind=kind,runtime=dict(node='24.19.0',platform='darwin',arch='arm64'),
        mode=mode,entryURL=indexed['app/'+entry]['url'],inputs=inputs,bareBindings=bindings,
        allowedBuiltins=selected['allowedBuiltins'],sourceRowsSha256=selected['resolvedSourceRowsSha256'],
        sourceTransform=False,ordinaryInstalledNamespace=False)
    raw = canonical(value)+b'\n';require(len(raw) <= 524288,'BOUNDED_CURRENT_PRIVATE_PROFILE')
    identity_profile.recheck_captured_files(tuple(captures))
    return dict(profileBytes=raw,profileSha256=hashlib.sha256(raw).hexdigest(),_captures=tuple(captures))


def build_role_profiles(common,*,kind,mode,entries):
    require(mode == 'commit-kill-recover' and set(entries) == {'parent','funding-child','recovery-child'},'EXACT_P2_ROLES')
    value = json.loads(common['profileBytes']);indexed = {row['logicalPath']:row for row in value['inputs']}
    profiles = {}
    for role,entry in entries.items():
        require('app/'+entry in indexed,'EXACT_P2_ROLE_ENTRY')
        selected = dict(value,profileKind=kind,mode=mode,role=role,entryURL=indexed['app/'+entry]['url'])
        raw = canonical(selected)+b'\n';require(len(raw) <= 524288,'BOUNDED_P2_ROLE_PROFILE')
        profiles[role] = dict(profileBytes=raw,profileSha256=hashlib.sha256(raw).hexdigest())
    return dict(profiles['parent'],roleProfiles=profiles,_captures=common['_captures'])
