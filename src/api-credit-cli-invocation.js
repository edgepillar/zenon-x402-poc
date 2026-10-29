import { captureApiCreditCliArguments } from './api-credit-cli-arguments.js';

const F = Object.freeze, REFUSED = F({ mode: 'RUNTIME_REFUSED' });

/** Fixed source-profile compatibility, not binary/package authentication or
 * native qualification. Only the native entry supplies process metadata;
 * argv, a profile and environment DATA cannot select a runtime policy.
 * Help remains available without runtime admission. Refusal carries no FDs. */
export function captureApiCreditCliInvocation(argv, nodeVersion, releaseName, platform, architecture) {
  if (arguments.length !== 5) throw new TypeError('API_CREDIT_CLI_INVOCATION_INPUT');
  const args = captureApiCreditCliArguments(argv);
  if (args.mode === 'HELP') return args;
  if (nodeVersion !== '24.19.0' || releaseName !== 'node'
      || platform !== 'linux' && platform !== 'darwin'
      || architecture !== 'x64' && architecture !== 'arm64') return REFUSED;
  return args;
}
