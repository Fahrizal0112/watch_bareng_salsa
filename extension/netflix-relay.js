// Jalan di tab Netflix (isolated world). Skrip utama perlu jalan di "main world"
// untuk mengakses player Netflix, jadi perintah dioper lewat window.postMessage.
chrome.runtime.onMessage.addListener((msg) => {
  window.postMessage({ source: 'wt-to-main', cmd: msg.cmd, ms: msg.ms }, location.origin);
});
