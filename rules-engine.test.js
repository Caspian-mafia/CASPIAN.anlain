'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),R=require('./rules-engine');
const players=Array.from({length:16},(_,i)=>({id:'p'+i,name:'بازیکن '+i,alive:true}));
test('reject scenario not totaling sixteen',()=>assert.throws(()=>R.validateScenario({...R.DEFAULT_SCENARIO,roleCounts:{'مافیا':1}})));
test('deal exact configured roles to sixteen players',()=>{const p=R.assignRoles(players,R.DEFAULT_SCENARIO,()=>0.31);assert.equal(p.length,16);assert.equal(p.filter(x=>R.roleGroup(x.role)==='mafia').length,5);assert.equal(p.filter(x=>x.role==='کارآگاه').length,1);});
test('reject role assignment unless exactly sixteen players',()=>assert.throws(()=>R.assignRoles(players.slice(1),R.DEFAULT_SCENARIO)));
test('day voting excludes dead and invalid voters',()=>{const p=[{id:'a',alive:true},{id:'b',alive:true},{id:'c',alive:false}];assert.equal(R.resolveDayVote({a:'b',c:'b',unknown:'b'},p).target,'b');});
test('day tie causes no elimination',()=>{const p=[{id:'a',alive:true},{id:'b',alive:true}];assert.equal(R.resolveDayVote({a:'b',b:'a'},p).target,null);});
test('doctor protects target from mafia attack',()=>{const p=[{id:'m',role:'مافیا',alive:true},{id:'d',role:'پزشک',alive:true},{id:'t',role:'شهروند',alive:true}];const out=R.resolveNight(p,{m:'t',d:'t'});assert.deepEqual(out.deaths,[]);assert.deepEqual(out.blocked,['t']);});
test('detective sees godfather as citizen when override is enabled',()=>{const p=[{id:'k',role:'کارآگاه',alive:true},{id:'g',role:'پدرخوانده',alive:true}];assert.equal(R.resolveNight(p,{k:'g'}).privateResults.k.result,'شهروند');});
test('independent gets non-mafia investigation',()=>{const p=[{id:'i',role:'مستقل',alive:true},{id:'c',role:'شهروند',alive:true}];assert.equal(R.resolveNight(p,{i:'c'}).privateResults.i.result,'غیرمافیا');});
test('full sixteen-player test: removing all mafia awards town victory',()=>{let p=R.assignRoles(players,R.DEFAULT_SCENARIO,()=>0.31);p=p.map(x=>({...x,alive:R.roleGroup(x.role)!=='mafia'}));assert.equal(R.checkWin(p).winner,'town');});
test('mafia parity win condition',()=>assert.equal(R.checkWin([{role:'مافیا',alive:true},{role:'شهروند',alive:true}]).winner,'mafia'));
test('godfather tie-break selects the target chosen by godfather',()=>{const out=R.resolveMafiaVote({g:'x',m1:'x',m2:'y',m3:'y'},'g',R.DEFAULT_SCENARIO);assert.equal(out.tied,true);assert.equal(out.target,'x');});

test('godfather override makes detective see the godfather as citizen',()=>{assert.equal(R.investigatorCheck('پدرخوانده',R.DEFAULT_SCENARIO),'شهروند');});
test('detective sees other mafia as mafia while godfather override is enabled',()=>{assert.equal(R.investigatorCheck('مافیا',R.DEFAULT_SCENARIO),'مافیا');});
test('scenario requires explicit godfather override setting',()=>{const s={...R.DEFAULT_SCENARIO};delete s.godfatherOverride;assert.throws(()=>R.validateScenario(s));});

test('Empire of Shadows is a valid dedicated 16-player deck',()=>{const s=R.validateScenario(R.EMPIRE_OF_SHADOWS);assert.equal(s.id,'empire-of-shadows');assert.equal(s.name,'امپراتوری سایه‌ها');const p=R.assignRoles(players,s,()=>0.27);assert.equal(p.length,16);assert.equal(p.filter(x=>R.roleGroup(x.role)==='mafia').length,5);assert.equal(p.filter(x=>R.roleGroup(x.role)==='independent').length,2);assert.equal(p.filter(x=>R.roleGroup(x.role)==='citizen').length,9);});
test('Empire of Shadows keeps godfather override and independent non-mafia check',()=>{assert.equal(R.investigatorCheck('پدرخوانده',R.EMPIRE_OF_SHADOWS),'شهروند');assert.equal(R.independentCheck('مافیا',R.EMPIRE_OF_SHADOWS),'مافیا');assert.equal(R.independentCheck('شهروند',R.EMPIRE_OF_SHADOWS),'غیرمافیا');});

