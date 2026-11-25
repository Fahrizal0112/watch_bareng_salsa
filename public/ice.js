// Mengambil daftar server ICE. Urutan sumber:
// 1) /api/ice di Vercel (STUN + TURN dari layanan relay, kunci disimpan di environment Vercel)
// 2) iceServers di config.js (dev lokal, atau kalau /api/ice belum diatur)
window.wtIce = async function () {
  const cfg = window.WT_CONFIG || {};
  const hasTurn = (list) =>
    (list || []).some((s) => [].concat(s.urls || []).some((u) => /^turns?:/.test(u)));
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch('/api/ice', { cache: 'no-store', signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const j = await res.json();
      if (Array.isArray(j.iceServers) && j.iceServers.length) {
        return { iceServers: j.iceServers, turn: hasTurn(j.iceServers) };
      }
    }
  } catch {}
  return { iceServers: cfg.iceServers || [], turn: hasTurn(cfg.iceServers) };
};
