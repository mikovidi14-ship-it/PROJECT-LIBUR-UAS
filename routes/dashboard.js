const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const db = require('../db');
const { requireAuth, requireStaffOrAdmin } = require('../middleware/auth');
const { getStatusMeta, getPaymentStatusMeta } = require('../utils/orderStatus');

// A sale only "counts" toward revenue/chart figures once the money is
// actually secured:
//  - POS (walk-in) sales are paid on the spot -> always countable.
//  - Online orders only count once payment is confirmed ('lunas') or it's
//    a confirmed COD order that has progressed past 'pending' (i.e. the
//    admin has accepted it) — orders still awaiting payment/confirmation,
//    or that were cancelled, are excluded so charts aren't inflated by
//    money that was never actually received.
function isCountable(sale) {
  if (sale.status === 'dibatalkan') return false;
  if (sale.channel !== 'online') return true; // POS
  if (sale.payment_status === 'lunas') return true;
  if (sale.payment_method === 'cod' && sale.status !== 'pending') return true;
  return false;
}

router.get('/dashboard', requireAuth, requireStaffOrAdmin, (req, res) => {
  const products = db.get('products').value();
  const allSales = db.get('sales').value();
  const lowStock = products.filter(p => p.stock <= p.min_stock);

  // ===================================================================
  // Staff dashboard: staff's day-to-day job in SIMIP is running the
  // middle of the online-order pipeline (verify payment proof, pack &
  // ship, mark delivery done) — not business analytics/revenue, which
  // stays admin-only. So staff gets an actionable work queue instead of
  // charts: what needs their attention right now, oldest first.
  // ===================================================================
  if (req.user.role === 'staff') {
    const decorate = (s) => ({
      ...s,
      statusMeta: getStatusMeta(s.status),
      paymentStatusMeta: s.payment_status ? getPaymentStatusMeta(s.payment_status) : null
    });

    const onlineSales = allSales.filter(s => s.channel === 'online');
    const byOldestFirst = (a, b) => new Date(a.sale_date) - new Date(b.sale_date);

    const awaitingPaymentConfirm = onlineSales
      .filter(s => s.payment_status === 'menunggu_konfirmasi')
      .sort(byOldestFirst)
      .map(decorate);

    const readyToShip = onlineSales
      .filter(s => s.status === 'diproses')
      .sort(byOldestFirst)
      .map(decorate);

    const outForDelivery = onlineSales
      .filter(s => s.status === 'diantar')
      .sort(byOldestFirst)
      .map(decorate);

    const totalTransactionsToday = allSales.filter(
      s => dayjs(s.sale_date).format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD')
    ).length;

    return res.render('dashboard-staff', {
      title: 'Dashboard',
      awaitingPaymentConfirm,
      readyToShip,
      outForDelivery,
      lowStock,
      totalTransactionsToday,
      totalProducts: products.length
    });
  }

  // ===================================================================
  // Admin dashboard: full business overview (unchanged).
  // ===================================================================
  const sales = allSales.filter(isCountable);
  const customers = db.get('customers').value();

  const totalProducts = products.length;
  const totalStockValue = products.reduce((sum, p) => sum + p.stock * p.cost, 0);

  // Revenue (omzet) figures — only counts sales that are actually paid
  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const todayStr = dayjs().format('YYYY-MM-DD');
  const todayRevenue = sales
    .filter(s => dayjs(s.sale_date).format('YYYY-MM-DD') === todayStr)
    .reduce((sum, s) => sum + s.total, 0);
  const totalCustomers = customers.length;

  const pendingOrders = allSales.filter(s => s.channel === 'online' && !['selesai', 'dibatalkan'].includes(s.status)).length;

  // Sales trend last 14 days — quantity sold + revenue, from countable sales only
  const days = [];
  const revenueDays = [];
  for (let i = 13; i >= 0; i--) {
    const date = dayjs().subtract(i, 'day');
    const dayStr = date.format('YYYY-MM-DD');
    const daySales = sales.filter(s => dayjs(s.sale_date).format('YYYY-MM-DD') === dayStr);

    const qty = daySales.reduce((sum, s) => sum + s.items.reduce((q, it) => q + it.qty, 0), 0);
    days.push({ label: date.format('DD/MM'), qty });

    const revenue = daySales.reduce((sum, s) => sum + s.total, 0);
    revenueDays.push({ label: date.format('DD/MM'), revenue });
  }

  // Top 5 pelanggan by total belanja (countable sales only)
  const topCustomers = customers
    .map(c => {
      const custSales = sales.filter(s => s.customer_id === c.id);
      return {
        name: c.name,
        totalBelanja: custSales.reduce((sum, s) => sum + s.total, 0),
        totalTransaksi: custSales.length
      };
    })
    .filter(c => c.totalBelanja > 0)
    .sort((a, b) => b.totalBelanja - a.totalBelanja)
    .slice(0, 5);

  // Top 5 products by quantity sold — computed directly from sale items,
  // so cancelled/unpaid orders never inflate this chart.
  const soldMap = {};
  sales.forEach(s => {
    s.items.forEach(item => {
      soldMap[item.product_id] = (soldMap[item.product_id] || 0) + item.qty;
    });
  });
  const topProducts = Object.entries(soldMap)
    .map(([id, qty]) => {
      const p = products.find(p => p.id === id);
      return { name: p ? p.name : 'Produk dihapus', qty };
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const totalTransactionsToday = sales.filter(
    s => dayjs(s.sale_date).format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD')
  ).length;

  // Category breakdown for stock value chart
  const categories = db.get('categories').value();
  const categoryBreakdown = categories.map(c => {
    const catProducts = products.filter(p => p.category_id === c.id);
    return {
      name: c.name,
      value: catProducts.reduce((sum, p) => sum + p.stock * p.cost, 0),
      count: catProducts.length
    };
  }).filter(c => c.count > 0);

  res.render('dashboard', {
    title: 'Dashboard',
    totalProducts,
    totalStockValue,
    lowStock,
    salesTrend: days,
    revenueTrend: revenueDays,
    topProducts,
    topCustomers,
    categoryBreakdown,
    totalTransactionsToday,
    totalRevenue,
    todayRevenue,
    totalCustomers,
    pendingOrders,
    totalSuppliers: db.get('suppliers').size().value(),
    totalCategories: db.get('categories').size().value()
  });
});

module.exports = router;
