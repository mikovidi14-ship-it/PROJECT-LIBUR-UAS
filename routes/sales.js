const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');
const { requireAuth, requireStaffOrAdmin } = require('../middleware/auth');
const { buildHistoryEntry } = require('../utils/orderStatus');

router.get('/sales', requireAuth, requireStaffOrAdmin, (req, res) => {
  const sales = db.get('sales').value()
    .map(s => ({
      ...s,
      customer: db.get('customers').find({ id: s.customer_id }).value(),
      cashier: db.get('users').find({ id: s.user_id }).value()
    }))
    .sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date));
  res.render('sales/list', { title: 'Penjualan', sales });
});

router.get('/sales/new', requireAuth, requireStaffOrAdmin, (req, res) => {
  res.render('sales/form', {
    title: 'Penjualan Baru',
    products: db.get('products').value(),
    customers: db.get('customers').value(),
    error: null
  });
});

router.post('/sales/new', requireAuth, requireStaffOrAdmin, (req, res) => {
  const { customer_id, note, items } = req.body;

  let cart;
  try {
    cart = JSON.parse(items);
  } catch (e) {
    cart = null;
  }

  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return res.render('sales/form', {
      title: 'Penjualan Baru',
      products: db.get('products').value(),
      customers: db.get('customers').value(),
      error: 'Keranjang masih kosong. Tambahkan minimal 1 produk.'
    });
  }

  // Validate stock availability for every item first
  for (const item of cart) {
    const product = db.get('products').find({ id: item.product_id }).value();
    if (!product) {
      return res.render('sales/form', {
        title: 'Penjualan Baru',
        products: db.get('products').value(),
        customers: db.get('customers').value(),
        error: `Produk tidak ditemukan (mungkin sudah dihapus).`
      });
    }
    if (item.qty > product.stock) {
      return res.render('sales/form', {
        title: 'Penjualan Baru',
        products: db.get('products').value(),
        customers: db.get('customers').value(),
        error: `Stok "${product.name}" tidak cukup. Tersedia: ${product.stock}, diminta: ${item.qty}.`
      });
    }
  }

  const saleId = uuid();
  const saleDate = dayjs().toISOString();
  let total = 0;

  const saleItems = cart.map(item => {
    const product = db.get('products').find({ id: item.product_id }).value();
    const subtotal = product.price * item.qty;
    total += subtotal;

    // Decrement stock
    db.get('products').find({ id: item.product_id }).assign({ stock: product.stock - item.qty }).write();

    // Log as a stock-out transaction so dashboard charts stay accurate
    db.get('transactions').push({
      id: uuid(),
      type: 'out',
      product_id: item.product_id,
      quantity: item.qty,
      user_id: req.user.id,
      note: `Penjualan #${saleId.slice(0, 8)}`,
      transaction_date: saleDate,
      sale_id: saleId
    }).write();

    return {
      product_id: item.product_id,
      product_name: product.name,
      qty: item.qty,
      price: product.price,
      subtotal
    };
  });

  const customer = db.get('customers').find({ id: customer_id }).value();

  db.get('sales').push({
    id: saleId,
    customer_id: customer_id || null,
    customer_name: customer ? customer.name : 'Pelanggan Umum',
    items: saleItems,
    total,
    user_id: req.user.id,
    note: note || '',
    channel: 'pos',
    status: 'selesai',
    status_history: [buildHistoryEntry('selesai', 'Transaksi langsung di kasir', req.user.username)],
    sale_date: saleDate
  }).write();

  res.redirect(`/sales/${saleId}`);
});

router.get('/sales/:id', requireAuth, requireStaffOrAdmin, (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Data penjualan tidak ditemukan.' });
  const cashier = db.get('users').find({ id: sale.user_id }).value();
  const customer = sale.customer_id ? db.get('customers').find({ id: sale.customer_id }).value() : null;
  res.render('sales/detail', { title: 'Detail Penjualan', sale, cashier, customer });
});

module.exports = router;
