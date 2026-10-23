"""Version 2 read-only profile constructor for the same six V3 joined-close cases.

Uses only the Python standard library. Never imports SDK/application modules,
writes a file, opens SQLite, creates a task, starts a child or performs network
I/O. Caller must separately verify the expanded public manifest/source parent,
runtime/namespace/launcher, mounted manager/capacity and direct six-case V3 joined-close scope.
The returned private bytes contain local paths/identities: do not publish them.
This is a cooperative source planner, not execution or authorization evidence.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from urllib.parse import quote

KIND = "ZENON_DP_ORIGINAL_FUNDING_V3_SIX_CLOSE_CASE_NODE24"
ENTRY = "app/qualification/dynamic-plasma-original-funding-v3-close-native.selection-v2.draft.mjs"
HELPER = "app/qualification/dynamic-plasma-original-funding-submission-v2.fixture.draft.mjs"
LOADER = "app/qualification/dynamic-plasma-original-funding-v3-close-native.preload-v2.draft.mjs"
FIXED = {
    "app/qualification/dynamic-plasma-original-funding-v3-close-native.selection-v2.draft.mjs": "acc146835913e1eacbfb617373a0b4b06f5d5055c3d9425527872ed901c0bfe4",
    "app/qualification/dynamic-plasma-original-funding-v3-close-native.behavior-v2.draft.mjs": "0748a1ec7c27e980a08049f4f08fa7ef33f1812b9c736fd1a210dbe0ac4df716",
    "app/qualification/dynamic-plasma-original-funding-submission-v2.fixture.draft.mjs": "592bfcfc92054ef120803ad4a60f124b580c3d424cd3345f807ae7e9f46c46eb",
    "app/src/zenon/dynamic-plasma-original-funding-preparation.js": "0e1eb8bb94ecd4da8d4dc8f9b384510e8c2764601ba22e228126ba9ed01368c6",
    "app/src/zenon/dynamic-plasma-original-funding-submission.js": "6929369231bba5cc7d34679ee1eda0ac43977c7ed78ebd00944f3d2c3d90d677",
    "app/src/zenon/dynamic-plasma-original-funding-read-close.js": "5086567b2c0cce0fc3419db69641beb7e5e434d47f83e17015682964ad482a45",
    "app/src/zenon/dynamic-plasma-retained-read-session-core.js": "a0f91046c47cfa770f30bf299f620086351ee15977f669d9ec6016dd08d65794",
    "app/src/zenon/dynamic-plasma-retained-account-exchange-gate.js": "3304fee96333a0544c9ad3be0c5d465ff6d2377ae3ae657ac11f84482bb357f9",
    "app/src/zenon/bounded-json-rpc-read-admission.js": "0b0b0806487c2e648a83367a9ebcd48a3a92493158ebca23abe8d6d6849d9ff3",
    "app/src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js": "bea9e00aa6208f776561c975d54640dfb676168dd4d0b44d125c9dc684912c4a"
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
    raise ValueError("X402_V3_SIX_CLOSE_CASE_PROFILE_PLAN_REJECTED")


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


def build_v3_six_close_case_profile(application_root, package_root, application_inputs,
                            package_inputs, allowed_builtins):
    """Return profile object/bytes/digests in memory; perform no admission/run."""
    app, app_id = _root(application_root)
    packages, package_id = _root(package_root)
    if (type(application_inputs) is not list or len(application_inputs) != 57
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
    if (len(inputs) != 439 or LOADER not in by_name or versions != VERSIONS
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
