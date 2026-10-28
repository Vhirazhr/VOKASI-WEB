/**
 * The local, offline VOKASI assistant, aligned with Android VokasiHelp.
 * This is not a language model and it does not request or disclose student data.
 */
export type VokasiChatReply={text:string;recognized:boolean;kind:'calculation'|'guide'|'fallback'};
export const CHATBOT_SUGGESTIONS=['Cara unduh PDF','Rekomendasi materi','Cara kerja nilai'];
export const CHATBOT_GREETING='Halo! Aku Asisten VOKASI. Tanyakan cara memakai VOKASI atau hitungan matematika dasar.';

function formatNumber(value:number):string{
  return new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(value);
}

function calculate(question:string):string|null{
  const value=question.toLowerCase().replace(/−/g,'-');
  const percent=value.match(/(-?\d+(?:[.,]\d+)?)\s*(?:%|persen)\s*(?:dari|of)\s*(-?\d+(?:[.,]\d+)?)/);
  if(percent){
    const a=Number(percent[1].replace(',','.')),b=Number(percent[2].replace(',','.'));
    if(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=1e9&&Math.abs(b)<=1e9)
      return formatNumber(a)+'% dari '+formatNumber(b)+' = '+formatNumber(a*b/100)+'.';
  }
  const match=value.match(/(-?\d+(?:[.,]\d+)?)\s*([+*/x×÷:\-])\s*(-?\d+(?:[.,]\d+)?)/);
  if(!match)return null;
  const a=Number(match[1].replace(',','.')),b=Number(match[3].replace(',','.')),op=match[2];
  if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>1e9||Math.abs(b)>1e9)
    return 'Angkanya terlalu besar untuk kalkulator sederhana ini.';
  if((op==='/'||op==='÷'||op===':')&&b===0)return 'Pembagian dengan nol tidak diperbolehkan.';
  const result=op==='+'?a+b:op==='-'?a-b:['x','×','*'].includes(op)?a*b:a/b;
  if(!Number.isFinite(result))return 'Hitungan tersebut tidak dapat diproses.';
  const symbol=op==='x'||op==='×'||op==='*'?'×':['/','÷',':'].includes(op)?'÷':op;
  return 'Hasil: '+formatNumber(a)+' '+symbol+' '+formatNumber(b)+' = '+formatNumber(result)+
    (Number.isInteger(result)?'.':' (dibulatkan hingga tiga desimal).');
}
const guide:ReadonlyArray<{pattern:RegExp;answer:string}>=[
  {pattern:/\b(pdf|laporan|unduh|download|ekspor\s+hasil|report)\b/i,
   answer:'Untuk mengunduh hasil, buka Profil > Aktivitas belajar atau menu Riwayat, pilih sesi yang sudah selesai, lalu tekan Unduh PDF. Laporan sesi terverifikasi berisi nilai, jawaban, dan pembahasan yang tersedia.'},
  {pattern:/\b(rekomendasi|materi\s+(?:lemah|sulit|salah)|banyak\s+salah|belajar\s+apa|latih\s+materi)\b/i,
   answer:'Di Beranda, bagian Rekomendasi Belajar menampilkan materi dari lima sesi terverifikasi terbaru. Materi dengan minimal lima jawaban dan akurasi di bawah 70% ditandai merah. Tekan Latih materi untuk memperbaikinya.'},
  {pattern:/\b(pengulangan|ulang\s+latihan|mengulang|retake|latihan\s+ulang|mengerjakan\s+lagi)\b/i,
   answer:'Kamu boleh mengulang latihan. Untuk latihan wajib, hanya sesi pertama yang terverifikasi setiap hari (WIB) menjadi nilai resmi. Sesi ulang tetap muncul di Riwayat, tetapi tidak mengganti nilai resmi atau menambah XP wajib hari itu.'},
  {pattern:/\b(peringkat|ranking|leaderboard|urutan\s+siswa|klasemen)\b/i,
   answer:'Buka menu Peringkat untuk melihat posisi siswa di Sekolah, Jurusan, atau Kelas. Peringkat memakai rata-rata nilai wajib resmi yang terverifikasi oleh server, bukan total XP.'},
  {pattern:/\b(xp|poin\s+pengalaman|streak|season|level|pengalaman)\b/i,
   answer:'Lihat Profil > Ringkasan untuk XP, level, streak, dan season. XP wajib tidak ditambah lagi oleh sesi ulang pada hari yang sama. Nilai peringkat tetap dihitung terpisah dari XP.'},
  {pattern:/\b(nilai|skor|score|penilaian|jawaban\s+benar|jawaban\s+salah|hasil\s+ujian)\b/i,
   answer:'Nilai dihitung dan disimpan oleh Supabase. Latihan wajib pertama yang terverifikasi pada setiap hari menjadi nilai resmi. Rincian benar, salah, timeout, dan pembahasan dapat dilihat di Riwayat.'},
  {pattern:/\b(password|kata\s+sandi|sandi|reset\s+akun|lupa\s+password)\b/i,
   answer:'Kalau masih bisa masuk, buka Profil > Pengaturan akun > Ganti password. Jika tidak bisa masuk, hubungi admin sekolah agar dibantu sesuai prosedur akun sekolah.'},
  {pattern:/\b(login|log\s*in|masuk\s+akun|daftar|registrasi|akun\s+baru|buat\s+akun)\b/i,
   answer:'Akun siswa dibuat oleh admin sekolah. Masuk menggunakan identitas dan password yang disediakan sekolah. Kalau data akun tidak cocok, hubungi admin.'},
  {pattern:/\b(kelas|jurusan|angkatan|tingkat|identitas\s+siswa|nama\s+akun)\b/i,
   answer:'Nama, kelas, dan jurusan mengikuti data yang ditetapkan admin sekolah. Tingkat X, XI, XII merupakan kelas 1, 2, 3 SMK. Mintalah admin memperbaiki data yang keliru.'},
  {pattern:/\b(foto\s+profil|avatar|profil|profile)\b/i,
   answer:'Buka Profil untuk melihat data belajar dan identitasmu. Tekan ikon kamera pada foto profil untuk menggantinya; perubahan kelas atau jurusan harus melalui admin sekolah.'},
  {pattern:/\b(timer|batas\s+waktu|durasi|30\s*menit|timeout|waktu\s+soal)\b/i,
   answer:'Latihan wajib menargetkan 100 soal dengan batas waktu total 30 menit. Timer soal dan sesi dikendalikan server. Jika waktu soal habis, soal ditandai TIMEOUT dan berlanjut otomatis.'},
  {pattern:/\b(riwayat|pembahasan|jawaban\s+saya|soal\s+selesai)\b/i,
   answer:'Buka Riwayat atau Profil > Aktivitas belajar. Pilih sesi selesai untuk melihat detail benar/salah dan pembahasan, atau unduh laporan PDF. Sesi ulang juga tersimpan di sini.'},
  {pattern:/\b(perkalian|kali\s+berapa|cara\s+kali)\b/i,
   answer:'Perkalian adalah penjumlahan berulang. Contoh: 12 × 3 = 12 + 12 + 12 = 36. Kamu bisa mengetik 12 x 3 untuk menghitung.'},
  {pattern:/\b(pembagian|dibagi|bagi\s+berapa|cara\s+bagi)\b/i,
   answer:'Pembagian adalah kebalikan dari perkalian. Contoh: 36 ÷ 3 = 12, karena 12 × 3 = 36. Ketik 36 / 3 untuk menghitung.'},
  {pattern:/\b(penjumlahan|tambah|ditambah)\b/i,
   answer:'Penjumlahan menggabungkan bilangan. Contoh 25 + 17 = 42. Ketik 25 + 17 untuk mencoba.'},
  {pattern:/\b(pengurangan|kurang|dikurangi)\b/i,
   answer:'Pengurangan mencari selisih dua bilangan. Contoh 25 - 17 = 8. Ketik 25 - 17 untuk mencoba.'},
  {pattern:/\b(persentase|persen|prosentase)\b/i,
   answer:'Untuk menghitung persentase, kalikan bilangan dengan persentase lalu bagi 100. Misalnya 30% dari 180 = 54. Kamu juga bisa mengetik 30% dari 180.'},
  {pattern:/\b(fisika|satuan)\b/i,
   answer:'Untuk mengerjakan soal fisika, tulis besaran diketahui, apa yang ditanya, dan satuannya. Pilih rumus yang tepat dan pastikan satuan konsisten sebelum menghitung.'},
  {pattern:/\b(bank\s+soal|latihan\s+mandiri|soal\s+wajib|jenis\s+soal)\b/i,
   answer:'Di Beranda, pilih Latihan Wajib untuk sesi resmi atau salah satu materi di Bank Soal untuk latihan mandiri. Soal dan penilaiannya dikendalikan sistem sekolah.'},
  {pattern:/\b(admin|pengaturan\s+sekolah|impor|import|excel)\b/i,
   answer:'Admin sekolah mengelola akun, kelas, jurusan, dan Bank Soal. Fitur impor dan ekspor Excel disediakan di panel admin, bukan di akun siswa.'},
  {pattern:/\b(privasi|offline|internet|data\s+pribadi|api)\b/i,
   answer:'Chatbot ini memakai aturan bantuan lokal tanpa layanan AI eksternal. Jawaban, nilai, dan sesi ujian siswa tetap dikelola aplikasi sekolah serta Supabase dengan izin akses masing-masing.'},
  {pattern:/\b(halo|hai|hello|pagi|siang|sore|malam|permisi|assalamualaikum)\b/i,
   answer:'Halo! Ada yang ingin ditanyakan? Aku bisa membantu fitur VOKASI, latihan, nilai, laporan PDF, atau hitungan matematika dasar.'}
];

export function getVokasiChatbotReply(input:string):VokasiChatReply{
  const trimmed=input.trim().slice(0,250);
  if(!trimmed)return {text:'Tulis pertanyaan terlebih dahulu, ya.',recognized:false,kind:'fallback'};
  const arithmetic=calculate(trimmed);
  if(arithmetic!==null)return {text:arithmetic,recognized:true,kind:'calculation'};
  const entry=guide.find(row=>row.pattern.test(trimmed.toLocaleLowerCase('id-ID')));
  if(entry)return {text:entry.answer,recognized:true,kind:'guide'};
  return {text:'Aku belum punya jawaban khusus untuk itu. Aku bisa bantu fitur VOKASI seperti nilai, PDF, rekomendasi materi, kelas, dan hitungan dasar seperti 12 x 3 atau 30% dari 180.',recognized:false,kind:'fallback'};
}
