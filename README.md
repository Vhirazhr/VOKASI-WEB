# VOKASI Web

**Next.js 16 · TypeScript · React 19 · Supabase · responsive web**

Project terpisah dari APK Android di `Vhirazhr/VOKASI`. Pengembangan web tidak perlu mengubah tabel, akun, atau kode Android lama.

## 1. Jalankan di Laragon (Windows)

1. Pastikan Laragon menyediakan Node.js **20.9+** (`node -v`). Node.js 22 LTS dianjurkan.
2. Ekstrak folder `VOKASI-WEB` ke `C:\laragon\www\VOKASI-WEB`.
3. Buka **Laragon → Terminal**, lalu jalankan:

   ```powershell
   cd C:\laragon\www\VOKASI-WEB
   npm install
   copy .env.example .env.local
   ```

4. Edit `.env.local` dan masukkan **Project URL** serta **publishable / anon key** dari proyek Supabase yang **sama** dengan Android. Jangan memasukkan `service_role` / secret key.
5. Bank soal lama sudah **ditarik** dan tidak boleh disalin ulang. Bank soal bergambar baru masih berupa draft yang harus diperiksa dan diaktifkan oleh admin.

6. Jalankan website:

   ```powershell
   npm run dev
   ```

7. Buka **http://localhost:3000** (bukan `localhost/VOKASI-WEB`). Laragon menyediakan terminal/Node, sedangkan Next.js dijalankan sebagai server Node sendiri, bukan PHP/Apache.

> **Penting:** `npm run dev` harus tetap berjalan saat pengujian lokal. Jika port 3000 terpakai: `npm run dev -- -p 3001`.

## 2. Buat repository GitHub BARU

Buka https://github.com/new, isi:

- **Owner**: `Vhirazhr` (atau organisasi GitHub sendiri)
- **Repository name**: `VOKASI-WEB`
- **Description**: `Website pembelajaran VOKASI — Next.js + Supabase`
- **Visibility**: **Private** dianjurkan untuk proyek sekolah. Website dapat tetap dideploy publik dari repo private.
- **Initialize repository**: kosongkan pilihan README/.gitignore/license, sebab file sudah tersedia di paket.

Di Laragon Terminal:

```powershell
cd C:\laragon\www\VOKASI-WEB
git init
git branch -M main
git add .
git commit -m "Initial VOKASI web migration"
git remote add origin https://github.com/Vhirazhr/VOKASI-WEB.git
git push -u origin main
```

GitHub baru berhasil setelah kamu membuatnya di situs GitHub dan menjalankan `git push`.

## 3. Login dan backend lama

- **Siswa**: nama lengkap / username + password yang sudah berlaku di APK. Siswa bernama kembar menggunakan `Nama Lengkap | Kelas`.
- **Admin**: email + password Supabase; role dicek melalui `is_school_admin`.
- **Database**: tabel `student_roster`, `classes`, `majors`, `student_attempts`, dan RPC `vokasi_school_leaderboard`.
- **Data nilai**: mode admin mengambil nilai wajib untuk tanggal WIB, dipaging 500, dan mencocokkan berdasarkan `auth_user_id` (bukan hanya nama).
- **Latihan wajib**: 100 soal, distribusi 13 kode sesuai Android, maksimal 30 menit, nilai per sesi. Latihan mandiri 10 soal per kategori. Nilai baru ditandai berhasil jika baris sesi yang sama **dibaca kembali dari Supabase**.
- **Ekspor**: `.xlsx` 6 kolom (No, Nama Siswa, Kelas, Tanggal, Nilai, Status).

**Penting:** akun tidak disalin; aplikasi web menggunakan **Supabase existing**. Jangan membuat project Supabase baru jika ingin histori sama. Row Level Security (RLS) dari proyek Android wajib tetap aktif. Jika ada migrasi SQL sebelumnya yang belum dijalankan, selesaikan di proyek Android/Supabase lebih dahulu.

## 4. Embed ke website sekolah

Setelah di-deploy di domain HTTPS publik, tampilkan route `/embed` sebagai iframe:

