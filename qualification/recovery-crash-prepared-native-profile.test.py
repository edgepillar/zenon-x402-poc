"""DATA-only tests of the dedicated PREPARED-before-executor profile/parser.

Only these Python definitions and the two public JSON inventories are read.
All file URLs, identities and the extra parent-entry row below are DECLARED
DATA. No filesystem fixture, manager, child, signal, SQLite, TLS, SDK/package,
key/signature, nonce, socket or native crash case is executed.
"""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest

HERE = Path(__file__).absolute().parent
spec = importlib.util.spec_from_file_location("recovery_prepared_crash_profile_data", HERE / "recovery_crash_prepared_native_profile.py")
profile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(profile)
INVENTORY_RAW = (HERE / "recovery-crash-prepared-full-graph.source-inputs.json").read_bytes()
BASELINE_RAW = (HERE / "issued-funding-post-native-vertical.inputs-v3.json").read_bytes()
INVENTORY = json.loads(INVENTORY_RAW)
BASELINE = json.loads(BASELINE_RAW)
APP, PACKAGES = "/declared/app root", "/declared/package root"
SELECTED = profile.capture_inventory(INVENTORY_RAW, BASELINE_RAW)
HOOKS = 0


def captures(rows=None, app=APP, packages=PACKAGES):
    result = []
    for index, row in enumerate(SELECTED["rows"] if rows is None else rows):
        name = row["path"]
        root, relative = (app, name[4:]) if name.startswith("app/") else (packages, name[9:])
        result.append(dict(logicalPath=name, url=profile.source_url(root, relative),
            bytes=row["bytes"], LF=row["LF"], sha256=row["sha256"], gitBlob=row["gitBlob"],
            identity=["1", str(index + 10), "501", "20", "33188", "1", str(row["bytes"]), "100", "101"]))
    return result


def parent_controls():
    by_name = {r["path"]: r for r in [*SELECTED["rows"], *SELECTED["controlInputs"]]}
    by_name[profile.PARENT_ENTRY] = profile.pin(profile.PARENT_ENTRY, b"// DECLARED parent entry DATA\n")
    # Every case must own its rows; negative mutations cannot alter SELECTED.
    return copy.deepcopy(sorted([by_name[n] for n in profile.PARENT_INPUTS], key=lambda r: r["path"]))


def plan(values=None, app=APP, packages=PACKAGES):
    return profile.plan_private_profile(INVENTORY_RAW, BASELINE_RAW,
        captures(app=app, packages=packages) if values is None else values, app, packages)



def blob(raw):
    import base64
    return dict(bytes=len(raw), sha256=profile.sha(raw), base64=base64.b64encode(raw).decode("ascii"))


