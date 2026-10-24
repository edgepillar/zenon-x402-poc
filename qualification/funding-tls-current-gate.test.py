"""Actual pure gate tests. PEM fixtures are NOT keys/certificates or DER.
No native TLS, manager import, storage task, process child, socket or writes.
"""
import base64
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest

REPO = Path(__file__).absolute().parent.parent
SPEC = importlib.util.spec_from_file_location("funding_tls_current_gate", REPO / "qualification/funding_tls_current_gate.py")
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


def synthetic():
    # These are data-only source-map fixtures, never executed application code.
    # Real current application admission is a SEPARATE source-only CLI check.
    sources = {name: b"// synthetic source-map input, not executed\n" for name in gate.INPUT_NAMES}
    sources["package.json"] = b'{"type":"module"}\n'
    sources[gate.POLICY] = json.dumps(gate.policy()).encode("ascii")
    manifest = dict(kind="ONE_CURRENT_FUNDING_TLS_SOURCE_SELECTION_NOT_A_RESULT",
        inputs=[], sourceRowsSha256="", imports={}, effectsCeiling=gate.ceiling())
    refresh(manifest, sources)
    return manifest, sources


def refresh(manifest, sources):
    manifest["inputs"] = [gate.pin(name, sources[name]) for name in gate.INPUT_NAMES]
    manifest["sourceRowsSha256"] = hashlib.sha256(gate.canonical(manifest["inputs"])).hexdigest()
    manifest["imports"] = {name: gate.IMPORT.findall(sources[name].decode("ascii"))
        for name in (*gate.APPLICATION, gate.ENTRY, gate.BODY)}


def pem(label, raw=b"synthetic-framing-not-DER"):
    return b"-----BEGIN " + label + b"-----\n" + base64.b64encode(raw) + b"\n-----END " + label + b"-----\n"


def capture(counts=None):
    lines = ["TAP version 13", "1..4", "# tests 4", "# pass 4", "# fail 0", "# skipped 0", "# cancelled 0", "# todo 0"]
    lines.append("# funding-post-native-loopback-tls-current " + json.dumps(gate.native_counts() if counts is None else counts))
    return ("\n".join(lines) + "\n").encode("ascii")


