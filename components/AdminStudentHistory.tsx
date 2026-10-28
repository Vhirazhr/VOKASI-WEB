'use client';
import { nativeRpc } from '@/lib/native-rpc';
import {useEffect,useState} from 'react';
import {CheckCircle2,Clock3,RefreshCw} from 'lucide-react';
type Row={session_key:string;completed_at_ms:number;score:number;correct:number;question_count:number;practice_category:null|string;is_official:boolean};
const when=(ms:number)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(ms))+' WIB';
export default function AdminStudentHistory({authId}:{authId:string}){
 const [rows,setRows]=useState<Row[]>([]);
 const [busy,setBusy]=useState(true),[error,setError]=useState('');
 const [shown,setShown]=useState(6);
 useEffect(()=>{
  let active=true;
  async function load(){
   const {data,error:e}=await nativeRpc('vokasi_admin_student_history',{p_student:authId,p_limit:40});
   if(!active)return;
   if(e)setError('Riwayat belum bisa dimuat: '+e.message);
   else setRows(Array.isArray(data)?data as Row[]:[]);
   setBusy(false);
  }
  void load();
  return()=>{active=false;};
 },[authId]);
 return <section className="admin-student-history">
  <header><div><strong>Riwayat nilai wajib</strong><small>Hasil terverifikasi Supabase · maksimal 40 sesi terbaru</small></div><Clock3 size={18}/></header>
  {busy?<p className="admin-student-history-empty"><RefreshCw size={16}/> Memuat riwayat siswa...</p>:
   error?<p role="alert" className="admin-student-history-empty">{error}</p>:
   rows.length===0?<p className="admin-student-history-empty">Belum ada riwayat wajib terverifikasi untuk siswa ini.</p>:
   <><div className="admin-student-history-list">
     {rows.slice(0,shown).map(row=><div key={row.session_key}>
       <span><b>{when(row.completed_at_ms)}</b><small>{row.is_official?<><CheckCircle2 size={13}/> Nilai resmi harian</>:'Pengulangan · tidak mengganti nilai resmi'}</small></span>
       <strong>{row.score}<small>/100</small></strong>
       <span className="admin-student-history-correct">{row.correct}/{row.question_count} benar</span>
     </div>)}
   </div>
   {rows.length>shown&&<button className="admin-student-history-more" type="button" onClick={()=>setShown(n=>Math.min(n+10,rows.length))}>Lihat {Math.min(10,rows.length-shown)} sesi lagi</button>}</>}
 </section>;
}
