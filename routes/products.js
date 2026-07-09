const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireRole, requireStaffOrAdmin } = require('../middleware/auth');
const { getProductVisual } = require('../utils/productVisual');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuid()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Format file harus JPG, PNG, WEBP, atau GIF.'));
  }
});

function deleteOldImage(imageUrl) {
  if (imageUrl && imageUrl.startsWith('/uploads/')) {
    const filePath = path.join(UPLOAD_DIR, path.basename(imageUrl));
    fs.unlink(filePath, () => {});
  }
}

router.get('/products', requireAuth, requireStaffOrAdmin, (req, res) => {
  const products = db.get('products').value().map(p => {
    const category = db.get('categories').find({ id: p.category_id }).value();
    const supplier = db.get('suppliers').find({ id: p.supplier_id }).value();
    const reviews = db.get('reviews').filter({ product_id: p.id }).value();
    const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
    return {
      ...p,
      category,
      supplier,
      visual: getProductVisual(p, category),
      avgRating,
      reviewCount: reviews.length
    };
  });
  res.render('products/list', { title: 'Produk', products });
});

router.get('/products/new', requireAuth, requireRole('admin'), (req, res) => {
  res.render('products/form', {
    title: 'Tambah Produk',
    product: null,
    categories: db.get('categories').value(),
    suppliers: db.get('suppliers').value(),
    error: null
  });
});

router.post('/products/new', requireAuth, requireRole('admin'), (req, res) => {
  upload.single('image_file')(req, res, (err) => {
    if (err) {
      return res.render('products/form', {
        title: 'Tambah Produk',
        product: null,
        categories: db.get('categories').value(),
        suppliers: db.get('suppliers').value(),
        error: err.message
      });
    }

    const { name, category_id, supplier_id, price, cost, stock, min_stock, image_url } = req.body;
    let finalImageUrl = null;
    if (req.file) {
      finalImageUrl = `/uploads/${req.file.filename}`;
    } else if (image_url && image_url.trim()) {
      finalImageUrl = image_url.trim();
    }

    db.get('products').push({
      id: uuid(),
      name,
      category_id,
      supplier_id,
      price: Number(price),
      cost: Number(cost),
      stock: Number(stock),
      min_stock: Number(min_stock),
      image_url: finalImageUrl,
      created_at: new Date().toISOString()
    }).write();
    res.redirect('/products');
  });
});

router.get('/products/:id/edit', requireAuth, requireRole('admin'), (req, res) => {
  const product = db.get('products').find({ id: req.params.id }).value();
  if (!product) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Produk tidak ditemukan.' });
  res.render('products/form', {
    title: 'Edit Produk',
    product,
    categories: db.get('categories').value(),
    suppliers: db.get('suppliers').value(),
    error: null
  });
});

router.post('/products/:id/edit', requireAuth, requireRole('admin'), (req, res) => {
  upload.single('image_file')(req, res, (err) => {
    const product = db.get('products').find({ id: req.params.id }).value();
    if (err) {
      return res.render('products/form', {
        title: 'Edit Produk',
        product,
        categories: db.get('categories').value(),
        suppliers: db.get('suppliers').value(),
        error: err.message
      });
    }

    const { name, category_id, supplier_id, price, cost, stock, min_stock, image_url, remove_image } = req.body;
    let finalImageUrl = product.image_url;

    if (req.file) {
      deleteOldImage(product.image_url);
      finalImageUrl = `/uploads/${req.file.filename}`;
    } else if (remove_image === '1') {
      deleteOldImage(product.image_url);
      finalImageUrl = null;
    } else if (image_url && image_url.trim()) {
      finalImageUrl = image_url.trim();
    }

    db.get('products').find({ id: req.params.id }).assign({
      name, category_id, supplier_id,
      price: Number(price), cost: Number(cost),
      stock: Number(stock), min_stock: Number(min_stock),
      image_url: finalImageUrl
    }).write();
    res.redirect('/products');
  });
});

router.post('/products/:id/delete', requireAuth, requireRole('admin'), (req, res) => {
  const product = db.get('products').find({ id: req.params.id }).value();
  if (product) deleteOldImage(product.image_url);
  db.get('products').remove({ id: req.params.id }).write();
  res.redirect('/products');
});

module.exports = router;
