// Jalan di semua halaman dan frame (isolated world), dan hanya melakukan dua hal:
// 1) memberi tahu background kalau ada video di tab ini (sedang diputar, atau sudah siap),
// 2) mengoper perintah dari background ke player-main.js lewat window.postMessage
//    (player-main.js jalan di "main world" supaya bisa mengakses API pemutar situs).
let lastReport = 0;
function report(played) {
  const now = Date.now();
  if (played ? now - lastReport < 2000 : false) return;
  if (played) lastReport = now;
  try {
    chrome.runtime.sendMessage({ type: 'video-active', played });
  } catch {}
}

// Abaikan video kecil atau muted (biasanya iklan, preview, atau latar halaman).
function isRealVideo(v) {
  return v instanceof HTMLVideoElement && !v.muted && v.clientWidth >= 320 && v.clientHeight >= 180;
}

['play', 'playing'].forEach((ev) =>
  document.addEventListener(ev, (e) => isRealVideo(e.target) && report(true), true)
);

// Catat video yang sudah ada saat script dipasang (termasuk yang sedang di-pause), supaya
// tab ini tetap ditemukan walau videonya belum pernah diputar sejak ekstensi dimuat.
function scan() {
  const vids = [...document.querySelectorAll('video')].filter(isRealVideo);
  if (vids.length) report(vids.some((v) => !v.paused));
}
scan();
window.addEventListener('load', scan);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.cmd) window.postMessage({ source: 'wt-to-main', cmd: msg.cmd, ms: msg.ms }, '*');
});
