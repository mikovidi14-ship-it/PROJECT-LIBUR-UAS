const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireRole, requireStaffOrAdmin } = require('../middleware/auth');
const { getStatusMeta, timelineIndex, TIMELINE_STEPS, buildHistoryEntry } = require('../utils/orderStatus');
const { getPaymentMethod, getPaymentStatusMeta } = require('../utils/orderStatus');

function decorate(sale) {
  return {
    ...sale,
    statusMeta: getStatusMeta(sale.status),
    paymentMethod: sale.payment_method ? getPaymentMethod(sale.payment_method) : null,
    paymentStatusMeta: sale.payment_status ? getPaymentStatusMeta(sale.payment_status) : null,
    customer: sale.customer_id ? db.get('customers').find({ id: sale.customer_id }).value() : null
  };
}

function pushHistory(saleId, status, note, actorName) {
  const sale = db.get('sales').find({ id: saleId }).value();
  const history = (sale.status_history || []).concat(buildHistoryEntry(status, note, actorName));
  db.get('sales').find({ id: saleId }).assign({ status: status, status_history: history }).write();
}

// ===== Incoming orders list (admin + staff) =====
// Finished orders (selesai/dibatalkan) can be archived off this list so it
// doesn't pile up — the record itself is kept (not deleted), so it still
// shows up in Penjualan (/sales), the dashboard, and reports.
router.get('/orders', requireAuth, requireStaffOrAdmin, (req, res) => {
  const filter = req.query.status || 'all';
  const allOnline = db.get('sales').value().filter(s => s.channel === 'online');
  const activeOnline = allOnline.filter(s => !s.archived);
  const archivedOnline = allOnline.filter(s => s.archived);

  const counts = {
    all: activeOnline.length,
    pending: activeOnline.filter(s => s.status === 'pending').length,
    diproses: activeOnline.filter(s => s.status === 'diproses').length,
    diantar: activeOnline.filter(s => s.status === 'diantar').length,
    menunggu_konfirmasi_selesai: activeOnline.filter(s => s.status === 'menunggu_konfirmasi_selesai').length,
    selesai: activeOnline.filter(s => s.status === 'selesai').length,
    dibatalkan: activeOnline.filter(s => s.status === 'dibatalkan').length,
    arsip: archivedOnline.length
  };

  let sales;
  if (filter === 'arsip') {
    sales = archivedOnline;
  } else if (filter !== 'all') {
    sales = activeOnline.filter(s => s.status === filter);
  } else {
    sales = activeOnline;
  }

  sales = sales
    .sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date))
    .map(decorate);

  res.render('admin/orders-list', { title: 'Pesanan Masuk', sales, filter, counts });
});

// ===== Order detail + actions (admin + staff, buttons vary by role) =====
router.get('/orders/:id', requireAuth, requireStaffOrAdmin, (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, channel: 'online' }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });

  res.render('admin/order-detail', {
    title: 'Detail Pesanan',
    sale: decorate(sale),
    steps: TIMELINE_STEPS.map(getStatusMeta),
    currentStepIndex: timelineIndex(sale.status),
    paymentMethod: sale.payment_method ? getPaymentMethod(sale.payment_method) : null,
    paymentStatusMeta: sale.payment_status ? getPaymentStatusMeta(sale.payment_status) : null,
    error: null
  });
});

// Admin confirms a newly-arrived order -> diproses
// Gated on payment: online orders paid via transfer/QRIS/e-wallet must be
// 'lunas' first; COD orders can be confirmed right away (paid on delivery).
router.post('/orders/:id/confirm', requireAuth, requireRole('admin'), (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, channel: 'online' }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });
  if (sale.status !== 'pending') return res.redirect(`/orders/${sale.id}`);

  const isCod = sale.payment_method === 'cod';
  if (!isCod && sale.payment_status !== 'lunas') {
    return res.render('admin/order-detail', {
      title: 'Detail Pesanan',
      sale: decorate(sale),
      steps: TIMELINE_STEPS.map(getStatusMeta),
      currentStepIndex: timelineIndex(sale.status),
      paymentMethod: sale.payment_method ? getPaymentMethod(sale.payment_method) : null,
      paymentStatusMeta: sale.payment_status ? getPaymentStatusMeta(sale.payment_status) : null,
      error: 'Pesanan belum bisa dikonfirmasi karena pembayaran belum lunas. Konfirmasi pembayaran terlebih dahulu.'
    });
  }

  pushHistory(sale.id, 'diproses', 'Pesanan dikonfirmasi admin, mulai diproses', req.user.name || req.user.username);
  res.redirect(`/orders/${sale.id}`);
});

