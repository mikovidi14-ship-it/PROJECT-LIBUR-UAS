const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getProductVisual } = require('../utils/productVisual');
const { getStatusMeta, timelineIndex, TIMELINE_STEPS, buildHistoryEntry } = require('../utils/orderStatus');
const { PAYMENT_METHODS, getPaymentMethod, getPaymentStatusMeta, initialPaymentStatus } = require('../utils/orderStatus');

// ===== Upload bukti pembayaran (screenshot transfer/QRIS/e-wallet) =====
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `bukti-${uuid()}${ext}`);
  }
});

const uploadProof = multer({
  storage: proofStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Format bukti pembayaran harus JPG, PNG, atau WEBP.'));
  }
});

function ratingSummary(productId) {
  const reviews = db.get('reviews').filter({ product_id: productId }).value();
  const count = reviews.length;
  const avg = count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  return { avg, count };
}

function hasPurchased(customerId, productId) {
  return db.get('sales').value().some(s =>
    s.customer_id === customerId && s.items.some(i => i.product_id === productId)
  );
}

// ===== Catalog =====
router.get('/shop', requireAuth, requireRole('pelanggan'), (req, res) => {
  const products = db.get('products').value().map(p => {
    const category = db.get('categories').find({ id: p.category_id }).value();
    const { avg, count } = ratingSummary(p.id);
    return {
      ...p,
      category,
      visual: getProductVisual(p, category),
      avgRating: avg,
      reviewCount: count
    };
  });
  const customerRecord = db.get('customers').find({ id: req.user.id }).value();
  const savedAddress = (customerRecord && customerRecord.address && customerRecord.address !== '-') ? customerRecord.address : '';
  res.render('shop/catalog', { title: 'Belanja', products, savedAddress, paymentMethods: PAYMENT_METHODS });
});

