// Server statis kecil untuk dev lokal (tanpa dependensi). Di Vercel, folder
// public/ disajikan langsung dan vercel.json menangani rute /watch/:room.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    else if (p.startsWith('/watch/')) p = '/watch.html';

    const file = path.join(ROOT, path.normalize(p));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end('Not found');
      const headers = {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Accept-Ranges': 'bytes',
      };
      // Dukungan Range supaya file video/audio lokal bisa di-seek saat dites.
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (m && (m[1] || m[2])) {
        const start = m[1] ? Number(m[1]) : Math.max(data.length - Number(m[2]), 0);
        const end = m[1] && m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
        if (start > end) return res.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end();
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${data.length}`,
          'Content-Length': end - start + 1,
        });
        return res.end(data.subarray(start, end + 1));
      }
      res.writeHead(200, { ...headers, 'Content-Length': data.length });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Watch Together jalan di http://localhost:${PORT}`));
