@echo off
title SIMIP - Sistem Informasi Manajemen Inventori
cd /d "%~dp0"

echo ============================================
echo   SIMIP - Sistem Informasi Manajemen
echo   Menyiapkan aplikasi...
echo ============================================
echo.

if not exist "node_modules" (
    echo Menginstall komponen yang dibutuhkan ^(sekali saja^), tunggu sebentar...
    call npm install
    echo.
)

echo Menjalankan server SIMIP di jendela baru...
start "SIMIP Server - JANGAN DITUTUP selama pakai aplikasi" cmd /k npm start

echo Menunggu server siap...
timeout /t 4 /nobreak >nul

echo Membuka aplikasi di browser...
start "" http://localhost:3000

echo.
echo ============================================
echo   Selesai! Aplikasi sudah terbuka di browser.
echo   Untuk MENUTUP aplikasi: tutup jendela
echo   hitam "SIMIP Server" yang satunya lagi.
echo ============================================
echo.
pause
