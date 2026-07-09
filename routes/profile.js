const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// ---------------------------------------------------------------------
// Foto profil — disimpan di folder upload yang sama dengan foto produk.
// ---------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${uuid()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — cukup untuk foto profil
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Format foto harus JPG, PNG, WEBP, atau GIF.'));
  }
});

function deleteOldPhoto(photoUrl) {
  if (photoUrl && photoUrl.startsWith('/uploads/')) {
    const filePath = path.join(UPLOAD_DIR, path.basename(photoUrl));
    fs.unlink(filePath, () => {});
  }
}

// ---------------------------------------------------------------------
// Helper: kumpulkan semua data yang dibutuhkan untuk render halaman
// profil sesuai role, supaya tidak duplikasi di GET/POST/error-handler.
// ---------------------------------------------------------------------
function buildProfileView(req, extra = {}) {
  if (req.user.role === 'pelanggan') {
    const customer = db.get('customers').find({ id: req.user.id }).value();
    if (!customer) return null;

    const sales = db.get('sales').value().filter(s => s.customer_id === customer.id);
    const completedSales = sales.filter(s => s.status === 'selesai');

    return {
      view: 'profile/customer',
      data: {
        title: 'Profil Saya',
        customer,
        stats: {
          totalOrders: sales.length,
          completedOrders: completedSales.length,
          totalSpent: completedSales.reduce((sum, s) => sum + s.total, 0),
          memberSince: customer.created_at
        },
        error: null,
        success: null,
        ...extra
      }
    };
  }

  // Staff / Admin
  const account = db.get('users').find({ id: req.user.id }).value();
  if (!account) return null;

  const isAdmin = account.role === 'admin';
  const allSales = db.get('sales').value();

  const posSalesHandled = allSales.filter(s => s.channel === 'pos' && s.user_id === account.id);
  const onlineOrdersTouched = allSales.filter(s =>
    s.channel === 'online' && (s.status_history || []).some(h => h.by === account.username)
  );

  const stats = {
    posSalesHandled: posSalesHandled.length,
    posRevenueHandled: posSalesHandled.reduce((sum, s) => sum + s.total, 0),
    onlineOrdersTouched: onlineOrdersTouched.length,
    memberSince: account.created_at
  };

  if (isAdmin) {
    stats.totalStaff = db.get('users').filter({ role: 'staff' }).size().value();
    stats.totalCustomers = db.get('customers').size().value();
    stats.totalProducts = db.get('products').size().value();
  }

  return {
    view: 'profile/staff',
    data: { title: 'Profil Saya', account, isAdmin, stats, error: null, success: null, ...extra }
  };
}

function renderProfile(req, res, extra) {
  const built = buildProfileView(req, extra);
  if (!built) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Data profil tidak ditemukan.' });
  res.render(built.view, built.data);
}

// ---------------------------------------------------------------------
// GET /profile — renders a different view depending on role, but both
// share the same URL so the sidebar link works everywhere.
// ---------------------------------------------------------------------
router.get('/profile', requireAuth, (req, res) => {
  const successMsg = req.query.updated === 'profile' ? 'Profil berhasil diperbarui.'
    : req.query.updated === 'password' ? 'Password berhasil diubah.' : null;

  renderProfile(req, res, { success: successMsg });
});

// ---------------------------------------------------------------------
// POST /profile — update editable info (name/phone/address for pelanggan)
// dan foto profil (semua role: pelanggan, staff, admin).
// ---------------------------------------------------------------------
router.post('/profile', requireAuth, (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      return renderProfile(req, res, { error: err.message });
    }

    const collection = req.user.role === 'pelanggan' ? 'customers' : 'users';
    const record = db.get(collection).find({ id: req.user.id }).value();
    const body = req.body || {};
    const { remove_photo } = body;

    let photoUrl = record.photo_url || null;
    if (req.file) {
      deleteOldPhoto(record.photo_url);
      photoUrl = `/uploads/${req.file.filename}`;
    } else if (remove_photo === '1') {
      deleteOldPhoto(record.photo_url);
      photoUrl = null;
    }

    if (req.user.role === 'pelanggan') {
      const { name, phone, address } = body;
      if (!name || !name.trim()) {
        return renderProfile(req, res, { error: 'Nama tidak boleh kosong.' });
      }

      db.get('customers').find({ id: req.user.id }).assign({
        name: name.trim(),
        phone: phone && phone.trim() ? phone.trim() : '-',
        address: address && address.trim() ? address.trim() : '-',
        photo_url: photoUrl
      }).write();

      // Also keep customer_name in sync on any of their historical sales so
      // invoices/order lists display the updated name consistently.
      db.get('sales').value()
        .filter(s => s.customer_id === req.user.id)
        .forEach(s => db.get('sales').find({ id: s.id }).assign({ customer_name: name.trim() }).write());
    } else {
      db.get('users').find({ id: req.user.id }).assign({ photo_url: photoUrl }).write();
    }

    res.redirect('/profile?updated=profile');
  });
});

router.post('/profile/password', requireAuth, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const collection = req.user.role === 'pelanggan' ? 'customers' : 'users';
  const account = db.get(collection).find({ id: req.user.id }).value();

  if (!current_password || !bcrypt.compareSync(current_password, account.password)) {
    return renderProfile(req, res, { error: 'Password lama tidak sesuai.' });
  }
  if (!new_password || new_password.length < 6) {
    return renderProfile(req, res, { error: 'Password baru minimal 6 karakter.' });
  }
  if (new_password !== confirm_password) {
    return renderProfile(req, res, { error: 'Konfirmasi password baru tidak cocok.' });
  }

  db.get(collection).find({ id: req.user.id }).assign({
    password: bcrypt.hashSync(new_password, 10)
  }).write();

  res.redirect('/profile?updated=password');
});

module.exports = router;
