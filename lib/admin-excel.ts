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

/** Keep every export deterministic: jurusan -> grade X/XI/XII -> kelas -> nama A-Z. */
const academicSort=new Intl.Collator('id',{numeric:true,sensitivity:'base'});
function classOrder(label:string):number{
 const grade=/^(XII|XI|X)(?:\\s|$)/i.exec(label.trim())?.[1]?.toUpperCase();
 return grade==='X'?10:grade==='XI'?11:grade==='XII'?12:99;
}
export function sortedSchoolStudents(students:SchoolStudent[]):SchoolStudent[]{
 return [...students].sort((a,b)=>
   academicSort.compare(a.majorName,b.majorName)
   || classOrder(a.className)-classOrder(b.className)
   || academicSort.compare(a.className,b.className)
   || academicSort.compare(a.fullName,b.fullName)
   || academicSort.compare(a.username,b.username)
   || academicSort.compare(a.id,b.id)
 );
}
function majorGroups(students:SchoolStudent[]){
 const majors=new Map<string,Map<string,SchoolStudent[]>>();
 for(const student of sortedSchoolStudents(students)){
  let classes=majors.get(student.majorName);
  if(!classes){classes=new Map();majors.set(student.majorName,classes);}
  const studentsInClass=classes.get(student.className)||[];
  studentsInClass.push(student);classes.set(student.className,studentsInClass);
 }
 return [...majors.entries()].map(([name,classes])=>({name,classes:[...classes.entries()].map(([name,students])=>({name,students}))}));
}
function uniqueSheetName(major:string,firstClass:string,used:Set<string>){
 const code=/^(?:XII|XI|X)\\s+([A-Za-z0-9-]+)/i.exec(firstClass)?.[1]?.toUpperCase();
 const base=(code||major.replace(/[\\[\\]*?:/\\\\]/g,'').slice(0,28)||'Jurusan').slice(0,27);
 let candidate=base,number=2;
 while(used.has(candidate.toLowerCase())||candidate.toLowerCase()==='ringkasan'){
  candidate=base.slice(0,27)+ ' '+number++;
 }
 used.add(candidate.toLowerCase());return candidate;
}
function styleCellRow(sheet:import('exceljs').Worksheet,rowNumber:number,color:string,fontColor='FF173453'){
 const row=sheet.getRow(rowNumber);
 row.height=27;
 row.eachCell({includeEmpty:true},cell=>{
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:color}};
  cell.font={bold:true,color:{argb:fontColor},size:10};
  cell.alignment={vertical:'middle'};
 });
}
function addGroupedSheet(
 book:import('exceljs').Workbook,name:string,
 group:{name:string;classes:{name:string;students:SchoolStudent[]}[]},
 grades:Map<string,Attempt>|null,date:string
){
 const sheet=book.addWorksheet(name);
 const isGrades=grades!==null;
 sheet.columns=(isGrades?
  [{key:'no',width:7},{key:'name',width:38},{key:'username',width:29},
   {key:'major',width:37},{key:'klass',width:18},{key:'date',width:19},
   {key:'score',width:14},{key:'correct',width:11},{key:'total',width:13},{key:'status',width:26}]:
  [{key:'no',width:7},{key:'name',width:38},{key:'username',width:29},
   {key:'major',width:37},{key:'klass',width:18},{key:'status',width:24}]);
 const last=isGrades?'J':'F';
 sheet.mergeCells('A1:'+last+'1');sheet.getCell('A1').value=group.name;
 sheet.getCell('A1').font={bold:true,size:16,color:{argb:'FFFFFFFF'}};
 sheet.getCell('A1').alignment={vertical:'middle'};
 sheet.getRow(1).height=40;
 sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF183B65'}};
 sheet.mergeCells('A2:'+last+'2');
 sheet.getCell('A2').value=isGrades?'Laporan nilai wajib resmi • '+date+' (WIB)':'Daftar siswa • dikelompokkan per kelas';
 sheet.getCell('A2').font={color:{argb:'FF486682'},italic:true};
 sheet.getRow(2).height=24;
 const everyone=group.classes.flatMap(c=>c.students);
 const done=isGrades?everyone.filter(s=>grades.has(s.authId)).length:0;
 sheet.mergeCells('A3:'+last+'3');
 sheet.getCell('A3').value=isGrades?
  everyone.length+' siswa  •  '+done+' sudah mengerjakan  •  '+(everyone.length-done)+' belum tercatat':
  everyone.length+' siswa  •  '+group.classes.length+' kelas';
 sheet.getCell('A3').font={bold:true,color:{argb:'FF1F5B86'}};
 sheet.getRow(3).height=23;
 sheet.getRow(5).values=isGrades?
  ['No','Nama siswa','Username','Jurusan','Kelas','Tanggal WIB','Nilai / 100','Benar','Jumlah soal','Status']:
  ['No','Nama siswa','Username','Jurusan','Kelas','Status akun'];
 styleCellRow(sheet,5,'FF1F63B9','FFFFFFFF');
 sheet.views=[{state:'frozen',ySplit:5}];
 let rowNumber=6;
 for(const cls of group.classes){
  if(rowNumber>6)rowNumber++;
  const finished=isGrades?cls.students.filter(s=>grades.has(s.authId)).length:0;
  sheet.mergeCells('A'+rowNumber+':'+last+rowNumber);
  sheet.getCell('A'+rowNumber).value=cls.name+'  •  '+cls.students.length+' siswa'+
   (isGrades?'  •  '+finished+' sudah mengerjakan':'');
  styleCellRow(sheet,rowNumber,'FFDCEBFA');
  sheet.getRow(rowNumber).height=28;rowNumber++;
  for(let i=0;i<cls.students.length;i++){
   const student=cls.students[i],grade=grades?.get(student.authId);
   const values=isGrades?
    [i+1,safe(student.fullName),safe(student.username||''),safe(student.majorName),safe(student.className),
     date,grade?.score??null,grade?.correct??null,grade?.question_count??null,
     grade?'Selesai (terverifikasi)':'Belum tercatat']:
    [i+1,safe(student.fullName),safe(student.username||''),safe(student.majorName),safe(student.className),
     student.registered?'Terdaftar':'Belum terdaftar'];
   sheet.getRow(rowNumber).values=values;
   sheet.getRow(rowNumber).height=22;
   if(i%2===1)sheet.getRow(rowNumber).eachCell({includeEmpty:true},cell=>{
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F8FD'}};
   });
   if(isGrades && grade){
    const cell=sheet.getRow(rowNumber).getCell(7);
    cell.font={bold:true,color:{argb:'FF156747'}};
    cell.numFmt='0';
   }
   rowNumber++;
  }
 }
 sheet.pageSetup={fitToPage:true,fitToWidth:1,fitToHeight:0,orientation:'landscape'};
 return {name,count:everyone.length,finished:done,average:isGrades&&done?
  Number((everyone.reduce((sum,s)=>sum+(grades.get(s.authId)?.score??0),0)/done).toFixed(1)):null};
}
async function exportGroupedSchoolWorkbook(students:SchoolStudent[],grades:Map<string,Attempt>|null,date:string,major:string,klass:string){
 const ExcelJS=(await import('exceljs')).default;
 const book=new ExcelJS.Workbook();
 book.creator='VOKASI - SMK Negeri 1 Singosari';
 const summary=book.addWorksheet('Ringkasan');
 summary.columns=[{width:42},{width:17},{width:18},{width:18},{width:19},{width:18}];
 summary.mergeCells('A1:F1');
 summary.getCell('A1').value=grades?'REKAP NILAI WAJIB VOKASI':'REKAP DATA SISWA VOKASI';
 summary.getCell('A1').font={bold:true,size:16,color:{argb:'FFFFFFFF'}};
 summary.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF183B65'}};
 summary.getRow(1).height=39;
 summary.mergeCells('A2:F2');
 summary.getCell('A2').value=grades?'Tanggal nilai: '+date+' WIB  •  Nilai pertama terverifikasi per siswa':
  'Daftar siswa berdasarkan jurusan, kelas dan nama A–Z';
 summary.getCell('A2').font={italic:true,color:{argb:'FF486682'}};
 summary.getRow(2).height=28;
 summary.getRow(4).values=grades?['Jurusan','Sheet','Total siswa','Selesai','Belum','Rata-rata']:
  ['Jurusan','Sheet','Total siswa','Terdaftar','Belum','Jumlah kelas'];
 styleCellRow(summary,4,'FF1F63B9','FFFFFFFF');
 summary.views=[{state:'frozen',ySplit:4}];
 const used=new Set<string>(['ringkasan']);
 const groups=majorGroups(students);
 let summaryRow=5,totalCompleted=0;
 for(const group of groups){
  const sheetName=uniqueSheetName(group.name,group.classes[0]?.name||'',used);
  const stats=addGroupedSheet(book,sheetName,group,grades,date);
  const registered=group.classes.flatMap(c=>c.students).filter(s=>s.registered).length;
  totalCompleted+=grades?stats.finished:registered;
  summary.getRow(summaryRow).values=grades?
   [safe(group.name),sheetName,stats.count,stats.finished,stats.count-stats.finished,stats.average]:
   [safe(group.name),sheetName,stats.count,registered,stats.count-registered,group.classes.length];
  if(summaryRow%2===0)summary.getRow(summaryRow).eachCell({includeEmpty:true},cell=>{
   cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF4F8FD'}};
  });
  summary.getRow(summaryRow).height=24;summaryRow++;
 }
 styleCellRow(summary,summaryRow,'FFDCEBFA');
 summary.getRow(summaryRow).values=['TOTAL','',students.length,totalCompleted,students.length-totalCompleted,''];
 summary.getRow(summaryRow).font={bold:true,color:{argb:'FF173453'}};
 summaryRow+=2;
 summary.mergeCells('A'+summaryRow+':F'+summaryRow);
 summary.getCell('A'+summaryRow).value=grades?
  'Nilai kosong = belum tercatat. Nilai 0 = hasil terverifikasi nol. Pengulangan tidak mengubah nilai resmi.':
  'Hanya identitas siswa dan status akun; untuk nilai gunakan ekspor laporan nilai wajib.';
 summary.getCell('A'+summaryRow).font={italic:true,color:{argb:'FF526C80'}};
 summary.getRow(summaryRow).height=26;
 await saveExcel(book,(grades?'VOKASI_Nilai_Per_Jurusan_':'VOKASI_Siswa_Per_Jurusan_')+
  slug(major)+'_'+slug(klass)+(grades?'_'+date:'')+'.xlsx');
}

/** Workbook: ringkasan + satu sheet per jurusan; setiap kelas dan nama sudah berurutan. */
export async function exportAdminGrades(
 students:SchoolStudent[],grades:Map<string,Attempt>,date:string,major:string,klass:string
){
 await exportGroupedSchoolWorkbook(students,grades,date,major,klass);
}
export async function exportAdminRoster(students:SchoolStudent[],major='',klass=''){
 await exportGroupedSchoolWorkbook(students,null,'',major,klass);
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
