const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../db');
const { requireAuth, requireStaffOrAdmin } = require('../middleware/auth');

function getFilteredTransactions(req) {
  const { from, to } = req.query;
  let transactions = db.get('transactions')
    .value()
    .map(t => ({
      ...t,
      product: db.get('products').find({ id: t.product_id }).value(),
      user: db.get('users').find({ id: t.user_id }).value()
    }));

  if (from) transactions = transactions.filter(t => dayjs(t.transaction_date).isAfter(dayjs(from).subtract(1, 'second')));
  if (to) transactions = transactions.filter(t => dayjs(t.transaction_date).isBefore(dayjs(to).add(1, 'day')));

  return transactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
}

router.get('/reports', requireAuth, requireStaffOrAdmin, (req, res) => {
  const transactions = getFilteredTransactions(req);
  const lowStock = db.get('products').value().filter(p => p.stock <= p.min_stock);
  res.render('reports', {
    title: 'Laporan',
    transactions,
    lowStock,
    from: req.query.from || '',
    to: req.query.to || ''
  });
});

router.get('/reports/export/excel', requireAuth, requireStaffOrAdmin, async (req, res) => {
  const transactions = getFilteredTransactions(req);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Transaksi Stok');

  sheet.columns = [
    { header: 'Tanggal', key: 'date', width: 20 },
    { header: 'Produk', key: 'product', width: 25 },
    { header: 'Tipe', key: 'type', width: 10 },
    { header: 'Jumlah', key: 'qty', width: 10 },
    { header: 'User', key: 'user', width: 15 },
    { header: 'Catatan', key: 'note', width: 25 }
  ];
  sheet.getRow(1).font = { bold: true };

  transactions.forEach(t => {
    sheet.addRow({
      date: dayjs(t.transaction_date).format('DD/MM/YYYY HH:mm'),
      product: t.product ? t.product.name : '-',
      type: t.type === 'in' ? 'Masuk' : 'Keluar',
      qty: t.quantity,
      user: t.user ? t.user.username : '-',
      note: t.note
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=laporan-transaksi.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

router.get('/reports/export/pdf', requireAuth, requireStaffOrAdmin, (req, res) => {
  const transactions = getFilteredTransactions(req);
  const doc = new PDFDocument({ margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=laporan-transaksi.pdf');
  doc.pipe(res);

  doc.fontSize(16).text('Laporan Transaksi Stok - SIMIP', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).text(`Dicetak pada: ${dayjs().format('DD/MM/YYYY HH:mm')}`, { align: 'right' });
  doc.moveDown();

  const tableTop = doc.y;
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Tanggal', 40, tableTop, { width: 90 });
  doc.text('Produk', 130, tableTop, { width: 140 });
  doc.text('Tipe', 270, tableTop, { width: 50 });
  doc.text('Jml', 320, tableTop, { width: 40 });
  doc.text('User', 360, tableTop, { width: 80 });
  doc.text('Catatan', 440, tableTop, { width: 100 });
  doc.moveDown(0.5);
  doc.font('Helvetica');

  let y = doc.y;
  transactions.forEach(t => {
    if (y > 730) {
      doc.addPage();
      y = 40;
    }
    doc.text(dayjs(t.transaction_date).format('DD/MM/YY HH:mm'), 40, y, { width: 90 });
    doc.text(t.product ? t.product.name : '-', 130, y, { width: 140 });
    doc.text(t.type === 'in' ? 'Masuk' : 'Keluar', 270, y, { width: 50 });
    doc.text(String(t.quantity), 320, y, { width: 40 });
    doc.text(t.user ? t.user.username : '-', 360, y, { width: 80 });
    doc.text(t.note || '-', 440, y, { width: 100 });
    y += 18;
  });

  doc.end();
});

module.exports = router;
