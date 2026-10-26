"""DATA/source tests only. Synthetic transcripts are NOT native evidence."""
import copy
import ast
import hashlib
import os
import stat
from urllib.parse import quote
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent
spec = importlib.util.spec_from_file_location("current_close_v6_data_profile", HERE / "issued_current_close_v6_profile.py")
profile = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = profile
exec(compile((HERE / "issued_current_close_v6_profile.py").read_bytes(), str(HERE / "issued_current_close_v6_profile.py"), "exec"), profile.__dict__)
launcher_spec = importlib.util.spec_from_file_location("current_close_v6_data_launcher", HERE / "run-issued-current-close-v6.local.py")
launcher = importlib.util.module_from_spec(launcher_spec)
exec(compile((HERE / "run-issued-current-close-v6.local.py").read_bytes(), str(HERE / "run-issued-current-close-v6.local.py"), "exec"), launcher.__dict__)
DELTA = json.loads((HERE / "issued-current-close-v6.inputs.json").read_bytes())
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
    namespace = dict(profileKind=profile.KIND, profileVersion=6, mode="clean", inputsVerifiedBeforeCase=527,
        applicationFiles=123, packageFiles=404, declaredSourceBytes=DELTA["resolvedSourceBytes"],
        sourceRowsSha256=DELTA["resolvedSourceRowsSha256"], resolveCalls=200, bareImportOverrideHits=8,
        declaredFilesResolved=100, sourceTransforms=0, nativeBuiltinAliases=0,
        ordinaryInstalledNamespaceQualified=False, nativeOsNetworkSandbox=False)
    receipt = dict(state="COMPLETE", output_complete=True, actual_exit=0)
    return case, namespace, receipt