// ===== Product detail + reviews =====
router.get('/shop/products/:id', requireAuth, requireRole('pelanggan'), (req, res) => {
  const product = db.get('products').find({ id: req.params.id }).value();
  if (!product) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Produk tidak ditemukan.' });

  const category = db.get('categories').find({ id: product.category_id }).value();
  const reviews = db.get('reviews').value()
    .filter(r => r.product_id === product.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const { avg, count } = ratingSummary(product.id);
  const canReview = hasPurchased(req.user.id, product.id);
  const myReview = db.get('reviews').find({ product_id: product.id, customer_id: req.user.id }).value();

  res.render('shop/product-detail', {
    title: product.name,
    product: { ...product, category, visual: getProductVisual(product, category) },
    reviews,
    avgRating: avg,
    reviewCount: count,
    canReview,
    myReview: myReview || null,
    error: null
  });
});

router.post('/shop/products/:id/review', requireAuth, requireRole('pelanggan'), (req, res) => {
  const product = db.get('products').find({ id: req.params.id }).value();
  if (!product) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Produk tidak ditemukan.' });

  if (!hasPurchased(req.user.id, product.id)) {
    return res.status(403).render('error', {
      title: 'Belum Bisa Ulasan',
      message: 'Kamu hanya bisa memberi ulasan untuk produk yang sudah pernah kamu beli.'
    });
  }

  const rating = Math.min(5, Math.max(1, Number(req.body.rating) || 0));
  const comment = (req.body.comment || '').trim();
  if (!rating) {
    return res.redirect(`/shop/products/${product.id}`);
  }

  const existing = db.get('reviews').find({ product_id: product.id, customer_id: req.user.id }).value();
  if (existing) {
    db.get('reviews').find({ id: existing.id }).assign({
      rating, comment, updated_at: new Date().toISOString()
    }).write();
  } else {
    db.get('reviews').push({
      id: uuid(),
      product_id: product.id,
      customer_id: req.user.id,
      customer_name: req.user.name,
      rating,
      comment,
      created_at: new Date().toISOString()
    }).write();
  }

  res.redirect(`/shop/products/${product.id}`);
});

// ===== Checkout (customer buys for themselves) =====
router.post('/shop/checkout', requireAuth, requireRole('pelanggan'), (req, res) => {
  const { items, note, shipping_address, payment_method } = req.body;

  let cart;
  try {
    cart = JSON.parse(items);
  } catch (e) {
    cart = null;
  }

  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).render('error', {
      title: 'Keranjang Kosong',
      message: 'Keranjang masih kosong. Tambahkan minimal 1 produk sebelum checkout.'
    });
  }

  const chosenMethod = getPaymentMethod(payment_method);
  if (!chosenMethod) {
    return res.status(400).render('error', {
      title: 'Metode Pembayaran Belum Dipilih',
      message: 'Pilih salah satu metode pembayaran sebelum checkout.'
    });
  }

  for (const item of cart) {
    const product = db.get('products').find({ id: item.product_id }).value();
    if (!product) {
      return res.status(400).render('error', { title: 'Gagal Checkout', message: 'Produk tidak ditemukan (mungkin sudah dihapus).' });
    }
    if (item.qty > product.stock) {
      return res.status(400).render('error', { title: 'Gagal Checkout', message: `Stok "${product.name}" tidak cukup. Tersedia: ${product.stock}.` });
    }
  }

  const saleId = uuid();
  const saleDate = dayjs().toISOString();
  let total = 0;

  const saleItems = cart.map(item => {
    const product = db.get('products').find({ id: item.product_id }).value();
    const subtotal = product.price * item.qty;
    total += subtotal;

    db.get('products').find({ id: item.product_id }).assign({ stock: product.stock - item.qty }).write();

    db.get('transactions').push({
      id: uuid(),
      type: 'out',
      product_id: item.product_id,
      quantity: item.qty,
      user_id: req.user.id,
      note: `Pembelian online #${saleId.slice(0, 8)}`,
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

  const customerRecord = db.get('customers').find({ id: req.user.id }).value();
  const destination = (shipping_address && shipping_address.trim())
    ? shipping_address.trim()
    : (customerRecord && customerRecord.address && customerRecord.address !== '-' ? customerRecord.address : '');

  db.get('sales').push({
    id: saleId,
    customer_id: req.user.id,
    customer_name: req.user.name,
    items: saleItems,
    total,
    user_id: req.user.id,
    note: note || '',
    channel: 'online',
    status: 'pending',
    payment_method: chosenMethod.key,
    payment_status: initialPaymentStatus(chosenMethod.key),
    shipping_address: destination,
    courier: null,
    status_history: [buildHistoryEntry('pending', 'Pesanan dibuat oleh pelanggan', req.user.name)],
    sale_date: saleDate
  }).write();

  res.redirect(`/my-orders/${saleId}`);
});

// Customer confirms they have sent payment (transfer/QRIS/e-wallet only),
// and uploads a screenshot/foto of the payment as bukti pembayaran.
// Moves payment_status from 'menunggu_pembayaran' -> 'menunggu_konfirmasi',
// where an admin/staff will verify the proof and mark it 'lunas'.
router.post('/my-orders/:id/mark-paid', requireAuth, requireRole('pelanggan'), (req, res) => {
  uploadProof.single('payment_proof')(req, res, (err) => {
    const sale = db.get('sales').find({ id: req.params.id, customer_id: req.user.id }).value();
    if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });

    if (sale.payment_status !== 'menunggu_pembayaran') {
      return res.redirect(`/my-orders/${sale.id}`);
    }

    if (err) {
      return res.status(400).render('error', { title: 'Gagal Mengunggah Bukti', message: err.message });
    }

    if (!req.file) {
      return res.status(400).render('error', {
        title: 'Bukti Pembayaran Wajib Diunggah',
        message: 'Unggah screenshot/foto bukti transfer terlebih dahulu sebelum menandai pesanan sebagai sudah dibayar.'
      });
    }

    const note = (req.body.payment_note || '').trim();
    db.get('sales').find({ id: sale.id }).assign({
      payment_status: 'menunggu_konfirmasi',
      payment_note: note,
      payment_proof: `/uploads/${req.file.filename}`,
      payment_proof_uploaded_at: new Date().toISOString()
    }).write();

    res.redirect(`/my-orders/${sale.id}`);
  });
});

// ===== Order history (own orders only) =====
router.get('/my-orders', requireAuth, requireRole('pelanggan'), (req, res) => {
  const sales = db.get('sales').value()
    .filter(s => s.customer_id === req.user.id)
    .sort((a, b) => new Date(b.sale_date) - new Date(a.sale_date))
    .map(s => ({
      ...s,
      statusMeta: getStatusMeta(s.status),
      paymentStatusMeta: s.payment_status ? getPaymentStatusMeta(s.payment_status) : null
    }));
  res.render('orders/list', { title: 'Pesanan Saya', sales });
});

router.get('/my-orders/:id', requireAuth, requireRole('pelanggan'), (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, customer_id: req.user.id }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });
  const cashier = db.get('users').find({ id: sale.user_id }).value();
  const customer = db.get('customers').find({ id: sale.customer_id }).value();
  res.render('orders/detail', {
    title: 'Lacak Pesanan',
    sale,
    cashier,
    customer,
    statusMeta: getStatusMeta(sale.status),
    steps: TIMELINE_STEPS.map(getStatusMeta),
    currentStepIndex: timelineIndex(sale.status),
    isAdminView: false,
    paymentMethod: sale.payment_method ? getPaymentMethod(sale.payment_method) : null,
    paymentStatusMeta: sale.payment_status ? getPaymentStatusMeta(sale.payment_status) : null
  });
});

// Printable invoice for the customer's own order (reuses the POS nota layout)
router.get('/my-orders/:id/invoice', requireAuth, requireRole('pelanggan'), (req, res) => {
  const sale = db.get('sales').find({ id: req.params.id, customer_id: req.user.id }).value();
  if (!sale) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Pesanan tidak ditemukan.' });
  const cashier = db.get('users').find({ id: sale.user_id }).value();
  const customer = db.get('customers').find({ id: sale.customer_id }).value();
  res.render('sales/detail', {
    title: 'Nota Pesanan',
    sale,
    cashier,
    customer,
    paymentMethod: sale.payment_method ? getPaymentMethod(sale.payment_method) : null,
    paymentStatusMeta: sale.payment_status ? getPaymentStatusMeta(sale.payment_status) : null
  });
});

module.exports = router;
