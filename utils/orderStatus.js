// Central definition of the order/status workflow used by both the
// customer-facing order tracker and the admin/staff "Pesanan Masuk" pages.
//
// Flow for online orders (channel === 'online'):
//   pending -> diproses -> diantar -> menunggu_konfirmasi_selesai -> selesai
//                 (admin)    (staff)          (staff)                (admin)
// Any of the early stages can be cancelled by an admin -> dibatalkan.
//
// Walk-in POS sales (channel === 'pos') are created already completed
// (status: 'selesai') since the transaction happens face to face.

const STATUS = {
  pending: {
    key: 'pending',
    label: 'Menunggu Konfirmasi',
    short: 'Menunggu konfirmasi admin',
    badge: 'warning',
    text: 'dark',
    icon: 'fa-hourglass-half'
  },
  diproses: {
    key: 'diproses',
    label: 'Diproses',
    short: 'Pesanan sedang disiapkan',
    badge: 'info',
    text: 'dark',
    icon: 'fa-box-open'
  },
  diantar: {
    key: 'diantar',
    label: 'Sedang Diantar',
    short: 'Dalam perjalanan ke tujuan',
    badge: 'primary',
    text: 'white',
    icon: 'fa-truck-fast'
  },
  menunggu_konfirmasi_selesai: {
    key: 'menunggu_konfirmasi_selesai',
    label: 'Menunggu Konfirmasi Admin',
    short: 'Staf menandai selesai, menunggu konfirmasi admin',
    badge: 'secondary',
    text: 'white',
    icon: 'fa-clipboard-check'
  },
  selesai: {
    key: 'selesai',
    label: 'Selesai',
    short: 'Pesanan telah selesai',
    badge: 'success',
    text: 'white',
    icon: 'fa-circle-check'
  },
  dibatalkan: {
    key: 'dibatalkan',
    label: 'Dibatalkan',
    short: 'Pesanan dibatalkan',
    badge: 'danger',
    text: 'white',
    icon: 'fa-circle-xmark'
  }
};

// Ordered timeline steps for the visual tracker (cancellation excluded).
const TIMELINE_STEPS = ['pending', 'diproses', 'diantar', 'menunggu_konfirmasi_selesai', 'selesai'];

function getStatusMeta(status) {
  return STATUS[status] || STATUS.selesai;
}

function timelineIndex(status) {
  return TIMELINE_STEPS.indexOf(status);
}

// Append an entry to a sale's status_history (mutates and returns the entry).
function buildHistoryEntry(status, note, actorName) {
  return {
    status,
    note: note || '',
    by: actorName || 'System',
    at: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------
// Payment methods & payment status — used by the online shop checkout.
// POS (walk-in) sales are paid face-to-face and don't use this workflow.
//
// Payment flow:
//   COD              -> 'cod' from checkout, auto flips to 'lunas' when
//                        the order is marked 'selesai' (cash collected).
//   Transfer/QRIS/
//   E-Wallet         -> 'menunggu_pembayaran' from checkout, customer
//                        clicks "Saya Sudah Bayar" -> 'menunggu_konfirmasi',
//                        admin/staff confirms receipt -> 'lunas'.
// ---------------------------------------------------------------------

const PAYMENT_METHODS = [
  {
    key: 'transfer_bank',
    label: 'Transfer Bank',
    icon: 'fa-building-columns',
    requiresConfirmation: true,
    instructions: 'Transfer ke rekening BCA 1234567890 a.n. SIMIP Store, lalu klik "Saya Sudah Bayar" di halaman lacak pesanan.'
  },
  {
    key: 'qris',
    label: 'QRIS',
    icon: 'fa-qrcode',
    requiresConfirmation: true,
    instructions: 'Pindai kode QRIS pada halaman lacak pesanan menggunakan aplikasi e-wallet atau m-banking apa saja, lalu klik "Saya Sudah Bayar".'
  },
  {
    key: 'ewallet',
    label: 'E-Wallet (GoPay/OVO/DANA)',
    icon: 'fa-wallet',
    requiresConfirmation: true,
    instructions: 'Kirim pembayaran ke nomor 0812-0000-1234 (GoPay/OVO/DANA), lalu klik "Saya Sudah Bayar".'
  },
  {
    key: 'cod',
    label: 'COD (Bayar di Tempat)',
    icon: 'fa-hand-holding-dollar',
    requiresConfirmation: false,
    instructions: 'Siapkan uang pas sejumlah total pesanan. Pembayaran dilakukan tunai saat barang diterima.'
  }
];

const PAYMENT_STATUS = {
  menunggu_pembayaran: {
    key: 'menunggu_pembayaran',
    label: 'Menunggu Pembayaran',
    badge: 'warning',
    text: 'dark',
    icon: 'fa-clock'
  },
  menunggu_konfirmasi: {
    key: 'menunggu_konfirmasi',
    label: 'Menunggu Konfirmasi',
    badge: 'info',
    text: 'dark',
    icon: 'fa-hourglass-half'
  },
  lunas: {
    key: 'lunas',
    label: 'Lunas',
    badge: 'success',
    text: 'white',
    icon: 'fa-circle-check'
  },
  cod: {
    key: 'cod',
    label: 'Bayar di Tempat',
    badge: 'secondary',
    text: 'white',
    icon: 'fa-hand-holding-dollar'
  }
};

function getPaymentMethod(key) {
  return PAYMENT_METHODS.find(m => m.key === key) || null;
}

function getPaymentStatusMeta(status) {
  return PAYMENT_STATUS[status] || PAYMENT_STATUS.menunggu_pembayaran;
}

// Determine the initial payment_status for a freshly created online order.
function initialPaymentStatus(paymentMethodKey) {
  return paymentMethodKey === 'cod' ? 'cod' : 'menunggu_pembayaran';
}

module.exports = {
  STATUS, TIMELINE_STEPS, getStatusMeta, timelineIndex, buildHistoryEntry,
  PAYMENT_METHODS, PAYMENT_STATUS, getPaymentMethod, getPaymentStatusMeta, initialPaymentStatus
};
