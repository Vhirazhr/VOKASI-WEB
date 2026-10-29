import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
function compile(path){
 const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const compiledModule={exports:{}};
 const imports=name=>{
  if(name==='./supabase')return {supabase:()=>{throw new Error('Network should not be used by pure report tests.')}};
  if(name.includes('native-rpc'))return {nativeRpc:async()=>({data:null,error:null})};
  return require(name);
 };
 new Function('module','exports','require',js)(compiledModule,compiledModule.exports,imports);
 return compiledModule.exports;
}
const {latestGrades}=compile('lib/school.ts');
const {exportAdminGrades,exportAdminRoster,sortedSchoolStudents}=compile('lib/admin-excel.ts');
const today='2026-10-28';
const start=Date.parse(today+'T00:00:00+07:00');
const roster=[
 {id:'r2',authId:'s2',username:'student.two',fullName:'Bima Contoh',majorName:'Teknik Contoh',className:'X Contoh 1',registered:true},
 {id:'r4',authId:'s4',username:'student.four',fullName:'Dodi Contoh',majorName:'Teknik Contoh',className:'XII Contoh 1',registered:true},
 {id:'r1',authId:'s1',username:'student.one',fullName:'Adinda Fatimah Azzahra',majorName:'Teknik Contoh',className:'X Contoh 1',registered:true},
 {id:'r3',authId:'s3',username:'student.three',fullName:'Citra Contoh',majorName:'Teknik Contoh',className:'XI Contoh 1',registered:false},
 {id:'r5',authId:'s5',username:'student.five',fullName:'Ayu Geomatika',majorName:'Teknik Geomatika',className:'X GEO 1',registered:true}
];
const attempt=(id,score,time)=>({
 auth_user_id:id, username:'student.one', session_key:'test-'+time, completed_at_ms:start+time,
 score,correct:score,answered:score,question_count:100,practice_category:null,
 signature:'WEB-SERVER-v1:test'
});
const attempts=[attempt('s1',0,7200000),attempt('s1',2,10800000),attempt('s2',0,3600000),attempt('s1',53,1800000)];
const official=latestGrades(attempts,roster);
assert.equal(official.get('s1')?.score,53,'First verified grade must beat a later zero');
assert.equal(official.get('s2')?.score,0,'A genuine official zero must remain zero');
assert.equal(official.has('s3'),false,'Never fabricate a grade for missing students');
assert.deepEqual(sortedSchoolStudents(roster).map(r=>r.authId),['s1','s2','s3','s4','s5'],
 'Sort must be major, grade X-XI-XII, class, then alphabetic name');

let capturedBlob=null;
const originalDocument=globalThis.document,originalWindow=globalThis.window;
const originalCreate=URL.createObjectURL;
try{
 URL.createObjectURL=blob=>{capturedBlob=blob;return 'blob:test';};
 globalThis.document={body:{appendChild(){}},createElement(){return{click(){},remove(){},href:'',download:''};}};
 globalThis.window={setTimeout(){}};
 await exportAdminGrades(roster,official,today,'','');
 assert(capturedBlob,'Export must generate an XLSX Blob');
 const wb=new ExcelJS.Workbook();
 await wb.xlsx.load(await capturedBlob.arrayBuffer());
 assert.deepEqual(wb.worksheets.map(s=>s.name),['Ringkasan','CONTOH','GEO'],
  'A separate worksheet per major is required');
 const sheet=wb.getWorksheet('CONTOH');
 const rowOf=name=>{
  for(let row=6;row<=sheet.rowCount;row++)if(sheet.getRow(row).getCell(2).value===name)return row;
  throw Error('Missing student '+name);
 };
 const adinda=rowOf('Adinda Fatimah Azzahra'),bima=rowOf('Bima Contoh');
 const citra=rowOf('Citra Contoh'),dodi=rowOf('Dodi Contoh');
 assert(adinda<bima&&bima<citra&&citra<dodi,'Order must be by grade and alphabet');
 assert.equal(sheet.getRow(adinda).getCell(7).value,53,'Export corrupted first official score');
 assert.equal(sheet.getRow(bima).getCell(7).value,0,'Export lost a genuine zero');
 assert.equal(sheet.getRow(citra).getCell(7).value,null,'Missing student must be blank, not zero');
 assert.equal(sheet.getRow(adinda).getCell(10).value,'Selesai (terverifikasi)');
 assert.equal(sheet.getRow(citra).getCell(10).value,'Belum tercatat');
 assert.equal(wb.getWorksheet('Ringkasan').getRow(5).getCell(4).value,2,'Major completed count incorrect');
 assert.equal(wb.getWorksheet('GEO').getRow(1).getCell(1).value,'Teknik Geomatika');
 capturedBlob=null;
 await exportAdminRoster(roster,'','');
 const rosterWb=new ExcelJS.Workbook();
 await rosterWb.xlsx.load(await capturedBlob.arrayBuffer());
 assert.deepEqual(rosterWb.worksheets.map(s=>s.name),['Ringkasan','CONTOH','GEO'],
 'Roster export must be grouped by major too');
 console.log('OK: actual XLSX grouped by major/class, alphabetic names, score 53, genuine 0, missing blank.');

}finally{
 URL.createObjectURL=originalCreate;
 if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
 if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
}
