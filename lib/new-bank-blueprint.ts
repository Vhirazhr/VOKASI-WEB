import manifest from './new-bank-blueprint.json';

export const APPROVED_BLUEPRINT=manifest;
export type ApprovedGroup=keyof typeof manifest.groups;
export const APPROVED_GROUPS=Object.keys(manifest.groups) as ApprovedGroup[];
export const approvedGroup=(value:string):value is ApprovedGroup=>
  Object.prototype.hasOwnProperty.call(manifest.groups,value);

export type ImportChoice={text:string;image_file:string|null};
export type TimedDraft={
 source_number:number;blueprint_group:string;time_limit_seconds:number|null;
 options:ImportChoice[];correct_index:number|null;question:string;
 question_image_files:string[];
};
export type BlueprintInspection={
 errors:string[];warnings:string[];available:Record<ApprovedGroup,number>;
 count:number;images:number;sessionQuestions:number;sessionSeconds:number;
};
export function inspectApprovedBank(questions:TimedDraft[]):BlueprintInspection{
 const errors:string[]=[];
 const warnings:string[]=[];
 const available=Object.fromEntries(APPROVED_GROUPS.map(g=>[g,0])) as Record<ApprovedGroup,number>;
 const ids=new Set<number>();
 let images=0;
 if(questions.length!==manifest.bankCount)errors.push('Paket resmi harus berisi tepat 500 soal.');
 for(const q of questions){
   if(!Number.isInteger(q.source_number)||q.source_number<1||q.source_number>500||ids.has(q.source_number)){
     errors.push('Nomor soal tidak valid atau berulang: '+q.source_number);continue;
   }
   ids.add(q.source_number);
   if(!approvedGroup(q.blueprint_group)){errors.push('Kelompok soal '+q.source_number+' belum dikenali.');continue;}
   const group=q.blueprint_group;
   available[group]++;
   if(q.time_limit_seconds!==manifest.groups[group].seconds)
     errors.push('Timer soal '+q.source_number+' harus '+manifest.groups[group].seconds+' detik.');
   if(!Number.isInteger(q.correct_index)||q.correct_index===null||q.correct_index<0||q.correct_index>=q.options.length)
     errors.push('Kunci soal '+q.source_number+' tidak valid.');
   const normalized=q.options.map(c=>(c.text||'').trim().toLocaleLowerCase('id-ID')).filter(Boolean);
   if(new Set(normalized).size!==normalized.length)
     warnings.push('Soal '+q.source_number+': ada pilihan jawaban yang sama; harus diperiksa sebelum aktivasi.');
   if(q.source_number===350 && q.question.includes('4x') && q.question.includes('29')
      && q.options[q.correct_index]?.text?.trim()!=='9')
     warnings.push('Soal 350: 4x − 7 = 29 menghasilkan x = 9. Kunci pada dokumen perlu diperbaiki sebelum aktivasi.');
   if(group==='POLA_GAMBAR'&&q.question_image_files.length===0)
     errors.push('Soal pola gambar '+q.source_number+' kehilangan ilustrasinya.');
   images+=q.question_image_files.length+q.options.filter(c=>!!c.image_file).length;
 }
 if(ids.size!==manifest.bankCount)
   errors.push('Paket harus mencakup nomor 1–500 tanpa duplikat.');
 for(const group of APPROVED_GROUPS){
   if(available[group]<manifest.groups[group].quota)
     errors.push('Stok '+manifest.groups[group].label+' kurang dari '+manifest.groups[group].quota+' soal.');
 }
 const sessionQuestions=APPROVED_GROUPS.reduce((sum,g)=>sum+manifest.groups[g].quota,0);
 const sessionSeconds=APPROVED_GROUPS.reduce((sum,g)=>sum+manifest.groups[g].quota*manifest.groups[g].seconds,0);
 if(sessionQuestions!==manifest.sessionCount||sessionSeconds!==manifest.sessionSeconds)
   errors.push('Blueprint ujian harus 100 soal dengan total 1.800 detik.');
 return {errors,warnings,available,count:questions.length,images,sessionQuestions,sessionSeconds};
}
