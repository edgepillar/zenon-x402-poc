import { Buffer } from 'node:buffer';
import { runInNewContext } from 'node:vm';
import { workerData } from 'node:worker_threads';

const fixture = workerData && typeof workerData === 'object' ? workerData : {};
const mode = typeof fixture.mode === 'string' ? fixture.mode : 'valid-native-promise';
const counter = fixture.counter instanceof SharedArrayBuffer
  ? new Int32Array(fixture.counter)
  : null;

function touch() {
  if (counter) Atomics.add(counter, 0, 1);
}

function count(index) {
  if (counter && counter.length > index) Atomics.add(counter, index, 1);
}

if (mode === 'prototype-then') {
  Object.defineProperty(Object.prototype, 'then', {
    configurable: true,
    get() {
      touch();
      return undefined;
    },
  });
}

const repeated = character => character.repeat(64);

export const SyncState = Object.freeze({ SyncDone: 2 });

export class Hash {
  constructor(core) {
    this.core = core;
  }
}

export class Peer {
  constructor(publicKey, ip) {
    this.publicKey = publicKey;
    this.ip = ip;
  }
}

export class NetworkInfo {
  constructor() {
    this.numPeers = 1;
    this.self = new Peer('fixture-peer', 'loopback');
    this.peers = [];
  }
}

export class SyncInfo {
  constructor() {
    this.state = SyncState.SyncDone;
    this.currentHeight = 8;
    this.targetHeight = 8;
  }
}

export class Momentum {
  constructor({ height = 8, hash = repeated('f'), previousHash = repeated('a') } = {}) {
    this.version = 1;
    this.chainIdentifier = 69;
    this.hash = new Hash(Buffer.from(hash, 'hex'));
    if (mode === 'hash-core-proxy') {
      this.hash.core = new Proxy(this.hash.core, {
        get(target, key, receiver) {
          touch();
          return Reflect.get(target, key, receiver);
        },
      });
    }
    this.previousHash = new Hash(Buffer.from(previousHash, 'hex'));
    this.height = height;
    this.timestamp = 0;
    this.data = Buffer.alloc(0);
    this.content = [];
    this.changesHash = new Hash(Buffer.alloc(32, 1));
    this.publicKey = '';
    this.signature = '';
    this.producer = undefined;
  }
}

export class MomentumList {
  constructor() {
    this.count = 8;
    this.list = [new Momentum({ height: 2, hash: repeated('b') })];
  }
}

function hostileAccessor(value = new NetworkInfo()) {
  const result = Object.create(Object.getPrototypeOf(value));
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    Object.defineProperty(result, key, descriptor);
  }
  Object.defineProperty(result, 'numPeers', {
    configurable: true,
    enumerable: true,
    get() {
      touch();
      return 1;
    },
  });
  return result;
}

function hostileThenable() {
  const result = Object.create(null);
  Object.defineProperty(result, 'then', {
    configurable: true,
    enumerable: true,
    get() {
      touch();
      return undefined;
    },
  });
  return result;
}

function resultFor(kind) {
  let result;
  if (kind === 'network') result = new NetworkInfo();
  if (kind === 'sync') result = new SyncInfo();
  if (kind === 'frontier') result = new Momentum();
  if (kind === 'height-two') result = new MomentumList();

  if (mode === 'result-proxy' && kind === 'network') {
    return new Proxy(result, {
      get(target, key, receiver) {
        touch();
        return Reflect.get(target, key, receiver);
      },
    });
  }
  if (mode === 'accessor-result' && kind === 'network') return hostileAccessor(result);
  if (mode === 'thenable-result' && kind === 'network') return hostileThenable();
  if (mode === 'subclass-result' && kind === 'network') {
    class Subclass extends NetworkInfo {}
    return new Subclass();
  }
  if (mode === 'cross-realm-result' && kind === 'network') {
    return runInNewContext('({numPeers:1,self:{publicKey:"fixture-peer",ip:"loopback"},peers:[]})');
  }
  if (mode === 'promise-subclass' && kind === 'network') {
    class Subclass extends Promise {}
    return new Subclass(resolve => resolve(result));
  }
  if (mode === 'promise-proxy' && kind === 'network') {
    return new Proxy(Promise.resolve(result), {
      get(target, key, receiver) {
        touch();
        return Reflect.get(target, key, receiver);
      },
    });
  }
  if (mode === 'cross-realm-promise' && kind === 'network') {
    return runInNewContext('Promise.resolve(value)', { value: result });
  }
  if (mode === 'primitive-result' && kind === 'network') return true;
  if (mode === 'hung-promise' && kind === 'network') return new Promise(() => {});
  if (mode === 'sync-values') return result;
  return Promise.resolve(result);
}

