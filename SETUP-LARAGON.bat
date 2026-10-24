@echo off
cd /d "%~dp0"
echo =============================
echo VOKASI-WEB - Instalasi Laragon
 echo =============================
where node >nul 2>nul
if errorlevel 1 (
 echo ERROR: Node.js tidak ditemukan. Buka Laragon Terminal dan pastikan Node.js terpasang.
 pause
 exit /b 1
)
node -v
if not exist .env.local (
 copy .env.example .env.local >nul
 echo Silakan edit .env.local dengan konfigurasi Supabase yang sama dengan VOKASI Android.
)
call npm install
if errorlevel 1 (
 echo ERROR: npm install gagal. Periksa internet.
 pause
 exit /b 1
)
call npm run sync:bank
if errorlevel 1 echo PERINGATAN: Bank soal belum terunduh. Lihat README.md untuk penyalinan manual.
echo.
echo Jalankan: npm run dev
 echo Kemudian buka: http://localhost:3000
pause
