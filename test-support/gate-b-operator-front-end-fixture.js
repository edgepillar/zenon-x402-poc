import { runGateBOperatorFrontEnd } from '../src/gate-b-operator-front-end.js';

const capability = Object.freeze(Object.create(null));
const input = process.stdin;

const success = await runGateBOperatorFrontEnd({
  argv: [],
  channel: process,
  input,
  launchSetup: async () => capability,
  output: process.stdout,
  outputTimeoutMs: 1_000,
  phase1TimeoutMs: 5_000,
  phase2TimeoutMs: 5_000,
  stopCoordinator: async candidate => candidate === capability ? 'CLOSED' : 'FAILED',
  submitBootstrap: async candidate => candidate === capability ? capability : undefined,
  submitReview: async candidate => candidate === capability ? 'PREFLIGHT_VALID' : 'FAILED',
  waitClosed: async candidate => candidate === capability ? 'CLOSED' : 'FAILED',
});

process.exitCode = success && input.isRaw === false ? 0 : 1;