```html
<iframe src="https://vokasi.example.sch.id/embed" title="VOKASI Learning"
  style="width:100%;height:850px;border:0;border-radius:16px" loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"></iframe>
```

Atur `.env` server deployment:

```env
EMBED_ALLOWED_ORIGINS=https://sekolah.example.sch.id
```

Origin harus tepat (tanpa path); untuk beberapa domain pisahkan spasi. Konfigurasi mengaktifkan kebijakan `Content-Security-Policy: frame-ancestors` sehingga **hanya domain tepercaya** yang dapat menampilkan VOKASI di iframe. Jangan gunakan `*`.

**Catatan browser:** browser tertentu membatasi storage/login di third-party iframe. Jika login di iframe ditolak, sediakan tautan **Buka VOKASI di tab baru** atau pasang VOKASI sebagai subdomain same-site (misalnya `vokasi.sekolah.sch.id`). Uji langsung di Chrome, Edge, Firefox dan perangkat seluler.

## 5. Deploy publik

Gunakan Vercel atau server Node.js yang menjalankan `npm run build` dan `npm run start`. **GitHub Pages biasa tidak cocok untuk menjalankan server Next.js dinamis.** Set environment variables Supabase dan `EMBED_ALLOWED_ORIGINS` di hosting.

### Kesiapan produksi dan batasan saat ini

Proyek ini adalah **fondasi web fungsional / MVP migrasi**, bukan jaminan seluruh fitur APK sudah 1:1. Fitur yang telah dirancang: autentikasi siswa/admin, latihan numerasi, pengiriman nilai, dashboard siswa, leaderboard, dashboard admin/filter tanggal, ekspor XLSX, dan embed yang dibatasi origin.

Hal yang masih memerlukan pengujian atau pengembangan sebelum rollout seluruh sekolah:

- uji dengan akun siswa/admin asli, pengiriman nilai, RLS, SQL trigger XP, dan histori lintas Android–web;
- verifikasi ulang batas XP web sesuai aturan versi Android, termasuk kuota harian dan concurrent login;
- tambah CRUD siswa, impor massal, CRUD soal, profil foto, pemulihan password, dan notifikasi bila ingin paritas 1:1 APK;
- uji performa 2.378+ siswa, aksesibilitas, proteksi sesi lintas perangkat, serta keamanan akun;
- `student_attempts` Android merupakan data nilai **dihitung klien untuk latihan**; jangan menggunakan nilainya sebagai ujian resmi yang wajib anti-kecurangan tanpa validasi server-side;
- bank soal JSON yang disajikan di browser berisi kunci jawaban seperti APK publik sebelumnya: **hanya untuk latihan**, bukan evaluasi berisiko tinggi;
- mekanisme simpan kuis browser menggunakan `sessionStorage`; login iframe tergantung kebijakan penyimpanan browser. Jangan memakai perangkat publik tanpa logout;
- periksa versi dependensi pada `npm audit`, jalankan `npm run build` dan pengujian end-to-end sebelum produksi.

**Tidak pernah simpan `service_role` di environment `NEXT_PUBLIC_*`, frontend, atau repositori.**

## Struktur

```
app/             Next.js App Router: landing, login, siswa, admin, embed
components/      UI shell + engine kuis
lib/             autentikasi, Supabase client, query sekolah, aturan kuis
public/data/     bank 500 soal asli (diisi via npm run sync:bank)
scripts/         sinkronisasi & validasi bank
```

Source Android acuan: https://github.com/Vhirazhr/VOKASI


## 6. Pembaruan dashboard web (Oktober 2026)

- Landing page sekolah memiliki preview interaktif dan podium DEMO anonim; data siswa tidak dipublikasikan.
- Siswa memiliki halaman riwayat, peringkat nilai latihan wajib, dan profil. Mode kuis pastel hanya mengganti visual, bukan logika seleksi soal, timer, scoring, XP, atau sinkronisasi.
- Admin memiliki direktori siswa, kelas/jurusan, serta bank soal dalam mode baca saja.
- Analitik admin tersedia di /admin/analitik: rentang 7/14/30 hari, filter jurusan/kelas, partisipasi WIB, sebaran nilai, dan ringkasan kelas. Siswa tanpa nilai bukan dianggap nol.
- Dashboard admin dan ekspor Excel kelas/tanggal lama tetap tersedia.
- Embed memiliki navigasi internal berbasis tautan saat sidebar disembunyikan, dan login memberi alternatif membuka tab baru jika browser membatasi login iframe.

