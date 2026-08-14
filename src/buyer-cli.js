import { loadDotEnv } from './env.js';
loadDotEnv();

const mode = process.env.PAYMENT_MODE ?? 'mock';
const url = process.argv[2] ?? process.env.RESOURCE_URL ?? 'http://127.0.0.1:8402/paid';
let client;
if (mode === 'mock') {
  const { MockExactZenonClient } = await import('./mock-payment.js');
  client = new MockExactZenonClient();
} else {
  const { ExactZenonClient } = await import('./zenon-payment.js');
  client = new ExactZenonClient();
}

const { paidFetch } = await import('./buyer.js');
const result = await paidFetch(url, client);
console.log('HTTP:', result.response.status);
console.log('Settlement:', result.settlement);
console.log(await result.response.text());
