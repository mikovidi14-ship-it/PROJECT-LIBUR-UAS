const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireRole, requireStaffOrAdmin } = require('../middleware/auth');

router.get('/suppliers', requireAuth, requireStaffOrAdmin, (req, res) => {
  res.render('suppliers', { title: 'Supplier', suppliers: db.get('suppliers').value() });
});

router.post('/suppliers/new', requireAuth, requireRole('admin'), (req, res) => {
  const { name, contact, address } = req.body;
  if (name && name.trim()) {
    db.get('suppliers').push({ id: uuid(), name: name.trim(), contact, address }).write();
  }
  res.redirect('/suppliers');
});

router.post('/suppliers/:id/delete', requireAuth, requireRole('admin'), (req, res) => {
  const inUse = db.get('products').find({ supplier_id: req.params.id }).value();
  if (!inUse) {
    db.get('suppliers').remove({ id: req.params.id }).write();
  }
  res.redirect('/suppliers');
});

module.exports = router;
