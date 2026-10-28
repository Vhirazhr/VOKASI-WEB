'use client';
import {useEffect,useRef,useState} from 'react';
import {Bot,Send,ShieldCheck,MessageCircle} from 'lucide-react';

type Message={who:'assistant'|'student';body:string};
const guide:{keywords:string[];answer:string}[]=[
 {keywords:['akun','registrasi','daftar'],answer:'Akun siswa dibuat oleh admin sekolah. Jika belum punya akun, hubungi admin. Kelas dan jurusan ditentukan pihak sekolah.'},
 {keywords:['password','sandi','login','masuk'],answer:'Gunakan akun sekolah untuk masuk. Untuk mengganti password di web, buka Profil lalu Pengaturan akun.'},
 {keywords:['nilai','score','skor','salah','benar'],answer:'Server menghitung nilai secara otomatis. Hasil wajib terverifikasi pertama tiap hari menjadi nilai resmi. Pengulangan tetap tersimpan tanpa mengubah nilai resmi.'},
 {keywords:['xp','season','streak','level'],answer:'XP, streak, level, dan aktivitas belajar dapat dilihat pada Profil > Ringkasan. XP wajib tidak bertambah karena pengulangan pada hari yang sama.'},
 {keywords:['peringkat','ranking','leaderboard'],answer:'Menu Peringkat berisi posisi berdasarkan rata-rata nilai resmi latihan wajib. Kamu bisa memilih lingkup Sekolah, Jurusan, atau Kelas.'},
 {keywords:['pdf','unduh','laporan','report'],answer:'Buka Profil > Aktivitas belajar atau menu Riwayat. Pilih sesi dan tekan Unduh PDF. Hasil sesi terverifikasi dapat memuat kunci dan pembahasan.'},
 {keywords:['rekomendasi','materi','lemah'],answer:'Di Beranda, bagian Rekomendasi Belajar menandai materi yang perlu diulang dari lima sesi terverifikasi terbaru. Minimal lima jawaban dengan akurasi di bawah 70% diberi tanda merah.'},
 {keywords:['waktu','timer','durasi'],answer:'Latihan wajib memiliki 100 soal dan durasi maksimal 30 menit. Timer dikendalikan server; waktu per soal mengikuti tingkat kesulitannya.'},
 {keywords:['kelas','jurusan','sekolah'],answer:'Kelas, jurusan, dan nama akun mengikuti data sekolah. Hubungi admin untuk koreksi data identitas.'},
 {keywords:['perkalian','kali'],answer:'Perkalian adalah penjumlahan berulang. Contoh: 12 x 3 = 12 + 12 + 12 = 36.'},
 {keywords:['pembagian','bagi'],answer:'Pembagian adalah kebalikan perkalian. Misalnya 36 / 3 = 12, karena 12 x 3 = 36.'},
 {keywords:['fisika','satuan'],answer:'Untuk soal fisika, tuliskan besaran yang diketahui dan ditanya, perhatikan satuan, lalu substitusikan nilainya ke rumus.'},
 {keywords:['privasi','data'],answer:'Hasil siswa disimpan di Supabase. Pembahasan hasil ujian hanya tersedia bagi pemilik sesi yang sudah selesai.'}
];
function answerFor(question:string){
 const value=question.trim().toLocaleLowerCase('id-ID');
 const m=value.match(/(-?\d{1,9})\s*([+\-x*\/:×÷])\s*(-?\d{1,9})/);
 if(m){
  const a=Number(m[1]),b=Number(m[3]),op=m[2];
  if(['/',':','÷'].includes(op)&&b===0)return 'Tidak bisa membagi bilangan dengan nol.';
  const result=op==='+'?a+b:op==='-'?a-b:['x','*','×'].includes(op)?a*b:a/b;
  return 'Hasil '+a+' '+op+' '+b+' = '+(Number.isInteger(result)?result:result.toFixed(3))+'.';
 }
 return guide.find(row=>row.keywords.some(keyword=>value.includes(keyword)))?.answer||
  'Aku bisa membantu penggunaan VOKASI dan matematika dasar. Coba tanya tentang nilai, rekomendasi belajar, unduh PDF, atau hitung 12 x 3.';
}
export default function StudentAssistant(){
 const [input,setInput]=useState('');
 const feedRef=useRef<HTMLDivElement>(null);
 const [messages,setMessages]=useState<Message[]>([{who:'assistant',body:'Halo! Aku Asisten VOKASI. Tanyakan seputar fitur belajar atau hitungan sederhana. Aku menggunakan panduan lokal, bukan AI atau akses ke data pribadimu.'}]);
 useEffect(()=>{
  if(feedRef.current)feedRef.current.scrollTop=feedRef.current.scrollHeight;
 },[messages]);
 function submit(){
  const prompt=input.trim().slice(0,250);
  if(!prompt)return;
  setMessages(old=>[...old,{who:'student' as const,body:prompt},{who:'assistant' as const,body:answerFor(prompt)}].slice(-32));
  setInput('');
 }
 return <section className="vokasi-assistant-panel vokasi-chatbot-conversation" aria-label="Percakapan chatbot VOKASI">
    <div className="vokasi-assistant-title"><span><Bot size={21}/></span><div><strong>Chatbot belajar VOKASI</strong><small>Panduan lokal dan bantuan hitung sederhana</small></div><span className="vokasi-chatbot-online"><span/>Siap membantu</span></div>
    <div className="vokasi-assistant-feed" role="log" aria-live="polite" aria-label="Pesan chatbot" ref={feedRef}>
     {messages.map((m,index)=><article key={index} className={'vokasi-assistant-message '+m.who}><small>{m.who==='student'?'KAMU':'CHATBOT VOKASI'}</small><p>{m.body}</p></article>)}
    </div>
    <div className="vokasi-assistant-prompts">{['Cara unduh PDF','Rekomendasi materi','Cara kerja nilai'].map(item=><button key={item} type="button" onClick={()=>{setMessages(old=>[...old,{who:'student' as const,body:item},{who:'assistant' as const,body:answerFor(item)}].slice(-32));}}>{item}</button>)}</div>
    <form className="vokasi-assistant-composer" onSubmit={event=>{event.preventDefault();submit();}}>
      <input autoComplete="off" value={input} onChange={e=>setInput(e.target.value.slice(0,250))} maxLength={250} aria-label="Pesan untuk Chatbot VOKASI" placeholder="Tulis pertanyaanmu di sini..." />
      <button type="submit" disabled={!input.trim()} aria-label="Kirim pesan"><Send size={18}/></button>
    </form>
    <p className="vokasi-assistant-note"><MessageCircle size={14}/> Chatbot panduan berbasis aturan, bukan AI. <ShieldCheck size={14}/> Tidak membaca jawaban ujian.</p>
   </section>;
}
