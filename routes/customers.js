const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireRole, requireStaffOrAdmin } = require('../middleware/auth');

router.get('/customers', requireAuth, requireStaffOrAdmin, (req, res) => {
  const customers = db.get('customers').value().map(c => {
    const totalBelanja = db.get('sales').value()
      .filter(s => s.customer_id === c.id)
      .reduce((sum, s) => sum + s.total, 0);
    const totalTransaksi = db.get('sales').value().filter(s => s.customer_id === c.id).length;
    return { ...c, totalBelanja, totalTransaksi };
  });
  res.render('customers', { title: 'Pelanggan', customers });
});

router.post('/customers/new', requireAuth, requireStaffOrAdmin, (req, res) => {
  const { name, phone, address } = req.body;
  if (name && name.trim()) {
    db.get('customers').push({
      id: uuid(),
      name: name.trim(),
      phone: phone || '-',
      address: address || '-',
      created_at: new Date().toISOString()
    }).write();
  }
  res.redirect('/customers');
});

// Quick-add used from within the "Penjualan Baru" form (AJAX, returns JSON)
router.post('/customers/quick-add', requireAuth, requireStaffOrAdmin, (req, res) => {
  const { name, phone, address } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama pelanggan wajib diisi.' });
  }
  const customer = {
    id: uuid(),
    name: name.trim(),
    phone: phone && phone.trim() ? phone.trim() : '-',
    address: address && address.trim() ? address.trim() : '-',
    created_at: new Date().toISOString()
  };
  db.get('customers').push(customer).write();
  res.json(customer);
});

router.get('/customers/:id', requireAuth, requireStaffOrAdmin, (req, res) => {
  const customer = db.get('customers').find({ id: req.params.id }).value();
  if (!customer) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Data pelanggan tidak ditemukan.' });

  const sales = db.get('sales').value()
    .filter(s => s.customer_id === customer.id)
    .sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));

  const totalBelanja = sales.reduce((sum, s) => sum + s.total, 0);
  const totalTransaksi = sales.length;
  const avgBelanja = totalTransaksi > 0 ? totalBelanja / totalTransaksi : 0;

  res.render('customer-detail', {
    title: `Pelanggan · ${customer.name}`,
    customer,
    sales,
    totalBelanja,
    totalTransaksi,
    avgBelanja
  });
});

router.post('/customers/:id/delete', requireAuth, requireRole('admin'), (req, res) => {
  const inUse = db.get('sales').find({ customer_id: req.params.id }).value();
  if (!inUse) {
    db.get('customers').remove({ id: req.params.id }).write();
  }
  res.redirect('/customers');
});

module.exports = router;
