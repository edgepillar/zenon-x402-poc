// SOURCE ONLY. Fixed native binding; no runtime acceptance is established.
import { Readable, Writable } from 'node:stream';
import { hrtime } from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { runApiCreditOperatorCoordinator } from '../api-credit-operator-coordinator.js';
import { captureApiCreditOperatorUtcDay } from '../api-credit-operator-clock.js';
import { runBuyerOriginalCommandHost } from '../buyer-original-command-host.js';
import { createNativeApiCreditOperatorPipes } from './native-api-credit-operator-pipes.js';
import { createNativeApiCreditOperatorKeyLease } from './native-api-credit-operator-key.js';
import { openSdk105NativeApiCreditProductSelectionCommandSession } from './sdk105-native-api-credit-command-session.js';

const F = Object.freeze, ON = Readable.prototype.on, RD = Readable.prototype.destroy, WD = Writable.prototype.destroy;
const NOW = Date.now, DATE = Date, CLOCK = hrtime.bigint;
const FAILED = new Set();
let entered = false;
function fail() { throw new TypeError('API_CREDIT_NATIVE_OPERATOR_UNKNOWN'); }
/** One explicit transfer of four operator-owned FIFO ends. Public profile and
 * a separate 32-byte credential are bootstrap inputs; command JSON is not a
 * loader. These fixed ports cannot be supplied through argv, JSON or env. */
export async function runNativeApiCreditOperator(argumentsData) {
  if (arguments.length !== 1 || entered || FAILED.size !== 0) fail();
  const pipes = createNativeApiCreditOperatorPipes(argumentsData); entered = true;
  const frame = { pipes, commands: null, sessionEntered: false, orphanStop: null, orphanFacts: null };
  function stopOrphanCommands() {
    if (frame.orphanStop !== null) return frame.orphanStop;
    const streams = [frame.commands.input, frame.commands.output];
    const facts = frame.orphanFacts = streams.map(() => ({ closed: false, destroyEntered: false, bad: false }));
    frame.orphanStop = new Promise((resolve, reject) => {
      function decide() {
        if (facts.some(f => f.bad)) { FAILED.add(frame); reject(new TypeError('API_CREDIT_COMMAND_CLOSE_UNKNOWN')); }
        else if (facts.every(f => f.closed)) resolve(undefined);
      }
      for (let i = 0; i < streams.length; i++) {
        const stream = streams[i], fact = facts[i];
        try {
          Reflect.apply(ON, stream, ['error', () => { fact.bad = true; decide(); }]);
          Reflect.apply(ON, stream, ['close', () => { fact.closed = true; decide(); }]);
          fact.closed = stream.closed === true;
          if (!fact.closed) { fact.destroyEntered = true; Reflect.apply(i === 0 ? RD : WD, stream, []); }
        } catch { fact.bad = true; }
      }
      decide();
    });
    // Ownership remains here only when the native session was never entered.
    frame.orphanStop.then(() => {}, () => {}); return frame.orphanStop;
  }
  const ports = F({
    readProfile: F(guard => pipes.readProfile(guard, argumentsData.bootstrapMs)),
    readCredential: F(guard => pipes.readCredential(guard, argumentsData.bootstrapMs)),
    createKeyLease: F((bytes, identity, guard) => createNativeApiCreditOperatorKeyLease(bytes, identity, guard)),
    openSession: F(async (selection, guard, limits) => {
      try {
        guard(); frame.commands = pipes.adoptCommands(guard); guard();
        frame.sessionEntered = true;
        return await openSdk105NativeApiCreditProductSelectionCommandSession({ selection,
          input: frame.commands.input, output: frame.commands.output, limits }, guard);
      } catch {
        if (!frame.sessionEntered) {
          selection.release();
          if (frame.commands !== null) stopOrphanCommands();
        }
        FAILED.add(frame); fail();
      }
    }),
    runHost: F(session => runBuyerOriginalCommandHost(session)),
    closeInputs: F(async () => {
      const closed = pipes.close();
      await closed;
      if (frame.orphanStop !== null) await frame.orphanStop;
    }),
    readDay: F(() => captureApiCreditOperatorUtcDay(Reflect.apply(NOW, DATE, []))),
    clock: F(() => Reflect.apply(CLOCK, hrtime, [])),
    armTimer: F((budgetMs, callback) => setTimeout(callback, budgetMs)),
    cancelTimer: F(token => { clearTimeout(token); })
  });
  try { return await runApiCreditOperatorCoordinator({ arguments: argumentsData, ports }); }
  catch { FAILED.add(frame); fail(); }
}
