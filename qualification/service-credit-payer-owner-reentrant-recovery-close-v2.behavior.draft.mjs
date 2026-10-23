/*
 * Qualification fixture: genuine payer-owner/V6 reentrant-recovery regression.
 * Only selected by the twelve-case v2 driver
 * after its separately approved full SDK/SQLite/namespace/capacity review.
 * This creates one NEW private SQLite file, then reopens that same file.
 * No harness, fake owner/store, payment, key, signature or fetch is needed.
 * Selection strings are cooperative guards, NOT human authorization.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { lstatSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  createZenonFundingPostV1PayerRecoveryOwner as OWNER,
  ZENON_FUNDING_PAYER_RECOVERY_OWNER_CODES as CODES,
} from '../src/service-credit-zenon-funding-post-v1-payer-recovery-owner.js';
import {
  createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6 as CREATE_V6,
  openZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6 as OPEN_V6,
} from '../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js';

const ROOT = process.argv[2];
assert.equal(process.argv.length, 3);
assert.equal(process.env.X402_DP_SUBMISSION_V2_SELECTION, 'twelve-synthetic-v2-cases-only');
assert.equal(ROOT, process.env.SPV_TASK_SCRATCH);
assert.ok(typeof ROOT === 'string' && isAbsolute(ROOT) && resolve(ROOT) === ROOT);
const directory = lstatSync(ROOT);
assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
assert.equal(directory.uid, process.getuid()); assert.equal(directory.mode & 0o077, 0);
const databasePath = join(ROOT, 'payer-reentrant-recovery-close-v2.sqlite');
for (const suffix of ['', '-journal', '-wal', '-shm'])
  assert.throws(() => lstatSync(databasePath + suffix), problem => problem.code === 'ENOENT');

const resourceUrl = 'https://resource.invalid/paid';
const options = { databasePath, allowedRoot: ROOT, resourceUrl,
  custodyPolicy: { policyVersion: 1, maxRequests: 4, serviceResourceUrl: 'https://resource.invalid/service-credit/v1/execute' } };
let beforeCommits = 0, afterCommits = 0, fetchCalls = 0, caseCallbacks = 0;
const fetchImpl = async () => { fetchCalls++; throw new Error('SYNTHETIC_FETCH_MUST_NOT_RUN'); };

await test('direct payer close reentry waits for the actual empty V6 recovery transaction and permits normal reopen',
  { concurrency: false, timeout: 10000 }, async () => {
    caseCallbacks++;
    let owner, closing, hookFailure = null;
    const events = [];
    const store = CREATE_V6({ ...options, testHooks: {
      beforeCommit(name) {
        if (name !== 'recoverAfterRestart') return;
        try {
          beforeCommits++; events.push('before_commit');
          assert.equal(beforeCommits, 1); assert.equal(afterCommits, 0);
          closing = owner.close();
          assert.equal(closing, owner.close());
          // Observe a possible rejection immediately; do not hide it below.
          closing.then(() => { events.push('close_fulfilled'); }, () => { events.push('close_rejected'); });
        } catch (problem) { hookFailure = problem; throw problem; }
      },
      afterCommit(name) {
        if (name !== 'recoverAfterRestart') return;
        try {
          afterCommits++; events.push('after_commit');
          assert.equal(beforeCommits, 1); assert.equal(afterCommits, 1);
          assert.equal(events.includes('close_fulfilled'), false);
          assert.equal(events.includes('close_rejected'), false);
        } catch (problem) { hookFailure = problem; throw problem; }
      },
    } });
    owner = OWNER({ store, deadlineMs: 200, fetchImpl });
    try {
      // Empty recovery reaches the synchronous transaction hook before its
      // first await. This calls the real payer directly, not the higher DP
      // wrapper that already claims its own public pending Promise.
      const recovery = owner.recover();
      assert.equal(beforeCommits, 1); assert.equal(afterCommits, 1);
      await assert.rejects(recovery, { code: CODES.closed });
      assert.equal(hookFailure, null); assert.ok(closing instanceof Promise);
      assert.equal((await closing).status, 'CLOSED');
      assert.equal(owner.close(), closing);
      assert.deepEqual(events, ['before_commit', 'after_commit', 'close_fulfilled']);
      assert.throws(() => store.load(), { code: 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CLOSED' });
      assert.equal(fetchCalls, 0);

      const reopened = OPEN_V6(options);
      const second = OWNER({ store: reopened, deadlineMs: 200, fetchImpl });
      try {
        assert.equal(reopened.load(), null);
        assert.equal((await second.recover()).status, 'EMPTY');
        assert.equal((await second.close()).status, 'CLOSED');
        assert.throws(() => reopened.load(), { code: 'ZENON_FUNDING_PAYER_RECOVERY_STORE_CLOSED' });
        assert.equal(fetchCalls, 0);
      } finally {
        // Successful close is idempotent. A failed owned close remains a
        // failed owner close; never bypass it with reopened.close().
        await second.close();
      }
    } finally {
      // No unlink, adoption, direct-store fallback close, reset or reopen on
      // failure. A rejected close and its raw SQLite files must remain HELD.
      await owner.close();
    }
    assert.equal(caseCallbacks, 1); assert.equal(beforeCommits, 1);
    assert.equal(afterCommits, 1); assert.equal(fetchCalls, 0);
  });
console.log('# payer-reentrant-recovery-close-v2 ' + JSON.stringify({
  fixtureVersion: 1, caseCallbacks, beforeCommits, afterCommits, fetchCalls,
  declaredNewSqliteFiles: 1, declaredReopensOfSameFile: 1,
  keys: 0, signatures: 0, authority: 'NONE',
}));