export class StatsApi {
  networkInfo() {
    count(2);
    return resultFor('network');
  }

  syncInfo() {
    count(3);
    return resultFor('sync');
  }
}

export class LedgerApi {
  getFrontierMomentum() {
    count(4);
    return resultFor('frontier');
  }

  getMomentumsByHeight() {
    count(5);
    return resultFor('height-two');
  }
}

if (mode === 'method-proxy') {
  const original = StatsApi.prototype.networkInfo;
  Object.defineProperty(StatsApi.prototype, 'networkInfo', {
    configurable: true,
    value: new Proxy(original, {
      apply(target, receiver, args) {
        touch();
        return Reflect.apply(target, receiver, args);
      },
    }),
  });
}

if (mode === 'accessor-method') {
  Object.defineProperty(StatsApi.prototype, 'networkInfo', {
    configurable: true,
    get() {
      touch();
      return () => resultFor('network');
    },
  });
}

export class Zenon {
  constructor() {
    this.stats = new StatsApi();
    this.ledger = new LedgerApi();
    if (mode === 'stats-receiver-proxy') {
      this.stats = new Proxy(this.stats, {
        get(target, key, receiver) {
          touch();
          return Reflect.get(target, key, receiver);
        },
        set(target, key, value, receiver) {
          touch();
          return Reflect.set(target, key, value, receiver);
        },
      });
    }
    if (mode === 'ledger-receiver-proxy') {
      this.ledger = new Proxy(this.ledger, {
        get(target, key, receiver) {
          touch();
          return Reflect.get(target, key, receiver);
        },
        set(target, key, value, receiver) {
          touch();
          return Reflect.set(target, key, value, receiver);
        },
      });
    }
    if (mode === 'stats-receiver-accessor') {
      const stats = this.stats;
      Object.defineProperty(this, 'stats', {
        configurable: true,
        enumerable: true,
        get() {
          touch();
          return stats;
        },
      });
    }
    if (mode === 'ledger-receiver-accessor') {
      const ledger = this.ledger;
      Object.defineProperty(this, 'ledger', {
        configurable: true,
        enumerable: true,
        get() {
          touch();
          return ledger;
        },
      });
    }
    this.client = undefined;
  }

  initialize() {
    count(1);
    const client = Object.freeze({ fixture: true });
    this.client = client;
    this.stats.client = client;
    this.ledger.client = client;
    if (mode === 'initialize-sync') return undefined;
    if (mode === 'initialize-thenable') return hostileThenable();
    if (mode === 'initialize-promise-proxy') return new Proxy(Promise.resolve(), {
      get(target, key, receiver) {
        touch();
        return Reflect.get(target, key, receiver);
      },
    });
    if (mode === 'initialize-promise-subclass') {
      class Subclass extends Promise {}
      return new Subclass(resolve => resolve());
    }
    if (mode === 'initialize-cross-realm-promise') return runInNewContext('Promise.resolve()');
    if (mode === 'initialize-wrong-fulfillment') return Promise.resolve(true);
    return Promise.resolve();
  }

  clearConnection() {
    count(6);
    if (mode === 'close-throw') throw new Error('fixture close failure');
    if (mode === 'close-hang') return new Promise(() => {});
    if (mode === 'close-promise') return Promise.resolve();
    if (mode === 'close-value') return true;
    this.client = undefined;
    return undefined;
  }
}
