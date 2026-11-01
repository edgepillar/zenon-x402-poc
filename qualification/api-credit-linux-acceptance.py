"""Unexecuted native Linux harness for the existing buyer/provider CLIs.

Invoke only inside an explicitly approved owned task. There is no installer,
fixture/key generator, signal sender or automatic retry. The fixed provider
CLI, independently selected fixture bytes and an external loopback synthetic
RPC are prerequisites. A complete product verdict still needs authoritative ledger,
budget, changed-offer/payment, concurrency, interruption and physical-release evidence.
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
        "recoveryProfile": 65536, "recoveryReply": 4096, "ledgerProfile": 65536, "signerProfile": 16384,
        "providerProfile": 262144, "providerJournalProfile": 8192, "providerActivation": 1024, "negativeProfile": 8192}
FILES = {"runProfile": "run-profile.json", "commands": "run-commands.jsonl",
         "runReplies": "run-replies.jsonl", "recoveryProfile": "recovery-profile.json",
         "recoveryReply": "recovery-reply.jsonl", "ledgerProfile": "ledger-profile.json", "signerProfile": "signer-profile.json", "credential": "credential.bin",
         "providerProfile": "provider-profile.json", "providerJournalProfile": "provider-journal-profile.json",
         "providerActivation": "provider-activation.json", "providerTls": "provider-tls.bin", "negativeProfile": "negative-profile.json"}
ENTRY = "src/api-credit-cli.js"
PROVIDER_ENTRY = "src/issued-provider-cli.js"
PREFLIGHT = "qualification/api-credit-linux-acceptance-preflight.mjs"
CONTRACT = "qualification/api-credit-linux-acceptance-contract.mjs"
SIGNER_CONTRACT = "qualification/api-credit-linux-signer-contract.mjs"
BUDGET_CONTRACT = "qualification/api-credit-linux-budget-contract.mjs"
LEDGER_CONTRACT = "qualification/api-credit-linux-ledger-contract.mjs"
LEDGER_PROBE = "qualification/api-credit-linux-ledger-probe.mjs"
PROVIDER_CONTRACT = "qualification/api-credit-linux-provider-contract.mjs"
NEGATIVE_CONTRACT = "qualification/api-credit-linux-negative-contract.mjs"
NEGATIVE_REPLY = "qualification/api-credit-linux-negative-reply.mjs"
NEGATIVE_PROBE = "qualification/api-credit-linux-negative-probe.mjs"
BASE_INPUT = ("runProfile", "commands", "runReplies", "recoveryProfile", "recoveryReply", "ledgerProfile", "signerProfile")


def canonical_line(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def provider_plan(data):
    # Inputs have already passed the actual pure provider and buyer codecs.
    # None of these expectations may be populated from a process response.
    commands = [json.loads(line) for line in data["commands"].splitlines()]
    activation = json.loads(data["providerActivation"])
    def reply(command_id, operation, result):
        return canonical_line(dict(version=1, id=command_id, operation=operation, outcome="RETURNED", result=result))
    return {
        "journalReply": canonical_line(dict(providerJournalSetupResultVersion=1, status="INITIALIZED", exitCode=0,
            records=0, revision=0, authority="NONE", physicalRelease="NOT_ESTABLISHED", nativeAcceptance="NOT_ESTABLISHED")),
        "startupReply": reply("startup", "START", dict(status="LISTENING")),
        "activationCommand": data["providerActivation"] + b"\n",
        "activationReply": reply(activation["id"], "ACTIVATE", dict(status="ADMITTED", grantId=commands[3]["input"]["selectedGrantId"],
            transactionHash=commands[1]["input"]["expectedPins"]["binding"]["paymentHash"], activation="EXPLICIT_LOCAL_OPERATOR", authority="NONE")),
        "closeCommand": canonical_line(dict(version=1, id="acceptance-close", operation="CLOSE", argument=None)),
        "closeReply": reply("acceptance-close", "CLOSE", dict(status="CLOSED")),
    }


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
    require({ENTRY, PROVIDER_ENTRY, PREFLIGHT, CONTRACT, LEDGER_CONTRACT, BUDGET_CONTRACT, SIGNER_CONTRACT, LEDGER_PROBE,
             PROVIDER_CONTRACT, NEGATIVE_CONTRACT, NEGATIVE_REPLY, NEGATIVE_PROBE, "src/api-credit-native-package-admission.js", "src/api-credit-module-catalog.json",
             "src/issued-provider-native-package-admission.js", "src/issued-provider-module-catalog.json"}.issubset(seen))
    for catalog_path in ("src/api-credit-module-catalog.json", "src/issued-provider-module-catalog.json"):
        catalog = json.loads(checked(repo / catalog_path, 262144))
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
    signer = json.loads(data["signerProfile"])["spendingFile"]
    paths += [signer["storageProfile"]["databasePath"], signer["allowedRoot"]]
    provider = json.loads(data["providerProfile"])
    for store in (provider["serviceStore"], provider["intakeStore"]):
        paths += [store["databasePath"], store["allowedRoot"]]
    paths += [provider["funding"]["observerRoot"], provider["journal"]["directory"], provider["journal"]["allowedRoot"]]
    for text in paths:
        path = Path(text)
        require(path.is_absolute() and path != scratch and scratch in path.parents
                and ".." not in path.parts and str(path) == text)
        for ancestor in (path, *path.parents):
            if ancestor.exists() or ancestor.is_symlink():
                require(not stat.S_ISLNK(ancestor.lstat().st_mode))
    databases = [run["configuration"]["storeOptions"]["databasePath"], run["spendingFile"]["storageProfile"]["databasePath"],
                 provider["serviceStore"]["databasePath"], provider["intakeStore"]["databasePath"]]
    require(len(set(databases)) == 4 and all(not Path(path).exists() for path in databases))
    require(not Path(provider["journal"]["directory"]).exists())
    observer_root = Path(provider["funding"]["observerRoot"])
    require(observer_root.is_dir() and observer_root.stat().st_uid == os.getuid()
            and observer_root.stat().st_mode & 0o077 == 0 and next(observer_root.iterdir(), None) is None)


def bounded_stage(node, repo, outdir, payload, deadline, environment, stage, peer=None):
    # Popen.communicate/run timeout helpers are deliberately avoided: run's
    # timeout can kill the child, and communicate accumulates complete output.
    require(stage in ("preflight", "ledger-before", "ledger-after", "service-negatives"))
    require((peer is not None) == (stage == "service-negatives"))
    require(time.monotonic() < deadline)
    if stage != "preflight":
        remaining = int((deadline - time.monotonic()) * 1000)
        require(1 <= remaining <= 120000)
        payload = json.dumps({"version": 1, "maximumOpenMs": remaining, "selection": json.loads(payload)},
                             ensure_ascii=True, separators=(",", ":")).encode()
    entry = PREFLIGHT if stage == "preflight" else NEGATIVE_PROBE if stage == "service-negatives" else LEDGER_PROBE
    require(time.monotonic() < deadline)
    child = subprocess.Popen([str(node), entry], cwd=repo, env=environment,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False)
    report = {"status": "UNKNOWN", "pid": child.pid, "signalsSent": 0, "childExit": None}
    selector = selectors.DefaultSelector(); offset = 0; sizes = {"stdout": 0, "stderr": 0}
    try:
        with fresh_file(outdir / (stage + ".stdout.private.json")) as out, fresh_file(outdir / (stage + ".stderr.private.bin")) as err:
            streams = {child.stdout.fileno(): (out, "stdout", 8192 if stage == "preflight" else 4096), child.stderr.fileno(): (err, "stderr", 128 if stage == "preflight" else 65536)}
            for stream in (child.stdin, child.stdout, child.stderr):
                os.set_blocking(stream.fileno(), False)
            selector.register(child.stdin, selectors.EVENT_WRITE)
            for fd in streams:
                selector.register(fd, selectors.EVENT_READ)
            owned_fds = {child.stdin.fileno(), *streams}
            while any(fd in selector.get_map() for fd in owned_fds):
                require(time.monotonic() < deadline)
                if peer is not None:
                    peer.require_running(); peer.watch(selector)
                for key, events in selector.select(min(0.05, max(0, deadline - time.monotonic()))):
                    try:
                        if peer is not None and key.fd in peer.read_fds():
                            peer.pump_read(key.fd); continue
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
            require(child.wait(timeout=deadline - time.monotonic()) == 0)
            require(stage != "preflight" or sizes["stderr"] == 0)
            if peer is not None: peer.require_running()
            report["status"] = "BOUNDED_STAGE_PROCESS_PASS"
    finally:
        selector.close()
        for stream in (child.stdin, child.stdout, child.stderr):
            stream.close()
        report["childExit"] = child.poll(); report["childObservedLive"] = report["childExit"] is None
        save(outdir / (stage + ".process.private.json"), report)


def ledger_stage(node, repo, outdir, payload, deadline, environment, stage, expected_node, source_pins, selection_digest, budget_selection_digest):
    verify_sources(repo, source_pins); require(binary_pin(node) == expected_node)
    bounded_stage(node, repo, outdir, payload, deadline, environment, stage)
    observed = json.loads(checked(outdir / (stage + ".stdout.private.json"), 4096, True))
    require(observed["version"] == 4 and observed["status"] == "LEDGER_SPENDING_AND_SIGNER_OBSERVATIONS_MATCHED"
            and observed["selectionDigest"] == selection_digest and observed["snapshotAtomicAcrossStores"] is False
            and observed["authority"] == "NONE")
    ledger = observed["ledger"]; spending = observed["spending"]
    require(ledger["status"] == "LEDGER_OBSERVATION_MATCHED" and ledger["storeCloseReturned"] is True
            and ledger["authority"] == "NONE" and ledger["grants"] == 1
            and ledger["requests"] == ledger["successfulExecutions"] == 100
            and ledger["physicalRelease"] == "NOT_ESTABLISHED" and ledger["atomicSnapshot"] is False)
    require(spending["status"] == "SPENDING_OBSERVATION_MATCHED" and spending["selectionDigest"] == selection_digest
            and spending["budgetSelectionDigest"] == budget_selection_digest
            and spending["storeCloseReturned"] is True and spending["authority"] == "NONE"
            and spending["records"] == spending["spent"] == 1 and spending["unresolved"] == 0
            and spending["physicalRelease"] == "NOT_ESTABLISHED" and spending["atomicSnapshot"] is False
            and spending["daySource"] == "RECORDED_HISTORY_ONLY" and spending["mayPrepareFunding"] is False
            and spending["mayDispatchService"] is False)
    signer = observed["signer"]
    require(signer["status"] == "SIGNED_HISTORY_OBSERVATION_MATCHED" and signer["sharedExistingFileOwner"] is True
            and signer["storeCloseReturned"] is True and signer["existingFileProfile"] == "GRANT_RECOVERY_V1"
            and signer["agePolicyCheckedByOwner"] is True and signer["authority"] == "NONE"
            and signer["mayStartPayment"] is False and signer["automaticRetry"] is False
            and signer["maySignPayment"] is False and signer["mayDispatchFunding"] is False
            and signer["mayDispatchService"] is False and signer["physicalRelease"] == "NOT_ESTABLISHED"
            and signer["signatureValidation"] == "NOT_PERFORMED" and signer["signerResponseLoss"] == "NOT_ESTABLISHED")
    return observed


class ProviderProcess:
    """One fixed provider child, selected frames and bounded parent endpoints.

    This source has not run. A response loss cannot select another operation,
    opener or stop attempt. dispose() closes only known parent endpoints; the
    actual child exit/live observation is retained for the outer task owner.
    """
    def __init__(self, node, repo, outdir, plan, bootstrap_ms, deadline, environment):
        self.node, self.repo, self.outdir, self.plan = node, repo, outdir, plan
        self.bootstrap_ms, self.deadline, self.environment = bootstrap_ms, deadline, environment
        self.child = None; self.fds = set(); self.readers = {}; self.writers = {}; self.logs = []
        self.waiting = None; self.buffer = bytearray(); self.errors = bytearray(); self.control_fd = None
        self.report = dict(status="UNKNOWN", pid=None, repliesMatched=0, commandsWritten=0,
                           signalsSent=0, activationEntered=False, closeEntered=False, childExit=None,
                           launchEntered=False, launchReturned=False, childObservedLive=None)

    def start(self, profile, tls):
        require(self.child is None and self.waiting is None and time.monotonic() < self.deadline)
        child_ends = []
        def incoming(data, label):
            read_fd, write_fd = os.pipe(); self.fds.update((read_fd, write_fd)); child_ends.append(read_fd)
            self.writers[write_fd] = dict(data=data, offset=0, label=label)
            return read_fd
        profile_fd = incoming(profile, "profile"); tls_fd = incoming(tls, "tls")
        control_read, self.control_fd = os.pipe(); self.fds.update((control_read, self.control_fd)); child_ends.append(control_read)
        output_read, output_write = os.pipe(); self.fds.update((output_read, output_write)); child_ends.append(output_write)
        require(all(3 <= fd <= 1023 and stat.S_ISFIFO(os.fstat(fd).st_mode) for fd in child_ends))
        for label, cap in (("output", sum(len(self.plan[k]) for k in ("startupReply", "activationReply", "closeReply"))), ("stdout", 0), ("stderr", 65536)):
            stream = fresh_file(self.outdir / ("provider." + label + ".private.bin")); self.logs.append(stream)
            self.readers[label] = dict(stream=stream, cap=cap, size=0, fd=None)
        self.waiting = self.plan["startupReply"]
        self.report["launchEntered"] = True
        self.child = subprocess.Popen([str(self.node), PROVIDER_ENTRY, "--profile-fd", str(profile_fd), "--tls-fd", str(tls_fd),
            "--input-fd", str(control_read), "--output-fd", str(output_write), "--bootstrap-ms", str(self.bootstrap_ms)],
            cwd=self.repo, env=self.environment, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            close_fds=True, pass_fds=tuple(child_ends), shell=False)
        self.report["pid"] = self.child.pid; self.report["launchReturned"] = True
        for fd in child_ends:
            os.close(fd); self.fds.remove(fd)
        for label, fd in (("output", output_read), ("stdout", self.child.stdout.fileno()), ("stderr", self.child.stderr.fileno())):
            self.readers[label]["fd"] = fd; os.set_blocking(fd, False)
        for fd in (*self.writers, self.control_fd):
            os.set_blocking(fd, False)
        self.observe(False)
        require(self.report["repliesMatched"] == 1); self.require_running()
        self.report["startupMatched"] = True

    def require_running(self):
        require(self.child is not None and self.child.poll() is None and not self.report["closeEntered"]
                and all(r["fd"] is not None for r in self.readers.values()))

    def read_fds(self):
        return {r["fd"] for r in self.readers.values() if r["fd"] is not None}

    def watch(self, selector):
        # The buyer drains this same provider's read endpoints while it runs.
        # Reconcile registrations after the single activation exchange too.
        for key in list(selector.get_map().values()):
            if key.data is self:
                selector.unregister(key.fd)
        for fd in self.read_fds():
            selector.register(fd, selectors.EVENT_READ, self)

    def pump_read(self, fd):
        reader = next(r for r in self.readers.values() if r["fd"] == fd)
        try:
            chunk = os.read(fd, 4096)
        except BlockingIOError:
            return
        if not chunk:
            reader["fd"] = None
            if fd in self.fds:
                os.close(fd); self.fds.remove(fd)
            require(self.report["closeEntered"])
            return
        left = max(0, reader["cap"] - reader["size"])
        reader["stream"].write(chunk[:left]); reader["size"] += len(chunk)
        require(reader["size"] <= reader["cap"])
        if reader is self.readers["stderr"]:
            self.errors.extend(chunk)
            require(b"HELD" not in self.errors and b"REFUSED" not in self.errors)
        if reader is self.readers["output"]:
            require(self.waiting is not None)
            self.buffer.extend(chunk)
            require(self.waiting.startswith(self.buffer))
            if bytes(self.buffer) == self.waiting:
                # Startup requires both bootstrap writers to have reached EOF;
                # an operation response requires its complete command write.
                require(not self.writers)
                self.buffer.clear(); self.waiting = None; self.report["repliesMatched"] += 1

    def observe(self, closing):
        selector = selectors.DefaultSelector()
        try:
            while self.waiting is not None or self.writers or closing and self.read_fds():
                require(time.monotonic() < self.deadline)
                for key in list(selector.get_map().values()):
                    selector.unregister(key.fd)
                for fd in self.read_fds():
                    selector.register(fd, selectors.EVENT_READ)
                for fd in self.writers:
                    selector.register(fd, selectors.EVENT_WRITE)
                require(selector.get_map())
                for key, event in selector.select(min(0.05, max(0, self.deadline - time.monotonic()))):
                    if event & selectors.EVENT_READ:
                        self.pump_read(key.fd)
                    else:
                        writer = self.writers[key.fd]
                        try:
                            count = os.write(key.fd, memoryview(writer["data"])[writer["offset"]:])
                        except BlockingIOError:
                            continue
                        require(count > 0); writer["offset"] += count
                        if writer["offset"] == len(writer["data"]):
                            del self.writers[key.fd]
                            if writer["label"] == "command":
                                self.report["commandsWritten"] += 1
                            if writer["label"] != "command" or closing:
                                os.close(key.fd); self.fds.remove(key.fd)
            require(not self.buffer)
        finally:
            selector.close()

    def activate(self):
        self.require_running()
        require(self.report["repliesMatched"] == 1 and not self.report["activationEntered"] and self.waiting is None and not self.writers)
        self.report["activationEntered"] = True
        self.waiting = self.plan["activationReply"]
        self.writers[self.control_fd] = dict(data=self.plan["activationCommand"], offset=0, label="command")
        self.observe(False); self.require_running()
        require(self.report["repliesMatched"] == 2 and self.report["commandsWritten"] == 1)
        self.report["activationMatched"] = True

    def close(self):
        self.require_running()
        require(self.report.get("activationMatched") is True and self.waiting is None and not self.writers)
        self.report["closeEntered"] = True
        self.waiting = self.plan["closeReply"]
        self.writers[self.control_fd] = dict(data=self.plan["closeCommand"], offset=0, label="command")
        self.observe(True)
        require(time.monotonic() < self.deadline)
        require(self.child.wait(timeout=self.deadline - time.monotonic()) == 0
                and bytes(self.errors) == b"ISSUED_PROVIDER_CLOSED\n"
                and self.report["repliesMatched"] == 3 and self.report["commandsWritten"] == 2)
        self.report.update(status="PROVIDER_PROCESS_PROTOCOL_PASS", outputEOF=True, closeMatched=True)

    def dispose(self):
        if self.child is not None:
            self.report["childExit"] = self.child.poll(); self.report["childObservedLive"] = self.report["childExit"] is None
        for fd in self.fds:
            try:
                os.close(fd)
            except OSError:
                pass
        self.fds.clear()
        for stream in self.logs:
            stream.close()
        if self.child is not None:
            self.child.stdout.close(); self.child.stderr.close()
        save(self.outdir / "provider.process.private.json", self.report)


def exchange(node, repo, outdir, name, profile, credential, commands, expected, bootstrap_ms, deadline, environment, peer=None):
    """Anonymous os.pipe descriptors are real FIFOs, unlike Node spawn's
    socket-backed extra stdio. Only this call's child ends are inherited.
    Every next command waits for the complete, predeclared preceding reply.
    """
    require(time.monotonic() < deadline)
    journal = name == "provider-journal"
    require(not journal or credential is None and not commands and peer is None)
    writers = []
    child_ends = []
    all_fds = set()
    child = None
    report = {"phase": name, "status": "UNKNOWN", "childExit": None, "childObservedLive": None,
              "commandsWritten": 0, "repliesMatched": 0, "signalsSent": 0, "retries": 0,
              "launchEntered": False, "launchReturned": False}
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
        args = [str(node), PROVIDER_ENTRY if journal else ENTRY]
        if credential is None:
            args += ["--initialize-journal-fd" if journal else "--recorded-result-fd", str(profile_fd), "--output-fd", str(output_write)]
        else:
            args += ["--profile-fd", str(profile_fd), "--key-fd", str(key_fd),
                     "--input-fd", str(command_read), "--output-fd", str(output_write)]
        args += ["--bootstrap-ms", str(bootstrap_ms)]
        require(time.monotonic() < deadline)
        report["launchEntered"] = True
        child = subprocess.Popen(args, cwd=repo, env=environment, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True,
                                 pass_fds=tuple(child_ends), shell=False)
        report["pid"] = child.pid; report["launchReturned"] = True
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
        while any(key.data is not peer or peer is None for key in selector.get_map().values()):
            require(time.monotonic() < deadline)
            if peer is not None:
                peer.require_running(); peer.watch(selector)
            for key, events in selector.select(min(0.05, max(0, deadline - time.monotonic()))):
                fd = key.fd
                if peer is not None and key.data is peer:
                    peer.pump_read(fd)
                    if fd not in peer.read_fds():
                        selector.unregister(fd)
                    continue
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
                                if peer is not None and at == 2:
                                    # BOUND is not a grant: pause before handoff,
                                    # enter the one preselected local ACTIVATE,
                                    # then require its exact original-grant ACK.
                                    peer.activate()
                                    report["providerActivationMatchedBeforeHandoff"] = True
                                command_index += 1; command_writer["data"] = commands[command_index]; command_writer["offset"] = 0
                                selector.register(command_writer["fd"], selectors.EVENT_WRITE, command_writer)
        require(not reply_buffer and report["repliesMatched"] == len(expected))
        require(credential is None or report["commandsWritten"] == len(commands))
        remaining = deadline - time.monotonic(); require(remaining > 0)
        report["childExit"] = child.wait(timeout=remaining)
        marker = b"ISSUED_PROVIDER_JOURNAL_INITIALIZED\n" if journal else b"API_CREDIT_OPERATOR_CLOSED\n"
        require(report["childExit"] == 0 and bytes(errors).endswith(marker)
                and bytes(errors).count(marker) == 1
                and b"API_CREDIT_OPERATOR_CLOSE_UNKNOWN" not in errors and b"REFUSED" not in errors)
        if peer is not None:
            peer.require_running(); require(report.get("providerActivationMatchedBeforeHandoff") is True)
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
    require(set(manifest) == {"version", "node", "repository", "sourcePins", "fixturePins", "bootstrapMs", "totalMs"} and manifest["version"] == 6)
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
    # Pure preflight precedes both TLS material and buyer credential. Its
    # eleven text inputs are independent; no observed response selects a pin.
    payload = json.dumps({k: v.decode("utf-8") for k, v in data.items()}, ensure_ascii=True, separators=(",", ":")).encode()
    bounded_stage(node, repo, outdir, payload, deadline, environment, "preflight")
    preflight = json.loads(checked(outdir / "preflight.stdout.private.json", 8192, True))
    require(preflight["status"] == "PREFLIGHT_PASS" and preflight["version"] == 6
            and preflight["inputPins"] == {k: pin(v) for k, v in data.items()})
    plan = provider_plan(data)
    require(preflight["providerReplyPins"] == {k: pin(v) for k, v in plan.items()})
    # Explicitly initialize only the selected new private journal. The known
    # close/exit barrier precedes the provider's opener for that same journal.
    verify_sources(repo, manifest["sourcePins"]); require(binary_pin(node) == expected_node)
    journal = exchange(node, repo, outdir, "provider-journal", data["providerJournalProfile"], None, [],
                       [plan["journalReply"]], manifest["bootstrapMs"], deadline, environment)
    require(journal["status"] == "PROCESS_PROTOCOL_PASS" and journal["childObservedLive"] is False)
    tls = bytearray(checked(scratch / FILES["providerTls"], 131080, True))
    credential = bytearray()
    provider = ProviderProcess(node, repo, outdir, plan, manifest["bootstrapMs"], deadline, environment)
    try:
        require(pin(tls) == manifest["fixturePins"]["providerTls"])
        verify_sources(repo, manifest["sourcePins"]); require(binary_pin(node) == expected_node)
        provider.start(data["providerProfile"], tls)
        tls[:] = b"\0" * len(tls)
        # An exact LISTENING reply from the selected provider must precede
        # the first buyer credential read and buyer process acquisition.
        provider.require_running()
        credential.extend(checked(scratch / FILES["credential"], 32, True))
        require(len(credential) == 32 and pin(credential) == manifest["fixturePins"]["credential"])
        verify_sources(repo, manifest["sourcePins"]); require(binary_pin(node) == expected_node)
        provider.require_running()
        run = exchange(node, repo, outdir, "run", data["runProfile"], credential,
                       data["commands"].splitlines(keepends=True), data["runReplies"].splitlines(keepends=True),
                       manifest["bootstrapMs"], deadline, environment, peer=provider)
        require(run["status"] == "PROCESS_PROTOCOL_PASS" and run["childObservedLive"] is False)
        # No further buyer command, credential or economic operation. Three
        # preselected service proof mutations run while this provider is live.
        verify_sources(repo, manifest["sourcePins"]); require(binary_pin(node) == expected_node)
        provider.require_running()
        bounded_stage(node, repo, outdir, payload, deadline, environment, "service-negatives", peer=provider)
        negative = json.loads(checked(outdir / "service-negatives.stdout.private.json", 4096, True))
        require(negative["version"] == 6 and negative["status"] == "SERVICE_NEGATIVE_REPLIES_MATCHED"
                and negative["selectionDigest"] == preflight["selectionDigest"] and negative["negativeRequests"] == 3
                and [row["kind"] for row in negative["observations"]] == preflight["negativeRequestKinds"]
                and all(row["statusCode"] == 401 for row in negative["observations"])
                and negative["authority"] == "NONE" and negative["mayDispatchFunding"] is False
                and negative["additionalGrant"] is False and negative["mayRetry"] is False
                and negative["physicalRelease"] == "NOT_ESTABLISHED")
        provider.close()
    finally:
        credential[:] = b"\0" * len(credential)
        tls[:] = b"\0" * len(tls)
        provider.dispose()
    require(provider.report["status"] == "PROVIDER_PROCESS_PROTOCOL_PASS" and provider.report["childObservedLive"] is False)
    base_payload = json.dumps({k: data[k].decode("utf-8") for k in BASE_INPUT}, ensure_ascii=True, separators=(",", ":")).encode()
    before = ledger_stage(node, repo, outdir, base_payload, deadline, environment, "ledger-before",
                          expected_node, manifest["sourcePins"], preflight["signerSelectionDigest"], preflight["budgetSelectionDigest"])
    verify_sources(repo, manifest["sourcePins"])
    require(binary_pin(node) == expected_node)
    recovery = exchange(node, repo, outdir, "recovery", data["recoveryProfile"], None, [],
                        [data["recoveryReply"]], manifest["bootstrapMs"], deadline, environment)
    require(recovery["status"] == "PROCESS_PROTOCOL_PASS" and recovery["childObservedLive"] is False)
    after = ledger_stage(node, repo, outdir, base_payload, deadline, environment, "ledger-after",
                         expected_node, manifest["sourcePins"], preflight["signerSelectionDigest"], preflight["budgetSelectionDigest"])
    require(before == after)
    save(outdir / "result.private.json", {"version": 6, "status": "PROVIDER_PROCESS_NEGATIVES_LEDGER_SPENDING_AND_SIGNER_OBSERVATIONS_MATCHED", "preflight": preflight,
         "applicationProcesses": 2, "preflightProcesses": 1, "ledgerProbeProcesses": 2, "ledgerSpendingAndSignerObservation": after,
         "providerProcesses": 1, "journalSetupProcesses": 1, "providerActivationCommands": 1, "providerCloseBeforeLedger": True,
         "negativeProbeProcesses": 1, "serviceNegativeObservation": negative, "negativeRequests": 3,
         "changedOfferAcceptance": "NOT_ESTABLISHED", "differentPaymentIdentityAcceptance": "NOT_ESTABLISHED",
         "signalsSent": 0, "automaticRetries": 0, "G1Acceptance": "NOT_ESTABLISHED", "G2Acceptance": "NOT_ESTABLISHED"})
    print("API_CREDIT_LINUX_PROVIDER_PROCESS_NEGATIVES_LEDGER_SPENDING_AND_SIGNER_OBSERVATIONS_MATCHED")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Raw data, private paths, credentials, proofs and exception text stay private.
        print("API_CREDIT_LINUX_ACCEPTANCE_UNKNOWN", file=sys.stderr); sys.exit(1)
