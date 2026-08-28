/**
 * Orchestrator. Spawns each source as its own child process, enforces the
 * per-source timeout, and collects the reports.
 *
 * The design goal is boring on purpose: this process contains no scraping
 * logic at all, so there is nothing here for a bad source to corrupt. It only
 * starts processes, kills slow ones, and writes a health report.
 *
 *   node pipeline/core/run.mjs                 run every enabled source
 *   node pipeline/core/run.mjs --only az-dvs   run one source
 *   node pipeline/core/run.mjs --list          show what is registered
 *   node pipeline/core/run.mjs --strict        exit non-zero if any source fails
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import {
  ROOT, REPORT_DIR, listSources, loadSourceConfig, reportPath, writeJson,
} from './registry.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const CONCURRENCY = Number(option('concurrency') ?? 3);
const WORKER = join(ROOT, 'pipeline', 'core', 'worker.mjs');

/** Run one source in a child process. Never rejects: a crash is a report. */
function runSource(config) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER, config.id], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      // A source module has no business reading our environment.
      env: { PATH: process.env.PATH, NODE_ENV: 'production' },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      // A source that floods stdout is misbehaving. Cut it off rather than
      // letting it exhaust memory in the parent.
      if (stdout.length > 32 * 1024 * 1024) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 4 * 1024 * 1024) stderr = stderr.slice(-1024 * 1024);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, config.timeoutMs);

    child.on('close', (code, signal) => {
      clearTimeout(timer);

      if (timedOut) {
        return resolve({
          sourceId: config.id, status: 'failed', published: false,
          reason: `timed out after ${config.timeoutMs}ms and was killed`,
          log: stderr.split('\n').filter(Boolean).slice(-20),
        });
      }

      try {
        return resolve(JSON.parse(stdout));
      } catch {
        // The worker died before it could report: a segfault, an OOM kill, a
        // syntax error in extract.mjs. Synthesize a report so the run continues.
        return resolve({
          sourceId: config.id, status: 'failed', published: false,
          reason: `worker exited with code ${code}${signal ? ` (${signal})` : ''} without a report`,
          log: stderr.split('\n').filter(Boolean).slice(-20),
        });
      }
    });
  });
}

async function main() {
  const only = option('only');
  const ids = listSources().filter((id) => !only || id === only);

  if (only && ids.length === 0) {
    console.error(`No source named "${only}". Registered: ${listSources().join(', ') || '(none)'}`);
    process.exit(2);
  }

  const configs = [];
  for (const id of ids) {
    try {
      const config = loadSourceConfig(id);
      if (config.enabled || only) configs.push(config);
      else console.log(`skip  ${id} (disabled)`);
    } catch (error) {
      // A malformed config disables that source. It does not stop the run.
      console.error(`skip  ${id}: ${error.message}`);
      writeJson(reportPath(id), {
        sourceId: id, status: 'failed', published: false,
        reason: `config error: ${error.message}`,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  if (flag('list')) {
    for (const c of configs) {
      console.log(`${c.id.padEnd(28)} ${c.recordType.padEnd(13)} ${c.jurisdiction ?? 'national'}  ${c.title}`);
    }
    return;
  }

  console.log(`Running ${configs.length} source(s), ${CONCURRENCY} at a time.\n`);

  const reports = [];
  const queue = [...configs];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const config = queue.shift();
      const report = await runSource(config);
      const icon = { ok: 'ok  ', warned: 'warn', failed: 'FAIL' }[report.status] ?? '????';
      const detail = report.published
        ? `${report.recordCount} record(s)${report.unchanged ? ', unchanged' : ''}`
        : report.reason;
      console.log(`${icon}  ${config.id.padEnd(28)} ${detail}`);
      writeJson(reportPath(config.id), report);
      reports.push(report);
    }
  });
  await Promise.all(workers);

  const failed = reports.filter((r) => r.status === 'failed');
  const health = {
    generatedAt: new Date().toISOString(),
    total: reports.length,
    ok: reports.filter((r) => r.status === 'ok').length,
    warned: reports.filter((r) => r.status === 'warned').length,
    failed: failed.length,
    sources: reports
      .map((r) => ({
        sourceId: r.sourceId, status: r.status, reason: r.reason ?? null,
        recordCount: r.recordCount ?? 0, finishedAt: r.finishedAt ?? null,
      }))
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
  };
  // A single-source run says nothing about the other sources, so it must not
  // overwrite the report the public /data-health/ page is built from.
  if (only) console.log('\n(--only run: health.json left unchanged)');
  else writeJson(join(REPORT_DIR, 'health.json'), health);

  console.log(`\n${health.ok} ok, ${health.warned} warned, ${health.failed} failed.`);
  if (failed.length) {
    console.log('\nFailed sources kept their last good data. The site still builds.');
    for (const r of failed) console.log(`  - ${r.sourceId}: ${r.reason}`);
  }

  // Default exit is 0 even with failures: one broken scraper must not block a
  // deploy that would otherwise publish 55 healthy jurisdictions.
  process.exit(flag('strict') && failed.length ? 1 : 0);
}

main();
