"""Pure source/DATA controls. No launcher, SDK, SQL, socket, key or task runs."""
import ast
import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest

HERE = Path(__file__).absolute().parent
spec = importlib.util.spec_from_file_location('startup_contract_under_test', HERE / 'issued_close_startup_contract.py')
contract = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = contract
exec(compile((HERE / 'issued_close_startup_contract.py').read_bytes(), str(HERE / 'issued_close_startup_contract.py'), 'exec'), contract.__dict__)


def launcher(selection='current-native-issued-close-source-v4'):
    env = dict(contract.PREFIX, **contract.EXPECTED)
    env['X402_ISSUED_CLOSE_NATIVE_SELECTION'] = selection
    values = ', '.join(key + '=' + repr(value) for key, value in env.items())
    return 'import os\ndef main():\n    os.environ.clear()\n    os.environ.update(' + values + ')\n'


def guard(alias=False):
    head = 'const E = process.env, mode = E.X402_ISSUED_CLOSE_NATIVE_MODE;\n' if alias else 'const E = process.env;\n'
    conditions = []
    for key, value in contract.EXPECTED.items():
        operand = 'mode' if alias and key.endswith('_MODE') else 'E.' + key
        conditions.append('    || ' + operand + ' !== ' + repr(value))
    return head + 'if (false\n' + '\n'.join(conditions) + ') reject();\n'


class StartupContractTests(unittest.TestCase):
    def test_preserved_v4_environment_is_reported_as_v6_mismatch(self):
        result = contract.review_startup_sources(launcher(), guard(), guard(True))
        self.assertFalse(result['originalStartupMatches'])
        self.assertEqual(result['mismatches'], {'X402_ISSUED_CLOSE_NATIVE_SELECTION':
            {'launcher': 'current-native-issued-close-source-v4', 'required': 'current-native-issued-close-source-v6'}})
        self.assertTrue(result['correctedStartupMatches'])

    def test_corrected_environment_matches_without_mutating_original_or_process_environment(self):
        import os
        before = dict(os.environ)
        result = contract.review_startup_sources(launcher(), guard(), guard(True))
        old = copy.deepcopy(result['originalEnvironment'])
        self.assertTrue(contract.require_startup_environment(dict(result['expectedEnvironment']), result))
        self.assertEqual(result['originalEnvironment'], old)
        self.assertEqual(dict(os.environ), before)

    def test_original_mismatching_environment_is_refused(self):
        result = contract.review_startup_sources(launcher(), guard(), guard(True))
        with self.assertRaisesRegex(ValueError, 'STARTUP_ENVIRONMENT_MISMATCH'):
            contract.require_startup_environment(result['originalEnvironment'], result)

    def test_already_matching_source_is_not_invented_as_a_failure(self):
        result = contract.review_startup_sources(launcher(contract.EXPECTED['X402_ISSUED_CLOSE_NATIVE_SELECTION']), guard(), guard(True))
        self.assertTrue(result['originalStartupMatches'])
        self.assertEqual(result['mismatches'], {})

    def test_case_preload_disagreement_refuses(self):
        with self.assertRaisesRegex(ValueError, 'REVIEWED_CASE_PRELOAD_STARTUP_AGREEMENT'):
            contract.review_startup_sources(launcher(), guard().replace('source-v6', 'source-v5'), guard(True))

    def test_absent_or_duplicate_js_guard_is_not_accepted(self):
        source = guard()
        for changed in (source.replace("    || E.X402_ISSUED_CLOSE_NATIVE_SELECTION !== 'current-native-issued-close-source-v6'", ''),
            source + "    || E.X402_ISSUED_CLOSE_NATIVE_SELECTION !== 'current-native-issued-close-source-v6'\n"):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                contract.javascript_guard(changed)

    def test_unsupported_mode_alias_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'EXACT_REVIEWED_MODE_ALIAS'):
            contract.javascript_guard(guard(True).replace('const E = process.env, mode = E.', 'const E = process.env, other = E.'))

    def test_missing_environment_clear_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'EXPLICIT_ENV_CLEAR_BEFORE_SELECTION'):
            contract.launcher_environment(launcher().replace('    os.environ.clear()\n', ''))

    def test_dynamic_environment_selection_is_not_evaluated(self):
        changed = launcher().replace("'current-native-issued-close-source-v4'", 'host_callback()')
        with self.assertRaisesRegex(ValueError, 'LITERAL_STARTUP_ENV_VALUES'):
            contract.launcher_environment(changed)

    def test_a_second_startup_update_cannot_silently_override_the_first(self):
        with self.assertRaisesRegex(ValueError, 'ONE_STARTUP_ENV_SELECTION'):
            contract.launcher_environment(launcher() + launcher().replace('def main():', 'def another():'))

    def test_extra_ambient_runtime_options_are_not_admitted(self):
        result = contract.review_startup_sources(launcher(), guard(), guard(True))
        with self.assertRaisesRegex(ValueError, 'STARTUP_ENVIRONMENT_MISMATCH'):
            contract.require_startup_environment(dict(result['expectedEnvironment'], NODE_OPTIONS='--anything'), result)

    def test_changed_safe_environment_prefix_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'FIXED_SAFE_ENV_PREFIX'):
            contract.launcher_environment(launcher().replace("TZ='UTC'", "TZ='OTHER'"))

    def test_unreviewed_contract_or_nonstring_environment_is_refused(self):
        result = contract.review_startup_sources(launcher(), guard(), guard(True))
        changed = copy.deepcopy(result)
        changed['expectedEnvironment']['TZ'] = 'OTHER'
        with self.assertRaisesRegex(ValueError, 'REVIEWED_STARTUP_CONTRACT_REQUIRED'):
            contract.require_startup_environment(changed['expectedEnvironment'], changed)
        with self.assertRaisesRegex(ValueError, 'STARTUP_ENVIRONMENT_MISMATCH'):
            contract.require_startup_environment(dict(result['expectedEnvironment'], WS_NO_BUFFER_UTIL=True), result)

    def test_source_bounds_and_types_are_checked_before_parsing(self):
        for value in (None, b'NOT_TEXT', 'x' * 65537, '\u0131'):
            with self.subTest(value=type(value).__name__), self.assertRaisesRegex(ValueError, 'BOUNDED_ASCII_STARTUP_SOURCE'):
                contract.launcher_environment(value)


if __name__ == '__main__':
    if not sys.dont_write_bytecode or len(sys.argv) != 1:
        raise ValueError('EXPLICIT_SOURCE_DATA_CONTROL_REQUIRED')
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(StartupContractTests)
    if suite.countTestCases() != 14:
        raise ValueError('EXACT_STARTUP_CONTROL_COUNT')
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print(json.dumps(dict(selected=14, failures=len(result.failures), errors=len(result.errors),
        skipped=len(result.skipped), nativeExecuted=False, authority='NONE')))
    sys.exit(0 if result.wasSuccessful() else 1)
