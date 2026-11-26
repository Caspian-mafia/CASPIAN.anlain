'use strict';
const CaspianOfflineEngine = (function (root) {
  const ROLES = {
    GODFATHER:'godfather', STRATEGIST:'strategist', FORGER:'forger', INTERROGATOR:'interrogator', SHADOW_MAFIA:'shadow_mafia',
    CHAOS_COMMANDER:'chaos_commander', SERIAL_KILLER:'serial_killer',
    DETECTIVE:'detective', DOCTOR:'doctor', ROYAL_GUARD:'royal_guard', JUDGE:'judge', HACKER:'hacker',
    REPORTER:'reporter', SNIPER:'sniper', INFLUENTIAL:'influential_citizen', ANALYST:'analyst', CITIZEN:'citizen'
  };
  const FACTION = { MAFIA:'mafia', TOWN:'town', INDEPENDENT:'independent' };
  const LABELS = {
    godfather:'پدرخوانده', strategist:'استراتژیست', forger:'جعل‌کننده', interrogator:'بازجو', shadow_mafia:'مافیای سایه',
    chaos_commander:'فرمانده آشوب', serial_killer:'قاتل زنجیره‌ای', detective:'کارآگاه ویژه', doctor:'پزشک اعظم',
    royal_guard:'محافظ سلطنتی', judge:'قاضی', hacker:'هکر', reporter:'خبرنگار', sniper:'تک‌تیرانداز',
    influential_citizen:'شهروند بانفوذ', analyst:'تحلیلگر', citizen:'شهروند'
  };
  const ROLE_FACTION = {
    godfather:FACTION.MAFIA, strategist:FACTION.MAFIA, forger:FACTION.MAFIA, interrogator:FACTION.MAFIA, shadow_mafia:FACTION.MAFIA,
    chaos_commander:FACTION.INDEPENDENT, serial_killer:FACTION.INDEPENDENT,
    detective:FACTION.TOWN, doctor:FACTION.TOWN, royal_guard:FACTION.TOWN, judge:FACTION.TOWN, hacker:FACTION.TOWN,
    reporter:FACTION.TOWN, sniper:FACTION.TOWN, influential_citizen:FACTION.TOWN, analyst:FACTION.TOWN, citizen:FACTION.TOWN
  };
  const DECKS = {
    8:['godfather','shadow_mafia','serial_killer','detective','doctor','royal_guard','analyst','citizen'],
    10:['godfather','strategist','shadow_mafia','serial_killer','detective','doctor','royal_guard','judge','hacker','analyst'],
    12:['godfather','strategist','forger','shadow_mafia','chaos_commander','serial_killer','detective','doctor','royal_guard','judge','reporter','analyst'],
    14:['godfather','strategist','forger','shadow_mafia','chaos_commander','serial_killer','detective','doctor','royal_guard','judge','hacker','reporter','sniper','analyst'],
    16:['godfather','strategist','forger','interrogator','shadow_mafia','chaos_commander','serial_killer','detective','doctor','royal_guard','judge','hacker','reporter','sniper','influential_citizen','analyst']
  };
  const CLASSIC_DECKS = {
    8:['godfather','shadow_mafia','detective','doctor','royal_guard','analyst','citizen','citizen'],
    10:['godfather','shadow_mafia','detective','doctor','royal_guard','judge','hacker','analyst','citizen','citizen'],
    12:['godfather','strategist','shadow_mafia','detective','doctor','royal_guard','judge','hacker','reporter','analyst','citizen','citizen'],
    14:['godfather','strategist','forger','shadow_mafia','detective','doctor','royal_guard','judge','hacker','reporter','sniper','analyst','citizen','citizen'],
    16:['godfather','strategist','forger','shadow_mafia','detective','doctor','royal_guard','judge','hacker','reporter','sniper','influential_citizen','analyst','citizen','citizen','citizen']
  };
  const ROLE_ACTION = {
    strategist:'block', forger:'forge', interrogator:'silence', chaos_commander:'mark',
    serial_killer:'serial_kill', detective:'investigate', doctor:'heal', royal_guard:'protect',
    hacker:'hack', reporter:'compare', sniper:'shoot', analyst:'analyze'
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const shuffle = (items, random=Math.random) => {
    const a=[...items];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  };
  const player = (game,id) => game.players.find(p=>p.id===id);
  const living = game => game.players.filter(p=>p.alive);
  const pick = (items,random=Math.random) => items.length ? items[Math.floor(random()*items.length)] : null;
  function createGame(inputPlayers, scenario='empire', random=Math.random) {
    if(!Array.isArray(inputPlayers) || ![8,10,12,14,16].includes(inputPlayers.length)) throw new Error('تعداد بازیکنان باید ۸، ۱۰، ۱۲، ۱۴ یا ۱۶ نفر باشد.');
    if(new Set(inputPlayers.map(p=>p.id)).size!==inputPlayers.length) throw new Error('شناسه بازیکنان باید یکتا باشد.');
    const deckSource=scenario==='classic'?CLASSIC_DECKS[inputPlayers.length]:DECKS[inputPlayers.length];
    const deck=shuffle(deckSource||DECKS[inputPlayers.length],random);
    const players=inputPlayers.map((p,i)=>{
      const roleId=deck[i];
      return {...p,roleId,role:LABELS[roleId],faction:ROLE_FACTION[roleId],alive:true,silenced:false,
        bullets:roleId===ROLES.SNIPER?1:0,chaosMarks:[],chaosPoints:0,lastDoctorTarget:null,lastGuardTarget:null};
    });
    return {
      scenario,phase:'night',round:1,nightNumber:1,dayNumber:0,status:'running',winner:null,players,
      nightActions:[],dayVotes:[],judgeUsed:false,log:[],nightAction:null,dayVote:null,report:'',
      settings:{detectiveResult:'mafia_or_citizen',independentCheck:'nonmafia',godfatherAuthority:'override',
        mafiaTieRule:'godfather',serialKillerKill:'even_nights',serialKillerWin:'alive',mafiaWin:'parity'}
    };
  }
  function submitNightAction(game,actorId,type,targetIds) {
    if(game.status!=='running'||game.phase!=='night') throw new Error('اکشن فقط در مرحله شب پذیرفته می‌شود.');
    const actor=player(game,actorId);
    if(!actor||!actor.alive) throw new Error('بازیکن زنده و معتبر نیست.');
    if(!Array.isArray(targetIds)||!targetIds.length||targetIds.some(id=>!player(game,id)?.alive)||targetIds.includes(actorId)) throw new Error('هدف نامعتبر است.');
    if(type==='mafia_vote') {
      if(actor.faction!==FACTION.MAFIA||targetIds.length!==1) throw new Error('فقط مافیا می‌تواند یک رأی قتل ثبت کند.');
    } else {
      const required=({mafia_override:ROLES.GODFATHER,block:ROLES.STRATEGIST,forge:ROLES.FORGER,silence:ROLES.INTERROGATOR,
        mark:ROLES.CHAOS_COMMANDER,serial_kill:ROLES.SERIAL_KILLER,investigate:ROLES.DETECTIVE,heal:ROLES.DOCTOR,
        protect:ROLES.ROYAL_GUARD,hack:ROLES.HACKER,compare:ROLES.REPORTER,shoot:ROLES.SNIPER,analyze:ROLES.ANALYST})[type];
      if(!required||actor.roleId!==required) throw new Error('این نقش اجازه اجرای این اقدام را ندارد.');
      if(type==='compare'&&targetIds.length!==2) throw new Error('خبرنگار باید دو هدف انتخاب کند.');
      if(type!=='compare'&&targetIds.length!==1) throw new Error('این اقدام فقط یک هدف می‌خواهد.');
      if(type==='serial_kill'&&game.nightNumber%2!==0) throw new Error('قاتل زنجیره‌ای فقط در شب‌های زوج امکان قتل دارد.');
      if(type==='shoot'&&actor.bullets<1) throw new Error('گلوله تک‌تیرانداز قبلاً مصرف شده است.');
      if(type==='mark'&&actor.chaosMarks.length>=2&&!actor.chaosMarks.includes(targetIds[0])) throw new Error('فرمانده آشوب حداکثر دو نشان دارد.');
    }
    const prior=game.nightActions.findIndex(a=>a.actorId===actorId&&a.type===type);
    if(prior>=0) game.nightActions.splice(prior,1);
    game.nightActions.push({actorId,type,targetIds:[...targetIds]});
    return {ok:true};
  }
  function chooseTarget(game,actor,random=Math.random,exclude=[]) {
    let options=living(game).filter(p=>p.id!==actor.id&&!exclude.includes(p.id));
    if(actor.faction===FACTION.MAFIA) options=options.filter(p=>p.faction!==FACTION.MAFIA);
    if(actor.roleId===ROLES.DOCTOR&&actor.lastDoctorTarget) options=options.filter(p=>p.id!==actor.lastDoctorTarget);
    if(actor.roleId===ROLES.ROYAL_GUARD&&actor.lastGuardTarget) options=options.filter(p=>p.id!==actor.lastGuardTarget);
    return pick(options,random)||pick(living(game).filter(p=>p.id!==actor.id),random);
  }
  function addActorActions(game,actor,target,random=Math.random) {
    if(!actor||!actor.alive||!target||target.id===actor.id)return;
    const ids=[target.id];
    if(actor.faction===FACTION.MAFIA) {
      submitNightAction(game,actor.id,'mafia_vote',ids);
      if(actor.roleId===ROLES.GODFATHER) submitNightAction(game,actor.id,'mafia_override',ids);
    }
    const action=ROLE_ACTION[actor.roleId];
    if(action==='serial_kill'&&game.nightNumber%2!==0)return;
    if(action==='shoot'&&actor.bullets<1)return;
    if(action==='compare') {
      const second=pick(living(game).filter(p=>p.id!==actor.id&&p.id!==target.id),random);
      if(second) submitNightAction(game,actor.id,action,[target.id,second.id]);
    } else if(action) submitNightAction(game,actor.id,action,ids);
  }
  function addBotActions(game,userTargetId,random=Math.random) {
    const user=player(game,'p0');
    if(user&&user.alive) {
      const target=userTargetId?player(game,userTargetId):chooseTarget(game,user,random);
      if(target) addActorActions(game,user,target,random);
    }
    for(const bot of living(game).filter(p=>p.bot)) {
      const target=chooseTarget(game,bot,random);
      if(target) addActorActions(game,bot,target,random);
    }
  }
  function resolveNight(game,userTargetId=null,random=Math.random) {
    if(game.phase!=='night'||game.status!=='running') throw new Error('بازی در مرحله شب فعال نیست.');
    game.nightActions=[];
    addBotActions(game,userTargetId,random);
    const actions=clone(game.nightActions);
    const byType=type=>actions.filter(a=>a.type===type&&player(game,a.actorId)?.alive);
    const blocked=new Set(byType('block').map(a=>a.targetIds[0]));
    const valid=type=>byType(type).filter(a=>!blocked.has(a.actorId));
    const votes=byType('mafia_vote').filter(a=>!blocked.has(a.actorId));
    const tally={};votes.forEach(a=>{const id=a.targetIds[0];tally[id]=(tally[id]||0)+1;});
    const high=Math.max(0,...Object.values(tally));
    const leaders=Object.keys(tally).filter(id=>tally[id]===high&&high>0);
    const godfather=game.players.find(p=>p.alive&&p.roleId===ROLES.GODFATHER);
    const override=valid('mafia_override').find(a=>godfather&&a.actorId===godfather.id);
    let mafiaTarget=override?.targetIds[0]||(leaders.length===1?leaders[0]:null);
    if(leaders.length>1&&!override&&godfather) mafiaTarget=null;
    const kills=[];
    if(mafiaTarget) kills.push({targetId:mafiaTarget,source:'mafia'});
    if(game.nightNumber%2===0) for(const a of valid('serial_kill')) kills.push({targetId:a.targetIds[0],source:'serial_killer'});
    for(const a of valid('shoot')) {kills.push({targetId:a.targetIds[0],source:'sniper'});const p=player(game,a.actorId);if(p)p.bullets=0;}
    const doctors=valid('heal').map(a=>({actor:player(game,a.actorId),target:a.targetIds[0]})).filter(x=>x.actor&&x.actor.lastDoctorTarget!==x.target);
    const guards=valid('protect').map(a=>({actor:player(game,a.actorId),target:a.targetIds[0]})).filter(x=>x.actor&&x.actor.lastGuardTarget!==x.target);
    const protectedTargets=new Set([...doctors,...guards].map(x=>x.target));
    doctors.forEach(x=>x.actor.lastDoctorTarget=x.target);guards.forEach(x=>x.actor.lastGuardTarget=x.target);
    const deaths=[...new Set(kills.filter(k=>!protectedTargets.has(k.targetId)).map(k=>k.targetId))];
    deaths.forEach(id=>{const p=player(game,id);if(p)p.alive=false;});
    for(const a of valid('mark')){const p=player(game,a.actorId),id=a.targetIds[0];if(p&&!p.chaosMarks.includes(id)&&p.chaosMarks.length<2)p.chaosMarks.push(id);}
    const forged=valid('forge')[0]?.targetIds[0]||null, reports=[];
    for(const a of valid('investigate')) {
      const target=player(game,a.targetIds[0]);if(!target)continue;
      let result=target.faction===FACTION.MAFIA?'مافیا':'شهروند';
      if(target.roleId===ROLES.GODFATHER) result='شهروند';
      if(forged===target.id) result=result==='مافیا'?'شهروند':'مافیا';
      reports.push({actorId:a.actorId,type:'detective',targetId:target.id,result});
    }
    for(const a of [...valid('hack'),...valid('analyze')]) {
      const target=player(game,a.targetIds[0]);if(target)reports.push({actorId:a.actorId,type:a.type,targetId:target.id,result:'night_activity',hadAction:actions.some(x=>x.actorId===target.id&&x.type!=='mafia_vote')});
    }
    for(const a of valid('compare')) {
      const [x,y]=a.targetIds.map(id=>player(game,id));if(x&&y)reports.push({actorId:a.actorId,type:'compare',targetIds:[x.id,y.id],sameFaction:x.faction===y.faction});
    }
    const silenced=[...new Set(valid('silence').map(a=>a.targetIds[0]))];
    silenced.forEach(id=>{const p=player(game,id);if(p&&p.alive)p.silenced=true;});
    const privateReports=reports.filter(r=>r.actorId==='p0');
    game.report=privateReports.map(r=>r.type==='detective'?'نتیجه استعلام: '+r.result:r.type==='compare'?'گزارش خبرنگار: '+(r.sameFaction?'دو نفر هم‌جناح هستند':'دو نفر هم‌جناح نیستند'):r.type==='hack'?'گزارش هکر: '+(r.hadAction?'هدف فعالیت شبانه داشت':'هدف فعالیت شبانه نداشت'):r.type==='analyze'?'سرنخ تحلیلگر: '+(r.hadAction?'هدف فعالیت شبانه داشت':'هدف فعالیت شبانه نداشت'):'').filter(Boolean).join(' · ');
    game.log.push({night:game.nightNumber,deaths,silenced,reports});
    game.nightActions=[];game.phase='day';game.dayNumber++;
    const winner=evaluateWin(game);if(winner){game.status='finished';game.winner=winner;game.phase='finished';}
    return {deaths,reports,silenced,winner:game.winner};
  }
  function castDayVote(game,voterId,targetId) {
    if(game.phase!=='day'||game.status!=='running')throw new Error('رأی‌گیری روز فعال نیست.');
    const voter=player(game,voterId),target=player(game,targetId);
    if(!voter?.alive||!target?.alive||voter.id===target.id)throw new Error('رأی‌دهنده یا هدف معتبر نیست.');
    const old=game.dayVotes.findIndex(v=>v.voterId===voterId);if(old>=0)game.dayVotes.splice(old,1);
    game.dayVotes.push({voterId,targetId,weight:voter.roleId===ROLES.INFLUENTIAL?2:1});return {ok:true};
  }
  function resolveDay(game,userTargetId=null,random=Math.random) {
    if(game.phase!=='day'||game.status!=='running')throw new Error('بازی در مرحله روز فعال نیست.');
    game.dayVotes=[];
    const user=player(game,'p0');
    if(user?.alive) {
      const target=userTargetId?player(game,userTargetId):chooseTarget(game,user,random);
      if(target&&target.id!==user.id)castDayVote(game,'p0',target.id);
    }
    for(const bot of living(game).filter(p=>p.bot)) {
      const opts=living(game).filter(p=>p.id!==bot.id);
      let target;
      if(bot.faction===FACTION.MAFIA) target=pick(opts.filter(p=>p.faction!==FACTION.MAFIA),random);
      else target=pick(opts.filter(p=>p.faction===FACTION.MAFIA),random)||pick(opts,random);
      if(target)castDayVote(game,bot.id,target.id);
    }
    let judgeTarget=null;
    const judge=game.players.find(p=>p.alive&&p.roleId===ROLES.JUDGE);
    if(judge&&!game.judgeUsed) {
      const botVotes=game.dayVotes.filter(v=>v.voterId!=='p0');
      if(botVotes.length){const cancelled=pick(botVotes,random);judgeTarget=cancelled.voterId;game.judgeUsed=true;}
    }
    const valid=game.dayVotes.filter(v=>player(game,v.voterId)?.alive&&player(game,v.targetId)?.alive&&v.voterId!==judgeTarget);
    const tally={};valid.forEach(v=>{tally[v.targetId]=(tally[v.targetId]||0)+v.weight;});
    const max=Math.max(0,...Object.values(tally)),leaders=Object.keys(tally).filter(id=>tally[id]===max&&max>0);
    const eliminated=leaders.length===1?leaders[0]:null;
    if(eliminated) {
      const victim=player(game,eliminated);if(victim)victim.alive=false;
      for(const p of game.players)if(p.roleId===ROLES.CHAOS_COMMANDER&&p.alive&&p.chaosMarks.includes(eliminated))p.chaosPoints++;
    }
    for(const p of game.players)p.silenced=false;
    game.dayVotes=[];game.nightNumber++;game.round++;game.phase='night';
    const winner=evaluateWin(game);if(winner){game.status='finished';game.winner=winner;game.phase='finished';}
    return {eliminated,tally,judgeTarget,winner:game.winner};
  }
  function evaluateWin(game) {
    const alivePlayers=living(game);
    if(alivePlayers.length===1&&alivePlayers[0].roleId===ROLES.SERIAL_KILLER)return FACTION.INDEPENDENT;
    const mafia=alivePlayers.filter(p=>p.faction===FACTION.MAFIA).length;
    const nonMafia=alivePlayers.length-mafia;
    if(mafia>0&&mafia>=nonMafia)return FACTION.MAFIA;
    const chaos=alivePlayers.find(p=>p.roleId===ROLES.CHAOS_COMMANDER&&p.chaosPoints>=2);
    if(chaos&&alivePlayers.length<=3)return 'chaos_commander';
    const hasKiller=alivePlayers.some(p=>p.roleId===ROLES.SERIAL_KILLER);
    if(mafia===0&&!hasKiller&&!chaos)return FACTION.TOWN;
    return null;
  }
  function serialize(game){return clone(game);}
  return {ROLES,FACTION,LABELS,ROLE_FACTION,DECKS,CLASSIC_DECKS,createGame,submitNightAction,resolveNight,castDayVote,resolveDay,evaluateWin,serialize};
})(typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined'&&module.exports)module.exports=CaspianOfflineEngine;
if(typeof window!=='undefined')window.CaspianOfflineEngine=CaspianOfflineEngine;
