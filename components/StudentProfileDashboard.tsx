'use client';

import {useMemo,useState} from 'react';
import Link from 'next/link';
import {ArrowRight,Award,BarChart3,BookOpen,Camera,Check,CheckCircle2,ChevronDown,Clock3,Eye,EyeOff,Flame,GraduationCap,History,KeyRound,LockKeyhole,LogOut,ShieldCheck,Sparkles,Target,Trophy,UserRound,Wallet} from 'lucide-react';
import StudentAvatar from '@/components/StudentAvatar';
import ReviewHistory from '@/components/ReviewHistory';
import {uploadOwnAvatar} from '@/lib/student-avatar';
import {officialMandatoryAttempts,wibDate} from '@/lib/school';
import {supabase} from '@/lib/supabase';
import type {Attempt,StudentProfile} from '@/lib/types';
import '@/app/student-profile-dashboard.css';

type ProfileTab='summary'|'activity'|'account';
type HistoryType='all'|'mandatory'|'practice';
type MonthPoint={key:string;label:string;score:number|null;days:number};

const number=(x:number)=>x.toLocaleString('id-ID');
const hasProof=(a:Attempt)=>a.signature?.startsWith('WEB-SERVER-v1:')===true;
const stamp=(ms:number)=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));
const wibMonth=(ms:number)=>wibDate(ms).slice(0,7);

