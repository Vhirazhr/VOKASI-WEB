/* Browser-only import helpers. No OCR or guessed answer keys.
 * Always ask the admin to inspect extracted content before publishing. */
import JSZip from 'jszip';

export const QUESTION_GROUPS={
 HITUNG_DASAR:{label:'Hitung dasar',seconds:5},
 HITUNG_MENENGAH:{label:'Hitung menengah',seconds:10},
 HITUNG_LANJUT:{label:'Hitung lanjut',seconds:15},
 NUMERASI_CAMPURAN:{label:'Numerasi campuran',seconds:30},
 FISIKA_DASAR:{label:'Fisika dasar',seconds:35},
 LOGIKA:{label:'Logika dan penalaran',seconds:25},
 POLA_GAMBAR:{label:'Pola gambar',seconds:40}
} as const;
export type QuestionGroup=keyof typeof QUESTION_GROUPS;
export const IMPORT_CATEGORIES=['Perkalian','Pembagian','Numerasi Campuran','Fisika Dasar','Logika dan Penalaran','Pola Gambar'] as const;
export type ImportedQuestion={
 question:string;
 category:string;
 difficulty_code:QuestionGroup;
 time_limit_seconds:number;
 question_image_path:string|null;
 options:{text:string;image_path:string|null}[];
 correct_index:number|null;
 explanation:string;
};
export type ImportResult={questions:ImportedQuestion[];warnings:string[];imageFile?:File};

const normalize=(s:string)=>s.normalize('NFKC').replace(/\u00a0/g,' ').trim();
const groupFor=(value:string):QuestionGroup=>{
 const key=normalize(value).toUpperCase().replace(/\W+/g,'_');
 return Object.prototype.hasOwnProperty.call(QUESTION_GROUPS,key)?key as QuestionGroup:'HITUNG_DASAR';
};
const categoryFor=(v:string)=>IMPORT_CATEGORIES.find(c=>c.toLowerCase()===normalize(v).toLowerCase())||'Perkalian';
const extractAnswer=(raw:string)=>{
 const a=normalize(raw).toUpperCase().replace(/^JAWABAN\s*[:\-]?\s*/,'');
 return /^[A-F]$/.test(a)?a.charCodeAt(0)-65:/^[1-6]$/.test(a)?Number(a)-1:null;
};
export const emptyQuestion=(category='Perkalian',group:QuestionGroup='HITUNG_DASAR'):ImportedQuestion=>({
 question:'',category,difficulty_code:group,time_limit_seconds:QUESTION_GROUPS[group].seconds,
 question_image_path:null,options:[{text:'',image_path:null},{text:'',image_path:null},
 {text:'',image_path:null},{text:'',image_path:null}],correct_index:null,explanation:''
});

