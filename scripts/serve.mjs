/**
 * Local preview server for dist/. Development only, never deployed.
 *
 * Mirrors how GitHub Pages resolves URLs: /foo/ serves /foo/index.html, and an
 * unknown path serves 404.html. That way a link that works locally works live.
 */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve from this file, not from process.cwd(), so the server works when it
// is launched by absolute path from another directory.
const PROJECT = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = join(PROJECT, 'dist');
const PORT = Number(process.env.PORT || 4321);

// Always serve a fresh build. A preview showing yesterday's HTML is worse than
// no preview, because it looks like the change did not work.
if (!process.argv.includes('--no-build')) {
  execFileSync(process.execPath, [join(PROJECT, 'scripts', 'build-site.mjs')], {
    cwd: PROJECT,
    stdio: 'inherit',
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  // normalize() collapses ../, so a request cannot escape dist/.
  const resolved = normalize(join(ROOT, url));
  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let file = resolved;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');

  if (!existsSync(file)) {
    const notFound = join(ROOT, '404.html');
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    res.end(existsSync(notFound) ? readFileSync(notFound) : 'Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
}).listen(PORT, () => {
  console.log(`Serving dist/ at http://localhost:${PORT}`);
});
