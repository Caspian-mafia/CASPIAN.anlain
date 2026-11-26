'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('./offline-engine.js');
const names=['پدرخوانده','استراتژیست','جعل‌کننده','بازجو','مافیای سایه','فرمانده آشوب','قاتل زنجیره‌ای','کارآگاه ویژه','پزشک اعظم','محافظ سلطنتی','قاضی','هکر','خبرنگار','تک‌تیرانداز','شهروند بانفوذ','تحلیلگر'];
function basePlayers(){return Array.from({length:16},(_,i)=>({id:'p'+i,name:'بازیکن '+i,bot:false,avatar:'avatar-fox'}));}
function fixedGame(){
 const g=Engine.createGame(basePlayers(),'empire',()=>0.37);
 const roles=['detective','godfather','strategist','forger','interrogator','shadow_mafia','chaos_commander','serial_killer','doctor','royal_guard','judge','hacker','reporter','sniper','influential_citizen','analyst'];
 g.players.forEach((p,i)=>{p.roleId=roles[i];p.role=Engine.LABELS[roles[i]];p.faction=Engine.ROLE_FACTION[roles[i]];p.bot=false;});
 return g;
}
test('Empire of Shadows deals the exact 16-role / 5-2-9 roster',()=>{
 const g=Engine.createGame(basePlayers(),'empire',()=>0.37);
 assert.equal(g.players.length,16);
 assert.equal(g.players.filter(p=>p.faction==='mafia').length,5);
 assert.equal(g.players.filter(p=>p.faction==='independent').length,2);
 assert.equal(g.players.filter(p=>p.faction==='town').length,9);
 assert.deepEqual(new Set(g.players.map(p=>p.roleId)).size,16);
});
test('serial killer action is rejected on odd nights and accepted on even nights',()=>{
 const g=fixedGame(),sk=g.players.find(p=>p.roleId==='serial_killer'),target=g.players.find(p=>p.id!==sk.id);
 assert.throws(()=>Engine.submitNightAction(g,sk.id,'serial_kill',[target.id]),/شب‌های زوج/);
 g.nightNumber=2;
 assert.deepEqual(Engine.submitNightAction(g,sk.id,'serial_kill',[target.id]),{ok:true});
});
test('detective reports only citizen for the Godfather and independent targets',()=>{
 const g=fixedGame();
 const gf=g.players.find(p=>p.roleId==='godfather');
 const result=Engine.resolveNight(g,gf.id,()=>0.5);
 const report=result.reports.find(r=>r.actorId==='p0'&&r.type==='detective');
 assert.equal(report.result,'شهروند');
});
test('offline night resolution advances to day and keeps game state serializable',()=>{
 const g=fixedGame();
 const result=Engine.resolveNight(g,'p1',()=>0.5);
 assert.equal(g.phase,'day');
 assert.equal(g.dayNumber,1);
 assert.equal(g.status,'running');
 assert.doesNotThrow(()=>JSON.stringify(Engine.serialize(g)));
 assert.ok(Array.isArray(result.deaths));
});
test('mafia parity wins when mafia reaches parity with all non-mafia factions',()=>{
 const g=fixedGame();
 g.players.forEach(p=>p.alive=false);
 g.players[0].alive=true;g.players[0].roleId='godfather';g.players[0].faction='mafia';
 g.players[1].alive=true;g.players[1].roleId='strategist';g.players[1].faction='mafia';
 g.players[2].alive=true;g.players[2].roleId='doctor';g.players[2].faction='town';
 assert.equal(Engine.evaluateWin(g),'mafia');
});
