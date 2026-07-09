# SIMIP — Sistem Informasi Manajemen Inventori & Penjualan

Aplikasi web untuk mengelola produk, kategori, supplier, transaksi stok,
toko online untuk pelanggan, pelacakan pesanan real-time, pembayaran,
dashboard analitik, dan laporan (export Excel & PDF). Dilengkapi 3 peran
pengguna: Admin, Staff, dan Pelanggan.

## Fitur

**Untuk Pelanggan (akun `pelanggan`)**
- 🛍️ **Belanja online**: katalog produk dengan rating & ulasan, keranjang belanja multi-produk
- 💳 **Pembayaran**: pilih Transfer Bank, QRIS, E-Wallet, atau COD (Bayar di Tempat) saat checkout, lengkap dengan instruksi pembayaran
- 📦 **Lacak Pesanan**: tracker visual real-time (Menunggu Konfirmasi → Diproses → Diantar → Selesai), termasuk status pembayaran dan tombol "Saya Sudah Bayar"
- ⭐ Beri ulasan & rating untuk produk yang sudah pernah dibeli
- 🧾 Cetak nota pesanan sendiri
- 👤 **Profil**: lihat statistik belanja pribadi, edit nama/no. HP/alamat, dan ganti password

**Untuk Admin & Staff**
- 🔐 Login dengan role `admin` dan `staff`, akses dibedakan per fitur
- 📊 Dashboard: pendapatan, tren penjualan, top produk & pelanggan, nilai stok per kategori — **hanya menghitung transaksi yang benar-benar lunas/valid**, jadi pesanan yang dibatalkan atau belum dibayar tidak ikut mempengaruhi angka
- 📥 **Pesanan Masuk**: kelola pesanan online — konfirmasi, verifikasi pembayaran, kirim, hingga selesai (pesanan tidak bisa diproses sebelum pembayaran non-COD dikonfirmasi lunas). Membatalkan pesanan otomatis mengembalikan stok.
- 🛒 **Penjualan (POS)**: transaksi walk-in dengan keranjang multi-produk, cetak nota
- 👥 **Pelanggan**: kelola data pelanggan & riwayat transaksi
- 📦 CRUD Produk dengan **upload foto langsung dari komputer** (atau URL gambar)
- 🏷️ Manajemen Kategori & Supplier
- 🔁 Transaksi Stok Masuk/Keluar manual
- 📄 Laporan dengan filter tanggal + export ke Excel (.xlsx) dan PDF
- 👤 **Profil**: lihat ringkasan aktivitas (transaksi/pesanan yang ditangani) dan ganti password

## Akun Demo

| Role      | Username | Password  |
|-----------|----------|-----------|
| Admin     | admin    | admin123  |
| Staff     | staff    | staff123  |
| Pelanggan | budi     | budi123   |

Akun **budi** sudah memiliki beberapa pesanan contoh dengan status pembayaran
berbeda (menunggu pembayaran, menunggu konfirmasi, dan lunas) sehingga alur
pembayaran bisa langsung dicoba tanpa harus checkout dari awal.

## Tech Stack

- **Backend:** Node.js + Express
- **Templating:** EJS + express-ejs-layouts
- **Database:** lowdb (JSON file, pure JavaScript — tanpa native binary, jadi gampang di-deploy di platform mana pun)
- **Auth:** JWT (httpOnly cookie) + bcryptjs untuk hash password
- **Chart:** Chart.js (dashboard)
- **Export:** ExcelJS (xlsx), PDFKit (pdf)
- **UI:** Bootstrap 5 + Font Awesome

## Menjalankan di Lokal

### Cara Termudah (Windows) — Tanpa Ketik Command

Cukup **double-click file `start.bat`** yang ada di folder ini.

Otomatis akan:
1. Install komponen yang dibutuhkan (hanya di percobaan pertama)
2. Menjalankan server
3. Membuka aplikasi di browser secara otomatis

Akan muncul 2 jendela hitam — biarkan tetap terbuka selama pakai aplikasi.
Untuk **mematikan aplikasi**, tutup jendela yang judulnya "SIMIP Server".

### Cara Manual (semua OS)

```bash
npm install
cp .env.example .env
npm start
```

Buka `http://localhost:3000`. Database JSON (`data/db.json`) otomatis dibuat
dan diisi data contoh (seed) saat pertama kali dijalankan.

---

## Panduan Deploy (Hosting) — Gratis

Aplikasi ini paling mudah di-deploy ke platform yang mendukung **Node.js persistent server**
(bukan serverless function), karena database JSON butuh disk yang tetap ada antar-request.
Rekomendasi: **Render.com** (paling gampang & gratis).

Project ini sudah dilengkapi **`render.yaml`** (Blueprint) dan **`Procfile`**, jadi
Render/Railway bisa otomatis mendeteksi cara build & menjalankan aplikasi — kamu
tidak perlu isi Build/Start Command manual.

### Opsi A: Render.com (Direkomendasikan, hampir 1-klik)

1. Push folder project ini ke repository GitHub kamu.
2. Buka [render.com](https://render.com) → Sign up/login (bisa pakai akun GitHub).
3. Klik **New +** → **Blueprint** → pilih repo GitHub kamu.
4. Render otomatis membaca `render.yaml`: build command, start command, dan
   `JWT_SECRET` (dibuatkan otomatis secara acak) sudah terisi sendiri.
5. Klik **Apply**. Tunggu proses build (~2-3 menit).
6. Setelah selesai, kamu dapat URL publik seperti `https://simip-xxxx.onrender.com`.

> Kalau lebih nyaman pakai cara manual (tanpa Blueprint): **New +** → **Web Service**
> → Build Command `npm install`, Start Command `npm start`, lalu tambahkan
> environment variable `JWT_SECRET` (string acak bebas) secara manual.

> Catatan: Free tier Render akan "sleep" setelah tidak ada traffic beberapa menit,
> dan disk akan reset saat redeploy. Untuk demo UAS ini sudah cukup — data seed
> otomatis muncul lagi setiap kali server restart dari kondisi kosong. Kalau ingin
> data tersimpan permanen (untuk dipakai sebagai bisnis beneran), pertimbangkan
> upgrade ke database eksternal seperti PostgreSQL (Render menyediakan ini gratis
> juga, tapi perlu penyesuaian kode di `db.js`).

### Opsi B: Railway.app

1. Push ke GitHub, lalu buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Railway otomatis mendeteksi Node.js (via `Procfile`) dan menjalankan `npm install` + `npm start`.
3. Tambahkan environment variable `JWT_SECRET` di tab **Variables**.
4. Klik **Generate Domain** di tab **Settings** untuk mendapat URL publik.

### Opsi C: Cyclic.sh / Glitch (alternatif ringan)

Kedua platform ini juga mendukung Node.js + Express secara gratis dan cukup
tinggal hubungkan repo GitHub, mirip langkah di atas.

---

## Struktur Folder

```
simip/
├── server.js              # Entry point Express
├── db.js                  # Setup lowdb + seed data awal
├── middleware/auth.js      # JWT auth & role-based access control
├── routes/                # Semua route (auth, dashboard, products, dll)
├── views/                 # Template EJS
├── public/                # CSS statis
└── data/db.json            # Database (auto-generated)
```

## Catatan Pengembangan Lanjutan (untuk laporan UAS)

Karena skala demo, database menggunakan file JSON (lowdb). Untuk skenario
produksi sesungguhnya dengan banyak pengguna simultan, database ini bisa
di-migrasi ke PostgreSQL/MySQL tanpa mengubah struktur route secara signifikan
— cukup mengganti layer akses data di `db.js` dan masing-masing route.
