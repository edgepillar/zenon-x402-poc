"""Network-free managed SOURCE/DATA controls, never a native execution result.

The orchestration substitutes below are IN-MEMORY DATA fixtures. They neither
authenticate a disk/capacity/tool nor create a task, key, process or listener.
No success from these substitutes is evidence of native TLS or physical storage.
"""
import ast
import base64
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import types
from unittest.mock import patch


def main():
    assert sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode
    assert len(sys.argv) == 3
    repo, manifest_sha = Path(sys.argv[1]), sys.argv[2]
    def module(name, raw):
        value = types.ModuleType("managed_data_test_" + str(len(sys.modules)))
        value.__file__ = str(repo / name); sys.modules[value.__name__] = value
        exec(compile(raw, value.__file__, "exec"), value.__dict__); return value
    driver_name = "qualification/run-funding-post-native-stop-tls-v2-managed.local.py"
    driver = module(driver_name, (repo / driver_name).read_bytes())
    admitted = driver.source_admission(repo, manifest_sha)
    data, gate = admitted["data"], admitted["gate"]
    manifest = copy.deepcopy(admitted["manifest"])
    inputs = {name: admitted["owned"][name][0] for name in data.CONTROLS + (data.INNER,)}
    inner = data.decode(inputs[data.INNER])
    frozen_capacity = module(data.CAPACITY, admitted["owned"][data.CAPACITY][0])
    frozen_tls = module(data.TLS, admitted["owned"][data.TLS][0])
    audit_effects = []
    def audit(event, args):
        if event in ("subprocess.Popen", "os.system", "os.fork", "os.posix_spawn", "socket.__new__",
                "os.remove", "os.rename", "os.mkdir", "os.rmdir", "os.chmod", "os.link", "os.symlink"):
            audit_effects.append(event); raise AssertionError("NO_NATIVE_OR_FILESYSTEM_MUTATION_IN_DATA_CONTROLS")
        if event == "open" and len(args) >= 3 and type(args[2]) is int:
            assert not args[2] & (os.O_CREAT | os.O_TRUNC | os.O_APPEND | os.O_WRONLY | os.O_RDWR)
        if event == "open" and type(args[0]) is str:
            opened = Path(args[0])
            assert opened.is_relative_to(repo) or opened.is_relative_to(Path(sys.base_prefix))
            assert not args[0].endswith("/bin/node")
    sys.addaudithook(audit)
    cases, refusals = [], []
    def check(name, action):
        action(); cases.append(name)
    def refused(name, action, code=None):
        try:
            action()
        except ValueError as error:
            assert code is None or str(error) == code, (name, str(error), code)
            refusals.append(dict(case=name, code=str(error))); cases.append(name)
        else:
            raise AssertionError("EXPECTED_REFUSAL:" + name)
    def edit_manifest(path, value=None, remove=False):
        item = copy.deepcopy(manifest); at = item
        for key in path[:-1]:
            at = at[key]
        if remove:
            at.pop(path[-1])
        else:
            at[path[-1]] = value
        return data.validate_manifest(item, inputs, inner)
    check("actual source-only controller admission", lambda: data.validate_manifest(manifest, inputs, inner))
    def default_main():
        with patch.object(driver, "native_context", side_effect=AssertionError("DEFAULT_MUST_NOT_ENTER_NATIVE_CONTEXT")):
            with contextlib.redirect_stdout(io.StringIO()) as stream:
                assert driver.main(["--repo", str(repo), "--manifest-sha256", manifest_sha,
                    "--manager", "/fixture/must-not-read/manager", "--root", "/fixture/must-not-read/store",
                    "--node", "/fixture/must-not-read/node"]) == 0
            report = json.loads(stream.getvalue())
            assert report["managerImported"] is False and report["nodeBinaryRead"] is False
            assert report["readyOrAuthorizedToExecute"] is False and report["sourceFilesRead"] == 16
    check("default main ignores native path hints without opening them", default_main)
    refused("wrong actual outer digest", lambda: driver.source_admission(repo, "0" * 64), "EXACT_MANAGED_MANIFEST_DIGEST")
    for key in ("version", "pythonControls", "resources", "nativeSelection", "innerSelection"):
        refused("missing outer field " + key, lambda key=key: edit_manifest([key], remove=True), "EXACT_MANAGED_MANIFEST_FIELDS")
    for key in ("nativeExecuted", "nativeAllowanceGranted", "nativeOsNetworkSandbox", "managedLauncherNativeQualified"):
        refused("forged native authority " + key, lambda key=key: edit_manifest([key], True), "SOURCE_IS_NOT_NATIVE_AUTHORITY")
    for key, value in (("version", True), ("sourceParent", "not-a-ref"), ("authority", "APPROVED"),
            ("nativeSelection", "one-new-approved-native-paced-timer-parent-v3"), ("managedLauncherSourceAuthored", False)):
        refused("wrong outer selection " + key, lambda key=key, value=value: edit_manifest([key], value), "SOURCE_IS_NOT_NATIVE_AUTHORITY")
    for key, value in (("bytes", True), ("LF", -1), ("path", "other.py"), ("sha256", "0" * 64), ("gitBlob", "0" * 40)):
        refused("changed control pin " + key, lambda key=key, value=value: edit_manifest(["pythonControls", 0, key], value), "EXACT_MANAGED_CONTROL_PIN")
    for name, _ in data.FROZEN:
        def changed_frozen(name=name):
            altered = dict(inputs); altered[name] += b"# not the frozen helper\n"
            m = copy.deepcopy(manifest)
            m["pythonControls"][data.CONTROLS.index(name)] = data.pin(name, altered[name])
            data.validate_manifest(m, altered, inner)
        refused("resealed frozen helper " + name, changed_frozen, "UNCHANGED_FROZEN_MANAGED_CONTROL")
    refused("inner selection old digest", lambda: edit_manifest(["innerSelection", "sha256"], "0" * 64), "UNCHANGED_INNER_SEVEN_CASE_SELECTION")
    refused("inner row seal changed", lambda: edit_manifest(["innerSourceRowsSha256"], "0" * 64), "UNCHANGED_INNER_SEVEN_CASE_SELECTION")
    for key, value in data.resources().items():
        wrong = not value if type(value) is bool else value + 1
        refused("resource drift " + key, lambda key=key, wrong=wrong: edit_manifest(["resources", key], wrong), "EXACT_FINITE_MANAGED_RESOURCES")
    for key, value in data.policy().items():
        refused("policy drift " + key, lambda key=key, value=value: edit_manifest(["storagePolicy", key], value + 1), "EXACT_FINITE_MANAGED_RESOURCES")
    refused("inner SDK expansion", lambda: edit_manifest(["effectsCeiling", "SDK"], True), "EXACT_FINITE_MANAGED_RESOURCES")
    assert data.policy() == frozen_tls.policy()
    check("frozen TLS policy reused unchanged", lambda: None)
    for raw in (b'{"x":1,"x":2}', b'{"x":1.0}', b'{"x":NaN}', b'{"x":-0}', b'{"x":9007199254740992}'):
        refused("strict DATA JSON " + raw.decode("ascii"), lambda raw=raw: data.decode(raw))
    effects = data.resources(); base = effects["requiredFreeBytesBeforeOtherReservations"]
    for roots in (1, 61, 256):
        check("all-root finite reservation DATA " + str(roots), lambda roots=roots:
            frozen_capacity.capacity_data(base + 17, 17, effects, roots))
    for available, reserved, roots in ((base + 16, 17, 61), (base, 0, 257), (base, 0, 0), (True, 0, 1), (base, True, 1)):
        refused("capacity refusal DATA " + str((available, reserved, roots)), lambda available=available, reserved=reserved, roots=roots:
            frozen_capacity.capacity_data(available, reserved, effects, roots))
    task_id, store_id = "a" * 32, "b" * 32
    scratch = "/fixture/volume/spv2/new-store/tasks/" + task_id + "/scratch"
    def plan(**change):
        values = dict(repo="/fixture/repository", node="/fixture/bin/node", scratch=scratch,
            application=gate.APPLICATION, entry=gate.ENTRY, body=gate.BODY); values.update(change)
        return data.command_plan(**values)
    def exact_plan():
        p = plan()
        assert p["timeoutSeconds"] == 45 and p["nodeChildren"] == 0
        assert len([x for x in p["argv"] if x.startswith("--allow-fs-read=")]) == 9
        assert not any("allow-fs-write" in x or "allow-child" in x or "allow-worker" in x for x in p["argv"])
        assert not set(p["env"]) & {"NODE_OPTIONS", "NODE_PATH", "NODE_V8_COVERAGE", "NODE_COMPILE_CACHE", "NODE_TEST_CONTEXT"}
    check("exact native argv DATA is read-only with no children", exact_plan)
    for label, change in (("relative repo", dict(repo="relative")), ("path traversal", dict(repo="/a/../b")),
            ("permission comma", dict(repo="/a,b")), ("newline", dict(node="/bin/node\n--other")),
            ("root path", dict(repo="/")), ("scratch alias", dict(scratch="/fixture/other")),
            ("node under scratch", dict(node=scratch + "/node")), ("extra application", dict(application=gate.APPLICATION + ("src/other.js",))),
            ("foreign application", dict(application=("src/other.js",) + gate.APPLICATION[1:])),
            ("old entry", dict(entry="qualification/funding-post-native-loopback-tls-current.selection.draft.mjs"))):
        refused("command plan " + label, lambda change=change: plan(**change))

    def footer(late=1):
        rows = []
        for i in range(7):
            started = 0 if i == 6 else 1
            hs = 0 if i in (3, 4, 6) else 1
            rows.append(dict(index=i, requestStarts=started, phase="CLOSED" if i in (0, 6) else "CLOSE_UNKNOWN",
                unknown=i not in (0, 6), socketAssignmentsObserved=(late if i == 3 else (0 if i in (4, 6) else 1)),
                stoppedSocketAssignmentsObserved=late if i == 3 else 0, handshakeTimerStartAttempts=hs,
                requestClosesWithoutSocketObserved=1 if i == 4 else 0,
                beforeStopHandshakeTimerStartAttempts=hs if i in (2, 3, 4, 5) else None,
                beforeStopAuthenticatedTls=(1 if i == 2 else 0) if i in (2, 3, 4, 5) else None,
                authenticatedTlsHandshakes=1 if i in (0, 1, 2) else 0, handlesDrained=True))
        return dict(casesEntered=7, casesCompleted=7, observations=rows, connections=4, tlsConnections=3,
            silentConnections=1, secureConnections=3, requests=3, tlsClientErrors=0, httpsClosed=True, tcpClosed=True,
            cleanupDestroyedSockets=0, allClientHandlesDrained=True, actualLateSocketAssignmentsObserved=late,
            unobservedLateSocketPathQualified=False, nonclosingSocketQualified=False, SDK=False, SQLite=False, nonce=False,
            paymentSigning=False, externalNetwork=False, fullDpGraph=False, nativeOsNetworkSandbox=False)
    def capture(value=None):
        lines = ["TAP version 13"] + ["ok " + str(i + 1) + " - " + name for i, name in enumerate(gate.CASES)]
        lines += ["# funding-stop-tls-v2 " + json.dumps(footer() if value is None else value), "1..7"]
        lines += ["# " + label + " " + str(count) for label, count in
            (("tests", 7), ("suites", 0), ("pass", 7), ("fail", 0), ("cancelled", 0), ("skipped", 0), ("todo", 0))]
        return ("\n".join(lines) + "\n").encode("ascii")
    def receipt(out, err=b"", exit_code=0):
        return dict(state="COMPLETE", actual_exit=exit_code, output_complete=True, reason=None, process_group=123,
            argv=None, stdout=dict(sha256=driver.sha(out), bytes=len(out)), stderr=dict(sha256=driver.sha(err), bytes=len(err)))
    def validate(value=None, out=None, err=b"", r=None):
        out = capture(value) if out is None else out
        return data.validate_native_capture(out, err, receipt(out, err) if r is None else r, gate.CASES)
    check("complete synthetic capture DATA with observed late assignment", lambda: validate())
    check("zero late observation DATA never qualifies unobserved path", lambda: validate(footer(0)))
    for key, value in (("actual_exit", True), ("actual_exit", 1), ("output_complete", False), ("state", "RUNNING"),
            ("reason", "TIMEOUT"), ("process_group", False), ("argv", ["node"])):
        r = receipt(capture()); r[key] = value
        refused("capture receipt " + key + "=" + str(value), lambda r=r: validate(r=r))
    for label, change in (("missing EOF", lambda out: out[:-1]), ("wrong case", lambda out: out.replace(gate.CASES[0].encode(), b"other")),
            ("failure", lambda out: out.replace(b"ok 1 -", b"not ok 1 -")), ("skip", lambda out: out.replace(b"ok 1 -", b"ok 1 # SKIP -")),
            ("duplicate plan", lambda out: out + b"1..7\n"), ("duplicate footer", lambda out: out + next(line for line in out.splitlines() if line.startswith(b"# funding-stop-tls-v2 ")) + b"\n"),
            ("wrong total", lambda out: out.replace(b"# tests 7", b"# tests 6"))):
        refused("TAP " + label, lambda change=change: validate(out=change(capture())))
    refused("native stderr is not silently ignored", lambda: validate(err=b"warning\n"))
    for key, value in (("casesEntered", True), ("casesCompleted", 6), ("connections", 9), ("connections", 3),
            ("silentConnections", 0), ("requests", 4), ("httpsClosed", False), ("tcpClosed", False),
            ("cleanupDestroyedSockets", 1), ("allClientHandlesDrained", False), ("actualLateSocketAssignmentsObserved", 0),
            ("unobservedLateSocketPathQualified", True), ("nonclosingSocketQualified", True), ("SDK", True),
            ("SQLite", True), ("nonce", True), ("paymentSigning", True), ("externalNetwork", True), ("fullDpGraph", True)):
        item = footer(); item[key] = value
        refused("native summary " + key + "=" + str(value), lambda item=item: validate(item))
    for i, key, value in ((0, "index", True), (0, "requestStarts", True), (0, "phase", "CLOSE_UNKNOWN"),
            (1, "unknown", False), (2, "beforeStopHandshakeTimerStartAttempts", 0), (3, "handshakeTimerStartAttempts", 1),
            (4, "handlesDrained", False), (5, "authenticatedTlsHandshakes", 1), (6, "requestStarts", 1)):
        item = footer(); item["observations"][i][key] = value
        refused("owner observation " + str((i, key, value)), lambda item=item: validate(item))
    def closed_record():
        return dict(schema="zenon-owned-task-storage/v2", store_id=store_id, id=task_id, state="CLOSED", outcome="SUCCESS",
            commands=["command-" + "c" * 32, "command-" + "d" * 32], scratch_files={}, scratch_dirs={}, file_roles={})
    def cleanup(decision="CLEANED"):
        return dict(mode="APPLY_OWNED_ONLY", objects=[], tasks=[dict(id=task_id, decision=decision)])
    for decision in ("CLEANED", "ALREADY_CLEAN", "HOLD"):
        check("task closure separate cleanup DATA " + decision, lambda decision=decision:
            data.closed_storage(closed_record(), cleanup(decision), store_id, task_id))
    for key, value in (("state", "OPEN"), ("id", "0" * 32), ("outcome", "UNKNOWN"), ("commands", []),
            ("scratch_files", {"unknown": [1, 2]})):
        item = closed_record(); item[key] = value
        refused("closure DATA " + key, lambda item=item: data.closed_storage(item, cleanup(), store_id, task_id))
    refused("foreign task cleanup DATA", lambda: data.closed_storage(closed_record(),
        dict(mode="APPLY_OWNED_ONLY", objects=[], tasks=[dict(id="f" * 32, decision="CLEANED")]), store_id, task_id))
    refused("object cleanup not authorized DATA", lambda: data.closed_storage(closed_record(),
        dict(mode="APPLY_OWNED_ONLY", objects=[dict(decision="REMOVED_UNREFERENCED")], tasks=cleanup()["tasks"]), store_id, task_id))

    private_meta = data.canonical(dict(schema="zenon-owned-task-storage/v2", id=store_id, policy=data.policy()))
    def native_args(**changes):
        values = dict(native_selection=data.NATIVE_SELECTION, manifest_sha256=manifest_sha,
            approval_manifest_sha256=manifest_sha, approval_source_rows_sha256=data.INNER_SEAL,
            pre_native_plan=True, execute=False, manager="/fixture/manager", root="/fixture/volume/spv2/new-store",
            store_id=store_id, storage_sha256=driver.sha(private_meta), volume="/fixture/volume",
            volume_uuid="11111111-2222-3333-4444-555555555555", node="/fixture/bin/node")
        values.update(changes); return types.SimpleNamespace(**values)
    check("finite native-selection tripwire DATA not authority", lambda: driver.native_selection(native_args(), admitted))
    for key, value in (("native_selection", "one-new-approved-native-paced-timer-parent-v3"), ("approval_manifest_sha256", "0" * 64),
            ("approval_source_rows_sha256", "0" * 64), ("manager", None), ("execute", True), ("pre_native_plan", 1),
            ("volume_uuid", "invalid"), ("store_id", "foreign")):
        refused("native tripwire " + key, lambda key=key, value=value: driver.native_selection(native_args(**{key: value}), admitted))
    def context_substitute():
        calls = []
        def binary(path, digest, uid):
            calls.append((str(path), digest, uid)); return ["1", "2", str(uid), "20", "33261", "1", "121304480", "0", "0"]
        def capacity(*args):
            assert args[0] == Path("/fixture/volume") and args[2] == Path("/fixture/volume/spv2/new-store")
            assert args[4] == data.resources(); return dict(storeRoots=61, reservedBytes=17)
        controls = dict(capacity=types.SimpleNamespace(capacity=capacity), common=types.SimpleNamespace(binary=binary), tls=frozen_tls)
        fake_manager, fake_cli = b"synthetic manager DATA only", b"synthetic cli DATA only"
        fake_read = lambda path, maximum=262144: ((admitted["owned"][str(path.relative_to(repo))]) if repo in path.parents else
            ((fake_manager, ["manager"]) if path.name == "storage.py" else (fake_cli, ["cli"])))
        # Native manager bytes still need the real expected digest, so replace
        # only the hash predicate for these clearly synthetic private DATA pins.
        with patch.object(driver, "native_selection", wraps=driver.native_selection), patch.object(driver, "no_links"), \
                patch.object(driver, "read", side_effect=fake_read), patch.object(driver, "unused_root", return_value=(private_meta, ["metadata"])), \
                patch.object(driver, "load_verified", side_effect=lambda path, raw, label: controls[label.split("_frozen_")[1].split("_v2")[0]]), \
                patch.object(driver, "sha", side_effect=lambda raw: data.STORAGE_SHA if raw == fake_manager else
                    data.CLI_SHA if raw == fake_cli else hashlib.sha256(raw).hexdigest()):
            result = driver.native_context(native_args(), admitted)
            assert result["capacityReport"]["storeRoots"] == 61 and callable(result["checkCapacity"])
            assert len(calls) == 2 and calls[0][1] == data.NODE_SHA and calls[1][1] == data.OPENSSL_SHA
    check("context composition DATA uses full-sibling reader and hashes each tool once", context_substitute)
    for name in (driver_name, data.DATA):
        ast.parse((repo / name).read_bytes(), name)
    assert not audit_effects and len(set(cases)) == len(cases)
    print(json.dumps(dict(event="FUNDING_STOP_TLS_V2_MANAGED_SOURCE_DATA_ACTUAL_LOCAL", selectedCases=len(cases),
        negativeCases=len(refusals), cases=cases, refusalCodes=refusals, actualSourceFilesRead=16,
        orchestrationSubstitutesAreInMemoryDataOnly=True, physicalCapacityOrToolAdmissionPerformed=False,
        nativeRunsExecuted=0, nativeBodyImported=False, listenerSocketsOpened=0, testTlsKeyGenerated=False,
        managerImported=False, taskStorageInvoked=False, nativeAllowanceConsumed=False, authority="NONE"), sort_keys=True))


if __name__ == "__main__":
    main()
