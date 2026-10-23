import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const port = Number(process.env.PORT || 5190);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535.');
const root = new URL('../', import.meta.url);
const routes = new Map([
  ['/', ['app/index.html', 'text/html']], ['/app.js', ['app/app.js', 'text/javascript']],
  ['/core.js', ['app/core.js', 'text/javascript']], ['/demo.js', ['app/demo.js', 'text/javascript']],
  ['/investigation.js', ['app/investigation.js', 'text/javascript']], ['/workbench.js', ['app/workbench.js', 'text/javascript']],
  ['/styles.css', ['app/styles.css', 'text/css']],
  ['/collector', ['collectors/Capture-KingAftermath.ps1', 'text/plain']]
]);
http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  // Serve only the explicit public allowlist; never expose local captures or repository files.
  if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) { res.writeHead(403); res.end('Local host only'); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); res.end('Invalid request URL'); return; }
  const route = routes.get(pathname);
  if (!route) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(new URL(route[0], root));
    res.setHeader('Content-Type', route[1] + '; charset=utf-8');
    if (req.url === '/collector') res.setHeader('Content-Disposition', 'attachment; filename="Capture-KingAftermath.ps1"');
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(500); res.end('Unable to read application asset.'); }
}).listen(port, '127.0.0.1', () => console.log(`KingAftermath: http://127.0.0.1:${port}/\nLocal assets: ${fileURLToPath(root)}\nPress Ctrl+C to stop.`));
