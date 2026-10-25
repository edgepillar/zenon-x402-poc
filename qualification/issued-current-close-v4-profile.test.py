"""DATA/source tests only. Synthetic transcripts are NOT native evidence."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent
spec = importlib.util.spec_from_file_location("current_close_v4_data_profile", HERE / "issued_current_close_v4_profile.py")
profile = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = profile
spec.loader.exec_module(profile)
launcher_spec = importlib.util.spec_from_file_location("current_close_v4_data_launcher", HERE / "run-issued-current-close-v4.local.py")
launcher = importlib.util.module_from_spec(launcher_spec)
launcher_spec.loader.exec_module(launcher)
DELTA = json.loads((HERE / "issued-current-close-v4.inputs.json").read_bytes())
BASELINE = json.loads((HERE.parent / profile.BASE["path"]).read_bytes())


def synthetic():
    counts = dict(walletKeys=1, walletAddresses=1, walletSignatures=1, capabilityKeys=2, capabilitySignatures=3,
        referenceCandidates=17, referenceWindows=1, independentPinFiles=2, verify=1, firstSettle=1,
        pendingObserve=2, executions=2, rawClientStarts=3, rawAuthenticated=3, rawCleanCloses=3,
        originalClientRepeatRefusals=1, backendExactReplays=1, foreignGrantRefusals=1,
        sameFileInitialCloses=1, borrowedSqlCloses=2)
    close = dict(wholeCloseBudgetObserved=True, budgetMs=1000, outcome="CLOSED", observationStarts=1,
        completionProbeEntries=1, operationDrain="DRAINED", fundingClose="CLOSED", serviceClose="CLOSED",
        historicalClose="FULFILLED_UNDEFINED", applicationSlotHeld=False, currentFundingClosed=True,
        currentServiceClosed=True, actualFundingStoreCloseReturned=True)
    case = dict(mode="clean", caseCompleted=True, counts=counts, expectedHeldV6=False,
        taskScratchDisposition="PRESERVE_CHILD_FILES", closeProof=close, sourceTransforms=0, nativeModuleAliases=0,
        actualApplication=True, actualNativeHTTPS=True, actualOfficialCore=True, sameV6File=True,
        fundingPosts=1, actualClientServiceRequests=2,
        grantActivation="ACTUAL_COMPOSITION_WITH_SYNTHETIC_SIGNED_PROVIDER_ENVELOPES",
        chainObservations="DECLARED_NOT_AUTHENTICATED", producerCandidateReservation=4096,
        fixedVerificationReservation=16384, aggregateCandidateReservation=17+4096+16384,
        sdkPrepareBlock=False, realPayment=False, productionQualified=False, nativePhysicalDrain="NOT_QUALIFIED")
    namespace = dict(profileKind=profile.KIND, profileVersion=4, mode="clean", inputsVerifiedBeforeCase=527,
        applicationFiles=123, packageFiles=404, declaredSourceBytes=DELTA["resolvedSourceBytes"],
        sourceRowsSha256=DELTA["resolvedSourceRowsSha256"], resolveCalls=200, bareImportOverrideHits=8,
        declaredFilesResolved=100, sourceTransforms=0, nativeBuiltinAliases=0,
        ordinaryInstalledNamespaceQualified=False, nativeOsNetworkSandbox=False)
    receipt = dict(state="COMPLETE", output_complete=True, actual_exit=0)
    return case, namespace, receipt


def transcript(case, namespace, extra=""):
    return ("TAP version 13\nok 1 - SYNTHETIC PARSER FIXTURE NOT A NATIVE RUN\n"
        "# actual-issued-native-close-completion-v4 " + json.dumps(case) + "\n"
        "# pinned-issued-native-current-close-v4-namespace " + json.dumps(namespace) + "\n"
        "1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n" + extra).encode()


class CurrentFullGraphDataTests(unittest.TestCase):
    def reject_delta(self, change):
        value = copy.deepcopy(DELTA)
        change(value)
        with self.assertRaises(ValueError):
            profile.expand_manifest(value, BASELINE)

    def test_full_117_404_baseline_is_retained_in_current_123_404_selection(self):
        rows = profile.expand_manifest(DELTA, BASELINE)
        self.assertEqual(len(rows), 527)
        self.assertTrue({r["path"] for r in BASELINE["applicationInputs"]}.issubset({r["path"] for r in rows}))
        self.assertEqual([r for r in rows if r["path"].startswith("packages/")],
            sorted(BASELINE["packageInputs"], key=lambda r: r["path"]))

    def test_exact_eight_changes_and_six_additions_include_real_new_close_owner(self):
        self.assertEqual(len(DELTA["applicationReplacements"]), 8)
        self.assertEqual(len(DELTA["applicationAdditions"]), 6)
        names = {r["path"] for r in profile.expand_manifest(DELTA, BASELINE)}
        self.assertIn("app/src/service-credit-bounded-close-completion.js", names)
        self.assertIn(profile.ENTRY, names)
        self.assertIn(profile.PRELOAD, names)

    def test_reduced_application_or_package_counts_are_rejected(self):
        for key, value in (("resolvedApplicationFiles", 117), ("packageFiles", 403)):
            with self.subTest(key=key):
                self.reject_delta(lambda d: d.__setitem__(key, value))

    def test_booleans_are_not_integer_source_or_run_counters(self):
        for key in ("resolvedApplicationFiles", "packageFiles", "version", "nativeCasesExecuted"):
            with self.subTest(key=key):
                self.reject_delta(lambda d: d.__setitem__(key, True if key != "nativeCasesExecuted" else False))

    def test_baseline_content_mutation_cannot_be_relabelled(self):
        value = copy.deepcopy(BASELINE)
        value["packageInputs"].pop()
        with self.assertRaises(ValueError):
            profile.expand_manifest(DELTA, value)

    def test_malformed_replacement_payloads_refuse_without_attribute_execution(self):
        for value in (None, 7, [], "NOT_A_ROW"):
            with self.subTest(value=value):
                self.reject_delta(lambda d: d["applicationReplacements"][0].__setitem__("input", value))

    def test_wrong_old_source_binding_is_rejected(self):
        self.reject_delta(lambda d: d["applicationReplacements"][0].__setitem__("beforeSha256", "0"*64))

    def test_changed_current_native_source_digest_is_not_silently_refreshed(self):
        self.reject_delta(lambda d: d["applicationReplacements"][0]["input"].__setitem__("sha256", "0"*64))

    def test_addition_cannot_shadow_a_baseline_row(self):
        self.reject_delta(lambda d: d["applicationAdditions"][0].__setitem__("path", BASELINE["applicationInputs"][0]["path"]))

    def test_missing_close_owner_addition_is_rejected(self):
        self.reject_delta(lambda d: d.__setitem__("applicationAdditions", [
            r for r in d["applicationAdditions"] if r["path"] != "app/src/service-credit-bounded-close-completion.js"]))

    def test_extra_package_override_is_not_an_application_addition(self):
        self.reject_delta(lambda d: d["applicationAdditions"].append(copy.deepcopy(BASELINE["packageInputs"][0])))

    def test_rows_reject_path_escape_extra_fields_boolean_bytes_and_bad_digests(self):
        original = DELTA["applicationAdditions"][0]
        for delta in (dict(path="app/../escape.js"), dict(bytes=True), dict(LF=-1), dict(sha256="NO"), dict(extra=True)):
            with self.subTest(delta=delta):
                with self.assertRaises(ValueError):
                    profile.row({**original, **delta})

    def test_source_seal_or_byte_total_drift_is_rejected(self):
        self.reject_delta(lambda d: d.__setitem__("resolvedSourceRowsSha256", "0"*64))
        self.reject_delta(lambda d: d.__setitem__("resolvedSourceBytes", d["resolvedSourceBytes"]+1))

    def test_ordinary_namespace_aliases_and_transforms_are_rejected(self):
        self.reject_delta(lambda d: d.__setitem__("nativeBuiltinAliases", True))
        self.reject_delta(lambda d: d.__setitem__("sourceTransforms", True))
        self.reject_delta(lambda d: d["bareBindings"].append(dict(parent=profile.ENTRY, specifier="node:sqlite", target=profile.ENTRY)))

    def test_package_versions_and_builtin_additions_are_exact(self):
        self.reject_delta(lambda d: d["packageVersions"].__setitem__("packages/@x402/core/package.json", "OTHER"))
        self.reject_delta(lambda d: d["allowedBuiltins"].append("node:child_process"))

    def test_task_policy_cannot_create_or_override_a_root_or_coerce_boolean_limits(self):
        for key, value in (("existingApprovedRootOnly", False), ("rootPolicyOverride", True),
            ("maximumRuns", True), ("existingApprovedRootOnly", 1), ("rootPolicyOverride", 0)):
            with self.subTest(key=key, value=value):
                self.reject_delta(lambda d: d["taskPolicy"].__setitem__(key, value))

    def test_no_silent_more_keys_signatures_nonce_or_connections(self):
        for key in ("syntheticEd25519Keys", "transactionSignatures", "maxAggregateCandidates", "maxTotalConnections", "maximumRuns"):
            with self.subTest(key=key):
                self.reject_delta(lambda d: d["effectsCeiling"].__setitem__(key, d["effectsCeiling"][key]+1))

    def test_control_source_set_cannot_include_a_writer_or_path_escape(self):
        self.reject_delta(lambda d: d["controlInputs"][0].__setitem__("path", "qualification/../writer.py"))
        self.reject_delta(lambda d: d["controlInputs"].pop())

    def test_nonclean_mode_refuses_before_reading_any_root_or_package(self):
        with patch.object(profile, "load_selection", side_effect=AssertionError("NO_ROOT_READ")):
            for mode in ("lost-ack", None, False, "clean "):
                with self.subTest(mode=mode), self.assertRaises(ValueError):
                    profile.build_profile("NOT_A_ROOT", "NOT_A_PACKAGE_ROOT", DELTA, mode)


class ReservationScopeDataTests(unittest.TestCase):
    def setUp(self):
        self.root = Path("/synthetic/managed/current")
        self.previous = ["/synthetic/managed/previous"]

    def test_complete_data_scope_is_order_independent(self):
        discovered = [str(self.root), *self.previous]
        self.assertEqual(launcher.reservation_scope(self.root, self.previous, list(reversed(discovered))), sorted(discovered))

    def test_more_than_32_roots_can_be_declared_without_omitting_reservations(self):
        previous = ["/synthetic/managed/root-" + str(i) for i in range(106)]
        self.assertEqual(len(launcher.reservation_scope(self.root, previous, [str(self.root), *previous])), 107)

    def test_omitted_discovered_root_refuses_even_if_supplied_subset_would_fit(self):
        with self.assertRaisesRegex(ValueError, "ALL_DISCOVERED_RESERVATION_ROOTS_REQUIRED"):
            launcher.reservation_scope(self.root, self.previous, [str(self.root), *self.previous, "/synthetic/managed/omitted"])

    def test_extra_or_duplicate_discovered_root_is_not_silently_ignored(self):
        for discovered in ([str(self.root)], [str(self.root), *self.previous, *self.previous]):
            with self.subTest(discovered=discovered), self.assertRaises(ValueError):
                launcher.reservation_scope(self.root, self.previous, discovered)

    def test_relative_non_sibling_or_duplicate_supplied_roots_refuse(self):
        for previous in (["relative"], ["/other/managed/root"], [str(self.root)], self.previous * 2,
            ["/synthetic/managed/../escape"], [True]):
            with self.subTest(previous=previous), self.assertRaises(ValueError):
                launcher.reservation_scope(self.root, previous)

    def test_empty_wrong_type_and_oversized_scope_refuse(self):
        for previous in ([], None, tuple(self.previous), ["/synthetic/managed/" + str(i) for i in range(128)]):
            with self.subTest(size=None if previous is None else len(previous)), self.assertRaises(ValueError):
                launcher.reservation_scope(self.root, previous)

    def test_synthetic_scope_validation_performs_no_discovery_or_capacity_admission(self):
        with patch.object(launcher, "discover_reservation_roots", side_effect=AssertionError("NO_DISCOVERY")):
            self.assertEqual(len(launcher.reservation_scope(self.root, self.previous)), 2)


class NativeCaptureDataTests(unittest.TestCase):
    def validate(self, case=None, namespace=None, receipt=None, raw=None):
        c, n, r = synthetic()
        return profile.validate_native_capture(transcript(c if case is None else case, n if namespace is None else namespace)
            if raw is None else raw, b"", r if receipt is None else receipt, DELTA, BASELINE)

    def test_synthetic_valid_parser_fixture_is_not_runtime_or_production_proof(self):
        result = self.validate()
        self.assertFalse(result["productionQualified"])
        self.assertEqual(result["nativePhysicalDrain"], "NOT_QUALIFIED")

    def test_whole_close_evidence_is_mandatory_not_a_historical_boolean(self):
        c, _, _ = synthetic()
        c.pop("closeProof")
        with self.assertRaises(ValueError):
            self.validate(case=c)

    def test_unknown_current_service_or_funding_view_and_held_slot_refuse(self):
        for key, value in (("currentFundingClosed", False), ("currentServiceClosed", False), ("applicationSlotHeld", True),
            ("outcome", "UNKNOWN"), ("serviceClose", "UNKNOWN"), ("historicalClose", "PENDING")):
            c, _, _ = synthetic()
            c["closeProof"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(case=c)

    def test_close_counters_and_booleans_cannot_be_coerced(self):
        for key, value in (("observationStarts", True), ("completionProbeEntries", 2), ("wholeCloseBudgetObserved", 1)):
            c, _, _ = synthetic()
            c["closeProof"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(case=c)

    def test_old_reduced_namespace_or_old_version_cannot_pass_current_selection(self):
        for key, value in (("inputsVerifiedBeforeCase", 521), ("applicationFiles", 117), ("profileVersion", 1),
            ("sourceRowsSha256", "0"*64), ("nativeBuiltinAliases", 1), ("nativeOsNetworkSandbox", True)):
            _, n, _ = synthetic()
            n[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(namespace=n)

    def test_failed_unknown_incomplete_or_boolean_exit_is_not_success(self):
        for change in (dict(actual_exit=1), dict(actual_exit=None), dict(actual_exit=False),
            dict(output_complete=False), dict(state="STREAMS_CAPTURED_PENDING_PROMOTION")):
            _, _, r = synthetic()
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.validate(receipt={**r, **change})

    def test_exact_one_case_tap_and_exact_one_footer_are_required(self):
        c, n, _ = synthetic()
        for extra in ("# tests 1\n", "# pass 2\n", "not ok 2 - EXTRA\n", "# actual-issued-native-close-completion-v4 "+json.dumps(c)+"\n"):
            with self.subTest(extra=extra[:30]), self.assertRaises(ValueError):
                self.validate(raw=transcript(c, n, extra))

    def test_wrong_nonce_reservation_new_signature_or_second_funding_is_rejected(self):
        for key, value in (("aggregateCandidateReservation", 65537), ("fundingPosts", 2), ("sdkPrepareBlock", True)):
            c, _, _ = synthetic()
            c[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(case=c)
        c, _, _ = synthetic()
        c["counts"]["walletSignatures"] = 2
        with self.assertRaises(ValueError):
            self.validate(case=c)

    def test_oversized_or_undecodable_native_capture_refuses(self):
        for data in (b"x"*65537, b"\xff"):
            with self.subTest(size=len(data)), self.assertRaises((ValueError, UnicodeError)):
                self.validate(raw=data)

    def test_real_payment_chain_authentication_or_production_claim_is_never_upgraded(self):
        for key, value in (("realPayment", True), ("productionQualified", True), ("chainObservations", "AUTHENTICATED"),
            ("nativePhysicalDrain", "QUALIFIED")):
            c, _, _ = synthetic()
            c[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(case=c)


if __name__ == "__main__":
    require_no_bytecode = sys.dont_write_bytecode
    if not require_no_bytecode:
        raise TypeError("DATA_TEST_REQUIRES_NO_BYTECODE")
    unittest.main(verbosity=2)
