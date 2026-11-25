// Jalan di halaman host (localhost). Meneruskan pesan dari halaman ke background.
// Halaman hanya bisa mengirim perintah dari daftar putih; ini sengaja sempit.
const ALLOWED = new Set(['toggle', 'play', 'pause', 'seek', 'next', 'skip-intro']);

window.addEventListener('message', async (e) => {
  if (e.source !== window || !e.data || e.data.source !== 'wt-page') return;
  const { type, cmd, ms } = e.data;
  if (type !== 'ping' && !(type === 'cmd' && ALLOWED.has(cmd))) return;

  try {
    const res = await chrome.runtime.sendMessage({ type, cmd, ms: Number(ms) || 0 });
    window.postMessage({ source: 'wt-ext', type: 'status', ...res }, location.origin);
  } catch {
    // Ekstensi baru di-reload: konteks lama tidak valid, refresh halaman untuk memulihkan.
  }
});
