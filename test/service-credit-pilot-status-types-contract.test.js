import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Controlled text envelopes only: no TypeScript parsing, compilation or resolution.
// Native fs/URL/intrinsics are premises; length checks happen after the two reads.
const viewSource = readFileSync(
  new URL('../src/service-credit-pilot-status-view.d.ts', import.meta.url), 'utf8');
const htmlSource = readFileSync(
  new URL('../src/service-credit-pilot-status-html.d.ts', import.meta.url), 'utf8');

const viewHeader =
  '// Uncompiled static types for caller-declared display data; no authority or recovery proof.\n' +
  '// Readonly is not native freeze; strings prove no JSON/hash validity, custody, READY or delivery.\n';
const htmlHeader =
  '// Uncompiled caller-declared fragment string; no safe-HTML brand or qualified embedding/transport.\n';
const viewSignature = 'export function getServiceCreditPilotStatusView(\n' +
  '  originalIdentityJson: string,\n  observationJson: string\n): ServiceCreditPilotStatusView;\n';
const htmlSignature = 'export function renderServiceCreditPilotStatusHtml(\n' +
  '  originalIdentityJson: string,\n  observationJson: string\n): string;\n';
const phases = [
  'RECOVERY_REQUIRED', 'FUNDING_PENDING', 'FUNDING_REVIEW_REQUIRED', 'CLOSED',
  'FUNDING_NOT_STARTED', 'FUNDED_NO_SESSION', 'SERVICE_IDLE', 'SERVICE_BUSY',
  'RESULT_REPORTED', 'SERVICE_UNAVAILABLE'
];
const keys = [
  'viewVersion', 'evidence', 'phase', 'paymentHash', 'requestId',
  'reconciliationRequired', 'authorization', 'mayStartPayment',
  'maySignPayment', 'mayDispatchService', 'deliveryConfirmed'
];
const types = new Set([
  '1', "'DECLARED_DATA_ONLY'", 'ServiceCreditPilotStatusPhase',
  'string | null', 'boolean', "'NONE'", 'false'
]);
const BAD = 'DECLARATION_TEXT_MISMATCH';

function body(text, header) {
  if (typeof text !== 'string' || text.length > 4096 || !text.startsWith(header)) {
    throw new Error(BAD);
  }
  return text.slice(header.length);
}

function view(text = viewSource) {
  const code = body(text, viewHeader);
  const start = 'export type ServiceCreditPilotStatusPhase =\n';
  const end = '\n}>;\n\n' + viewSignature;
  const middle = ';\n\nexport type ServiceCreditPilotStatusView = Readonly<{\n';
  if (!code.startsWith(start) || !code.endsWith(end)) throw new Error(BAD);
  const parts = code.slice(start.length, -end.length).split(middle);
  if (parts.length !== 2) throw new Error(BAD);
  const literals = parts[0].split('\n').map(line => {
    const match = /^  \| '([A-Z_]+)'(?![\s\S])/.exec(line);
    if (!match) throw new Error(BAD);
    return match[1];
  });
  const entries = parts[1].split('\n').map(line => {
    const match = /^  ([A-Za-z][A-Za-z0-9]*): (.+);(?![\s\S])/.exec(line);
    if (!match || !types.has(match[2])) throw new Error(BAD);
    return [match[1], match[2]];
  });
  if (new Set(literals).size !== literals.length ||
      entries.map(([key]) => key).join(',') !== keys.join(',')) throw new Error(BAD);
  return { phases: literals, fields: Object.fromEntries(entries) };
}

function html(text = htmlSource) {
  const code = body(text, htmlHeader);
  if (code !== htmlSignature) throw new Error(BAD);
  return code;
}

test('exports have exact primitive-string signatures without additions', () => {
  view();
  assert.equal(html(), htmlSignature);
  assert.throws(() => view(viewSource + 'export type Extra = false;\n'),
    /DECLARATION_TEXT_MISMATCH/);
  assert.throws(() => html(htmlSource + 'export {};\n'), /DECLARATION_TEXT_MISMATCH/);
});

test('phase union has exactly ten unique literals', () => {
  assert.deepEqual(view().phases, phases);
  const duplicate = viewSource.replace("  | 'RECOVERY_REQUIRED'",
    "  | 'RECOVERY_REQUIRED'\n  | 'RECOVERY_REQUIRED'");
  assert.throws(() => view(duplicate), /DECLARATION_TEXT_MISMATCH/);
});

test('DTO has exactly the eleven returned fields', () => {
  assert.deepEqual(Object.keys(view().fields), keys);
  const extra = viewSource.replace('  deliveryConfirmed: false;',
    '  extra: false;\n  deliveryConfirmed: false;');
  const duplicate = viewSource.replace('  paymentHash: string | null;',
    '  paymentHash: string | null;\n  paymentHash: string | null;');
  for (const text of [extra, duplicate]) {
    assert.throws(() => view(text), /DECLARATION_TEXT_MISMATCH/);
  }
});

test('readonly and false/NONE authority literals stay fixed', () => {
  const fields = view().fields;
  assert.equal(fields.authorization, "'NONE'");
  for (const key of [
    'mayStartPayment', 'maySignPayment', 'mayDispatchService', 'deliveryConfirmed'
  ]) assert.equal(fields[key], 'false');
  const mutable = viewSource.replace('Readonly<{', '{').replace('}>;', '};');
  assert.throws(() => view(mutable), /DECLARATION_TEXT_MISMATCH/);
});

test('nullable identities and local version/evidence remain explicit', () => {
  const f = view().fields;
  assert.deepEqual([
    f.viewVersion, f.evidence, f.paymentHash, f.requestId, f.phase, f.reconciliationRequired
  ], [
    '1', "'DECLARED_DATA_ONLY'", 'string | null', 'string | null',
    'ServiceCreditPilotStatusPhase', 'boolean'
  ]);
});

test('HTML is ordinary string and types cannot broaden operationally', () => {
  assert.equal(html(), htmlSignature);
  for (const type of ['SafeHtml', 'Promise<string>', 'any', 'unknown']) {
    assert.throws(() => html(htmlSource.replace('): string;', `): ${type};`)),
      /DECLARATION_TEXT_MISMATCH/);
  }
  for (const type of ['any', 'unknown', 'Promise<boolean>']) {
    const changed = viewSource.replace('reconciliationRequired: boolean;',
      `reconciliationRequired: ${type};`);
    assert.throws(() => view(changed), /DECLARATION_TEXT_MISMATCH/);
  }
});
