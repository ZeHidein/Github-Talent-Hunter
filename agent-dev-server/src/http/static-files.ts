import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, '..', '..', 'agent-dev-client', 'build');

export const serveStatic = sirv(STATIC_DIR, {
  single: true,
  gzip: true,
  brotli: true,
  setHeaders(res, pathname) {
    if (pathname.endsWith('.html')) {
      // HTML must always be revalidated — it references content-hashed assets
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      // JS, CSS, images — esbuild content-hashes filenames, safe to cache forever
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
});
