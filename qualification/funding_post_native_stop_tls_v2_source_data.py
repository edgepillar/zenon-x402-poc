"""Pure source-DATA admission for a new native regression draft, never authority.

No filesystem, process, manager, native import or capacity operation is performed.
The future native controller is deliberately not implemented by this module.
"""
import ast
import hashlib
import json
import posixpath
import re

BODY = "qualification/funding-post-native-stop-tls-v2.behavior.draft.mjs"
ENTRY = "qualification/funding-post-native-stop-tls-v2.selection.draft.mjs"
GATE = "qualification/funding_post_native_stop_tls_v2_source_data.py"
APPLICATION = (
    "src/service-credit-funding-post-native-https-transport.js",
    "src/service-credit-funding-post-native-response.js",
    "src/service-credit-native-client-close-owner.js",
    "src/service-credit-native-client-request-stop-owner.js",
    "src/service-credit-funding-post-readable-flow.js",
)
INPUTS = ("package.json", *APPLICATION, BODY, ENTRY, GATE)
CASES = (
    "native stop v2 complete BOUND and actual close",
    "native stop v2 partial body remains UNKNOWN",
    "native stop v2 abort after original request remains UNKNOWN",
    "native stop v2 immediate abort admits no new handshake work",
    "native stop v2 immediate owner close admits no new handshake work",
    "native stop v2 abort while real TLS handshake is stalled",
    "native stop v2 wrong URL method and preaborted signal start no request",
)
CEILING = dict(
    selectedCases=7, maximumRuns=1, opensslCommands=1, nodeCommands=1,
    nodeChildren=0, loopbackListeners=2, loopbackConnections=8,
    taskQuotaBytes=4194304, minimumFreeFloorBytes=10737418240,
    nodeTimeoutSeconds=45, SDK=False, SQLite=False, nonce=False,
    walletPaymentCapabilityProviderSigning=False, fullDpGraph=False,
    externalNetwork=False, nativeOsNetworkSandbox=False,
)
IMPORTS = {
    APPLICATION[0]: [
        "node:buffer", "node:events", "node:https", "node:http", "node:net", "node:util",
        "./service-credit-funding-post-native-response.js",
        "./service-credit-native-client-close-owner.js",
        "./service-credit-native-client-request-stop-owner.js",
        "./service-credit-funding-post-readable-flow.js",
    ],
    APPLICATION[1]: ["node:buffer", "node:util"],
    APPLICATION[2]: ["node:util"],
    APPLICATION[3]: ["node:util"],
    APPLICATION[4]: ["node:stream", "node:util"],
    BODY: ["node:assert/strict", "node:buffer", "node:https", "node:net", "node:fs",
           "node:path", "node:timers/promises", "node:test",
           "../src/service-credit-funding-post-native-https-transport.js"],
    ENTRY: ["node:assert/strict", "node:path", "./funding-post-native-stop-tls-v2.behavior.draft.mjs"],
}


def require(value, code):
    if not value:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def pin(name, raw):
    require(type(name) is str and type(raw) is bytes, "SOURCE_ROW_TYPE")
    return dict(path=name, bytes=len(raw), LF=raw.count(b"\n"),
                sha256=hashlib.sha256(raw).hexdigest(),
                gitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest())


