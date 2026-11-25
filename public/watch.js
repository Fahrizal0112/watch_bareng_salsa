(() => {
  const $ = (s) => document.querySelector(s);
  const room = location.pathname.split('/').pop().toLowerCase();
  const hostId = `wt-${room}`;
  const cfg = window.WT_CONFIG || {};
  const video = $('#video');

  let peer = null;
  let conn = null;
  let controlAllowed = false;
  let retryTimer = null;

  // ---- UI ----
  const pill = $('#pill');
  const setStatus = (t) => (pill.textContent = t);
  const controlButtons = [...document.querySelectorAll('[data-cmd]')];
  function refreshControls() {
    const ok = controlAllowed && conn && conn.open;
    controlButtons.concat($('#clickmode')).forEach((b) => {
      b.dataset.title = b.dataset.title || b.title;
      b.disabled = !ok;
      b.title = ok ? b.dataset.title : b.dataset.title + ' (belum bisa dipakai)';
    });
    if (!ok) setClickMode(false);
  }

  // Bar kontrol disembunyikan selama tombol "Gabung" atau "Ketuk untuk memutar" tampil, supaya
  // tidak pernah menutupi tombol itu (dan ketukan tidak jatuh ke bar).
  const syncBlock = () => {
    const blocked = !$('#join').classList.contains('hidden') || !$('#tap').classList.contains('hidden');
    $('#controls').classList.toggle('blocked', blocked);
  };
  const mo = new MutationObserver(syncBlock);
  ['#join', '#tap'].forEach((s) => mo.observe($(s), { attributes: true, attributeFilter: ['class'] }));
  syncBlock();

  // ---- Mode klik: ketukan di video diteruskan sebagai klik di tab host ----
  // Hanya berlaku kalau host membagikan TAB (bukan seluruh layar), karena posisi ketukan
  // dipetakan ke area halaman tab itu.
  let clickMode = false;
  function setClickMode(on) {
    clickMode = !!on;
    $('#clickmode').setAttribute('aria-pressed', String(clickMode));
    $('#stage').classList.toggle('clickmode', clickMode);
  }
  $('#clickmode').addEventListener('click', (e) => {
    setClickMode(!clickMode);
    e.currentTarget.blur();
  });
  video.addEventListener('click', (e) => {
    if (!clickMode) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    // Video memakai object-fit: contain, jadi hitung area gambar yang sebenarnya.
    const r = video.getBoundingClientRect();
    const scale = Math.min(r.width / vw, r.height / vh);
    const cw = vw * scale;
    const ch = vh * scale;
    const x = (e.clientX - (r.left + (r.width - cw) / 2)) / cw;
    const y = (e.clientY - (r.top + (r.height - ch) / 2)) / ch;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    cmd('click', undefined, x, y);
    const dot = document.createElement('div');
    dot.className = 'ripple';
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
    document.body.append(dot);
    setTimeout(() => dot.remove(), 600);
  });
  function showWait(text) {
    $('#wait-text').textContent = text;
    $('#wait').classList.remove('hidden');
  }
  function clearVideo() {
    video.srcObject = null;
  }

  // Sembunyikan kontrol kalau mouse diam, supaya film tidak tertutup.
  let idleTimer;
  const wake = () => {
    $('#controls').classList.remove('idle');
    pill.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      $('#controls').classList.add('idle');
      pill.classList.add('idle');
    }, 3000);
  };
  ['mousemove', 'touchstart', 'keydown'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));

  // ---- Kirim perintah ----
  function cmd(name, ms, x, y) {
    if (!conn || !conn.open || !controlAllowed) return;
    conn.send({ t: 'cmd', cmd: name, ms, x, y });
  }
  controlButtons.forEach((b) =>
    b.addEventListener('click', () => cmd(b.dataset.cmd, b.dataset.ms ? Number(b.dataset.ms) : undefined))
  );
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ') { e.preventDefault(); cmd('toggle'); }
    else if (e.key === 'ArrowLeft') cmd('seek', -10000);
    else if (e.key === 'ArrowRight') cmd('seek', 10000);
    else if (e.key.toLowerCase() === 'f') toggleFullscreen();
    else if (e.key.toLowerCase() === 'm') toggleMedia('mic');
    else if (e.key.toLowerCase() === 'v') toggleMedia('cam');
  });
  function toggleFullscreen() {
    // Safari (iPad) memakai versi webkit, dan di iPhone hanya video yang bisa layar penuh.
    const stage = $('#stage');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
    else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  }

  // Safari sering menolak play() otomatis. Kalau ditolak, minta penonton mengetuk sekali.
  function playMedia(el) {
    const p = el.play();
    if (p && p.catch) p.catch(() => $('#tap').classList.remove('hidden'));
  }
  $('#tap-btn').addEventListener('click', () => {
    $('#tap').classList.add('hidden');
    video.play().catch(() => {});
    $('#hostmic').play().catch(() => {});
  });
  $('#fs').addEventListener('click', toggleFullscreen);

  // ---- Video call: mic dan kamera dua arah ----
  const local = { mic: null, cam: null };
  const sendMedia = () => {
    if (conn && conn.open) conn.send({ t: 'media', mic: !!local.mic, cam: !!local.cam });
  };
  // Mic dan kamera dikirim ke host lewat panggilan terpisah (lihat media.js).
  const calls = { mic: null, cam: null };
  function dialMedia(kind) {
    if (calls[kind]) {
      calls[kind].close();
      calls[kind] = null;
    }
    if (local[kind] && peer && conn && conn.open) {
      calls[kind] = peer.call(hostId, local[kind], { metadata: { kind } });
    }
  }
  function refreshMediaUI() {
    $('#mic').setAttribute('aria-pressed', String(!!local.mic));
    $('#cam').setAttribute('aria-pressed', String(!!local.cam));
    $('#mic').textContent = local.mic ? '🎤 On' : '🎤 Off';
    $('#cam').textContent = local.cam ? '📷 On' : '📷 Off';
    $('#selfcam').srcObject = local.cam || null;
    $('#self-tile').hidden = !local.cam;
  }
  async function toggleMedia(kind) {
    const btn = $(kind === 'mic' ? '#mic' : '#cam');
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      if (local[kind]) {
        wtMedia.stop(local[kind]);
        local[kind] = null;
      } else {
        let s;
        try {
          s = await wtMedia.acquire(kind);
        } catch (err) {
          setStatus(wtMedia.errorText(kind, err));
          wake();
          return;
        }
        local[kind] = s;
        s.getTracks()[0].addEventListener('ended', () => {
          if (local[kind] === s) toggleMedia(kind);
        });
      }
      dialMedia(kind);
      sendMedia();
      refreshMediaUI();
    } finally {
      btn.disabled = false;
    }
  }
  $('#mic').addEventListener('click', (e) => { toggleMedia('mic'); e.currentTarget.blur(); });
  $('#cam').addEventListener('click', (e) => { toggleMedia('cam'); e.currentTarget.blur(); });
  function showHostCam(stream) {
    $('#hostcam').srcObject = stream;
    $('#host-tile').hidden = !stream;
  }

  // ---- Kualitas video (dipilih penonton, diterapkan oleh host) ----
  const qualitySel = $('#quality');
  try {
    const saved = localStorage.getItem('wt-quality');
    if (saved && [...qualitySel.options].some((o) => o.value === saved)) qualitySel.value = saved;
  } catch {}
  const sendQuality = () => {
    if (conn && conn.open) conn.send({ t: 'quality', value: qualitySel.value });
  };
  qualitySel.addEventListener('change', () => {
    try { localStorage.setItem('wt-quality', qualitySel.value); } catch {}
    sendQuality();
    qualitySel.blur(); // supaya spasi dan panah tetap jadi kontrol video
  });
  // Tampilkan resolusi yang benar-benar sedang diterima.
  setInterval(() => {
    $('#res').textContent = video.srcObject && video.videoHeight ? `${video.videoWidth}×${video.videoHeight}` : '';
  }, 1500);

  // Browser mengirim video dengan bitrate awal rendah lalu naik pelan, itu yang membuat
  // gambar pecah di awal. Jawaban SDP kita beri bitrate awal dan minimum yang lebih tinggi
  // (parameter x-google-*, dibaca pengirim Chrome; browser lain mengabaikannya).
  function boostBitrate(sdp) {
    const lines = sdp.split('\r\n');
    const out = [];
    let inVideo = false;
    const hasFmtp = new Set();
    lines.forEach((l) => {
      const m = l.match(/^a=fmtp:(\d+) /);
      if (m) hasFmtp.add(m[1]);
    });
    const params = 'x-google-start-bitrate=4000;x-google-min-bitrate=1500';
    for (const l of lines) {
      if (l.startsWith('m=')) inVideo = l.startsWith('m=video');
      if (inVideo && l.startsWith('a=fmtp:') && !l.includes('apt=')) {
        out.push(`${l};${params}`);
        continue;
      }
      out.push(l);
      const r = l.match(/^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//);
      if (inVideo && r && !hasFmtp.has(r[1])) out.push(`a=fmtp:${r[1]} ${params}`);
    }
    return out.join('\r\n');
  }

  // ---- Sambung ke host lewat PeerJS ----
  function scheduleReconnect(ms) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connectHost, ms);
  }

  function connectHost() {
    if (!peer || peer.destroyed || !peer.open) return;
    if (conn) { try { conn.close(); } catch {} }
    conn = peer.connect(hostId, { serialization: 'json', reliable: true });
    const mine = conn;

    // Tahap kedua yang bisa macet: server tersambung, tapi sambungan langsung ke host tidak
    // terbentuk (ICE gagal, biasanya karena jaringan butuh server TURN). PeerJS tidak
    // memberi error dalam kasus ini, jadi kita pantau sendiri dan coba lagi sampai 3 kali.
    setTimeout(() => {
      if (conn !== mine || mine.open || !peer || peer.destroyed) return;
      showDiag();
      if (++connectTries < 3) {
        showWait('Sambungan langsung ke host belum terbentuk. Mencoba lagi…');
        connectHost();
      } else {
        setStatus('Sambungan ke host gagal');
        showWait(
          iceInfo.turn
            ? 'Sambungan langsung ke host gagal walau memakai server relay. Minta host refresh halamannya, lalu refresh halaman ini.'
            : 'Sambungan langsung ke host gagal. Jaringan kalian kemungkinan butuh server TURN (relay). Lihat README bagian TURN, lalu kirim tulisan di bawah ke yang punya situsnya.'
        );
      }
    }, 12000);

    // Pesan status awal dari host kadang hilang di awal sambungan, jadi kita yang meminta
    // ("hello") dan mengulang sampai jawabannya datang.
    let gotInfo = false;
    const hello = (n) => {
      if (gotInfo || n > 8 || !mine.open || conn !== mine) return;
      mine.send({ t: 'hello' });
      setTimeout(() => hello(n + 1), 1500);
    };

    mine.on('open', () => {
      connectTries = 0;
      $('#diag').classList.add('hidden');
      setStatus('Terhubung ke host');
      showWait('Menunggu host membagikan layar…');
      refreshControls();
      hello(0);
      sendQuality();
      sendMedia();
      // Setelah sambung ulang, panggilan lama sudah mati: telepon host lagi kalau mic/kamera masih nyala.
      dialMedia('mic');
      dialMedia('cam');
    });
    mine.on('data', (m) => {
      if (!m) return;
      if (m.t === 'info') gotInfo = true;
      if (m.t === 'media') {
        // Host mematikan kamera/mic: panggilannya tidak memberi tahu kita, jadi pakai pesan ini.
        if (!m.cam) showHostCam(null);
        if (!m.mic) $('#hostmic').srcObject = null;
      } else if (m.t === 'info') {
        controlAllowed = !!m.control;
        refreshControls();
        setStatus(controlAllowed ? 'Terhubung · kamu bisa mengontrol' : 'Terhubung · kontrol dikunci host');
      } else if (m.t === 'ended') {
        clearVideo();
        showWait('Host berhenti membagikan layar. Menunggu lagi…');
      }
    });
    mine.on('close', () => {
      if (conn !== mine) return;
      controlAllowed = false;
      clearVideo();
      showHostCam(null);
      $('#hostmic').srcObject = null;
      calls.mic = calls.cam = null;
      refreshControls();
      setStatus('Host terputus');
      showWait('Host terputus. Mencoba menyambung lagi…');
      scheduleReconnect(2000);
    });
  }

  // ---- Diagnosis: kalau macet di "Menyambung…", tampilkan penyebabnya di layar ----
  let attempts = 0;
  let connectTries = 0;
  let iceInfo = { turn: false };
  let lastError = '';
  async function showDiag() {
    const box = $('#diag');
    box.classList.remove('hidden');
    const lines = ['Pustaka koneksi: ' + (typeof Peer === 'function' ? 'ok' : 'GAGAL dimuat')];
    lines.push('Online: ' + (navigator.onLine ? 'ya' : 'tidak'));
    lines.push('Server relay (TURN): ' + (iceInfo.turn ? 'ada' : 'tidak ada, hanya STUN'));
    const pc = conn && conn.peerConnection;
    lines.push('Status sambungan ke host: ' + (pc ? pc.iceConnectionState : '-'));
    const ps = cfg.peerServer || {};
    const host = ps.host || '0.peerjs.com';
    const url = `https://${host}${ps.port && ps.port !== 443 ? ':' + ps.port : ''}${ps.path || '/'}peerjs/id`;
    box.textContent = lines.join('\n') + '\nMemeriksa server…';
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(url, { cache: 'no-store', signal: ctl.signal });
      clearTimeout(timer);
      lines.push(`Server ${host}: HTTP ${r.status}`);
    } catch (err) {
      lines.push(`Server ${host}: tidak terjangkau (${(err && err.name) || 'error'})`);
    }
    lines.push('Error terakhir: ' + (lastError || '-'));
    lines.push('Percobaan: ' + attempts);
    lines.push(navigator.userAgent.slice(0, 110));
    box.textContent = lines.join('\n');
  }

  async function startPeer() {
    if (typeof Peer !== 'function') {
      lastError = 'pustaka PeerJS tidak termuat';
      showWait('Pustaka koneksi gagal dimuat. Refresh halaman ini atau pakai browser yang lebih baru.');
      showDiag();
      return;
    }
    // Daftar server ICE (STUN, plus TURN kalau host sudah mengaturnya di Vercel).
    iceInfo = await wtIce();
    const opts = { config: { iceServers: iceInfo.iceServers }, ...(cfg.peerServer || {}) };
    try {
      peer = new Peer(opts);
    } catch (err) {
      lastError = String(err && err.message ? err.message : err);
      showWait('Gagal memulai koneksi.');
      showDiag();
      return;
    }
    const mine = peer;
    mine.on('open', () => {
      $('#diag').classList.add('hidden');
      connectHost();
    });
    // Kalau server tidak menjawab dalam 10 detik (WebSocket menggantung tanpa error), tampilkan
    // diagnosis lalu coba lagi dengan koneksi baru, maksimal 3 kali.
    setTimeout(() => {
      if (peer !== mine || mine.open || mine.destroyed) return;
      showWait('Belum tersambung ke server. Mencoba lagi…');
      showDiag();
      if (++attempts < 3) {
        try { mine.destroy(); } catch {}
        startPeer();
      }
    }, 10000);

    // Host memanggil kita ketika mulai (atau mulai ulang) share layar.
    // Hanya terima panggilan dari host: layar (default), kamera, atau mic.
    peer.on('call', (call) => {
      const kind = (call.metadata && call.metadata.kind) || 'screen';
      if (call.peer !== hostId || !['screen', 'cam', 'mic'].includes(kind)) {
        call.close();
        return;
      }
      if (kind === 'cam') {
        call.answer();
        call.on('stream', showHostCam);
        return;
      }
      if (kind === 'mic') {
        call.answer();
        call.on('stream', (s) => {
          $('#hostmic').srcObject = s;
          playMedia($('#hostmic'));
        });
        return;
      }
      call.answer(undefined, { sdpTransform: boostBitrate });
      call.on('stream', (s) => {
        video.srcObject = s;
        playMedia(video);
        $('#wait').classList.add('hidden');
      });
      call.on('close', () => {
        if (video.srcObject) {
          clearVideo();
          showWait('Menunggu host membagikan layar…');
        }
      });
    });

    peer.on('disconnected', () => {
      if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1500);
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        setStatus('Host belum online');
        showWait('Host belum membuka halamannya. Halaman ini akan menyambung otomatis.');
        scheduleReconnect(3000);
      } else {
        lastError = err.type + (err.message ? ' - ' + String(err.message).slice(0, 60) : '');
        setStatus('Error: ' + err.type);
        showDiag();
        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
          showWait('Tidak bisa menghubungi server. Mencoba lagi…');
          if (peer.destroyed) setTimeout(startPeer, 3000);
        }
      }
    });
  }

  // Klik "Gabung" jadi gestur pengguna, supaya browser mengizinkan suara otomatis.
  $('#join-btn').addEventListener('click', () => {
    $('#join').classList.add('hidden');
    showWait('Menyambung…');
    setStatus('Menyambung…');
    startPeer();
    wake();
  });
  refreshControls();
})();
