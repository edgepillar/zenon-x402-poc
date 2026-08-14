import { createResourceServer } from './resource-server.js';
import { MockExactZenonClient, MockExactZenonFacilitator } from './mock-payment.js';
import { paidFetch } from './buyer.js';
import { buildRequirement } from './config.js';

const facilitator = new MockExactZenonFacilitator();
const requirement = await buildRequirement('mock');
const app = createResourceServer({ facilitator, requirement, port: 0 });
const listening = await app.listen();

try {
  const buyer = new MockExactZenonClient();
  const result = await paidFetch(`${listening.url}/paid`, buyer);
  const body = await result.response.json();
  console.log('HTTP:', result.response.status);
  console.log('Payment requirements:', result.paymentRequired.accepts[0]);
  console.log('Settlement:', result.settlement);
  console.log('Resource:', body);
} finally {
  await app.close();
}
