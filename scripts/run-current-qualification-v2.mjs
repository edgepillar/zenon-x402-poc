// One explicit current-source lane; never discover or import historical tests.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Writable, finished, pipeline } from 'node:stream';
import {
  PROFILE_ID, inspectCurrentQualificationProfile, requireUnchangedProfile,
  requireCompleteCaseResults,
} from './current-qualification-profile-v2.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
async function main() {
  const flags = process.argv.slice(2);
  if (flags.length === 1 && flags[0] === '--historical') {
    process.stderr.write('Historical qualification requires its original source revision and separate explicit selection. No tests were discovered or run.\n');
    process.exitCode = 2; return;
  }
  if (process.cwd() !== repoRoot || !(flags.length === 0
      || (flags.length === 1 && flags[0] === '--plan'))) throw Error('CLOSED_ARGUMENTS');
  const before = inspectCurrentQualificationProfile(repoRoot);
  const names = before.profile.selections.flatMap(entry => entry.names);
  const report = { profileId: PROFILE_ID, node: process.versions.node,
    platform: process.platform, arch: process.arch, manifestSha256: before.manifestSha256,
    sourceFiles: before.rows.length, selectedCases: names.length,
    installedDependencies: false, scope: before.profile.scope,
    runtimeDependencyContract: before.runtimeDependencyContract };
  if (flags.length === 1) {
    process.stdout.write(JSON.stringify({ ...report, result: 'PLAN_ONLY_NOT_EXECUTED',
      entries: before.profile.selections, excludedScopes: before.profile.excludedScopes }) + '\n');
    return;
  }
  // Entries see the same ordinary one-file argv shape as their original direct
  // invocation. Only an explicit plan flag is permitted above, never test filters.
  if (process.argv.length !== 2) throw Error('CLOSED_ARGUMENTS');
  process.exitCode = 125;
  const { run } = await import('node:test');
  const { tap } = await import('node:test/reporters');
  const rows = [], reported = new Set(), counts = {}, plans = [];
  let bad = false, ended = false, reporterDone = false, versions = 0, bytes = 0, pending = '';
  process.stdout.write('# current profile ' + PROFILE_ID + '\n'
    + '# manifest-sha256 ' + before.manifestSha256 + '\n'
    + '# selected-cases ' + names.length + '\n');
  const known = name => names.includes(name);
  function safeLine(line) {
    let match;
    if (line === 'TAP version 13') { versions++; return line; }
    if ((match = /^# Subtest: (.+)$/.exec(line))) {
      if (known(match[1])) return line;
      bad = true;
    } else if ((match = /^(ok|not ok) \d+ - (.+)$/.exec(line))) {
      if (!known(match[2]) || reported.has(match[2]) || match[1] !== 'ok') bad = true;
      if (known(match[2])) { reported.add(match[2]); return line; }
    } else if ((match = /^1\.\.(\d+)$/.exec(line))) {
      plans.push(Number(match[1])); return line;
    } else if ((match = /^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(line))) {
      if (Object.hasOwn(counts, match[1])) bad = true;
      counts[match[1]] = Number(match[2]); return line;
    } else if (/^Bail out!/.test(line)) bad = true;
    // Do not print stacks, absolute paths, arbitrary diagnostics or raw values.
    return null;
  }
  const source = run({
    files: before.profile.selections.map(entry => join(repoRoot, entry.path)),
    isolation: 'none', concurrency: false, timeout: 15000, forceExit: false, watch: false,
  });
  source.on('test:pass', data => rows.push({ name: data.name, nesting: data.nesting,
    pass: true, skip: data.skip === undefined ? false : data.skip,
    todo: data.todo === undefined ? false : data.todo }));
  source.on('test:fail', () => { bad = true; });
  source.on('error', () => { bad = true; });
  source.once('end', () => { ended = true; });
  const sourceDone = new Promise(resolve => {
    finished(source, { writable: false }, error => { if (error) bad = true; resolve(); });
  });
  const sink = new Writable({
    write(chunk, encoding, callback) {
      try {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 65536) throw Error('REPORTER_CAP');
        pending += String(chunk);
        const lines = pending.split('\n'); pending = lines.pop();
        const safe = lines.map(safeLine).filter(line => line !== null);
        if (safe.length) process.stdout.write(safe.join('\n') + '\n', callback);
        else callback();
      } catch { callback(Error('REPORTER_FAILED')); }
    },
    final(callback) { if (pending !== '') bad = true; callback(); },
  });
  const reporter = source.compose(tap);
  const reportDone = new Promise(resolve => {
    pipeline(reporter, sink, error => { reporterDone = !error; if (error) bad = true; resolve(); });
  });
  await Promise.all([sourceDone, reportDone]);
  if (bad || versions !== 1 || plans.length !== 1 || plans[0] !== names.length
      || reported.size !== names.length || !names.every(name => reported.has(name))
      || process.exitCode !== 125) throw Error('REPORTER_INCOMPLETE');
  requireCompleteCaseResults(names, rows, counts, ended, reporterDone);
  requireUnchangedProfile(before, inspectCurrentQualificationProfile(repoRoot));
  process.exitCode = 0;
  process.stdout.write('# current-qualification ' + JSON.stringify({
    ...report, result: 'SELECTED_CURRENT_COMPONENTS_AND_RUNTIME_CONTRACT_PASS', counts,
    sourcePinsRechecked: true, historicalEntriesRun: 0,
    hostedCiEstablishedByLocalCommand: false, fullApplicationQualified: false,
    serviceDelivery: 'NOT_ESTABLISHED', pilot: 'NO_GO',
  }) + '\n');
}
main().catch(() => {
  process.exitCode = 1;
  process.stderr.write('Current qualification refused or incomplete; no broader qualification is established.\n');
});