function textQuestions(text:string,category:string,group:QuestionGroup):ImportedQuestion[]{
 const lines=text.replace(/\r/g,'').split('\n').map(normalize).filter(Boolean);
 const out:ImportedQuestion[]=[];
 let current:ImportedQuestion|null=null;
 let currentOption=-1;
 const finish=()=>{
   if(!current)return;
   current.options=current.options.filter(o=>o.text.trim()||o.image_path);
   if(current.question.trim()||current.options.length)out.push(current);
 };
 for(const line of lines){
  const title=line.match(/^(?:(?:soal|nomor)\s*)?(\d{1,5})[.)]\s+(.+)$/i);
  const opt=line.match(/^([A-F])[.)]\s+(.+)$/i);
  const answer=line.match(/^(?:kunci(?:\s+jawaban)?|jawaban(?:\s+benar)?|answer)\s*[:=\-]\s*([A-F1-6])\b/i);
  const subject=line.match(/^(?:kategori|materi)\s*[:=\-]\s*(.+)$/i);
  const diff=line.match(/^(?:kelompok|blueprint|kode)\s*[:=\-]\s*(.+)$/i);
  const explanation=line.match(/^(?:pembahasan|penjelasan)\s*[:=\-]\s*(.+)$/i);
  if(title){
   finish();current=emptyQuestion(category,group);current.question=title[2];current.options=[];currentOption=-1;continue;
  }
  if(!current)continue;
  if(opt){currentOption=opt[1].toUpperCase().charCodeAt(0)-65;current.options[currentOption]={text:opt[2],image_path:null};continue;}
  if(answer){current.correct_index=extractAnswer(answer[1]);currentOption=-1;continue;}
  if(subject){current.category=categoryFor(subject[1]);currentOption=-1;continue;}
  if(diff){current.difficulty_code=groupFor(diff[1]);current.time_limit_seconds=QUESTION_GROUPS[current.difficulty_code].seconds;currentOption=-1;continue;}
  if(explanation){current.explanation=explanation[1];currentOption=-1;continue;}
  if(currentOption>=0&&current.options[currentOption]) current.options[currentOption].text+=' '+line;
  else current.question+=' '+line;
 }
 finish();
 return out.map(q=>({...q,options:q.options.filter(Boolean)}));
}
function stringCell(value:unknown):string{
 if(value==null)return '';
 if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value);
 if(typeof value==='object'&&value&&'text' in value)return String((value as {text:unknown}).text||'');
 if(typeof value==='object'&&value&&'result' in value)return String((value as {result:unknown}).result||'');
 return '';
}
async function excelQuestions(file:File,category:string,group:QuestionGroup){
 const {default:ExcelJS}=await import('exceljs');
 const book=new ExcelJS.Workbook();
 await book.xlsx.load(new Uint8Array(await file.arrayBuffer()) as unknown as Buffer);
 const sheet=book.worksheets[0];
 if(!sheet)throw new Error('Excel tidak memiliki sheet soal.');
 const headers:string[]=[];
 sheet.getRow(1).eachCell({includeEmpty:true},(cell,col)=>{headers[col-1]=normalize(stringCell(cell.value)).toLowerCase().replace(/[\s_-]+/g,'');});
 const field=(row:import('exceljs').Row,keys:string[])=>{
  const idx=headers.findIndex(h=>keys.includes(h));return idx<0?'':normalize(stringCell(row.getCell(idx+1).value));
 };
 const result:ImportedQuestion[]=[];
 for(let n=2;n<=sheet.rowCount;n++){
  const row=sheet.getRow(n);
  const question=field(row,['soal','pertanyaan','question','text']);
  if(!question)continue;
  const opts=['a','b','c','d','e','f'].map(s=>field(row,[s,'opsi'+s,'pilihan'+s,'jawaban'+s])).filter(Boolean);
  const subject=field(row,['kategori','materi','category'])||category;
  const key=field(row,['kunci','kuncijawaban','jawabanbenar','answer','correct','correctanswer']);
  const code=field(row,['kelompok','kode','blueprint','difficultycode'])||group;
  const g=groupFor(code);
  result.push({question,category:categoryFor(subject),difficulty_code:g,time_limit_seconds:QUESTION_GROUPS[g].seconds,
    question_image_path:null,options:opts.map(text=>({text,image_path:null})),correct_index:extractAnswer(key),
    explanation:field(row,['pembahasan','penjelasan','explanation'])});
 }
 return result;
}
async function docxText(file:File){
 const zip=await JSZip.loadAsync(file);
 const entry=zip.file('word/document.xml');
 if(!entry)throw new Error('DOCX tidak memiliki isi dokumen.');
 const xml=new DOMParser().parseFromString(await entry.async('string'),'text/xml');
 if(xml.getElementsByTagName('parsererror').length)throw new Error('DOCX rusak.');
 const paragraphNodes=Array.from(xml.getElementsByTagName('w:p'));
 return paragraphNodes.map(p=>Array.from(p.getElementsByTagName('w:t')).map(n=>n.textContent||'').join('')).join('\n');
}
async function pdfText(file:File){
 const pdfjs=await import('pdfjs-dist');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
 const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true}).promise;
 if(doc.numPages>80)throw new Error('PDF maksimal 80 halaman per impor.');
 const pages:string[]=[];
 for(let n=1;n<=doc.numPages;n++){
  const pdfPage=await doc.getPage(n);
  const content=await pdfPage.getTextContent();
  let lastY:number|null=null;
  let raw='';
  for(const item of content.items){
    const o=item as {str?:string;transform?:number[]};
    if(!o.str)continue;
    const y=o.transform?.[5]??null;
    if(y!==null&&lastY!==null&&Math.abs(y-lastY)>3)raw+='\n';
    else raw+=' ';
    raw+=o.str;
    if(y!==null)lastY=y;
  }
  pages.push(raw);
 }
 await doc.destroy();
 return pages.join('\n');
}
export async function parseQuestionFile(file:File,category='Perkalian',group:QuestionGroup='HITUNG_DASAR'):Promise<ImportResult>{
 if(file.size>25*1024*1024)throw new Error('File maksimal 25 MB.');
 const ext=file.name.split('.').pop()?.toLowerCase()||'';
 const warnings:string[]=[];
 let questions:ImportedQuestion[]=[];
 if(ext==='xlsx'){questions=await excelQuestions(file,category,group);}
 else if(ext==='docx'){questions=textQuestions(await docxText(file),category,group);warnings.push('Gambar tertanam di DOCX tidak otomatis dipindahkan. Tambahkan gambar melalui editor/unggah gambar sebelum terbit.');}
 else if(ext==='pdf'){questions=textQuestions(await pdfText(file),category,group);warnings.push('PDF hasil scan/gambar tidak dapat dibaca otomatis. Periksa hasil ekstraksi dan kunci jawaban.');}
 else if(ext==='txt'){questions=textQuestions(await file.text(),category,group);}
 else if(['png','jpg','jpeg','webp'].includes(ext)){
  questions=[emptyQuestion('Pola Gambar','POLA_GAMBAR')];
  warnings.push('Gambar siap dilampirkan sebagai soal visual. Isi pertanyaan, pilihan, dan kunci jawaban sebelum terbit.');
  return {questions,warnings,imageFile:file};
 }else if(ext==='xls'||ext==='doc'){
  throw new Error('Format lama '+ext.toUpperCase()+' perlu disimpan ulang menjadi '+(ext==='xls'?'XLSX':'DOCX')+'.');
 }else throw new Error('Format belum didukung. Gunakan XLSX, DOCX, PDF, TXT, PNG, JPG, atau WEBP.');
 if(!questions.length)throw new Error('Tidak ada soal terstruktur yang berhasil dibaca. Gunakan nomor "1. Pertanyaan", pilihan "A. ...", dan "Kunci: A", atau template XLSX.');
 if(questions.length>500)throw new Error('Maksimal 500 soal per impor.');
 if(questions.some(q=>q.correct_index===null))warnings.push('Ada soal tanpa kunci jawaban. Lengkapi melalui pratinjau sebelum terbit.');
 return {questions,warnings};
}
export function inspectQuestionRows(rows:ImportedQuestion[]):string[]{
 const issues:string[]=[];
 rows.forEach((q,i)=>{
  if(!q.question.trim()&&!q.question_image_path)issues.push('No. '+(i+1)+': pertanyaan/gambar kosong');
  if(q.options.length<2||q.options.length>6||q.options.some(o=>!o.text.trim()&&!o.image_path))issues.push('No. '+(i+1)+': pilihan jawaban belum lengkap (2–6)');
  if(q.correct_index===null||q.correct_index<0||q.correct_index>=q.options.length)issues.push('No. '+(i+1)+': kunci jawaban belum dipilih');
  if(q.difficulty_code==='POLA_GAMBAR'&&!q.question_image_path)issues.push('No. '+(i+1)+': unggah gambar untuk soal pola gambar');
 });
 return issues;
}
