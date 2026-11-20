"""Exercise the acceptance runner's exchange with a fixed in-memory transcript."""

from collections import deque
import io
import json
from pathlib import Path
import runpy
from selectors import EVENT_READ, EVENT_WRITE
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import patch


HARNESS = Path(__file__).with_name("api-credit-linux-acceptance.py")
PROFILE = b"synthetic profile"
CREDENTIAL = b"synthetic input"
CLOSED = b"API_CREDIT_OPERATOR_CLOSED\n"


class Transcript:
    def __init__(self, steps, exit_code=0):
        self.steps = deque(steps)
        self.exit_code = exit_code
        self.child_exit = None
        self.pipe_writers = {}
        self.open_fds = set()
        self.registered = {}
        self.files_created = 0
        self.report = None
        self.activations = 0

    def pipe(self):
        reader = 3 + 2 * len(self.pipe_writers)
        writer = reader + 1
        self.pipe_writers[reader] = writer
        self.open_fds.update((reader, writer))
        return reader, writer

    def spawn(self, args, **options):
        assert options["close_fds"] and not options["shell"]
        descriptors = dict(zip(args[2::2], args[3::2], strict=True))
        bootstrap = descriptors.pop("--bootstrap-ms")
        assert bootstrap == "100"
        assert set(map(int, descriptors.values())) == set(options["pass_fds"])
        flags = {
            "--profile-fd": "profile",
            "--initialize-journal-fd": "profile",
            "--recorded-result-fd": "profile",
            "--key-fd": "credential",
            "--input-fd": "command",
        }
        output_writer = int(descriptors.pop("--output-fd"))
        output_reader = next(reader for reader, writer in self.pipe_writers.items() if writer == output_writer)
        self.channels = {"output": (output_reader, EVENT_READ), "stdout": (100, EVENT_READ),
                         "stderr": (101, EVENT_READ)}
        for flag, reader in descriptors.items():
            self.channels[flags[flag]] = (self.pipe_writers[int(reader)], EVENT_WRITE)
        return SimpleNamespace(pid=1, stdout=SimpleNamespace(fileno=lambda: 100, close=lambda: None),
                               stderr=SimpleNamespace(fileno=lambda: 101, close=lambda: None),
                               wait=self.wait, poll=lambda: self.child_exit)

    def wait(self, *, timeout):
        assert timeout > 0 and not self.steps and not self.open_fds
        self.child_exit = self.exit_code
        return self.exit_code

    def open_file(self, _path):
        self.files_created += 1
        return io.BytesIO()

    def save(self, _path, report):
        self.report = dict(report)

    def register(self, fd, events, data):
        assert (fd, events) in self.channels.values()
        assert fd in self.open_fds or fd in (100, 101)
        assert fd not in self.registered
        self.registered[fd] = SimpleNamespace(fd=fd, events=events, data=data)

    def select(self, _timeout):
        name, _payload = self.steps[0]
        fd, events = self.channels[name]
        key = self.registered[fd]
        assert key.events == events
        return [(key, events)]

    def transfer(self, fd, event):
        name, payload = self.steps.popleft()
        assert self.channels[name] == (fd, event)
        return payload

    def write(self, fd, data):
        payload = self.transfer(fd, EVENT_WRITE)
        assert bytes(data[:len(payload)]) == payload
        return len(payload)

    def read(self, fd, limit):
        payload = self.transfer(fd, EVENT_READ)
        assert len(payload) <= limit
        return payload

    def activate(self):
        assert self.steps.popleft() == ("activate", b"")
        self.activations += 1

    def exchange(self, harness, commands, expected, *, phase="run", credential=CREDENTIAL, activate=False):
        os_port = SimpleNamespace(pipe=self.pipe, fstat=lambda fd: SimpleNamespace(st_mode=stat.S_IFIFO),
                                  close=self.open_fds.remove, set_blocking=lambda fd, value: None,
                                  write=self.write, read=self.read)
        selector = SimpleNamespace(register=self.register, unregister=self.registered.pop,
                                   get_map=lambda: self.registered, select=self.select,
                                   close=self.registered.clear)
        process = SimpleNamespace(Popen=self.spawn, DEVNULL=object(), PIPE=object())
        peer = None
        if activate:
            peer = SimpleNamespace(activate=self.activate, require_running=lambda: None, watch=lambda _: None)
        with patch.dict(harness.__globals__, {
            "os": os_port, "selectors": SimpleNamespace(DefaultSelector=lambda: selector,
                                                        EVENT_READ=EVENT_READ, EVENT_WRITE=EVENT_WRITE),
            "subprocess": process, "time": SimpleNamespace(monotonic=lambda: 0),
            "fresh_file": self.open_file, "save": self.save,
        }):
            return harness("node", Path("."), Path("."), phase, PROFILE, credential,
                           commands, expected, 100, 5, {}, peer)


