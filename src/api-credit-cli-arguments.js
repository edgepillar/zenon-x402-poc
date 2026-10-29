import { types } from 'node:util';

const F = Object.freeze;
export function captureApiCreditCliArguments(argv) {
  if (arguments.length !== 1 || !Array.isArray(argv) || types.isProxy(argv) || Object.getPrototypeOf(argv) !== Array.prototype
      || Reflect.ownKeys(argv).length !== argv.length + 1) fail();
  const values = [];
  for (let i = 0; i < argv.length; i++) { const d = Object.getOwnPropertyDescriptor(argv, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value') || typeof d.value !== 'string') fail(); values.push(d.value); }
  if (values.length === 1 && values[0] === '--help') return F({ mode: 'HELP' });
  if (values.length === 6 && ['--inspect-fd', '--signer-inspect-fd', '--recorded-result-fd', '--funding-inspect-fd', '--funding-grant-query-fd'].includes(values[0]) && values[2] === '--output-fd' && values[4] === '--bootstrap-ms') {
    const numbers = [values[1], values[3], values[5]].map((value, index) => {
      if (/^[1-9][0-9]{0,4}$/.exec(value)?.[0] !== value) fail(); const n = Number(value);
      if (index < 2 ? n < 3 || n > 1023 : n < 1 || n > 60000) fail(); return n;
    });
    if (numbers[0] === numbers[1]) fail();
    return values[0] === '--funding-grant-query-fd' ? F({ mode: 'ORIGINAL_GRANT_QUERY', originalGrantQueryFd: numbers[0], outputFd: numbers[1], bootstrapMs: numbers[2] })
      : values[0] === '--funding-inspect-fd' ? F({ mode: 'FUNDING_INSPECT', fundingInspectionFd: numbers[0], outputFd: numbers[1], bootstrapMs: numbers[2] })
      : values[0] === '--recorded-result-fd' ? F({ mode: 'RECORDED_RESULT', recordedResultFd: numbers[0], outputFd: numbers[1], bootstrapMs: numbers[2] })
      : values[0] === '--inspect-fd' ? F({ mode: 'INSPECT', inspectionFd: numbers[0], outputFd: numbers[1], bootstrapMs: numbers[2] })
      : F({ mode: 'SIGNER_INSPECT', signerInspectionFd: numbers[0], outputFd: numbers[1], bootstrapMs: numbers[2] });
  }
  if (values.length !== 10) fail();
  const names = ['--profile-fd', '--key-fd', '--input-fd', '--output-fd', '--bootstrap-ms'];
  const keys = ['profileFd', 'keyFd', 'inputFd', 'outputFd', 'bootstrapMs'], out = {};
  for (let i = 0; i < names.length; i++) {
    if (values[2 * i] !== names[i] || /^[1-9][0-9]{0,4}$/.exec(values[2 * i + 1])?.[0] !== values[2 * i + 1]) fail();
    const n = Number(values[2 * i + 1]); if (i < 4 ? n < 3 || n > 1023 : n < 1 || n > 60000) fail(); out[keys[i]] = n;
  }
  if (new Set(keys.slice(0, 4).map(k => out[k])).size !== 4) fail();
  return F({ mode: 'RUN', ...out });
}
function fail() { throw new TypeError('API_CREDIT_CLI_ARGUMENTS'); }
