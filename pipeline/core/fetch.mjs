/**
 * The only way a source module is allowed to touch the network.
 *
 * Source modules never call global fetch. They get a bound client from here,
 * which enforces the request budget, the timeout, the identifying user agent,
 * and the on-disk cache. That keeps a buggy scraper from hammering a state
 * agency and getting our runner IP blocked for every other source.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = join(process.cwd(), '.cache', 'http');

// Identify honestly. If a state webmaster wants to reach us, they can.
const USER_AGENT =
  'USVetHubBot/0.1 (+https://usvethub.com/about/bot; Veteran resource directory; contact@usvethub.com)';

class RequestBudgetError extends Error {}

function cachePath(url) {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 32);
  return join(CACHE_DIR, `${hash}.json`);
}

function readCache(url, maxAgeMs) {
  const file = cachePath(url);
  if (!existsSync(file)) return null;
  if (Date.now() - statSync(file).mtimeMs > maxAgeMs) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null; // a corrupt cache entry is a miss, never a crash
  }
}

function writeCache(url, entry) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath(url), JSON.stringify(entry));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build the network client handed to one source module.
 *
 * @param {object} options
 * @param {number} options.maxRequests  hard ceiling for this source's run
 * @param {number} options.delayMs      minimum gap between requests
 * @param {number} options.timeoutMs    per-request timeout
 * @param {number} options.cacheMaxAgeMs
 * @param {(msg: string) => void} options.log
 */
export function createClient({
  maxRequests = 50,
  delayMs = 1200,
  timeoutMs = 20000,
  cacheMaxAgeMs = 6 * 60 * 60 * 1000,
  log = () => {},
} = {}) {
  let spent = 0;
  let lastRequestAt = 0;

  async function raw(url, { attempt = 1 } = {}) {
    const cached = readCache(url, cacheMaxAgeMs);
    if (cached) {
      log(`cache hit ${url}`);
      return cached;
    }

    if (spent >= maxRequests) {
      throw new RequestBudgetError(
        `request budget of ${maxRequests} exhausted, refusing to fetch ${url}`,
      );
    }
    spent += 1;

    const gap = Date.now() - lastRequestAt;
    if (gap < delayMs) await sleep(delayMs - gap);
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      log(`fetch ${url} (${spent}/${maxRequests})`);
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      });

      // 4xx is the source's problem and will not fix itself on retry.
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

      const body = await response.text();

      // A 200 that returns 40 bytes is almost always an error page or a
      // bot wall. Treat it as a failure rather than publishing emptiness.
      if (body.trim().length < 40) {
        throw new Error(`suspiciously short body (${body.length} bytes) for ${url}`);
      }

      const entry = { url: response.url, status: response.status, body, fetchedAt: new Date().toISOString() };
      writeCache(url, entry);
      return entry;
    } catch (error) {
      const retryable = !(error instanceof RequestBudgetError) && !/HTTP 4\d\d/.test(error.message);
      if (retryable && attempt < 3) {
        const backoff = 2000 * 2 ** (attempt - 1);
        log(`retry ${attempt + 1}/3 in ${backoff}ms after: ${error.message}`);
        await sleep(backoff);
        return raw(url, { attempt: attempt + 1 });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** @returns {Promise<{url: string, body: string, fetchedAt: string}>} */
    async fetchText(url) {
      return raw(url);
    },
    async fetchJson(url) {
      const entry = await raw(url);
      try {
        return JSON.parse(entry.body);
      } catch {
        throw new Error(`response from ${url} was not valid JSON`);
      }
    },
    get requestsUsed() {
      return spent;
    },
  };
}
