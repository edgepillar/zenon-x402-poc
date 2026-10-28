/** UTC day index for the existing durable spending contract. This does not
 * replace its rollback check or supply time from caller command DATA. */
export function captureApiCreditOperatorUtcDay(milliseconds) {
  if (arguments.length !== 1 || !Number.isSafeInteger(milliseconds) || milliseconds < 0 || Object.is(milliseconds, -0)) fail();
  const day = Math.floor(milliseconds / 86400000);
  if (day > 2147483647) fail(); return day;
}
function fail() { throw new TypeError('API_CREDIT_OPERATOR_CLOCK'); }
