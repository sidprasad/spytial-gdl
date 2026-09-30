// Minimal static file server for previewing the playground / examples.
// Root is hardcoded (absolute) so we never call process.cwd() — the preview
// sandbox blocks the getcwd syscall, which breaks `python -m http.server`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const PORT = Number(process.env.PORT) || 8100;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.gdl': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname);

    if (path.endsWith('/')) path += 'index.html';
    // Serve generated docs alongside the working source, assets, and playground.
    const base = path.startsWith('/docs/') && existsSync(join(ROOT, 'site/docs/index.html'))
      ? join(ROOT, 'site') : ROOT;
    const filePath = normalize(join(base, path));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': TYPES[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(String(err.message || err));
  }
}).listen(PORT, () => console.log(`preview-server: serving ${ROOT} on http://localhost:${PORT}`));
