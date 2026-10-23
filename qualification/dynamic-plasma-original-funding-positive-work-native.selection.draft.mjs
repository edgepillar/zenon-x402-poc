/*
 * Only the separately approved three positive-work/V3/SDK/V6 cases.
 * Selection is not human authorization. Old V2/V3 native grants are not reused.
 */
if (process.versions.node !== '24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || process.argv.length !== 3 || process.argv[2] !== process.env.SPV_TASK_SCRATCH
    || typeof process.argv[2] !== 'string' || process.argv[2].length < 1
    || process.env.X402_DP_POSITIVE_WORK_SELECTION !== 'three-selected-positive-work-cases-only'
    || process.env.X402_DP_POSITIVE_WORK_NATIVE_MODE !== 'reviewed-native-fchmod'
    || !/^[0-9a-f]{64}$/.test(process.env.X402_DP_POSITIVE_WORK_PROFILE_SHA256 || '')
    || typeof process.env.X402_DP_POSITIVE_WORK_PROFILE_PATH !== 'string'
    || process.env.X402_DP_POSITIVE_WORK_PROFILE_PATH.length < 1
    || process.env.X402_DP_POSITIVE_WORK_PROFILE_PATH.length > 4096
    || !process.execArgv.some(value => value === '--import' || value.startsWith('--import='))
    || process.execArgv.some(value => value === '--permission' || value === '--experimental-permission'
      || value.startsWith('--permission=') || value.startsWith('--allow-fs-'))
    || process.env.NODE_OPTIONS !== undefined || process.env.NODE_PATH !== undefined
    || process.env.NODE_TEST_CONTEXT !== undefined || process.env.NODE_V8_COVERAGE !== undefined) {
  throw new TypeError('X402_POSITIVE_WORK_SELECTION_REJECTED_BEFORE_EFFECT_IMPORTS');
}
await import('./dynamic-plasma-original-funding-positive-work-native.behavior.draft.mjs');
console.log('# three-case-original-funding-positive-work-selection ' + JSON.stringify({
  selectionVersion: 1, expectedCases: 3, selectionIsNotHumanAuthorization: true,
  sourceTransforms: 0, ordinaryInstalledNamespaceQualified: false,
  nativeHTTPS: 0, maximumAggregateCandidateReservation: 65536, authority: 'NONE',
}));