// Admin/staff confirms that payment (transfer/QRIS/e-wallet) has been received
router.post('/orders/:id/confirm-payment', requireAuth, requireStaffOrAdmin, (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, channel: 'online' }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });

  if (sale.payment_status === 'menunggu_konfirmasi' || sale.payment_status === 'menunggu_pembayaran') {
    db.get('sales').find({ id: sale.id }).assign({ payment_status: 'lunas' }).write();
  }
  res.redirect(`/orders/${sale.id}`);
});

// Admin cancels a pending order
router.post('/orders/:id/cancel', requireAuth, requireRole('admin'), (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, channel: 'online' }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });
  if (!['pending', 'diproses'].includes(sale.status)) return res.redirect(`/orders/${sale.id}`);

  // Return the reserved stock back to inventory since the order never completed
  sale.items.forEach(item => {
    const product = db.get('products').find({ id: item.product_id }).value();
    if (product) {
      db.get('products').find({ id: item.product_id }).assign({ stock: product.stock + item.qty }).write();
    }
  });

  const reason = (req.body.reason || '').trim();
  pushHistory(sale.id, 'dibatalkan', reason ? `Pesanan dibatalkan: ${reason}` : 'Pesanan dibatalkan admin', req.user.name || req.user.username);
  res.redirect(`/orders/${sale.id}`);
});

// Staff (or admin) marks the order as out for delivery, recording destination + courier
router.post('/orders/:id/ship', requireAuth, requireStaffOrAdmin, (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, channel: 'online' }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });
  if (sale.status !== 'diproses') return res.redirect(`/orders/${sale.id}`);

  const destination = (req.body.destination || sale.shipping_address || '').trim();
  const courier = (req.body.courier || '').trim();

  if (!destination) {
    return res.render('admin/order-detail', {
      title: 'Detail Pesanan',
      sale: decorate(sale),
      steps: TIMELINE_STEPS.map(getStatusMeta),
      currentStepIndex: timelineIndex(sale.status),
      error: 'Alamat tujuan pengiriman wajib diisi sebelum mengirim pesanan.'
    });
  }

  db.get('sales').find({ id: sale.id }).assign({ shipping_address: destination, courier: courier || null }).write();
  pushHistory(sale.id, 'diantar', courier ? `Pesanan dikirim via ${courier} ke ${destination}` : `Pesanan dalam perjalanan ke ${destination}`, req.user.name || req.user.username);
  res.redirect(`/orders/${sale.id}`);
});

// Staff (or admin) marks delivery as done, sending it to admin for final confirmation
router.post('/orders/:id/complete', requireAuth, requireStaffOrAdmin, (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, channel: 'online' }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });
  if (sale.status !== 'diantar') return res.redirect(`/orders/${sale.id}`);

  pushHistory(sale.id, 'menunggu_konfirmasi_selesai', 'Pesanan sudah sampai tujuan, menunggu konfirmasi admin', req.user.name || req.user.username);
  res.redirect(`/orders/${sale.id}`);
});

// Admin gives the final confirmation -> customer now sees "Selesai"
router.post('/orders/:id/finish', requireAuth, requireRole('admin'), (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, channel: 'online' }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });
  if (sale.status !== 'menunggu_konfirmasi_selesai') return res.redirect(`/orders/${sale.id}`);

  // COD payment is collected at the point of delivery — settle it now.
  if (sale.payment_method === 'cod') {
    db.get('sales').find({ id: sale.id }).assign({ payment_status: 'lunas' }).write();
  }

  pushHistory(sale.id, 'selesai', 'Pesanan dikonfirmasi selesai oleh admin', req.user.name || req.user.username);
  res.redirect(`/orders/${sale.id}`);
});

// Admin/staff archives a finished order (selesai/dibatalkan) so it no
// longer clutters "Pesanan Masuk". The sale record is NOT deleted from the
// database — it's only hidden from this list — so it still counts toward
// Penjualan, laporan, dan dashboard seperti biasa.
router.post('/orders/:id/archive', requireAuth, requireStaffOrAdmin, (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, channel: 'online' }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });
  if (!['selesai', 'dibatalkan'].includes(sale.status)) return res.redirect(`/orders/${sale.id}`);

  db.get('sales').find({ id: sale.id }).assign({
    archived: true,
    archived_at: new Date().toISOString(),
    archived_by: req.user.name || req.user.username
  }).write();

  res.redirect('/orders');
});

// Restore a previously archived order back into the active "Pesanan Masuk" list
router.post('/orders/:id/restore', requireAuth, requireStaffOrAdmin, (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, channel: 'online' }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });

  db.get('sales').find({ id: sale.id }).assign({ archived: false }).write();
  res.redirect('/orders?status=arsip');
});

module.exports = router;
