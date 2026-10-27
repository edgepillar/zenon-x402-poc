"""Pure startup DATA review for the source-pinned issued-close V6 graph.

This deliberately recognizes its reviewed Python/JavaScript guard forms, not
arbitrary programs. It neither imports a launcher nor changes the environment.
Source hashes and actual runtime guards remain independently required.
"""
import ast
import re

EXPECTED = {
    'X402_ISSUED_CLOSE_NATIVE_SELECTION': 'current-native-issued-close-source-v6',
    'X402_ISSUED_CLOSE_NATIVE_RUN_SCOPE': 'one-current-clean-issued-close-v6',
    'X402_ISSUED_CLOSE_NATIVE_MODE': 'clean',
}
PREFIX = dict(PATH='/usr/bin:/bin', LANG='C', LC_ALL='C', TZ='UTC',
    NODE_DISABLE_COMPILE_CACHE='1', WS_NO_BUFFER_UTIL='1', WS_NO_UTF_8_VALIDATE='1')


def require(value, code):
    if not value:
        raise ValueError(code)


def text(value):
    require(type(value) is str and value.isascii() and len(value) <= 65536,
        'BOUNDED_ASCII_STARTUP_SOURCE')
    return value


def qualified(node, names):
    for name in reversed(names[1:]):
        if not isinstance(node, ast.Attribute) or node.attr != name:
            return False
        node = node.value
    return isinstance(node, ast.Name) and node.id == names[0]


def launcher_environment(source):
    tree = ast.parse(text(source))
    found = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not qualified(node.func, ('os', 'environ', 'update')):
            continue
        if not any(k.arg in EXPECTED for k in node.keywords):
            continue
        require(not node.args and len(node.keywords) == len(set(EXPECTED) | set(PREFIX))
            and {k.arg for k in node.keywords} == set(EXPECTED) | set(PREFIX), 'EXACT_STARTUP_ENV_FIELDS')
        values = {}
        for key in node.keywords:
            require(isinstance(key.value, ast.Constant) and type(key.value.value) is str,
                'LITERAL_STARTUP_ENV_VALUES')
            values[key.arg] = key.value.value
        require(all(values[k] == v for k, v in PREFIX.items()), 'FIXED_SAFE_ENV_PREFIX')
        cleared = False
        for parent in ast.walk(tree):
            for _field, body in ast.iter_fields(parent):
                if not isinstance(body, list):
                    continue
                for index, statement in enumerate(body):
                    if isinstance(statement, ast.Expr) and statement.value is node and index > 0:
                        before = body[index - 1]
                        cleared = isinstance(before, ast.Expr) and isinstance(before.value, ast.Call) \
                            and qualified(before.value.func, ('os', 'environ', 'clear')) \
                            and not before.value.args and not before.value.keywords
        require(cleared, 'EXPLICIT_ENV_CLEAR_BEFORE_SELECTION')
        found.append((values, node.lineno))
    require(len(found) == 1, 'ONE_STARTUP_ENV_SELECTION')
    return found[0]


def javascript_guard(source):
    source = text(source)
    result = {}
    for key in EXPECTED:
        values = re.findall(r"(?m)^\s*\|\| E\." + key + r" !== '([^'\n]+)'", source)
        if key.endswith('_MODE') and not values:
            require("const E = process.env, mode = E.X402_ISSUED_CLOSE_NATIVE_MODE;" in source,
                'EXACT_REVIEWED_MODE_ALIAS')
            values = re.findall(r"(?m)^\s*\|\| mode !== '([^'\n]+)'", source)
        require(len(values) == 1, 'ONE_LITERAL_JS_STARTUP_GUARD')
        result[key] = values[0]
    return result


def review_startup_sources(launcher, case, preload):
    old, line = launcher_environment(launcher)
    expected_case, expected_preload = javascript_guard(case), javascript_guard(preload)
    require(expected_case == expected_preload == EXPECTED, 'REVIEWED_CASE_PRELOAD_STARTUP_AGREEMENT')
    mismatches = {key: dict(launcher=old[key], required=EXPECTED[key])
        for key in EXPECTED if old[key] != EXPECTED[key]}
    corrected = dict(PREFIX, **EXPECTED)
    return dict(startupContractVersion=1, launcherEnvironmentLine=line,
        originalEnvironment=old, expectedEnvironment=corrected, mismatches=mismatches,
        originalStartupMatches=not mismatches, correctedStartupMatches=True,
        applicationVersion=6, controllerRevision=7, sourceTransforms=False,
        applicationOrPackageImported=False, nativeAuthority='NONE')


def require_startup_environment(environment, reviewed):
    require(type(environment) is dict and type(reviewed) is dict
        and reviewed.get('startupContractVersion') == 1
        and reviewed.get('expectedEnvironment') == dict(PREFIX, **EXPECTED), 'REVIEWED_STARTUP_CONTRACT_REQUIRED')
    require(environment == reviewed['expectedEnvironment']
        and all(type(k) is str and type(v) is str for k, v in environment.items()),
        'STARTUP_ENVIRONMENT_MISMATCH')
    return True
