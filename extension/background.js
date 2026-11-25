// Memilih tab video yang tepat lalu meneruskan perintah ke sana.
// Tab dipilih dari: sedang bersuara, atau paling baru memutar video.
const KEY = 'videoTabs';

async function markActive(tabId) {
  const s = await chrome.storage.session.get(KEY);
  const m = s[KEY] || {};
  m[tabId] = Date.now();
  await chrome.storage.session.set({ [KEY]: m });
}

async function pickTarget(excludeTabId) {
  const [tabs, s] = await Promise.all([chrome.tabs.query({}), chrome.storage.session.get(KEY)]);
  const stamps = s[KEY] || {};
  const candidates = tabs
    .filter((t) => t.id !== excludeTabId && /^https?:/.test(t.url || ''))
    .map((t) => ({ tab: t, ts: stamps[t.id] || 0, audible: !!t.audible }))
    .filter((c) => c.audible || c.ts > 0);
  candidates.sort((a, b) => Number(b.audible) - Number(a.audible) || b.ts - a.ts);
  return candidates.length ? candidates[0].tab : null;
}

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
    markActive(sender.tab.id).then(() => sendResponse({}));
    return true;
  }

  if (msg.type === 'ping' || msg.type === 'cmd') {
    (async () => {
      const target = await pickTarget(sender.tab.id);
      if (msg.type === 'cmd' && target) {
        try {
          // Tanpa frameId: dikirim ke semua frame di tab, yang punya video akan bereaksi.
          await chrome.tabs.sendMessage(target.id, { cmd: msg.cmd, ms: msg.ms });
        } catch {
          // Tab dibuka sebelum ekstensi dipasang: perlu di-refresh.
        }
      }
      let site = null;
      if (target) {
        try { site = new URL(target.url).hostname.replace(/^www\./, ''); } catch {}
      }
      sendResponse({ installed: true, hasTarget: !!target, site });
    })();
    return true;
  }
});
