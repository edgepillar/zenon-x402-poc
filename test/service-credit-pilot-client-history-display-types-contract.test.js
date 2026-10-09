import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Text DATA assertions only; no compiler or live qualification.
const actual = readFileSync(new URL('../src/service-credit-pilot-client-history-display-owner.d.ts', import.meta.url), 'utf8');
const facade = `// Uncompiled declaration; no runtime authority or live qualification.
export type ServiceCreditPilotClientHistoryDisplayOwner = Readonly<{
  receive: (nextHistorySnapshotJson: string) => string;
  getHtml: () => string;
  getSnapshotJson: () => string;
}>;
`;
const factory = `export declare function createServiceCreditPilotClientHistoryDisplayOwner(
  initialHistorySnapshotJson: string
): ServiceCreditPilotClientHistoryDisplayOwner;
`;
const expected = facade + '\n' + factory;
test('readonly facade text', () => {
  assert.equal(actual.slice(0, facade.length), facade);
});
test('required factory text', () => {
  assert.equal(actual.slice(facade.length), '\n' + factory);
  assert.equal(actual, expected);
});
test('changed text rejection', () => {
  for (const changed of [
    expected.replace('nextHistorySnapshotJson:', 'nextHistorySnapshotJson?:'),
    expected.replace('initialHistorySnapshotJson:', 'initialHistorySnapshotJson?:'),
    expected.replace('Readonly<{', '{').replace('}>;', '};'),
    expected.replace('getHtml: () => string;', 'getHtml: () => number;'),
    expected.replace('getHtml: () => string;', 'getHtml: () => Promise<string>;'),
    expected.replace('  getHtml:', '  execute: () => void;\n  getHtml:')
  ]) {
    assert.notEqual(changed, expected);
    assert.throws(() => assert.equal(changed, expected));
  }
});
