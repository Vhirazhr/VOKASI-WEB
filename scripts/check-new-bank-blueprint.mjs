import {readFileSync} from 'node:fs';
const b=JSON.parse(readFileSync(new URL('../lib/new-bank-blueprint.json',import.meta.url),'utf8'));
const entries=Object.entries(b.groups);
const count=entries.reduce((s,[,v])=>s+v.quota,0);
const seconds=entries.reduce((s,[,v])=>s+v.quota*v.seconds,0);
if(b.bankCount!==500||b.sessionCount!==100||b.sessionSeconds!==1800||count!==100||seconds!==1800){
 console.error('INVALID VOKASI NEW BANK BLUEPRINT:',{count,seconds});process.exit(1);
}
for(const [code,rule] of entries){
 if(!Number.isInteger(rule.quota)||rule.quota<1||!Number.isInteger(rule.seconds)||rule.seconds<5)
   throw new Error('Aturan kategori tidak valid: '+code);
}
console.log('OK: 7 kategori, 100 soal, 1800 detik; seluruh aturan timer tervalidasi.');