### Pengujian yang masih harus dilakukan sekolah

1. Gunakan URL dan anon key Supabase project APK yang sama; jangan simpan kunci rahasia di repo.
2. Tes akun siswa nyata: login, sesi 100 soal, expiry/timer, keluar, nilai tersimpan, riwayat, dan ranking.
3. Tes akun admin nyata: seluruh menu, akses tidak sah, filter, ekspor kelas/tanggal, dan analitik dari tanggal dengan nilai.
4. Uji route /embed pada website HTTPS yang diizinkan melalui EMBED_ALLOWED_ORIGINS; cek browser dan third-party cookies.
5. Jangan gunakan untuk ujian berisiko tinggi sampai kunci jawaban dipindah dari JSON publik dan skor/timer diperiksa di server. CI sukses tidak membuktikan keamanan penilaian.


### Paket soal baru bergambar (2026)

Blueprint 100 soal / 30 menit dan prosedur impor sebagai draft tersedia di [`docs/BLUEPRINT-SOAL-BARU.md`](docs/BLUEPRINT-SOAL-BARU.md). Soal baru belum mengganti ujian aktif web/Android.


## Penghapusan bank lama

Atas instruksi pemilik, file `public/data/vokasi_bank_500.json` dan script `scripts/sync-bank.mjs` sudah dihapus. Latihan wajib dan mandiri ditangguhkan sampai paket pengganti 500 soal diaktifkan. Jangan menjalankan `npm run sync:bank` atau menyalin asset lama dari APK. Riwayat nilai siswa di Supabase tidak dihapus. APK Android yang sudah terpasang tidak otomatis menerima perubahan repo; perlu instal versi APK baru.


## Aktivasi 500 soal baru bergambar di WEBSITE

Bank lama telah dicabut. Aktivasi bank baru hanya mengubah WEBSITE, bukan Android atau riwayat nilai siswa.

1. Jalankan SQL pada project Supabase sekolah: pertama `supabase/migrations/202610250001_vokasi_visual_question_drafts.sql`, kemudian `supabase/migrations/202610260001_vokasi_web_publish_new_bank.sql`.
2. Login admin web. Di `/admin/bank-soal/impor`, pilih paket ZIP final berisi 500 soal dan timer yang sudah dibagikan lewat chat. Fitur impor akan menyimpan seluruh soal dan gambar ke draft privat Supabase.
3. Periksa dan perbaiki soal nomor 339 di `/admin/bank-soal/buat` karena dua jawaban bernama "Jumat" (perlu dipastikan pilihan yang benar dari sumber); periksa pula seluruh isi/kunci soal sebelum ujian resmi.
4. Buka `/admin/bank-soal/aktifkan`. Tombol hanya aktif ketika paket lulus pemeriksaan 500 nomor, pilihan, diagram, kuota, dan timer. SQL menerbitkan salinan bank tetap secara atomik setelah memeriksa gambar tersimpan di Supabase Storage.
5. Buka ulang `/siswa`. Saat bank aktif, siswa bisa mengerjakan latihan wajib (100 soal/30 menit) maupun 10 soal mandiri per kategori. Diagram sesi dipreload sebelum timer berjalan.

Blueprint: 30×5 detik hitung dasar, 20×10 menengah, 10×15 lanjut, 10×30 numerasi campuran, 10×35 fisika, 10×25 logika, 10×40 pola gambar; total 1.800 detik.

**Batas keamanan:** Scoring untuk saat ini tetap dihitung di aplikasi klien sebagaimana Android sebelumnya. Kunci pada bank aktif dapat dibaca akun siswa terautentikasi, sehingga sistem ini cocok untuk latihan, bukan ujian resmi yang membutuhkan pencegahan kecurangan dan verifikasi skor server. Proses SQL, impor dan uji akun asli perlu dilakukan di project sekolah; berhasil build saja tidak membuktikan aktivasi.
