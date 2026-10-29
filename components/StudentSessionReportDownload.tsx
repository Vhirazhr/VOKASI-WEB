'use client';
import {useState} from 'react';
import {Download,LoaderCircle} from 'lucide-react';
import {nativeRpc} from '@/lib/native-rpc';
import {getOwnAttempt} from '@/lib/school';
import {downloadStudentReport,makeStudentReportPdf} from '@/lib/student-report-pdf';
import type {ReportQuestion} from '@/lib/student-report-pdf';
import type {Attempt,StudentProfile} from '@/lib/types';

export default function StudentSessionReportDownload({profile,sessionId,official}:{
 profile:StudentProfile;sessionId:string;official:boolean;
}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function onDownload(){
  setBusy(true);setError('');
  try{
   const attempt=await getOwnAttempt(sessionId);
   if(!attempt)throw new Error('Hasil sesi belum selesai tersimpan. Coba lagi beberapa saat.');
   const {data,error:reviewError}=await nativeRpc('vokasi_web_completed_review',{p_session:sessionId});
   if(reviewError)throw reviewError;
   if(!Array.isArray(data))throw new Error('Rincian pembahasan belum tersedia.');
   downloadStudentReport(makeStudentReportPdf(profile,attempt,data as ReportQuestion[],official),attempt);
  }catch(e){setError(e instanceof Error?e.message:'Gagal menyiapkan laporan PDF.');}
  finally{setBusy(false);}
 }
 return <span className="vokasi-report-action">
  <button type="button" className="vokasi-report-download" disabled={busy} onClick={()=>void onDownload()}>
   {busy?<LoaderCircle size={16} className="vokasi-report-spinner"/>:<Download size={16}/>}
   {busy?'Menyiapkan laporan...':'Unduh laporan PDF'}
  </button>
  {error&&<small className="vokasi-report-error" role="alert">{error}</small>}
 </span>;
}
