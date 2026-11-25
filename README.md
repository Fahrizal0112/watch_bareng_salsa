# Watch Together

Nonton bareng lewat share layar. Kamu (host) membagikan tab Netflix, pasangan menonton lewat browser dan bisa ikut **play/pause, mundur/maju 10 detik, skip intro, dan next episode** di Netflix kamu.

## Cara kerja

```
Pasangan (browser)  --WebRTC (PeerJS)-->  Halaman host
                                              |  window.postMessage
                                        Ekstensi Chrome
                                              |
                                         Tab Netflix  --> video dibagikan balik lewat WebRTC
```

- Situsnya **statis penuh** (folder `public/`), tidak ada server yang perlu dijalankan.
- Penjodohan kalian berdua (signaling) memakai server publik PeerJS (`0.peerjs.com`). Video dan suara dikirim langsung antar browser.
- Website tidak bisa menekan tombol di tab lain, jadi **ekstensi Chrome wajib dipasang di sisi host**. Pasangan tidak perlu memasang apa pun.

## Deploy ke Vercel

```bash
npm i -g vercel
vercel          # ikuti pertanyaannya, lalu
vercel --prod
```

`vercel.json` sudah mengatur folder `public/` dan rute `/watch/:room`. Atau hubungkan repo GitHub ke Vercel dan klik Deploy, tanpa pengaturan tambahan.

## Pasang ekstensi (sekali saja, di komputer host)

1. Buka `extension/manifest.json`. Di bagian `content_scripts` pertama (yang memuat `bridge.js`), tambahkan alamat Vercel kamu ke `matches`:

   ```json
   "matches": ["http://localhost/*", "http://127.0.0.1/*", "https://nama-project-kamu.vercel.app/*"]
   ```

   Pakai alamat yang persis milik kamu, jangan `*.vercel.app`, supaya situs lain tidak bisa mengontrol Netflix kamu.
2. Buka `chrome://extensions`, aktifkan **Developer mode**, klik **Load unpacked**, pilih folder `extension`.
3. Kalau tab Netflix sudah terbuka sebelum ekstensi dipasang, refresh tab Netflix-nya.

## Cara pakai tiap nonton

1. Buka alamat Vercel kamu (halaman host) di Chrome. Putar film di tab Netflix lain.
2. Pastikan dua badge di bagian 1 hijau (ekstensi terpasang, Netflix sedang diputar).
3. Kirim link di bagian 2 ke pasangan.
4. Klik **Bagikan layar**, pilih **tab Netflix**, dan centang **Bagikan audio tab**.
5. Pasangan buka link, klik **Gabung**. Mereka bisa pakai tombol di layar atau keyboard: Spasi (play/pause), panah kiri/kanan (±10 detik), F (layar penuh).

Switch "Izinkan pasangan mengontrol" bisa kamu matikan kapan saja. Link ruangan tetap sama tiap nonton (tersimpan di browser host). Klik "Buat ruangan baru" kalau mau ganti link.

## Dev lokal

```bash
npm install
npm start       # http://localhost:3000
```

## Kalau PeerJS cloud bermasalah atau koneksi gagal

- Server publik PeerJS gratis dan kadang lambat atau penuh. Kalau mau yang stabil, jalankan server sendiri (`npx peerjs --port 9000`, deploy ke Render/Railway/Fly.io) lalu isi `peerServer` di `public/config.js`.
- Di jaringan dengan NAT ketat, video bisa gagal tersambung. Tambahkan server TURN di `iceServers` pada `public/config.js`.

## Masalah umum

- **Layar pasangan hitam**: Netflix memakai DRM. Bagikan **tab Chrome** (bukan seluruh layar). Di Windows, matikan Chrome > Settings > System > "Use graphics acceleration when available", lalu restart Chrome.
- **Tidak ada suara**: share tab, bukan layar penuh, dan centang "Bagikan audio tab". Share seluruh layar di macOS tidak membawa suara.
- **Tombol skip intro / next tidak bereaksi**: Netflix sering mengganti selector tombolnya. Perbaiki daftar selector di `extension/netflix-main.js`.
- **Badge ekstensi "belum terdeteksi"**: pastikan alamat situs ada di `matches` manifest, reload ekstensi, lalu refresh halaman host.
- **"Menunggu sesi lama habis" setelah refresh host**: normal, server PeerJS butuh beberapa detik melepas sesi lama.
- Netflix tidak punya tombol "episode sebelumnya", jadi tombol mundur hanya mundur 10 detik.

## Struktur

- `public/`: situs statis. Halaman host (`index.html`, `host.js`), penonton (`watch.html`, `watch.js`), konfigurasi (`config.js`), PeerJS (`vendor/`)
- `extension/`: ekstensi Chrome (Manifest V3)
- `server.js`: server statis kecil untuk dev lokal saja
- `vercel.json`: konfigurasi deploy
