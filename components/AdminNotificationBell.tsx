'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {Bell,Check,CheckCheck,Clock3,RefreshCw} from 'lucide-react';
import {acknowledgeAdminNotifications,adminWibTimestamp,getAdminNotifications,type AdminNotificationData} from '@/lib/admin-monitor';
import '@/app/admin-monitor.css';

const EMPTY:AdminNotificationData={unread_count:0,items:[]};

export default function AdminNotificationBell(){
 const [open,setOpen]=useState(false);
 const [feed,setFeed]=useState<AdminNotificationData>(EMPTY);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [issue,setIssue]=useState('');
 const container=useRef<HTMLDivElement>(null);
 const pending=useRef(false);

 async function reload(){
  if(pending.current)return;
  pending.current=true;
  try{
   const result=await getAdminNotifications();
   setFeed(result);setIssue('');
  }catch(e){setIssue(e instanceof Error?e.message:'Notifikasi tidak dapat dimuat.');}
  finally{setLoading(false);pending.current=false;}
 }
 useEffect(()=>{
  queueMicrotask(()=>void reload());
  const interval=window.setInterval(()=>{if(document.visibilityState==='visible')void reload();},30000);
  const focused=()=>void reload();
  window.addEventListener('focus',focused);
  return()=>{window.clearInterval(interval);window.removeEventListener('focus',focused);};
 },[]);
 useEffect(()=>{
  if(!open)return;
  queueMicrotask(()=>void reload());
  const onPointer=(event:PointerEvent)=>{
   if(!container.current?.contains(event.target as Node))setOpen(false);
  };
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
  document.addEventListener('pointerdown',onPointer);
  window.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('pointerdown',onPointer);window.removeEventListener('keydown',onKey);};
 },[open]);
 async function acknowledge(ids:string[]|null){
  setSaving(true);
  try{
   await acknowledgeAdminNotifications(ids);
   await reload();
  }catch(e){setIssue(e instanceof Error?e.message:'Gagal menandai notifikasi.');}
  finally{setSaving(false);}
 }

 return <div className="admin-notice-area admin-monitor-bell" ref={container}>
  <button type="button" className="admin-header-bell" aria-label={'Notifikasi admin'+(feed.unread_count?' · '+feed.unread_count+' belum dibaca':'')}
   aria-expanded={open} aria-controls="admin-notice-panel" title="Notifikasi latihan siswa"
   onClick={()=>setOpen(current=>!current)}>
   <Bell size={19}/>
   {feed.unread_count>0&&<span className="admin-monitor-badge">{feed.unread_count>99?'99+':feed.unread_count}</span>}
  </button>
  {open&&<section className="admin-notice-popover admin-monitor-popover" id="admin-notice-panel" role="dialog" aria-label="Notifikasi admin">
   <div className="admin-monitor-popover-heading">
    <div><b>Notifikasi siswa</b><small>{feed.unread_count} belum dibaca · 14 hari terakhir</small></div>
    <button aria-label="Segarkan notifikasi" type="button" title="Segarkan" onClick={()=>void reload()}><RefreshCw size={16}/></button>
   </div>
   {issue&&<p className="admin-monitor-alert" role="alert">{issue}</p>}
   {loading?<p className="admin-monitor-empty">Mengambil aktivitas siswa...</p>:
    feed.items.length===0?<p className="admin-monitor-empty">Belum ada latihan siswa terverifikasi dalam 14 hari terakhir.</p>:
    <div className="admin-monitor-items">
     {feed.items.map(item=><div key={item.id} className={'admin-monitor-item'+(!item.is_read?' unread':'')}>
      <span className="admin-monitor-item-dot" aria-hidden="true"/>
      <div><strong>{item.student_name} menyelesaikan {item.practice_category?'latihan mandiri':'latihan wajib'}</strong>
       <p>{item.class_name} · Nilai {item.score}{item.practice_category?' · '+item.practice_category:''}</p>
       <small><Clock3 size={12}/>{adminWibTimestamp(item.occurred_at)}</small>
      </div>
      {!item.is_read&&<button className="admin-monitor-ack" type="button" title="Tandai dibaca" aria-label={'Tandai dibaca: '+item.student_name} disabled={saving} onClick={()=>void acknowledge([item.id])}><Check size={15}/></button>}
     </div>)}
    </div>}
   <div className="admin-monitor-popover-footer">
    <button type="button" disabled={saving||feed.unread_count===0} onClick={()=>void acknowledge(null)}><CheckCheck size={14}/> Tandai semua dibaca</button>
    <Link href="/admin/logs" onClick={()=>setOpen(false)}>Lihat log aktivitas</Link>
   </div>
  </section>}
 </div>;
}
