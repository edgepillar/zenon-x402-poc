"""Pure data checks for one current funding-TLS selection; no execution authority.

No manager, filesystem, process, TLS, key generation, SQL or SDK side effect.
PEM splitting checks bounded framing/base64 only, not DER or cryptography.
"""
import base64
import hashlib
import json
import posixpath
import re

MANIFEST = "qualification/funding-post-native-loopback-tls-current.inputs.json"
ENTRY = "qualification/funding-post-native-loopback-tls-current.selection.draft.mjs"
BODY = "qualification/funding-post-native-loopback-tls-current.behavior.draft.mjs"
POLICY = "qualification/funding-post-native-loopback-tls-current.storage-policy.json"
GATE = "qualification/funding_tls_current_gate.py"
LAUNCHER = "qualification/run-funding-post-native-loopback-tls-current.local.py"
LEGACY = "qualification/run-funding-post-native-loopback-tls.local.py"
APPLICATION = ("src/service-credit-funding-post-native-https-transport.js",
    "src/service-credit-funding-post-native-response.js", "src/service-credit-native-client-close-owner.js",
    "src/service-credit-funding-post-readable-flow.js")
INPUT_NAMES = ("package.json", *APPLICATION, ENTRY, BODY, POLICY, GATE, LAUNCHER, LEGACY)
BUILTINS = frozenset(("node:assert/strict", "node:buffer", "node:events", "node:https", "node:http",
    "node:net", "node:util", "node:path", "node:fs", "node:timers/promises", "node:test", "node:stream"))
IMPORT = re.compile(r"(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['\"]([^'\"]+)['\"]")


def require(value, code):
    if not value:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def ceiling():
    return dict(selectedCases=4, maximumRuns=1, opensslCommandsPerRun=1, nodeCommandsPerRun=1,
        nodeChildren=0, loopbackConnectionsPerRun=8, taskQuotaBytes=4194304, SDK=False,
        SQLite=False, nonce=False, paymentSigning=False, fullDpGraph=False,
        externalNetwork=False, nativeOsNetworkSandbox=False)


def policy():
    return dict(min_free_bytes=10737418240, safety_margin_bytes=1073741824,
        task_quota_bytes=4194304, scratch_quota_bytes=4194304, store_quota_bytes=4194304,
        metadata_quota_bytes=4194304, max_tasks=1, max_objects=128,
        max_commands_per_task=2, max_output_bytes=65536, abandoned_after_seconds=86400,
        unreferenced_after_seconds=1209600)


def pin(name, raw):
    require(type(raw) is bytes and len(raw) <= 262144, "SOURCE_SIZE_OR_TYPE")
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"), sha256=hashlib.sha256(raw).hexdigest(),
        gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())


def validate_manifest(manifest, sources):
    require(type(manifest) is dict and set(manifest) == {"kind", "inputs", "sourceRowsSha256",
        "imports", "effectsCeiling"}, "MANIFEST_FIELDS")
    require(manifest["kind"] == "ONE_CURRENT_FUNDING_TLS_SOURCE_SELECTION_NOT_A_RESULT", "MANIFEST_KIND")
    require(type(sources) is dict and tuple(sources) == INPUT_NAMES, "EXACT_SOURCE_SET")
    rows = [pin(name, sources[name]) for name in INPUT_NAMES]
    require(canonical(manifest["inputs"]) == canonical(rows), "SOURCE_PIN")
    require(hashlib.sha256(canonical(rows)).hexdigest() == manifest["sourceRowsSha256"], "SOURCE_ROWS_DIGEST")
    require(canonical(manifest["effectsCeiling"]) == canonical(ceiling()), "EXACT_ONE_ATTEMPT_SCOPE")
    require(canonical(json.loads(sources[POLICY])) == canonical(policy()), "EXACT_STORE_POLICY")
    require(json.loads(sources["package.json"])["type"] == "module", "ESM_PACKAGE")
    observed = {}
    for name in (*APPLICATION, ENTRY, BODY):
        source = sources[name].decode("ascii")
        edges = IMPORT.findall(source)
        # Conservative lexical admission for these exact reviewed files, not a
        # general JS parser. Computed/unaccounted import tokens cannot pass.
        require(len(edges) == len(re.findall(r"\bimport\b", source)), "NON_LITERAL_IMPORT_OUTSIDE_SELECTION")
        observed[name] = edges
        for edge in edges:
            if edge.startswith("node:"):
                require(edge in BUILTINS, "BUILTIN_OUTSIDE_SELECTION")
            else:
                require(edge.startswith("./") or edge.startswith("../"), "PACKAGE_OUTSIDE_SELECTION")
                target = posixpath.normpath(posixpath.join(posixpath.dirname(name), edge))
                require(target in (*APPLICATION, BODY), "IMPORT_OUTSIDE_SELECTION")
    require(canonical(manifest["imports"]) == canonical(observed), "OBSERVED_IMPORT_GRAPH")
    return dict(sourceInputs=len(rows), productionModules=len(APPLICATION), selectedCases=4,
        maximumRuns=1, effectsExecuted=False, authority="NONE")


