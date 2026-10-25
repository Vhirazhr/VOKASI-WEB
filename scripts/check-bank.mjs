import fs from 'node:fs';
const old='public/data/vokasi_bank_500.json';
if(fs.existsSync(old)){console.error('Bank soal lama masih ada; tidak boleh diterbitkan.');process.exit(1);}
const active='public/data/vokasi_bank_active.json';
if(!fs.existsSync(active)){console.log('OK: bank lama terhapus; belum ada bank baru aktif. Latihan dinonaktifkan.');process.exit(0);}
const bank=JSON.parse(fs.readFileSync(active,'utf8'));
if(!Array.isArray(bank)||bank.length!==500||new Set(bank.map(q=>q.id)).size!==500){console.error('Bank baru aktif belum memiliki 500 soal dan ID unik.');process.exit(1);}
console.log('OK: bank lama tidak ada dan bank aktif mengandung 500 soal.');
