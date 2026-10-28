import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
function compile(path){
 const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 const imports=name=>{
  if(name==='./supabase')return {supabase:()=>{throw new Error('Network should not be used by pure report tests.')}};
  return require(name);
 };
 new Function('module','exports','require',js)(module,module.exports,imports);
 return module.exports;
}
const {latestGrades}=compile('lib/school.ts');
const {exportAdminGrades}=compile('lib/admin-excel.ts');
const today='2026-10-28';
const start=Date.parse(today+'T00:00:00+07:00');
const roster=[
 {id:'r1',authId:'s1',username:'student.one',fullName:'Siswa Contoh Satu',majorName:'Teknik Contoh',className:'X Contoh 1'},
 {id:'r2',authId:'s2',username:'student.two',fullName:'Siswa Contoh Dua',majorName:'Teknik Contoh',className:'X Contoh 1'},
 {id:'r3',authId:'s3',username:'student.three',fullName:'Siswa Contoh Tiga',majorName:'Teknik Contoh',className:'X Contoh 1'}
];
const attempt=(id,score,time)=>({
 auth_user_id:id, username:'student.one', session_key:'test-'+time, completed_at_ms:start+time,
 score,correct:score,answered:score,question_count:100,practice_category:null,
 signature:'WEB-SERVER-v1:test'
});
const attempts=[
 attempt('s1',0,7200000),
 attempt('s1',2,10800000),
 attempt('s2',0,3600000),
 attempt('s1',53,1800000)
];
const official=latestGrades(attempts,roster);
assert.equal(official.get('s1')?.score,53,'First verified grade must beat a later zero');
assert.equal(official.get('s2')?.score,0,'A genuine official zero must remain zero');
assert.equal(official.has('s3'),false,'Never fabricate a grade for missing students');

let capturedBlob=null;
const originalDocument=globalThis.document,originalWindow=globalThis.window;
const originalCreate=URL.createObjectURL;
try{
 URL.createObjectURL=blob=>{capturedBlob=blob;return 'blob:test';};
 globalThis.document={body:{appendChild(){}},createElement(){return{click(){},remove(){},href:'',download:''};}};
 globalThis.window={setTimeout(){}};
 await exportAdminGrades(roster,official,today,'Teknik Contoh','X Contoh 1');
 assert(capturedBlob,'Export must generate an XLSX Blob');
 const bytes=await capturedBlob.arrayBuffer();
 const wb=new ExcelJS.Workbook();
 await wb.xlsx.load(bytes);
 const sheet=wb.getWorksheet('Nilai Wajib');
 assert(sheet,'Nilai Wajib worksheet missing');
 assert.equal(sheet.getRow(2).getCell(7).value,53,'Export corrupted first official score');
 assert.equal(sheet.getRow(3).getCell(7).value,0,'Export lost a real zero');
 assert.equal(sheet.getRow(4).getCell(7).value,null,'Missing student must be blank, not zero');
 assert.equal(sheet.getRow(2).getCell(10).value,'Selesai (terverifikasi)');
 assert.equal(sheet.getRow(4).getCell(10).value,'Belum tercatat');
 assert.equal(wb.getWorksheet('Ringkasan').getRow(6).getCell(2).value,2,'Completed summary incorrect');
 console.log('OK: verified first-score selection and actual XLSX content (53, 0, missing).');
}finally{
 URL.createObjectURL=originalCreate;
 if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
 if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
}
