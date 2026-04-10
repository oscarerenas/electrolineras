const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const API_URL = 'https://api.openchargemap.io/v3/poi/?output=json&countrycode=ES&maxresults=10000&compact=true&verbose=false';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour — charging stations change less frequently

let cache = null;

function fetchAPI() {
  return new Promise((resolve, reject) => {
    https.get(API_URL, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

http.createServer(async (req, res) => {
  if (req.url === '/api/refresh' && req.method === 'POST') {
    cache = null;
    console.log('Cache cleared by user request.');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  if (req.url === '/api/stations') {
    try {
      if (!cache || Date.now() - cache.ts > CACHE_TTL) {
        console.log('Fetching fresh data from OpenChargeMap…');
        const body = await fetchAPI();
        cache = { ts: Date.now(), body };
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(cache.body);
    } catch (e) {
      console.error('API error:', e.message);
      res.writeHead(502);
      res.end('API error');
    }
    return;
  }

  // Static files from www/
  const file = path.join(__dirname, 'www', req.url === '/' ? 'index.html' : req.url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file);
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
