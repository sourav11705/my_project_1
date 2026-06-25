const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST_DIR = '/home/team/shared/pricepulse-prototype/dist';
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:4174';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fall back to index.html for SPA routing
      const indexPath = path.join(DIST_DIR, 'index.html');
      fs.readFile(indexPath, (err2, indexData) => {
        if (err2) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal server error');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexData);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600',
    });
    res.end(data);
  });
}

function proxyRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const targetPath = url.pathname + url.search;

  const options = {
    hostname: '127.0.0.1',
    port: 4174,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: '127.0.0.1:4174',
    },
    timeout: 10000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API unavailable' }));
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API timeout' }));
  });

  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end();
    return;
  }

  // Proxy API requests to the backend
  if (req.url.startsWith('/api/')) {
    return proxyRequest(req, res);
  }

  // Serve static files from dist
  let filePath = path.join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);
  // Remove trailing slashes
  if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
  // Remove query strings
  filePath = filePath.split('?')[0];

  serveStatic(res, filePath);
});

const HOST = '0.0.0.0';
const PORT = 3000;

server.listen(PORT, HOST, () => {
  console.log(`PricePulse production server running on http://${HOST}:${PORT}`);
  console.log(`Proxying /api/* requests to ${API_TARGET}`);
  console.log(`Serving static files from ${DIST_DIR}`);
});