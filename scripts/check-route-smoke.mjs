import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

const port=34891;
const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{
  env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},
  stdio:['ignore','pipe','pipe']
});
let logs='';
child.stdout.on('data',chunk=>{logs+=chunk.toString();});
child.stderr.on('data',chunk=>{logs+=chunk.toString();});
async function request(path){
 const response=await fetch(base+path,{signal:AbortSignal.timeout(8000),redirect:'manual'});
 const body=await response.text();
 assert(response.status<500,path+' returned '+response.status+'\\n'+body.slice(0,500));
 assert(body.length>200,path+' returned unexpectedly short HTML');
 assert(/<!doctype html/i.test(body),path+' did not respond with Next.js HTML');
 return response;
}
try{
 let ready=false;
 for(let i=0;i<45;i++){
  if(child.exitCode!==null)throw Error('Next server exited unexpectedly: '+logs.slice(-2000));
  try{const r=await fetch(base+'/',{signal:AbortSignal.timeout(800)});if(r.status<500){ready=true;break;}}catch{}
  await sleep(500);
 }
 assert(ready,'Next.js did not start: '+logs.slice(-2000));
 for(const path of ['/','/login','/login?role=admin','/siswa','/admin','/admin/siswa','/admin/kelas','/admin/data-sekolah','/admin/bank-soal','/admin/monitoring','/admin/analitik','/admin/logs','/admin/pengaturan']){
   await request(path);console.log('OK HTTP smoke '+path);
 }
 console.log('OK: public HTML / route smoke test complete (no authenticated browser flow).');
}finally{
 child.kill('SIGTERM');
 await sleep(500);
 if(child.exitCode===null)child.kill('SIGKILL');
}
