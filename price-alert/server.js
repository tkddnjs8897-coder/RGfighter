// 스즈키 GSX-S1000GX 시세알리미 - 로컬 웹 서버
// 외부 패키지 없이 Node.js 표준 라이브러리만 사용합니다. 실행: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'listings.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadListings() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function saveListings(listings) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(listings, null, 2), 'utf8');
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('요청 본문이 너무 큽니다.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function validateListing(input) {
  const errors = [];
  const price = Number(input.price);
  const year = Number(input.year);
  const mileage = Number(input.mileage);

  if (!Number.isFinite(price) || price <= 0) errors.push('가격이 올바르지 않습니다.');
  if (!Number.isFinite(year) || year < 1990 || year > 2100) errors.push('년식이 올바르지 않습니다.');
  if (!Number.isFinite(mileage) || mileage < 0) errors.push('키로수가 올바르지 않습니다.');
  if (!input.platform) errors.push('플랫폼을 선택해주세요.');

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      platform: String(input.platform).slice(0, 40),
      price,
      year,
      mileage,
      tuned: Boolean(input.tuned),
      tuningNote: String(input.tuningNote || '').slice(0, 500),
      topBox: Boolean(input.topBox),
      blackBox: Boolean(input.blackBox),
      engineGuard: Boolean(input.engineGuard),
      crashHistory: Boolean(input.crashHistory),
      tipOver: Boolean(input.tipOver),
      url: String(input.url || '').slice(0, 1000),
      note: String(input.note || '').slice(0, 500),
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === '/api/listings' && req.method === 'GET') {
      return sendJson(res, 200, loadListings());
    }

    if (url.pathname === '/api/listings' && req.method === 'POST') {
      const body = await readBody(req);
      const result = validateListing(body);
      if (!result.ok) return sendJson(res, 400, { errors: result.errors });

      const listings = loadListings();
      const item = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...result.value,
      };
      listings.push(item);
      saveListings(listings);
      return sendJson(res, 201, item);
    }

    const deleteMatch = url.pathname.match(/^\/api\/listings\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const id = deleteMatch[1];
      const listings = loadListings();
      const next = listings.filter((l) => l.id !== id);
      if (next.length === listings.length) return sendJson(res, 404, { error: '매물을 찾을 수 없습니다.' });
      saveListings(next);
      return sendJson(res, 200, { ok: true });
    }

    // 정적 파일 서빙
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
    const fullPath = path.join(PUBLIC_DIR, filePath);
    if (!fullPath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      const ext = path.extname(fullPath);
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
      res.writeHead(200, { 'Content-Type': (types[ext] || 'application/octet-stream') + '; charset=utf-8' });
      res.end(data);
    });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`시세알리미 서버 실행 중: http://localhost:${PORT}`);
});
