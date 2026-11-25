// Jalan di main world setiap frame. Mengontrol video lewat elemen <video> standar,
// dengan penanganan khusus untuk Netflix (yang menolak `video.currentTime = ...`,
// error M7375, jadi seek harus lewat API player mereka).
(() => {
  // ---- Mencari video ----
  const pickVideo = () => {
    const vids = [...document.querySelectorAll('video')].filter(
      (v) => v.clientWidth >= 200 && v.clientHeight >= 100
    );
    vids.sort(
      (a, b) =>
        Number(!b.paused) - Number(!a.paused) ||
        b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight
    );
    return vids[0] || null;
  };

  const netflixPlayer = () => {
    try {
      const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const id = vp.getAllPlayerSessionIds().find((s) => s.startsWith('watch-'));
      return id ? vp.getVideoPlayerBySessionId(id) : null;
    } catch {
      return null;
    }
  };

  // ---- Tombol (next, skip) ----
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clickFirst = (selectors) => {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) {
        el.click();
        return true;
      }
    }
    return false;
  };
  // Cadangan untuk situs yang tidak dikenal: cari tombol dari label/teksnya.
  const clickByLabel = (re) => {
    const els = document.querySelectorAll('button, [role="button"], a');
    for (const el of els) {
      const text = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '';
      if (text.length <= 40 && re.test(text) && visible(el)) {
        el.click();
        return true;
      }
    }
    return false;
  };
  // Tombol di control bar sering baru ada di DOM saat kontrol tampil.
  const wakeControls = () => {
    const v = pickVideo();
    const target = (v && v.parentElement) || document.body;
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 300 }));
  };

  // Selector per situs. Belum tentu terus berlaku, situs bisa mengubahnya kapan saja.
  const SITES = {
    'netflix.com': {
      next: [
        '[data-uia="next-episode-seamless-button"]',
        '[data-uia="next-episode-seamless-button-draining"]',
        '[data-uia="control-next"]',
      ],
      skip: ['[data-uia="player-skip-intro"]', '[data-uia="player-skip-recap"]'],
      playpause: ['[data-uia="control-play-pause-pause"]', '[data-uia="control-play-pause-play"]'],
    },
    'youtube.com': {
      next: ['.ytp-next-button'],
      skip: ['.ytp-skip-ad-button', '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern'],
      playpause: ['.ytp-play-button'],
    },
    'primevideo.com': {
      next: ['.atvwebplayersdk-nextupcard-button'],
      skip: ['.atvwebplayersdk-skipelement-button'],
      playpause: ['.atvwebplayersdk-playpause-button'],
    },
  };
  const site = () => {
    const h = location.hostname;
    const key = Object.keys(SITES).find((k) => h === k || h.endsWith('.' + k));
    return { next: [], skip: [], playpause: [], ...(key ? SITES[key] : {}) };
  };
  const PLAY_RE = /^(play|putar|lanjut|resume)\b/i;
  const PAUSE_RE = /^(pause|jeda)\b/i;
  const NEXT_RE = /next episode|episode (berikut|selanjut)|berikutnya|selanjutnya|^next$|^next\b/i;
  const SKIP_RE = /skip (intro|recap|credits|opening|ads?)|lewati( intro| ringkasan| pembuka| iklan)?|^skip$/i;

  // ---- Play / pause ----
  // Memanggil play()/pause() belum tentu berefek (API situs bisa berubah, atau pemutar menolak
  // panggilan dari script), jadi hasilnya diperiksa dan dicoba cara lain secara bertingkat:
  // API Netflix -> elemen <video> -> tombol milik situs -> klik videonya.
  // Cara yang berhasil dicatat di console (filter "watch-together") untuk membantu melacak masalah.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function setPlaying(want) {
    const v = pickVideo();
    if (!v) return;
    const reached = () => !v.paused === want;
    if (reached()) return;
    const label = want ? 'play' : 'pause';

    const attempt = async (name, fn) => {
      try {
        await fn();
      } catch (err) {
        console.debug('[watch-together]', label, name, 'error:', err && err.name);
      }
      await sleep(300);
      const ok = reached();
      console.debug('[watch-together]', label, name, ok ? 'berhasil' : 'tidak berefek');
      return ok;
    };

    const np = netflixPlayer();
    if (np && (await attempt('api-netflix', () => (want ? np.play() : np.pause())))) return;
    if (await attempt('elemen-video', () => (want ? v.play() : v.pause()))) return;
    wakeControls();
    await sleep(200);
    if (
      await attempt('tombol-situs', () => {
        // Tombol situs yang dikenal berupa satu tombol toggle. Untuk situs lain, cari tombol
        // yang labelnya sesuai tujuan (tombol "Play" untuk memutar, "Pause" untuk menjeda).
        if (!clickFirst(site().playpause)) clickByLabel(want ? PLAY_RE : PAUSE_RE);
      })
    ) return;
    await attempt('klik-video', () => v.click());
  }

  // ---- Aksi ----
  const actions = {
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle() {
      const v = pickVideo();
      if (v) return setPlaying(v.paused);
    },
    seek(ms) {
      const np = netflixPlayer();
      if (np) {
        const dur = np.getDuration();
        return np.seek(Math.min(Math.max(np.getCurrentTime() + ms, 0), Math.max(dur - 1000, 0)));
      }
      const v = pickVideo();
      if (!v) return;
      // Batas akhir: durasi untuk video biasa, ujung rentang seekable untuk siaran langsung.
      const end = Number.isFinite(v.duration)
        ? v.duration
        : v.seekable.length
          ? v.seekable.end(v.seekable.length - 1)
          : Infinity;
      const wanted = Math.max(v.currentTime + ms / 1000, 0);
      v.currentTime = Number.isFinite(end) ? Math.min(wanted, Math.max(end - 0.5, 0)) : wanted;
    },
    // Klik di posisi (x, y) = pecahan 0..1 dari area halaman. Dimaksudkan untuk tombol yang
    // hanya berupa gambar bagi penonton, misalnya tombol play besar di tengah video.
    click(_ms, d) {
      if (window !== window.top) return; // koordinat dari penonton relatif ke halaman utama
      const x = Number(d && d.x);
      const y = Number(d && d.y);
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return;
      const cx = x * window.innerWidth;
      const cy = y * window.innerHeight;
      const el = document.elementFromPoint(cx, cy);
      if (!el || el.tagName === 'IFRAME') return;
      const base = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
      const seq = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      for (const type of seq) {
        el.dispatchEvent(
          type.startsWith('pointer')
            ? new PointerEvent(type, { ...base, pointerType: 'mouse', isPrimary: true })
            : new MouseEvent(type, base)
        );
      }
      console.debug('[watch-together] klik di', el.tagName, el.className && String(el.className).slice(0, 40));
    },
    next() {
      wakeControls();
      setTimeout(() => {
        if (!clickFirst(site().next)) clickByLabel(NEXT_RE);
      }, 200);
    },
    'skip-intro'() {
      if (!clickFirst(site().skip)) clickByLabel(SKIP_RE);
    },
  };

  const onMessage = (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'wt-to-main') return;
    const fn = actions[e.data.cmd];
    // Frame tanpa video diabaikan, supaya tombol di iklan/iframe lain tidak ikut tertekan.
    if (!fn || !(pickVideo() || netflixPlayer())) return;

    // Perintah yang sama (id sama) hanya dieksekusi sekali. Kalau script ekstensi sempat
    // terpasang dobel di tab ini, "toggle" yang jalan dua kali akan saling membatalkan.
    const id = e.data.id;
    if (id) {
      const seen = (window.__wtSeen = window.__wtSeen || new Set());
      if (seen.has(id)) return;
      seen.add(id);
      setTimeout(() => seen.delete(id), 10000);
    }

    Promise.resolve()
      .then(() => fn(Number(e.data.ms) || 0, e.data))
      .catch((err) => console.warn('[watch-together]', err));
  };
  // Script ini bisa terpasang lebih dari sekali di halaman yang sama (misalnya setelah ekstensi
  // di-reload). Buang pendengar lama supaya satu perintah tidak dieksekusi dua kali.
  if (window.__wtPlayerListener) window.removeEventListener('message', window.__wtPlayerListener);
  window.__wtPlayerListener = onMessage;
  window.addEventListener('message', onMessage);
})();