class CurrentFundingTlsGateTests(unittest.TestCase):
    def test_01_synthetic_manifest_schema_and_eleven_source_map_rows(self):
        manifest, sources = synthetic()
        summary = gate.validate_manifest(manifest, sources)
        self.assertEqual(summary, dict(sourceInputs=11, productionModules=4, selectedCases=4,
            maximumRuns=1, effectsExecuted=False, authority="NONE"))

    def test_02_changed_source_is_not_relabelled_as_current(self):
        manifest, sources = synthetic(); sources[gate.APPLICATION[0]] += b"\n"
        with self.assertRaisesRegex(ValueError, "SOURCE_PIN"):
            gate.validate_manifest(manifest, sources)

    def test_03_missing_extra_or_reordered_sources_are_refused(self):
        manifest, sources = synthetic()
        variants = [dict(list(sources.items())[1:]), dict(sources, extra=b"x"), dict(reversed(list(sources.items())))]
        for variant in variants:
            with self.assertRaisesRegex(ValueError, "EXACT_SOURCE_SET"):
                gate.validate_manifest(manifest, variant)

    def test_04_a_second_native_attempt_is_outside_this_selection(self):
        manifest, sources = synthetic(); manifest["effectsCeiling"]["maximumRuns"] = 2
        with self.assertRaisesRegex(ValueError, "EXACT_ONE_ATTEMPT_SCOPE"):
            gate.validate_manifest(manifest, sources)

    def test_05_boolean_or_float_numeric_ceiling_aliases_are_refused(self):
        manifest, sources = synthetic()
        for value in (True, 1.0, "1"):
            variant = copy.deepcopy(manifest); variant["effectsCeiling"]["maximumRuns"] = value
            with self.assertRaisesRegex(ValueError, "EXACT_ONE_ATTEMPT_SCOPE"):
                gate.validate_manifest(variant, sources)

    def test_06_even_rehashed_package_or_process_imports_are_refused(self):
        for edge in ("node:child_process", "node:sqlite", "@x402/core"):
            manifest, sources = synthetic()
            sources[gate.APPLICATION[0]] += ("\nimport '" + edge + "';\n").encode("ascii")
            refresh(manifest, sources)
            with self.assertRaisesRegex(ValueError, "OUTSIDE_SELECTION"):
                gate.validate_manifest(manifest, sources)

    def test_07_rehashed_aliases_or_nonliteral_imports_cannot_escape_the_closed_graph(self):
        for extra in (b"\nimport './service-credit-funding-post-native-response.js?other';\n", b"\nawait import(runtimeValue);\n"):
            manifest, sources = synthetic()
            sources[gate.APPLICATION[0]] += extra
            refresh(manifest, sources)
            with self.assertRaisesRegex(ValueError, "IMPORT_OUTSIDE_SELECTION"):
                gate.validate_manifest(manifest, sources)

    def test_08_rehashed_store_policy_cannot_allow_more_tasks_or_less_floor(self):
        for field, value in (("max_tasks", 2), ("min_free_bytes", 0)):
            manifest, sources = synthetic(); policy = gate.policy(); policy[field] = value
            sources[gate.POLICY] = json.dumps(policy).encode("ascii"); refresh(manifest, sources)
            with self.assertRaisesRegex(ValueError, "EXACT_STORE_POLICY"):
                gate.validate_manifest(manifest, sources)

    def test_09_synthetic_pem_pair_is_exactly_detached_in_either_order(self):
        cert = pem(b"CERTIFICATE")
        for label in (b"PRIVATE KEY", b"RSA PRIVATE KEY"):
            key = pem(label)
            for combined in (key + cert, cert + b"\n" + key):
                self.assertEqual(gate.split_test_tls_stdout(combined), {"tls-key.pem": key, "tls-cert.pem": cert})

    def test_10_duplicate_key_or_certificate_blocks_are_refused(self):
        key, cert = pem(b"PRIVATE KEY"), pem(b"CERTIFICATE")
        for combined in (key + key + cert, key + cert + cert, pem(b"RSA PRIVATE KEY") + key + cert):
            with self.assertRaisesRegex(ValueError, "TLS_PEM_BLOCK_SET"):
                gate.split_test_tls_stdout(combined)

    def test_11_missing_extra_or_unknown_pem_blocks_are_refused(self):
        key, cert = pem(b"PRIVATE KEY"), pem(b"CERTIFICATE")
        for combined in (key, cert, key + pem(b"CERTIFICATE REQUEST"), b"extra\n" + key + cert):
            with self.assertRaises(ValueError):
                gate.split_test_tls_stdout(combined)

    def test_12_capture_size_crlf_terminator_and_line_bounds_are_enforced(self):
        key, cert = pem(b"PRIVATE KEY"), pem(b"CERTIFICATE")
        variants = [b"x" * 16385, (key + cert).replace(b"\n", b"\r\n"), key + cert[:-1],
            key.replace(b"-----END", b"-----WRONG") + cert,
            key.replace(base64.b64encode(b"synthetic-framing-not-DER"), b"A" * 68) + cert]
        for combined in variants:
            with self.assertRaises(ValueError):
                gate.split_test_tls_stdout(combined)

    def test_13_invalid_or_noncanonical_base64_is_not_key_material(self):
        key, cert = pem(b"PRIVATE KEY", b"\0"), pem(b"CERTIFICATE")
        for payload in (b"AB==", b"!A==", b"A", b"A==="):
            with self.assertRaises(ValueError):
                gate.split_test_tls_stdout(key.replace(b"AA==", payload) + cert)

    def test_14_exact_synthetic_capture_validates_data_not_native_execution(self):
        self.assertEqual(gate.validate_native_capture(capture(), b"", 0, True), gate.native_counts())

    def test_15_failed_incomplete_or_noninteger_exit_is_never_success(self):
        for actual_exit, complete in ((1, True), (None, True), (False, True), (0, False)):
            with self.assertRaisesRegex(ValueError, "NATIVE_FAILURE_OR_UNKNOWN"):
                gate.validate_native_capture(capture(), b"", actual_exit, complete)

    def test_16_old_duplicate_ambiguous_or_different_footer_and_tap_are_refused(self):
        original = capture()
        counts = gate.native_counts(); counts["responseFlowsStarted"] = 3
        variants = [original.replace(b"loopback-tls-current ", b"loopback-tls "), original + original,
            original.replace(b"# pass 4\n", b"# pass 4\n# pass 0\n"), original.replace(b"1..4\n", b""),
            original.replace(b"# todo 0\n", b"# todo 1\n"), capture(counts)]
        for stdout in variants:
            with self.assertRaises(ValueError):
                gate.validate_native_capture(stdout, b"", 0, True)


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(CurrentFundingTlsGateTests))
    passed = result.wasSuccessful() and result.testsRun == 16 and not result.skipped
    print(json.dumps(dict(event="CURRENT_FUNDING_TLS_PURE_GATE_TESTS", tests=result.testsRun,
        pythonVersion=sys.version.split()[0], platform=sys.platform, bytecodeDisabled=sys.dont_write_bytecode,
        passed=result.testsRun - len(result.failures) - len(result.errors) - len(result.skipped),
        failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
        nativeTlsExecuted=False, OpenSslCommands=0, nodeCommands=0, managerImported=False,
        newManagedRoots=0, newManagedTasks=0, qualificationScratchBytes=0, privateKeysGenerated=0,
        pemDataIsSyntheticNotCryptographic=True, sourceMapsAreSyntheticNotApplicationRuns=True, authority="NONE")))
    sys.exit(0 if passed else 1)