def declared_capture():
    protocol = dict(protocolVersion=3, cutpointKind=profile.CUTPOINT_KIND, phase="DECLARED_PREPARED_PROTOCOL_COMPLETE", killRequested=True, killAccepted=True,
        seedClosed=True, fundingOriginalFixedBeforeSubmission=True, recoveryAuthorized=True, recoveryClosed=True,
        independentOriginalFixedBeforeDispatch=True, originalCheckpointRetained=True, nativeEventsAuthenticated=False,
        nativeCrashQualified=False, physicalDurabilityQualified=False, payerOwnerCloseOutcome="CHILD_UNKNOWN",
        authority="NONE", mayDispatchService=False, maySignPayment=False, mayReleaseHeldCredit=False, deliveryConfirmed=False)
    def namespace(mode):
        return dict(profileKind=profile.KIND, profileVersion=1, mode=mode, sourceRowsSha256=profile.SOURCE_SEAL,
            applicationFiles=130, packageFiles=404, inputsVerifiedBeforeCase=534, declaredSourceBytes=4711970,
            baselineApplication117Preserved=True, baselinePackages404Preserved=True, resolveCalls=20,
            bareImportOverrideHits=2, declaredFilesResolved=10, sourceTransforms=0, nativeBuiltinAliases=0,
            ordinaryInstalledNamespaceQualified=False, nativeOsNetworkSandbox=False)
    def effects(seed):
        return dict(walletKeys=1 if seed else 0, transactionSignatures=1 if seed else 0, capabilityKeys=2 if seed else 0,
            capabilitySignatures=2 if seed else 0, providerKeys=1 if seed else 0, providerSignatures=2 if seed else 0,
            referenceCandidates=17 if seed else 0, producerCandidateReservation=4096 if seed else 0,
            fixedVerificationReservation=16384 if seed else 0, aggregateCandidateReservation=20497 if seed else 0,
            independentPinFiles=2 if seed else 0, readonlySqliteOpens=4, fundingPosts=1 if seed else 0,
            serviceExecutions=0, foreignGrantRefusals=1 if seed else 0, sdkPrepareBlock=False, realPayment=False)
    def child(seed):
        mode = "seed" if seed else "recover"
        startup = namespace(mode); startup.update(resolveCalls=0, bareImportOverrideHits=0, declaredFilesResolved=0)
        output = ("# pinned-recovery-prepared-crash-namespace-admitted " + json.dumps(startup) + "\n").encode()
        return dict(pid=12345 if seed else 12346, code=None if seed else 0, signal="SIGKILL" if seed else None,
            stdoutComplete=True, stderrComplete=True, ipcClosed=True, fault=False, killSent=seed,
            stdout=blob(output), stderr=blob(b""))
    funding = dict(witnessVersion=2, fundingResourceUrl="https://127.0.0.1:1234/funding",
        serviceResourceUrl="https://127.0.0.1:1234/service-credit/v1/execute", transactionHash="3" * 64,
        paymentRequiredHeader="DECLARED", paymentSignatureHeader="DECLARED", serializedCheckpoint="DECLARED",
        checkpointPins={"declared": True}, nowEpochMs=12345)
    funding_raw = json.dumps(funding, separators=(",", ":")).encode()
    service = dict(witnessVersion=2, grantId="declared.grant", requestId="declared.original",
        originalRequestJson="{}", authorizationHeader="ServiceCredit DECLARED", fundingWitnessSha256=profile.sha(funding_raw),
        payerIdentity=["1", "2", "501", "20", "33152", "1"], backendIdentity=["1", "3", "501", "20", "33152", "1"])
    original_raw = json.dumps(dict(funding=funding, service=service), separators=(",", ":")).encode()
    return dict(captureVersion=1, kind="OWNED_ISSUED_PREPARED_CRASH_PAIR_PRIVATE_CAPTURE_NOT_PRODUCTION",
        cutpointKind=profile.CUTPOINT_KIND,
        status="OBSERVED_PREPARED_PROCESS_PAIR_PROTOCOL_COMPLETE", sourceRowsSha256=profile.SOURCE_SEAL, protocol=protocol,
        seed=child(True), recovery=child(False),
        seedEvidence=dict(namespace=namespace("seed"), effects=effects(True)),
        recoveryEvidence=dict(namespace=namespace("recover"), effects=effects(False)),
        privateFundingWitness=blob(funding_raw), privateOriginalWitness=blob(original_raw),
        selectedApplicationCrashQualified=False, physicalDurabilityQualified=False, authority="NONE")


def transcript(value):
    raw = json.dumps(value, separators=(",", ":")).encode() + b"\n"
    receipt = dict(state="COMPLETE", output_complete=True, actual_exit=0,
        stdout=dict(bytes=len(raw), sha256=profile.sha(raw)), stderr=dict(bytes=0, sha256=profile.sha(b"")))
    return raw, b"", receipt

