"""DATA-only admission/parser regressions; never a native execution result.

Reads the current public manifest and Python definitions. Synthetic TAP/footer
bytes and fabricated receipt dictionaries test the parser, NOT an application,
SDK, SQL, key, signer, nonce, TLS, Node process, task root or physical cleanup.
"""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).absolute().parent
spec = importlib.util.spec_from_file_location("issued_native_profile_data_test", HERE / "issued_funding_native_profile.py")
profile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(profile)
MANIFEST = json.loads((HERE / "issued-funding-post-native-vertical.inputs-v3.json").read_bytes())


def synthetic(mode="clean"):
    counts = dict(walletKeys=1, walletAddresses=1, walletSignatures=1, capabilityKeys=2, capabilitySignatures=3,
        referenceCandidates=17, referenceWindows=1, independentPinFiles=2, verify=1, firstSettle=1, pendingObserve=2,
        executions=2, rawClientStarts=3, rawAuthenticated=3, rawCleanCloses=3, originalClientRepeatRefusals=1,
        backendExactReplays=1, foreignGrantRefusals=1, sameFileInitialCloses=1, borrowedSqlCloses=2)
    case = dict(mode=mode, caseCompleted=True, counts=counts, expectedHeldV6=mode == "lost-ack",
        taskScratchDisposition="HELD" if mode == "lost-ack" else "PRESERVE_CHILD_FILES", sourceTransforms=0, nativeModuleAliases=0,
        actualApplication=True, actualNativeHTTPS=True, actualOfficialCore=True, sameV6File=True,
        fundingPosts=1, actualClientServiceRequests=2,
        grantActivation="ACTUAL_COMPOSITION_WITH_SYNTHETIC_SIGNED_PROVIDER_ENVELOPES", chainObservations="DECLARED_NOT_AUTHENTICATED",
        producerCandidateReservation=4096, fixedVerificationReservation=16384, aggregateCandidateReservation=17+4096+16384,
        sdkPrepareBlock=False, realPayment=False, productionQualified=False, nativePhysicalDrain="NOT_QUALIFIED")
    namespace = dict(profileKind=profile.KIND, profileVersion=1, mode=mode, inputsVerifiedBeforeCase=521,
        applicationFiles=117, packageFiles=404, declaredSourceBytes=MANIFEST["sourceBytes"], sourceRowsSha256=MANIFEST["sourceRowsSha256"],
        resolveCalls=100, bareImportOverrideHits=8, declaredFilesResolved=100, sourceTransforms=0, nativeBuiltinAliases=0,
        ordinaryInstalledNamespaceQualified=False, nativeOsNetworkSandbox=False)
    receipt = dict(state="COMPLETE", output_complete=True, actual_exit=0)
    return case, namespace, receipt


def transcript(case, namespace, suffix=""):
    return ("# actual-issued-native-vertical " + json.dumps(case) + "\n"
        + "# pinned-issued-native-vertical-namespace " + json.dumps(namespace) + "\n"
        + "1..1\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# cancelled 0\n# todo 0\n" + suffix).encode("ascii")


class ManifestDataTests(unittest.TestCase):
    def refuse(self, change):
        value = copy.deepcopy(MANIFEST)
        change(value)
        with self.assertRaises(ValueError):
            profile.validate_manifest(value)

    def test_complete_current_public_manifest(self):
        self.assertEqual(len(profile.validate_manifest(MANIFEST)), 521)
        self.assertGreater(MANIFEST["sourceBytes"], 4194304)
        self.assertLess(MANIFEST["sourceBytes"], profile.MAX_SOURCE_BYTES)
        self.assertFalse(MANIFEST["effectsCeiling"]["existingSourcesRecopied"])

    def test_missing_or_extra_manifest_field(self):
        for change in (lambda m: m.pop("entry"), lambda m: m.update(extra=True)):
            self.refuse(change)

    def test_graph_not_reduced_to_fit_old_size(self):
        self.refuse(lambda m: m["applicationInputs"].pop())
        self.refuse(lambda m: m["packageInputs"].pop())

    def test_non_object_row_and_escaping_path(self):
        self.refuse(lambda m: m["applicationInputs"].__setitem__(0, False))
        self.refuse(lambda m: m["applicationInputs"][0].update(path="app/../outside.js"))

    def test_changed_critical_source(self):
        def change(m):
            next(r for r in m["applicationInputs"] if r["path"] == profile.ENTRY)["sha256"] = "0" * 64
        self.refuse(change)

    def test_new_bare_edge_or_native_alias(self):
        self.refuse(lambda m: m["bareBindings"].append(dict(parent=profile.ENTRY, specifier="node:https", target=profile.ENTRY)))
        self.refuse(lambda m: m.update(nativeBuiltinAliases=True))

    def test_source_transform_or_installed_namespace_claim(self):
        self.refuse(lambda m: m.update(sourceTransforms=True))
        self.refuse(lambda m: m.update(ordinaryInstalledNamespaceQualified=True))

    def test_changed_package_version(self):
        self.refuse(lambda m: m["packageVersions"].update({"packages/@x402/core/package.json": "2.28.0"}))

    def test_broader_attempt_or_signature_scope(self):
        for key in ("maximumRuns", "capabilitySignatures", "providerSignatures"):
            self.refuse(lambda m, k=key: m["effectsCeiling"].__setitem__(k, 99))

    def test_reduced_free_space_floor(self):
        self.refuse(lambda m: m["storagePolicy"].update(min_free_bytes=0))

    def test_unknown_mode_refuses_before_read_guards(self):
        with self.assertRaisesRegex(ValueError, "EXACT_CASE_MODE"):
            profile.build_profile("NOT_A_PATH", "NOT_A_PATH", MANIFEST, "another-case")


