import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Fixed authored text format only, not TypeScript parsing or compilation.
// The length guard is post-read; native fs/URL/intrinsics remain premises.
const source = readFileSync(
  new URL('../src/service-credit-pilot-status-response.d.ts', import.meta.url), 'utf8');

const comment =
  '// Uncompiled declarations: 200 means construction, not service success.\n' +
  '// Types prove no policy enforcement, authority, native freeze, byte length or compiler/runtime qualification.\n';
const headerLines = [
  '  readonly "content-type": "text/html; charset=utf-8";',
  '  readonly "cache-control": "no-store";',
  `  readonly "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";`,
  '  readonly "referrer-policy": "no-referrer";',
  '  readonly "x-content-type-options": "nosniff";',
  '  readonly "x-frame-options": "DENY";',
  '  readonly "content-length": string;'
];
const responseLines = [
  '  readonly statusCode: 200;',
  '  readonly headers: ServiceCreditPilotStatusResponseHeaders;',
  '  readonly body: string;'
];
const signature = 'export function getServiceCreditPilotStatusResponse(\n' +
  '  originalIdentityJson: string,\n  observationJson: string\n' +
  '): ServiceCreditPilotStatusResponse;\n';
const headersStart = 'export interface ServiceCreditPilotStatusResponseHeaders {\n';
const responseStart = 'export interface ServiceCreditPilotStatusResponse {\n';
const expected = comment + headersStart + headerLines.join('\n') +
  '\n}\n\n' + responseStart + responseLines.join('\n') + '\n}\n\n' + signature;

function check(text) {
  if (typeof text !== 'string' || text.length > 4096 || text !== expected) {
    throw new Error('DECLARATION_TEXT_MISMATCH');
  }
}
function reject(changed) {
  check(source);
  assert.notEqual(changed, source);
  assert.throws(() => check(changed), {
    name: 'Error', message: 'DECLARATION_TEXT_MISMATCH'
  });
}

test('exact signature and readonly three-field/seven-header declarations', () => {
  check(source);
});

test('construction status must remain literal 200', () => {
  reject(source.replace('readonly statusCode: 200;', 'readonly statusCode: 201;'));
});

test('each fixed header literal and content-length type remain exact', () => {
  for (const line of headerLines) {
    reject(source.replace(line, line.replace(/: .*;$/, ': "CHANGED";')));
  }
  reject(source.replace('"content-length": string;', '"content-length": number;'));
});

test('readonly cannot be removed from any declared member', () => {
  for (const line of [...headerLines, ...responseLines]) {
    reject(source.replace(line, line.replace('readonly ', '')));
  }
});

test('both required string inputs and the synchronous signature remain exact', () => {
  for (const changed of [
    signature.replace('  originalIdentityJson: string,\n', ''),
    signature.replace(',\n  observationJson: string', ''),
    signature.replace('originalIdentityJson:', 'originalIdentityJson?:'),
    signature.replace('observationJson:', 'observationJson?:'),
    signature.replace('originalIdentityJson: string', 'originalIdentityJson: unknown'),
    signature.replace('\n):', ',\n  override: string\n):'),
    signature.replace('): ServiceCreditPilotStatusResponse;',
      '): Promise<ServiceCreditPilotStatusResponse>;')
  ]) reject(source.replace(signature, changed));
});

test('additional or duplicate members and exports are rejected', () => {
  for (const start of [headersStart, responseStart]) {
    reject(source.replace(start, start + '  readonly extra: string;\n'));
    reject(source.replace(start, start + '  readonly [key: string]: unknown;\n'));
  }
  reject(source.replace(headerLines[0], headerLines[0] + '\n' + headerLines[0]));
  reject(source + 'export interface Extra {}\n');
});
