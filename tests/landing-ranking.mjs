// Tests the existing leaderboard adapter used by the landing, without production credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const fixtures = [
  {username:'xp-leader',display_name:'XP Leader',mandatory_average:60,mandatory_days:20,season_xp:99999},
  {username:'score-leader',display_name:'Score Leader',mandatory_average:98,mandatory_days:1,season_xp:1},
  {username:'second',display_name:'Second',mandatory_average:90,mandatory_days:2,season_xp:2},
  {username:'unverified',display_name:'No Verified Score',mandatory_average:100,mandatory_days:0,season_xp:100000},
  {username:'null',display_name:'No Score',mandatory_average:null,mandatory_days:1,season_xp:100000},
];
let rows=fixtures, error=null;
const exports={};
const code=ts.transpileModule(fs.readFileSync('lib/school.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports,require:()=>({supabase:()=>({rpc:async name=>{
  assert.equal(name,'vokasi_school_leaderboard');return {data:rows,error};
}})})});
assert.equal((await exports.getLeaderboard()).map(r=>r.username).join(','),'score-leader,second,xp-leader');
rows=[];
assert.equal((await exports.getLeaderboard()).length,0);
error=new Error('Unavailable');
await assert.rejects(()=>exports.getLeaderboard(),/Unavailable/);
console.log('PASS: highest verified average first; XP ignored; unverified/null excluded; empty/error handled.');
