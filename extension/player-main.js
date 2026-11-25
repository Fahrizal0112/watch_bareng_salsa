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
    },
    'youtube.com': {
      next: ['.ytp-next-button'],
      skip: ['.ytp-skip-ad-button', '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern'],
    },
    'primevideo.com': {
      next: ['.atvwebplayersdk-nextupcard-button'],
      skip: ['.atvwebplayersdk-skipelement-button'],
    },
  };
  const site = () => {
    const h = location.hostname;
    const key = Object.keys(SITES).find((k) => h === k || h.endsWith('.' + k));
    return key ? SITES[key] : { next: [], skip: [] };
  };
  const NEXT_RE = /next episode|episode (berikut|selanjut)|berikutnya|selanjutnya|^next$|^next\b/i;
  const SKIP_RE = /skip (intro|recap|credits|opening|ads?)|lewati( intro| ringkasan| pembuka| iklan)?|^skip$/i;

  // ---- Aksi ----
  const actions = {
    play() {
      const np = netflixPlayer();
      if (np) return np.play();
      const v = pickVideo();
      if (v) v.play();
    },
    pause() {
      const np = netflixPlayer();
      if (np) return np.pause();
      const v = pickVideo();
      if (v) v.pause();
    },
    toggle() {
      const v = pickVideo();
      if (v && v.paused) actions.play();
      else actions.pause();
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

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'wt-to-main') return;
    const fn = actions[e.data.cmd];
    // Frame tanpa video diabaikan, supaya tombol di iklan/iframe lain tidak ikut tertekan.
    if (!fn || !(pickVideo() || netflixPlayer())) return;
    try {
      fn(Number(e.data.ms) || 0);
    } catch (err) {
      console.warn('[watch-together]', err);
    }
  });
})();
