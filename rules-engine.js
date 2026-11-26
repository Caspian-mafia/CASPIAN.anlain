'use strict';
const SCENARIO_RUNTIME = require('./scenario-runtime');
const EMPIRE_RULES = require('./empire-of-shadows-rules');
const DEFAULT_SCENARIO = {
 name:'کاسپین کلاسیک',
 roleCounts:{'پدرخوانده':1,'دکتر لکتر':1,'مافیا':3,'کارآگاه':1,'پزشک':1,'شهروند':7,'قاتل زنجیره‌ای':1,'مستقل':1},
 investigatorResult:'alignment', independentInvestigation:'nonmafia',
 godfatherOverride:true, mafiaTieBreak:'godfather', serialKillerWin:'alive', mafiaWin:'parity'
};
const ROLE_GROUP={
 'مافیا':'mafia','پدرخوانده':'mafia','امپراتور':'mafia','دکتر لکتر':'mafia','گانگستر':'mafia','مافیای سایه':'mafia','استراتژیست':'mafia','جاعل':'mafia','بازجو':'mafia',
 'شهروند':'citizen','کارآگاه':'citizen','کارآگاه ویژه':'citizen','بازپرس':'citizen','تکاور':'citizen','پزشک':'citizen','پزشک اعظم':'citizen','قاضی':'citizen','محافظ':'citizen','محافظ سلطنتی':'citizen','تک‌تیرانداز':'citizen','هکر':'citizen','خبرنگار':'citizen','تحلیلگر':'citizen','شهروند بانفوذ':'citizen','شهروند تحلیلگر':'citizen',
 'قاتل زنجیره‌ای':'independent','مستقل':'independent','جاسوس مستقل':'independent','زودیاک':'independent','فرمانده آشوب':'independent'
};
const ROLE_ACTION={
 'پزشک':'protect','پزشک اعظم':'protect','محافظ':'protect','محافظ سلطنتی':'protect','دکتر لکتر':'mafia-protect','کارآگاه':'investigate','کارآگاه ویژه':'investigate','بازپرس':'investigate','خبرنگار':'investigate','هکر':'investigate','تحلیلگر':'investigate','شهروند تحلیلگر':'investigate','تکاور':'ranger-shot','تک‌تیرانداز':'ranger-shot','زودیاک':'zodiac-check',
 'قاتل زنجیره‌ای':'serial-kill','مستقل':'independent-investigate','مافیا':'mafia-vote','پدرخوانده':'mafia-vote','امپراتور':'mafia-vote','گانگستر':'mafia-vote','جاعل':'mafia-vote','بازجو':'mafia-vote','مافیای سایه':'mafia-vote','استراتژیست':'mafia-vote'
};
function roleGroup(role,scenarioId){return (scenarioId&&SCENARIO_RUNTIME.factionOf(role,scenarioId))||ROLE_GROUP[role]||null;}
function roleAction(role,scenarioId){return (scenarioId&&SCENARIO_RUNTIME.CATALOG.scenarios.some(x=>x.id===scenarioId))?SCENARIO_RUNTIME.actionOf(role,scenarioId):(ROLE_ACTION[role]||null);}
function validateScenario(s){
 if(s?.id && SCENARIO_RUNTIME.CATALOG.scenarios.some(x=>x.id===s.id)) return structuredClone(s);
 if(!s||typeof s!=='object'||!s.roleCounts||typeof s.roleCounts!=='object')throw Error('سناریو نامعتبر است');
 const entries=Object.entries(s.roleCounts);
 if(!entries.length||entries.some(([r,n])=>!ROLE_GROUP[r]||!Number.isInteger(n)||n<0||n>16))throw Error('ترکیب نقش‌ها نامعتبر است');
 if(entries.reduce((a,[,n])=>a+n,0)!==16)throw Error('مجموع نقش‌ها باید دقیقاً ۱۶ نفر باشد');
 if(!['alignment','mafia-only'].includes(s.investigatorResult)||!['nonmafia','exact'].includes(s.independentInvestigation)||!['godfather','random'].includes(s.mafiaTieBreak)||s.serialKillerWin!=='alive'||!['parity','elimination'].includes(s.mafiaWin)||typeof s.godfatherOverride!=='boolean')throw Error('یکی از قوانین سناریو نامعتبر است');
 return structuredClone(s);
}
function assignRoles(players,scenario=DEFAULT_SCENARIO,random=Math.random){
 if(scenario?.id && SCENARIO_RUNTIME.CATALOG.scenarios.some(x=>x.id===scenario.id)) return SCENARIO_RUNTIME.assignRoles(players,scenario.id,random);
 const s=validateScenario(scenario);if(players.length!==16)throw Error('برای این سناریو دقیقاً ۱۶ بازیکن لازم است');
 const deck=Object.entries(s.roleCounts).flatMap(([r,n])=>Array(n).fill(r));
 for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 return players.map((p,i)=>({...p,role:deck[i],alive:true}));
}
function investigatorCheck(target,scenario=DEFAULT_SCENARIO){
 const role=target.role||target;
 return EMPIRE_RULES.investigatorResult(role,{isMafia:roleGroup(role)==='mafia',godfatherOverride:scenario.godfatherOverride});
}
function independentCheck(target,scenario=DEFAULT_SCENARIO){
 const role=target.role||target;
 return EMPIRE_RULES.independentResult(role,{isMafia:roleGroup(role)==='mafia',mode:scenario.independentInvestigation});
}
function tally(votes,eligibleIds){
 const counts={};for(const [voter,target] of Object.entries(votes)){if(voter!==target&&eligibleIds.has(voter)&&eligibleIds.has(target))counts[target]=(counts[target]||0)+1;}
 const max=Math.max(0,...Object.values(counts));const leaders=Object.keys(counts).filter(k=>counts[k]===max&&max>0);
 return {counts,leaders,target:leaders.length===1?leaders[0]:null,tied:leaders.length>1};
}
function resolveDayVote(votes,players){
 const eligible=new Set(players.filter(p=>p.alive).map(p=>p.id));return tally(votes,eligible);
}
function resolveMafiaVote(votes,godfatherId,scenario=DEFAULT_SCENARIO){
 return EMPIRE_RULES.resolveMafiaVote(votes,godfatherId,{
  godfatherOverride:scenario.godfatherOverride,
  mafiaTieBreak:scenario.mafiaTieBreak
 });
}
function resolveNight(players,actions,scenario=DEFAULT_SCENARIO,nightNumber=1,objectiveProgress){
 if(scenario?.id && SCENARIO_RUNTIME.CATALOG.scenarios.some(x=>x.id===scenario.id)) return SCENARIO_RUNTIME.resolveNight(players,actions,scenario.id,nightNumber,objectiveProgress||scenario.objectiveProgress||{});
 const alive=new Map(players.filter(p=>p.alive).map(p=>[p.id,p]));
 const byRole=role=>[...alive.values()].filter(p=>p.role===role);
 const valid=(actor,target,action)=>actor&&target&&actor.id!==target.id&&ROLE_ACTION[actor.role]===action;
 const protections=new Set(), deaths=new Set(), results={};
 for(const [actorId,targetId] of Object.entries(actions||{})){
  const actor=alive.get(actorId),target=alive.get(targetId);if(!valid(actor,target,'protect'))continue;
  if(ROLE_ACTION[actor.role]==='protect')protections.add(targetId);
 }
 for(const [actorId,targetId] of Object.entries(actions||{})){
  const actor=alive.get(actorId),target=alive.get(targetId);if(!valid(actor,target,'mafia-protect'))continue;
  if(actor.role==='دکتر لکتر')protections.add(targetId);
 }
 const mafiaActors=[...alive.values()].filter(p=>ROLE_ACTION[p.role]==='mafia-vote');
 const mafiaVotes={};for(const actor of mafiaActors){const targetId=actions[actor.id],target=alive.get(targetId);if(target&&targetId!==actor.id&&roleGroup(target.role)!=='mafia')mafiaVotes[actor.id]=targetId;}
 const gf=byRole('پدرخوانده')[0]||byRole('امپراتور')[0];
 const mafiaResult=resolveMafiaVote(mafiaVotes,gf?.id,scenario);
 if(mafiaResult.target)deaths.add(mafiaResult.target);
 for(const [actorId,targetId] of Object.entries(actions||{})){
  const actor=alive.get(actorId),target=alive.get(targetId);
  if(valid(actor,target,'serial-kill')){if(!EMPIRE_RULES.serialKillerCanKill(nightNumber))continue;deaths.add(targetId);continue;}
  if(valid(actor,target,'ranger-shot')){if(actor.rangerShotUsed)continue;actor.rangerShotUsed=true;deaths.add(targetId);}
 }
 const blocked=[];for(const id of [...deaths])if(protections.has(id)){deaths.delete(id);blocked.push(id);}
 for(const [actorId,targetId] of Object.entries(actions||{})){
  const actor=alive.get(actorId),target=alive.get(targetId);
  if(!actor||!target||actor.id===target.id)continue;
  if(ROLE_ACTION[actor.role]==='investigate')results[actorId]={targetId,result:investigatorCheck(target,scenario)};
  else if(ROLE_ACTION[actor.role]==='zodiac-check')results[actorId]={targetId,result:independentCheck(target,scenario)};
  else if(ROLE_ACTION[actor.role]==='independent-investigate')results[actorId]={targetId,result:independentCheck(target,scenario)};
 }
 const independent=byRole('مستقل')[0];
 if(independent&&actions[independent.id]&&alive.has(actions[independent.id])&&actions[independent.id]!==independent.id)results[independent.id]={targetId:actions[independent.id],result:independentCheck(alive.get(actions[independent.id]),scenario)};
 return {deaths:[...deaths],blocked,privateResults:results,mafiaTie:mafiaResult.tied};
}
function checkWin(players,scenario=DEFAULT_SCENARIO,objectiveProgress){
 if(scenario?.id && SCENARIO_RUNTIME.CATALOG.scenarios.some(x=>x.id===scenario.id)) return SCENARIO_RUNTIME.checkWin(players,scenario.id,objectiveProgress||scenario.objectiveProgress||{});
 const alive=players.filter(p=>p.alive),mafia=alive.filter(p=>roleGroup(p.role)==='mafia').length,town=alive.filter(p=>roleGroup(p.role)==='citizen').length,ind=alive.filter(p=>roleGroup(p.role)==='independent').length;
 const serial=alive.filter(p=>p.role==='قاتل زنجیره‌ای');
 const serialWin=EMPIRE_RULES.serialKillerWin(alive,serial.length>0,scenario.serialKillerWin);
 if(serialWin)return {winner:'serial-killer',reason:'قاتل زنجیره‌ای تنها بازمانده است'};
 if(EMPIRE_RULES.mafiaWin({mafia,town,independent:ind},scenario.mafiaWin))return {winner:'mafia',reason:'مافیا به حد نصاب برابری رسید'};
 if(scenario.mafiaWin==='elimination'&&mafia>0&&town===0)return {winner:'mafia',reason:'تمام شهروندان حذف شدند'};
 if(mafia===0)return {winner:'town',reason:'تمام مافیا حذف شدند'};
 return null;
}
const SCENARIO_LIBRARY = {
 'classic': DEFAULT_SCENARIO,
 'godfather': {id:'godfather',name:'پدرخوانده',roleCounts:{'پدرخوانده':1,'گانگستر':1,'مافیا':1,'بازپرس':1,'تکاور':1,'زودیاک':1,'پزشک':1,'شهروند':7,'قاتل زنجیره‌ای':1,'مستقل':1},investigatorResult:'alignment',independentInvestigation:'nonmafia',godfatherOverride:true,mafiaTieBreak:'godfather',serialKillerWin:'alive',mafiaWin:'parity'},
 'night-mafia': {id:'night-mafia',name:'شب مافیا',roleCounts:{'پدرخوانده':1,'گانگستر':1,'مافیای سایه':1,'بازپرس':1,'تکاور':1,'زودیاک':1,'پزشک':1,'شهروند':7,'قاتل زنجیره‌ای':1,'مستقل':1},investigatorResult:'alignment',independentInvestigation:'nonmafia',godfatherOverride:true,mafiaTieBreak:'godfather',serialKillerWin:'alive',mafiaWin:'parity'},
 'special-detective': {id:'special-detective',name:'کارآگاه ویژه',roleCounts:{'پدرخوانده':1,'گانگستر':1,'مافیا':1,'بازپرس':1,'تکاور':1,'زودیاک':1,'پزشک':1,'خبرنگار':1,'شهروند':6,'قاتل زنجیره‌ای':1,'مستقل':1},investigatorResult:'alignment',independentInvestigation:'nonmafia',godfatherOverride:true,mafiaTieBreak:'godfather',serialKillerWin:'alive',mafiaWin:'parity'},
 'united-citizens': {id:'united-citizens',name:'شهروندان متحد',roleCounts:{'پدرخوانده':1,'گانگستر':1,'مافیا':1,'بازپرس':1,'تکاور':1,'زودیاک':1,'پزشک':1,'محافظ':1,'شهروند':6,'قاتل زنجیره‌ای':1,'مستقل':1},investigatorResult:'alignment',independentInvestigation:'nonmafia',godfatherOverride:true,mafiaTieBreak:'godfather',serialKillerWin:'alive',mafiaWin:'parity'},
 'advanced-mafia': {id:'advanced-mafia',name:'مافیای پیشرفته',roleCounts:{'پدرخوانده':1,'گانگستر':1,'استراتژیست':1,'بازپرس':1,'تکاور':1,'زودیاک':1,'پزشک':1,'هکر':1,'شهروند':6,'قاتل زنجیره‌ای':1,'مستقل':1},investigatorResult:'alignment',independentInvestigation:'nonmafia',godfatherOverride:true,mafiaTieBreak:'godfather',serialKillerWin:'alive',mafiaWin:'parity'},
 'group-duel': {id:'group-duel',name:'دوئل گروهی',roleCounts:{'پدرخوانده':1,'گانگستر':1,'مافیا':1,'بازپرس':1,'تکاور':1,'زودیاک':1,'پزشک':1,'تک‌تیرانداز':1,'شهروند':6,'قاتل زنجیره‌ای':1,'مستقل':1},investigatorResult:'alignment',independentInvestigation:'nonmafia',godfatherOverride:true,mafiaTieBreak:'godfather',serialKillerWin:'alive',mafiaWin:'parity'},
 'apocalypse': {id:'apocalypse',name:'آخرالزمان',roleCounts:{'پدرخوانده':1,'گانگستر':1,'مافیای سایه':1,'بازپرس':1,'تکاور':1,'زودیاک':1,'پزشک':1,'قاضی':1,'شهروند':6,'قاتل زنجیره‌ای':1,'مستقل':1},investigatorResult:'alignment',independentInvestigation:'nonmafia',godfatherOverride:true,mafiaTieBreak:'godfather',serialKillerWin:'alive',mafiaWin:'parity'},
 'serial-killer': {id:'serial-killer',name:'قاتل سریالی',roleCounts:{'پدرخوانده':1,'گانگستر':1,'مافیا':1,'بازپرس':1,'تکاور':1,'زودیاک':1,'پزشک':1,'جاسوس مستقل':1,'شهروند':6,'قاتل زنجیره‌ای':1,'مستقل':1},investigatorResult:'alignment',independentInvestigation:'nonmafia',godfatherOverride:true,mafiaTieBreak:'godfather',serialKillerWin:'alive',mafiaWin:'parity'},
 'chaos': {id:'chaos',name:'آشوب',roleCounts:{'پدرخوانده':1,'گانگستر':1,'مافیا':1,'بازپرس':1,'تکاور':1,'زودیاک':1,'پزشک':1,'تحلیلگر':1,'شهروند':6,'قاتل زنجیره‌ای':1,'مستقل':1},investigatorResult:'alignment',independentInvestigation:'nonmafia',godfatherOverride:true,mafiaTieBreak:'godfather',serialKillerWin:'alive',mafiaWin:'parity'}
};
const ADDITIONAL_SCENARIO_LIBRARY={};
for(const scenario of SCENARIO_RUNTIME.CATALOG.scenarios){
 ADDITIONAL_SCENARIO_LIBRARY[scenario.id]={id:scenario.id,name:scenario.name,minPlayers:scenario.players.min,maxPlayers:scenario.players.max,theme:scenario.theme,factions:scenario.factions,roles:scenario.roles,winConditions:scenario.winConditions,objective:scenario.objective,objectiveProgress:{}};
}
const EMPIRE_OF_SHADOWS = {
 id:'empire-of-shadows',name:'امپراتوری سایه‌ها',
 roleCounts:{'امپراتور':1,'استراتژیست':1,'جاعل':1,'بازجو':1,'مافیای سایه':1,'فرمانده آشوب':1,'قاتل زنجیره‌ای':1,'کارآگاه ویژه':1,'پزشک اعظم':1,'محافظ سلطنتی':1,'قاضی':1,'هکر':1,'خبرنگار':1,'تک‌تیرانداز':1,'شهروند بانفوذ':1,'شهروند تحلیلگر':1},
 investigatorResult:'alignment', independentInvestigation:'nonmafia',
 godfatherOverride:true, mafiaTieBreak:'godfather', serialKillerWin:'alive', mafiaWin:'parity'
};
module.exports={DEFAULT_SCENARIO,SCENARIO_LIBRARY,ADDITIONAL_SCENARIO_LIBRARY,EMPIRE_OF_SHADOWS,ROLE_GROUP,ROLE_ACTION,roleGroup,roleAction,validateScenario,assignRoles,investigatorCheck,independentCheck,resolveMafiaVote,resolveDayVote,resolveNight,checkWin,listScenarios:SCENARIO_RUNTIME.listScenarios};