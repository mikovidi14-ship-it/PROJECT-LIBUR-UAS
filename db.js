const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db = low(adapter);

// Default structure
db.defaults({
  users: [],
  categories: [],
  suppliers: [],
  products: [],
  transactions: [],
  customers: [],
  sales: [],
  reviews: []
}).write();

// Seed only if empty (first run)
if (db.get('users').size().value() === 0) {
  const adminId = uuid();
  const staffId = uuid();

  db.get('users').push(
    {
      id: adminId,
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      created_at: new Date().toISOString()
    },
    {
      id: staffId,
      username: 'staff',
      password: bcrypt.hashSync('staff123', 10),
      role: 'staff',
      created_at: new Date().toISOString()
    }
  ).write();

  const catElektronik = uuid();
  const catFashion = uuid();
  const catMakanan = uuid();

  db.get('categories').push(
    { id: catElektronik, name: 'Elektronik' },
    { id: catFashion, name: 'Fashion' },
    { id: catMakanan, name: 'Makanan & Minuman' }
  ).write();

  const supA = uuid();
  const supB = uuid();

  db.get('suppliers').push(
    { id: supA, name: 'CV Sumber Makmur', contact: '0812-1111-2222', address: 'Jakarta' },
    { id: supB, name: 'PT Global Distribusi', contact: '0813-3333-4444', address: 'Surabaya' }
  ).write();

  const sampleProducts = [
    { name: 'Mouse Wireless', category_id: catElektronik, supplier_id: supA, price: 85000, cost: 55000, stock: 40, min_stock: 10 },
    { name: 'Keyboard Mekanik', category_id: catElektronik, supplier_id: supA, price: 350000, cost: 250000, stock: 15, min_stock: 5 },
    { name: 'Kaos Polos', category_id: catFashion, supplier_id: supB, price: 65000, cost: 35000, stock: 8, min_stock: 10 },
    { name: 'Celana Jeans', category_id: catFashion, supplier_id: supB, price: 220000, cost: 150000, stock: 25, min_stock: 8 },
    { name: 'Kopi Sachet (Box)', category_id: catMakanan, supplier_id: supB, price: 45000, cost: 30000, stock: 60, min_stock: 20 }
  ];

  const productIds = [];
  sampleProducts.forEach(p => {
    const id = uuid();
    productIds.push(id);
    db.get('products').push({ id, ...p, image_url: null, created_at: new Date().toISOString() }).write();
  });

  // Seed sample customers. Budi Santoso gets login credentials so there's a
  // ready-to-use demo "pelanggan" account; the others remain walk-in
  // customers (no login) managed by staff/admin only.
  const custUmum = uuid();
  const custBudi = uuid();
  db.get('customers').push(
    { id: custUmum, name: 'Pelanggan Umum', phone: '-', address: '-', username: null, password: null, created_at: new Date().toISOString() },
    { id: custBudi, name: 'Budi Santoso', phone: '0812-5555-1111', address: 'Jl. Merdeka No. 10, Jakarta', username: 'budi', password: bcrypt.hashSync('budi123', 10), created_at: new Date().toISOString() },
    { id: uuid(), name: 'Siti Rahma', phone: '0813-6666-2222', address: 'Jl. Kenanga No. 5, Bandung', username: null, password: null, created_at: new Date().toISOString() }
  ).write();

  // Seed a few sample transactions over the past days for dashboard charts
  const dayjs = require('dayjs');
  productIds.forEach((pid, idx) => {
    for (let d = 10; d >= 0; d--) {
      if ((d + idx) % 3 === 0) {
        db.get('transactions').push({
          id: uuid(),
          type: 'out',
          product_id: pid,
          quantity: Math.floor(Math.random() * 4) + 1,
          user_id: staffId,
          note: 'Penjualan',
          transaction_date: dayjs().subtract(d, 'day').toISOString()
        }).write();
      }
    }
  });
  // Give the demo pelanggan account (Budi) a past order so he has something
  // to review, and seed a couple of reviews so the shop feels alive.
  const dayjsRev = require('dayjs');
  const mouseId = productIds[0];
  const kopiId = productIds[4];
  const demoSaleId = uuid();
  db.get('sales').push({
    id: demoSaleId,
    customer_id: custBudi,
    customer_name: 'Budi Santoso',
    items: [
      { product_id: mouseId, product_name: 'Mouse Wireless', qty: 1, price: 85000, subtotal: 85000 },
      { product_id: kopiId, product_name: 'Kopi Sachet (Box)', qty: 2, price: 45000, subtotal: 90000 }
    ],
    total: 175000,
    user_id: staffId,
    note: '',
    channel: 'online',
    status: 'selesai',
    payment_method: 'qris',
    payment_status: 'lunas',
    shipping_address: 'Jl. Merdeka No. 10, Jakarta',
    courier: 'Kurir Internal',
    status_history: [
      { status: 'pending', note: 'Pesanan dibuat oleh pelanggan', by: 'Budi Santoso', at: dayjsRev().subtract(3, 'day').toISOString() },
      { status: 'diproses', note: 'Pesanan dikonfirmasi admin, mulai diproses', by: 'admin', at: dayjsRev().subtract(3, 'day').add(1, 'hour').toISOString() },
      { status: 'diantar', note: 'Pesanan dalam perjalanan ke Jl. Merdeka No. 10, Jakarta', by: 'staff', at: dayjsRev().subtract(2, 'day').toISOString() },
      { status: 'menunggu_konfirmasi_selesai', note: 'Pesanan sudah sampai tujuan, menunggu konfirmasi admin', by: 'staff', at: dayjsRev().subtract(2, 'day').add(2, 'hour').toISOString() },
      { status: 'selesai', note: 'Pesanan dikonfirmasi selesai oleh admin', by: 'admin', at: dayjsRev().subtract(2, 'day').add(3, 'hour').toISOString() }
    ],
    sale_date: dayjsRev().subtract(3, 'day').toISOString()
  }).write();

  db.get('reviews').push(
    { id: uuid(), product_id: mouseId, customer_id: custBudi, customer_name: 'Budi Santoso', rating: 5, comment: 'Mousenya responsif dan nyaman dipakai, pengiriman cepat.', created_at: dayjsRev().subtract(2, 'day').toISOString() },
    { id: uuid(), product_id: kopiId, customer_id: custBudi, customer_name: 'Budi Santoso', rating: 4, comment: 'Rasa kopinya enak, packaging rapi.', created_at: dayjsRev().subtract(1, 'day').toISOString() }
  ).write();

  // Two more in-flight demo orders so the payment workflow can be explored
  // immediately (one awaiting transfer, one awaiting admin payment confirmation).
  const { buildHistoryEntry: buildHist } = require('./utils/orderStatus');
  const kaosId = productIds[2];
  const jeansId = productIds[3];

  db.get('sales').push({
    id: uuid(),
    customer_id: custBudi,
    customer_name: 'Budi Santoso',
    items: [{ product_id: kaosId, product_name: 'Kaos Polos', qty: 2, price: 65000, subtotal: 130000 }],
    total: 130000,
    user_id: staffId,
    note: '',
    channel: 'online',
    status: 'pending',
    payment_method: 'transfer_bank',
    payment_status: 'menunggu_pembayaran',
    shipping_address: 'Jl. Merdeka No. 10, Jakarta',
    courier: null,
    status_history: [buildHist('pending', 'Pesanan dibuat oleh pelanggan', 'Budi Santoso')],
    sale_date: dayjsRev().subtract(2, 'hour').toISOString()
  }).write();

  db.get('sales').push({
    id: uuid(),
    customer_id: custBudi,
    customer_name: 'Budi Santoso',
    items: [{ product_id: jeansId, product_name: 'Celana Jeans', qty: 1, price: 220000, subtotal: 220000 }],
    total: 220000,
    user_id: staffId,
    note: '',
    channel: 'online',
    status: 'pending',
    payment_method: 'qris',
    payment_status: 'menunggu_konfirmasi',
    payment_note: 'Sudah transfer via QRIS, ref #88213',
    shipping_address: 'Jl. Merdeka No. 10, Jakarta',
    courier: null,
    status_history: [buildHist('pending', 'Pesanan dibuat oleh pelanggan', 'Budi Santoso')],
    sale_date: dayjsRev().subtract(5, 'hour').toISOString()
  }).write();
}

// ---- Migration: make sure every existing sale has a channel + status so
// the order-tracking / admin confirmation views always have something
// sensible to render, even for data created before this feature existed. ----
db.get('sales').value().forEach(sale => {
  let changed = false;
  const patch = {};
  if (!sale.channel) { patch.channel = 'pos'; changed = true; }
  if (!sale.status) { patch.status = 'selesai'; changed = true; }
  if (!sale.status_history) {
    patch.status_history = [{
      status: patch.status || sale.status,
      note: 'Pesanan tercatat',
      by: 'System',
      at: sale.sale_date || new Date().toISOString()
    }];
    changed = true;
  }
  // Payment tracking only applies to online orders — POS is paid face to
  // face at the register, so it doesn't need this workflow.
  const effectiveChannel = patch.channel || sale.channel;
  if (effectiveChannel === 'online' && !sale.payment_method) {
    patch.payment_method = 'transfer_bank';
    const effectiveStatus = patch.status || sale.status;
    patch.payment_status = effectiveStatus === 'dibatalkan' ? 'menunggu_pembayaran' : 'lunas';
    changed = true;
  }
  if (changed) {
    db.get('sales').find({ id: sale.id }).assign(patch).write();
  }
});

module.exports = db;

