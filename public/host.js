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
  const viewers = new Map(); // peerId -> { conn, call (layar), micCall, camCall, quality }

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

  // ---- Ekstensi (jembatan ke tab video) ----
  let extSeen = false;
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'wt-ext' || e.data.type !== 'status') return;
    extSeen = true;
    setBadge($('#b-ext'), 'Ekstensi: terpasang', 'ok');
    if (e.data.hasTarget) setBadge($('#b-nf'), 'Video: ' + (e.data.site || 'terdeteksi'), 'ok');
    else setBadge($('#b-nf'), 'Video: belum ada yang diputar', 'warn');

    if (e.data.forType === 'cmd' && e.data.hasTarget && e.data.delivered === false) {
      // Perintah dari penonton diterima tapi tab videonya tidak punya script ekstensi.
      $('#ext-hint').textContent =
        'Perintah penonton gagal sampai ke ' + (e.data.site || 'tab video') + '. Refresh tab video itu (F5) lalu coba lagi.';
    } else if (e.data.forType === 'cmd' && !e.data.hasTarget) {
      $('#ext-hint').textContent =
        'Perintah penonton diterima, tapi tidak ada tab video yang ditemukan. Putar videonya di tab lain dan jangan di-mute.';
    } else if (e.data.forType === 'ping') {
      $('#ext-hint').textContent = e.data.hasTarget
        ? ''
        : 'Putar videonya di tab lain (Netflix, YouTube, dll) dan jangan di-mute.';
    }
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
    const call = peer.call(id, stream, { metadata: { kind: 'screen' } });
    v.call = call;
    const pc = call.peerConnection;
    if (pc) {
      pc.addEventListener('connectionstatechange', () => {
        updateViewers();
        if (pc.connectionState === 'connected') applyQuality(v);
      });
    }
    call.on('close', updateViewers);
  }
  // Kualitas dipilih penonton, diterapkan per penonton lewat parameter pengirim.
  // h = tinggi maksimum (0 = tanpa batas), bps = bitrate maksimum.
  const PRESETS = {
    best: { h: 0, bps: 10_000_000 },
    '720': { h: 720, bps: 4_000_000 },
    '480': { h: 480, bps: 1_500_000 },
    '360': { h: 360, bps: 700_000 },
  };
  async function applyQuality(v) {
    const pc = v.call && v.call.peerConnection;
    if (!pc) return;
    const preset = PRESETS[v.quality] || PRESETS.best;
    for (const s of pc.getSenders()) {
      if (!s.track || s.track.kind !== 'video') continue;
      try {
        const srcH = s.track.getSettings().height || 1080;
        const p = s.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = preset.bps;
        p.encodings[0].scaleResolutionDownBy = preset.h ? Math.max(1, srcH / preset.h) : 1;
        await s.setParameters(p);
      } catch (err) {
        console.warn('setParameters', err);
      }
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

  // ---- Video call: mic dan kamera dua arah ----
  const local = { mic: null, cam: null };
  const known = new Set(); // peerId yang sudah membuka koneksi data (satu-satunya yang boleh menelepon)
  const tiles = new Map(); // viewerId -> { box, video, audio, label, mic, cam }
  const CALL_HINT = $('#call-hint').textContent;

  function sendMedia(conn) {
    if (conn && conn.open) conn.send({ t: 'media', mic: !!local.mic, cam: !!local.cam });
  }
  function dialMedia(id, kind) {
    const v = viewers.get(id);
    if (!v) return;
    const key = kind + 'Call';
    if (v[key]) {
      v[key].close();
      v[key] = null;
    }
    if (local[kind]) v[key] = peer.call(id, local[kind], { metadata: { kind } });
  }
  function refreshMediaUI() {
    $('#mic').setAttribute('aria-pressed', String(!!local.mic));
    $('#cam').setAttribute('aria-pressed', String(!!local.cam));
    $('#mic').textContent = local.mic ? '🎤 Mic: nyala' : '🎤 Mic: mati';
    $('#cam').textContent = local.cam ? '📷 Kamera: nyala' : '📷 Kamera: mati';
    $('#selfcam').srcObject = local.cam || null;
    $('#self-tile').hidden = !local.cam;
  }
  async function toggleMedia(kind) {
    const btn = $(kind === 'mic' ? '#mic' : '#cam');
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
          $('#call-hint').textContent = wtMedia.errorText(kind, err);
          return;
        }
        local[kind] = s;
        // Perangkat dicabut atau izin dicabut di tengah jalan: anggap dimatikan.
        s.getTracks()[0].addEventListener('ended', () => {
          if (local[kind] === s) toggleMedia(kind);
        });
      }
      $('#call-hint').textContent = CALL_HINT;
      viewers.forEach((v, id) => {
        dialMedia(id, kind);
        sendMedia(v.conn);
      });
      refreshMediaUI();
    } finally {
      btn.disabled = false;
    }
  }
  $('#mic').addEventListener('click', () => toggleMedia('mic'));
  $('#cam').addEventListener('click', () => toggleMedia('cam'));

  function renderTile(t) {
    t.label.textContent = `Pasangan · ${t.mic ? '🎤' : '🔇'} ${t.cam ? '📷' : '🚫'}`;
  }
  function getTile(id) {
    let t = tiles.get(id);
    if (t) return t;
    const box = document.createElement('div');
    box.className = 'tile';
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    const label = document.createElement('span');
    label.className = 'tl';
    const audio = document.createElement('audio');
    audio.autoplay = true;
    box.append(video, label, audio);
    $('#tiles').append(box);
    t = { box, video, audio, label, mic: false, cam: false };
    tiles.set(id, t);
    renderTile(t);
    return t;
  }
  function removeTile(id) {
    const t = tiles.get(id);
    if (t) {
      t.box.remove();
      tiles.delete(id);
    }
  }
  function onRemoteMedia(id, m) {
    const t = getTile(id);
    t.mic = !!m.mic;
    t.cam = !!m.cam;
    if (!t.cam) t.video.srcObject = null;
    if (!t.mic) t.audio.srcObject = null;
    renderTile(t);
  }
  // Mic dan kamera penonton masuk lewat panggilan dari penonton ke host.
  function onCall(call) {
    const kind = call.metadata && call.metadata.kind;
    if (!known.has(call.peer) || (kind !== 'mic' && kind !== 'cam')) {
      call.close();
      return;
    }
    call.answer();
    call.on('stream', (s) => {
      const t = getTile(call.peer);
      if (kind === 'cam') {
        t.video.srcObject = s;
        t.cam = true;
      } else {
        t.audio.srcObject = s;
        t.audio.play().catch(() => {});
        t.mic = true;
      }
      renderTile(t);
    });
  }

  // ---- Signaling lewat PeerJS ----
  function onConnection(conn) {
    known.add(conn.peer);
    conn.on('open', () => {
      const old = viewers.get(conn.peer);
      if (old) {
        ['call', 'micCall', 'camCall'].forEach((k) => old[k] && old[k].close());
        if (old.conn !== conn) old.conn.close();
      }
      viewers.set(conn.peer, { conn, call: null, micCall: null, camCall: null, quality: old ? old.quality : 'best' });
      sendInfo(conn);
      sendMedia(conn);
      getTile(conn.peer);
      if (stream) callViewer(conn.peer);
      dialMedia(conn.peer, 'mic');
      dialMedia(conn.peer, 'cam');
      updateViewers();
    });
    conn.on('data', (m) => {
      if (!m) return;
      if (m.t === 'quality') {
        const v = viewers.get(conn.peer);
        if (!v || !PRESETS[m.value]) return;
        v.quality = m.value;
        applyQuality(v);
      } else if (m.t === 'media') {
        onRemoteMedia(conn.peer, m);
      } else if (m.t === 'hello') {
        // Penonton meminta status awal (pesan pertama dari kita kadang tidak sampai).
        sendInfo(conn);
        sendMedia(conn);
      } else {
        handleControl(m);
      }
    });
    conn.on('close', () => {
      const v = viewers.get(conn.peer);
      if (v && v.conn === conn) {
        ['call', 'micCall', 'camCall'].forEach((k) => v[k] && v[k].close());
        viewers.delete(conn.peer);
        known.delete(conn.peer);
        removeTile(conn.peer);
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
    peer.on('call', onCall);
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
