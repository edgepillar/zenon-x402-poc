import { loadDotEnv, envInt } from './env.js';
loadDotEnv();

const mode = process.env.PAYMENT_MODE ?? 'mock';
const [{ createResourceServer }, { buildRequirement }] = await Promise.all([
  import('./resource-server.js'),
  import('./config.js'),
]);
const requirement = await buildRequirement(mode);
let facilitator;
if (mode === 'mock') {
  const { MockExactZenonFacilitator } = await import('./mock-payment.js');
  facilitator = new MockExactZenonFacilitator();
} else {
  const { ExactZenonFacilitator } = await import('./zenon-payment.js');
  facilitator = new ExactZenonFacilitator();
}

const port = envInt('PORT', 8402);
const app = createResourceServer({ facilitator, requirement, port, advertisedBaseUrl: process.env.RESOURCE_BASE_URL });
const listening = await app.listen();
console.log(`[${mode}] x402 resource server listening on ${listening.url}/paid`);
console.log('Requirement:', requirement);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
}
