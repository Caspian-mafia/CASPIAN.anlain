'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('./rules-engine');
const REQUIRED=['بازپرس','پدرخوانده','تکاور','زودیاک','گانگستر'];
test('all ten scenario decks are valid 16-player games',()=>{
 const entries=Object.entries(R.SCENARIO_LIBRARY);
 assert.equal(entries.length,10);
 for(const [id,scenario] of entries){
  const checked=R.validateScenario(scenario);
  assert.equal(Object.values(checked.roleCounts).reduce((a,b)=>a+b,0),16,id);
  if(id!=='classic')for(const role of REQUIRED)assert.ok(checked.roleCounts[role]>=1,id+' missing '+role);
 }
});
test('required specialist roles have isolated server-side actions',()=>{
 assert.equal(R.ROLE_ACTION['بازپرس'],'investigate');
 assert.equal(R.ROLE_ACTION['تکاور'],'ranger-shot');
 assert.equal(R.ROLE_ACTION['زودیاک'],'zodiac-check');
 assert.equal(R.ROLE_ACTION['گانگستر'],'mafia-vote');
 assert.equal(R.ROLE_ACTION['پدرخوانده'],'mafia-vote');
});
test('ranger and zodiac actions resolve without exposing private investigation to the room',()=>{
 const players=[
  {id:'r',role:'تکاور',alive:true},{id:'z',role:'زودیاک',alive:true},
  {id:'g',role:'پدرخوانده',alive:true},{id:'m',role:'گانگستر',alive:true},
  {id:'b',role:'بازپرس',alive:true},{id:'x',role:'شهروند',alive:true}
 ];
 const out=R.resolveNight(players,{r:'x',z:'g',b:'g',g:'x',m:'x'});
 assert.ok(out.deaths.includes('x'));
 assert.equal(out.privateResults.z.result,'مافیا');
 assert.equal(out.privateResults.b.result,'شهروند');
});
