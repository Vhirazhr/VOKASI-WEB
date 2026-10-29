'use client';

import { nativeRpc } from '@/lib/native-rpc';
import {useState} from 'react';
import {Download,LoaderCircle} from 'lucide-react';
import {downloadStudentReport,makeStudentReportPdf} from '@/lib/student-report-pdf';
import type {ReportQuestion} from '@/lib/student-report-pdf';
import type {Attempt,StudentProfile} from '@/lib/types';

export default function StudentReportDownload({profile,attempt,official=false}:{
 profile:StudentProfile;attempt:Attempt;official?:boolean;
}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function download(){
  if(busy)return;
  setBusy(true);setError('');
  try{
   let review:ReportQuestion[]|null=null;
   if(attempt.signature?.startsWith('WEB-SERVER-v1:')){
     const {data,error:e}=await nativeRpc('vokasi_web_completed_review',{p_session:attempt.session_key});
     if(e)throw e;
     if(!Array.isArray(data))throw new Error('Rincian jawaban sesi belum tersedia.');
     review=data as ReportQuestion[];
   }
   const blob=makeStudentReportPdf(profile,attempt,review,official);
   downloadStudentReport(blob,attempt);
  }catch(e){setError(e instanceof Error?e.message:'Laporan belum bisa diunduh.');}
  finally{setBusy(false);}
 }
 return <span className="vokasi-report-action">
   <button type="button" className="vokasi-report-download" disabled={busy} onClick={()=>void download()}>
     {busy?<LoaderCircle size={15} className="vokasi-report-spinner"/>:<Download size={15}/>}
     {busy?'Menyiapkan PDF...':'Unduh PDF'}
   </button>
   {error&&<small className="vokasi-report-error" role="alert">{error}</small>}
 </span>;
}
