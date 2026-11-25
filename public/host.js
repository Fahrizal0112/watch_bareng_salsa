(() => {
  const $ = (s) => document.querySelector(s);
  const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
  const CMDS = new Set(['toggle', 'play', 'pause', 'seek', 'next', 'skip-intro']);
  const cfg = window.WT_CONFIG || {};

  const rand = (n) =>
    [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ALPHABET[b % ALPHABET.length]).join('');

  // Kode ruangan disimpan di browser host supaya link tetap sama tiap nonton.
  let room = localStorage.getItem('wt-room-v2');
  if (!room) {
    room = rand(8);
    localStorage.setItem('wt-room-v2', room);
  }

  let stream = null;
  let peer = null;
  let allowControl = $('#allow').checked;
  const viewers = new Map(); // peerId -> { conn, call }

  // ---- UI ----
  const setBadge = (el, text, cls) => {
    el.textContent = text;
    el.className = 'badge' + (cls ? ' ' + cls : '');
  };
  $('#link').value = `${location.origin}/watch/${room}`;
  const updateViewers = () => {
    const live = [...viewers.values()].filter(
      (v) => v.call && v.call.peerConnection && v.call.peerConnection.connectionState === 'connected'
    ).length;
    setBadge(
      $('#b-viewers'),
      `Penonton: ${viewers.size}` + (stream ? ` (menerima video ${live})` : ''),
      viewers.size ? 'ok' : ''
    );
  };
  $('#copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('#link').value);
    $('#copy').textContent = 'Tersalin';
    setTimeout(() => ($('#copy').textContent = 'Salin'), 1500);
  });
  $('#newroom').addEventListener('click', () => {
    localStorage.removeItem('wt-room-v2');
    location.reload();
  });
  $('#allow').addEventListener('change', () => {
    allowControl = $('#allow').checked;
    viewers.forEach((v) => sendInfo(v.conn));
  });

  // ---- Ekstensi (jembatan ke tab Netflix) ----
  let extSeen = false;
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'wt-ext' || e.data.type !== 'status') return;
    extSeen = true;
    setBadge($('#b-ext'), 'Ekstensi: terpasang', 'ok');
    if (e.data.watching) setBadge($('#b-nf'), 'Netflix: sedang diputar', 'ok');
    else if (e.data.netflix) setBadge($('#b-nf'), 'Netflix: tab terbuka, belum memutar film', 'warn');
    else setBadge($('#b-nf'), 'Netflix: tab tidak ditemukan', 'warn');
    $('#ext-hint').textContent = e.data.netflix
      ? ''
      : 'Buka netflix.com di tab lain lalu putar filmnya. Kalau tab sudah terbuka sebelum ekstensi dipasang, refresh tab Netflix-nya.';
  });
  const ping = () => window.postMessage({ source: 'wt-page', type: 'ping' }, location.origin);
  setInterval(ping, 3000);
  ping();
  setTimeout(() => {
    if (extSeen) return;
    setBadge($('#b-ext'), 'Ekstensi: belum terdeteksi', 'warn');
    $('#ext-hint').textContent =
      'Pasang ekstensi dari folder "extension" dan pastikan alamat situs ini ada di manifest-nya (lihat README), lalu refresh halaman ini.';
  }, 1500);

  // ---- Perintah dari penonton ----
  function sendInfo(conn) {
    if (conn && conn.open) conn.send({ t: 'info', control: allowControl });
  }
  function handleControl(m) {
    if (!m || m.t !== 'cmd' || !CMDS.has(m.cmd) || !allowControl) return;
    const ms = Number.isFinite(m.ms) ? Math.max(-120000, Math.min(120000, m.ms)) : 0;
    window.postMessage({ source: 'wt-page', type: 'cmd', cmd: m.cmd, ms }, location.origin);
  }

  // ---- Kirim video ke penonton ----
  function callViewer(id) {
    const v = viewers.get(id);
    if (!v || !stream) return;
    if (v.call) v.call.close();
    const call = peer.call(id, stream);
    v.call = call;
    const pc = call.peerConnection;
    if (pc) {
      pc.addEventListener('connectionstatechange', () => {
        updateViewers();
        if (pc.connectionState === 'connected') raiseBitrate(pc);
      });
    }
    call.on('close', updateViewers);
  }
  // Naikkan bitrate video supaya gambar film tidak pecah.
  async function raiseBitrate(pc) {
    for (const s of pc.getSenders()) {
      if (!s.track || s.track.kind !== 'video') continue;
      try {
        const p = s.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = 5_000_000;
        await s.setParameters(p);
      } catch {}
    }
  }

  // ---- Share layar ----
  $('#start').addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
    } catch (err) {
      console.warn(err);
      return;
    }
    stream.getVideoTracks().forEach((t) => (t.contentHint = 'motion'));
    stream.getVideoTracks()[0].addEventListener('ended', stopShare);
    $('#preview').srcObject = stream;
    $('#preview').hidden = false;
    $('#start').disabled = true;
    $('#stop').disabled = false;
    if (!stream.getAudioTracks().length) {
      $('#ext-hint').textContent = 'Suara tidak ikut terbagi. Pilih tab Chrome dan centang "Bagikan audio tab".';
    }
    viewers.forEach((_, id) => callViewer(id));
    updateViewers();
  });
  $('#stop').addEventListener('click', stopShare);
  function stopShare() {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    viewers.forEach((v) => {
      if (v.call) v.call.close();
      v.call = null;
      if (v.conn.open) v.conn.send({ t: 'ended' });
    });
    $('#preview').srcObject = null;
    $('#preview').hidden = true;
    $('#start').disabled = false;
    $('#stop').disabled = true;
    updateViewers();
  }

  // ---- Signaling lewat PeerJS ----
  function onConnection(conn) {
    conn.on('open', () => {
      const old = viewers.get(conn.peer);
      if (old) {
        if (old.call) old.call.close();
        if (old.conn !== conn) old.conn.close();
      }
      viewers.set(conn.peer, { conn, call: null });
      sendInfo(conn);
      if (stream) callViewer(conn.peer);
      updateViewers();
    });
    conn.on('data', handleControl);
    conn.on('close', () => {
      const v = viewers.get(conn.peer);
      if (v && v.conn === conn) {
        if (v.call) v.call.close();
        viewers.delete(conn.peer);
        updateViewers();
      }
    });
  }

  let tries = 0;
  function startPeer() {
    const opts = { config: { iceServers: cfg.iceServers }, ...(cfg.peerServer || {}) };
    peer = new Peer(`wt-${room}`, opts);
    peer.on('open', () => {
      tries = 0;
      setBadge($('#b-conn'), 'Server: tersambung', 'ok');
    });
    peer.on('connection', onConnection);
    peer.on('disconnected', () => {
      setBadge($('#b-conn'), 'Server: terputus, mencoba lagi…', 'warn');
      if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1500);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Setelah refresh, server kadang masih menyimpan sesi lama beberapa detik.
        if (++tries <= 6) {
          setBadge($('#b-conn'), 'Server: menunggu sesi lama habis…', 'warn');
          setTimeout(startPeer, 3000);
        } else {
          setBadge($('#b-conn'), 'Kode ruangan sedang dipakai, klik "Buat ruangan baru"', 'warn');
        }
      } else if (err.type !== 'peer-unavailable') {
        setBadge($('#b-conn'), 'Server: error ' + err.type, 'warn');
      }
    });
  }
  startPeer();
})();