test('Empire of Shadows uses the exact requested 16-role roster and faction counts',()=>{const p=R.assignRoles(players,R.EMPIRE_OF_SHADOWS,()=>0.27);assert.equal(p.filter(x=>R.roleGroup(x.role)==='mafia').length,5);assert.equal(p.filter(x=>R.roleGroup(x.role)==='independent').length,2);assert.equal(p.filter(x=>R.roleGroup(x.role)==='citizen').length,9);assert.ok(p.some(x=>x.role==='امپراتور'));});
test('serial killer cannot kill on odd nights',()=>{const p=[{id:'sk',role:'قاتل زنجیره‌ای',alive:true},{id:'t',role:'شهروند',alive:true}];assert.deepEqual(R.resolveNight(p,{sk:'t'},R.EMPIRE_OF_SHADOWS,1).deaths,[]);});
test('serial killer can kill on even nights',()=>{const p=[{id:'sk',role:'قاتل زنجیره‌ای',alive:true},{id:'t',role:'شهروند',alive:true}];assert.deepEqual(R.resolveNight(p,{sk:'t'},R.EMPIRE_OF_SHADOWS,2).deaths,['t']);});
test('mafia cannot choose another mafia member as a night target',()=>{const p=[{id:'g',role:'امپراتور',alive:true},{id:'m',role:'استراتژیست',alive:true},{id:'c',role:'شهروند تحلیلگر',alive:true}];assert.deepEqual(R.resolveNight(p,{g:'m',m:'g'},R.EMPIRE_OF_SHADOWS,2).deaths,[]);});
test('unknown roles are not silently counted as citizens',()=>{assert.equal(R.roleGroup('نقش ناشناخته'),null);});
test('day voting ignores self votes but counts votes from other players',()=>{const p=[{id:'a',alive:true},{id:'b',alive:true}];assert.equal(R.resolveDayVote({a:'a'},p).target,null);assert.equal(R.resolveDayVote({a:'a',b:'a'},p).target,'a');});

test('Empire Godfather override beats a larger mafia plurality',()=>{const s={...R.EMPIRE_OF_SHADOWS,godfatherOverride:true};const out=R.resolveMafiaVote({g:'a',m1:'b',m2:'b',m3:'b',m4:'b'},'g',s);assert.equal(out.target,'a');assert.equal(out.decidedBy,'godfather');assert.equal(out.overridden,true);});
test('Empire mafia plurality applies when Godfather does not submit a choice',()=>{const out=R.resolveMafiaVote({m1:'b',m2:'b',m3:'a'},'g',R.EMPIRE_OF_SHADOWS);assert.equal(out.target,'b');});
test('Empire detective reports only mafia or citizen, including independents as citizen',()=>{for(const role of ['فرمانده آشوب','قاتل زنجیره‌ای','شهروند تحلیلگر'])assert.ok(['مافیا','شهروند'].includes(R.investigatorCheck(role,R.EMPIRE_OF_SHADOWS)));assert.equal(R.investigatorCheck('فرمانده آشوب',R.EMPIRE_OF_SHADOWS),'شهروند');});
test('Empire royal guard protects a player from mafia elimination',()=>{const p=[{id:'g',role:'امپراتور',alive:true},{id:'m',role:'استراتژیست',alive:true},{id:'guard',role:'محافظ سلطنتی',alive:true},{id:'t',role:'شهروند تحلیلگر',alive:true}];const out=R.resolveNight(p,{g:'t',m:'t',guard:'t'},R.EMPIRE_OF_SHADOWS,2);assert.deepEqual(out.deaths,[]);assert.deepEqual(out.blocked,['t']);});
test('Empire sniper shot is one-use',()=>{const p=[{id:'s',role:'تک‌تیرانداز',alive:true},{id:'t',role:'شهروند تحلیلگر',alive:true}];assert.deepEqual(R.resolveNight(p,{s:'t'},R.EMPIRE_OF_SHADOWS,1).deaths,['t']);assert.equal(p[0].rangerShotUsed,true);assert.deepEqual(R.resolveNight(p,{s:'t'},R.EMPIRE_OF_SHADOWS,2).deaths,[]);});
test('Empire mafia action cannot eliminate a mafia teammate',()=>{const p=[{id:'g',role:'امپراتور',alive:true},{id:'m',role:'استراتژیست',alive:true},{id:'t',role:'شهروند تحلیلگر',alive:true}];assert.deepEqual(R.resolveNight(p,{g:'m',m:'g'},R.EMPIRE_OF_SHADOWS,2).deaths,[]);});

test('Empire detective sees the Emperor as citizen under Godfather override',()=>{assert.equal(R.investigatorCheck('امپراتور',R.EMPIRE_OF_SHADOWS),'شهروند');});
