// Jalan di semua halaman dan frame (isolated world), dan hanya melakukan dua hal:
// 1) memberi tahu background kalau ada video yang sedang diputar di tab ini,
// 2) mengoper perintah dari background ke player-main.js lewat window.postMessage
//    (player-main.js jalan di "main world" supaya bisa mengakses API pemutar situs).
let lastReport = 0;
function report() {
  const now = Date.now();
  if (now - lastReport < 2000) return;
  lastReport = now;
  try {
    chrome.runtime.sendMessage({ type: 'video-active' });
  } catch {}
}

// Abaikan video kecil atau muted (biasanya iklan, preview, atau latar halaman).
function isRealVideo(v) {
  return v instanceof HTMLVideoElement && !v.muted && v.clientWidth >= 320 && v.clientHeight >= 180;
}

['play', 'playing'].forEach((ev) =>
  document.addEventListener(ev, (e) => isRealVideo(e.target) && report(), true)
);
window.addEventListener('load', () => {
  if ([...document.querySelectorAll('video')].some((v) => !v.paused && isRealVideo(v))) report();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.cmd) window.postMessage({ source: 'wt-to-main', cmd: msg.cmd, ms: msg.ms }, '*');
});
