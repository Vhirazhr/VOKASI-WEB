import type {Attempt,SchoolStudent} from './types';

/** The exported workbook is a report snapshot, never an editable upload contract. */
const safe=(value:string)=>/^[=+\-@\t\r]/.test(value)?"'"+value:value;
const slug=(value:string)=>value.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,42)||'Semua';

async function saveExcel(book:import('exceljs').Workbook,name:string){
 const bytes=await book.xlsx.writeBuffer();
 const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function decorateHeader(sheet:import('exceljs').Worksheet){
 const row=sheet.getRow(1);row.height=30;
 row.font={bold:true,color:{argb:'FFFFFFFF'},size:11};
 row.alignment={vertical:'middle'};
 row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F63B9'}};
 sheet.views=[{state:'frozen',ySplit:1}];
 sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(sheet.rowCount,2),column:sheet.columnCount}};
}
function zebra(sheet:import('exceljs').Worksheet){
 for(let i=2;i<=sheet.rowCount;i++){
   const row=sheet.getRow(i);row.height=25;row.alignment={vertical:'middle'};
   if(i%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F7FF'}};
 }
}

/** Export all roster members within optional school/major/class scope. */
export async function exportAdminGrades(
 students:SchoolStudent[],grades:Map<string,Attempt>,date:string,major:string,klass:string
){
 const ExcelJS=(await import('exceljs')).default;
 const book=new ExcelJS.Workbook();book.creator='VOKASI - SMK Negeri 1 Singosari';
 const sheet=book.addWorksheet('Nilai Wajib');
 sheet.columns=[
   {header:'No',key:'no',width:8},{header:'Nama siswa',key:'name',width:35},
   {header:'Username',key:'username',width:22},{header:'Jurusan',key:'major',width:38},
   {header:'Kelas',key:'klass',width:19},{header:'Tanggal (WIB)',key:'date',width:20},
   {header:'Nilai / 100',key:'score',width:16},{header:'Benar',key:'correct',width:12},
   {header:'Jumlah soal',key:'total',width:15},{header:'Status',key:'status',width:22}
 ];
 for(let i=0;i<students.length;i++){
   const s=students[i],grade=grades.get(s.authId);
   sheet.addRow({no:i+1,name:safe(s.fullName),username:safe(s.username||''),major:safe(s.majorName),
     klass:safe(s.className),date,score:grade?.score??null,correct:grade?.correct??null,
     total:grade?.question_count??null,status:grade?'Selesai (terverifikasi)':'Belum tercatat'});
 }
 decorateHeader(sheet);zebra(sheet);
 sheet.getColumn('score').numFmt='0';
 const complete=students.filter(s=>grades.has(s.authId)).length;
 const summary=book.addWorksheet('Ringkasan');
 summary.columns=[{header:'Indikator',key:'label',width:35},{header:'Hasil',key:'value',width:37}];
 for(const [label,value] of [
  ['Tanggal laporan (WIB)',date],['Lingkup jurusan',major||'Semua jurusan'],
  ['Lingkup kelas',klass||'Semua kelas'],['Total siswa',students.length],
  ['Sudah latihan resmi',complete],['Belum tercatat',students.length-complete],
  ['Partisipasi',students.length?Math.round(complete/students.length*100)+'%':'0%'],
  ['Sumber nilai','Hasil wajib terverifikasi oleh Supabase; pengulangan tidak mengganti nilai pertama']
 ] as [string,string|number][])summary.addRow({label,value});
 decorateHeader(summary);zebra(summary);
 await saveExcel(book,'VOKASI_Hasil_Wajib_'+slug(major)+'_'+slug(klass)+'_'+date+'.xlsx');
}

export async function exportAdminRoster(students:SchoolStudent[],major='',klass=''){
 const ExcelJS=(await import('exceljs')).default;
 const book=new ExcelJS.Workbook();book.creator='VOKASI - SMK Negeri 1 Singosari';
 const sheet=book.addWorksheet('Daftar Siswa');
 sheet.columns=[
  {header:'No',key:'no',width:8},{header:'Nama lengkap',key:'name',width:36},
  {header:'Username',key:'username',width:24},{header:'Jurusan',key:'major',width:40},
  {header:'Kelas',key:'klass',width:19},{header:'Status akun',key:'status',width:22}
 ];
 students.forEach((s,i)=>sheet.addRow({no:i+1,name:safe(s.fullName),username:safe(s.username||''),
   major:safe(s.majorName),klass:safe(s.className),status:s.registered?'Terdaftar':'Belum terdaftar'}));
 decorateHeader(sheet);zebra(sheet);
 await saveExcel(book,'VOKASI_Data_Siswa_'+slug(major)+'_'+slug(klass)+'.xlsx');
}

/** Spreadsheet for preparing offline school data, not an unreviewed bulk database import. */
export async function downloadAdminRosterTemplate(){
 const ExcelJS=(await import('exceljs')).default;
 const book=new ExcelJS.Workbook();book.creator='VOKASI - SMK Negeri 1 Singosari';
 const sheet=book.addWorksheet('Template Siswa');
 sheet.columns=[
  {header:'Nama lengkap',key:'name',width:36},{header:'Username',key:'username',width:25},
  {header:'Jurusan',key:'major',width:38},{header:'Kelas',key:'klass',width:22},{header:'Angkatan',key:'year',width:15}
 ];
 decorateHeader(sheet);
 const guide=book.addWorksheet('Petunjuk');
 guide.columns=[{header:'Ketentuan',key:'label',width:30},{header:'Keterangan',key:'value',width:105}];
 guide.addRows([
  {label:'Tujuan',value:'Template untuk impor siswa baru melalui Admin > Kelola Data Sekolah. Data yang ada tidak ditimpa.'},
  {label:'Nama lengkap',value:'Nama siswa sesuai data sekolah.'},
  {label:'Username',value:'Identitas unik siswa, jika sudah ditentukan admin.'},
  {label:'Jurusan / Kelas',value:'Isi persis nama jurusan dan kelas aktif di database sekolah.'},
  {label:'Angkatan',value:'Opsional: tahun mulai bersekolah, contoh 2026. Kosong mengikuti tingkat kelas pada tahun ajaran.'},
  {label:'Keamanan',value:'Jangan masukkan kata sandi atau data sensitif lain ke file ini.'},
  {label:'Impor',value:'Buka Admin > Kelola Data Sekolah, unggah file ini, cek pratinjau validasi, kemudian konfirmasi impor. Maksimal 5.000 baris per file; siswa baru berstatus belum terdaftar.'}
 ]);
 decorateHeader(guide);zebra(guide);
 await saveExcel(book,'VOKASI_Template_Data_Siswa.xlsx');
}
