"""Actual Python profile helpers; fabricated DATA is never native event proof.

No child/SDK import, task storage, SQL, key, signature, nonce, socket or write.
Read only the pinned source manifests/modules. Synthetic identities and failure
frames below are DATA admission inputs, not claims of real process/SQL events.
"""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest

REPO = Path(__file__).absolute().parent.parent


def load_pinned(name, relative, digest):
    path = REPO / relative
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError("PROFILE_TEST_MODULE_PIN")
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); sys.modules[name] = value
    spec.loader.exec_module(value)
    if path.read_bytes() != raw:
        raise ValueError("PROFILE_TEST_SOURCE_CHANGED")
    return value


BASE = load_pinned("actual_frozen_profile_helpers", "qualification/recovery_crash_native_profile.py",
    "75c2c9478b7e792a7bade739161af2bb8fb624cd407924ead2cf822dc23dacbd")
CURRENT = load_pinned("actual_diagnostic_profile_helpers", "qualification/recovery_crash_diagnostic_native_profile.py",
    "a0ad357ee28e1f1f3c81bf41253a1b8506cf36dde6fd2eb6e3064065094cd262")
EXTENSION = (REPO / CURRENT.EXTENSION).read_bytes()
INVENTORY = (REPO / BASE.INVENTORY).read_bytes()
BASELINE = (REPO / BASE.BASELINE).read_bytes()


def selected():
    return CURRENT.capture_extension(BASE, EXTENSION, INVENTORY, BASELINE)


def namespace(mode="seed"):
    return dict(profileKind=CURRENT.KIND, profileVersion=2, mode=mode, sourceRowsSha256=CURRENT.SOURCE_SEAL,
        applicationFiles=134, packageFiles=404, inputsVerifiedBeforeCase=538, declaredSourceBytes=CURRENT.SOURCE_BYTES,
        baselineApplication117Preserved=True, baselinePackages404Preserved=True, baselineCrashApplication130Preserved=True,
        resolveCalls=12, bareImportOverrideHits=2, declaredFilesResolved=8, sourceTransforms=0,
        nativeBuiltinAliases=0, ordinaryInstalledNamespaceQualified=False, nativeOsNetworkSandbox=False)


def diagnostic():
    return dict(diagnosticVersion=1, kind="PINNED_SOURCE_OPERATION_CURSOR_NOT_NATIVE_AUTHENTICATION",
        stagesEntered=20, lastStage="SUBMIT_ORIGINAL_FUNDING", lastReturnedPhase="SUBMISSION_OUTCOME_UNKNOWN",
        failed=True, safeErrorCode="ERR_ASSERTION", measurementUnknown=False, authority="NONE")


def blob(raw):
    return dict(bytes=len(raw), sha256=BASE.sha(raw), base64=base64.b64encode(raw).decode("ascii"))


def fabricated_failure(data=None, **change):
    """Fabricated parser input; NOT a command or process observation."""
    if data is None:
        data = diagnostic()
    raw = b"# x402-native-operation-failure " + BASE.canonical(data) + b"\n"
    value = dict(captureVersion=1, kind="OWNED_ISSUED_CRASH_PAIR_PRIVATE_CAPTURE_NOT_PRODUCTION",
        status="FAILED_OR_UNKNOWN_PRESERVE_EVIDENCE", sourceRowsSha256=CURRENT.SOURCE_SEAL,
        seed=dict(stderrComplete=True, stderr=blob(raw)), recovery=None)
    value.update(change)
    stdout, stderr = BASE.canonical(value) + b"\n", b""
    receipt = dict(state="COMPLETE", output_complete=True, actual_exit=1,
        stdout=dict(bytes=len(stdout), sha256=BASE.sha(stdout)), stderr=dict(bytes=0, sha256=BASE.sha(stderr)))
    return stdout, stderr, receipt


