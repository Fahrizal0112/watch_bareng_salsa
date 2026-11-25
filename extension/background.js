// Mencari tab Netflix lalu meneruskan perintah ke sana.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Hanya terima pesan dari content script ekstensi ini sendiri (bridge.js).
  // Halaman mana yang boleh dijembatani ditentukan oleh "matches" di manifest.json.
  if (!sender.tab || sender.id !== chrome.runtime.id) return;

  (async () => {
    const tabs = await chrome.tabs.query({ url: '*://*.netflix.com/*' });
    const watching = tabs.find((t) => /\/watch\//.test(t.url || ''));
    const target = watching || tabs[0];

    if (msg.type === 'cmd' && target) {
      try {
        await chrome.tabs.sendMessage(target.id, { cmd: msg.cmd, ms: msg.ms });
      } catch {
        // Tab Netflix dibuka sebelum ekstensi dipasang: perlu di-refresh.
      }
    }
    sendResponse({ installed: true, netflix: tabs.length > 0, watching: !!watching });
  })();
  return true; // respon async
});
