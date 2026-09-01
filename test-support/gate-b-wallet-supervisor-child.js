import { createReadStream } from 'node:fs';

const IPC_VERSION = 1;
const REQUEST_ID = 1;
const MAX_BYTES = 8192;

function stop(code) {
  try { process.exit(code); } catch {}
}

function send(type) {
  return new Promise((resolve, reject) => {
    try {
      const accepted = process.send({
        ipcVersion: IPC_VERSION,
        requestId: REQUEST_ID,
        type,
      }, error => error ? reject(new Error('fixture_failed')) : resolve());
      if (accepted === false && process.connected === false) reject(new Error('fixture_failed'));
    } catch {
      reject(new Error('fixture_failed'));
    }
  });
}

async function readBootstrap() {
  const chunks = [];
  let total = 0;
  const stream = createReadStream(null, { fd: 4, autoClose: true });
  for await (const chunk of stream) {
    if (!Buffer.isBuffer(chunk)) throw new Error('fixture_failed');
    total += chunk.length;
    if (total < 1 || total > MAX_BYTES) throw new Error('fixture_failed');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, total);
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
        Reflect.ownKeys(value).length !== 1 || typeof value.workspaceRoot !== 'string' ||
        value.workspaceRoot.length === 0 || JSON.stringify(value) !== bytes.toString('utf8')) {
      throw new Error('fixture_failed');
    }
  } finally {
    bytes.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

async function main() {
  const environmentKeys = Reflect.ownKeys(process.env);
  const environmentValid = environmentKeys.length === 0 ||
    (process.platform === 'darwin' && environmentKeys.length === 1 &&
      environmentKeys[0] === '__CF_USER_TEXT_ENCODING');
  if (!environmentValid) throw new Error('fixture_failed');
  await readBootstrap();
  process.once('disconnect', () => stop(1));
  let handled = false;
  process.on('message', async message => {
    if (handled) return stop(1);
    handled = true;
    if (!message || Object.getPrototypeOf(message) !== Object.prototype ||
        Reflect.ownKeys(message).length !== 3 ||
        message.ipcVersion !== IPC_VERSION || message.requestId !== REQUEST_ID ||
        message.type !== 'CREATE') return stop(1);
    try {
      await send('CREATED');
      stop(0);
    } catch {
      stop(1);
    }
  });
  await send('READY');
}

void main().catch(() => stop(1));
