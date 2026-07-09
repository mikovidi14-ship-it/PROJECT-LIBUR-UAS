const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');
const { requireAuth, requireStaffOrAdmin } = require('../middleware/auth');

router.get('/transactions', requireAuth, requireStaffOrAdmin, (req, res) => {
  const transactions = db.get('transactions')
    .value()
    .map(t => ({
      ...t,
      product: db.get('products').find({ id: t.product_id }).value(),
      user: db.get('users').find({ id: t.user_id }).value()
    }))
    .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
  res.render('transactions/list', { title: 'Transaksi Stok', transactions });
});

router.get('/transactions/new', requireAuth, requireStaffOrAdmin, (req, res) => {
  res.render('transactions/form', {
    title: 'Catat Transaksi',
    products: db.get('products').value(),
    error: null
  });
});

router.post('/transactions/new', requireAuth, requireStaffOrAdmin, (req, res) => {
  const { product_id, type, quantity, note } = req.body;
  const qty = Number(quantity);
  const product = db.get('products').find({ id: product_id }).value();

  if (!product || qty <= 0) {
    return res.render('transactions/form', {
      title: 'Catat Transaksi',
      products: db.get('products').value(),
      error: 'Produk atau jumlah tidak valid.'
    });
  }

  if (type === 'out' && qty > product.stock) {
    return res.render('transactions/form', {
      title: 'Catat Transaksi',
      products: db.get('products').value(),
      error: `Stok tidak cukup. Stok tersedia: ${product.stock}`
    });
  }

  db.get('transactions').push({
    id: uuid(),
    type,
    product_id,
    quantity: qty,
    user_id: req.user.id,
    note: note || '',
    transaction_date: dayjs().toISOString()
  }).write();

  const newStock = type === 'in' ? product.stock + qty : product.stock - qty;
  db.get('products').find({ id: product_id }).assign({ stock: newStock }).write();

  res.redirect('/transactions');
});

module.exports = router;
