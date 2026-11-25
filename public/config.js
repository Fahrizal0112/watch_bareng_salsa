// Konfigurasi opsional. Default-nya sudah jalan untuk kebanyakan jaringan.
window.WT_CONFIG = {
  // Server STUN. Kalau koneksi gagal di jaringan tertentu (NAT ketat),
  // tambahkan server TURN, contoh:
  // { urls: 'turn:turn.contoh.com:3478', username: 'user', credential: 'pass' }
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],

  // Signaling memakai server publik PeerJS (0.peerjs.com) secara default.
  // Kalau mau server sendiri, isi ini (lihat README):
  // peerServer: { host: 'peer.contoh.com', port: 443, path: '/', secure: true },
};
