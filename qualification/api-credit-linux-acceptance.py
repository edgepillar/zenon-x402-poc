"""Unexecuted native Linux harness for the existing API-credit CLI.

Invoke only inside an explicitly approved owned task. There is no installer,
provider launcher, fixture/key generator, signal sender or automatic retry.
The external synthetic provider and independently selected fixture bytes are
prerequisites. A complete product verdict still needs authoritative ledger,
budget, negative-case, interruption and physical-release evidence.
"""
import hashlib
import json
import os
from pathlib import Path
import selectors
import stat
import subprocess
import sys
import time

CAPS = {"runProfile": 262144, "commands": 2097152, "runReplies": 2097152,
        "recoveryProfile": 65536, "recoveryReply": 4096}
FILES = {"runProfile": "run-profile.json", "commands": "run-commands.jsonl",
         "runReplies": "run-replies.jsonl", "recoveryProfile": "recovery-profile.json",
         "recoveryReply": "recovery-reply.jsonl", "credential": "credential.bin"}
ENTRY = "src/api-credit-cli.js"
PREFLIGHT = "qualification/api-credit-linux-acceptance-preflight.mjs"
CONTRACT = "qualification/api-credit-linux-acceptance-contract.mjs"


def require(condition):
    if not condition:
        raise ValueError("API_CREDIT_LINUX_ACCEPTANCE_REFUSED")


def identity(s):
    return (s.st_dev, s.st_ino, s.st_uid, s.st_mode, s.st_size, s.st_mtime_ns)


def checked(path, cap, private=False):
    path = Path(path)
    require(path.is_absolute())
    for parent in (path, *path.parents):
        require(not stat.S_ISLNK(parent.lstat().st_mode))
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_uid == os.getuid() and s.st_size <= cap)
    if private:
        require(s.st_mode & 0o077 == 0)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(s))
        data = stream.read(cap + 1)
        require(len(data) == s.st_size and identity(os.fstat(stream.fileno())) == identity(s))
    require(identity(path.lstat()) == identity(s))
    return data


