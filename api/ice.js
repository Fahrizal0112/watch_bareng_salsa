// Fungsi serverless Vercel: mengembalikan daftar server ICE untuk WebRTC.
// STUN selalu ada. TURN (relay) ditambahkan kalau salah satu layanan di bawah diatur lewat
// Environment Variables di Vercel, sehingga kunci tidak pernah tertulis di repo.
//
//   Metered    : METERED_APP (nama app, bagian depan <app>.metered.live) + METERED_API_KEY
//   Cloudflare : CF_TURN_KEY_ID + CF_TURN_API_TOKEN
//   Server sendiri (mis. coturn): TURN_URL (+ TURN_USER, TURN_PASS)
const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };
const TTL_SECONDS = 12 * 60 * 60;

async function fetchJson(url, options) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(url, { ...options, signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Mengembalikan hanya entri TURN (yang punya username/credential), atau [] kalau tidak ada.
async function getTurn(env) {
  if (env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN) {
    const j = await fetchJson(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CF_TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      }
    );
    // Port 53 bisa membuat ICE menunggu sampai timeout di browser, jadi dibuang.
    return (j.iceServers || [])
      .filter((s) => s.username && s.credential)
      .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }));
  }

  if (env.METERED_APP && env.METERED_API_KEY && /^[a-z0-9-]+$/i.test(env.METERED_APP)) {
    const list = await fetchJson(
      `https://${env.METERED_APP}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_API_KEY)}`
    );
    return (Array.isArray(list) ? list : []).filter((s) => s.username && s.credential);
  }

  if (env.TURN_URL) {
    return [{ urls: env.TURN_URL.split(',').map((u) => u.trim()), username: env.TURN_USER || '', credential: env.TURN_PASS || '' }];
  }
  return [];
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let turn = [];
  let error = null;
  try {
    turn = await getTurn(process.env);
  } catch (err) {
    // Layanan TURN bermasalah: tetap kembalikan STUN supaya situs tidak ikut mati.
    error = String((err && err.message) || err).slice(0, 80);
  }
  res.status(200).json({ iceServers: [STUN, ...turn], turn: turn.length > 0, error });
};
module.exports.getTurn = getTurn;
