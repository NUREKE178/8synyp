'use strict';
/**
 * Жергілікті сервер: public/ статикасы + /api. Нәтижелер data/ ішінде сақталады.
 *   TEACHER_PASSWORD=парольіңіз npm start      # http://localhost:8080
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handle } = require('./lib/app');

const PUBLIC = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 8080;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api' || pathname.startsWith('/api/')) return handle(req, res);
  let rel; try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
  const target = path.normalize(path.join(PUBLIC, rel.endsWith('/') ? rel + 'index.html' : rel));
  if (!target.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Табылмады'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(target).pipe(res);
  });
}).listen(PORT, () => console.log(`Формула Квест: http://localhost:${PORT}  (мұғалім: /#/teacher${process.env.TEACHER_PASSWORD ? '' : ' — TEACHER_PASSWORD орнатылмаған'})`));
