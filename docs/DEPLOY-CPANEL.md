# Deployment VOKASI-WEB ke cPanel (tanpa Supervisor)

Panduan ini untuk **uji publik/staging** di hosting sekolah berbasis cPanel Node.js App. Aplikasi menggunakan Next.js 16 dan Supabase; database/auth/storage tetap berada di project Supabase yang dikonfigurasi, bukan otomatis dibuat di cPanel.

## 0. Sebelum mulai

- Pastikan panel hosting benar-benar memiliki **Setup Node.js App / Node.js Selector** dan mendukung Node.js **20.9+** (Node.js 22 LTS disarankan).
- Siapkan subdomain uji, misalnya `vokasi-test.domain-sekolah.sch.id`, dan aktifkan HTTPS.
- Pastikan backup database Supabase tersedia sebelum melakukan perubahan schema/data.
- Jangan menaruh service-role/secret key di GitHub, `NEXT_PUBLIC_*`, file yang dikirim ke browser, atau screenshot.

> Repository GitHub boleh private sementara situs tetap publik. Public repository berarti kode sumber dapat dibaca siapa saja; itu bukan syarat agar situs bisa diakses publik.

## 1. Pilih versi yang benar

- Deploy dari `main` untuk versi yang sudah masuk branch utama dan lulus CI.
- Pull request landing 3D #1 harus ditinjau/di-rebase dahulu sebelum merge: saat panduan ini dibuat GitHub melaporkan konflik (`mergeable_state: dirty`). Jangan force-push atau merge versi konflik.
- Setelah landing yang diuji masuk ke `main`, gunakan `main` sebagai sumber deployment.

## 2. Buat aplikasi Node.js di cPanel

1. Buka **Setup Node.js App / Node.js Selector**.
2. Buat aplikasi baru, pilih Node.js 22 (atau versi yang didukung dan memenuhi minimum), mode **Production**.
3. Pilih application root, misalnya `vokasi-web` (direktori ini harus berisi `package.json`).
4. Pilih domain/subdomain uji.
5. Isi startup file dengan **`server.js`**. File ini menjalankan Next.js production melalui port yang diberikan environment hosting.
6. Simpan aplikasi. Gunakan perintah aktivasi virtual environment yang ditampilkan oleh cPanel sebelum menjalankan perintah Node/npm dari terminal.

**Supervisor tidak diperlukan.** Gunakan tombol Restart di panel Node.js setelah build/perubahan environment.

## 3. Unggah source code

Pilih salah satu cara:
- Git Version Control cPanel: clone repository dan checkout branch `main`; atau
- unggah arsip source code dari branch yang sudah disetujui.

Jangan unggah `node_modules`, `.next`, file `.env.local`, backup database, atau credential.

Pastikan file berikut ada:
- `package.json` dan `package-lock.json`
- `server.js`
- `next.config.ts`
- folder `app/`, `components/`, `lib/`, `public/`
- folder `supabase/` untuk migration dan Edge Function source.

## 4. Environment variables

Tambahkan di konfigurasi aplikasi Node.js cPanel **sebelum build**:

- `NODE_ENV=production`
- `NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>`
- `EMBED_ALLOWED_ORIGINS=https://<origin-website-sekolah>`

Untuk beberapa origin tepercaya, pisahkan dengan spasi atau koma. Jangan gunakan wildcard `*`.

**Penting:** variabel berawalan `NEXT_PUBLIC_` dan `EMBED_ALLOWED_ORIGINS` dibaca saat build Next.js. Pastikan nilai tersebut tersedia dalam lingkungan terminal yang menjalankan build. Jika environment panel tidak diteruskan ke terminal build, buat file konfigurasi production hanya di server (jangan commit/unggah ke repo publik), lalu hapus atau lindungi sesuai kebijakan hosting.

Jangan memasukkan `SUPABASE_SERVICE_ROLE_KEY` ke environment frontend. Secret untuk Supabase Edge Functions disetel di project Supabase, bukan di aplikasi Next.js cPanel.

## 5. Install, test, build, start

Di terminal pada application root, aktifkan environment Node.js sesuai instruksi panel, lalu jalankan:

```bash
npm ci
npm run check:bank
npm run check:new-bank-blueprint
npm run check:security
npm run typecheck
npm run lint
npm run build
```

- Jika ada perintah gagal, **jangan lanjut ke publikasi**; simpan log error dan perbaiki dulu.
- Jalankan Restart dari panel Node.js.
- Startup file harus tetap `server.js`; jangan jalankan `npm run dev` di production.
- Jangan membuka port Node langsung ke internet bila cPanel menyediakan reverse proxy/HTTPS melalui domain.

## 6. Uji smoke test setelah HTTPS aktif

- [ ] Homepage/landing terbuka tanpa error.
- [ ] Login admin dan siswa yang memang diizinkan.
- [ ] Siswa hanya dapat melihat profil, hasil, dan sesi miliknya.
- [ ] Latihan dimulai, jawaban tersimpan, timer habis, dan hasil muncul.
- [ ] Refresh dan putus-sambung jaringan tidak menggandakan hasil.
- [ ] Admin dapat memfilter/mengekspor data sesuai haknya.
- [ ] Akun siswa tidak dapat membuka route admin atau RPC admin.
- [ ] `/embed` hanya bisa ditampilkan pada origin yang diizinkan.
- [ ] HTTPS, redirect login/logout, dan akses lewat HP berfungsi.
- [ ] Tidak ada service-role key atau data siswa pada response browser/log publik.

## 7. Supabase, database, dan serah-terima ke sekolah

Untuk uji awal, gunakan project Supabase yang memang menjadi backend aplikasi agar akun/riwayat tetap konsisten. **Jangan menjalankan semua SQL migration secara massal tanpa membandingkan riwayat migrasi remote dan backup.**

Untuk serah-terima resmi:
1. Idealnya sekolah memiliki project Supabase dan akun owner sendiri.
2. Transfer schema/migrations, RLS policies, RPC/functions, Edge Functions, konfigurasi Storage, dan data melalui jalur privat yang disetujui.
3. Deploy Edge Functions dari folder `supabase/functions/` dan set secret di project tujuan secara terpisah.
4. Migrasikan data Auth/akun dengan prosedur Supabase yang sesuai; dump tabel biasa saja tidak memindahkan akun Auth, Storage, atau secrets.
5. Uji login dan integritas nilai di project tujuan sebelum mengganti URL produksi.
6. Rotasi credential dan cabut akses sementara setelah serah-terima.

**Catatan status source:** Edge Function `provision-students` yang aktif di Supabase telah disalin ke repository pada perubahan ini agar source untuk provisioning siswa ikut terdokumentasi. Periksa dan deploy hanya setelah PR disetujui.
