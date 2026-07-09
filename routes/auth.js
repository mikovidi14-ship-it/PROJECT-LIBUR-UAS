const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

router.get('/login', (req, res) => {
  if (req.cookies.token) return res.redirect('/dashboard');
  res.render('login', { title: 'Login', error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  let account = db.get('users').find({ username }).value();
  let role = account ? account.role : null;
  let displayName = account ? account.username : null;

  if (!account) {
    const customer = db.get('customers').find({ username }).value();
    if (customer && customer.password) {
      account = customer;
      role = 'pelanggan';
      displayName = customer.name;
    }
  }

  if (!account || !bcrypt.compareSync(password, account.password)) {
    return res.render('login', { title: 'Login', error: 'Username atau password salah.' });
  }

  const token = jwt.sign(
    { id: account.id, username: account.username, name: displayName, role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.cookie('token', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 });
  res.redirect(role === 'pelanggan' ? '/shop' : '/dashboard');
});

router.get('/register', (req, res) => {
  if (req.cookies.token) return res.redirect('/dashboard');
  res.render('register', { title: 'Daftar Akun', error: null });
});

router.post('/register', (req, res) => {
  const { username, password, confirm_password, role, name, phone, address } = req.body;

  if (!username || !password) {
    return res.render('register', { title: 'Daftar Akun', error: 'Semua field wajib diisi.' });
  }
  if (password !== confirm_password) {
    return res.render('register', { title: 'Daftar Akun', error: 'Konfirmasi password tidak cocok.' });
  }
  const usernameTaken = db.get('users').find({ username }).value() ||
    db.get('customers').find({ username }).value();
  if (usernameTaken) {
    return res.render('register', { title: 'Daftar Akun', error: 'Username sudah dipakai.' });
  }

  if (role === 'pelanggan') {
    if (!name || !name.trim()) {
      return res.render('register', { title: 'Daftar Akun', error: 'Nama lengkap wajib diisi untuk akun pelanggan.' });
    }
    db.get('customers').push({
      id: uuid(),
      name: name.trim(),
      phone: phone && phone.trim() ? phone.trim() : '-',
      address: address && address.trim() ? address.trim() : '-',
      username,
      password: bcrypt.hashSync(password, 10),
      created_at: new Date().toISOString()
    }).write();
    return res.redirect('/login');
  }

  const user = {
    id: uuid(),
    username,
    password: bcrypt.hashSync(password, 10),
    role: role === 'admin' ? 'admin' : 'staff',
    created_at: new Date().toISOString()
  };
  db.get('users').push(user).write();
  res.redirect('/login');
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

module.exports = router;
