// Production server for hosts like Render that run a long-lived process instead of
// Vercel-style serverless functions. Serves the Vite build from dist/ and routes
// /api/<name> to the same handlers in api/, adapting Node's req/res to the
// Vercel shape they expect (req.query, req.body, res.status().json()).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import explorer from './api/explorer.js';
import progress from './api/progress.js';

const ROUTES = { explorer, progress };
const DIST = fileURLToPath(new URL('./dist/', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 10_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.removeAllListeners('data');
        req.resume(); // drain the rest so the 413 can actually be sent
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const handler = ROUTES[url.pathname.slice('/api/'.length)];
  if (!handler) return sendJson(res, 404, { error: 'Not found' });

  req.query = Object.fromEntries(url.searchParams);
  if (req.method === 'POST') {
    try {
      const raw = await readBody(req);
      req.body = raw ? JSON.parse(raw) : {};
    } catch (err) {
      if (err.status === 413) return sendJson(res, 413, { error: 'Request body too large' });
      return sendJson(res, 400, { error: 'Invalid request body' });
    }
  }

  let statusCode = 200;
  const vercelRes = {
    status(code) { statusCode = code; return this; },
    json(body) { sendJson(res, statusCode, body); return this; },
  };

  try {
    await handler(req, vercelRes);
  } catch (err) {
    console.error(`${url.pathname} failed:`, err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
  }
}

async function serveStatic(res, url) {
  // normalize() collapses "../" so requests can't escape dist/.
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  let filePath = join(DIST, relative);
  if (!filePath.startsWith(DIST)) filePath = join(DIST, 'index.html');

  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(DIST, 'index.html'); // single-page app fallback
  }

  try {
    const data = await readFile(filePath);
    const isAsset = filePath.startsWith(join(DIST, 'assets'));
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      // Vite fingerprints files in assets/, so they can be cached forever.
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Build output missing. Run `npm run build` before starting the server.');
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  return serveStatic(res, url);
});

server.listen(PORT, () => {
  console.log(`Opening Trainer listening on port ${PORT}`);
});
