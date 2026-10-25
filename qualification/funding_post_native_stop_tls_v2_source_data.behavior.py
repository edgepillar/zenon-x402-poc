"""Pure DATA cases for the actual source gate, never the native test body."""
import copy
import hashlib
import json


def run_source_data_cases(gate, manifest, sources):
    cases = []
    refusals = {}
    admitted = gate.validate_source_selection(manifest, sources)
    assert admitted["nativeRunsExecuted"] == 0 and admitted["listenerSocketsOpened"] == 0
    assert admitted["nativeAuthority"] == "NONE" and admitted["storageAdmissionPerformed"] is False
    cases.append("actual_current_nine_row_source_selection_admitted_without_native_execution")

    def reject(name, mutate):
        selected = copy.deepcopy(manifest)
        inputs = dict(sources)
        mutate(selected, inputs)
        try:
            gate.validate_source_selection(selected, inputs)
        except ValueError as error:
            code = str(error)
            refusals[name] = code if code.isascii() and code.replace("_", "").isalnum() and code.upper() == code else "VALUE_REFUSAL"
            cases.append(name)
        else:
            raise AssertionError("SOURCE_GATE_ACCEPTED_NEGATIVE_CASE_" + name)

    def rebind(selected, inputs, name, raw):
        inputs[name] = raw
        for index, row in enumerate(selected["inputs"]):
            if row["path"] == name:
                selected["inputs"][index] = {
                    "path": name, "bytes": len(raw), "LF": raw.count(b"\n"),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "gitBlob": hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest(),
                }
                break
        selected["sourceRowsSha256"] = hashlib.sha256(
            json.dumps(selected["inputs"], sort_keys=True, separators=(",", ":")).encode("ascii")).hexdigest()

    def edit(selected, inputs, name, old, new):
        assert inputs[name].count(old) == 1
        rebind(selected, inputs, name, inputs[name].replace(old, new, 1))

    for field, value in gate.CEILING.items():
        replacement = not value if type(value) is bool else value + 1
        reject("refuse_altered_declared_effect_" + field,
               lambda m, s, field=field, value=replacement: m["effectsCeiling"].__setitem__(field, value))
    reject("floor_cannot_be_lowered_to_zero", lambda m, s: m["effectsCeiling"].__setitem__("minimumFreeFloorBytes", 0))
    reject("metadata_cannot_grant_native_authority", lambda m, s: m.__setitem__("nativeAuthority", "APPROVED"))
    reject("metadata_cannot_fabricate_native_execution", lambda m, s: m.__setitem__("nativeExecuted", True))
    reject("unknown_manifest_field_refused", lambda m, s: m.__setitem__("runNow", True))
    reject("malformed_source_ref_refused", lambda m, s: m.__setitem__("sourceParent", "not-a-commit"))
    reject("missing_source_row_refused", lambda m, s: m["inputs"].pop())
    reject("duplicate_source_row_refused", lambda m, s: m["inputs"].__setitem__(1, dict(m["inputs"][0])))
    reject("row_order_is_closed", lambda m, s: m["inputs"].reverse())
    reject("missing_actual_source_refused", lambda m, s: s.pop(gate.BODY))
    reject("extra_source_refused", lambda m, s: s.__setitem__("unselected.mjs", b"export {};\n"))
    reject("changed_source_without_new_pins_refused", lambda m, s: s.__setitem__(gate.BODY, s[gate.BODY] + b"// drift\n"))
    for field, value in [("bytes", 0), ("LF", 0), ("sha256", "0" * 64), ("gitBlob", "0" * 40), ("bytes", True)]:
        suffix = "boolean" if type(value) is bool else field
        reject("wrong_row_pin_" + suffix, lambda m, s, field=field, value=value: m["inputs"][0].__setitem__(field, value))
    reject("row_seal_drift_refused", lambda m, s: m.__setitem__("sourceRowsSha256", "0" * 64))
    reject("source_must_be_bytes", lambda m, s: s.__setitem__(gate.BODY, s[gate.BODY].decode("ascii")))
    reject("empty_source_refused", lambda m, s: rebind(m, s, gate.BODY, b""))
    reject("rebound_sdk_import_is_not_admitted", lambda m, s:
           rebind(m, s, gate.BODY, s[gate.BODY] + b"import sdk from 'znn-typescript-sdk';\n"))
    reject("rebound_wildcard_listener_is_not_admitted", lambda m, s:
           edit(m, s, gate.BODY, b"server.listen({ host: '127.0.0.1', port: 0, exclusive: true }",
                b"server.listen({ host: '0.0.0.0', port: 0, exclusive: true }"))
    reject("rebound_wrong_case_names_refused", lambda m, s:
           edit(m, s, gate.BODY, b'"native stop v2 complete BOUND and actual close"',
                b'"native stop v2 unselected extra scenario"'))
    reject("missing_seventh_case_entry_refused", lambda m, s:
           edit(m, s, gate.BODY, b"await selected(6,", b"await unselected(6,"))
    reject("duplicate_case_entry_refused", lambda m, s:
           edit(m, s, gate.BODY, b"await selected(6,", b"await selected(5,"))
    reject("counter_exposure_removed_refused", lambda m, s:
           edit(m, s, gate.APPLICATION[0],
                b"socketAssignmentsObserved, stoppedSocketAssignmentsObserved,\n      handshakeTimerStartAttempts, requestClosesWithoutSocketObserved,",
                b"socketAssignmentsObserved, stoppedSocketAssignmentsObserved,"))
    reject("handshake_stop_gate_removed_refused", lambda m, s:
           edit(m, s, gate.APPLICATION[0], b"if (!entry.stop.canStartHandshake()) { closeOwner.observe(); return; }",
                b"if (false) { closeOwner.observe(); return; }"))
    reject("wrong_node_version_even_with_rebound_pins_refused", lambda m, s:
           edit(m, s, gate.ENTRY, b"'v24.19.0'", b"'v26.0.0'"))
    reject("missing_environment_guard_refused", lambda m, s:
           edit(m, s, gate.ENTRY, b"'NODE_OPTIONS', ", b""))
    reject("computed_native_body_import_refused", lambda m, s:
           edit(m, s, gate.ENTRY, b"import('./funding-post-native-stop-tls-v2.behavior.draft.mjs')",
                b"import(process.env.UNSELECTED_NATIVE_ENTRY)"))
    reject("gate_cannot_gain_os_import_with_new_self_pin", lambda m, s:
           rebind(m, s, gate.GATE, s[gate.GATE] + b"import os\n"))
    reject("malformed_case_json_refused", lambda m, s:
           edit(m, s, gate.BODY, b'"native stop v2 complete BOUND and actual close"',
                b"not_json"))
    reject("unobserved_path_claim_cannot_be_upgraded", lambda m, s:
           edit(m, s, gate.BODY, b"unobservedLateSocketPathQualified: false, nonclosingSocketQualified: false",
                b"unobservedLateSocketPathQualified: true, nonclosingSocketQualified: true"))
    reject("post_stop_timer_observation_cannot_be_dropped", lambda m, s:
           edit(m, s, gate.BODY, b"assert.equal(s.handshakeTimerStartAttempts, beforeStop.handshakeTimerStartAttempts);",
                b"void beforeStop;"))
    reject("required_real_stop_owner_import_cannot_be_omitted", lambda m, s:
           edit(m, s, gate.APPLICATION[0],
                b"import { createNativeHttpsClientRequestStopOwner } from './service-credit-native-client-request-stop-owner.js';\n", b""))
    reject("entry_cannot_allow_child_or_write_capabilities", lambda m, s:
           edit(m, s, gate.ENTRY, b"allow-(?:child|worker|addons|fs-write)", b"unrelated-pattern"))
    assert len(cases) == len(set(cases))
    return dict(event="FUNDING_NATIVE_STOP_TLS_V2_ACTUAL_SOURCE_DATA_CASES", successful=True,
                selectedCases=len(cases), cases=cases, refusalCodes=refusals, admitted=admitted,
                actualSourceGateUsed=True, nativeBodyExecuted=False, nativeBodyImported=False,
                socketCalls=0, testTlsKeyOrCertificateGenerated=False,
                SDK=False, SQLite=False, keysSignaturesNonce=False, managerImported=False,
                storageAdmissionPerformed=False, nativeOrFullDpQualified=False, authority="NONE")
