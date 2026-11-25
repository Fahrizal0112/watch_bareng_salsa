// Helper mic dan kamera, dipakai halaman host dan penonton.
// Mic dan kamera sengaja dikirim lewat panggilan terpisah: menyalakan atau mematikan
// salah satunya tidak perlu negosiasi ulang, dan mematikan berarti perangkat benar-benar dilepas.
window.wtMedia = {
  acquire(kind) {
    const constraints =
      kind === 'mic'
        ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
        : { video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 }, facingMode: 'user' } };
    return navigator.mediaDevices.getUserMedia(constraints);
  },
  stop(stream) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  },
  errorText(kind, err) {
    const what = kind === 'mic' ? 'mikrofon' : 'kamera';
    if (!navigator.mediaDevices) return `Browser ini tidak mengizinkan akses ${what} (butuh HTTPS).`;
    if (err && err.name === 'NotAllowedError') return `Izin ${what} ditolak. Izinkan lewat ikon gembok di address bar.`;
    if (err && err.name === 'NotFoundError') return `Tidak ada ${what} yang terdeteksi.`;
    return `Tidak bisa memakai ${what}: ${(err && err.name) || 'error'}.`;
  },
};
