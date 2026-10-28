import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync('lib/vokasi-chatbot.ts','utf8');
const javascript=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
}).outputText;
const {getVokasiChatbotReply,CHATBOT_SUGGESTIONS,CHATBOT_GREETING}=
 await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));

function check(input,expected){
 const reply=getVokasiChatbotReply(input);
 assert.equal(typeof reply.text,'string');
 assert.ok(reply.text.length>4,'Empty response for '+input);
 assert.match(reply.text,expected,'Incorrect response for '+input);
 assert.equal(reply.recognized,true,'Known query should be recognized: '+input);
}
check('12 x 3',/36/);
check('36 / 3',/12/);
check('30% dari 180',/54/);
check('25 + 17',/42/);
check('25 - 17',/8/);
check('5 : 2',/2,5/);
check('-3 × 5',/-15/);
check('12 / 0',/nol/i);
check('Cara unduh PDF',/Riwayat.*PDF/i);
check('Rekomendasi materi',/70%/);
check('Cara kerja nilai',/Supabase/i);
check('Cara login',/admin/i);
check('Lupa password',/Pengaturan akun/i);
check('Saya mau latihan ulang',/nilai resmi/i);
check('apa itu streak',/streak/i);
check('lihat leaderboard sekolah',/Peringkat/i);
check('Apa itu perkalian?',/penjumlahan berulang/i);
check('bagaimana pembagian?',/perkalian/i);
check('hitung persen',/persentase/i);
check('bagaimana soal fisika',/besaran/i);
check('tanya tentang bank soal',/Bank Soal/i);

for(const prompt of CHATBOT_SUGGESTIONS){
 const result=getVokasiChatbotReply(prompt);
 assert.equal(result.recognized,true,'Quick prompt must have usable answer: '+prompt);
}
assert.ok(CHATBOT_GREETING.length>20);
assert.equal(getVokasiChatbotReply('   ').recognized,false);
assert.equal(getVokasiChatbotReply('apa warna mars?').kind,'fallback');
assert.equal(getVokasiChatbotReply('nilai').kind,'guide');

// UI regression: prevent the redundant secondary header/footer from reappearing.
const ui=fs.readFileSync('components/StudentAssistant.tsx','utf8');
const shell=fs.readFileSync('components/AppShell.tsx','utf8');
assert.ok(ui.includes('onSubmit={event=>'),'Chat send form must submit');
assert.ok(ui.includes('onClick={()=>sendMessage(prompt)}'),'Quick questions must submit');
assert.ok(ui.includes('getVokasiChatbotReply(question)'),'Messages must call answer engine');
assert.ok(!ui.includes('vokasi-assistant-title'),'Duplicate chatbot header must stay removed');
assert.ok(!ui.includes('vokasi-assistant-note'),'Verbose footer must stay removed');
assert.ok(!ui.includes('Siap membantu'),'Secondary status must stay removed');
assert.ok(shell.includes('hidden={!chatOpen}'),'Chat needs to preserve messages when closed');
assert.ok(shell.includes('<StudentAssistant isOpen={chatOpen}/>'),'Chat panel must be connected to dialog');
process.stdout.write('Chatbot regression tests passed: 21 question intents, 3 quick prompts and UI interaction contract.\n');
