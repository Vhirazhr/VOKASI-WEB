import type {Attempt,StudentProfile} from './types';

export type ReportQuestion={
  id:number;text:string;category:string;image_path:string|null;
  options:{text:string;image_path:string|null}[];
  correct_index:number;selected_index:number|null;
  status:string;response_seconds:number;explanation?:string;
};

const PAGE_W=595;
const PAGE_H=842;
const M=44;
const RIGHT=PAGE_W-M;
const BOTTOM=PAGE_H-49;

function plain(value:unknown):string{
  return String(value??'')
    .replace(/[\u2018\u2019]/g,"'")
    .replace(/[\u201c\u201d]/g,'"')
    .replace(/[\u2013\u2014]/g,'-')
    .replace(/\u2022/g,'-')
    .replace(/[\u00d7]/g,'x')
    .replace(/\u00f7/g,'/')
    .replace(/[\u2265]/g,'>=')
    .replace(/[\u2264]/g,'<=')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\x20-\x7e\n]/g,'?')
    .replace(/\s+/g,' ').trim();
}
function esc(s:string){return plain(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function wrap(value:string,limit:number):string[]{
  const words=plain(value).split(' ').filter(Boolean);
  if(!words.length)return ['-'];
  const result:string[]=[];
  let row='';
  for(const word of words){
    if(word.length>limit){
      if(row){result.push(row);row='';}
      for(let i=0;i<word.length;i+=limit)result.push(word.slice(i,i+limit));
      continue;
    }
    if((row?row.length+1:0)+word.length>limit){result.push(row);row=word;}
    else row+=(row?' ':'')+word;
  }
  if(row)result.push(row);
  return result;
}
function rgb(rgb:[number,number,number]){return rgb.map(v=>(v/255).toFixed(3)).join(' ');}
const navy:[number,number,number]=[26,65,112];
const blue:[number,number,number]=[31,108,208];
const gray:[number,number,number]=[99,120,150];
const green:[number,number,number]=[25,134,98];
const red:[number,number,number]=[190,68,88];

/** Minimal dependency-free, printable PDF/A4 text report; not an official school certificate. */
export function makeStudentReportPdf(profile:StudentProfile,attempt:Attempt,review:ReportQuestion[]|null,official:boolean):Blob{
  const objects:string[]=[];
  const add=(body:string)=>{objects.push(body);return objects.length;};
  const regular=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesRef=add(''); // filled after page objects have been allocated
  const pageRefs:number[]=[];
  let y=M;
  let cmds:string[]=[];
  let page=0;
  const put=(value:string,x:number,top:number,size:number,color:[number,number,number]=navy,strong=false)=>{
    cmds.push('BT /'+(strong?'F2':'F1')+' '+size+' Tf '+rgb(color)+' rg 1 0 0 1 '+x+' '+(PAGE_H-top-size).toFixed(1)+' Tm ('+esc(value)+') Tj ET');
  };
  const rectangle=(x:number,top:number,w:number,h:number,color:[number,number,number])=>{
    cmds.push(rgb(color)+' rg '+x+' '+(PAGE_H-top-h).toFixed(1)+' '+w+' '+h+' re f');
  };
  const line=(top:number)=>{
    rectangle(M,top,RIGHT-M,0.8,[219,230,244]);
  };
  const finish=()=>{
    if(!page)return;
    put('VOKASI / LAPORAN PEMBELAJARAN SISWA',M,PAGE_H-35,8,gray);
    put('Halaman '+page,RIGHT-58,PAGE_H-35,8,gray);
    const contents=cmds.join('\n')+'\n';
    const stream=add('<< /Length '+contents.length+' >>\nstream\n'+contents+'endstream');
    pageRefs.push(add('<< /Type /Page /Parent '+pagesRef+' 0 R /MediaBox [0 0 '+PAGE_W+' '+PAGE_H+'] /Resources << /Font << /F1 '+regular+' 0 R /F2 '+bold+' 0 R >> >> /Contents '+stream+' 0 R >>'));
  };
  const next=()=>{
    if(page)finish();
    page++;y=M;cmds=[];
    rectangle(0,0,PAGE_W,9,blue);
    if(page>1){
      put('VOKASI  |  RINCIAN HASIL LATIHAN',M,y,10,blue,true);y+=30;
      line(y);y+=17;
    }
  };
  const ensure=(need:number)=>{if(y+need>BOTTOM)next();};
  const text=(value:string,opts:{size?:number;color?:[number,number,number];bold?:boolean;indent?:number;after?:number}={})=>{
    const size=opts.size??10,indent=opts.indent??0;
    const limit=Math.max(18,Math.floor((RIGHT-M-indent)/(size*.51)));
    for(const part of wrap(value,limit)){
      ensure(size+6);
      put(part,M+indent,y,size,opts.color??navy,opts.bold??false);
      y+=size+5.5;
    }
    y+=opts.after??2;
  };
  const heading=(value:string)=>{ensure(42);y+=11;text(value,{size:12,bold:true,color:blue,after:9});};
  const date=new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'long',timeStyle:'short'}).format(new Date(attempt.completed_at_ms))+' WIB';

  next();
  text('SMK NEGERI 1 SINGOSARI',{size:15,bold:true,after:4});
  text('VOKASI | LAPORAN HASIL LATIHAN',{size:13,bold:true,color:blue,after:5});
  text('Dokumen pembelajaran pribadi, bukan rapor atau sertifikat resmi.',{size:9,color:gray,after:12});
  line(y);y+=19;
  text('Nama siswa : '+(attempt.name_snapshot||profile.fullName),{size:10,bold:true});
  text('Kelas      : '+(attempt.class_snapshot||profile.className),{size:10});
  text('Jurusan    : '+(attempt.major_snapshot||profile.majorName),{size:10});
  text('Tanggal    : '+date,{size:10});
  text('Jenis      : '+(attempt.practice_category||'Latihan wajib'),{size:10});
  text('ID sesi    : '+attempt.session_key,{size:8,color:gray,after:10});
  line(y);y+=13;
  heading('RINGKASAN NILAI');
  text('Nilai '+attempt.score+'/100 | Jawaban benar '+attempt.correct+'/'+attempt.question_count,
    {size:14,bold:true,color:attempt.score>=70?green:red,after:7});
  text('Soal terjawab '+attempt.answered+' | Durasi '+Math.round(attempt.seconds_spent/60)+' menit | XP +'+attempt.earned_xp,{size:10,after:4});
  const status=attempt.practice_category===null?
    (official?'Nilai resmi harian pertama, terverifikasi server.':'Sesi pengulangan/riwayat: tidak mengganti nilai resmi harian.'):
    'Latihan mandiri: ringkasan sesi tersimpan.';
  text(status,{size:9,color:gray,after:9});
  if(!review){
    heading('RIWAYAT LAMA');
    text('Rincian jawaban server untuk sesi ini tidak tersedia. Laporan ini hanya memuat ringkasan hasil tersimpan.',{size:10,after:9});
  }else{
    const correct=review.filter(q=>q.status==='BENAR').length;
    const wrong=review.filter(q=>q.status==='SALAH').length;
    const timed=review.filter(q=>q.status==='TIMEOUT').length;
    text('Rincian server: '+correct+' benar, '+wrong+' salah, '+timed+' timeout.',{size:10,after:8});
    line(y);y+=5;
    heading('RINCIAN JAWABAN DAN PEMBAHASAN');
    text('Hasil dan kunci hanya untuk soal dari sesi yang sudah selesai.',{size:9,color:gray,after:8});
    review.forEach((q,index)=>{
      ensure(90);
      text((index+1)+'. '+(q.category||'Materi')+' - '+q.status,
        {size:10,bold:true,color:q.status==='BENAR'?green:q.status==='SALAH'?red:gray,after:2});
      text('Soal: '+q.text,{size:9.5,after:3});
      if(q.image_path)text('Soal menggunakan gambar; lihat gambar asli di pembahasan web.',{size:9,color:gray});
      const choice=(i:number|null)=>{
        if(i===null||i<0||i>=q.options.length)return '(tidak menjawab)';
        const option=q.options[i];
        return String.fromCharCode(65+i)+'. '+(option.text||'[opsi gambar]')+(option.image_path?' [gambar]':'');
      };
      text('Jawaban siswa: '+choice(q.selected_index),{size:9.5});
      text('Kunci jawaban: '+choice(q.correct_index),{size:9.5,color:green,bold:true});
      if(q.explanation)text('Pembahasan: '+q.explanation,{size:9.5});
      text('Waktu respons: '+q.response_seconds+' detik',{size:8.5,color:gray,after:6});
      ensure(12);line(y);y+=10;
    });
  }
  finish();
  objects[pagesRef-1]='<< /Type /Pages /Kids ['+pageRefs.map(id=>id+' 0 R').join(' ')+'] /Count '+pageRefs.length+' >>';
  const root=add('<< /Type /Catalog /Pages '+pagesRef+' 0 R >>');
  // PDF has an ASCII-only byte stream, so UTF-8 offsets equal JavaScript lengths.
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  objects.forEach((body,index)=>{
    offsets.push(pdf.length);
    pdf+=(index+1)+' 0 obj\n'+body+'\nendobj\n';
  });
  const xrefOffset=pdf.length;
  pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  offsets.slice(1).forEach(offset=>{pdf+=String(offset).padStart(10,'0')+' 00000 n \n';});
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root '+root+' 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF\n';
  return new Blob([pdf],{type:'application/pdf'});
}

export function downloadStudentReport(pdf:Blob,attempt:Attempt){
 const type=attempt.practice_category?.replace(/[^a-zA-Z0-9_-]/g,'_')||'Wajib';
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(attempt.completed_at_ms));
 const fileName='VOKASI_'+type+'_'+date+'_'+attempt.session_key.slice(0,8)+'.pdf';
 const url=URL.createObjectURL(pdf);
 const a=document.createElement('a');
 a.href=url;a.download=fileName;a.style.display='none';
 document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),4000);
}
