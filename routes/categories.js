const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireRole, requireStaffOrAdmin } = require('../middleware/auth');

router.get('/categories', requireAuth, requireStaffOrAdmin, (req, res) => {
  res.render('categories', { title: 'Kategori', categories: db.get('categories').value() });
});

router.post('/categories/new', requireAuth, requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (name && name.trim()) {
    db.get('categories').push({ id: uuid(), name: name.trim() }).write();
  }
  res.redirect('/categories');
});

router.post('/categories/:id/delete', requireAuth, requireRole('admin'), (req, res) => {
  const inUse = db.get('products').find({ category_id: req.params.id }).value();
  if (!inUse) {
    db.get('categories').remove({ id: req.params.id }).write();
  }
  res.redirect('/categories');
});

module.exports = router;
