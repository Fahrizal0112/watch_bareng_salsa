// Memilih tab video yang tepat lalu meneruskan perintah ke sana.
// Urutan pilihan tab: sedang bersuara, paling baru diputar, paling baru terlihat punya video.
const KEY = 'videoTabs';

async function mark(tabId, played) {
  const s = await chrome.storage.session.get(KEY);
  const m = s[KEY] || {};
  const rec = m[tabId] || { play: 0, seen: 0 };
  const now = Date.now();
  rec.seen = now;
  if (played) rec.play = now;
  m[tabId] = rec;
  await chrome.storage.session.set({ [KEY]: m });
}

async function pickTarget(excludeTabId) {
  const [tabs, s] = await Promise.all([chrome.tabs.query({}), chrome.storage.session.get(KEY)]);
  const stamps = s[KEY] || {};
  const candidates = tabs
    .filter((t) => t.id !== excludeTabId && /^https?:/.test(t.url || ''))
    .map((t) => ({ tab: t, rec: stamps[t.id] || { play: 0, seen: 0 }, audible: !!t.audible }))
    .filter((c) => c.audible || c.rec.seen > 0);
  candidates.sort(
    (a, b) => Number(b.audible) - Number(a.audible) || b.rec.play - a.rec.play || b.rec.seen - a.rec.seen
  );
  return candidates.length ? candidates[0].tab : null;
}

// Chrome tidak memasang script ekstensi ke tab yang sudah terbuka saat ekstensi dipasang atau
// di-reload. Jadi kita pasang sendiri supaya tidak perlu refresh tab satu per satu.
async function injectIntoExistingTabs() {
  const manifest = chrome.runtime.getManifest();
  const bridgeMatches = manifest.content_scripts[0].matches;

  const bridgeTabs = await chrome.tabs.query({ url: bridgeMatches });
  for (const t of bridgeTabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['bridge.js'] });
    } catch {}
  }

  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (!/^https?:/.test(t.url || '')) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: t.id, allFrames: true },
        files: ['player-relay.js'],
      });
      await chrome.scripting.executeScript({
        target: { tabId: t.id, allFrames: true },
        files: ['player-main.js'],
        world: 'MAIN',
      });
    } catch {
      // Halaman yang tidak boleh disentuh ekstensi (misalnya Chrome Web Store): abaikan.
    }
  }
}
chrome.runtime.onInstalled.addListener(() => {
  injectIntoExistingTabs();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await chrome.storage.session.get(KEY);
  if (s[KEY] && s[KEY][tabId]) {
    delete s[KEY][tabId];
    await chrome.storage.session.set(s);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Hanya terima pesan dari content script ekstensi ini sendiri.
  // Halaman yang boleh mengirim perintah (bridge.js) ditentukan oleh "matches" di manifest.json.
  if (!sender.tab || sender.id !== chrome.runtime.id || !msg) return;

  if (msg.type === 'video-active') {
    mark(sender.tab.id, !!msg.played).then(() => sendResponse({}));
    return true;
  }

  if (msg.type === 'ping' || msg.type === 'cmd') {
    (async () => {
      const target = await pickTarget(sender.tab.id);
      let delivered = null;
      if (msg.type === 'cmd' && target) {
        try {
          // Tanpa frameId: dikirim ke semua frame di tab, yang punya video akan bereaksi.
          await chrome.tabs.sendMessage(target.id, {
            cmd: msg.cmd,
            ms: msg.ms,
            x: msg.x,
            y: msg.y,
            id: msg.id || crypto.randomUUID(),
          });
          delivered = true;
        } catch {
          delivered = false; // tidak ada script ekstensi di tab itu
        }
      }
      let site = null;
      if (target) {
        try { site = new URL(target.url).hostname.replace(/^www\./, ''); } catch {}
      }
      sendResponse({ installed: true, hasTarget: !!target, site, delivered });
    })();
    return true;
  }
});
