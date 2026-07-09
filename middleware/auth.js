const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'simip-dev-secret-change-me';

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect('/login');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    res.locals.user = payload;
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.redirect('/login');
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).render('error', {
        title: 'Akses Ditolak',
        message: 'Kamu tidak punya izin untuk mengakses halaman ini.'
      });
    }
    next();
  };
}

// Shorthand for the internal (admin/staff) side of the app — blocks the
// 'pelanggan' (customer) role from reaching back-office pages.
function requireStaffOrAdmin(req, res, next) {
  return requireRole('admin', 'staff')(req, res, next);
}

module.exports = { requireAuth, requireRole, requireStaffOrAdmin, JWT_SECRET };
