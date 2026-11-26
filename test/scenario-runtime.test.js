const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules-engine');
const Runtime = require('../scenario-runtime');

test('هر ده سناریو در تمام ظرفیت‌های تعریف‌شده ترکیب نقش معتبر می‌سازند',()=>{
  const scenarios=Runtime.listScenarios();
  assert.equal(scenarios.length,10);
  for(const s of scenarios) for(let n=s.minPlayers;n<=s.maxPlayers;n++){
    const deck=Runtime.makeRoleDeck(s.id,n);
    assert.equal(deck.length,n,s.id+' / '+n);
    assert.ok(deck.every(role=>Runtime.roleInfo(role,s.id)),s.id+' role lookup');
    assert.ok(deck.every(role=>R.roleGroup(role,s.id)),s.id+' faction lookup');
  }
});

test('سناریوهای کم‌نفره با حداقل ظرفیت شروع می‌شوند و ظرفیت نامعتبر رد می‌شود',()=>{
  const deck=Runtime.makeRoleDeck('cyber-heist',6);
  assert.equal(deck.length,6);
  assert.throws(()=>Runtime.makeRoleDeck('cyber-heist',5),/بین 6 و 12/);
});

test('نقش‌ها و جناح‌ها در تخصیص پویا حفظ می‌شوند',()=>{
  const players=Array.from({length:8},(_,i)=>({id:'p'+i,name:'بازیکن '+i}));
  const assigned=R.assignRoles(players,R.ADDITIONAL_SCENARIO_LIBRARY['gangster-wars'],()=>0.42);
  assert.equal(assigned.length,8);
  assert.equal(R.roleAction('عضو باند شرق','gangster-wars'),'faction-vote');
  assert.ok(assigned.every(p=>p.alive&&typeof p.role==='string'));
  assert.ok(assigned.some(p=>R.roleGroup(p.role,'gangster-wars')==='east_gang'));
  assert.ok(assigned.some(p=>R.roleGroup(p.role,'gangster-wars')==='west_gang'));
});

test('رأی داخلی جناح در تساوی با رأی رهبر حل می‌شود',()=>{
  const players=[
    {id:'leader',role:'پدرخوانده',alive:true},
    {id:'member',role:'مافیای ساده',alive:true},
    {id:'a',role:'کارآگاه',alive:true},
    {id:'b',role:'پزشک',alive:true},
    {id:'c',role:'شهروند',alive:true},
    {id:'d',role:'شهروند',alive:true},
    {id:'e',role:'شهروند',alive:true}
  ];
  const out=R.resolveNight(players,{leader:'a',member:'b'},R.ADDITIONAL_SCENARIO_LIBRARY['classic-mafia'],1);
  assert.deepEqual(out.deaths,['a']);
});

test('توانایی محافظت، حمله شبانه را خنثی می‌کند',()=>{
  const players=[
    {id:'v',role:'خون‌آشام',alive:true},
    {id:'h',role:'شفادهنده',alive:true},
    {id:'t',role:'روستایی',alive:true},
    {id:'l',role:'ارباب خون‌آشام',alive:true},
    {id:'x',role:'روستایی',alive:true},
    {id:'y',role:'روستایی',alive:true},
    {id:'z',role:'روستایی',alive:true}
  ];
  const out=R.resolveNight(players,{v:'t',h:'t'},R.ADDITIONAL_SCENARIO_LIBRARY['vampire-night'],1);
  assert.deepEqual(out.deaths,[]);
  assert.deepEqual(out.blocked,['t']);
});

test('تساوی رأی روز حذف ایجاد نمی‌کند',()=>{
  const players=[{id:'a',alive:true},{id:'b',alive:true},{id:'c',alive:true}];
  const out=R.resolveDayVote({a:'b',b:'a',c:'a'},players);
  assert.equal(out.tied,false);
  assert.equal(out.target,'a');
});

test('پیشرفت هدف سناریو به شرط پیروزی متصل است',()=>{
  const players=[
    {id:'i',role:'سرکرده نفوذی‌ها',alive:true},
    {id:'a',role:'نفوذی',alive:true},
    {id:'c',role:'فرمانده عملیات',alive:true},
    {id:'r',role:'تکاور',alive:true},
    {id:'s',role:'تک‌تیرانداز',alive:true},
    {id:'e',role:'مهندس خنثی‌سازی',alive:true},
    {id:'x',role:'تحلیلگر اطلاعات',alive:true},
    {id:'y',role:'تحلیلگر اطلاعات',alive:true}
  ];
  let progress={};
  for(let n=0;n<3;n++){
    const out=R.resolveNight(players,{a:'c'},R.ADDITIONAL_SCENARIO_LIBRARY['tactical-command'],n+1,progress);
    progress=out.objectiveProgress;
  }
  const scenario={...R.ADDITIONAL_SCENARIO_LIBRARY['tactical-command'],objectiveProgress:progress};
  assert.equal(R.checkWin(players,scenario).winner,'infiltrators');
});
