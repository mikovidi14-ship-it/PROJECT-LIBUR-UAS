require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight, non-blocking pass so the sidebar can show a "Pesanan Masuk"
// badge for admin/staff, and the current profile photo, without every
// route having to compute it itself.
app.use((req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    try {
      const { JWT_SECRET } = require('./middleware/auth');
      const payload = jwt.verify(token, JWT_SECRET);
      const db = require('./db');

      if (payload.role === 'admin' || payload.role === 'staff') {
        res.locals.pendingOrdersCount = db.get('sales').value()
          .filter(s => s.channel === 'online' && s.status === 'pending').length;
      }

      const collection = payload.role === 'pelanggan' ? 'customers' : 'users';
      const record = db.get(collection).find({ id: payload.id }).value();
      res.locals.userPhoto = record ? (record.photo_url || null) : null;
    } catch (err) {
      // invalid/expired token — requireAuth on the actual route will handle it
    }
  }
  next();
});

app.get('/', (req, res) => res.redirect('/dashboard'));

app.use(require('./routes/auth'));
app.use(require('./routes/dashboard'));
app.use(require('./routes/products'));
app.use(require('./routes/categories'));
app.use(require('./routes/suppliers'));
app.use(require('./routes/customers'));
app.use(require('./routes/sales'));
app.use(require('./routes/orders'));
app.use(require('./routes/shop'));
app.use(require('./routes/transactions'));
app.use(require('./routes/reports'));
app.use(require('./routes/profile'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Halaman Tidak Ditemukan', message: 'Halaman yang kamu cari tidak ada.', layout: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SIMIP running on http://localhost:${PORT}`));