class ActualDiagnosticProfileDataTests(unittest.TestCase):
    def test_full_frozen_rows_cannot_be_replaced_by_smaller_graph(self):
        got = selected()
        previous = BASE.capture_inventory(INVENTORY, BASELINE)
        old = {r["path"]: r for r in previous["rows"]}
        current = {r["path"]: r for r in got["rows"]}
        self.assertEqual(len(current), 538)
        self.assertTrue(all(current[k] == v for k, v in old.items()))
        self.assertEqual(got["authority"], "NONE"); self.assertFalse(got["effectsExecuted"])

    def test_frozen_binding_metadata_matches_preloader_comparison_order(self):
        old, baseline = json.loads(INVENTORY), json.loads(BASELINE)
        self.assertEqual(old["allowedBuiltins"], baseline["allowedBuiltins"])
        self.assertEqual(list(old["packageVersions"].items()), list(baseline["packageVersions"].items()))

    def test_pinned_extension_and_each_frozen_manifest_reject_changed_bytes(self):
        for args in [(EXTENSION + b" ", INVENTORY, BASELINE), (EXTENSION, INVENTORY + b" ", BASELINE),
                     (EXTENSION, INVENTORY, BASELINE + b" ")]:
            with self.subTest(position=[x is y for x, y in zip(args, (EXTENSION, INVENTORY, BASELINE))]):
                with self.assertRaises(ValueError):
                    CURRENT.capture_extension(BASE, *args)

    def test_new_namespace_admits_exact_declared_superset_not_execution(self):
        self.assertIsNone(CURRENT.validate_namespace(BASE, namespace(), "seed"))
        self.assertIsNone(CURRENT.validate_namespace(BASE, namespace("recover"), "recover"))

    def test_legacy_kind_count_or_seal_cannot_be_relabelled(self):
        for edit in [{"profileKind": BASE.KIND}, {"profileVersion": 1}, {"applicationFiles": 130},
                     {"inputsVerifiedBeforeCase": 534}, {"sourceRowsSha256": BASE.SOURCE_SEAL},
                     {"declaredSourceBytes": BASE.SOURCE_BYTES}]:
            with self.subTest(edit=edit), self.assertRaises(ValueError):
                CURRENT.validate_namespace(BASE, {**namespace(), **edit}, "seed")

    def test_namespace_rejects_missing_extra_and_unknown_mode(self):
        missing = namespace(); del missing["baselineCrashApplication130Preserved"]
        for value, mode in [(missing, "seed"), ({**namespace(), "extra": True}, "seed"),
                            (namespace("other"), "other"), (namespace("recover"), "seed")]:
            with self.assertRaises(ValueError):
                CURRENT.validate_namespace(BASE, value, mode)

    def test_namespace_counter_types_and_bounds_are_exact(self):
        for edit in [{"resolveCalls": True}, {"profileVersion": True}, {"declaredFilesResolved": 539},
                     {"resolveCalls": 8193}, {"bareImportOverrideHits": 13}, {"sourceTransforms": 1}]:
            with self.subTest(edit=edit), self.assertRaises(ValueError):
                CURRENT.validate_namespace(BASE, {**namespace(), **edit}, "seed")

    def test_namespace_cannot_claim_authority_or_drop_preservation(self):
        for edit in [{"baselineApplication117Preserved": False}, {"baselinePackages404Preserved": False},
                     {"baselineCrashApplication130Preserved": False}, {"ordinaryInstalledNamespaceQualified": True},
                     {"nativeOsNetworkSandbox": True}, {"nativeBuiltinAliases": 1}]:
            with self.subTest(edit=edit), self.assertRaises(ValueError):
                CURRENT.validate_namespace(BASE, {**namespace(), **edit}, "seed")

    def test_synthetic_capture_plan_keeps_identity_authentication_false(self):
        rows = selected()["rows"]; captures = []
        for row in rows:
            is_app = row["path"].startswith("app/")
            root, tail = ("/synthetic-app", row["path"][4:]) if is_app else ("/synthetic-packages", row["path"][9:])
            captures.append(dict(logicalPath=row["path"], url=BASE.source_url(root, tail),
                **{k: row[k] for k in ("bytes", "LF", "sha256", "gitBlob")},
                identity=["1", str(len(captures) + 1), "1", "1", "33152", "1", str(row["bytes"]), "1", "1"]))
        before = BASE.canonical(captures)
        planned = CURRENT.plan_private_profile(BASE, EXTENSION, INVENTORY, BASELINE, captures, "/synthetic-app", "/synthetic-packages")
        self.assertFalse(planned["capturedIdentitiesAuthenticated"]); self.assertFalse(planned["effectsExecuted"])
        self.assertEqual(planned["authority"], "NONE")
        data = json.loads(planned["profileBytes"])
        self.assertEqual(data["profileVersion"], 2); self.assertEqual(len(data["inputs"]), 538)
        self.assertEqual(len(data["bareBindings"]), 12); self.assertEqual(BASE.canonical(captures), before)
        captures[0]["url"] = captures[1]["url"]
        with self.assertRaises(ValueError):
            CURRENT.plan_private_profile(BASE, EXTENSION, INVENTORY, BASELINE, captures, "/synthetic-app", "/synthetic-packages")

    def test_failure_parser_retains_bounded_data_and_denies_native_authentication(self):
        result = CURRENT.observe_failed_capture(BASE, *fabricated_failure())
        self.assertEqual(result["role"], "seed"); self.assertEqual(result["diagnostic"], diagnostic())
        self.assertFalse(result["nativeEventsAuthenticated"]); self.assertFalse(result["nativeCrashQualified"])
        self.assertEqual(result["authority"], "NONE")

    def test_failure_parser_rejects_error_material_extra_fields_and_unlisted_values(self):
        for edit in [{"message": "PRIVATE_MESSAGE"}, {"cause": {"data": "PRIVATE_VALUE"}},
                     {"safeErrorCode": "PRIVATE_CODE"}, {"lastStage": "PRIVATE_PATH"},
                     {"lastReturnedPhase": "PRIVATE_PAYMENT"}, {"authority": "RETRY"}, {"failed": False}]:
            with self.subTest(edit=edit):
                result = CURRENT.observe_failed_capture(BASE, *fabricated_failure({**diagnostic(), **edit}))
                self.assertIsNone(result)

    def test_failure_parser_rejects_missing_field_bool_count_and_bad_version(self):
        missing = diagnostic(); del missing["safeErrorCode"]
        for value in [missing, {**diagnostic(), "stagesEntered": True}, {**diagnostic(), "stagesEntered": 129},
                      {**diagnostic(), "diagnosticVersion": True}, {**diagnostic(), "measurementUnknown": "false"}]:
            self.assertIsNone(CURRENT.observe_failed_capture(BASE, *fabricated_failure(value)))

    def test_failure_parser_cannot_use_legacy_or_non_failed_parent_capture(self):
        for edit in [{"sourceRowsSha256": BASE.SOURCE_SEAL}, {"captureVersion": True},
                     {"status": "OBSERVED_PROCESS_PAIR_PROTOCOL_COMPLETE"}]:
            self.assertIsNone(CURRENT.observe_failed_capture(BASE, *fabricated_failure(**edit)))

    def test_failure_parser_requires_complete_digest_bound_nonzero_receipt(self):
        for edit in [{"actual_exit": 0}, {"actual_exit": True}, {"output_complete": False}, {"state": "UNKNOWN"},
                     {"stdout": {"bytes": 0, "sha256": "0" * 64}}]:
            out, err, receipt = fabricated_failure()
            self.assertIsNone(CURRENT.observe_failed_capture(BASE, out, err, {**receipt, **edit}))

    def test_failure_parser_rejects_partial_duplicate_or_digest_mismatched_child_stream(self):
        out, err, receipt = fabricated_failure()
        value = json.loads(out); value["seed"]["stderrComplete"] = False
        self.assertIsNone(CURRENT.observe_failed_capture(BASE, *fabricated_failure(seed=value["seed"])))
        raw = b"# x402-native-operation-failure " + BASE.canonical(diagnostic()) + b"\n"
        for child in [dict(stderrComplete=True, stderr=blob(raw + raw)),
                      dict(stderrComplete=True, stderr={**blob(raw), "sha256": "0" * 64})]:
            self.assertIsNone(CURRENT.observe_failed_capture(BASE, *fabricated_failure(seed=child)))

    def test_success_validator_does_not_admit_a_diagnostic_failure(self):
        with self.assertRaises(ValueError):
            CURRENT.validate_native_capture(BASE, *fabricated_failure())

    def test_failure_data_is_detached_and_does_not_upgrade_unknown(self):
        original = diagnostic(); original["measurementUnknown"] = True
        result = CURRENT.observe_failed_capture(BASE, *fabricated_failure(original))
        original["lastStage"] = "PRIVATE"; self.assertEqual(result["diagnostic"]["lastStage"], "SUBMIT_ORIGINAL_FUNDING")
        self.assertTrue(result["diagnostic"]["measurementUnknown"])
        self.assertIsNone(CURRENT.observe_failed_capture(BASE, b"partial", b"", {}))


if __name__ == "__main__":
    if not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode):
        raise ValueError("ISOLATED_DATA_TEST_REQUIRED")
    unittest.main()
