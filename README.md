# Watch Together

Nonton bareng lewat share layar. Kamu (host) membagikan tab yang memutar film, pasangan menonton lewat browser dan bisa ikut **play/pause, mundur/maju 10 detik, skip intro, dan next episode** di pemutar kamu. Ada juga **video call dan suara dua arah**, masing-masing bisa dinyalakan atau dimatikan.

Tidak terkunci ke satu situs: Netflix, YouTube, Prime Video, Disney+, Vidio, atau situs lain yang memakai elemen video biasa.

## Cara kerja

```
Pasangan (browser)  --WebRTC (PeerJS)-->  Halaman host
                                              |  window.postMessage
                                        Ekstensi Chrome
                                              |
                                      Tab video (Netflix, dll)  --> video dibagikan balik lewat WebRTC
```

- Situsnya **statis penuh** (folder `public/`), tidak ada server yang perlu dijalankan.
- Penjodohan kalian berdua (signaling) memakai server publik PeerJS (`0.peerjs.com`). Video, suara, dan kamera dikirim langsung antar browser.
- Website tidak bisa menekan tombol di tab lain, jadi **ekstensi Chrome wajib dipasang di sisi host**. Pasangan tidak perlu memasang apa pun.

## Deploy ke Vercel

```bash
npm i -g vercel
vercel          # ikuti pertanyaannya, lalu
vercel --prod
```

`vercel.json` sudah mengatur folder `public/` dan rute `/watch/:room`. Atau hubungkan repo GitHub ke Vercel dan klik Deploy, tanpa pengaturan tambahan.

## Pasang ekstensi (sekali saja, di komputer host)

1. Buka `extension/manifest.json`. Di bagian `content_scripts` pertama (yang memuat `bridge.js`), pastikan alamat situs kamu ada di `matches`:

   ```json
   "matches": ["http://localhost/*", "http://127.0.0.1/*", "https://nama-project-kamu.vercel.app/*"]
   ```

   Pakai alamat yang persis milik kamu, jangan `*.vercel.app`, supaya situs lain tidak bisa mengontrol pemutar kamu.
2. Buka `chrome://extensions`, aktifkan **Developer mode**, klik **Load unpacked**, pilih folder `extension`. Kalau sudah terpasang, klik tombol reload di kartunya.
3. Tab video yang sudah terbuka sebelum ekstensi dipasang perlu di-refresh.

Catatan keamanan: bagian pemutar ekstensi (`player-relay.js`, `player-main.js`) dipasang di semua situs supaya bisa dipakai di layanan apa pun. Keduanya tidak membaca isi halaman dan tidak mengirim apa pun ke luar. Mereka hanya bereaksi terhadap perintah dari background ekstensi, dan perintah itu hanya datang dari halaman yang terdaftar di `matches` bagian `bridge.js`. Kalau mau membatasi, ganti `<all_urls>` di dua `content_scripts` terakhir dengan daftar situs pilihan kamu.

## Cara pakai tiap nonton

1. Buka alamat Vercel kamu (halaman host) di Chrome. Putar film di tab lain dan **jangan di-mute**.
2. Pastikan dua badge di bagian 1 hijau (ekstensi terpasang, video terdeteksi).
3. Kirim link di bagian 2 ke pasangan.
4. Klik **Bagikan layar**, pilih **tab yang memutar film**, dan centang **Bagikan audio tab**.
5. Pasangan buka link, klik **Gabung**.

Kontrol penonton: tombol di layar, atau keyboard Spasi (play/pause), panah kiri/kanan (±10 detik), F (layar penuh), M (mic), V (kamera).

Switch "Izinkan pasangan mengontrol" bisa kamu matikan kapan saja. Link ruangan tetap sama tiap nonton (tersimpan di browser host). Klik "Buat ruangan baru" kalau mau ganti link.

## Kualitas video

Penonton bisa memilih kualitas dari dropdown di bar kontrol: Terbaik, 720p, 480p, 360p. Resolusi yang sedang diterima tampil di sebelahnya. Pilih yang lebih rendah kalau internet salah satu pihak lambat. Kalau gambar masih pecah di "Terbaik", biasanya penyebabnya internet upload host.

## Video call

- Bagian 4 di halaman host dan tombol 🎤 / 📷 di bar kontrol penonton menyalakan atau mematikan mic dan kamera masing-masing. Mematikan benar-benar melepas perangkatnya.
- Kamera lawan tampil sebagai kotak kecil di pojok kanan atas layar penonton, dan di bagian 4 di halaman host.
- Browser akan meminta izin mic/kamera saat pertama kali dinyalakan.
- **Pakai headset**, terutama host. Kalau film keluar dari speaker, mic host menangkapnya lagi dan pasangan mendengar suara film dobel dengan jeda.
- Dirancang untuk dua orang. Kalau ada penonton ketiga, dia melihat kamera host tapi tidak melihat kamera penonton lain.

## Dev lokal

```bash
npm install
npm start       # http://localhost:3000
```

## Kalau PeerJS cloud bermasalah atau koneksi gagal

- Server publik PeerJS gratis dan kadang lambat atau penuh. Kalau mau yang stabil, jalankan server sendiri (`npx peerjs --port 9000`, deploy ke Render/Railway/Fly.io) lalu isi `peerServer` di `public/config.js`.
- Di jaringan dengan NAT ketat, video bisa gagal tersambung. Tambahkan server TURN di `iceServers` pada `public/config.js`.

## Masalah umum

- **Layar pasangan hitam**: layanan seperti Netflix memakai DRM. Bagikan **tab Chrome** (bukan seluruh layar). Di Windows, matikan Chrome > Settings > System > "Use graphics acceleration when available", lalu restart Chrome.
- **Tidak ada suara film**: share tab, bukan layar penuh, dan centang "Bagikan audio tab". Share seluruh layar di macOS tidak membawa suara.
- **Badge "Video: belum ada yang diputar"**: putar videonya (tidak di-mute) di tab lain, lebih dari 320×180 px, lalu refresh tab itu kalau dibuka sebelum ekstensi dipasang. Kalau ada beberapa tab video, yang dikontrol adalah yang sedang bersuara atau paling baru diputar.
- **Skip intro / next tidak bereaksi**: selector tombol situs sering berubah. Netflix, YouTube, dan Prime punya selector sendiri, situs lain dicari lewat teks tombolnya ("Next episode", "Skip intro", "Lewati"). Perbaiki di `extension/player-main.js`.
- **Badge ekstensi "belum terdeteksi"**: pastikan alamat situs ada di `matches` manifest, reload ekstensi, lalu refresh halaman host.
- **"Menunggu sesi lama habis" setelah refresh host**: normal, server PeerJS butuh beberapa detik melepas sesi lama.
- Netflix tidak punya tombol "episode sebelumnya", jadi tombol mundur hanya mundur 10 detik.

## Struktur

- `public/`: situs statis. Halaman host (`index.html`, `host.js`), penonton (`watch.html`, `watch.js`), helper mic/kamera (`media.js`), konfigurasi (`config.js`), PeerJS (`vendor/`)
- `extension/`: ekstensi Chrome (Manifest V3). `bridge.js` (jembatan dari halaman host), `background.js` (memilih tab video), `player-relay.js` + `player-main.js` (mengontrol pemutar)
- `server.js`: server statis kecil untuk dev lokal saja
- `vercel.json`: konfigurasi deploy