def split_test_tls_stdout(raw):
    require(type(raw) is bytes and 0 < len(raw) <= 16384 and b"\r" not in raw, "TLS_PEM_CAPTURE_BOUND")
    lines = raw.splitlines(keepends=True)
    result, index = {}, 0
    labels = {b"PRIVATE KEY": "tls-key.pem", b"RSA PRIVATE KEY": "tls-key.pem", b"CERTIFICATE": "tls-cert.pem"}
    while index < len(lines):
        if lines[index] == b"\n":
            index += 1
            continue
        start = index
        label = next((value for value in labels if lines[index] == b"-----BEGIN " + value + b"-----\n"), None)
        require(label is not None and labels[label] not in result, "TLS_PEM_BLOCK_SET")
        index += 1
        payload = []
        ending = b"-----END " + label + b"-----\n"
        while index < len(lines) and lines[index] != ending:
            line = lines[index]
            require(line.endswith(b"\n") and 1 <= len(line[:-1]) <= 64
                and re.fullmatch(rb"[A-Za-z0-9+/]+={0,2}", line[:-1]) is not None, "TLS_PEM_BODY")
            payload.append(line[:-1]); index += 1
        require(index < len(lines) and payload, "TLS_PEM_TERMINATOR")
        encoded = b"".join(payload)
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except ValueError:
            raise ValueError("TLS_PEM_BASE64") from None
        require(0 < len(decoded) <= 8192 and base64.b64encode(decoded) == encoded, "TLS_PEM_CANONICAL")
        index += 1
        result[labels[label]] = b"".join(lines[start:index])
    require(set(result) == {"tls-key.pem", "tls-cert.pem"}, "TLS_PEM_PAIR_REQUIRED")
    return result


def native_counts():
    return dict(casesEntered=4, casesCompleted=4, connections=3, secureConnections=3,
        requests=3, serverClosed=True, fixtureCleanupDestroyedSockets=0, clientRequests=3,
        clientAuthenticatedTls=3, responseBytesObserved=7, responseFlowsStarted=2,
        cleanOwners=2, unknownOwners=2, allClientHandlesDrained=True, SDK=False, SQLite=False,
        nonce=False, paymentSigning=False, externalNetwork=False, fullDpGraph=False,
        nativeOsNetworkSandbox=False)


def validate_native_capture(stdout, stderr, actual_exit, output_complete):
    require(type(stdout) is bytes and type(stderr) is bytes and len(stdout) <= 65536
        and len(stderr) <= 65536, "NATIVE_CAPTURE_BOUND")
    require(type(actual_exit) is int and actual_exit == 0 and output_complete is True, "NATIVE_FAILURE_OR_UNKNOWN")
    lines = stdout.decode("ascii").splitlines()
    prefix = "# funding-post-native-loopback-tls-current "
    footers = [line[len(prefix):] for line in lines if line.startswith(prefix)]
    require(len(footers) == 1, "CURRENT_NATIVE_FOOTER")
    counts = json.loads(footers[0])
    require(canonical(counts) == canonical(native_counts()), "EXACT_CURRENT_NATIVE_COUNTERS")
    for name, expected in (("tests", 4), ("pass", 4), ("fail", 0), ("skipped", 0), ("cancelled", 0), ("todo", 0)):
        observed = [line for line in lines if line.startswith("# " + name + " ")]
        require(observed == ["# " + name + " " + str(expected)], "EXACT_CURRENT_TAP_SET")
    require(lines.count("1..4") == 1 and not any(line.startswith("not ok ") for line in lines), "CURRENT_TAP_PLAN")
    return counts
