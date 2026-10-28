'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Bell,BellRing,BookOpen,Check,CheckCheck,Flame,ShieldCheck,Target} from 'lucide-react';
import type {Attempt,StudentProfile} from '@/lib/types';
import type {TopicInsight} from '@/lib/student-insights';
import {officialMandatoryAttempts,wibDate} from '@/lib/school';
import {rankRecommendedTopics} from '@/lib/student-insights';

type Notice={id:string;title:string;message:string;href:string;action:string;icon:'book'|'target'|'flame'};
export default function StudentNotices({profile,attempts,insights,busy}:{
 profile:StudentProfile;attempts:Attempt[];insights:TopicInsight[];busy:boolean;
}){
 const key='vokasi-student-notices-'+profile.authId;
 const prefKey='vokasi-remind-streak-'+profile.authId;
 const [read,setRead]=useState<Set<string>>(new Set());
 const [enabled,setEnabled]=useState(true);
 useEffect(()=>{
  try{
   const saved=JSON.parse(window.localStorage.getItem(key)||'[]');
   const value=window.localStorage.getItem(prefKey);
   queueMicrotask(()=>{setRead(new Set(Array.isArray(saved)?saved.filter((x:unknown)=>typeof x==='string'):[]));setEnabled(value!=='false');});
  }catch{/* Notifications work without local persistence. */}
 },[key,prefKey]);
 const notices=useMemo(()=>{
   const current=wibDate();
   const official=officialMandatoryAttempts(attempts);
   const verified=attempts.filter(a=>a.signature.startsWith('WEB-SERVER-v1:'));
   const messages:Notice[]=[];
   if(enabled&&!official.some(a=>wibDate(a.completed_at_ms)===current)){
     const previous=verified.some(a=>wibDate(a.completed_at_ms)===wibDate(Date.now()-86400000));
     messages.push({id:'daily-'+current,title:previous?'Lanjutkan streak belajarmu':'Latihan wajib hari ini belum selesai',
      message:previous?'Kamu sudah berlatih kemarin. Selesaikan latihan hari ini untuk melanjutkan kebiasaan belajarmu.':'Mulai latihan wajib untuk mencatat nilai resmi hari ini.',
      href:'/siswa',action:'Buka latihan',icon:previous?'flame':'book'});
   }
   const topic=rankRecommendedTopics(insights).find(row=>row.needsPractice);
   if(topic){
     messages.push({id:'weak-'+topic.category+'-'+current,title:'Fokus latihan: '+topic.category,
       message:'Dari '+topic.answered+' jawaban terakhir pada materi ini, '+topic.wrong+' tercatat salah. Coba ulangi latihan mandiri.',
       href:'/siswa#rekomendasi-belajar',action:'Lihat rekomendasi',icon:'target'});
   }
   if(official.length){
     const latest=official[0];
     messages.push({id:'score-'+latest.session_key,title:'Hasil latihan resmi tersimpan',
       message:'Nilai resmi hari '+wibDate(latest.completed_at_ms)+' adalah '+latest.score+'/100. Kamu bisa mengunduh laporan PDF dari Riwayat.',
       href:'/siswa/riwayat',action:'Buka riwayat',icon:'book'});
   }
   return messages;
 },[attempts,insights,enabled]);
 const unread=notices.filter(n=>!read.has(n.id));
 function save(next:Set<string>){
  setRead(new Set(next));
  try{window.localStorage.setItem(key,JSON.stringify([...next]));}catch{/* UI works without persistence. */}
 }
 function toggle(v:boolean){
  setEnabled(v);
  try{window.localStorage.setItem(prefKey,String(v));}catch{}
 }
 return <main className="vokasi-notices-page">
  <header className="vokasi-notices-hero"><span><BellRing size={16}/> RUANG BELAJAR</span><h1>Pemberitahuan siswa</h1><p>Pengingat dan hasil belajar dari aktivitas VOKASI milikmu sendiri.</p></header>
  <section className="vokasi-notices-panel">
   <div className="vokasi-notices-toolbar">
    <div><strong>{busy?'Memuat pemberitahuan...':unread.length+' pemberitahuan baru'}</strong><small>Berlaku pada browser yang sedang digunakan.</small></div>
    <button type="button" disabled={unread.length===0} onClick={()=>save(new Set([...read,...notices.map(n=>n.id)]))}><CheckCheck size={16}/> Tandai semua dibaca</button>
   </div>
   {busy?<p className="vokasi-notices-empty">Memuat aktivitas belajarmu...</p>:
    unread.length===0?<div className="vokasi-notices-empty"><Check size={30}/><strong>Belum ada pemberitahuan baru</strong><span>Saat ada hasil latihan atau materi yang perlu diulang, ringkasannya muncul di sini.</span></div>:
    <div className="vokasi-notices-list">
     {unread.map(n=>{const Icon=n.icon==='flame'?Flame:n.icon==='target'?Target:BookOpen;return <article key={n.id} className="vokasi-notice">
       <span className={'vokasi-notice-icon '+n.icon}><Icon size={20}/></span>
       <div><strong>{n.title}</strong><p>{n.message}</p>
        <div className="vokasi-notice-actions"><Link href={n.href}>{n.action}</Link><button type="button" onClick={()=>save(new Set([...read,n.id]))}>Tandai dibaca</button></div>
       </div>
      </article>})}
    </div>}
  </section>
  <section className="vokasi-notices-settings">
    <div><strong><Bell size={17}/> Pengingat belajar dalam aplikasi</strong><p>Menampilkan pengingat di sini jika latihan wajib hari ini belum selesai. Tidak mengirim notifikasi push di luar browser.</p></div>
    <label className="vokasi-notices-switch"><input type="checkbox" checked={enabled} onChange={e=>toggle(e.target.checked)}/><span>{enabled?'Aktif':'Nonaktif'}</span></label>
  </section>
  <p className="vokasi-notices-privacy"><ShieldCheck size={15}/> Pemberitahuan dibuat dari data belajar yang sudah tersedia. Status dibaca hanya tersimpan di browser ini.</p>
 </main>;
}
