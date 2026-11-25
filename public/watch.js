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
    controlButtons.forEach((b) => {
      b.dataset.title = b.dataset.title || b.title;
      b.disabled = !ok;
      b.title = ok ? b.dataset.title : b.dataset.title + ' (belum bisa dipakai)';
    });
  }
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
  function cmd(name, ms) {
    if (!conn || !conn.open || !controlAllowed) return;
    conn.send({ t: 'cmd', cmd: name, ms });
  }
  controlButtons.forEach((b) =>
    b.addEventListener('click', () => cmd(b.dataset.cmd, b.dataset.ms ? Number(b.dataset.ms) : undefined))
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); cmd('toggle'); }
    else if (e.key === 'ArrowLeft') cmd('seek', -10000);
    else if (e.key === 'ArrowRight') cmd('seek', 10000);
    else if (e.key.toLowerCase() === 'f') toggleFullscreen();
  });
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else $('#stage').requestFullscreen().catch(() => {});
  }
  $('#fs').addEventListener('click', toggleFullscreen);

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

    mine.on('open', () => {
      setStatus('Terhubung ke host');
      showWait('Menunggu host membagikan layar…');
      refreshControls();
    });
    mine.on('data', (m) => {
      if (!m) return;
      if (m.t === 'info') {
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
      refreshControls();
      setStatus('Host terputus');
      showWait('Host terputus. Mencoba menyambung lagi…');
      scheduleReconnect(2000);
    });
  }

  function startPeer() {
    const opts = { config: { iceServers: cfg.iceServers }, ...(cfg.peerServer || {}) };
    peer = new Peer(opts);
    peer.on('open', connectHost);

    // Host memanggil kita ketika mulai (atau mulai ulang) share layar.
    peer.on('call', (call) => {
      call.answer();
      call.on('stream', (s) => {
        video.srcObject = s;
        video.play().catch(() => {});
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
        setStatus('Error: ' + err.type);
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
