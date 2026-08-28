/**
 * Proves the blast wall still holds.
 *
 * The whole promise of this project's architecture is that one broken source
 * cannot take down the site. That promise is only worth something if it is
 * tested, so these are permanent regression tests, not scratch work. Run them
 * before touching anything in pipeline/core/.
 *
 *   npm run test:isolation
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { publishedPath, reportPath } from '../pipeline/core/registry.mjs';

let failures = 0;

function check(label, condition, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`${mark}  ${label}${detail ? `\n      ${detail}` : ''}`);
}

/** Run one fixture source through the real worker and return its report. */
function runWorker(sourceId, env = {}) {
  const result = spawnSync(process.execPath, ['pipeline/core/worker.mjs', sourceId], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { status: 'failed', reason: `worker produced no report: ${result.stderr.slice(-300)}` };
  }
}

const cleanup = (id) => {
  for (const path of [publishedPath('organization', id), reportPath(id)]) {
    if (existsSync(path)) rmSync(path);
  }
};

console.log('Source isolation tests\n');

// 1. A source that throws must not publish, and must report why.
cleanup('zz-test-crash');
const crash = runWorker('zz-test-crash');
check('a throwing source fails cleanly', crash.status === 'failed' && crash.published === false, crash.reason);

// 2. A source that hangs must be killed by the orchestrator. An infinite loop
//    blocks the event loop, so nothing inside the process can stop it. Only an
//    external SIGKILL works, which is why sources run out-of-process at all.
const started = Date.now();
const hang = spawnSync(process.execPath, ['pipeline/core/run.mjs', '--only', 'zz-test-hang'], { encoding: 'utf8' });
const elapsed = Date.now() - started;
check(
  'a hanging source is killed on timeout',
  /timed out/.test(hang.stdout) && elapsed < 30000,
  `run finished in ${elapsed}ms`,
);

// 3. Invalid records are dropped; valid ones in the same batch still publish.
cleanup('zz-test-garbage');
const garbage = runWorker('zz-test-garbage');
check('invalid records are dropped, valid ones survive', garbage.recordCount === 1 && garbage.published === true,
  `kept ${garbage.recordCount}, dropped ${garbage.rejected?.length}`);
check(
  'a javascript: URL never reaches published data',
  garbage.rejected?.some((r) => r.errors.some((e) => e.includes('javascript:'))),
);

// 4. A collapse in record count is treated as breakage, not as news.
cleanup('zz-test-drop');
const healthy = runWorker('zz-test-drop', { ZZ_DROP_COUNT: '10' });
check('baseline run publishes 10 records', healthy.recordCount === 10 && healthy.published);
const collapsed = runWorker('zz-test-drop', { ZZ_DROP_COUNT: '2' });
check('an 80% record drop is refused', collapsed.status === 'failed' && collapsed.published === false, collapsed.reason);
const stillThere = JSON.parse(readFileSync(publishedPath('organization', 'zz-test-drop'), 'utf8'));
check('previously good data is preserved after a refused run', stillThere.records.length === 10);

// 5. Source modules must not be able to read our environment.
const leak = spawnSync(process.execPath, ['pipeline/core/run.mjs', '--only', 'zz-test-drop'], {
  encoding: 'utf8',
  env: { ...process.env, ZZ_DROP_COUNT: '2' },
});
check(
  'a source cannot read the parent environment',
  /10 record\(s\)/.test(leak.stdout),
  'ZZ_DROP_COUNT=2 was set in the parent but did not reach the source',
);

for (const id of ['zz-test-crash', 'zz-test-garbage', 'zz-test-drop', 'zz-test-hang']) cleanup(id);

console.log(`\n${failures === 0 ? 'All isolation tests passed.' : `${failures} test(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
