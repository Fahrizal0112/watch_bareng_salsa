// Jalan di main world tab Netflix. Mengontrol player lewat API internal Netflix.
// Catatan: Netflix menolak `video.currentTime = ...` (error M7375), jadi seek
// harus lewat API player mereka.
(() => {
  const getPlayer = () => {
    try {
      const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const id = vp.getAllPlayerSessionIds().find((s) => s.startsWith('watch-'));
      return id ? vp.getVideoPlayerBySessionId(id) : null;
    } catch {
      return null;
    }
  };
  const video = () => document.querySelector('video');

  const isPaused = () => {
    const v = video();
    return v ? v.paused : false;
  };
  const play = () => {
    const p = getPlayer();
    if (p) p.play();
    else video()?.play();
  };
  const pause = () => {
    const p = getPlayer();
    if (p) p.pause();
    else video()?.pause();
  };

  // Tombol di control bar Netflix baru ada di DOM kalau kontrol sedang tampil,
  // jadi "bangunkan" dulu dengan mousemove sebelum mencari tombolnya.
  const wakeControls = () => {
    const target = document.querySelector('.watch-video--player-view') || document.body;
    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 300 }));
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

  const actions = {
    toggle: () => (isPaused() ? play() : pause()),
    play,
    pause,
    seek: (ms) => {
      const p = getPlayer();
      if (!p) return;
      const dur = p.getDuration();
      const target = Math.min(Math.max(p.getCurrentTime() + ms, 0), Math.max(dur - 1000, 0));
      p.seek(target);
    },
    next: () => {
      wakeControls();
      setTimeout(
        () =>
          clickFirst([
            '[data-uia="next-episode-seamless-button"]',
            '[data-uia="next-episode-seamless-button-draining"]',
            '[data-uia="control-next"]',
          ]),
        200
      );
    },
    'skip-intro': () =>
      clickFirst(['[data-uia="player-skip-intro"]', '[data-uia="player-skip-recap"]']),
  };

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'wt-to-main') return;
    const fn = actions[e.data.cmd];
    if (!fn) return;
    try {
      fn(Number(e.data.ms) || 0);
    } catch (err) {
      console.warn('[watch-together]', err);
    }
  });
})();
