'use strict';
const CATALOG = require('./data/scenarios.json');
const byId = new Map(CATALOG.scenarios.map(s => [s.id, s]));
const roleByName = new Map();
for (const scenario of CATALOG.scenarios) for (const r of scenario.roles) roleByName.set(r[1], {id:r[0],name:r[1],faction:r[2],power:r[3],phase:r[4],scenarioId:scenario.id});
const factionByRole = new Map();
for (const scenario of CATALOG.scenarios) for (const r of scenario.roles) factionByRole.set(r[1], r[2]);
function getScenario(id) { const s=byId.get(id); if(!s) throw new Error('سناریوی درخواستی پیدا نشد'); return s; }
function roleInfo(role, scenarioId) { if(scenarioId){const s=byId.get(scenarioId);const raw=s?.roles.find(x=>x[1]===role);return raw?{id:raw[0],name:raw[1],faction:raw[2],power:raw[3],phase:raw[4],scenarioId}:null;} return roleByName.get(role)||null; }
function factionOf(role, scenarioId) { return roleInfo(role,scenarioId)?.faction || null; }
function actionOf(role, scenarioId) {
 const r=roleInfo(role,scenarioId); if(!r || r.phase!=='night' || r.power==='none') return null;
 const s=byId.get(r.scenarioId), f=s?.factions.find(x=>x.id===r.faction);
 if(r.power==='leader') return ['parity','eliminate_faction','eliminate_factions'].includes(f?.win)?'faction-vote':null;
 if(r.power==='eliminate' && f && !['independent','raider','duelist','treasure_hunter','mercenary'].includes(f.id)) return 'faction-vote';
 return r.power;
}
function makeRoleDeck(scenarioId, playerCount) {
 const s=getScenario(scenarioId), min=s.players.min, max=s.players.max;
 if(!Number.isInteger(playerCount)||playerCount<min||playerCount>max) throw new Error(`تعداد بازیکنان این سناریو باید بین ${min} و ${max} نفر باشد`);
 const counts={};
 for(const f of s.factions) counts[f.id]=f.base+(f.step?Math.floor((playerCount-min)/f.step):0);
 const filler=s.factions.find(f=>f.base===0 && !['independent','raider','duelist','treasure_hunter','mercenary'].includes(f.id));
 if(!filler) throw new Error('جناح اصلی برای تکمیل ترکیب نقش‌ها تعریف نشده است');
 const assigned=Object.values(counts).reduce((a,b)=>a+b,0);
 counts[filler.id]+=playerCount-assigned;
 if(counts[filler.id]<0) throw new Error('توزیع جناح‌ها برای این تعداد بازیکن نامعتبر است');
 const roles=new Map(s.roles.map(r=>[r[0],{id:r[0],name:r[1],faction:r[2],power:r[3],phase:r[4]}]));
 const deck=[];
 for(const f of s.factions) {
  const n=counts[f.id]||0;
  if(!n) continue;
  const order=f.order.filter(id=>roles.has(id));
  if(!order.length) throw new Error('برای جناح '+f.name+' نقش تعریف نشده است');
  for(let i=0;i<n;i++) deck.push(roles.get(order[Math.min(i,order.length-1)]).name);
 }
 if(deck.length!==playerCount) throw new Error('ترکیب نقش‌ها با ظرفیت اتاق برابر نیست');
 return deck;
}
function shuffle(items, random=Math.random) {
 const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;
}
function assignRoles(players, scenarioId, random=Math.random) {
 const deck=shuffle(makeRoleDeck(scenarioId,players.length),random);
 return players.map((p,i)=>({...p,role:deck[i],alive:true}));
}
function resolvePlurality(votes, leaderId) {
 const counts={}; for(const target of Object.values(votes)) if(target) counts[target]=(counts[target]||0)+1;
 const high=Math.max(0,...Object.values(counts)), tied=Object.keys(counts).filter(k=>counts[k]===high&&high>0);
 if(tied.length===1)return {target:tied[0],tied:false,counts};
 const leaderChoice=leaderId?votes[leaderId]:null;
 if(tied.length>1&&tied.includes(leaderChoice))return {target:leaderChoice,tied:true,decidedBy:'leader',counts};
 return {target:null,tied:tied.length>1,counts};
}
function resolveNight(players, actions, scenarioId, nightNumber=1, progress={}) {
 const s=getScenario(scenarioId), alive=new Map(players.filter(p=>p.alive).map(p=>[p.id,p]));
 const valid=[];
 for(const [actorId,targetId] of Object.entries(actions||{})) {
  const actor=alive.get(actorId),target=alive.get(targetId),info=roleInfo(actor?.role,scenarioId);
  if(actor&&target&&actor.id!==target.id&&info?.scenarioId===scenarioId&&actionOf(actor.role,scenarioId)) valid.push({actor,target,info});
 }
 const protectedIds=new Set(), deaths=new Set(), privateResults={}, objectiveProgress={...progress};
 for(const a of valid) if(a.info.power==='protect') protectedIds.add(a.target.id);
 const factionVotes=new Map(), individualKills=[];
 for(const a of valid) {
  if(a.info.power==='eliminate' || a.info.power==='faction-vote' || a.info.power==='leader') {
   const f=s.factions.find(x=>x.id===a.info.faction);
   if(f && !['independent','raider','duelist','treasure_hunter','mercenary'].includes(f.id)) {
    if(!factionVotes.has(f.id)) factionVotes.set(f.id,{});
    factionVotes.get(f.id)[a.actor.id]=a.target.id;
   } else individualKills.push(a.target.id);
  }
 }
 for(const [factionId,votes] of factionVotes) {
  const f=s.factions.find(x=>x.id===factionId), leaderName=s.roles.find(r=>r[0]===f.order[0])?.[1];
  const leader=players.find(p=>p.alive&&p.role===leaderName);
  const result=resolvePlurality(votes,leader?.id);
  if(result.target)deaths.add(result.target);
 }
 for(const id of individualKills) deaths.add(id);
 for(const a of valid) {
  const {power}=a.info, target=a.target;
  if(power==='investigate') privateResults[a.actor.id]={targetId:target.id,result:roleInfo(target.role,scenarioId)?.faction===a.info.faction?'ally':'hostile'};
  else if(power==='reveal') privateResults[a.actor.id]={targetId:target.id,result:roleInfo(target.role,scenarioId)?.faction||'unknown'};
  else if(power==='track') privateResults[a.actor.id]={targetId:target.id,result:actionOf(target.role,scenarioId)?'active_role':'no_night_action'};
  else if(['sabotage','infect','repair','collect','hack'].includes(power)) {
   const faction= a.info.faction;
   objectiveProgress[faction]=(objectiveProgress[faction]||0)+1;
   privateResults[a.actor.id]={targetId:target.id,result:'action_registered',progress:objectiveProgress[faction]};
  }
 }
 const blocked=[]; for(const id of [...deaths]) if(protectedIds.has(id)){deaths.delete(id);blocked.push(id);}
 return {deaths:[...deaths],blocked,privateResults,objectiveProgress};
}
function checkWin(players, scenarioId, progress={}) {
 const s=getScenario(scenarioId), alive=players.filter(p=>p.alive), counts={};
 for(const p of alive){const f=factionOf(p.role,scenarioId);if(f)counts[f]=(counts[f]||0)+1;}
 for(const f of s.factions) {
  const n=counts[f.id]||0,condition=f.win;
  if(condition==='parity'&&n>0&&n>=alive.length-n)return {winner:f.id, winnerName:f.name,reason:'parity'};
  if(condition==='objective'&&(progress[f.id]||0)>=(s.objective?.target||3))return {winner:f.id,winnerName:f.name,reason:'objective'};
  if(condition==='last_alive'&&n===1&&alive.length===1)return {winner:f.id,winnerName:f.name,reason:'last_alive'};
 }
 const activeRivals=s.factions.filter(f=>f.win==='parity'||f.win==='objective');
 for(const f of s.factions.filter(x=>x.win==='eliminate_faction'||x.win==='eliminate_factions')) {
  if(activeRivals.length&&activeRivals.every(r=>(counts[r.id]||0)===0))return {winner:f.id,winnerName:f.name,reason:'rivals_eliminated'};
 }
 if(alive.length===0)return {winner:null,reason:'draw'};
 return null;
}
function listScenarios(){return CATALOG.scenarios.map(s=>({id:s.id,name:s.name,minPlayers:s.players.min,maxPlayers:s.players.max,theme:s.theme,factions:s.factions.map(f=>f.name),roleNames:s.roles.map(r=>r[1]),status:'implemented_pending_playtest'}));}
module.exports={CATALOG,getScenario,roleInfo,factionOf,actionOf,makeRoleDeck,assignRoles,resolveNight,checkWin,listScenarios};
