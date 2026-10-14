import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

export function createDevServer() {
  return http.createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });response.end();return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400);response.end();return; }
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filename = path.resolve(root, relative);
    // Serve application files only, bound to localhost.
    if (path.relative(root, filename).startsWith('..') || relative.includes('\\') ||
        !(['index.html','terms.html','privacy.html','dist/nurupuru.html','dist/terms.html','dist/privacy.html'].includes(relative) || relative.startsWith('src/')) ||
        !types[path.extname(filename)]) {
      response.writeHead(404);response.end('Not found');return;
    }
    try {
      const data = await readFile(filename);
      response.writeHead(200, { 'Content-Type': `${types[path.extname(filename)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
      response.writeHead(404);response.end('Not found');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be between 1 and 65535');
  const server = createDevServer();
  server.on('error', error => { console.error(error.message);process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`ぬるぷる: http://127.0.0.1:${port}`));
}
