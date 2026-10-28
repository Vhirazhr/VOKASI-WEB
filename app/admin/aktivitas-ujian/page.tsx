'use client';

import {useEffect,useMemo,useState} from 'react';
import {
  Activity,AlertTriangle,ArrowLeft,BookOpen,ChevronLeft,ChevronRight,
  ClipboardCopy,ClipboardPaste,Clock3,ExternalLink,Eye,EyeOff,
  FileWarning,Maximize2,MousePointer2,MousePointerClick,RefreshCw,Search,
  ShieldAlert,Users
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import {useSchoolAuth} from '@/lib/use-school-auth';
import {
  examActivityTimestamp,getExamActivityReport,
  type ExamActivityEvent,type ExamActivityEventType,type ExamActivityReport,type ExamActivityStudent
} from '@/lib/admin-exam-activity';
import '@/app/admin-workspace.css';
import '@/app/admin-students-ui.css';
import '@/app/admin-exam-activity.css';

const PAGE_SIZE=50;
const eventNames:Record<ExamActivityEventType,string>={
  tab_hidden:'Halaman ujian ditinggalkan',
  tab_visible:'Halaman ujian kembali aktif',
  window_blur:'Jendela kehilangan fokus',
  window_focus:'Jendela kembali fokus',
  copy:'Percobaan menyalin teks',
  paste:'Percobaan menempelkan teks',
  context_menu:'Menu konteks dibuka',
  fullscreen_exit:'Mode layar penuh ditutup',
  external_link:'Tautan eksternal diklik',
  ui_click:'Elemen halaman diklik',
  answer_option_selected:'Pilihan jawaban dipilih'
};
const indicatorTypes=new Set<ExamActivityEventType>([
  'tab_hidden','window_blur','copy','paste','context_menu','fullscreen_exit','external_link'
]);
function EventIcon({type}:{type:ExamActivityEventType}){
  if(type==='tab_hidden')return <EyeOff size={18}/>;
  if(type==='tab_visible'||type==='window_focus')return <Eye size={18}/>;
  if(type==='window_blur')return <EyeOff size={18}/>;
  if(type==='copy')return <ClipboardCopy size={18}/>;
  if(type==='paste')return <ClipboardPaste size={18}/>;
  if(type==='context_menu')return <MousePointer2 size={18}/>;
  if(type==='fullscreen_exit')return <Maximize2 size={18}/>;
  if(type==='external_link')return <ExternalLink size={18}/>;
  if(type==='answer_option_selected')return <BookOpen size={18}/>;
  return <MousePointerClick size={18}/>;
}
function detailFor(event:ExamActivityEvent){
  const parts:string[]=[];
  if(event.question_index!==null&&event.question_index>=0)parts.push('Soal '+(event.question_index+1));
  if(event.target_label)parts.push(event.target_label);
  if(event.target_kind)parts.push('Elemen: '+event.target_kind);
  if(event.detail)parts.push(event.detail);
  return parts.join(' · ')||'Tidak ada detail tambahan dari browser.';
}
export default function AdminExamActivityPage(){
  const {loading,error,logout}=useSchoolAuth('admin');
  const [days,setDays]=useState(7);
  const [search,setSearch]=useState('');
  const [selectedStudentId,setSelectedStudentId]=useState<string|null>(null);
  const [timelineOffset,setTimelineOffset]=useState(0);
  const [overview,setOverview]=useState<ExamActivityReport|null>(null);
  const [timeline,setTimeline]=useState<ExamActivityReport|null>(null);
  const [busy,setBusy]=useState(true);
  const [timelineBusy,setTimelineBusy]=useState(true);
  const [notice,setNotice]=useState('');
  const [timelineNotice,setTimelineNotice]=useState('');
  const [revision,setRevision]=useState(0);

  useEffect(()=>{
    if(loading||error)return;
    let active=true;
    void getExamActivityReport(days,1,0,null)
      .then(result=>{if(active){setOverview(result);setNotice('');}})
      .catch(e=>{if(active){setOverview(null);setNotice(e instanceof Error?e.message:'Gagal memuat ringkasan aktivitas ujian.');}})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[loading,error,days,revision]);

  useEffect(()=>{
    if(loading||error)return;
    let active=true;
    void getExamActivityReport(days,PAGE_SIZE,timelineOffset,selectedStudentId)
      .then(result=>{if(active){setTimeline(result);setTimelineNotice('');}})
      .catch(e=>{if(active){setTimeline(null);setTimelineNotice(e instanceof Error?e.message:'Gagal memuat detail aktivitas.');}})
      .finally(()=>{if(active)setTimelineBusy(false);});
    return()=>{active=false;};
  },[loading,error,days,timelineOffset,selectedStudentId,revision]);

  const students=useMemo(()=>overview?.students||[],[overview]);
  const filteredStudents=useMemo(()=>{
    const term=search.trim().toLocaleLowerCase('id-ID');
    if(!term)return students;
    return students.filter(student=>[
      student.student_name,student.username,student.class_name,student.major_name
    ].some(value=>value.toLocaleLowerCase('id-ID').includes(term)));
  },[students,search]);
  const totals=useMemo(()=>students.reduce((acc,student)=>({
    tabSwitches:acc.tabSwitches+student.tab_switches,
    clipboard:acc.clipboard+student.clipboard_events,
    links:acc.links+student.external_links,
    clicks:acc.clicks+student.click_events
  }),{tabSwitches:0,clipboard:0,links:0,clicks:0}),[students]);
  const selectedStudent:ExamActivityStudent|undefined=students.find(student=>student.auth_user_id===selectedStudentId);
  const events=timeline?.items||[];
  const pageNumber=Math.floor(timelineOffset/PAGE_SIZE)+1;
  const hasNext=events.length===PAGE_SIZE;

  function changeDays(value:number){
    setBusy(true);setTimelineBusy(true);setDays(value);setSelectedStudentId(null);setTimelineOffset(0);
  }
  function selectStudent(student:ExamActivityStudent){
    setTimelineBusy(true);setSelectedStudentId(student.auth_user_id);setTimelineOffset(0);
  }
  function changeTimelinePage(nextOffset:number){
    setTimelineBusy(true);setTimelineOffset(Math.max(0,nextOffset));
  }
  function refresh(){
    setNotice('');setTimelineNotice('');setBusy(true);setTimelineBusy(true);setRevision(value=>value+1);
  }

  if(loading)return <main className="page-loader">Memverifikasi akses admin...</main>;
  if(error)return <main className="page-loader">{error}</main>;

  return <AppShell role="admin" displayName="Admin Sekolah" onLogout={()=>void logout()}>
    <main className="admin-workspace admin-exam-activity">
      <section className="exam-activity-hero">
        <span className="exam-activity-kicker"><ShieldAlert size={15}/> MONITORING UJIAN</span>
        <h1>Aktivitas Ujian Siswa</h1>
        <p>Lihat ringkasan dan urutan kejadian yang terdeteksi selama sesi ujian: perpindahan dari halaman, copy/paste, klik elemen, serta tautan yang diklik. Laporan ini bersifat informatif dan tidak memberi hukuman otomatis.</p>
        <div className="exam-activity-controls">
          <label>Periode laporan
            <select value={days} onChange={event=>changeDays(Number(event.target.value))}>
              <option value={1}>24 jam terakhir</option><option value={7}>7 hari terakhir</option>
              <option value={30}>30 hari terakhir</option><option value={90}>90 hari terakhir</option>
            </select>
          </label>
          <button type="button" className="exam-activity-button" disabled={busy||timelineBusy} onClick={refresh}><RefreshCw size={15}/> Segarkan laporan</button>
        </div>
      </section>

      {notice&&<div className="exam-activity-alert" role="alert"><AlertTriangle size={16} style={{display:'inline',verticalAlign:'middle',marginRight:7}}/>{notice}<p>Pastikan migrasi SQL monitoring sudah dijalankan pada project Supabase yang dipakai website.</p></div>}

      <section className="exam-activity-stats" aria-label="Ringkasan aktivitas">
        <div className="exam-activity-stat"><span className="exam-activity-stat-icon"><Activity size={20}/></span><div><span>Total kejadian</span><strong>{busy?'—':(overview?.total_events||0).toLocaleString('id-ID')}</strong></div></div>
        <div className="exam-activity-stat"><span className="exam-activity-stat-icon"><Users size={20}/></span><div><span>Siswa tercatat</span><strong>{busy?'—':(overview?.students_count||0).toLocaleString('id-ID')}</strong></div></div>
        <div className="exam-activity-stat"><span className="exam-activity-stat-icon"><EyeOff size={20}/></span><div><span>Halaman ditinggalkan</span><strong>{busy?'—':totals.tabSwitches.toLocaleString('id-ID')}</strong></div></div>
        <div className="exam-activity-stat"><span className="exam-activity-stat-icon"><ClipboardCopy size={20}/></span><div><span>Copy/paste & menu konteks</span><strong>{busy?'—':totals.clipboard.toLocaleString('id-ID')}</strong></div></div>
      </section>

      <section className="exam-activity-panel">
        <header className="exam-activity-panel-head">
          <div><span className="exam-activity-kicker"><Users size={14}/> RINGKASAN PER SISWA</span><h2>Siapa yang memiliki catatan aktivitas?</h2><p>Pilih siswa untuk membuka laporan detail berdasarkan waktu kejadian.</p></div>
        </header>
        <div style={{padding:'14px 18px'}}>
          <label className="exam-activity-search"><Search size={17}/><input aria-label="Cari nama siswa, kelas, atau jurusan" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Cari nama siswa, kelas, atau jurusan..."/></label>
        </div>
        {busy?<div className="exam-activity-empty"><RefreshCw size={20}/> Memuat laporan dari database...</div>:
          filteredStudents.length===0?<div className="exam-activity-empty"><Users size={22}/>{students.length===0?'Belum ada aktivitas ujian yang tercatat pada periode ini.':'Tidak ada siswa yang cocok dengan pencarian.'}</div>:
          <div className="exam-activity-table-wrap">
            <table className="exam-activity-table">
              <thead><tr><th>Siswa</th><th>Kelas / Jurusan</th><th>Total catatan</th><th>Pindah tab</th><th>Copy/paste</th><th>Tautan</th><th>Detail</th></tr></thead>
              <tbody>{filteredStudents.map(student=><tr key={student.auth_user_id} className={selectedStudentId===student.auth_user_id?'exam-activity-selected':''}>
                <td><span className="exam-activity-student-name">{student.student_name}</span><span className="exam-activity-student-sub">{student.username||'Akun siswa'}</span></td>
                <td>{student.class_name}<span className="exam-activity-student-sub">{student.major_name}</span></td>
                <td><span className="exam-activity-count">{student.total_events}</span></td>
                <td><span className={'exam-activity-count '+(student.tab_switches?'warn':'')}>{student.tab_switches}</span></td>
                <td><span className={'exam-activity-count '+(student.clipboard_events?'warn':'')}>{student.clipboard_events}</span></td>
                <td><span className="exam-activity-count">{student.external_links}</span></td>
                <td><button type="button" className={'exam-activity-button '+(selectedStudentId===student.auth_user_id?'primary':'')} onClick={()=>selectStudent(student)}>{selectedStudentId===student.auth_user_id?'Sedang dilihat':'Lihat laporan'}</button></td>
              </tr>)}</tbody>
            </table>
          </div>}
        <div className="exam-activity-report-note">Jumlah dihitung dari kejadian browser yang berhasil tercatat. Perpindahan fokus tidak membuktikan siswa membuka aplikasi tertentu. Klik pada pilihan jawaban juga dicatat sebagai interaksi normal.</div>
      </section>

      <section className="exam-activity-panel">
        <header className="exam-activity-panel-head">
          <div><span className="exam-activity-kicker"><Clock3 size={14}/> KRONOLOGI KEJADIAN</span>
            <h2>{selectedStudent?'Laporan detail: '+selectedStudent.student_name:'Riwayat aktivitas terbaru'}</h2>
            <p>{selectedStudent?'Urutan aktivitas siswa ini selama '+days+' hari terakhir.':'Pilih siswa di ringkasan untuk menyaring kronologi berdasarkan akun tertentu.'}</p>
          </div>
          {selectedStudent&&<button type="button" className="exam-activity-button" onClick={()=>{setTimelineBusy(true);setSelectedStudentId(null);setTimelineOffset(0);}}><ArrowLeft size={15}/> Semua siswa</button>}
        </header>
        {timelineNotice&&<div className="exam-activity-alert" role="alert" style={{margin:14}}>{timelineNotice}</div>}
        {timelineBusy?<div className="exam-activity-empty"><RefreshCw size={20}/> Memuat kronologi aktivitas...</div>:
          events.length===0?<div className="exam-activity-empty"><FileWarning size={22}/>{selectedStudent?'Belum ada catatan aktivitas untuk siswa ini pada periode terpilih.':'Belum ada kronologi aktivitas pada periode terpilih.'}</div>:
          <div className="exam-activity-timeline">
            {events.map(event=>{
              const flagged=indicatorTypes.has(event.event_type);
              return <article className="exam-activity-event" key={event.id}>
                <span className={'exam-activity-event-icon '+(flagged?'indicator':'')}><EventIcon type={event.event_type}/></span>
                <div>
                  <div className="exam-activity-event-title">{eventNames[event.event_type]}<span className="exam-activity-event-type">{flagged?'Indikator untuk ditinjau':'Interaksi halaman'}</span></div>
                  <p><b>{event.student_name}</b> · {event.class_name} · {event.major_name}</p>
                  <p>{detailFor(event)}</p>
                  {event.practice_category&&<p>Sesi: latihan mandiri — {event.practice_category}</p>}
                </div>
                <time dateTime={event.occurred_at}><Clock3 size={13}/>{examActivityTimestamp(event.occurred_at)}</time>
              </article>;
            })}
          </div>}
        <div className="exam-activity-pagination">
          <span>Halaman {pageNumber} · {events.length} kejadian ditampilkan</span>
          <div>
            <button type="button" className="exam-activity-button" disabled={timelineBusy||timelineOffset===0} onClick={()=>changeTimelinePage(timelineOffset-PAGE_SIZE)}><ChevronLeft size={15}/> Sebelumnya</button>
            <button type="button" className="exam-activity-button" disabled={timelineBusy||!hasNext} onClick={()=>changeTimelinePage(timelineOffset+PAGE_SIZE)}>Berikutnya <ChevronRight size={15}/></button>
          </div>
        </div>
        <div className="exam-activity-report-note">Catatan ini adalah laporan indikatif dari browser, bukan bukti otomatis kecurangan. VOKASI tidak membaca isi clipboard, isi pencarian, URL tab lain, atau nama aplikasi di luar halaman ujian. Detail klik yang dilaporkan terbatas pada elemen di halaman VOKASI.</div>
      </section>
    </main>
  </AppShell>;
}
