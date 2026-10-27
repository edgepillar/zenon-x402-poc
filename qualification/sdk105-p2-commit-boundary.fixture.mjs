// SOURCE ONLY. The parent's observed SIGKILL is required; send()/kill() return
// values alone never establish a committed crash, process exit or safe reopen.
import { createNativeCommittedResponseLossSelection } from './native-committed-response-loss.fixture.mjs';
import { originalP2, rootP2, requireP2 } from './sdk105-p2-commit-recovery.io.mjs';

const F = Object.freeze, A = Reflect.apply, SEND = process.send, EXIT_NOW = process.exit;
let entered = false;
export function createP2CommitBoundarySelection(original, store, readCounters) {
  requireP2(arguments.length === 3 && process.env.X402_P2_COMMIT_RECOVERY_ROLE === 'funding-child'
    && typeof SEND === 'function' && process.connected === true && typeof readCounters === 'function'
    && Object.isFrozen(readCounters) && !entered);
  const base = createNativeCommittedResponseLossSelection(original, store), gate = base.gate;
  const arm = F(function arm(stopKnownSocket) {
    requireP2(arguments.length === 1 && typeof stopKnownSocket === 'function' && Object.isFrozen(stopKnownSocket));
    return gate.arm(F(function beforeResponseContinuation() {
      entered = true;
      try {
        const counters = readCounters(), view = gate.inspect(), root = process.env.SPV_TASK_SCRATCH;
        const retained = originalP2(root, rootP2(root));
        requireP2(view.commitMatched && view.phase === 'COMMITTED_STOP_REQUESTED' && !view.unknown
          && view.probeEntries === 1 && view.stopAttempts === 1 && !view.stopVoidObserved
          && counters.executions === 1 && counters.commandStarts === 6 && counters.commandResults === 5
          && retained.services.value.first.grantId === original.grantId
          && retained.services.value.first.requestId === original.requestId);
        const message = F({ boundaryVersion: 1, stage: 'COMMITTED_BEFORE_SERVICE_HTTP_CONTINUATION',
          token: process.env.X402_P2_COMMIT_RECOVERY_TOKEN,
          transactionHash: retained.payment.value.transactionHash, grantId: original.grantId,
          requestId: original.requestId, paymentPinsSha256: retained.payment.sha256,
          servicePinsSha256: retained.services.sha256, executions: 1, commandStarts: 6, commandResults: 5,
          responseResultWritten: false, committedRevision: view.revision });
        requireP2(/^[0-9a-f]{64}$/.test(message.token) && Buffer.byteLength(JSON.stringify(message)) <= 2048);
        requireP2(A(SEND, process, [message]) === true);
        // This child's event loop cannot continue into the HTTP response while
        // the independently running parent verifies the frame and kills it.
        // An actual matching IPC frame AND actual SIGKILL exit must be observed.
        // Timeout is FAILURE, never an automatic retry or a successful crash.
        const parked = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(parked, 0, 0, 5000);
        // Never return into the HTTP continuation after a missed parent kill.
        // Actual exit 87 is a failed trial; the parent must not start recovery.
        A(EXIT_NOW, process, [87]);
        throw new TypeError('SDK105_P2_COMMIT_BOUNDARY_NOT_KILLED');
      } finally {
        // Reached only on refusal/timeout: stop the known response socket once.
        // In the expected SIGKILL path no JS finally or clean-close is claimed.
        A(stopKnownSocket, undefined, []);
      }
    }));
  });
  return F({ ...base, gate: F({ ...gate, arm }) });
}