function levelFromXp(xp:number){
 let level=1,start=0,cost=100;
 while(xp>=start+cost&&level<500){start+=cost;level+=1;cost+=50;}
 return {level,start,next:start+cost,progress:Math.max(0,Math.min(100,Math.round((xp-start)*100/cost)))};
}
function weekActivity(attempts:Attempt[]){
 const active=new Set(attempts.filter(a=>a.answered>0).map(a=>wibDate(a.completed_at_ms)));
 return Array.from({length:7},(_,index)=>{
   const ms=Date.now()-(6-index)*86400000;
   return {day:wibDate(ms),label:new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',weekday:'short'}).format(new Date(ms)),done:active.has(wibDate(ms))};
 });
}
function streakCount(attempts:Attempt[]){
 const dates=new Set(attempts.filter(a=>a.answered>0).map(a=>wibDate(a.completed_at_ms)));
 const start=dates.has(wibDate())?0:1;
 let streak=0;
 while(streak<3660&&dates.has(wibDate(Date.now()-(start+streak)*86400000)))streak++;
 return streak;
}
function monthPerformance(official:Attempt[]):MonthPoint[]{
 const now=wibDate().split('-').map(Number);
 return Array.from({length:6},(_,index)=>{
   const utc=new Date(Date.UTC(now[0],now[1]-6+index,1));
   const key=utc.getUTCFullYear()+'-'+String(utc.getUTCMonth()+1).padStart(2,'0');
   const rows=official.filter(a=>wibMonth(a.completed_at_ms)===key);
   const score=rows.length?Math.round(rows.reduce((total,row)=>total+row.score,0)/rows.length):null;
   return {key,label:new Intl.DateTimeFormat('id-ID',{month:'short',timeZone:'UTC'}).format(utc),score,days:rows.length};
 });
}

function ActivityEntries({rows,busy,officialKeys}:{rows:Attempt[];busy:boolean;officialKeys:Set<string>}){
  if(busy)return <div className="vprofile-activity-empty">Memuat aktivitas dari Supabase...</div>;
  if(!rows.length)return <div className="vprofile-activity-empty"><History size={23}/><strong>Belum ada sesi latihan</strong><span>Hasil latihan akan muncul setelah kamu menyelesaikan soal.</span></div>;
  return <div className="vprofile-activity-list">{rows.map(a=>{
    const officialResult=a.practice_category===null&&officialKeys.has(a.session_key);
    const repeat=a.practice_category===null&&hasProof(a)&&!officialResult;
    return <details className="vprofile-attempt" key={a.session_key}>
      <summary>
       <span className="vprofile-attempt-icon"><BookOpen size={17}/></span>
       <span className="vprofile-attempt-name"><b>{a.practice_category||'Latihan wajib'}</b><small>{stamp(a.completed_at_ms)} WIB · {a.question_count} soal</small></span>
       <span className="vprofile-attempt-meta"><strong>{a.score}<small>/100</small></strong><small>{officialResult?'Resmi harian':repeat?'Latihan ulang':hasProof(a)?'Terverifikasi':'Riwayat lama'}</small></span>
       <ChevronDown size={16} className="vprofile-attempt-chevron"/>
      </summary>
      <div className="vprofile-attempt-details">
       <span><b>{a.correct}</b><small>Benar</small></span>
       <span><b>{a.answered}</b><small>Terjawab</small></span>
       <span><b>+{a.earned_xp||0}</b><small>XP sesi</small></span>
       <span><b>{Math.round((a.seconds_spent||0)/60)} m</b><small>Durasi</small></span>
      </div>
      {hasProof(a)?<ReviewHistory sessionId={a.session_key}/>:<p className="vprofile-attempt-note">Catatan lama belum memiliki pembahasan yang diverifikasi server.</p>}
    </details>;
   })}</div>;
 }


export default function StudentProfileDashboard({profile,attempts,busy,avatarUrl,onAvatarUploaded,onLogout}:{
 profile:StudentProfile;attempts:Attempt[];busy:boolean;avatarUrl?:string;
 onAvatarUploaded:(url:string)=>void;onLogout:()=>void;
}){
 const [tab,setTab]=useState<ProfileTab>('summary');
 const [historyType,setHistoryType]=useState<HistoryType>('all');
 const [historyDate,setHistoryDate]=useState('');
 const [historyShown,setHistoryShown]=useState(5);
 const [photoBusy,setPhotoBusy]=useState(false);
 const [photoNotice,setPhotoNotice]=useState('');
 const [photoError,setPhotoError]=useState(false);
 const [oldPass,setOldPass]=useState('');
 const [newPass,setNewPass]=useState('');
 const [passConfirm,setPassConfirm]=useState('');
 const [showPass,setShowPass]=useState(false);
 const [passBusy,setPassBusy]=useState(false);
 const [passNotice,setPassNotice]=useState('');
 const [passError,setPassError]=useState(false);

 const verified=useMemo(()=>attempts.filter(hasProof),[attempts]);
 const official=useMemo(()=>officialMandatoryAttempts(attempts),[attempts]);
 const lifetimeXp=verified.reduce((s,a)=>s+Math.max(0,a.earned_xp||0),0);
 const season=new Set<string>();
 const nowWib=wibDate();
 const [y,m]=nowWib.split('-').map(Number);
 const seasonQuarter=Math.ceil(m/3);
 for(let mo=(seasonQuarter-1)*3+1;mo<=seasonQuarter*3;mo++)season.add(y+'-'+String(mo).padStart(2,'0'));
 const seasonXp=verified.filter(a=>season.has(wibMonth(a.completed_at_ms))).reduce((s,a)=>s+Math.max(0,a.earned_xp||0),0);
 const level=levelFromXp(lifetimeXp);
 const answeredQuestions=verified.reduce((s,a)=>s+a.question_count,0);
 const correct=verified.reduce((s,a)=>s+a.correct,0);
 const accuracy=answeredQuestions?Math.round(correct/answeredQuestions*100):null;
 const average=official.length?Math.round(official.reduce((s,a)=>s+a.score,0)/official.length):null;
 const best=official.length?Math.max(...official.map(a=>a.score)):null;
 const week=weekActivity(verified);
 const weekDone=week.filter(d=>d.done).length;
 const streak=streakCount(verified);
 const totalSeconds=verified.reduce((s,a)=>s+Math.max(0,a.seconds_spent||0),0);
 const studyDuration=totalSeconds>=3600?Math.floor(totalSeconds/3600)+' j '+Math.floor((totalSeconds%3600)/60)+' m':Math.max(0,Math.round(totalSeconds/60))+' m';
 const monthly=monthPerformance(official);
 const latest=useMemo(()=>[...attempts].sort((a,b)=>b.completed_at_ms-a.completed_at_ms),[attempts]);
 const filtered=latest.filter(a=>(historyType==='all'||(historyType==='mandatory'?a.practice_category===null:a.practice_category!==null))&&(!historyDate||wibDate(a.completed_at_ms)===historyDate));
 const officialKeys=new Set(official.map(a=>a.session_key));

 async function upload(file?:File){
  if(!file)return;
  setPhotoBusy(true);setPhotoNotice('');setPhotoError(false);
  try{
   const url=await uploadOwnAvatar(profile,file);
   onAvatarUploaded(url);
   setPhotoNotice('Foto profil berhasil diperbarui.');
  }catch(e){
   setPhotoError(true);setPhotoNotice(e instanceof Error?e.message:'Foto tidak dapat diunggah.');
  }finally{setPhotoBusy(false);}
 }
 async function changePassword(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setPassNotice('');setPassError(false);
  if(newPass.length<8||newPass!==passConfirm){setPassError(true);setPassNotice('Password baru minimal 8 karakter dan konfirmasinya harus sama.');return;}
  if(!oldPass){setPassError(true);setPassNotice('Masukkan password saat ini.');return;}
  setPassBusy(true);
  try{
   const db=supabase();
   const {data:{user},error:userErr}=await db.auth.getUser();
   if(userErr||!user||!user.email||user.id!==profile.authId)throw new Error('Sesi akun tidak valid. Masuk kembali untuk mengganti password.');
   const {data:check,error:checkErr}=await db.auth.signInWithPassword({email:user.email,password:oldPass});
   if(checkErr||check.user?.id!==profile.authId)throw new Error('Password saat ini tidak cocok.');
   const {error:updateErr}=await db.auth.updateUser({password:newPass});
   if(updateErr)throw new Error('Gagal menyimpan password baru: '+updateErr.message);
   setOldPass('');setNewPass('');setPassConfirm('');
   setPassNotice('Password berhasil diperbarui. Gunakan password baru saat masuk berikutnya.');
  }catch(e){setPassError(true);setPassNotice(e instanceof Error?e.message:'Password tidak dapat diperbarui.');}
  finally{setPassBusy(false);}
 }
 function chooseTab(next:ProfileTab){setTab(next);setHistoryShown(5);}


 return <main className="vokasi-profile-page">
   <section className="vprofile-hero">
     <div className="vprofile-hero-copy">
       <span className="vprofile-hero-kicker"><GraduationCap size={16}/> AKUN PELAJAR TERVERIFIKASI</span>
       <h1>Selamat datang, {profile.fullName.trim().split(/\s+/)[0]}.</h1>
       <p>Pantau perkembangan belajarmu dan terus tingkatkan pencapaian.</p>
     </div>
     <div className="vprofile-week-highlight">
       <div className="vprofile-ring" style={{background:'conic-gradient(#ffffff '+weekDone/7*100+'%,#ffffff4a 0)'}}><span>{Math.round(weekDone/7*100)}%</span></div>
       <div><small>AKTIVITAS 7 HARI</small><strong>{weekDone} dari 7 hari aktif</strong><p>{weekDone?streak+' hari streak saat ini':'Mulai berlatih untuk mengisi progres minggu ini'}</p></div>
     </div>
   </section>
   <div className="vprofile-layout">
    <aside className="vprofile-identity">
      <div className="vprofile-portrait-wrap">
       <span className="vprofile-portrait-ring">
        <StudentAvatar name={profile.fullName} url={avatarUrl} className="vprofile-portrait" size={140}/>
       </span>
       <label className="vprofile-portrait-camera" title="Pasang atau ganti foto profil"><Camera size={20}/>
        <input aria-label="Unggah foto profil JPG" type="file" accept="image/jpeg" disabled={photoBusy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void upload(file);}}/>
       </label>
      </div>
      <div className="vprofile-verified"><CheckCircle2 size={14}/> AKUN TERDAFTAR</div>
      <h2>{profile.fullName}</h2>
      <p className="vprofile-username">@{profile.username}</p>
      <span className="vprofile-role"><GraduationCap size={16}/> Siswa VOKASI</span>
      <div className="vprofile-identity-divider"/>
      <dl>
       <div><span><UserRound size={18}/></span><dt>Nama lengkap</dt><dd>{profile.fullName}</dd></div>
       <div><span><GraduationCap size={18}/></span><dt>Kelas & jurusan</dt><dd>{profile.className}<small>{profile.majorName}</small></dd></div>
       <div><span><ShieldCheck size={18}/></span><dt>Identitas sekolah</dt><dd>Terverifikasi di akun sekolah</dd></div>
      </dl>
      {photoNotice&&<p role="status" className={'vprofile-notice '+(photoError?'is-error':'')}>{photoNotice}</p>}
      <button type="button" className="vprofile-edit-button" onClick={()=>chooseTab('account')}><KeyRound size={17}/> Pengaturan akun</button>
      <small className="vprofile-photo-note">{photoBusy?'Mengunggah foto...':'Ketuk ikon kamera untuk ganti foto (JPG, maks. 1 MB).'}</small>
      <button type="button" className="vprofile-logout" onClick={()=>{if(window.confirm('Keluar dari akun VOKASI?'))onLogout();}}><LogOut size={16}/> Keluar akun</button>
    </aside>
    <div className="vprofile-main">
      <nav className="vprofile-tabs" aria-label="Bagian profil">
        <button type="button" aria-pressed={tab==='summary'} className={tab==='summary'?'active':''} onClick={()=>chooseTab('summary')}>Ringkasan</button>
        <button type="button" aria-pressed={tab==='activity'} className={tab==='activity'?'active':''} onClick={()=>chooseTab('activity')}>Aktivitas belajar</button>
        <button type="button" aria-pressed={tab==='account'} className={tab==='account'?'active':''} onClick={()=>chooseTab('account')}>Pengaturan akun</button>
      </nav>
      {tab==='summary'&&<>
       <div className="vprofile-kpis">
        <div className="vprofile-kpi"><span className="vprofile-kpi-icon blue"><BarChart3 size={24}/></span><span><small>Rata-rata nilai resmi</small><strong>{busy?'—':average??'—'}</strong><em>{official.length} hari latihan wajib</em></span></div>
        <div className="vprofile-kpi"><span className="vprofile-kpi-icon amber"><Trophy size={24}/></span><span><small>Nilai tertinggi</small><strong>{busy?'—':best??'—'}</strong><em>Dari latihan wajib resmi</em></span></div>
        <div className="vprofile-kpi"><span className="vprofile-kpi-icon green"><BookOpen size={24}/></span><span><small>Latihan selesai</small><strong>{busy?'—':verified.length}</strong><em>Seluruh sesi terverifikasi</em></span></div>
        <div className="vprofile-kpi"><span className="vprofile-kpi-icon violet"><Clock3 size={24}/></span><span><small>Waktu belajar</small><strong>{busy?'—':studyDuration}</strong><em>Akumulasi waktu sesi</em></span></div>
       </div>
       <div className="vprofile-insights">
         <section className="vprofile-panel vprofile-level">
           <div className="vprofile-section-title"><span>PERKEMBANGANMU</span><h3>Level & pengalaman</h3></div>
           <div className="vprofile-level-top"><span className="vprofile-level-badge"><Award size={25}/></span><div><small>LEVEL SAAT INI</small><strong>Level {level.level}</strong></div><b>{number(lifetimeXp)} XP</b></div>
           <div className="vprofile-level-track"><span style={{width:level.progress+'%'}}/></div>
           <div className="vprofile-level-footer"><span>{level.progress}% menuju level berikutnya</span><b>{number(level.next-lifetimeXp)} XP lagi</b></div>
           <div className="vprofile-mini-metrics">
            <div><span><Target size={17}/></span><strong>{accuracy===null?'—':accuracy+'%'}</strong><small>Akurasi</small></div>
            <div><span><Flame size={17}/></span><strong>{streak} hari</strong><small>Streak aktif</small></div>
            <div><span><Wallet size={17}/></span><strong>{number(seasonXp)} XP</strong><small>Season {seasonQuarter} · {y}</small></div>
           </div>
         </section>
         <section className="vprofile-panel vprofile-streak">
           <div className="vprofile-section-title"><span>KONSISTENSI</span><h3>Streak 7 hari</h3></div>
           <div className="vprofile-streak-symbol"><Flame size={42}/></div>
           <strong>{streak} hari berturut-turut</strong>
           <p>Aktivitas latihan terverifikasi dalam 7 hari terakhir.</p>
           <div className="vprofile-week-days">
            {week.map(d=><div key={d.day}><span className={d.done?'is-done':''}>{d.done?<Check size={18}/>:<span>·</span>}</span><small>{d.label}</small></div>)}
           </div>
           <p className="vprofile-week-foot">{weekDone} dari 7 hari tercatat aktif. Konsistensi dihitung dari aktivitas nyata.</p>
         </section>
       </div>
       <div className="vprofile-insights vprofile-followup">
        <section className="vprofile-panel vprofile-chart">
         <div className="vprofile-section-title"><span>PERFORMA BELAJAR</span><h3>Perkembangan nilai</h3><p>Rata-rata nilai resmi latihan wajib, enam bulan terakhir</p></div>
         <div className="vprofile-bars">
           {monthly.map(point=><div key={point.key} className="vprofile-month">
             <div className="vprofile-month-track" title={point.score===null?'Belum ada nilai resmi':point.days+' hari · Rata-rata '+point.score}>
               {point.score!==null&&<span style={{height:Math.max(3,point.score)+'%'}}/>}
             </div>
             <strong>{point.score??'—'}</strong><small>{point.label}</small>
           </div>)}
         </div>
         {!monthly.some(p=>p.score!==null)&&<p className="vprofile-chart-empty">Grafik akan terisi setelah hasil latihan wajib resmi tersedia.</p>}
        </section>
        <section className="vprofile-panel vprofile-season">
          <div className="vprofile-section-title"><span>RANGKUMAN</span><h3>Musim berjalan</h3></div>
          <div className="vprofile-season-star"><Sparkles size={40}/></div>
          <h4>Season {seasonQuarter} · {y}</h4>
          <p>XP dan sesi dari aktivitasmu yang benar-benar tersimpan.</p>
          <div className="vprofile-season-totals"><span><strong>{number(seasonXp)}</strong><small>XP season</small></span><span><strong>{verified.filter(a=>season.has(wibMonth(a.completed_at_ms))).length}</strong><small>Sesi selesai</small></span></div>
        </section>
       </div>
       <section className="vprofile-panel vprofile-recent">
        <div className="vprofile-section-title"><span>TERAKHIR DIKERJAKAN</span><div className="vprofile-section-title-row"><h3>Aktivitas terbaru</h3><button type="button" onClick={()=>chooseTab('activity')}>Lihat semua <ArrowRight size={15}/></button></div></div>
        <ActivityEntries rows={latest.slice(0,3)} busy={busy} officialKeys={officialKeys}/>
       </section>
      </>}
      {tab==='activity'&&<section className="vprofile-panel vprofile-all-activity">
       <div className="vprofile-section-title"><span>JEJAK BELAJAR</span><h3>Riwayat dan pembahasan</h3><p>Semua sesi, termasuk pengulangan, tetap tersedia. Hanya hasil pertama per hari yang menghitung nilai resmi wajib.</p></div>
       <div className="vprofile-history-filters">
        <label>Jenis latihan<select value={historyType} onChange={e=>{setHistoryType(e.target.value as HistoryType);setHistoryShown(5);}}><option value="all">Semua</option><option value="mandatory">Latihan wajib</option><option value="practice">Latihan mandiri</option></select></label>
        <label>Tanggal<input type="date" value={historyDate} onChange={e=>{setHistoryDate(e.target.value);setHistoryShown(5);}}/></label>
       </div>
       <p className="vprofile-history-count">{busy?'Memuat...':filtered.length+' sesi ditemukan · terbaru lebih dulu'}</p>
       <ActivityEntries rows={filtered.slice(0,historyShown)} busy={busy} officialKeys={officialKeys}/>
       {historyShown<filtered.length&&<button type="button" className="vprofile-show-more" onClick={()=>setHistoryShown(n=>n+5)}>Muat 5 lainnya ({filtered.length-historyShown} tersisa) <ArrowRight size={16}/></button>}
       <Link href="/siswa/riwayat" className="vprofile-full-history-link">Buka halaman Riwayat lengkap <ArrowRight size={16}/></Link>
      </section>}
      {tab==='account'&&<div className="vprofile-settings">
       <section className="vprofile-panel">
        <div className="vprofile-section-title"><span>IDENTITAS SEKOLAH</span><h3>Informasi akun</h3></div>
        <div className="vprofile-account-identity"><StudentAvatar name={profile.fullName} url={avatarUrl} className="vprofile-settings-avatar" size={68}/><div><b>{profile.fullName}</b><small>{profile.className} · {profile.majorName}</small></div></div>
        <p className="vprofile-settings-hint">Nama, username, kelas, dan jurusan dikelola oleh admin sekolah. Kamu bisa mengubah foto profil melalui ikon kamera di kartu sebelah kiri.</p>
       </section>
       <section className="vprofile-panel">
        <div className="vprofile-section-title"><span>KEAMANAN AKUN</span><h3>Ganti password</h3><p>Masukkan password saat ini untuk memastikan bahwa akun ini benar-benar milikmu.</p></div>
        <form className="vprofile-password-form" onSubmit={e=>void changePassword(e)}>
         <label>Password saat ini<input type={showPass?'text':'password'} autoComplete="current-password" value={oldPass} onChange={e=>setOldPass(e.target.value)} required/></label>
         <label>Password baru<input type={showPass?'text':'password'} autoComplete="new-password" minLength={8} value={newPass} onChange={e=>setNewPass(e.target.value)} required placeholder="Minimal 8 karakter"/></label>
         <label>Ulangi password baru<input type={showPass?'text':'password'} autoComplete="new-password" value={passConfirm} onChange={e=>setPassConfirm(e.target.value)} required/></label>
         <label className="vprofile-reveal-password"><input type="checkbox" checked={showPass} onChange={e=>setShowPass(e.target.checked)}/>{showPass?<EyeOff size={16}/>:<Eye size={16}/>} Tampilkan password</label>
         {passNotice&&<p className={'vprofile-notice '+(passError?'is-error':'')} role="status">{passNotice}</p>}
         <button type="submit" disabled={passBusy||newPass.length<8||!oldPass||newPass!==passConfirm}><LockKeyhole size={17}/>{passBusy?'Menyimpan perubahan...':'Simpan password baru'}</button>
        </form>
       </section>
      </div>}
    </div>
   </div>
  </main>;
}
