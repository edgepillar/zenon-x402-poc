"""Read-only lexical API-surface gate for the selected P1 native fixture.

No JavaScript parse/import, Node, SDK, SQL, socket, key or signature operation.
This intentionally narrow gate detects direct named receiver/export mismatches.
It is NOT a general JS parser, dependency qualification or runtime behavior test.
A format/receiver outside the reviewed finite shape is refused, not guessed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat

ENTRY = re.compile(r"qualification/p1-native-v6-two-sqlite-once[.]behavior(?:-v[234])?[.]draft[.]mjs")
BACKEND = "src/service-credit-sqlite-store.js"
PAYER = "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js"
CLIENT = "src/x402-official-v6-original-payment-client.js"
TRANSPORT = "src/service-credit-native-https-client-transport.js"
APP = "src/x402-official-service-credit-https-application.js"


def identity(s):
    return tuple(getattr(s, k) for k in ("st_dev", "st_ino", "st_uid", "st_gid",
                 "st_mode", "st_nlink", "st_size", "st_mtime_ns", "st_ctime_ns"))


def checked_read(repo, name):
    path = repo / name
    if not path.is_absolute() or ".." in Path(name).parts:
        raise ValueError("SOURCE_PATH")
    for item in [path, *path.parents]:
        if item.is_symlink():
            raise ValueError("SOURCE_LINK")
    before = path.lstat()
    if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1
            or before.st_uid != os.getuid() or not 0 < before.st_size <= 262144):
        raise ValueError("SOURCE_FILE")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        if identity(os.fstat(stream.fileno())) != identity(before):
            raise ValueError("SOURCE_OPEN_ID")
        raw = stream.read(262145)
        if identity(os.fstat(stream.fileno())) != identity(before):
            raise ValueError("SOURCE_READ_ID")
    if len(raw) != before.st_size or identity(path.lstat()) != identity(before):
        raise ValueError("SOURCE_AFTER_ID")
    return raw


def public_pin(name, raw):
    return {"path": name, "bytes": len(raw), "LF": raw.count(b"\n"),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "gitBlob": hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()}


def class_methods(text, name):
    anchor = "export class " + name + " {"
    if text.count(anchor) != 1:
        raise ValueError("CLASS_ANCHOR")
    body = text.split(anchor, 1)[1].split("\n}\n", 1)[0]
    static = set(re.findall(r"^  static ([A-Za-z_$][\w$]*)\(", body, re.M))
    methods = set(re.findall(r"^  ([A-Za-z_$][\w$]*)\(", body, re.M)) - {"constructor"}
    if not static and not methods:
        raise ValueError("CLASS_SURFACE")
    return static, methods


def fixed_surface(text, shape):
    if shape == "client":
        anchor = "  return FREEZE({\n    restoreOriginalPayment, submitOriginal,"
        if text.count(anchor) != 1:
            raise ValueError("CLIENT_RETURN")
        body = text.split(anchor, 1)[1].split("\n  });", 1)[0]
        keys = {"restoreOriginalPayment", "submitOriginal"}
        for head, tail in re.findall(r"^    ([A-Za-z_$][\w$]*)([^\n]*)", body, re.M):
            keys.add(head)
            if ":" not in tail:
                keys.update(re.findall(r"\b([A-Za-z_$][\w$]*)\b", tail))
        expected = {"restoreOriginalPayment", "submitOriginal", "readOriginal",
                    "readOriginalRecoveryState", "readOriginalRecoveryKeys",
                    "readOriginalPaymentCheckpoint", "snapshot", "close"}
        if keys != expected:
            raise ValueError("CLIENT_REVIEWED_SURFACE_CHANGED")
        return keys
    literal, keys = (
        ("  return FREEZE({ requestImpl, close, snapshot });", {"requestImpl", "close", "snapshot"})
        if shape == "transport" else
        ("  return FREEZE({ start: INGRESS.start, close: INGRESS.close, snapshot });",
         {"start", "close", "snapshot"}))
    if text.count(literal) != 1:
        raise ValueError("FACTORY_RETURN_CHANGED")
    return keys


def analyze(entry, sources):
    backend_static, backend_instance = class_methods(sources[BACKEND], "ServiceCreditSqliteStore")
    _, payer_instance = class_methods(sources[PAYER], "ZenonFundingPayerRecoverySqliteStore")
    client = fixed_surface(sources[CLIENT], "client")
    surfaces = {
        "Backend": (BACKEND, backend_static), "f.backend": (BACKEND, backend_instance),
        "f.raw": (PAYER, payer_instance), "f.client": (CLIENT, client), "client": (CLIENT, client),
        "f.native": (TRANSPORT, fixed_surface(sources[TRANSPORT], "transport")),
        "f.app": (APP, fixed_surface(sources[APP], "app")),
    }
    calls, missing, unsupported = [], [], []
    for receiver, (source, methods) in surfaces.items():
        prefix = r"(?<![\w$.])" + re.escape(receiver)
        for match in re.finditer(prefix + r"[.]([A-Za-z_$][\w$]*)\s*\(", entry):
            method = match.group(1)
            row = {"receiver": receiver, "method": method, "source": source,
                   "line": entry.count("\n", 0, match.start()) + 1, "found": method in methods}
            calls.append(row)
            if not row["found"]:
                missing.append(receiver + "." + method)
        if re.search(prefix + r"\s*\[", entry):
            unsupported.append(receiver + ":computed_member")
    # Fixed fixture alias: closeClient captures this exact actual client.
    if entry.count("const client = f.client, closing = client.close();") != 1:
        unsupported.append("client:unreviewed_alias")
    exports = []
    pattern = r"const\s*\{([^{}]+)\}\s*=\s*await import\((['\"])([.][.]/src/[^'\"]+)\2\);"
    for match in re.finditer(pattern, entry):
        name = "src/" + match.group(3)[len("../src/"):]
        if name not in sources:
            unsupported.append("unreviewed_import:" + name)
            continue
        declared = set(re.findall(r"^export (?:async )?(?:function|class) ([A-Za-z_$][\w$]*)",
                                  sources[name], re.M))
        for item in match.group(1).split(","):
            parts = item.strip().split(":")
            if not item.strip():
                continue
            export, alias = parts[0].strip(), parts[-1].strip()
            found = export in declared
            exports.append({"source": name, "export": export, "alias": alias, "found": found})
            if not found:
                missing.append(name + ":" + export)
    if len(calls) < 35 or len(calls) > 160 or len(exports) < 10 or len(exports) > 30:
        unsupported.append("unreviewed_call_or_export_count")
    return {"status": "SOURCE_API_SURFACE_MATCH_ONLY" if not missing and not unsupported
            else "SOURCE_API_SURFACE_MISMATCH", "directCalls": calls, "namedExports": exports,
            "missing": sorted(set(missing)), "unsupported": sorted(set(unsupported)),
            "limits": "Lexical named calls/exports and fixed returned surfaces only. Not JS parse, execution, argument/return behavior, schema compatibility or native qualification."}


def load_sources(repo, entry_name):
    names = {BACKEND, PAYER, CLIENT, TRANSPORT, APP}
    raw = checked_read(repo, entry_name)
    for path in re.findall(rb"await import\(['\"]([.][.]/src/[^'\"]+)['\"]\)", raw):
        names.add("src/" + path.decode()[len("../src/"):])
    data = {entry_name: raw}
    for name in sorted(names):
        data[name] = checked_read(repo, name)
    if sum(map(len, data.values())) > 2 * 1048576:
        raise ValueError("TOTAL_SOURCE_CAP")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", required=True)
    args = parser.parse_args()
    if not ENTRY.fullmatch(args.entry):
        raise ValueError("ENTRY")
    repo = Path(__file__).absolute().parent.parent
    raws = load_sources(repo, args.entry)
    text = {name: raw.decode("utf-8") for name, raw in raws.items()}
    result = analyze(text[args.entry], text)
    result.update({"entry": args.entry, "sourceGraph": [public_pin(n, b) for n, b in sorted(raws.items())],
                   "JavaScriptParsed": False, "JavaScriptImported": False,
                   "NodeCommands": 0, "SQLiteConnections": 0, "sockets": 0, "signatures": 0,
                   "newScratch": 0, "newTasks": 0})
    for name, raw in raws.items():
        if checked_read(repo, name) != raw:
            raise ValueError("SOURCE_DRIFT")
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "SOURCE_API_SURFACE_MATCH_ONLY" else 1


if __name__ == "__main__":
    raise SystemExit(main())

