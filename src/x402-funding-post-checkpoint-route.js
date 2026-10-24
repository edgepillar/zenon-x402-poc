import { URL } from 'node:url';

const F = Object.freeze, NATIVE_URL = URL;

/**
 * Closed DATA route for a retained funding POST-v1 checkpoint.
 * Deliberately separate from GET /paid. This does not bind a native request,
 * authenticate TLS/Host, create a payment, grant or authorize sending a header.
 */
export function captureFundingPostCheckpointRoute(resourceUrl) {
  try {
    if (arguments.length !== 1 || typeof resourceUrl !== 'string'
        || resourceUrl.length < 1 || resourceUrl.length > 2048
        || /[^\x21-\x7e]/.test(resourceUrl)) fail();
    const u = new NATIVE_URL(resourceUrl);
    if (u.protocol !== 'https:' || u.href !== resourceUrl
        || u.href !== u.origin + '/funding' || u.host === '' || u.username !== ''
        || u.password !== '' || u.search !== '' || u.hash !== ''
        || u.port === '0') fail();
    return F({ profile: 'FUNDING_POST_V1_EMPTY_BODY', resourceUrl, authority: u.host,
      method: 'POST', requestTarget: '/funding', originalBodyBase64: '' });
  } catch { fail(); }
}
function fail() {
  const code = 'x402_funding_post_checkpoint_route_rejected', error = new TypeError(code);
  Object.defineProperty(error, 'code', { value: code, enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: ' + code });
  throw F(error);
}