def closed_streams(marker=CLOSED):
    return [("output", b""), ("stdout", b""), ("stderr", marker), ("stderr", b"")]


def dialogue(count, activate=False):
    commands = [f"command {index:03d}\n".encode() for index in range(count)]
    expected = [f"reply {index:03d}\n".encode() for index in range(count)]
    steps = [("profile", PROFILE), ("credential", CREDENTIAL)]
    for index, (command, reply) in enumerate(zip(commands, expected, strict=True)):
        steps.extend((("command", command[:3]), ("command", command[3:]),
                      ("output", reply[:-1]), ("output", reply[-1:])))
        if activate and index == 2:
            steps.append(("activate", b""))
    return Transcript(steps + closed_streams()), commands, expected


class ExchangeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.harness = staticmethod(runpy.run_path(str(HARNESS))["exchange"])

    def check_completion(self, count, activate=False):
        ports, commands, expected = dialogue(count, activate)
        report = ports.exchange(self.harness, commands, expected, activate=activate)
        self.assertEqual(ports.report, report)
        self.assertEqual(report["status"], "PROCESS_PROTOCOL_PASS")
        self.assertEqual(report["commandsWritten"], count)
        self.assertEqual(report["repliesMatched"], count)
        self.assertTrue(report["outputEOF"])
        self.assertFalse(report["childObservedLive"])
        self.assertEqual(ports.activations, int(activate))
        self.assertEqual(report.get("providerActivationMatchedBeforeHandoff", False), activate)

    def test_full_transcript_finishes_after_final_reply(self):
        self.check_completion(106, activate=True)

    def test_single_command_can_finish(self):
        self.check_completion(1)

    def test_command_count_mismatch_refused_before_acquisition(self):
        for commands, expected in (([], []), ([b"command\n"], [])):
            with self.subTest(commands=len(commands), expected=len(expected)):
                ports = Transcript([])
                with self.assertRaisesRegex(ValueError, "^API_CREDIT_LINUX_ACCEPTANCE_REFUSED$"):
                    ports.exchange(self.harness, commands, expected)
                self.assertEqual(ports.files_created, 0)
                self.assertFalse(ports.pipe_writers)

    def test_early_reply_does_not_advance_command(self):
        reply = b"reply\n"
        ports = Transcript([("profile", PROFILE), ("credential", CREDENTIAL),
                            ("command", b"cmd"), ("output", reply)])
        with self.assertRaisesRegex(ValueError, "^API_CREDIT_LINUX_ACCEPTANCE_REFUSED$"):
            ports.exchange(self.harness, [b"cmd more\n"], [reply])
        self.assertEqual(ports.report["commandsWritten"], 0)
        self.assertEqual(ports.report["repliesMatched"], 0)
        self.assertEqual(ports.report["status"], "UNKNOWN")

    def test_missing_final_reply_remains_unknown(self):
        ports = Transcript([("profile", PROFILE), ("credential", CREDENTIAL),
                            ("command", b"command\n"), *closed_streams()])
        with self.assertRaisesRegex(ValueError, "^API_CREDIT_LINUX_ACCEPTANCE_REFUSED$"):
            ports.exchange(self.harness, [b"command\n"], [b"reply\n"])
        self.assertEqual(ports.report["commandsWritten"], 1)
        self.assertEqual(ports.report["repliesMatched"], 0)
        self.assertEqual(ports.report["status"], "UNKNOWN")

    def test_keyless_recorded_result_needs_no_command(self):
        reply = b"recorded\n"
        ports = Transcript([("profile", PROFILE), ("output", reply), *closed_streams()])
        report = ports.exchange(self.harness, [], [reply], phase="recovery", credential=None)
        self.assertEqual(report["status"], "PROCESS_PROTOCOL_PASS")
        self.assertEqual(report["repliesMatched"], 1)

    def test_offer_refusal_has_no_command_or_reply(self):
        marker = b"API_CREDIT_OPERATOR_PUBLIC_PROFILE_REFUSED\n"
        ports = Transcript([("profile", PROFILE), *closed_streams(marker)], exit_code=1)
        report = ports.exchange(self.harness, [], [], phase="offer-refusal", credential=b"")
        self.assertEqual(report["status"], "PUBLIC_PROFILE_REFUSAL_PROCESS_PASS")
        self.assertEqual(report["commandsWritten"], 0)
        self.assertEqual(report["repliesMatched"], 0)


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ExchangeTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print(json.dumps({"scope": "SIMULATED_TRANSCRIPT", "cases": result.testsRun,
                      "passed": result.wasSuccessful(), "nativeExecutions": 0}))
    raise SystemExit(0 if result.wasSuccessful() else 1)
