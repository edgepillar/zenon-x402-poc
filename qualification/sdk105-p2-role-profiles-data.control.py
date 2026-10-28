"""Actual Python bundle code with declared in-memory sources; no native trial."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import sys
from types import SimpleNamespace


HERE = Path(__file__).absolute().parent


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read_source(path):
    fields = ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode', 'st_nlink',
              'st_size', 'st_mtime_ns', 'st_ctime_ns')
    token = lambda value: tuple(getattr(value, name) for name in fields)
    for at in (path, *path.parents):
        assert not at.is_symlink()
    before = path.lstat()
    assert stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
    assert before.st_nlink == 1 and before.st_size <= 262144
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        assert token(os.fstat(stream.fileno())) == token(before)
        raw = stream.read(262145)
        assert len(raw) == before.st_size and token(os.fstat(stream.fileno())) == token(before)
    assert token(path.lstat()) == token(before)
    return raw, token(before)


def load(path, expected, name):
    raw, identity = read_source(path)
    assert sha(raw) == expected
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module, (path, raw, identity)


def row(name, raw):
    return dict(path=name, bytes=len(raw), LF=raw.count(b'\n'), sha256=sha(raw),
                gitBlob=hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest())


class DeclaredSources:
    """No path in this fixture is created, opened or read from the filesystem."""
    def __init__(self, producer):
        self.producer = producer
        self.repo, self.packages = Path('/declared/p2-app'), Path('/declared/p2-packages')
        self.entries = {role: 'qualification/data-' + role + '.mjs'
                        for role in ('parent', 'funding-child', 'recovery-child')}
        self.payload = {'app/' + name: b'/* declared, never evaluated */\n'
                        for name in self.entries.values()}
        self.payload.update({'app/src/data-' + str(i) + '.js': b'/* inert */\n' for i in range(148)})
        self.payload.update({'packages/item-' + str(i) + '.js': b'/* inert */\n' for i in range(402)})
        self.payload.update({'packages/@x402/core/package.json': b'{"version":"2.23.0"}\n',
                             'packages/@noble/ed25519/package.json': b'{"version":"2.3.0"}\n'})
        self.tokens = {name: ['1', str(i + 100), '501', '20', '33152', '1',
                              str(len(raw)), '100', '100']
                       for i, (name, raw) in enumerate(sorted(self.payload.items()))}
        self.reads, self.roots, self.rechecks = [], [], []
        self.refresh()

    def refresh(self):
        self.rows = [row(name, self.payload[name]) for name in sorted(self.payload)]
        self.selected = dict(resolvedSourceRowsSha256=sha(self.producer.canonical(self.rows)),
            resolvedSourceBytes=sum(item['bytes'] for item in self.rows),
            resolvedApplicationFiles=sum(name.startswith('app/') for name in self.payload),
            packageFiles=404, packageVersions={'packages/@x402/core/package.json': '2.23.0',
                                               'packages/@noble/ed25519/package.json': '2.3.0'},
            bareBindings=[dict(parent='app/' + self.entries['funding-child'], specifier='@x402/core',
                               target='packages/@x402/core/package.json')],
            allowedBuiltins=['node:fs'])

    def read(self, path):
        text = str(path)
        if text.startswith(str(self.repo) + '/'):
            name = 'app/' + text[len(str(self.repo)) + 1:]
        else:
            assert text.startswith(str(self.packages) + '/')
            name = 'packages/' + text[len(str(self.packages)) + 1:]
        self.reads.append(name)
        return self.payload[name], self.tokens[name]

    def root(self, path):
        assert path in (str(self.repo), str(self.packages))
        self.roots.append(path)
        return path, ['1', '11' if path == str(self.repo) else '12']

    def build(self, bundle, *, mode='commit-kill-recover', kind=None, entries=None):
        return bundle.build_role_profile_bundle(
            self.repo, self.packages, SimpleNamespace(read=self.read, pin=row),
            SimpleNamespace(root=self.root, recheck_captured_files=self.rechecks.append),
            self.selected, self.rows, mode, producer=self.producer,
            kind=kind or 'SDK105_P2_COMMIT_KILL_RECOVERY_NODE24_V5',
            entries=self.entries if entries is None else entries)


def main():
    assert sys.dont_write_bytecode and len(sys.argv) == 3
    bundle, bundle_pin = load(HERE / 'sdk105_p2_role_profile_bundle.py', sys.argv[1], 'p2_bundle_under_control')
    producer, producer_pin = load(HERE / 'node_file_url_profile.py', sys.argv[2], 'canonical_producer_under_control')
    self_pin = (Path(__file__).absolute(), *read_source(Path(__file__).absolute()))
    names = []

    def check(name, function):
        function()
        names.append(name)

    def correct_bundle():
        source = DeclaredSources(producer)
        built = source.build(bundle)
        assert set(built['roleProfiles']) == set(source.entries)
        values = {}
        for role, item in built['roleProfiles'].items():
            assert sha(item['profileBytes']) == item['profileSha256'] and len(item['profileBytes']) <= 524288
            value = json.loads(item['profileBytes'])
            assert value['mode'] == 'commit-kill-recover' and value['role'] == role
            assert value['profileKind'] == 'SDK105_P2_COMMIT_KILL_RECOVERY_NODE24_V5'
            assert value['entryURL'] == 'file:///declared/p2-app/' + source.entries[role]
            assert value['sourceRowsSha256'] == source.selected['resolvedSourceRowsSha256']
            assert len(value['inputs']) == 555 and value['sourceTransform'] is False
            values[role] = {key: field for key, field in value.items() if key not in ('role', 'entryURL')}
        assert values['parent'] == values['funding-child'] == values['recovery-child']
        assert built['profileBytes'] == built['roleProfiles']['parent']['profileBytes']
    check('three coherent role profiles retain exact mode, source rows and entry binding', correct_bundle)

    def one_read_pass():
        source = DeclaredSources(producer)
        built = source.build(bundle)
        assert len(source.reads) == len(set(source.reads)) == 555
        assert sum(name.startswith('packages/') for name in source.reads) == 404
        assert sum(name.startswith('app/') for name in source.reads) == 151
        assert len(source.roots) == 2 and len(source.rechecks) == 1 and len(built['_captures']) == 557
    check('three roles use one inventory of 555 declared reads, not three physical passes', one_read_pass)

    def canonical_urls():
        source = DeclaredSources(producer)
        for item in source.build(bundle)['roleProfiles'].values():
            value = json.loads(item['profileBytes'])
            assert all('%40' not in entry['url'] for entry in value['inputs'])
            assert value['bareBindings'][0]['targetURL'] == 'file:///declared/p2-packages/@x402/core/package.json'
    check('all role views retain literal scoped-package at signs and the same bare binding', canonical_urls)

    def rejected(name, mutate, code, *, before_reads=False):
        def run():
            source = DeclaredSources(producer)
            keywords = mutate(source) or {}
            try:
                source.build(bundle, **keywords)
            except ValueError as error:
                assert str(error) == code, str(error)
            else:
                raise AssertionError('unexpected profile admission')
            if before_reads:
                assert source.reads == []
        check(name, run)
    rejected('unsupported mode refuses before a declared read', lambda source: {'mode': 'clean'},
             'EXACT_P2_BUNDLE_MODE', before_reads=True)
    rejected('unknown role refuses before a declared read',
             lambda source: {'entries': dict(source.entries, other='qualification/other.mjs')},
             'EXACT_P2_BUNDLE_ROLE_ENTRIES', before_reads=True)
    rejected('two roles cannot acquire the same entry',
             lambda source: {'entries': dict(source.entries, **{'recovery-child': source.entries['funding-child']})},
             'EXACT_P2_BUNDLE_ROLE_ENTRIES', before_reads=True)
    rejected('traversal in a role entry refuses before a declared read',
             lambda source: {'entries': dict(source.entries, parent='qualification/../other.mjs')},
             'EXACT_P2_BUNDLE_ROLE_ENTRIES', before_reads=True)
    rejected('an unrelated profile kind refuses before a declared read', lambda source: {'kind': 'UNRELATED'},
             'EXACT_P2_BUNDLE_KIND', before_reads=True)

    def remove_role(source):
        del source.payload['app/' + source.entries['funding-child']]
        source.refresh()
        source.selected['bareBindings'] = []
    rejected('a missing child entry cannot produce an incomplete role bundle', remove_role, 'EXACT_P2_ROLE_ENTRY')

    def alias(source):
        first, second = sorted(source.tokens)[:2]
        source.tokens[second] = source.tokens[first]
    rejected('physical aliases refuse before publishing role metadata', alias, 'EXACT_UNALIASED_EXISTING_INPUT')
    rejected('changed declared source bytes refuse every role',
             lambda source: source.payload.update({sorted(source.payload)[0]: b'changed'}),
             'EXACT_UNALIASED_EXISTING_INPUT')
    rejected('a source-row digest mismatch refuses before a declared read',
             lambda source: source.selected.update(resolvedSourceRowsSha256='0' * 64),
             'COMPLETE_SELECTED_SOURCE_ROWS', before_reads=True)

    def independent_views():
        source = DeclaredSources(producer)
        profiles = source.build(bundle)['roleProfiles']
        original = profiles['recovery-child']['profileBytes']
        decoded = json.loads(profiles['funding-child']['profileBytes'])
        decoded['inputs'][0]['sha256'] = '0' * 64
        assert profiles['recovery-child']['profileBytes'] == original
        assert json.loads(original)['inputs'][0]['sha256'] != '0' * 64
    check('decoded role DATA views are independent without a source copy', independent_views)
    for path, raw, identity in (bundle_pin, producer_pin, self_pin):
        assert read_source(path) == (raw, identity)
    assert len(names) == 13
    print(json.dumps(dict(event='SDK105_P2_ROLE_PROFILE_BUNDLE_DATA_CONTROLS', passed=True,
        cases=len(names), names=names, declaredInventoryRows=555, declaredApplicationRows=151,
        declaredPackageRows=404, readsPerSuccessfulBundle=555, rolesPerBundle=3,
        profileSourceSha256=sha(bundle_pin[1]), canonicalProducerSha256=sha(producer_pin[1]),
        actualInstalledPackageReads=0, SDK=0, SQLite=0, NodeCommands=0, nativeChildren=0,
        signals=0, IPC=0, keys=0, signatures=0, sockets=0, nonceSearches=0,
        fixtureFilesCreated=0, sourceOrDependencyCopies=0, nativeQualification='NOT_EXECUTED')))


if __name__ == '__main__':
    main()
