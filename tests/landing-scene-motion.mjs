import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const source=fs.readFileSync('components/landing/scene-motion.ts','utf8');
const testModule={exports:{}};
vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS}),{exports:testModule.exports});
const {scenePose}=testModule.exports;
const anchors=[0,900,1800,2700];
for(const mobile of [false,true]){
 assert.equal(scenePose(0,anchors,mobile).x,0);
 assert.ok(scenePose(900,anchors,mobile).x<0);
 assert.ok(scenePose(1800,anchors,mobile).x>0);
 assert.equal(scenePose(2700,anchors,mobile).x,0);
 assert.equal(scenePose(9000,anchors,mobile).x,0);
 for(let scroll=0;scroll<=2800;scroll+=1){
  const p=scenePose(scroll,anchors,mobile), next=scenePose(scroll+1,anchors,mobile);
  assert.ok(Math.abs(next.x-p.x)<.002,'No jumps through section boundaries');
  assert.ok(Math.abs(p.x)<=.26 && p.scale>0 && p.water>=0 && p.water<=1);
 }
}
assert.equal(scenePose(-100,anchors,false).progress,0);
console.log('PASS: center-left-right-center, bounds, endpoints and continuous section transitions on desktop/mobile.');
