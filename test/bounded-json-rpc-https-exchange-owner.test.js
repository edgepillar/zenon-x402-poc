import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBoundedJsonRpcHttpsExchangeOwner,
} from '../src/zenon/bounded-json-rpc-https-exchange-owner.js';

const OWNER_PREFIX = 'dynamic_plasma_https_read_transport_owner_';

function internalConfiguration(routeOverrides = {}, configurationOverrides = {}) {
  const route = Object.freeze(Object.assign(Object.create(null), {
    hostname: 'rpc.synthetic-public.org',
    path: '/rpc',
    ipv4Address: '8.8.8.8',
    ...routeOverrides,
  }));
  return Object.freeze(Object.assign(Object.create(null), {
    route,
    timeoutMs: 100,
    closeGraceMs: 20,
    ...configurationOverrides,
  }));
}

test('shared bounded HTTPS exchange owner is inert and exposes only exchange plus close', async () => {
  const configuration = internalConfiguration();
  const owner = createBoundedJsonRpcHttpsExchangeOwner(
    configuration,
    1,
    value => value,
    'dynamic_plasma',
  );
  assert.deepEqual(Object.keys(owner), ['exchange', 'close']);
  assert.equal(Object.isFrozen(owner), true);
  assert.equal(Object.isFrozen(owner.exchange), true);
  assert.equal(Object.isFrozen(owner.close), true);
  await owner.close();
});

test('shared core independently rejects invalid normalized route and timing snapshots', () => {
  const invalid = [
    internalConfiguration({ hostname: 'localhost' }),
    internalConfiguration({ path: '/rpc?unbounded=true' }),
    internalConfiguration({ ipv4Address: '127.0.0.1' }),
    internalConfiguration({}, { timeoutMs: 0 }),
    internalConfiguration({}, { closeGraceMs: 60001 }),
  ];
  for (const configuration of invalid) {
    assert.throws(
      () => createBoundedJsonRpcHttpsExchangeOwner(
        configuration,
        1,
        value => value,
        'dynamic_plasma',
      ),
      error => error?.code === `${OWNER_PREFIX}configuration_rejected`
        && Object.hasOwn(error, 'cause') === false,
    );
  }
});

test('shared core consumes one trusted snapshot and preserves cause-free close failures', async () => {
  const configuration = internalConfiguration();
  let snapshots = 0;
  const owner = createBoundedJsonRpcHttpsExchangeOwner(
    configuration,
    1,
    value => {
      snapshots += 1;
      assert.equal(value, configuration);
      return value;
    },
    'dynamic_plasma',
  );
  assert.equal(snapshots, 1);
  await assert.rejects(
    owner.close('unexpected'),
    error => error?.code === `${OWNER_PREFIX}configuration_rejected`
      && Object.hasOwn(error, 'cause') === false,
  );
  await owner.close();
});
