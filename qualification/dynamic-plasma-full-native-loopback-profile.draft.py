"""Read-only private profile constructor for the full native loopback draft.

Standard library only; no application/package execution, tasks, child process,
SQL, keys, signing, nonce search or network. Public source rows are separate
from these private local file URLs and identities. A profile is not authority.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from urllib.parse import quote

KIND = "ZENON_DP_FULL_NATIVE_LOOPBACK_THREE_CASE_NODE24"
ENTRY = "app/qualification/dynamic-plasma-full-native-loopback.selection.draft.mjs"
HELPER = "app/qualification/dynamic-plasma-full-native-loopback.fixture.draft.mjs"
LOADER = "app/qualification/dynamic-plasma-full-native-loopback.preload.draft.mjs"
FIXED = {
    "app/qualification/dynamic-plasma-full-native-loopback.behavior.draft.mjs": "5cfba4dbee41c508bfa074753e9ede5572b932caa742c5d711e260df8de8dff3",
    "app/qualification/dynamic-plasma-full-native-loopback.fixture.draft.mjs": "f28e3d782ab7c56b80e6f1e483c639b5b93f07559ff8bf8da07708439e3f1ab3",
    "app/qualification/dynamic-plasma-full-native-loopback.selection.draft.mjs": "faca4303ed279a1dbfc8267311c477f10a1c0054efd66e297a4b5120c2cd4e26",
    "app/src/service-credit-funding-post-native-https-transport.js": "3b3fec921b46c62ed7557043f99cffb2e1a12f515bf4e607ea8f61525db28b7c",
    "app/src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js": "d62450b462a5412c35dfa474cbf7cac1e5aad88ecd6fc04106e36a67f8459a80",
    "app/src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js": "bea9e00aa6208f776561c975d54640dfb676168dd4d0b44d125c9dc684912c4a",
    "app/src/zenon/bounded-json-rpc-https-exchange-owner.js": "2c501f3353d55e31d4baedcb068e2bac5943ca7e3e4171521a3bb0ee8a0a8bdb",
    "app/src/zenon/dynamic-plasma-bounded-material-exchange.js": "6773c946991834dfe3b01943bdb9bad7513ef0cbbb15b31e607b095bab42b28b",
    "app/src/zenon/dynamic-plasma-native-funding-close-session.js": "642ba6edf4983818145b973116638e63f15eaa0fcc4fe342052d927a096d2bc7",
    "app/src/zenon/dynamic-plasma-native-https-original-funding-submission.js": "813ee2aa8488f788025d9ee2704e4a207dfd6dc2e34cbf5c827988d1908ae8d6",
    "app/src/zenon/dynamic-plasma-original-funding-bounded-read-close.js": "69fe92b9460aba5f5ecb671a4befe059f0686f4ca2e50ffeaf468e25893f0f9c",
    "app/src/zenon/dynamic-plasma-original-funding-preparation.js": "0e1eb8bb94ecd4da8d4dc8f9b384510e8c2764601ba22e228126ba9ed01368c6",
    "app/src/zenon/dynamic-plasma-original-funding-submission.js": "666551930bcf481d136c773de12d00228822c0f2a810d5c92aafa401acf80c68",
    "app/src/zenon/dynamic-plasma-retained-https-read-owners.js": "48ed2db2e36a12a93c106d76315f376a56f186cbf591ac544cb02c51f203c64d",
    "app/src/zenon/dynamic-plasma-retained-https-read-session.js": "791d2c74a81a18d4e3b4478d9ca569db1ec971f5c1e0540ddac02eb3a79938b7",
    "app/src/zenon/dynamic-plasma-user-send-nonce-search.js": "8eda71acf12265b65015ad6db20c1c7b357b207874c8e4c8b72e2889bf86f318"
}
TARGETS = {
    "@noble/ed25519": "packages/@noble/ed25519/index.js",
    "@noble/hashes/sha2": "packages/@noble/hashes/esm/sha2.js",
    "znn-typescript-sdk": "packages/znn-typescript-sdk/dist/index.js",
}
VERSIONS = {
    "packages/znn-typescript-sdk/package.json": "1.0.5",
    "packages/@noble/ed25519/package.json": "2.3.0",
    "packages/@noble/hashes/package.json": "1.8.0",
}
FIELDS = {"path", "bytes", "LF", "sha256", "gitBlob"}


def _reject():
    raise ValueError("X402_FULL_NATIVE_LOOPBACK_PROFILE_PLAN_REJECTED")


def _identity(s):
    return [str(v) for v in (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
                            s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)]


def _no_links(path):
    for candidate in (path, *path.parents):
        if stat.S_ISLNK(os.lstat(candidate).st_mode):
            _reject()


def _root(value):
    if type(value) is not str or not os.path.isabs(value) or os.path.normpath(value) != value:
        _reject()
    path = Path(value)
    _no_links(path)
    s = os.lstat(path)
    if not stat.S_ISDIR(s.st_mode) or s.st_uid != os.getuid():
        _reject()
    return path, _identity(s)


def _url(path):
    text = str(path)
    # Deliberately narrow current POSIX-path alphabet, not a general URL codec.
    # Native Node pathToFileURL leaves @ in scoped package path components.
    # Path.as_uri() percent-encodes @; weakening the loader's canonical check
    # would hide that difference. Keep this constructor versioned instead.
    if not re.fullmatch(r"/[A-Za-z0-9@._ /-]+", text):
        _reject()
    return "file://" + quote(text, safe="/@")


def _capture(path):
    _no_links(path)
    s = os.lstat(path)
    before = _identity(s)
    if (not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid()
            or s.st_nlink != 1 or not 0 <= s.st_size <= 1048576):
        _reject()
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        if _identity(os.fstat(stream.fileno())) != before:
            _reject()
        raw = stream.read(1048577)
        if len(raw) != s.st_size or _identity(os.fstat(stream.fileno())) != before:
            _reject()
    if _identity(os.lstat(path)) != before:
        _reject()
    return raw, before


def build_full_native_loopback_profile(application_root, package_root, application_inputs,
                            package_inputs, allowed_builtins):
    """Return profile object/bytes/digests in memory; perform no admission/run."""
    app, app_id = _root(application_root)
    packages, package_id = _root(package_root)
    if (type(application_inputs) is not list or len(application_inputs) != 74
            or type(package_inputs) is not list or len(package_inputs) != 382
            or type(allowed_builtins) is not list or len(allowed_builtins) > 48):
        _reject()
    public = sorted(application_inputs + package_inputs, key=lambda row: row.get("path", ""))
    by_name = {}
    inputs = []
    total = 0
    versions = {}
    for row in public:
        if type(row) is not dict or set(row) != FIELDS:
            _reject()
        name = row["path"]
        if (type(name) is not str or name in by_name or len(name) > 512
                or not re.fullmatch(r"(?:app|packages)/[A-Za-z0-9@._/-]+", name)
                or any(part in ("", ".", "..") for part in name.split("/"))
                or type(row["bytes"]) is not int or not 0 <= row["bytes"] <= 1048576
                or type(row["LF"]) is not int or not 0 <= row["LF"] <= row["bytes"]
                or type(row["sha256"]) is not str or not re.fullmatch(r"[0-9a-f]{64}", row["sha256"])
                or type(row["gitBlob"]) is not str or not re.fullmatch(r"[0-9a-f]{40}", row["gitBlob"])):
            _reject()
        path = (app / name[4:]) if name.startswith("app/") else (packages / name[9:])
        raw, identity = _capture(path)
        if (len(raw) != row["bytes"] or raw.count(b"\n") != row["LF"]
                or hashlib.sha256(raw).hexdigest() != row["sha256"]
                or hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest() != row["gitBlob"]):
            _reject()
        total += len(raw)
        if total > 4194304:
            _reject()
        item = {"logicalPath": name, "url": _url(path), "bytes": len(raw),
                "sha256": row["sha256"], "identity": identity}
        inputs.append(item)
        by_name[name] = item
        if name in VERSIONS:
            versions[name] = json.loads(raw).get("version")
    if (len(inputs) != 456 or LOADER not in by_name or versions != VERSIONS
            or any(by_name.get(name, {}).get("sha256") != digest for name, digest in FIXED.items())):
        _reject()
    builtins = sorted(set(allowed_builtins))
    if len(builtins) != len(allowed_builtins) or any(
            type(name) is not str or not re.fullmatch(r"node:[A-Za-z0-9_/-]+", name)
            for name in builtins):
        _reject()
    bindings = []
    for caller in (HELPER, "app/src/zenon-payment.js"):
        for specifier, target in TARGETS.items():
            if caller == HELPER and specifier == "znn-typescript-sdk":
                continue
            if caller not in by_name or target not in by_name:
                _reject()
            bindings.append({"parentURL": by_name[caller]["url"], "specifier": specifier,
                             "targetURL": by_name[target]["url"]})
    seal = hashlib.sha256(json.dumps(public, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    profile = {"profileVersion": 2, "profileKind": KIND,
               "runtime": {"node": "24.19.0", "platform": "darwin", "arch": "arm64"},
               "entryURL": by_name[ENTRY]["url"], "inputs": inputs, "bareBindings": bindings,
               "allowedBuiltins": builtins, "sourceRowsSha256": seal,
               "sourceTransform": False, "ordinaryInstalledNamespace": False}
    raw = json.dumps(profile, sort_keys=True, separators=(",", ":")).encode() + b"\n"
    if len(raw) > 262144 or _identity(os.lstat(app)) != app_id or _identity(os.lstat(packages)) != package_id:
        _reject()
    return {"profile": profile, "profileBytes": raw, "profileSha256": hashlib.sha256(raw).hexdigest(),
            "sourceRowsSha256": seal, "sourceBytes": total}
