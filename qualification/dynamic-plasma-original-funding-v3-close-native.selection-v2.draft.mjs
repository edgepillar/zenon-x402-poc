/*
 * V2 fixture correction: exact same six-case V3 SDK/SQLite selection.
 * A NEW reviewed V3 profile/preload and matching direct human scope are needed.
 * The old V2 preload/profile and exhausted native runs MUST NOT be reused.
 */
if (process.versions.node !== '24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || process.argv.length !== 3 || process.argv[2] !== process.env.SPV_TASK_SCRATCH
    || typeof process.argv[2] !== 'string' || process.argv[2].length < 1
    || process.env.X402_DP_SUBMISSION_V3_CLOSE_SELECTION !== 'six-selected-v3-close-cases-only'
    || process.env.X402_DP_SUBMISSION_V3_CLOSE_NATIVE_MODE !== 'reviewed-native-fchmod'
    || !/^[0-9a-f]{64}$/.test(process.env.X402_DP_SUBMISSION_V3_CLOSE_PROFILE_SHA256 || '')
    || typeof process.env.X402_DP_SUBMISSION_V3_CLOSE_PROFILE_PATH !== 'string'
    || process.env.X402_DP_SUBMISSION_V3_CLOSE_PROFILE_PATH.length < 1
    || process.env.X402_DP_SUBMISSION_V3_CLOSE_PROFILE_PATH.length > 4096
    || !process.execArgv.some(value => value === '--import' || value.startsWith('--import='))
    || process.execArgv.some(value => value === '--permission' || value === '--experimental-permission'
      || value.startsWith('--permission=') || value.startsWith('--allow-fs-'))
    || process.env.NODE_OPTIONS !== undefined || process.env.NODE_PATH !== undefined
    || process.env.NODE_TEST_CONTEXT !== undefined || process.env.NODE_V8_COVERAGE !== undefined) {
  throw new TypeError('X402_V3_SIX_CASE_SELECTION_REJECTED_BEFORE_EFFECT_IMPORTS');
}
await import('./dynamic-plasma-original-funding-v3-close-native.behavior-v2.draft.mjs');
console.log('# six-case-original-funding-v3-close-selection ' + JSON.stringify({
  selectionVersion: 1, expectedCases: 6, selectionIsNotHumanAuthorization: true,
  sourceTransforms: 0, ordinaryInstalledNamespaceQualified: false,
  nativeHTTPS: 0, nonceEvaluations: 0, authority: 'NONE',
}));