def validate_source_selection(manifest, sources):
    require(type(manifest) is dict and set(manifest) == {
        "kind", "version", "sourceParent", "mainBefore", "inputs",
        "sourceRowsSha256", "imports", "effectsCeiling", "nativeAuthority", "nativeExecuted",
    }, "MANIFEST_SHAPE")
    require(manifest["kind"] == "FUNDING_POST_NATIVE_STOP_TLS_V2_SOURCE_DRAFT_NOT_AUTHORITY"
            and type(manifest["version"]) is int and manifest["version"] == 2, "MANIFEST_KIND")
    require(manifest["nativeAuthority"] == "NONE" and manifest["nativeExecuted"] is False, "NO_NATIVE_AUTHORITY")
    for name in ("sourceParent", "mainBefore"):
        require(type(manifest[name]) is str and re.fullmatch(r"[0-9a-f]{40}", manifest[name]), "SOURCE_REFERENCE")
    require(canonical(manifest["effectsCeiling"]) == canonical(CEILING), "EXACT_FINITE_PROPOSED_EFFECTS")
    require(type(sources) is dict and set(sources) == set(INPUTS), "EXACT_SOURCE_CLOSURE")
    rows = manifest["inputs"]
    require(type(rows) is list and len(rows) == len(INPUTS), "SOURCE_ROW_COUNT")
    actual = []
    for name, row in zip(INPUTS, rows):
        raw = sources[name]
        require(type(raw) is bytes and 0 < len(raw) <= 262144, "SOURCE_BYTES")
        require(raw.isascii() and raw.endswith(b"\n"), "ASCII_LF_SOURCE")
        require(type(row) is dict and set(row) == {"path", "bytes", "LF", "sha256", "gitBlob"}, "SOURCE_ROW_FIELDS")
        require(type(row["bytes"]) is int and type(row["LF"]) is int, "SOURCE_ROW_NUMERIC_TYPES")
        expected = pin(name, raw)
        require(row == expected, "EXACT_SOURCE_ROW_PIN")
        actual.append(expected)
    require(type(manifest["sourceRowsSha256"]) is str
            and manifest["sourceRowsSha256"] == hashlib.sha256(canonical(actual)).hexdigest(), "SOURCE_ROW_SEAL")
    require(type(manifest["imports"]) is dict
            and canonical(manifest["imports"]) == canonical(IMPORTS), "EXACT_IMPORT_DECLARATION")
    for name, expected in IMPORTS.items():
        text = sources[name].decode("ascii")
        static = re.findall(r"from\s+['\"]([^'\"]+)['\"]", text)
        dynamic = re.findall(r"import\(\s*['\"]([^'\"]+)['\"]\s*\)", text)
        require(static + dynamic == expected, "CLOSED_JS_IMPORTS")
        require(text.count("import(") == len(dynamic), "NO_COMPUTED_IMPORT")
        for child in static + dynamic:
            if child.startswith("node:"):
                continue
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), child))
            require(resolved in INPUTS, "RELATIVE_IMPORT_CLOSURE")
    tree = ast.parse(sources[GATE].decode("ascii"), GATE, "exec")
    python_imports = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            python_imports.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            python_imports.append(node.module)
    require(python_imports == ["ast", "hashlib", "json", "posixpath", "re"], "PURE_PYTHON_GATE_IMPORTS")
    body = sources[BODY].decode("ascii")
    match = re.search(r"export const CASES = Object.freeze\((\[[\s\S]*?\])\);", body)
    require(match is not None and tuple(json.loads(match.group(1))) == CASES, "EXACT_SEVEN_CASE_NAMES")
    require(re.findall(r"await selected\((\d),", body) == list("0123456"), "EXACT_SEVEN_CASE_ENTRIES")
    require(body.count("server.listen(") == 1
            and "server.listen({ host: '127.0.0.1', port: 0, exclusive: true }" in body, "CLOSED_LOOPBACK_BIND")
    require("connections > 8" in body and "nodeChildren" not in body
            and "cleanupDestroyedSockets, allClientHandlesDrained" in body, "BOUNDED_NATIVE_FIXTURE_SHAPE")
    require("assert.equal(s.handshakeTimerStartAttempts, beforeStop.handshakeTimerStartAttempts);" in body
            and "assert.equal(s.authenticatedTlsHandshakes, beforeStop.authenticatedTlsHandshakes);" in body,
            "POST_STOP_PROGRESS_ASSERTIONS")
    require("unobservedLateSocketPathQualified: false, nonclosingSocketQualified: false" in body, "NO_UNOBSERVED_PATH_QUALIFICATION")
    entry = sources[ENTRY].decode("ascii")
    for required in ("'v24.19.0'", "'darwin'", "'arm64'", "'--permission'",
                     "'NODE_OPTIONS'", "'NODE_PATH'", "'NODE_TEST_CONTEXT'",
                     "'seven-real-loopback-stop-cases-only'", "'one-fresh-reviewed-native-run-v2'"):
        require(required in entry, "NATIVE_ENTRY_SELECTION_GUARD")
    require("allow-(?:child|worker|addons|fs-write)" in entry, "NATIVE_ENTRY_DENIES_EXTRA_CAPABILITIES")
    native = sources[APPLICATION[0]].decode("ascii")
    required = ("socketAssignmentsObserved", "stoppedSocketAssignmentsObserved",
                "handshakeTimerStartAttempts", "requestClosesWithoutSocketObserved")
    require(all(native.count(name) >= 3 for name in required), "BOUNDED_OBSERVATION_FIELDS")
    begin = native.index("APPLY(ONCE, entry.request, ['socket', socket => {")
    end = native.index("// Association may stop a request", begin)
    socket = native[begin:end]
    positions = [socket.index(value) for value in (
        "sockets.add(socket)", "APPLY(ONCE, socket, ['close'",
        "if (entry.requestClosed || closing !== null || entry.stopping)",
        "entry.stop.attachSocket(socket)", "if (!entry.stop.canStartHandshake())",
        "handshakeTimerStartAttempts++", "entry.handshake = timer(",
    )]
    require(positions == sorted(positions), "TRACK_STOP_GATE_BEFORE_TIMER_ENTRY")
    require("socketAssignmentsObserved, stoppedSocketAssignmentsObserved,\n      handshakeTimerStartAttempts, requestClosesWithoutSocketObserved," in native,
            "OBSERVATIONS_EXPOSED_BY_ACTUAL_OWNER")
    return dict(kind="FUNDING_STOP_TLS_V2_SOURCE_DATA_ADMITTED_NOT_NATIVE_RESULT",
                inputRows=len(INPUTS), applicationModules=len(APPLICATION),
                proposedCases=len(CASES), nativeRunsExecuted=0, listenerSocketsOpened=0,
                storageAdmissionPerformed=False, managerImported=False,
                nativeAuthority="NONE", nativeOrFullDpQualified=False)
