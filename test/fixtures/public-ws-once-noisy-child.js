import { createReadStream } from 'node:fs';

async function runNoisyChild() {
  const chunks = [];
  for await (const chunk of createReadStream(null, { fd: 4, autoClose: true })) {
    chunks.push(chunk);
  }
  for (let index = 0; index < chunks.length; index += 1) chunks[index].fill(0);

  console.log('synthetic dependency console output');
  console.error('synthetic dependency console error');
  process.stdout.write('synthetic direct stdout\n');
  process.stderr.write('synthetic direct stderr\n');
  process._rawDebug('synthetic raw debug output');

  const finish = expected => {
    process.send({ ipcVersion: 1, requestId: 1, type: expected }, () => {
      console.log('synthetic post-result console output');
      process.stdout.write('synthetic post-result direct stdout\n');
      process._rawDebug('synthetic post-result raw debug output');
      process.exit(0);
    });
  };
  process.on('message', message => {
    if (message?.type === 'PREFLIGHT') return finish('PREFLIGHT_VALID');
    if (message?.type === 'RUN') {
      process.send({ ipcVersion: 1, requestId: 2, type: 'ORIGIN_RELEASE' });
      return;
    }
    if (message?.type === 'ORIGIN_RELEASED' && message?.requestId === 2) {
      finish('PENDING');
    }
  });

  process.send({ ipcVersion: 1, requestId: 1, type: 'READY' });
}

if (process.env.NODE_TEST_CONTEXT === undefined) await runNoisyChild();
