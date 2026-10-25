# Bank soal baru VOKASI — blueprint 100 soal / 30 menit

## Status saat ini

Bank baru 500 soal dari dokumen Word disiapkan sebagai **DRAFT**. Tidak boleh menggantikan JSON latihan aktif web atau paket Android secara otomatis. Nilai siswa existing tidak diubah.

Paket yang sudah dibuat dan diperiksa pada percakapan ini:
- \`VOKASI_500_SOAL_BARU_TIMER_FINAL_DRAFT.zip\` (tersedia sebagai unduhan dalam chat).
- Berkas utama: \`soal_baru_500_DRAFT.json\`
- Berkas gambar: \`gambar/\` (50 gambar terhubung ke 50 soal visual)
- Berkas ketentuan: \`BLUEPRINT_100_SOAL_30_MENIT.json\`
- Berkas audit: \`AUDIT_PERLU_TINJAU.json\`

## Blueprint resmi versi draft

| Kelompok | Kuota per sesi | Waktu per soal | Total |
| --- | ---: | ---: | ---: |
| HITUNG_DASAR | 30 | 5 detik | 150 detik |
| HITUNG_MENENGAH | 20 | 10 detik | 200 detik |
| HITUNG_LANJUT | 10 | 15 detik | 150 detik |
| NUMERASI_CAMPURAN | 10 | 30 detik | 300 detik |
| FISIKA_DASAR | 10 | 35 detik | 350 detik |
| LOGIKA | 10 | 25 detik | 250 detik |
| POLA_GAMBAR | 10 | 40 detik | 400 detik |
| **Jumlah** | **100** | | **1.800 detik (30 menit)** |

Kelompok 1–300 dihitung dari operand perkalian/pembagian (aturan eksplisit pada \`BACA_DULU.txt\` paket). Kelompok 301–350 adalah numerasi campuran, 351–400 fisika dasar, 401–450 logika, dan 451–500 pola gambar. Ini klasifikasi awal dari rumus dan urutan dokumen, bukan audit pedagogis final.

Satu soal diketahui bermasalah di sumber: **no. 339** memiliki pilihan **A=Jumat, B=Jumat** yang sama. Pilihan tersebut tidak diubah diam-diam. Koreksi melalui editor sebelum aktivasi. Kunci jawaban dan ilustrasi pada bagian nonaritmetika wajib diperiksa manusia.

## Menggunakan fitur impor (admin)

1. Pull versi web terbaru.
2. Jalankan SQL \`supabase/migrations/202610250001_vokasi_visual_question_drafts.sql\` di **SQL Editor** project Supabase sekolah (hanya pemilik project yang berwenang). Setelah migrasi, jangan letakkan service role key di web.
3. Login sebagai admin. Buka \`/admin/bank-soal/impor\`. Unggah ZIP final dengan timer dari chat — bukan ZIP versi awal dan bukan DOCX mentah.
4. Browser memvalidasi **500 ID**, tujuh kategori, timer tetap, kunci indeks, gambar fisik, kuota 100, dan total 1.800 detik. Paket tanpa timer final ditolak.
5. Setelah pemeriksaan, pilih **Impor ke draft Supabase**. Importer menambahkan nomor baru. Jika paket awal pernah diimpor dengan default 20 detik, importer menyesuaikan **hanya** kelompok dan timer untuk nomor lama dengan teks yang identik, bukan menimpa opsi/kunci/gambar.
6. Buka \`/admin/bank-soal/buat\` untuk meninjau dan memperbaiki soal termasuk no. 339.
7. Bank aktif web dan Android **belum diaktifkan**. Pengaktifan lintas-platform harus dilakukan sesudah audit kunci/jawaban, pemeriksaan gambar, desain distribusi bank dan pengalaman siswa, serta uji penerimaan sekolah.

## Checklist untuk aktivasi nanti

- [ ] 500 soal lengkap dan semua 50 gambar tampil benar.
- [ ] Jawaban serta pilihan soal visual diperiksa satu per satu.
- [ ] Soal 339 diperbaiki dan opsi lain diverifikasi.
- [ ] Semua kategori memiliki stok lebih besar dari kuota (terutama 30 easy, 20 medium, 10 advanced).
- [ ] Setiap pengacakan menghasilkan 100 soal, 1.800 detik dan tidak menduplikasi ID.
- [ ] Timeout per soal otomatis; jawaban sekali kirim terkunci; notifikasi benar/salah 1 detik tidak memotong durasi menjawab soal berikutnya.
- [ ] Gambar selesai dimuat sebelum penghitung waktu soal visual dimulai, termasuk pada koneksi lambat.
- [ ] Perlindungan penilaian sisi server dan kebijakan eksposur kunci jawaban sudah diputuskan.
- [ ] Versi Android dan web memakai versi bank dan mekanisme sinkronisasi yang sama; uji dengan akun siswa dan admin nyata.
- [ ] Bank lama dipertahankan sampai versi baru lulus uji; histori nilai tidak dihapus.

> Memindahkan soal ke draft bukan berarti mengaktifkan soal di ujian. Data Supabase dan Android tidak berubah hanya karena kode impor sudah masuk GitHub.


## Implementasi website

Alur penerbitan: `/admin/bank-soal/impor` → perbaiki opsi 339 → `/admin/bank-soal/aktifkan` → siswa membuka `/siswa`. Bank aktif adalah snapshot Supabase `vokasi_web_published_questions`, bukan JSON lama. Android tidak berubah dalam tahap ini.