def transcript(case, namespace, extra=""):
    return ("TAP version 13\nok 1 - SYNTHETIC PARSER FIXTURE NOT A NATIVE RUN\n"
        "# actual-issued-native-close-completion-v6 " + json.dumps(case) + "\n"
        "# pinned-issued-native-current-close-v6-namespace " + json.dumps(namespace) + "\n"
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




    def test_rows_reject_path_escape_extra_fields_boolean_bytes_and_bad_digests(self):
        original = DELTA["sourceRows"][0]
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
        for extra in ("# tests 1\n", "# pass 2\n", "not ok 2 - EXTRA\n", "# actual-issued-native-close-completion-v6 "+json.dumps(c)+"\n"):
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



class CurrentSourceAndReadReuseTests(unittest.TestCase):
    def declared(self):
        result = []
        for index, row in enumerate(DELTA["sourceRows"], 1):
            base, name = ("/declared/app", row["path"][4:]) if row["path"].startswith("app/") else ("/declared/packages", row["path"][9:])
            ident = ["91", str(1000+index), str(os.getuid()), str(os.getgid()), str(stat.S_IFREG|0o600), "1", str(row["bytes"]), "101", "102"]
            result.append(dict(logicalPath=row["path"], url="file://"+quote(base+"/"+name,safe="/@"),
                bytes=row["bytes"], sha256=row["sha256"], identity=ident))
        return result

    def planned(self, inputs=None):
        return profile.plan_declared_profile(DELTA, BASELINE, "/declared/app", "/declared/packages",
            self.declared() if inputs is None else inputs)

    def test_exact_three_runtime_revisions_and_two_versioned_native_entries(self):
        changes = DELTA["applicationReplacements"]
        self.assertEqual(len(changes),5)
        same = [r for r in changes if r["before"]["path"] == r["input"]["path"]]
        self.assertEqual({r["input"]["path"] for r in same},{
            "app/src/service-credit-original-request-custody-contract.js",
            "app/src/x402-original-payment-checkpoint-client.js","app/src/zenon/bounded-json-rpc-read-core.js"})
        self.assertTrue(all(r["input"] in DELTA["sourceRows"] for r in changes))
        self.assertEqual(sum(r["input"]["path"]!=r["before"]["path"]for r in changes),2)

    def test_old_metadata_and_packages_are_preserved_without_package_reads(self):
        before=json.loads((HERE/"issued-current-close-v5.inputs.json").read_bytes())
        self.assertEqual(before["effectsCeiling"],DELTA["effectsCeiling"])
        self.assertEqual(before["taskPolicy"],DELTA["taskPolicy"])
        self.assertEqual(before["packageRowsSha256"],DELTA["packageRowsSha256"])
        self.assertEqual(DELTA["nativeAuthority"],"NOT_GRANTED")

    def test_current_case_preserves_all_actual_assertions_and_only_versions_markers(self):
        old=(HERE/"issued-current-close-v5.case.mjs").read_text()
        current=(HERE/"issued-current-close-v6.case.mjs").read_text()
        self.assertEqual(current,old.replace("V5","V6").replace("v5","v6"))

    def test_storage_and_tls_functions_remain_ast_identical(self):
        old=ast.parse((HERE/"run-issued-current-close-v4.local.py").read_text())
        current=ast.parse((HERE/"run-issued-current-close-v6.local.py").read_text())
        names=("require","identity","read","pin","reservation_scope","discover_reservation_roots")
        for name in names:
            a=next(n for n in old.body if isinstance(n,ast.FunctionDef)and n.name==name)
            b=next(n for n in current.body if isinstance(n,ast.FunctionDef)and n.name==name)
            self.assertEqual(ast.dump(a,include_attributes=False),ast.dump(b,include_attributes=False))
        self.assertEqual(launcher.TLS_CONFIG,(HERE/"run-issued-current-close-v4.local.py").read_text().split("TLS_CONFIG = b",1)[1].split('"""',2)[1].encode())

    def test_complete_527_declared_profile_matches_independent_full_reference(self):
        values=self.declared();by={v["logicalPath"]:v for v in values}
        expected=dict(profileVersion=6,profileKind=profile.KIND,runtime=dict(node="24.19.0",platform="darwin",arch="arm64"),
            mode="clean",entryURL=by[profile.ENTRY]["url"],inputs=values,
            bareBindings=[dict(parentURL=by[e["parent"]]["url"],specifier=e["specifier"],targetURL=by[e["target"]]["url"])for e in DELTA["bareBindings"]],
            allowedBuiltins=DELTA["allowedBuiltins"],sourceRowsSha256=DELTA["resolvedSourceRowsSha256"],sourceTransform=False,ordinaryInstalledNamespace=False)
        actual=self.planned(values)
        self.assertEqual(actual["profileBytes"],json.dumps(expected,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()+b"\n")
        self.assertFalse(actual["effectsExecuted"])
        self.assertEqual(len(json.loads(actual["profileBytes"])["inputs"]),527)

    def test_declared_input_order_does_not_change_complete_profile(self):
        self.assertEqual(self.planned()["profileBytes"],self.planned(list(reversed(self.declared())))["profileBytes"])

    def test_profile_encoding_copies_mutable_declarations(self):
        values=self.declared();planned=self.planned(values)
        original=planned["profileBytes"];values[0]["identity"][1]="900";values[0]["url"]="file:///changed"
        self.assertEqual(planned["profileBytes"],original)

    def test_reduced_duplicate_and_unknown_declared_input_refusals(self):
        for change in ("short","duplicate","unknown"):
            v=self.declared()
            if change=="short":v.pop()
            elif change=="duplicate":v[-1]=copy.deepcopy(v[0])
            else:v[0]["logicalPath"]="app/UNKNOWN.js"
            with self.subTest(change=change),self.assertRaises(ValueError):self.planned(v)

    def test_wrong_digest_size_identity_kind_and_url_refusals(self):
        for key,value in (("sha256","0"*64),("bytes",True),("url","file:///wrong")):
            v=self.declared();v[0][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):self.planned(v)
        for i,value in ((0,"01"),(1,"0"),(2,str(os.getuid()+1)),(4,str(stat.S_IFDIR|0o700)),(5,"2"),(6,"0"),(7,True)):
            v=self.declared();v[0]["identity"][i]=value
            with self.subTest(field=i),self.assertRaises(ValueError):self.planned(v)

    def test_declared_physical_alias_is_refused(self):
        values=self.declared();values[1]["identity"][:2]=values[0]["identity"][:2]
        with self.assertRaises(ValueError):self.planned(values)

    def test_oversize_profile_is_refused_without_dropping_rows(self):
        with patch.object(profile,"MAX_PROFILE_BYTES",1):
            with self.assertRaisesRegex(ValueError,"BOUNDED_COMPLETE_PROFILE"):self.planned()

    def test_new_launcher_accepts_only_v6_native_flag(self):
        source=(HERE/"run-issued-current-close-v6.local.py").read_text()
        self.assertIn("--execute-current-clean-v6",source)
        self.assertIn("args.execute_current_clean_v6",source)
        self.assertNotIn("--execute-current-clean-v4",source)
        self.assertNotIn("args.execute_current_clean_v4",source)

    def test_real_application_capture_rechecks_all_123_inputs_without_read_opens(self):
        captured=profile.verify_application_inputs(str(HERE.parent),DELTA)
        self.assertEqual(captured["applicationFiles"],123)
        self.assertEqual(captured["packageFilesRead"],0)
        with patch.object(profile.os,"open",side_effect=AssertionError("WARM_BODY_OPEN")),patch("builtins.open",side_effect=AssertionError("WARM_TEXT_OPEN")):
            profile.recheck_application_inputs(captured)
            profile.recheck_application_inputs(captured)

    def test_each_nine_field_identity_change_is_refused_without_a_read_open(self):
        captured=profile.verify_application_inputs(str(HERE.parent),DELTA)
        for i in range(9):
            changed=copy.deepcopy(captured);items=list(changed["_captures"]);p,old=items[0];ident=list(old);ident[i]=str(int(ident[i])+1);items[0]=(p,tuple(ident));changed["_captures"]=tuple(items)
            with self.subTest(field=i),patch.object(profile.os,"open",side_effect=AssertionError("BODY_OPEN")),self.assertRaises(ValueError):
                profile.recheck_application_inputs(changed)

    def test_missing_or_reduced_warm_capture_is_refused(self):
        captured=profile.verify_application_inputs(str(HERE.parent),DELTA)
        for count in (0,1,123):
            v=dict(captured,_captures=captured["_captures"][:count])
            with self.subTest(count=count),self.assertRaises(ValueError):profile.recheck_application_inputs(v)

    def test_symlink_refusal_is_retained_in_warm_checks(self):
        captured=profile.verify_application_inputs(str(HERE.parent),DELTA)
        with patch.object(profile,"no_links",side_effect=ValueError("SOURCE_LINK")),self.assertRaisesRegex(ValueError,"SOURCE_LINK"):
            profile.recheck_application_inputs(captured)


    def test_reviewed_module_source_is_compiled_without_bytecode_cache_adoption(self):
        source=(HERE/"run-issued-current-close-v6.local.py").read_text()
        source=ast.get_source_segment(source,next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef)and n.name=="module"))
        self.assertIn('raw, _ = read(path)', source)
        self.assertIn('exec(compile(raw, str(path), "exec"), value.__dict__)', source)
        self.assertNotIn('loader.exec_module', source)

    def test_all_native_effect_ceilings_and_floor_stay_fixed(self):
        expected=dict(selectedCases=1,maximumRuns=1,opensslCommands=1,nodeCommands=1,nodeChildren=0,
            newSqlitePaths=5,independentPinFiles=2,syntheticEd25519Keys=4,transactionSignatures=1,capabilitySignatures=3,providerSignatures=2,
            maxTotalConnections=182,maxCandidatesPerSearch=4096,maxAggregateCandidates=65536,taskQuotaBytes=4194304)
        self.assertEqual({k:DELTA["effectsCeiling"][k]for k in expected},expected)
        self.assertEqual(launcher.QUOTA,4194304);self.assertEqual(launcher.FLOOR,10737418240)


if __name__ == "__main__":
    require_no_bytecode = sys.dont_write_bytecode
    if not require_no_bytecode:
        raise TypeError("DATA_TEST_REQUIRES_NO_BYTECODE")
    unittest.main(verbosity=2)
