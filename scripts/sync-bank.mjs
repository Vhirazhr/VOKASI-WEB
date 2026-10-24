import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Source of truth: public original VOKASI Android bank; no answer editing.
const url='https://raw.githubusercontent.com/Vhirazhr/VOKASI/08359a90de3b0a9bca24575fbeedb36020b290ae/app/src/main/assets/vokasi_bank_500.json';
const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
if(!response.ok) throw new Error(`Gagal mengambil bank: HTTP ${response.status}`);
const text=await response.text();const bank=JSON.parse(text);
if(!Array.isArray(bank)||bank.length!==500) throw new Error(`Bank tidak berisi 500 soal (ditemukan ${bank?.length}).`);
const quota={K1:6,K2:6,K3:6,K4:6,K5:6,P1:6,P2:6,P3:6,P4:6,P5:6,J:20,S1:15,S2:5};
const ids=new Set();const counts={};
for(const q of bank){
 if(!Number.isInteger(q.id)||ids.has(q.id)||!Array.isArray(q.options)||q.options.length!==4||!q.options.includes(q.correctAnswer)||q.correctOption.charCodeAt(0)<65||q.correctOption.charCodeAt(0)>68||q.options[q.correctOption.charCodeAt(0)-65]!==q.correctAnswer||!quota[q.difficultyCode])
   throw new Error(`Bank punya soal tidak valid (ID ${q.id}).`);
 ids.add(q.id);counts[q.difficultyCode]=(counts[q.difficultyCode]||0)+1;
}
for(const [code,count] of Object.entries(quota)) if(counts[code]<count)throw new Error(`Soal ${code} kurang.`);
const output=path.resolve('public/data/vokasi_bank_500.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,text+'\n');
const digest=crypto.createHash('sha256').update(text).digest('hex');
console.log(`OK: 500 soal asli disalin ke ${output}\nSHA-256: ${digest}`);
