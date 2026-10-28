// Check that the dependency-free PDF exporter writes a structurally valid,
// multipage A4 PDF for a real-size 100-question report.
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync('lib/student-report-pdf.ts','utf8');
const js=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
}).outputText;
const {makeStudentReportPdf}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

const profile={fullName:'Siswa Uji',className:'X TKJ 1',majorName:'Teknik Komputer dan Jaringan'};
const attempt={
 session_key:'00000000-0000-0000-0000-000000000001',completed_at_ms:Date.now(),
 name_snapshot:'Siswa Uji',class_snapshot:'X TKJ 1',major_snapshot:'TKJ',
 practice_category:null,score:53,correct:53,answered:100,question_count:100,
 seconds_spent:1450,earned_xp:50
};
const reviews=Array.from({length:100},(_,i)=>({
 id:i+1,category:i%2?'Pola Gambar':'Numerasi Campuran',
 text:'Pertanyaan '+(i+1)+': Hitung dan jelaskan nilai dari data sederhana ini. '.repeat(4),
 image_path:null,
 options:[{text:'Jawaban 10',image_path:null},{text:'Jawaban 20',image_path:null},
 {text:'Jawaban 30',image_path:null},{text:'Jawaban 40',image_path:null}],
 correct_index:2,selected_index:i%2===0?2:0,
 status:i%2===0?'BENAR':'SALAH',response_seconds:12,
 explanation:'Pilihlah angka yang sesuai dengan penjumlahan setiap elemen. '.repeat(3)
}));
for(const sample of [reviews,null]){
 const pdf=makeStudentReportPdf(profile,attempt,sample,true);
 const data=Buffer.from(await pdf.arrayBuffer()).toString('latin1');
 if(!data.startsWith('%PDF-1.4\n'))throw Error('PDF header incorrect');
 const sx=/startxref\n(\d+)\n%%EOF/.exec(data);
 if(!sx)throw Error('PDF trailer missing');
 const xref=Number(sx[1]);
 if(!data.slice(xref).startsWith('xref\n'))throw Error('xref offset incorrect');
 const lines=data.slice(xref).split('\n');
 const num=Number(lines[1].split(' ')[1]);
 if(!Number.isFinite(num)||num<7)throw Error('PDF object table empty');
 for(let obj=1;obj<num;obj++){
  const entry=lines[obj+2];
  const offset=Number(entry?.slice(0,10));
  if(!data.slice(offset).startsWith(obj+' 0 obj\n'))throw Error('Incorrect PDF offset for object '+obj);
 }
 const count=Number(/\/Count (\d+)/.exec(data)?.[1]||0);
 if(!count||(sample&&count<2))throw Error('PDF multipage pagination missing');
 if(!data.includes('LAPORAN HASIL LATIHAN'))throw Error('Main title missing');
 if(sample&&!data.includes('RINCIAN JAWABAN DAN PEMBAHASAN'))throw Error('Verified review not included');
 process.stdout.write('PDF smoke test OK: '+count+' page(s), '+num+' objects, '+data.length+' bytes\n');
}