class FullGraphProfileDataTests(unittest.TestCase):
    def refuse(self, change):
        inventory, baseline = copy.deepcopy(INVENTORY), copy.deepcopy(BASELINE)
        change(inventory, baseline)
        with self.assertRaises(ValueError):
            profile.validate_source_data(inventory, baseline)

    def test_01_complete_130_app_404_package_selection(self):
        self.assertEqual(len(SELECTED["rows"]), 534)
        self.assertEqual(SELECTED["sourceBytes"], 4711970)
        self.assertEqual(SELECTED["sourceRowsSha256"], profile.SOURCE_SEAL)
        self.assertEqual(SELECTED["authority"], "NONE")

    def test_02_capture_exact_published_bytes(self):
        selected = profile.capture_inventory(INVENTORY_RAW, BASELINE_RAW)
        self.assertEqual(selected, SELECTED)
        self.assertFalse(selected["effectsExecuted"])

    def test_03_changed_inventory_bytes_refused(self):
        with self.assertRaisesRegex(ValueError, "PUBLISHED_INVENTORY_PIN"):
            profile.capture_inventory(INVENTORY_RAW + b"\n", BASELINE_RAW)

    def test_04_changed_baseline_bytes_refused(self):
        with self.assertRaisesRegex(ValueError, "FROZEN_BASELINE_PIN"):
            profile.capture_inventory(INVENTORY_RAW, BASELINE_RAW + b"\n")

    def test_05_duplicate_json_fields_refused(self):
        for raw in (b'{"a":1,"a":2}', b'{"a":{"b":1,"b":2}}'):
            with self.assertRaisesRegex(ValueError, "DUPLICATE_JSON_FIELD"):
                profile.decode_json(raw)

    def test_06_nonfinite_or_floating_json_refused(self):
        for raw in (b'{"a":NaN}', b'{"a":Infinity}', b'{"a":1.0}', b'{"a":1e20}'):
            with self.assertRaises(ValueError):
                profile.decode_json(raw)

    def test_07_subclasses_do_not_invoke_hooks(self):
        class HookDict(dict):
            def items(self):
                global HOOKS
                HOOKS += 1
                raise AssertionError("CALLER_HOOK")
        class HookString(str):
            def __str__(self):
                global HOOKS
                HOOKS += 1
                raise AssertionError("CALLER_HOOK")
        for value in (HookDict(), {"a": HookString("x")}):
            with self.assertRaises(ValueError):
                profile.validate_source_data(value, BASELINE)
        self.assertEqual(HOOKS, 0)

    def test_08_no_reduced_graph_or_empty_selection(self):
        self.refuse(lambda i, b: i["applicationInputs"].pop())
        self.refuse(lambda i, b: i["packageInputs"].clear())

    def test_09_all_117_baseline_app_rows_preserved(self):
        self.refuse(lambda i, b: b["applicationInputs"][0].update(sha256="0" * 64))

    def test_10_all_404_baseline_package_rows_preserved(self):
        self.refuse(lambda i, b: b["packageInputs"][0].update(gitBlob="0" * 40))

    def test_11_boolean_is_not_source_integer(self):
        for field in ("bytes", "LF"):
            self.refuse(lambda i, b, k=field: i["applicationInputs"][0].update({k: True}))
        self.refuse(lambda i, b: i.update(sourceSelectionVersion=True))

    def test_12_paths_and_line_counts_stay_exact(self):
        self.refuse(lambda i, b: i["applicationInputs"][0].update(path="app/../outside.js"))
        self.refuse(lambda i, b: i["applicationInputs"][0].update(LF=1048577))

    def test_13_exact_control_rows_without_hooks(self):
        self.refuse(lambda i, b: i["controlInputs"].__setitem__(0, False))
        self.refuse(lambda i, b: i["controlInputs"][0].update(sha256="0" * 64))

    def test_14_no_execution_transformation_or_sandbox_claim(self):
        for field in ("nativeExecuted", "nativeCrashQualified", "ordinaryInstalledNamespaceQualified",
                      "sourceTransform", "nativeBuiltinAlias", "osNetworkSandbox"):
            self.refuse(lambda i, b, k=field: i.update({k: True}))

    def test_15_no_new_builtin_bare_edge_or_package_version(self):
        self.refuse(lambda i, b: i["allowedBuiltins"].append("node:child_process"))
        self.refuse(lambda i, b: i["bareBindings"].append(i["bareBindings"][0]))
        self.refuse(lambda i, b: i["packageVersions"].update({"packages/@x402/core/package.json": "2.28.0"}))

    def test_16_resealed_changed_child_is_not_current_selection(self):
        def change(i, b):
            next(r for r in i["applicationInputs"] if r["path"] == profile.ENTRY)["sha256"] = "0" * 64
            rows = sorted(i["applicationInputs"] + i["packageInputs"], key=lambda r: r["path"])
            i["sourceRowsSha256"] = profile.sha(profile.canonical(rows))
        self.refuse(change)

    def test_17_private_profile_has_exact_preloader_fields(self):
        result = plan()
        private = json.loads(result["profileBytes"])
        self.assertEqual(set(private), {"profileVersion", "profileKind", "runtime", "entryURL", "inputs",
            "bareBindings", "allowedBuiltins", "sourceRowsSha256", "sourceTransform",
            "ordinaryInstalledNamespace", "baselineManifestSha256"})
        self.assertEqual(len(private["inputs"]), 534)
        self.assertEqual(len(private["bareBindings"]), 10)
        self.assertEqual(private["baselineManifestSha256"], profile.BASELINE_SHA)
        self.assertFalse(result["capturedIdentitiesAuthenticated"])

    def test_18_at_and_space_urls_match_declared_node_codec(self):
        url = profile.source_url(PACKAGES, "@x402/core/package.json")
        self.assertEqual(url, "file:///declared/package%20root/@x402/core/package.json")
        self.assertNotIn("%40", url)

    def test_19_capture_must_match_all_source_pin_fields(self):
        for field, value in (("bytes", 1), ("LF", 1), ("sha256", "0" * 64), ("gitBlob", "0" * 40)):
            values = captures()
            if values[0][field] == value:
                value = 2
            values[0][field] = value
            with self.assertRaises(ValueError):
                plan(values)

    def test_20_identity_is_exact_nine_decimal_strings(self):
        for identity in (["1"] * 8, ["1"] * 10, [True] * 9, ["-1"] * 9):
            values = captures(); values[0]["identity"] = identity
            with self.assertRaises(ValueError):
                plan(values)

    def test_21_hardlink_directory_and_wrong_file_size_refused(self):
        for index, value in ((5, "2"), (4, "16877"), (6, "999")):
            values = captures(); values[0]["identity"][index] = value
            with self.assertRaises(ValueError):
                plan(values)

    def test_22_url_root_and_scoped_package_encoding_cannot_drift(self):
        for altered in ("file:///other/source.js", "https://127.0.0.1/source.js"):
            values = captures(); values[0]["url"] = altered
            with self.assertRaises(ValueError):
                plan(values)
        values = captures()
        row = next(r for r in values if "/@x402/" in r["url"])
        row["url"] = row["url"].replace("@", "%40")
        with self.assertRaises(ValueError):
            plan(values)

    def test_23_missing_duplicate_or_reordered_capture_refused(self):
        values = captures(); values.pop()
        with self.assertRaises(ValueError):
            plan(values)
        values = captures(); values[0], values[1] = values[1], values[0]
        with self.assertRaises(ValueError):
            plan(values)
        values = captures(); values[1] = values[0]
        with self.assertRaises(ValueError):
            plan(values)

    def test_24_planned_profile_detaches_caller_lists(self):
        values = captures(); result = plan(values); raw = result["profileBytes"]
        values[0]["identity"][0] = "99"; values[0]["url"] = "file:///changed"
        self.assertEqual(result["profileBytes"], raw)
        self.assertNotEqual(json.loads(raw)["inputs"][0]["identity"][0], "99")

    def test_25_invalid_inventory_refuses_before_filesystem_read(self):
        with self.assertRaisesRegex(ValueError, "PUBLISHED_INVENTORY_PIN"):
            profile.build_profile("NOT_A_PATH", "NOT_A_PATH", b"{}", BASELINE_RAW)

    def test_26_scope_is_one_pair_not_an_older_native_allowance(self):
        scope = profile.effects()
        self.assertEqual((scope["maximumRuns"], scope["nodeParentCommands"], scope["nodeChildren"]), (1, 1, 2))
        self.assertEqual(scope["auxiliaryReadonlySqliteOpens"], 8)
        self.assertEqual(scope["capabilitySignatures"], 2)
        self.assertFalse(scope["externalNetwork"])
        self.assertFalse(scope["nativeOsNetworkSandbox"])

    def test_27_floor_and_command_quota_not_reduced(self):
        policy = profile.policy()
        self.assertEqual(policy["min_free_bytes"], 10737418240)
        self.assertEqual(policy["task_quota_bytes"], 4194304)
        self.assertEqual(policy["max_commands_per_task"], 2)
        self.assertEqual(policy["max_output_bytes"], 524288)

    def test_28_parent_exact_five_file_namespace(self):
        rows = profile.validate_parent_controls(parent_controls(), SELECTED)
        self.assertEqual({r["path"] for r in rows}, set(profile.PARENT_INPUTS))

    def test_29_parent_cannot_import_a_new_file(self):
        rows = parent_controls(); rows.append(profile.pin("app/extra.js", b"// DATA"))
        with self.assertRaises(ValueError):
            profile.validate_parent_controls(rows, SELECTED)

    def test_30_parent_protocol_and_checkpoint_pins_stay_bound(self):
        for name in (profile.PROTOCOL, "app/src/service-credit-pilot-original-payment-checkpoint.js"):
            rows = parent_controls(); next(r for r in rows if r["path"] == name)["sha256"] = "0" * 64
            with self.assertRaises(ValueError):
                profile.validate_parent_controls(rows, SELECTED)

    def test_31_parent_profile_binds_both_child_source_pins(self):
        controls = parent_controls()
        result = profile.plan_parent_profile(INVENTORY_RAW, BASELINE_RAW, controls, captures(controls), APP)
        private = json.loads(result["profileBytes"])
        self.assertEqual(private["profileKind"], profile.PARENT_KIND)
        self.assertEqual(len(private["inputs"]), 5)
        child = {r["path"]: r for r in SELECTED["rows"]}
        self.assertEqual(private["childEntrySha256"], child[profile.ENTRY]["sha256"])
        self.assertEqual(private["childPreloadSha256"], child[profile.PRELOAD]["sha256"])
        self.assertFalse(result["capturedIdentitiesAuthenticated"])

    def test_32_absolute_roots_have_no_parent_or_symlink_claim(self):
        for value in ("relative", "/declared/../app", "//declared/app", "/declared/app/"):
            with self.assertRaises(ValueError):
                profile.source_url(value, "package.json")

    def test_33_oversized_private_profile_refuses(self):
        with self.assertRaisesRegex(ValueError, "PRIVATE_PROFILE_SIZE"):
            plan(app="/" + "a" * 1500, packages="/" + "b" * 1500)

    def test_34_json_bounds_and_ascii_are_explicit(self):
        for raw in (b"", b" " * 262145, b'{"x":"\xff"}', b'{"x":9223372036854775807}'):
            with self.assertRaises(ValueError):
                profile.decode_json(raw)

    def test_35_data_profile_never_grants_action_authority(self):
        for value in (plan(), profile.plan_parent_profile(
                INVENTORY_RAW, BASELINE_RAW, parent_controls(), captures(parent_controls()), APP)):
            self.assertEqual(value["authority"], "NONE")
            self.assertFalse(value["effectsExecuted"])
            self.assertFalse(value["capturedIdentitiesAuthenticated"])

    def test_36_duplicate_or_cross_namespace_public_rows_refused(self):
        self.refuse(lambda i, b: i["applicationInputs"].__setitem__(1, i["applicationInputs"][0]))
        self.refuse(lambda i, b: i["packageInputs"][0].update(path="app/package.json"))



    def refuse_capture(self, change):
        value = declared_capture(); change(value)
        with self.assertRaises(ValueError):
            profile.validate_native_capture(*transcript(value))

    def test_37_declared_pair_data_is_not_native_execution_proof(self):
        value = profile.validate_native_capture(*transcript(declared_capture()))
        self.assertEqual(value["payerOwnerCloseOutcome"], "CHILD_UNKNOWN")
        self.assertFalse(value["nativeCrashFullP2Qualified"])
        self.assertFalse(value["productionQualified"])

    def test_38_normal_exit_or_other_signal_not_selected_crash(self):
        for patch in (dict(code=0, signal=None), dict(signal="SIGTERM"), dict(code=1)):
            self.refuse_capture(lambda v, p=patch: v["seed"].update(p))

    def test_39_recovery_is_distinct_and_naturally_zero_exit(self):
        for patch in (dict(pid=12345), dict(code=1), dict(signal="SIGKILL"), dict(code=False)):
            self.refuse_capture(lambda v, p=patch: v["recovery"].update(p))

    def test_40_child_eof_ipc_and_fault_are_not_inferred(self):
        for side in ("seed", "recovery"):
            for field in ("stdoutComplete", "stderrComplete", "ipcClosed"):
                self.refuse_capture(lambda v, s=side, k=field: v[s].update({k: False}))
            self.refuse_capture(lambda v, s=side: v[s].update(fault=True))
        self.refuse_capture(lambda v: v["recovery"].update(killSent=True))

    def test_41_command_exit_and_completeness_must_be_actual(self):
        for patch in (dict(actual_exit=1), dict(actual_exit=True), dict(state="UNKNOWN"), dict(output_complete=False)):
            raw, err, receipt = transcript(declared_capture()); receipt.update(patch)
            with self.assertRaises(ValueError):
                profile.validate_native_capture(raw, err, receipt)

    def test_42_complete_namespace_and_source_seal_required(self):
        for side in ("seedEvidence", "recoveryEvidence"):
            for patch in (dict(sourceRowsSha256="0" * 64), dict(packageFiles=403),
                          dict(profileVersion=True), dict(nativeBuiltinAliases=1)):
                self.refuse_capture(lambda v, s=side, p=patch: v[s]["namespace"].update(p))

    def test_43_private_stream_bytes_digest_and_base64_are_bound(self):
        for patch in (dict(bytes=1), dict(sha256="0" * 64), dict(base64="not base64")):
            self.refuse_capture(lambda v, p=patch: v["seed"]["stdout"].update(p))

    def test_44_original_bundle_is_bound_to_early_funding_bytes(self):
        def change(v):
            import base64
            raw = base64.b64decode(v["privateOriginalWitness"]["base64"])
            value = json.loads(raw); value["service"]["fundingWitnessSha256"] = "0" * 64
            v["privateOriginalWitness"] = blob(json.dumps(value, separators=(",", ":")).encode())
        self.refuse_capture(change)

    def test_45_prepared_state_cannot_clear_unknown_or_grant_authority(self):
        for patch in (dict(payerOwnerCloseOutcome="RETURNED"), dict(authority="READY"),
                      dict(maySignPayment=True), dict(deliveryConfirmed=True)):
            self.refuse_capture(lambda v, p=patch: v["protocol"].update(p))

    def test_46_recovery_cannot_dispatch_sign_or_search_again(self):
        for field in ("fundingPosts", "serviceExecutions", "transactionSignatures", "referenceCandidates"):
            self.refuse_capture(lambda v, k=field: v["recoveryEvidence"]["effects"].update({k: 1}))

    def test_47_original_nonce_and_signature_scope_remains_bounded(self):
        for patch in (dict(aggregateCandidateReservation=65537), dict(providerSignatures=3), dict(capabilitySignatures=3)):
            self.refuse_capture(lambda v, p=patch: v["seedEvidence"]["effects"].update(p))

    def test_48_child_admission_raw_capture_cannot_be_omitted(self):
        self.refuse_capture(lambda v: v["seed"].update(stdout=blob(b"")))
        self.refuse_capture(lambda v: v["recovery"].update(stdout=blob(b"DECLARED\n")))

    def test_49_duplicate_parent_output_or_extra_fields_refused(self):
        raw, err, receipt = transcript(declared_capture())
        with self.assertRaises(ValueError):
            profile.validate_native_capture(raw + raw, err, receipt)
        self.refuse_capture(lambda v: v.update(extra=True))

    def test_50_witness_version_cannot_be_boolean_or_old_scope(self):
        def change(v):
            import base64
            raw = base64.b64decode(v["privateOriginalWitness"]["base64"])
            value = json.loads(raw); value["service"]["witnessVersion"] = True
            v["privateOriginalWitness"] = blob(json.dumps(value, separators=(",", ":")).encode())
        self.refuse_capture(change)

    def test_51_parent_stream_receipt_and_frame_are_exact(self):
        raw, err, receipt = transcript(declared_capture()); receipt["stdout"]["sha256"] = "0" * 64
        with self.assertRaises(ValueError):
            profile.validate_native_capture(raw, err, receipt)
        raw, err, receipt = transcript(declared_capture())
        with self.assertRaises(ValueError):
            profile.validate_native_capture(raw[:-1], err, receipt)

    def test_52_sanitized_summary_contains_no_originals_or_authority_upgrade(self):
        value = profile.validate_native_capture(*transcript(declared_capture()))
        text = json.dumps(value)
        self.assertNotIn("DECLARED", text)
        self.assertNotIn("authorizationHeader", text)
        self.assertNotIn("serializedCheckpoint", text)
        self.assertFalse(value["physicalDurabilityQualified"])
        self.assertFalse(value["nativeCleanupQualified"])
        self.assertEqual(value["authority"], "NONE")


    def test_53_committed_capture_kind_refused(self):
        self.refuse_capture(lambda v: v.update(kind="OWNED_ISSUED_CRASH_PAIR_PRIVATE_CAPTURE_NOT_PRODUCTION"))

    def test_54_committed_v2_protocol_never_normalized(self):
        for patch in (dict(protocolVersion=2), dict(phase="DECLARED_PROTOCOL_COMPLETE"),
                      dict(cutpointKind="COMMITTED_BEFORE_ACK")):
            self.refuse_capture(lambda v, p=patch: v["protocol"].update(p))

    def test_55_prepared_snapshot_never_authorizes_held_credit_release(self):
        self.refuse_capture(lambda v: v["protocol"].update(mayReleaseHeldCredit=True))
        self.refuse_capture(lambda v: v["protocol"].pop("mayReleaseHeldCredit"))

    def test_56_no_executor_call_even_in_seed(self):
        for side in ("seedEvidence", "recoveryEvidence"):
            self.refuse_capture(lambda v, s=side: v[s]["effects"].update(serviceExecutions=1))
            self.refuse_capture(lambda v, s=side: v[s]["effects"].update(serviceExecutions=True))

    def test_57_distinct_cutpoint_required_in_outer_capture(self):
        self.refuse_capture(lambda v: v.update(cutpointKind="COMMITTED_BEFORE_ACK"))
        self.refuse_capture(lambda v: v.pop("cutpointKind"))

    def test_58_old_child_namespace_not_mislabelled_prepared(self):
        for side in ("seedEvidence", "recoveryEvidence"):
            self.refuse_capture(lambda v, s=side: v[s]["namespace"].update(
                profileKind="OFFICIAL_ISSUED_FULL_GRAPH_CRASH_PAIR_NODE24_V1"))

    def test_59_prepared_declared_effect_ceiling_never_releases_or_invokes(self):
        scope = profile.effects()
        self.assertEqual(scope["cutpointKind"], "PREPARED_BEFORE_EXECUTOR")
        self.assertEqual(scope["maximumServiceExecutions"], 0)
        self.assertIs(scope["backendMutatingRecovery"], False)
        self.assertIs(scope["heldCreditRelease"], False)

    def test_60_raw_startup_namespace_old_footer_refused(self):
        for side in ("seed", "recovery"):
            self.refuse_capture(lambda v, s=side: v[s].update(stdout=blob(
                b"# pinned-recovery-crash-namespace-admitted {}\\n")))

    def test_61_private_json_negative_zero_and_unsafe_integer_refused(self):
        for raw in (b'{"x":-0}', b'{"x":9007199254740992}'):
            with self.assertRaises(ValueError):
                profile._private_json(raw, 128)
        self.assertEqual(profile._private_json(b'{"x":0}', 128), {"x": 0})

    def test_62_capture_negative_zero_cannot_lose_its_sign_at_parse(self):
        raw, err, receipt = transcript(declared_capture())
        needle = b'"serviceExecutions":0'
        self.assertIn(needle, raw)
        raw = raw.replace(needle, b'"serviceExecutions":-0', 1)
        receipt["stdout"].update(bytes=len(raw), sha256=profile.sha(raw))
        with self.assertRaisesRegex(ValueError, "PRIVATE_JSON_NEGATIVE_ZERO"):
            profile.validate_native_capture(raw, err, receipt)

    def test_63_complete_profile_has_only_prepared_extra_edges(self):
        private = json.loads(plan()["profileBytes"])
        self.assertEqual(private["profileKind"], profile.KIND)
        self.assertIn("recovery-crash-prepared-intent.child.draft.mjs", private["entryURL"])
        edges = [e for e in private["bareBindings"] if e["parentURL"] == private["entryURL"]]
        self.assertEqual(len(edges), 2)
        self.assertEqual({e["specifier"] for e in edges}, {"@noble/ed25519", "@noble/hashes/sha2"})

    def test_64_summary_preserves_passive_recovery_and_no_release(self):
        value = profile.validate_native_capture(*transcript(declared_capture()))
        self.assertEqual(value["cutpointKind"], "PREPARED_BEFORE_EXECUTOR")
        self.assertEqual(value["heldCreditRelease"], "NOT_AUTHORIZED")
        self.assertEqual(value["backendRecovery"], "PASSIVE_EXISTING_READER_ONLY")
        self.assertEqual(value["serviceDelivery"], "NOT_ESTABLISHED")
        self.assertIs(value["nativeCrashFullP2Qualified"], False)


if __name__ == "__main__":
    if not sys.dont_write_bytecode:
        raise ValueError("BYTECODE_DISABLED_REQUIRED")
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(FullGraphProfileDataTests)
    if suite.countTestCases() != 64:
        raise ValueError("EXACT_64_DATA_CASES")
    result = unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite)
    print("# recovery-prepared-crash-source-profile-data " + json.dumps(dict(
        entered=result.testsRun, completed=result.testsRun - len(result.errors) - len(result.failures),
        passCount=result.testsRun - len(result.errors) - len(result.failures) - len(result.skipped),
        fail=len(result.failures), errors=len(result.errors), skipped=len(result.skipped), hooks=HOOKS,
        applicationInputs=130, packageInputs=404, eventsDeclared=True, SDK=False, SQLite=False,
        childProcesses=0, signals=0, scratchCreated=False, nativeCrashQualified=False, authority="NONE"), separators=(",", ":")))
    sys.exit(0 if result.wasSuccessful() and result.testsRun == 64 and not result.skipped and HOOKS == 0 else 1)