class CaptureDataTests(unittest.TestCase):
    def capture(self, case, namespace, receipt, raw=None):
        return profile.validate_native_capture(transcript(case, namespace) if raw is None else raw, b"", receipt,
            case["mode"], MANIFEST["sourceRowsSha256"], MANIFEST["sourceBytes"])

    def test_declared_clean_data_only(self):
        result = self.capture(*synthetic())
        self.assertFalse(result["productionQualified"])
        self.assertEqual(result["nativePhysicalDrain"], "NOT_QUALIFIED")

    def test_declared_held_data_is_not_cleanup_success(self):
        result = self.capture(*synthetic("lost-ack"))
        self.assertTrue(result["case"]["expectedHeldV6"])
        self.assertEqual(result["case"]["taskScratchDisposition"], "HELD")
        self.assertFalse(result["productionQualified"])

    def test_failed_or_incomplete_receipt(self):
        for patch in (dict(actual_exit=1), dict(actual_exit=False), dict(state="UNKNOWN"), dict(output_complete=False)):
            case, namespace, receipt = synthetic()
            receipt.update(patch)
            with self.assertRaises(ValueError):
                self.capture(case, namespace, receipt)

    def test_zero_tests_or_duplicate_footer(self):
        case, namespace, receipt = synthetic()
        raw = transcript(case, namespace)
        for changed in (raw.replace(b"# tests 1", b"# tests 0"), raw + raw):
            with self.assertRaises(ValueError):
                self.capture(case, namespace, receipt, changed)

    def test_skipped_or_cancelled_is_not_a_pass(self):
        case, namespace, receipt = synthetic()
        for name in (b"skipped", b"cancelled"):
            with self.assertRaises(ValueError):
                self.capture(case, namespace, receipt, transcript(case, namespace).replace(b"# " + name + b" 0", b"# " + name + b" 1"))

    def test_unknown_footer_fields(self):
        for index in (0, 1):
            parts = synthetic()
            parts[index]["unexpected"] = True
            with self.assertRaises(ValueError):
                self.capture(*parts)

    def test_counter_or_namespace_boolean_is_not_integer(self):
        case, namespace, receipt = synthetic()
        case["counts"]["walletKeys"] = True
        with self.assertRaises(ValueError):
            self.capture(case, namespace, receipt)
        case, namespace, receipt = synthetic()
        namespace["profileVersion"] = True
        with self.assertRaises(ValueError):
            self.capture(case, namespace, receipt)

    def test_changed_source_seal_or_mode(self):
        for patch in (dict(sourceRowsSha256="0" * 64), dict(mode="lost-ack"), dict(declaredSourceBytes=1)):
            case, namespace, receipt = synthetic()
            namespace.update(patch)
            with self.assertRaises(ValueError):
                self.capture(case, namespace, receipt)

    def test_excess_nonce_or_native_alias(self):
        for patch in (dict(aggregateCandidateReservation=65537), dict(nativeModuleAliases=1)):
            case, namespace, receipt = synthetic()
            case.update(patch)
            with self.assertRaises(ValueError):
                self.capture(case, namespace, receipt)

    def test_production_or_physical_cleanup_claim(self):
        for patch in (dict(productionQualified=True), dict(nativePhysicalDrain="QUALIFIED")):
            case, namespace, receipt = synthetic()
            case.update(patch)
            with self.assertRaises(ValueError):
                self.capture(case, namespace, receipt)


if __name__ == "__main__":
    unittest.main(verbosity=2)