def pin(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def binary_pin(path):
    # Do not materialize the complete runtime binary or create another copy.
    for parent in (path, *path.parents):
        require(not stat.S_ISLNK(parent.lstat().st_mode))
    s = path.lstat()
    require(path.is_absolute() and stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid()
            and s.st_nlink == 1 and s.st_size <= 268435456)
    digest = hashlib.sha256(); size = 0
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
        require(identity(os.fstat(stream.fileno())) == identity(s))
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            size += len(chunk); require(size <= s.st_size); digest.update(chunk)
        require(identity(os.fstat(stream.fileno())) == identity(s))
    require(size == s.st_size and identity(path.lstat()) == identity(s))
    return {"bytes": size, "sha256": digest.hexdigest()}


def fresh_file(path):
    return os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb")


def save(path, value):
    data = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    require(len(data) <= 65536)
    with fresh_file(path) as out:
        out.write(data)


def verify_sources(repo, rows):
    require(type(rows) is list and 3 <= len(rows) <= 1024)
    seen = set(); pins = {}
    for row in rows:
        require(type(row) is dict and set(row) == {"path", "bytes", "sha256"})
        name = row["path"]
        require(type(name) is str and name not in seen and "\\" not in name)
        parts = name.split("/")
        require(all(part not in ("", ".", "..") for part in parts) and not Path(name).is_absolute())
        seen.add(name)
        pins[name] = {"bytes": row["bytes"], "sha256": row["sha256"]}
        data = checked(repo / name, 2097152)
        require(pin(data) == {"bytes": row["bytes"], "sha256": row["sha256"]})
    require({ENTRY, PREFLIGHT, CONTRACT, "src/api-credit-native-package-admission.js", "src/api-credit-module-catalog.json"}.issubset(seen))
    catalog = json.loads(checked(repo / "src/api-credit-module-catalog.json", 262144))
    require(catalog["version"] == 1 and type(catalog["rows"]) is list and len(catalog["rows"]) <= 1024)
    for row in catalog["rows"]:
        require(row["path"] in pins and pins[row["path"]] == {k: row[k] for k in ("bytes", "sha256")})


def fixture_paths(scratch, data):
    # A future approved synthetic fixture may only select databases inside
    # this task's own scratch, never an existing operator/user data directory.
    run = json.loads(data["runProfile"]); recovery = json.loads(data["recoveryProfile"])
    paths = [run["configuration"]["storeOptions"][k] for k in ("databasePath", "allowedRoot")]
    paths += [run["spendingFile"]["storageProfile"]["databasePath"], run["spendingFile"]["allowedRoot"]]
    paths += [recovery["payerOptions"][k] for k in ("databasePath", "allowedRoot")]
    paths += [recovery["backendOptions"]["databasePath"]]
    for text in paths:
        path = Path(text)
        require(path.is_absolute() and path != scratch and scratch in path.parents
                and ".." not in path.parts and str(path) == text)
        for ancestor in (path, *path.parents):
            if ancestor.exists() or ancestor.is_symlink():
                require(not stat.S_ISLNK(ancestor.lstat().st_mode))


def preflight_process(node, repo, outdir, payload, deadline, environment):
    # Popen.communicate/run timeout helpers are deliberately avoided: run's
    # timeout can kill the child, and communicate accumulates complete output.
    child = subprocess.Popen([str(node), PREFLIGHT], cwd=repo, env=environment,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False)
    report = {"status": "UNKNOWN", "pid": child.pid, "signalsSent": 0, "childExit": None}
    selector = selectors.DefaultSelector(); offset = 0; sizes = {"stdout": 0, "stderr": 0}
    try:
        with fresh_file(outdir / "preflight.stdout.private.json") as out, fresh_file(outdir / "preflight.stderr.private.bin") as err:
            streams = {child.stdout.fileno(): (out, "stdout", 4096), child.stderr.fileno(): (err, "stderr", 128)}
            for stream in (child.stdin, child.stdout, child.stderr):
                os.set_blocking(stream.fileno(), False)
            selector.register(child.stdin, selectors.EVENT_WRITE)
            for fd in streams:
                selector.register(fd, selectors.EVENT_READ)
            while selector.get_map():
                require(time.monotonic() < deadline)
                for key, events in selector.select(min(0.05, max(0, deadline - time.monotonic()))):
                    try:
                        if events & selectors.EVENT_WRITE:
                            count = os.write(key.fd, memoryview(payload)[offset:]); require(count > 0); offset += count
                            if offset == len(payload):
                                selector.unregister(key.fileobj); child.stdin.close()
                        else:
                            target, label, cap = streams[key.fd]; chunk = os.read(key.fd, 4096)
                            if not chunk:
                                selector.unregister(key.fd); continue
                            target.write(chunk[:max(0, cap - sizes[label])]); sizes[label] += len(chunk); require(sizes[label] <= cap)
                    except BlockingIOError:
                        continue
            require(offset == len(payload) and deadline > time.monotonic())
            require(child.wait(timeout=deadline - time.monotonic()) == 0 and sizes["stderr"] == 0)
            report["status"] = "PREFLIGHT_PROCESS_PASS"
    finally:
        selector.close()
        for stream in (child.stdin, child.stdout, child.stderr):
            stream.close()
        report["childExit"] = child.poll(); report["childObservedLive"] = report["childExit"] is None
        save(outdir / "preflight.process.private.json", report)


def exchange(node, repo, outdir, name, profile, credential, commands, expected, bootstrap_ms, deadline, environment):
    """Anonymous os.pipe descriptors are real FIFOs, unlike Node spawn's
    socket-backed extra stdio. Only this call's child ends are inherited.
    Every next command waits for the complete, predeclared preceding reply.
    """
    writers = []
    child_ends = []
    all_fds = set()
    child = None
    report = {"phase": name, "status": "UNKNOWN", "childExit": None, "childObservedLive": None,
              "commandsWritten": 0, "repliesMatched": 0, "signalsSent": 0, "retries": 0}
    output = fresh_file(outdir / (name + ".output.private.bin"))
    stdout = fresh_file(outdir / (name + ".stdout.private.bin"))
    stderr = fresh_file(outdir / (name + ".stderr.private.bin"))
    selector = selectors.DefaultSelector()
    try:
        def incoming(data):
            read_fd, write_fd = os.pipe()
            all_fds.update((read_fd, write_fd)); child_ends.append(read_fd)
            writers.append({"fd": write_fd, "data": data, "offset": 0, "commands": False})
            return read_fd

        profile_fd = incoming(profile)
        if credential is not None:
            key_fd = incoming(credential)
            command_read, command_write = os.pipe(); all_fds.update((command_read, command_write))
            child_ends.append(command_read)
            writers.append({"fd": command_write, "data": commands[0], "offset": 0, "commands": True})
        output_read, output_write = os.pipe(); all_fds.update((output_read, output_write)); child_ends.append(output_write)
        require(all(3 <= fd <= 1023 and stat.S_ISFIFO(os.fstat(fd).st_mode) for fd in child_ends))
        args = [str(node), ENTRY]
        if credential is None:
            args += ["--recorded-result-fd", str(profile_fd), "--output-fd", str(output_write)]
        else:
            args += ["--profile-fd", str(profile_fd), "--key-fd", str(key_fd),
                     "--input-fd", str(command_read), "--output-fd", str(output_write)]
        args += ["--bootstrap-ms", str(bootstrap_ms)]
        child = subprocess.Popen(args, cwd=repo, env=environment, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True,
                                 pass_fds=tuple(child_ends), shell=False)
        report["pid"] = child.pid
        for fd in child_ends:
            os.close(fd); all_fds.remove(fd)
        for writer in writers:
            os.set_blocking(writer["fd"], False); selector.register(writer["fd"], selectors.EVENT_WRITE, writer)
        streams = {output_read: ("output", output, sum(map(len, expected))),
                   child.stdout.fileno(): ("stdout", stdout, 0), child.stderr.fileno(): ("stderr", stderr, 65536)}
        sizes = {"output": 0, "stdout": 0, "stderr": 0}
        errors = bytearray(); reply_buffer = bytearray(); command_index = 0
        for fd in streams:
            os.set_blocking(fd, False); selector.register(fd, selectors.EVENT_READ, None)
        command_writer = next((w for w in writers if w["commands"]), None)
        while selector.get_map():
            require(time.monotonic() < deadline)
            for key, events in selector.select(min(0.05, max(0, deadline - time.monotonic()))):
                fd = key.fd
                if events & selectors.EVENT_WRITE:
                    writer = key.data
                    try:
                        count = os.write(fd, memoryview(writer["data"])[writer["offset"]:])
                    except BlockingIOError:
                        continue
                    require(count > 0); writer["offset"] += count
                    if writer["offset"] == len(writer["data"]):
                        selector.unregister(fd)
                        if writer["commands"]:
                            report["commandsWritten"] += 1
                            if command_index == len(commands) - 1:
                                os.close(fd); all_fds.remove(fd)
                        else:
                            os.close(fd); all_fds.remove(fd)
                else:
                    label, target, cap = streams[fd]
                    try:
                        chunk = os.read(fd, 65536)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        selector.unregister(fd)
                        if fd == output_read:
                            os.close(fd); all_fds.remove(fd)
                        continue
                    # Preserve the bounded offending prefix too; no unlimited drain.
                    remaining = max(0, cap - sizes[label]); target.write(chunk[:remaining])
                    sizes[label] += len(chunk); require(sizes[label] <= cap)
                    if label == "stderr":
                        errors.extend(chunk)
                    if label == "output":
                        reply_buffer.extend(chunk)
                        while b"\n" in reply_buffer:
                            end = reply_buffer.index(10) + 1; line = bytes(reply_buffer[:end]); del reply_buffer[:end]
                            at = report["repliesMatched"]
                            require(at < len(expected) and line == expected[at])
                            if credential is not None:
                                # A reply for a command not fully written is not a barrier.
                                require(at < report["commandsWritten"] and at == command_index)
                            report["repliesMatched"] += 1
                            if command_writer is not None:
                                command_index += 1; command_writer["data"] = commands[command_index]; command_writer["offset"] = 0
                                selector.register(command_writer["fd"], selectors.EVENT_WRITE, command_writer)
        require(not reply_buffer and report["repliesMatched"] == len(expected))
        require(credential is None or report["commandsWritten"] == len(commands))
        remaining = deadline - time.monotonic(); require(remaining > 0)
        report["childExit"] = child.wait(timeout=remaining)
        require(report["childExit"] == 0 and bytes(errors).endswith(b"API_CREDIT_OPERATOR_CLOSED\n")
                and bytes(errors).count(b"API_CREDIT_OPERATOR_CLOSED\n") == 1
                and b"API_CREDIT_OPERATOR_CLOSE_UNKNOWN" not in errors and b"REFUSED" not in errors)
        report.update(status="PROCESS_PROTOCOL_PASS", outputEOF=True, stdoutBytes=sizes["stdout"], stderrBytes=sizes["stderr"])
        return report
    finally:
        if child is not None:
            report["childExit"] = child.poll(); report["childObservedLive"] = report["childExit"] is None
        selector.close()
        for fd in all_fds:
            try:
                os.close(fd)
            except OSError:
                pass
        for stream in (output, stdout, stderr):
            stream.close()
        if child is not None:
            child.stdout.close(); child.stderr.close()
        # Never kill, reopen or start recovery after an uncertain first process.
        # A live child keeps the enclosing manager process group/owned task HELD.
        save(outdir / (name + ".process.private.json"), report)


def main():
    require(sys.platform == "linux" and len(sys.argv) == 3 and sys.argv[1] == "--execute-candidate")
    scratch = Path(os.environ["SPV_TASK_SCRATCH"])
    require(scratch.is_absolute() and scratch.is_dir() and scratch.stat().st_uid == os.getuid() and scratch.stat().st_mode & 0o077 == 0)
    manifest_path = Path(sys.argv[2]); require(manifest_path.parent == scratch)
    manifest = json.loads(checked(manifest_path, 262144, True))
    require(set(manifest) == {"version", "node", "repository", "sourcePins", "fixturePins", "bootstrapMs", "totalMs"} and manifest["version"] == 1)
    require(type(manifest["bootstrapMs"]) is int and 1 <= manifest["bootstrapMs"] <= 60000)
    require(type(manifest["totalMs"]) is int and 1 <= manifest["totalMs"] <= 120000)
    require(set(manifest["node"]) == {"path", "bytes", "sha256"})
    node = Path(manifest["node"]["path"]); repo = Path(manifest["repository"])
    expected_node = {k: manifest["node"][k] for k in ("bytes", "sha256")}
    require(binary_pin(node) == expected_node)
    verify_sources(repo, manifest["sourcePins"])
    require(set(manifest["fixturePins"]) == set(FILES))
    data = {}
    for name in CAPS:
        value = checked(scratch / FILES[name], CAPS[name], True)
        require(pin(value) == manifest["fixturePins"][name]); data[name] = value
    fixture_paths(scratch, data)
    outdir = scratch / "linux-cli-acceptance"; outdir.mkdir(mode=0o700)
    environment = {"PATH": str(node.parent), "LANG": "C", "TZ": "UTC", "TMPDIR": str(scratch), "NODE_DISABLE_COMPILE_CACHE": "1"}
    deadline = time.monotonic() + manifest["totalMs"] / 1000
    # Preflight does not read the credential. The fixed file imports only DATA
    # contracts; the subsequent two children use the actual existing CLI.
    payload = json.dumps({k: v.decode("utf-8") for k, v in data.items()}, ensure_ascii=True, separators=(",", ":")).encode()
    preflight_process(node, repo, outdir, payload, deadline, environment)
    preflight = json.loads(checked(outdir / "preflight.stdout.private.json", 4096, True))
    require(preflight["status"] == "PREFLIGHT_PASS" and preflight["inputPins"] == {k: pin(v) for k, v in data.items()})
    credential = bytearray(checked(scratch / FILES["credential"], 32, True))
    require(len(credential) == 32 and pin(credential) == manifest["fixturePins"]["credential"])
    try:
        # Recheck the complete selected namespace immediately before each entry.
        verify_sources(repo, manifest["sourcePins"])
        require(binary_pin(node) == expected_node)
        run = exchange(node, repo, outdir, "run", data["runProfile"], credential,
                       data["commands"].splitlines(keepends=True), data["runReplies"].splitlines(keepends=True),
                       manifest["bootstrapMs"], deadline, environment)
    finally:
        credential[:] = b"\0" * len(credential)
    require(run["status"] == "PROCESS_PROTOCOL_PASS" and run["childObservedLive"] is False)
    verify_sources(repo, manifest["sourcePins"])
    require(binary_pin(node) == expected_node)
    recovery = exchange(node, repo, outdir, "recovery", data["recoveryProfile"], None, [],
                        [data["recoveryReply"]], manifest["bootstrapMs"], deadline, environment)
    require(recovery["status"] == "PROCESS_PROTOCOL_PASS" and recovery["childObservedLive"] is False)
    save(outdir / "result.private.json", {"version": 1, "status": "PROCESS_PROTOCOL_PASS", "preflight": preflight,
         "applicationProcesses": 2, "preflightProcesses": 1, "signalsSent": 0, "automaticRetries": 0,
         "providerLedgerAcceptance": "NOT_ESTABLISHED", "G1Acceptance": "NOT_ESTABLISHED", "G2Acceptance": "NOT_ESTABLISHED"})
    print("API_CREDIT_LINUX_PROCESS_PROTOCOL_PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Raw data, private paths, credentials, proofs and exception text stay private.
        print("API_CREDIT_LINUX_ACCEPTANCE_UNKNOWN", file=sys.stderr); sys.exit(1)
