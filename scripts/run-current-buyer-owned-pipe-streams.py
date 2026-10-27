"""Four explicit POSIX pipe controls; no filesystem output or test discovery.

Python supplies anonymous pipes to one Node process per scenario. Node creates
no child and wraps only fstat-verified FIFO descriptors, with no connect/listen.
This is not an OS/network sandbox or native SDK/store qualification.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import time

SCENARIOS = ("CLEAN_CLOSE", "ALIASED_PAIR_REFUSED", "STANDARD_FD_REFUSED", "OUTPUT_PEER_CLOSED")
ENTRY = "qualification/buyer-owned-pipe-streams.control.mjs"
ENV = {"TZ": "UTC", "LANG": "C", "LC_ALL": "C", "X402_BUYER_OWNED_PIPE_CONTROL": "provided-posix-fifo-only"}
CAPS = {"stdout": 32768, "stderr": 16384, "commandOutput": 16384}


def require(value, code):
    if not value:
        raise RuntimeError(code)


def identity(value):
    return [str(getattr(value, key)) for key in
            ("st_dev", "st_ino", "st_uid", "st_gid", "st_mode", "st_nlink", "st_size", "st_mtime_ns", "st_ctime_ns")]


def source_selection(repo):
    repo = Path(repo)
    require(repo == repo.resolve(), "PHYSICAL_REPOSITORY_REQUIRED")
    todo, rows, closure, builtins = [ENTRY], {}, {}, set()
    while todo:
        name = todo.pop()
        if name in rows:
            continue
        path = repo / name
        require(path == path.resolve(), "SOURCE_LINK_REFUSED")
        before = path.lstat()
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid()
                and before.st_nlink == 1 and before.st_size <= 262144, "BOUNDED_SOURCE_IDENTITY")
        raw = path.read_bytes()
        require(identity(before) == identity(path.lstat()) and len(raw) == before.st_size, "SOURCE_CHANGED")
        children = []
        for spec in re.findall(r"(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)[\"']([^\"']+)[\"']", raw.decode("utf-8")):
            if spec.startswith("."):
                child = ((repo / name).parent / spec).resolve().relative_to(repo).as_posix()
                children.append(child)
                todo.append(child)
            else:
                require(spec.startswith("node:"), "EXTERNAL_PACKAGE_REFUSED")
                builtins.add(spec)
        closure[name] = children
        rows[name] = {"path": name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                      "gitBlob": hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest(),
                      "identity": identity(before)}
    manifest = repo / "package.json"
    before = manifest.lstat()
    require(manifest == manifest.resolve() and stat.S_ISREG(before.st_mode)
            and before.st_uid == os.getuid() and before.st_nlink == 1 and before.st_size <= 32768, "MANIFEST_IDENTITY")
    raw = manifest.read_bytes()
    require(identity(before) == identity(manifest.lstat()) and len(raw) == before.st_size, "MANIFEST_CHANGED")
    rows["package.json"] = {"path": "package.json", "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                            "gitBlob": hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest(),
                            "identity": identity(before)}
    return {"inputs": [rows[k] for k in sorted(rows)], "relativeClosure": closure, "builtinImports": sorted(builtins)}


def run_case(node, repo, selection, scenario):
    require(scenario in SCENARIOS and os.name == "posix", "CLOSED_POSIX_SCENARIO")
    require(source_selection(repo) == selection, "SOURCE_CHANGED_BEFORE_CASE")
    owned = set()
    child = None
    selector = selectors.DefaultSelector()
    streams = {name: bytearray() for name in CAPS}
    complete = False
    stop = None
    start = time.monotonic()

    def pipe():
        pair = os.pipe()
        owned.update(pair)
        return pair

    def close(fd):
        if fd in owned:
            os.close(fd)
            owned.remove(fd)

    try:
        command_read = None
        input_write = None
        if scenario == "STANDARD_FD_REFUSED":
            input_fd = 0
            command_read, output_fd = pipe()
        else:
            input_fd, input_write = pipe()
            if scenario == "ALIASED_PAIR_REFUSED":
                output_fd = os.dup(input_fd)
                owned.add(output_fd)
            else:
                command_read, output_fd = pipe()
        inherited = tuple(fd for fd in (input_fd, output_fd) if fd >= 3)
        require(len(set(inherited)) == len(inherited) and all(3 <= fd <= 1023 for fd in inherited), "INHERITED_FD_RANGE")
        require(all(stat.S_ISFIFO(os.fstat(fd).st_mode) for fd in inherited), "INHERITED_FIFO_ONLY")
        # A missing peer is established before spawn; no race or network action.
        if scenario == "OUTPUT_PEER_CLOSED":
            close(command_read)
            command_read = None
        argv = [str(node), "--permission", *["--allow-fs-read=" + str(Path(repo) / row["path"]) for row in selection["inputs"]],
                "--no-addons", "--disallow-code-generation-from-strings", "--unhandled-rejections=strict",
                ENTRY, scenario, str(input_fd), str(output_fd)]
        child = subprocess.Popen(argv, cwd=repo, env=ENV, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 pass_fds=inherited, start_new_session=True)
        for fd in inherited:
            close(fd)
        if input_write is not None:
            if scenario not in ("ALIASED_PAIR_REFUSED",):
                payload = b"".join((json.dumps({"version": 1, "id": operation, "operation": operation, "input": {}},
                                               sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
                                   for operation in ("inspect", "close"))
                require(len(payload) < 1024 and os.write(input_write, payload) == len(payload), "BOUNDED_INPUT_WRITE")
            close(input_write)
        for name, fd in (("stdout", child.stdout.fileno()), ("stderr", child.stderr.fileno()), ("commandOutput", command_read)):
            if fd is not None:
                os.set_blocking(fd, False)
                selector.register(fd, selectors.EVENT_READ, name)
        deadline = start + 10
        while selector.get_map() or child.poll() is None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                stop = "DEADLINE"
                break
            for key, _ in selector.select(min(remaining, 0.1)):
                chunk = os.read(key.fd, min(65536, CAPS[key.data] + 1 - len(streams[key.data])))
                if not chunk:
                    selector.unregister(key.fd)
                    if key.data == "commandOutput":
                        close(key.fd)
                else:
                    streams[key.data].extend(chunk)
                    if len(streams[key.data]) > CAPS[key.data]:
                        stop = "OUTPUT_CAP"
                        break
            if stop is not None:
                break
        complete = stop is None and not selector.get_map() and child.poll() is not None
        if stop is not None and child.poll() is None:
            # Only this controller's new, independently grouped child is owned.
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
        exit_code = child.wait(timeout=1)
        diagnostic = None
        observation_failure = None
        if complete and exit_code == 0 and not streams["stderr"]:
            try:
                diagnostic = json.loads(streams["stdout"])
                require(diagnostic["scenario"] == scenario and diagnostic["passed"] is True, "EXACT_CASE_DIAGNOSTIC")
                require(diagnostic["actualProvidedOsPipes"] is True and diagnostic["standardDescriptorsPreserved"] is True
                        and diagnostic["businessOperations"] == 0 and diagnostic["ipConnections"] == 0, "EXACT_CASE_SCOPE")
                if scenario == "CLEAN_CLOSE":
                    require(streams["commandOutput"].endswith(b"\n") and streams["commandOutput"].count(b"\n") == 1, "ONE_COMMAND_RESULT")
                    reply = json.loads(streams["commandOutput"])
                    require(reply["id"] == "inspect" and reply["operation"] == "inspect" and reply["result"]["authority"] == "NONE", "EXACT_INSPECT_RESULT")
                else:
                    require(not streams["commandOutput"], "NO_COMMAND_OUTPUT_ON_REFUSAL_OR_PEER_LOSS")
            except Exception:
                observation_failure = "CONTROL_DIAGNOSTIC_OR_RESULT_REJECTED"
        stable = source_selection(repo) == selection
        return {"scenario": scenario, "exitCode": exit_code, "complete": complete, "stopReason": stop,
                "elapsedSeconds": time.monotonic() - start, "inputsStable": stable, "diagnostic": diagnostic,
                "observationFailure": observation_failure,
                "passed": bool(complete and exit_code == 0 and diagnostic is not None and observation_failure is None and stable),
                "streams": {name: {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                                   "base64": base64.b64encode(raw).decode()} for name, raw in streams.items()}}
    finally:
        selector.close()
        if child is not None:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=0.5)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait(timeout=1)
            child.stdout.close()
            child.stderr.close()
        for fd in tuple(owned):
            close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", required=True, type=Path)
    args = parser.parse_args()
    require(args.node.is_absolute() and args.node == args.node.resolve(), "EXPLICIT_PHYSICAL_NODE_PATH")
    repo = Path(__file__).resolve().parent.parent
    selection = source_selection(repo)
    rows = []
    for scenario in SCENARIOS:
        row = run_case(args.node, repo, selection, scenario)
        # No private command result or exception is printed by the public CLI.
        rows.append({k: v for k, v in row.items() if k != "streams"})
        if not row["passed"]:
            break
    passed = len(rows) == len(SCENARIOS) and all(r["passed"] for r in rows)
    print(json.dumps({"result": "PROVIDED_OS_PIPE_CONTROLS_PASS" if passed else "INCOMPLETE_OR_FAILURE",
                      "rows": rows, "cases": len(rows), "selected": len(SCENARIOS),
                      "nodeChildren": 0, "managedTasks": 0, "filesystemScratch": False,
                      "nativeSdkStoreQualified": False, "osOrNetworkSandbox": False}))
    return 0 if passed else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        print("Provided-pipe qualification refused or incomplete; no broader qualification is established.")
        raise SystemExit(1)
