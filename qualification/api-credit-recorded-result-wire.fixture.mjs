// Source G1/G2 composition over the actual command host/channel/product.
// Funding, grant activation, proof, file, SQL and native children are DATA ports.
import { Buffer } from 'node:buffer';
import { Writable } from 'node:stream';
import { recordedResultFixture } from './api-credit-recorded-result.fixture.mjs';
import { captureApiCreditServiceCommand, captureApiCreditServiceReplayCommand,
  decodeApiCreditServiceCommandResult } from '../src/api-credit-service-command.js';
import { encodeBuyerApiCreditCommand } from '../src/buyer-original-funding-command.js';
import { createBuyerApiCreditFundingCommandSession } from '../src/buyer-original-funding-command-session.js';
import { createBuyerApiCreditCommandLineChannel } from '../src/buyer-command-line-channel.js';

export function recordedResultWireFixture({ corruptAt = null, corruptReply = null } = {}) {
  const r = recordedResultFixture({ requestBudget: 100 }), h = r.h, unusedOutput = h.output;
  const state = { r, h, rawReplies: [], decoded: [], serviceCommands: [], outputErrors: [],
    first: null, active: null, firstResult: null, beforeReplay: null, paymentBeforeReplay: null,
    replaySent: false, closeSent: false, consumerError: null };
  function sendNext() {
    let captured;
    if (state.serviceCommands.length < 100) {
      const index = state.serviceCommands.length, input = r.request('item.' + index);
      captured = captureApiCreditServiceCommand({ id: 'service.' + index, serviceResourceUrl: input.serviceResourceUrl,
        originalRequestJson: input.originalRequestJson, authorizationHeader: input.authorizationHeader, maxLineBytes: 262144 });
      if (index === 0) state.first = captured;
    } else if (!state.replaySent) {
      state.beforeReplay = JSON.stringify(h.model.exportState()); state.paymentBeforeReplay = h.raw();
      captured = captureApiCreditServiceReplayCommand(state.first, 'replay'); state.replaySent = true;
    } else {
      state.closeSent = true;
      h.input.write(encodeBuyerApiCreditCommand({ version: 1, id: 'close', operation: 'close', input: {} })); return;
    }
    state.active = captured; state.serviceCommands.push(captured); h.input.write(captured.line);
  }
  h.output = new Writable({ write(chunk, encoding, done) {
    try {
      const line = Buffer.from(chunk).toString('utf8'), reply = JSON.parse(line);
      h.replies.push(reply);
      if (reply.operation === 'submitService') {
        state.rawReplies.push(line);
        const observed = state.rawReplies.length === corruptAt ? corruptReply(line) : line;
        // Decode the actual complete line, never reconstructed JSON. One
        // explicit next command is queued only after its prior reply passes.
        const result = decodeApiCreditServiceCommandResult(state.active, observed);
        state.decoded.push(result); if (state.firstResult === null) state.firstResult = result;
        state.active = null; sendNext();
      }
      if (h.onWrite) h.onWrite(reply, done); else done();
    } catch (error) { state.consumerError = error; done(error); }
  } });
  // Keep the test's output error observable while the real channel also
  // receives it. This is not a successful write or a native release receipt.
  h.output.on('error', error => state.outputErrors.push(error));
  h.owner = createBuyerApiCreditFundingCommandSession({ client: r.root,
    channel: createBuyerApiCreditCommandLineChannel({ input: h.input, output: h.output, limits: {} }), limits: {} });
  state.start = () => h.startFunding(sendNext);
  state.cleanup = async () => { try { await r.cleanup(); } finally { unusedOutput.destroy(); } };
  return state;
}
