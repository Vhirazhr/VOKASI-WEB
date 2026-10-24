import fs from 'node:fs';
const p='public/data/vokasi_bank_500.json';
if(!fs.existsSync(p)) {console.error('Bank belum ada. Jalankan: npm run sync:bank');process.exit(1);}
const bank=JSON.parse(fs.readFileSync(p,'utf8'));
if(!Array.isArray(bank)||bank.length!==500) {console.error('Jumlah soal tidak sesuai 500.');process.exit(1);}
const unique=new Set(bank.map(q=>q.id));if(unique.size!==500){console.error('Ada ID soal ganda.');process.exit(1);}
console.log('Bank valid: 500 soal dengan 500 ID unik.');
