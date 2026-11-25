// Jalan di halaman host (localhost). Meneruskan pesan dari halaman ke background.
// Halaman hanya bisa mengirim perintah dari daftar putih; ini sengaja sempit.
const ALLOWED = new Set(['toggle', 'play', 'pause', 'seek', 'next', 'skip-intro', 'click']);
const frac = (n) => (typeof n === 'number' && n >= 0 && n <= 1 ? n : undefined);

window.addEventListener('message', async (e) => {
  if (e.source !== window || !e.data || e.data.source !== 'wt-page') return;
  const { type, cmd, ms } = e.data;
  if (type !== 'ping' && !(type === 'cmd' && ALLOWED.has(cmd))) return;
  const id = typeof e.data.id === 'string' ? e.data.id.slice(0, 64) : undefined;
  const x = frac(e.data.x);
  const y = frac(e.data.y);
  if (cmd === 'click' && (x === undefined || y === undefined)) return;

  try {
    const res = await chrome.runtime.sendMessage({ type, cmd, ms: Number(ms) || 0, x, y, id });
    window.postMessage({ source: 'wt-ext', type: 'status', forType: type, ...res }, location.origin);
  } catch {
    // Ekstensi baru di-reload: konteks lama tidak valid, refresh halaman untuk memulihkan.
  }
});
