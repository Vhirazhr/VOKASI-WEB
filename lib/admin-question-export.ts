import type {BankQuestion} from './types';

/** Read-only archive. Visual files are deliberately not baked into the worksheet. */
export async function exportAdminQuestions(questions:BankQuestion[],scope:string){
 if(!questions.length)throw new Error('Tidak ada soal pada filter yang dipilih.');
 const ExcelJS=(await import('exceljs')).default;
 const book=new ExcelJS.Workbook();
 book.creator='VOKASI Sekolah';
 const sheet=book.addWorksheet('Bank Soal');
 const safe=(value:string)=>/^[=+\-@\t\r]/.test(value)?"'"+value:value;
 sheet.columns=[
  {header:'ID',key:'id',width:9},{header:'Materi',key:'category',width:26},
  {header:'Kelompok',key:'group',width:23},{header:'Pertanyaan',key:'question',width:60},
  {header:'Ada gambar soal',key:'image',width:18},
  ...Array.from({length:6},(_,i)=>({header:'Pilihan '+String.fromCharCode(65+i),key:'option'+i,width:33})),
  {header:'Kunci',key:'correct',width:12},
  {header:'Durasi (detik)',key:'duration',width:18},
  {header:'Pembahasan',key:'explanation',width:65},
  {header:'Pilihan bergambar',key:'visualChoices',width:29}
 ];
 for(const q of questions){
  const item:Record<string,string|number>={
   id:q.id,category:safe(q.category),group:safe(q.difficultyCode),
   question:safe(q.question||''),image:q.questionImageUrl?'Ya':'Tidak',
   correct:q.correctOption,duration:q.timeLimitSeconds,
   explanation:safe(q.explanation||''),
   visualChoices:q.optionImageUrls?.map((u,i)=>u?String.fromCharCode(65+i):'').filter(Boolean).join(', ')||'Tidak ada'
  };
  q.options.forEach((choice,i)=>{item['option'+i]=safe(choice||'');});
  sheet.addRow(item);
 }
 const header=sheet.getRow(1);
 header.font={bold:true,color:{argb:'FFFFFFFF'}};
 header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2268BF'}};
 header.height=29;header.alignment={vertical:'middle'};
 sheet.views=[{state:'frozen',ySplit:1}];
 sheet.autoFilter={from:'A1',to:'O'+(sheet.rowCount)};
 sheet.getColumn('question').alignment={vertical:'middle',wrapText:true};
 sheet.getColumn('explanation').alignment={vertical:'middle',wrapText:true};
 for(let i=2;i<=sheet.rowCount;i++){
  const row=sheet.getRow(i);row.height=31;
  if(i%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F7FF'}};
 }
 const guide=book.addWorksheet('Petunjuk');
 guide.columns=[{header:'Informasi',key:'key',width:29},{header:'Keterangan',key:'value',width:105}];
 guide.addRows([
  {key:'Jenis file',value:'Arsip bank soal terbit. Tidak dipakai untuk impor otomatis tanpa peninjauan ulang.'},
  {key:'Filter ekspor',value:scope||'Seluruh bank terbit'},
  {key:'Jumlah soal',value:questions.length},
  {key:'Keamanan',value:'File mengandung kunci jawaban dan pembahasan. Simpan hanya di perangkat administrator yang dipercaya.'},
  {key:'Gambar',value:'Berkas gambar tidak disertakan. Kolom gambar hanya menandai soal atau opsi yang memiliki lampiran.'},
  {key:'Data asli',value:'Ekspor tidak mengubah soal, jawaban, atau konfigurasi ujian pada server.'}
 ]);
 guide.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
 guide.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2268BF'}};
 const bytes=await book.xlsx.writeBuffer();
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download='VOKASI_Bank_Soal_'+scope.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,40)+'.xlsx';
 document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),4000);
}
