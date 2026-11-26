'use strict';
const express=require('express'),http=require('http'),crypto=require('crypto');
const {Server}=require('socket.io');
const R=require('./rules-engine');
const store=require('./persistence');
const platform=require('./platform');
const app=express(),server=http.createServer(app),io=new Server(server);
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next();});app.use(express.json({limit:'32kb'}));app.use('/api',platform.router);app.use(express.static('public'));
const rooms=new Map(),makeCode=()=>crypto.randomBytes(3).toString('hex').toUpperCase();
const cleanName=v=>String(v||'بازیکن').trim().slice(0,20)||'بازیکن';
const newPlayerId=()=>crypto.randomUUID();
const newPlayerToken=()=>crypto.randomBytes(32).toString('base64url');
const tokenHash=token=>crypto.createHash('sha256').update(String(token)).digest('hex');
function tokenMatches(player,token){const a=Buffer.from(player?.tokenHash||'');const b=Buffer.from(tokenHash(token));return a.length===b.length&&crypto.timingSafeEqual(a,b);}
const cosmetics=require('./cosmetics');
const roomPolicy=require('./room-policy');
const roomDirectory=require('./room-directory');
const registerVoice=require('./voice-signaling');
async function playerCosmetics(data={}){const equipped=await platform.resolveRoomCosmetics(data);const avatar=String(equipped.avatarId||'avatar-starter-fox'),frame=String(equipped.frameId||'frame-starter');return {avatarId:cosmetics.isAvatarId(avatar)?avatar:'avatar-starter-fox',frameId:cosmetics.isFrameId(frame)?frame:'frame-starter'};}
const DEFAULT_GAME_PRIZE_COINS=20_000;
async function readAppSetting(name,fallback){try{const {rows}=await store.query('SELECT setting_value FROM caspian_app_settings WHERE setting_key=$1',[name]);return rows[0]?.setting_value??fallback;}catch{return fallback;}}
async function roomPlayerIdentity(data={}){const [cosmetics,userId,socialItems]=await Promise.all([playerCosmetics(data),platform.resolveRoomUserId(data),platform.resolveRoomSocialItems(data)]);return {...cosmetics,userId,socialItems};}
function safeRoom(r){return {code:r.code,hostMode:r.hostMode||'player',phase:r.phase,started:r.started,finished:!!r.finished,roomOpen:r.roomOpen!==false,chatOpen:r.chatOpen!==false,round:r.round,gameStage:r.gameStage||'lobby',phaseDeadline:r.phaseDeadline||null,serverNow:Date.now(),phaseSeconds:r.flowSettings?.[r.gameStage]||0,speakerTurnId:r.speakerTurnId||null,speakerTurnDeadline:r.speakerTurnDeadline||null,roleCards:r.roleCards?.map(c=>({id:c.id,claimed:!!c.claimed}))||[],flowSettings:r.flowSettings||{},players:r.players.map(p=>({id:p.id,name:p.name,alive:p.alive,host:p.id===r.hostPlayerId,seat:p.seat||null,hasPickedRole:!!p.role,avatarId:p.avatarId||'avatar-starter-fox',frameId:p.frameId||'frame-starter'})),scenarioId:r.scenario.id||'classic',scenarioName:r.scenario.name,narratorMode:r.narratorMode||'hybrid',minPlayers:r.scenario.players?.min||r.scenario.minPlayers||16,maxPlayers:r.scenario.players?.max||r.scenario.maxPlayers||16};}
const FLOW_TIMERS=new WeakMap(),SPEAKER_TIMERS=new WeakMap();
const DEFAULT_FLOW_SETTINGS={intro:45,day1:120,discussion:90,vote:60,defense:30,mafiaTalk:45,mafiaAction:30,citizenAbilities:60,speakerTurn:30};
function roleGuide(r,role){
 const group=R.roleGroup(role,r.scenario.id)||'unknown',action=R.roleAction(role,r.scenario.id)||'none';
 const abilities={
  'mafia-vote':'در گفت‌وگوی مخفی جناح خود نقشه بکش و هدف حذف را ثبت کن. تصمیم نهایی طبق قانون رهبر همان جناح حل می‌شود.',
  'faction-vote':'در جلسه مخفی جناح خود درباره هدف رأی بده؛ رأی رهبر طبق قانون سناریو تعیین‌کننده است.',
  'eliminate':'در نوبت مخفی شب یک هدف را برای حذف انتخاب کن.',
  'reveal':'یک هدف را بررسی یا نشان‌گذاری کن؛ نتیجه طبق قانون سناریو محرمانه ارسال می‌شود.',
  'track':'هدف را در شب دنبال کن و اطلاعات ردیابی را محرمانه دریافت کن.',
  'sabotage':'در نوبت مخفی، زیرساخت یا اقدام جناح مقابل را مختل کن.',
  'infect':'طبق توانایی سناریو یک هدف را آلوده کن؛ اثر آن در حل شب اعمال می‌شود.',
  'repair':'یک هدف یا سامانه را طبق قانون سناریو تعمیر یا بازیابی کن.',
  'collect':'منبع یا پیشرفت هدف سناریو را جمع‌آوری کن.',
  'hack':'در نوبت محرمانه، هدف یا سامانه را هک کن و نتیجه را خصوصی بگیر.',
  'protect':'در مرحله توانایی شب یک بازیکن را برای محافظت انتخاب کن. نتیجه و محدودیت‌های حفاظت طبق قوانین سناریو اعمال می‌شود.',
  'mafia-protect':'در مرحله اقدام مافیا یک عضو تیم را برای حفاظت انتخاب کن.',
  'investigate':'در نوبت خصوصی شب، یک بازیکن را بررسی کن؛ نتیجه فقط برای خودت فرستاده می‌شود.',
  'zodiac-check':'در نوبت خصوصی شب یک هدف را بررسی کن؛ نتیجه فقط برای خودت آشکار می‌شود.',
  'independent-investigate':'در نوبت مستقل شب یک بازیکن را بررسی کن؛ نتیجه محرمانه است.',
  'serial-kill':'در شب‌های مجاز سناریو یک هدف را انتخاب کن؛ در سناریوی امپراتوری سایه‌ها شلیک فقط در شب‌های زوج مجاز است.',
  'ranger-shot':'توانایی شلیک ویژه را طبق محدودیت یک‌بار/قانون سناریو در نوبت خود استفاده کن.'
 };
 const factions={mafia:'مافیا',citizen:'شهروند',citizens:'شهروند',independent:'مستقل',raider:'غارتگر',duelist:'دوئل‌طلب',treasure_hunter:'شکارچی گنج',network:'شبکه',city:'شهر',zodiac:'زودیاک',town:'شهر',east_gang:'باند شرق',west_gang:'باند غرب',infiltrators:'نفوذی‌ها',special_forces:'تکاوران',vampires:'خون‌آشام‌ها',villagers:'روستاییان',infected:'آلودگان',survivors:'بازماندگان',outlaws:'راهزنان',mutineers:'شورشیان',navy:'نیروی دریایی',hackers:'هکرها',security:'امنیت شبکه',mercenary:'مزدور'};
 const objectives={mafia:'با هم‌تیمی‌ها همکاری کن و طبق شرط پیروزی مافیا بازی کن.',citizen:'هویت تهدیدها را کشف کن، در رأی‌گیری درست تصمیم بگیر و شرط پیروزی شهر را محقق کن.',citizens:'هویت تهدیدها را کشف کن، در رأی‌گیری درست تصمیم بگیر و شرط پیروزی شهر را محقق کن.',city:'از شهر دفاع کن و تهدیدهای مخفی را شناسایی کن.',town:'از مردم شهر محافظت کن و جناح‌های مهاجم را متوقف کن.',villagers:'از روستا دفاع کن و خون‌آشام‌ها را شناسایی کن.',survivors:'برای زنده‌ماندن بازماندگان و رسیدن به پناهگاه همکاری کن.',special_forces:'عملیات نیروهای ویژه را طبق هدف سناریو پیش ببر.',security:'از شبکه دفاع کن و نفوذگرها را شناسایی کن.',independent:'هدف و شرط پیروزی مستقل مخصوص همین سناریو را دنبال کن؛ ممکن است با هر دو جناح رقابت داشته باشی.'};
 return {role,faction:factions[group]||group,description:abilities[action]||'این نقش توانایی فعال شبانه ندارد؛ از اطلاعات و گفت‌وگوی روز برای انجام هدف خود استفاده کن.',objective:objectives[group]||'شرط پیروزی و جزئیات این نقش مطابق قوانین سناریوی انتخاب‌شده است.',phase:action==='none'?'روز':'شب',scenarioName:r.scenario.name,gameRules:'نقش خود را برای دیگر بازیکنان فاش نکن. در روز طبق زمان گرداننده گفت‌وگو و رأی بده؛ در شب فقط در نوبت مخفی خود اقدام کن. نتیجه توانایی‌ها خصوصی است.'};
}
function hostPrivateRoles(r){if(r.hostSocketId)io.to(r.hostSocketId).emit('host:roles',r.players.map(p=>({playerId:p.id,name:p.name,seat:p.seat,role:p.role||null})));}
function clearFlowTimer(r){const timer=FLOW_TIMERS.get(r);if(timer)clearTimeout(timer);FLOW_TIMERS.delete(r);}
function setFlowPhase(r,stage,seconds){
 clearFlowTimer(r);const oldSpeakerTimer=SPEAKER_TIMERS.get(r);if(oldSpeakerTimer)clearTimeout(oldSpeakerTimer);SPEAKER_TIMERS.delete(r);r.speakerTurnDeadline=null;r.gameStage=stage;r.chatOpen=['intro','day1','discussion','vote','defense'].includes(stage);r.phase=({intro:'معارفه',day1:'روز اول',discussion:'گفت‌وگوی روز',vote:'رأی‌گیری',defense:'دفاعیه',mafiaTalk:'گفت‌وگوی مخفی مافیا',mafiaAction:'اقدام مافیا',citizenAbilities:'توانایی‌های شهروندان'})[stage]||stage;
 const duration=Math.max(5,Math.min(1800,Number(seconds??r.flowSettings?.[stage]??30)));
 r.phaseDeadline=Date.now()+duration*1000;r.speakerTurnId=null;io.to(r.code).emit('flow:phase',{stage,label:r.phase,deadline:r.phaseDeadline,seconds:duration,serverNow:Date.now()});emitRoom(r);if(['intro','day1','discussion','vote','defense'].includes(stage)){const first=[...r.players].filter(p=>p.alive).sort((a,b)=>(a.seat||999)-(b.seat||999))[0];if(first)startSpeakerTurn(r,first.id);}
 const timer=setTimeout(()=>advanceFlow(r,'timer'),duration*1000);FLOW_TIMERS.set(r,timer);timer.unref?.();announceNarrator(r,'مرحله '+r.phase+' آغاز شد. زمان این مرحله '+duration+' ثانیه است.');
}
function startSpeakerTurn(r,playerId){
 const oldSpeakerTimer=SPEAKER_TIMERS.get(r);if(oldSpeakerTimer)clearTimeout(oldSpeakerTimer);
 const p=r.players.find(x=>x.id===playerId&&x.alive);if(!p)return;
 r.speakerTurnId=p.id;r.speakerTurnDeadline=Date.now()+Number(r.flowSettings.speakerTurn||30)*1000;
 io.to(r.code).emit('flow:speaker-turn',{playerId:p.id,name:p.name,deadline:r.speakerTurnDeadline,seconds:r.flowSettings.speakerTurn||30,serverNow:Date.now()});
 for(const q of r.players)if(q.socketId)io.to(q.socketId).emit('voice:mic-permission',{allowed:q.id===r.hostPlayerId||q.id===p.id});
 const speakerTimer=setTimeout(()=>{const alive=[...r.players].filter(q=>q.alive).sort((a,b)=>(a.seat||999)-(b.seat||999));const i=alive.findIndex(q=>q.id===r.speakerTurnId);const next=alive[(i+1)%alive.length];if(next&&next.id!==r.speakerTurnId)startSpeakerTurn(r,next.id);},(r.flowSettings.speakerTurn||30)*1000);SPEAKER_TIMERS.set(r,speakerTimer);speakerTimer.unref?.();store.save(r).catch(e=>console.error('speaker turn persistence error',e.message));
}
function resolveNightAndStartDay(r){
 clearFlowTimer(r);r.nightResolved=true;const out=R.resolveNight(r.players,r.nightActions||{},r.scenario,r.round);
 // Preserve objective progress in automatic flow just as in moderator resolution.
 if(out.objectiveProgress)r.scenario.objectiveProgress=out.objectiveProgress;
 for(const id of out.deaths){const p=r.players.find(x=>x.id===id);if(p)p.alive=false;}
 for(const [id,result] of Object.entries(out.privateResults)){const p=r.players.find(x=>x.id===id);if(p?.socketId)io.to(p.socketId).emit('privateResult',result);}
 io.to(r.code).emit('nightResult',{deaths:out.deaths.map(id=>r.players.find(p=>p.id===id)?.name),blocked:out.blocked.length});
 r.nightActions={};r.dayVotes={};r.round++;r.turnPlayerId=null;const win=R.checkWin(r.players,r.scenario);if(win)return finishGame(r,win).catch(e=>console.error('CASPIAN finish failed',e));setFlowPhase(r,'discussion',r.flowSettings.discussion);
}
function nextCitizenAbility(r){
 const done=r.citizenAbilityDone||[],p=r.players.find(p=>p.alive&&p.role&&!done.includes(p.id)&&R.roleGroup(p.role,r.scenario.id)!=='mafia'&&R.roleAction(p.role,r.scenario.id));
 if(!p)return false;r.turnPlayerId=p.id;if(p.socketId)io.to(p.socketId).emit('flow:private-turn',{playerId:p.id,seconds:r.flowSettings.citizenAbilities});if(r.hostSocketId)io.to(r.hostSocketId).emit('flow:private-turn',{playerId:p.id,name:p.name,seconds:r.flowSettings.citizenAbilities});setFlowPhase(r,'citizenAbilities',r.flowSettings.citizenAbilities);return true;
}
function advanceFlow(r){
 if(!r||r.finished||!r.started)return;
 const stage=r.gameStage;
 if(stage==='intro')return setFlowPhase(r,'day1');
 if(stage==='day1'||stage==='discussion')return setFlowPhase(r,'vote');
 if(stage==='vote')return setFlowPhase(r,'defense');
 if(stage==='defense'){
  if(Object.keys(r.dayVotes||{}).length){const out=R.resolveDayVote(r.dayVotes,r.players);if(out.target){const target=r.players.find(p=>p.id===out.target);if(target){target.alive=false;io.to(r.code).emit('dayResult',{eliminated:target.name,tied:false});}}else io.to(r.code).emit('dayResult',{eliminated:null,tied:!!out.tied});}
  r.dayVotes={};const win=R.checkWin(r.players,r.scenario);if(win)return finishGame(r,win).catch(e=>console.error('CASPIAN finish failed',e));return setFlowPhase(r,'mafiaTalk');
 }
 if(stage==='mafiaTalk')return setFlowPhase(r,'mafiaAction');
 if(stage==='mafiaAction'){r.citizenAbilityDone=[];if(nextCitizenAbility(r))return;return resolveNightAndStartDay(r);}
 if(stage==='citizenAbilities'){if(r.turnPlayerId&&!r.citizenAbilityDone.includes(r.turnPlayerId))r.citizenAbilityDone.push(r.turnPlayerId);if(nextCitizenAbility(r))return;return resolveNightAndStartDay(r);}
}
function announceNarrator(r,line){if(['narrator','hybrid'].includes(r.narratorMode||'hybrid'))io.to(r.code).emit('voice:narrator-line',{text:String(line).slice(0,240)});}
function emitRoom(r){io.to(r.code).emit('room',safeRoom(r));io.to(r.code).emit('voice:policy-refresh');store.save(r).catch(e=>console.error('CASPIAN persistence error:',e.message));}
async function finishGame(r,outcome){if(r.finished||r.finishing)return;r.finishing=true;clearFlowTimer(r);const speakerTimer=SPEAKER_TIMERS.get(r);if(speakerTimer)clearTimeout(speakerTimer);SPEAKER_TIMERS.delete(r);try{const reward=await platform.settleGamePrize({roomCode:r.code,winner:outcome.winner,players:r.players,prizePoolCoins:r.prizePoolCoins??DEFAULT_GAME_PRIZE_COINS});r.finished=true;r.finishedAt=new Date().toISOString();r.winner={...outcome,reward};r.phase='پایان بازی';announceNarrator(r,'بازی به پایان رسید. نتیجه نهایی اعلام شد.');io.to(r.code).emit('gameOver',r.winner);emitRoom(r);}finally{r.finishing=false;}}
function roomFor(socket){return [...rooms.values()].find(r=>r.players.some(p=>p.id===socket.data.playerId&&p.socketId===socket.id));}
function hostRoom(socket){return [...rooms.values()].find(r=>r.hostSocketId===socket.id&&(r.hostMode==='moderator'||r.hostPlayerId===socket.data.playerId));}
function hostAuth(req,res,next){const r=rooms.get(String(req.query.room||'').toUpperCase());const supplied=Buffer.from(String(req.get('x-host-key')||''));const expected=Buffer.from(r?.hostKey||'');if(!r||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return res.status(403).json({error:'دسترسی گرداننده لازم است'});req.room=r;next();}
app.get('/health',(_q,s)=>s.status(store.isReady()?200:503).json({ok:store.isReady(),service:'CASPIAN',storage:'postgresql',rooms:rooms.size}));
app.get('/api/rooms',(q,s)=>{const limit=Math.min(50,Math.max(1,Number(q.query.limit)||30));s.set('Cache-Control','no-store');s.json({rooms:roomDirectory.listPublicRooms(rooms,{scenarioId:q.query.scenarioId,limit}),serverNow:Date.now()});});
app.get('/api/scenarios',(_q,s)=>s.json({scenarios:R.listScenarios(),exclusive:{id:R.EMPIRE_OF_SHADOWS.id,name:R.EMPIRE_OF_SHADOWS.name,players:16}}));
app.get('/api/scenario',hostAuth,(q,s)=>s.json(q.room.scenario));
app.put('/api/scenario',hostAuth,(q,s)=>{try{if(q.room.started)return s.status(409).json({error:'بازی شروع شده است'});q.room.scenario=R.validateScenario(q.body);store.save(q.room).then(()=>s.json({ok:true,scenario:q.room.scenario})).catch(e=>s.status(500).json({error:'ذخیره سناریو ناموفق بود'}));}catch(e){s.status(400).json({error:e.message});}});
io.on('connection',socket=>{
 socket.data.birthdayRoomIds=new Set();
 socket.on('birthday:join',async({roomId,authToken}={},cb)=>{
  try{
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(roomId||''))||!/^[A-Za-z0-9_-]{40,}$/.test(String(authToken||'')))return cb?.({ok:false,error:'ورود یا شناسه اتاق معتبر نیست'});
   const {rows}=await store.query("SELECT u.id,u.display_name FROM caspian_sessions a JOIN caspian_users u ON u.id=a.user_id JOIN caspian_birthday_room_participants p ON p.user_id=u.id JOIN caspian_birthday_room_sessions s ON s.id=p.birthday_room_id WHERE a.token_hash=$1 AND a.revoked_at IS NULL AND a.expires_at>NOW() AND u.is_suspended=FALSE AND s.id=$2 AND s.status IN ('open','active')",[tokenHash(authToken),roomId]);
   if(!rows[0])return cb?.({ok:false,error:'عضویت یا نشست معتبر نیست'});
   socket.data.birthdayUserId=rows[0].id;socket.data.birthdayDisplayName=rows[0].display_name;
   socket.data.birthdayRoomIds.add(roomId);const channel='birthday:'+roomId;socket.join(channel);
   const peers=await io.in(channel).fetchSockets();
   const online=[...new Map(peers.filter(x=>x.data.birthdayUserId).map(x=>[x.data.birthdayUserId,{userId:x.data.birthdayUserId,displayName:x.data.birthdayDisplayName}])).values()];
   io.to(channel).emit('birthday:presence',{online});cb?.({ok:true,roomId,online});
  }catch(e){console.error('CASPIAN birthday socket join failed:',e.message);cb?.({ok:false,error:'اتصال زنده اتاق برقرار نشد'});}
 });
 socket.on('birthday:chat:send',async({roomId,message}={},cb)=>{
  try{
   const body=String(message||'').trim();
   if(!socket.data.birthdayUserId||!socket.data.birthdayRoomIds?.has(roomId)||body.length<1||body.length>500)return cb?.({ok:false,error:'پیام خالی یا بیش از ۵۰۰ نویسه است'});
   const {rows}=await store.query("INSERT INTO caspian_birthday_room_messages(birthday_room_id,sender_user_id,body) SELECT s.id,$2,$3 FROM caspian_birthday_room_sessions s JOIN caspian_birthday_room_participants p ON p.birthday_room_id=s.id AND p.user_id=$2 WHERE s.id=$1 AND s.status IN ('open','active') RETURNING id,body,created_at",[roomId,socket.data.birthdayUserId,body]);
   if(!rows[0])return cb?.({ok:false,error:'اتاق بسته شده یا عضویت شما معتبر نیست'});
   const item={id:rows[0].id,roomId,senderUserId:socket.data.birthdayUserId,senderName:socket.data.birthdayDisplayName,body:rows[0].body,createdAt:rows[0].created_at};
   io.to('birthday:'+roomId).emit('birthday:chat:message',item);cb?.({ok:true,id:item.id});
  }catch(e){console.error('CASPIAN birthday chat failed:',e.message);cb?.({ok:false,error:'ارسال پیام ناموفق بود'});}
 });
 socket.on('birthday:leave',({roomId}={})=>{
  if(!socket.data.birthdayRoomIds?.has(roomId))return;
  socket.data.birthdayRoomIds.delete(roomId);socket.leave('birthday:'+roomId);
  io.in('birthday:'+roomId).fetchSockets().then(peers=>{
   const online=[...new Map(peers.filter(x=>x.data.birthdayUserId).map(x=>[x.data.birthdayUserId,{userId:x.data.birthdayUserId,displayName:x.data.birthdayDisplayName}])).values()];
   io.to('birthday:'+roomId).emit('birthday:presence',{online});
  }).catch(()=>{});
 });
 socket.on('create',async(data={},cb)=>{
  try{
  if(await readAppSetting('maintenance_mode',false)===true)throw Error('بازی در حال تعمیر است؛ کمی بعد دوباره تلاش کنید');
  if(data.private===true&&await readAppSetting('private_rooms_enabled',true)===false)throw Error('ساخت اتاق خصوصی موقتاً غیرفعال است');
  if(data.private!==true&&await readAppSetting('public_rooms_enabled',true)===false)throw Error('ساخت اتاق عمومی موقتاً غیرفعال است');
  const identity=await roomPlayerIdentity(data);
  let code;do{code=makeCode();}while(rooms.has(code));
  const hostKey=crypto.randomBytes(32).toString('hex');
  const hostMode=data.hostMode==='moderator'?'moderator':'player';const playerId=newPlayerId(),playerToken=newPlayerToken();
  const r={code,hostKey,visibility:data.private===true?'private':'public',hostMode,hostSocketId:socket.id,hostPlayerId:hostMode==='moderator'?null:playerId,phase:'لابی',started:false,finished:false,round:0,narratorMode:['narrator','host','hybrid'].includes(data.narratorMode)?data.narratorMode:'hybrid',flowSettings:{...DEFAULT_FLOW_SETTINGS},gameStage:'lobby',phaseDeadline:null,roleCards:null,turnPlayerId:null,roomOpen:true,chatOpen:true,scenario:structuredClone(data.scenarioId==='empire-of-shadows'?R.EMPIRE_OF_SHADOWS:(R.SCENARIO_LIBRARY[data.scenarioId]||R.ADDITIONAL_SCENARIO_LIBRARY[data.scenarioId]||R.DEFAULT_SCENARIO)),prizePoolCoins:Number(await readAppSetting('default_game_prize_coins',DEFAULT_GAME_PRIZE_COINS)),players:hostMode==='moderator'?[]:[{id:playerId,socketId:socket.id,tokenHash:tokenHash(playerToken),name:cleanName(data.name||'گرداننده'),...identity,alive:true,role:null,seat:1}],nightActions:{},dayVotes:{},nightResolved:false};
  socket.data.playerId=hostMode==='moderator'?'__host__':playerId;socket.data.isHost=true;
  rooms.set(code,r);socket.join(code);cb?.({ok:true,code,hostKey,playerId:hostMode==='moderator'?null:playerId,playerToken:hostMode==='moderator'?null:playerToken,isHost:true,hostMode});emitRoom(r);
  }catch(e){console.error('CASPIAN room creation failed:',e.message);cb?.({ok:false,error:'ساخت اتاق ممکن نشد؛ دوباره تلاش کنید'});}
 });
 socket.on('authenticateHost',({code,hostKey}={},cb)=>{
  const r=rooms.get(String(code||'').toUpperCase());
  const supplied=Buffer.from(String(hostKey||''));const expected=r?Buffer.from(r.hostKey):Buffer.alloc(0);if(!r||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected)){socket.data.hostAuthFailures=(socket.data.hostAuthFailures||0)+1;cb?.({ok:false,error:'کلید گرداننده نامعتبر است'});if(socket.data.hostAuthFailures>=5)socket.disconnect(true);return;}socket.data.hostAuthFailures=0;
  if(r.hostMode==='moderator'){r.hostSocketId=socket.id;socket.data.playerId='__host__';socket.data.isHost=true;socket.join(r.code);cb?.({ok:true,playerId:null,isHost:true,hostMode:'moderator'});if(r.roleCards)io.to(socket.id).emit('host:role-deck',r.roleCards.map((c,i)=>({card:i+1,role:c.role})));hostPrivateRoles(r);emitRoom(r);return;}
   const old=r.players.find(p=>p.id===r.hostPlayerId);if(!old)return cb?.({ok:false,error:'شناسه گرداننده پیدا نشد'});
  if(old.socketId&&old.socketId!==socket.id)io.to(old.socketId).emit('sessionReplaced');
  old.socketId=socket.id;r.hostSocketId=socket.id;socket.data.playerId=old.id;socket.data.isHost=true;socket.join(r.code);cb?.({ok:true,playerId:old.id});emitRoom(r);
 });
 socket.on('resumePlayer',async({code,playerId,playerToken,authToken='',guestToken=''}={},cb)=>{
  const r=rooms.get(String(code||'').toUpperCase());
  const p=r?.players.find(x=>x.id===playerId);
  if(!r||!p||!tokenMatches(p,playerToken)){socket.data.resumeFailures=(socket.data.resumeFailures||0)+1;cb?.({ok:false,error:'شناسه یا توکن بازگشت معتبر نیست'});if(socket.data.resumeFailures>=5)socket.disconnect(true);return;}
  if(r.finished){cb?.({ok:false,finished:true,canStartNewGame:true,error:'این بازی به پایان رسیده است؛ برای دریافت نقش جدید وارد اتاق تازه شوید.'});return;}
  if(authToken||guestToken){try{const identity=await roomPlayerIdentity({authToken,guestToken});if(p.userId&&identity.userId===p.userId){Object.assign(p,{avatarId:identity.avatarId,frameId:identity.frameId});}}catch(e){console.error('CASPIAN profile refresh on resume failed:',e.message);}}
  if(p.socketId&&p.socketId!==socket.id)io.to(p.socketId).emit('sessionReplaced');
  p.socketId=socket.id;socket.data.playerId=p.id;socket.data.isHost=p.id===r.hostPlayerId;
  if(socket.data.isHost)r.hostSocketId=socket.id;
  socket.join(r.code);socket.data.resumeFailures=0;
  cb?.({ok:true,code:r.code,playerId:p.id,isHost:socket.data.isHost,role:p.role,room:safeRoom(r)});
  if(p.role)socket.emit('myRole',p.role);
  emitRoom(r);
 });
 socket.on('refreshProfile',async(data={},cb)=>{
  const r=roomFor(socket),p=r?.players.find(x=>x.id===socket.data.playerId);
  if(!r||!p)return cb?.({ok:false,error:'بازیکن در اتاق فعال نیست'});
  if(!data.authToken||!p.userId)return cb?.({ok:false,error:'به‌روزرسانی زنده فقط برای حساب متصل و احرازشده فعال است'});
  try{
   const identity=await roomPlayerIdentity(data);
   if(!identity.userId||identity.userId!==p.userId){
    return cb?.({ok:false,error:'نشست ارائه‌شده متعلق به هویت متصل به این صندلی نیست'});
   }
   p.avatarId=identity.avatarId;p.frameId=identity.frameId;p.socialItems=identity.socialItems;
   emitRoom(r);cb?.({ok:true});
  }catch(e){console.error('CASPIAN live profile refresh failed:',e.message);cb?.({ok:false,error:'به‌روزرسانی ظاهر پروفایل ناموفق بود'});}
 });
 socket.on('join',async(data={},cb)=>{
  const r=rooms.get(String(data.code||'').toUpperCase());
  if(!r)return cb?.({ok:false,error:'اتاق پیدا نشد'});
  if(r.started||r.finished||r.roomOpen===false||r.players.length>=(r.scenario.maxPlayers||16))return cb?.({ok:false,error:r.roomOpen===false?'ورود به این اتاق توسط گرداننده بسته شده است':'اتاق بسته است یا ظرفیت تکمیل شده'});
  const name=cleanName(data.name);if(r.players.some(p=>p.name===name))return cb?.({ok:false,error:'این نام قبلاً انتخاب شده'});
  let identity;try{identity=await roomPlayerIdentity(data);}catch(e){console.error('CASPIAN player cosmetics lookup failed:',e.message);return cb?.({ok:false,error:'بارگذاری پروفایل بازیکن ممکن نشد'});}
  const playerId=newPlayerId(),playerToken=newPlayerToken();
  const occupiedSeats=new Set(r.players.map(p=>p.seat).filter(Number.isInteger));let nextSeat=1;while(occupiedSeats.has(nextSeat))nextSeat++;r.players.push({id:playerId,socketId:socket.id,tokenHash:tokenHash(playerToken),name,...identity,alive:true,role:null,seat:nextSeat});socket.data.playerId=playerId;socket.data.isHost=false;socket.join(r.code);cb?.({ok:true,code:r.code,playerId,playerToken});emitRoom(r);
 });
 socket.on('assignRoles',(_d={},cb)=>{
  const r=hostRoom(socket);if(!r)return cb?.({ok:false,error:'احراز هویت گرداننده لازم است'});
  try{
   if(r.finished||r.started)throw Error('این بازی قبلاً شروع شده است');
   const min=r.scenario.players?.min||r.scenario.minPlayers||16,max=r.scenario.players?.max||r.scenario.maxPlayers||16;
   if(r.players.length<min||r.players.length>max)throw Error('تعداد بازیکنان این سناریو باید بین '+min+' و '+max+' نفر باشد');
   const roles=R.assignRoles(r.players,r.scenario).map(p=>p.role);
   r.players.forEach((p,i)=>{p.role=null;p.alive=true;p.seat=p.seat||i+1;});
   r.roleCards=roles.map(role=>({id:crypto.randomBytes(12).toString('hex'),role,claimed:false}));if(r.hostMode==='moderator'&&r.hostSocketId)io.to(r.hostSocketId).emit('host:role-deck',r.roleCards.map((c,i)=>({card:i+1,role:c.role})));
   r.players.forEach(p=>{if(p.socketId)io.to(p.socketId).emit('role-cards:available',r.roleCards.map(c=>({id:c.id,claimed:false})));});
   r.started=true;r.roomOpen=false;r.chatOpen=false;r.gameStage='cardSelection';r.phase='انتخاب کارت شخصیت';r.round=0;hostPrivateRoles(r);emitRoom(r);cb?.({ok:true,selecting:true});
  }catch(e){cb?.({ok:false,error:e.message});}
 });
 socket.on('role-cards:pick',({cardId}={},cb)=>{
  const r=roomFor(socket),p=r?.players.find(x=>x.id===socket.data.playerId);
  if(!r||r.gameStage!=='cardSelection'||!p||p.role)return cb?.({ok:false,error:'انتخاب کارت در این مرحله ممکن نیست'});
  const card=r.roleCards?.find(c=>c.id===cardId&&!c.claimed);if(!card)return cb?.({ok:false,error:'این کارت قبلاً انتخاب شده؛ کارت دیگری بردارید'});
  card.claimed=true;p.role=card.role;p.alive=true;if(p.socketId){io.to(p.socketId).emit('myRole',card.role);io.to(p.socketId).emit('role:description',roleGuide(r,card.role));}
  r.players.forEach(q=>{if(q.socketId)io.to(q.socketId).emit('role-cards:updated',r.roleCards.map(c=>({id:c.id,claimed:c.claimed})));});hostPrivateRoles(r);
  if(r.players.every(q=>q.role)){r.roleCards=null;r.round=1;r.nightActions={};r.dayVotes={};setFlowPhase(r,'intro',r.flowSettings.intro);}else emitRoom(r);
  cb?.({ok:true,role:card.role,waiting:!r.players.every(q=>q.role)});
 });
 socket.on('host:configure-flow',({settings}={},cb)=>{
  const r=hostRoom(socket);if(!r||r.finished)return cb?.({ok:false,error:'تنظیم زمان‌ها در این اتاق در دسترس نیست'});
  const next={...r.flowSettings};for(const [k,v] of Object.entries(settings||{})){if(!(k in DEFAULT_FLOW_SETTINGS))continue;const n=Number(v);if(Number.isFinite(n))next[k]=Math.max(5,Math.min(1800,Math.round(n)));}r.flowSettings=next;const stageKey=r.gameStage,changed=new Set(Object.keys(settings||{}));if(r.started&&changed.has(stageKey)&&next[stageKey])setFlowPhase(r,stageKey,next[stageKey]);else if(changed.has('speakerTurn')&&r.speakerTurnId)startSpeakerTurn(r,r.speakerTurnId);else emitRoom(r);cb?.({ok:true,settings:next});
 });
 socket.on('host:seat',({playerId,seat}={},cb)=>{
  const r=hostRoom(socket);if(!r||r.started)return cb?.({ok:false,error:'تغییر صندلی فقط پیش از شروع ممکن است'});
  const p=r.players.find(x=>x.id===playerId),n=Number(seat);if(!p||!Number.isInteger(n)||n<1||n>(r.scenario.maxPlayers||r.scenario.players?.max||16))return cb?.({ok:false,error:'شماره صندلی نامعتبر است'});
  const other=r.players.find(x=>x.seat===n);if(other&&other!==p)other.seat=p.seat;p.seat=n;emitRoom(r);cb?.({ok:true});
 });
 socket.on('host:random-seats',(_d={},cb)=>{
  const r=hostRoom(socket);if(!r||r.started)return cb?.({ok:false,error:'چیدمان تصادفی فقط پیش از شروع ممکن است'});
  const shuffled=[...r.players];for(let i=shuffled.length-1;i>0;i--){const j=crypto.randomInt(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}shuffled.forEach((p,i)=>p.seat=i+1);emitRoom(r);cb?.({ok:true});
 });
 socket.on('host:speaker-turn',({playerId}={},cb)=>{const r=hostRoom(socket);if(!r||!['intro','day1','discussion','vote','defense'].includes(r.gameStage))return cb?.({ok:false,error:'نوبت صحبت فقط در مراحل روز فعال است'});startSpeakerTurn(r,playerId);cb?.({ok:true});});
 socket.on('host:advance-flow',(_d={},cb)=>{const r=hostRoom(socket);if(!r||!r.started)return cb?.({ok:false,error:'فقط گرداننده بازی می‌تواند مرحله را جلو ببرد'});advanceFlow(r);cb?.({ok:true});});
 socket.on('host:private-turn',({playerId}={},cb)=>{const r=hostRoom(socket),p=r?.players.find(x=>x.id===playerId);if(!r||!p?.alive||r.gameStage!=='citizenAbilities'||R.roleGroup(p.role,r.scenario.id)==='mafia'||!R.roleAction(p.role,r.scenario.id))return cb?.({ok:false,error:'نوبت خصوصی شهروند در دسترس نیست'});r.turnPlayerId=p.id;if(p.socketId)io.to(p.socketId).emit('flow:private-turn',{playerId:p.id,seconds:r.flowSettings.citizenAbilities});if(r.hostSocketId)io.to(r.hostSocketId).emit('flow:private-turn',{playerId:p.id,name:p.name,seconds:r.flowSettings.citizenAbilities});io.to(r.code).emit('voice:policy-refresh');store.save(r).catch(e=>console.error('private turn persistence error',e.message));cb?.({ok:true});});

 socket.on('nightAction',({targetId}={},cb)=>{
  const r=roomFor(socket),actor=r?.players.find(p=>p.id===socket.data.playerId),target=r?.players.find(p=>p.id===targetId);
  if(!r||!['mafiaAction','citizenAbilities'].includes(r.gameStage)||r.nightResolved||!actor?.alive||!actor.role||!target?.alive||actor.id===target.id)return cb?.({ok:false,error:'اقدام شب نامعتبر است'});
  const actionType=R.roleAction(actor.role,r.scenario.id);
  if(!actionType)return cb?.({ok:false,error:'این نقش اقدام شب ندارد'});if(r.gameStage==='mafiaAction'&&R.roleGroup(actor.role,r.scenario.id)!=='mafia')return cb?.({ok:false,error:'فقط مافیا در زمان اقدام مافیا مجاز است'});if(r.gameStage==='citizenAbilities'&&actor.id!==r.turnPlayerId)return cb?.({ok:false,error:'نوبت توانایی مخفی این بازیکن نیست'});
  if(actionType==='serial-kill'&&r.round%2!==0)return cb?.({ok:false,error:'قاتل زنجیره‌ای فقط در شب‌های زوج اجازه شلیک دارد'});
  if((actionType==='mafia-vote'||actionType==='faction-vote')&&R.roleGroup(actor.role,r.scenario.id)===R.roleGroup(target.role,r.scenario.id))return cb?.({ok:false,error:'بازیکن نمی‌تواند هم‌جناحی خود را هدف قرار دهد'});
  if(r.nightActions[actor.id])return cb?.({ok:false,error:'اقدام شما قبلاً ثبت شده است'});
  r.nightActions[actor.id]=target.id;store.save(r).then(()=>cb?.({ok:true})).catch(()=>cb?.({ok:false,error:'ذخیره اقدام ناموفق بود'}));
 });
 socket.on('resolveNight',(_d={},cb)=>{
  const r=hostRoom(socket);if(!r||!['mafiaAction','citizenAbilities'].includes(r.gameStage)||r.nightResolved)return cb?.({ok:false,error:'مرحله شب قبلاً حل شده یا در دسترس نیست'});
  resolveNightAndStartDay(r);
  cb?.({ok:true});
 });
 socket.on('dayVote',({targetId,voteEffect='classic'}={},cb)=>{
  const r=roomFor(socket),voter=r?.players.find(p=>p.id===socket.data.playerId),target=r?.players.find(p=>p.id===targetId);
  if(!r||r.gameStage!=='vote'||!voter?.alive||!target?.alive||voter.id===target.id)return cb?.({ok:false,error:'رأی نامعتبر است'});
  if(r.dayVotes[voter.id])return cb?.({ok:false,error:'رأی شما قبلاً ثبت شده است'});
  const effects=new Set(['classic','crown','lightning','rose','shadow','meteor']),selectedEffect=effects.has(voteEffect)?voteEffect:'classic';
  if(selectedEffect!=='classic'&&!voter.socialItems?.includes('social-vote-effects'))return cb?.({ok:false,error:'برای جلوه‌های ویژه رأی، بسته جلوه‌های رأی را از فروشگاه بخرید'});
  r.dayVotes[voter.id]=target.id;store.save(r).catch(e=>console.error('vote persistence error:',e.message));const count=Object.keys(r.dayVotes).length;
  io.to(r.code).emit('voteCast',{voterName:voter.name,targetId:target.id,targetName:target.name,effect:selectedEffect});io.to(r.code).emit('voteProgress',{count,total:r.players.filter(p=>p.alive).length});cb?.({ok:true});
 });
 socket.on('resolveDayVote',(_d={},cb)=>{
  const r=hostRoom(socket);if(!r||!['vote','defense'].includes(r.gameStage))return cb?.({ok:false,error:'فقط گرداننده در مرحله رأی‌گیری یا دفاعیه'});
  if(Object.keys(r.dayVotes).length<r.players.filter(p=>p.alive).length)return cb?.({ok:false,error:'هنوز همه بازیکنان زنده رأی نداده‌اند'});
  const out=R.resolveDayVote(r.dayVotes,r.players);
  if(out.target){const p=r.players.find(x=>x.id===out.target);p.alive=false;io.to(r.code).emit('dayResult',{eliminated:p.name,tied:false});}
  else io.to(r.code).emit('dayResult',{eliminated:null,tied:out.tied});
  r.dayVotes={};store.save(r).catch(e=>console.error('day result persistence error:',e.message));const win=R.checkWin(r.players,r.scenario);if(win)finishGame(r,win).catch(e=>{console.error('CASPIAN prize settlement failed:',e.message);io.to(r.code).emit('notice','تسویه جایزه با خطا روبه‌رو شد؛ نتیجه بازی ذخیره و پس از رفع خطا قابل پیگیری است.');});
  cb?.({ok:true,outcome:win,result:out});
 });
 socket.on('startNight',(_d={},cb)=>{const r=hostRoom(socket);if(!r||!r.started)return cb?.({ok:false});r.nightResolved=false;r.mafiaActions={};r.nightActions={};setFlowPhase(r,'mafiaTalk',r.flowSettings.mafiaTalk);cb?.({ok:true});});
 socket.on('eliminate',({playerId}={},cb)=>{const r=hostRoom(socket);if(!r)return cb?.({ok:false});const p=r.players.find(x=>x.id===playerId);if(!p)return cb?.({ok:false});p.alive=false;emitRoom(r);const outcome=R.checkWin(r.players,r.scenario);if(outcome)finishGame(r,outcome).catch(e=>{console.error('CASPIAN prize settlement failed:',e.message);io.to(r.code).emit('notice','تسویه جایزه با خطا روبه‌رو شد؛ نتیجه بازی ذخیره و پس از رفع خطا قابل پیگیری است.');});cb?.({ok:true,outcome});});
 socket.on('setRoomOpen',({open}={},cb)=>{const r=hostRoom(socket);if(!r)return cb?.({ok:false,error:'فقط گرداننده اجازه تغییر وضعیت اتاق را دارد'});if(r.started||r.finished)return cb?.({ok:false,error:'پس از شروع بازی امکان تغییر وضعیت ورود وجود ندارد'});r.roomOpen=!!open;emitRoom(r);io.to(r.code).emit('notice',r.roomOpen?'🔓 گرداننده ورود به اتاق را باز کرد.':'🔒 گرداننده ورود به اتاق را بست.');cb?.({ok:true,roomOpen:r.roomOpen});});
 socket.on('setChatOpen',({open}={},cb)=>{const r=hostRoom(socket);if(!r)return cb?.({ok:false,error:'فقط گرداننده اجازه تغییر وضعیت گفت‌وگو را دارد'});if(r.finished)return cb?.({ok:false,error:'بازی به پایان رسیده است'});if(open&&['mafiaTalk','mafiaAction','citizenAbilities'].includes(r.gameStage))return cb?.({ok:false,error:'گفت‌وگوی عمومی در مرحله مخفی شب قابل بازکردن نیست'});r.chatOpen=!!open;emitRoom(r);io.to(r.code).emit('notice',r.chatOpen?'💬 گفت‌وگوی اتاق توسط گرداننده فعال شد.':'🔇 گفت‌وگوی اتاق توسط گرداننده بسته شد.');cb?.({ok:true,chatOpen:r.chatOpen});});
 socket.on('hostMessage',({message}={},cb)=>{const r=hostRoom(socket);if(!r)return cb?.({ok:false,error:'فقط گرداننده اجازه ارسال پیام همگانی دارد'});const body=String(message||'').trim().slice(0,300);if(!body)return cb?.({ok:false,error:'متن پیام خالی است'});const host=r.players.find(p=>p.id===r.hostPlayerId);io.to(r.code).emit('notice','📣 پیام گرداننده '+(host?.name||'')+': '+body);cb?.({ok:true});});
 socket.on('notice',({message}={},cb)=>{const r=hostRoom(socket);if(!r)return cb?.({ok:false});io.to(r.code).emit('notice',String(message||'').slice(0,300));cb?.({ok:true});});
 socket.on('chat',({message}={},cb)=>{const r=roomFor(socket);if(['mafiaTalk','mafiaAction','citizenAbilities'].includes(r?.gameStage)||!roomPolicy.canUseChat(r))return cb?.({ok:false,error:'گفت‌وگو در این مرحله بسته است'});const p=r.players.find(x=>x.id===socket.data.playerId);const body=String(message||'').trim().slice(0,300);if(!body)return cb?.({ok:false,error:'پیام خالی است'});io.to(r.code).emit('chat',{playerId:p.id,name:p.name,message:body});cb?.({ok:true});});
 socket.on('socialReaction',({targetId,type}={},cb)=>{const r=roomFor(socket),actor=r?.players.find(p=>p.id===socket.data.playerId),target=r?.players.find(p=>p.id===targetId);const allowed=new Set(['like','dislike']);const required='sticker-'+type;if(!r||!actor||!target||!allowed.has(type)||actor.id===target.id||r.finished)return cb?.({ok:false,error:'واکنش نامعتبر است'});if(process.env.CASPIAN_TEST_MEMORY!=='1'&&!actor.socialItems?.includes(required))return cb?.({ok:false,error:'برای این واکنش، ابتدا استیکر مربوط را از فروشگاه بخرید'});const now=Date.now();if(now-(socket.data.lastSocialAction||0)<350)return cb?.({ok:false,error:'کمی صبر کن و دوباره بزن'});socket.data.lastSocialAction=now;const key=actor.id+':'+target.id;if(!r.socialReactions)r.socialReactions={};if(!r.socialReactions[key])r.socialReactions[key]={like:0,dislike:0};const previous=r.socialReactions[key].byActor?.[actor.id];if(!r.socialReactions[key].byActor)r.socialReactions[key].byActor={};if(previous===type){r.socialReactions[key][type]=Math.max(0,r.socialReactions[key][type]-1);delete r.socialReactions[key].byActor[actor.id];}else{if(previous)r.socialReactions[key][previous]=Math.max(0,r.socialReactions[key][previous]-1);r.socialReactions[key][type]++;r.socialReactions[key].byActor[actor.id]=type;}io.to(r.code).emit('socialReaction',{targetId,targetName:target.name,type,totals:{like:r.socialReactions[key].like,dislike:r.socialReactions[key].dislike}});cb?.({ok:true,totals:{like:r.socialReactions[key].like,dislike:r.socialReactions[key].dislike}});});
 const CASPIAN_STICKERS=new Set(['suspect','watching','ignore','defend','mafia-alert','clap','crown','laugh','fire']);
 socket.on('playerSticker',({targetId,stickerId}={},cb)=>{const r=roomFor(socket),actor=r?.players.find(p=>p.id===socket.data.playerId),target=r?.players.find(p=>p.id===targetId);const requiredSticker=({clap:'sticker-trust',crown:'sticker-crown',laugh:'sticker-laugh',fire:'sticker-angry','mafia-alert':'sticker-suspicious',suspect:'sticker-suspicious',like:'sticker-like',dislike:'sticker-dislike',heart:'sticker-heart',attention:'sticker-attention',accuse:'sticker-accuse',defend:'sticker-defend',sad:'sticker-sad'})[stickerId];if(!r||!actor||!target||actor.id===target.id||!CASPIAN_STICKERS.has(stickerId)||!roomPolicy.canUseChat(r))return cb?.({ok:false,error:'استیکر نامعتبر است یا گفت‌وگو بسته است'});if(!requiredSticker||(!(process.env.CASPIAN_TEST_MEMORY==='1'&&stickerId==='suspect')&&!actor.socialItems?.includes(requiredSticker)))return cb?.({ok:false,error:'برای استفاده از این استیکر، بسته آن را از فروشگاه بخرید'});const now=Date.now();if(now-(socket.data.lastSocialAction||0)<350)return cb?.({ok:false,error:'کمی صبر کن و دوباره بزن'});socket.data.lastSocialAction=now;io.to(r.code).emit('playerSticker',{from:actor.name,targetId,targetName:target.name,stickerId});cb?.({ok:true});});
 const CASPIAN_SPEAKERS={suspect:'من بهت مشکوکم! 🕵️',watching:'حواسم بهت هست 👀',ignore:'فعلاً توجهی بهت ندارم 🌙',neck:'دارم گردنت می‌گیرم! ⚖️',mafia:'تو قطعاً مافیایی! 🚨',trust:'بهت اعتماد دارم 💜',defend:'من ازت دفاع می‌کنم 🛡️'};
 const REQUIRED_SPEAKER_ITEM={neck:'social-speaker-mafia',mafia:'social-speaker-mafia',defend:'social-speaker-royal',suspect:'social-speaker-mafia'};
 socket.on('speaker',({targetId,speakerId}={},cb)=>{const r=roomFor(socket),actor=r?.players.find(p=>p.id===socket.data.playerId),target=r?.players.find(p=>p.id===targetId),phrase=CASPIAN_SPEAKERS[speakerId];if(!r||!actor||!target||actor.id===target.id||!phrase||!roomPolicy.canUseChat(r))return cb?.({ok:false,error:'اسپیکر در این مرحله در دسترس نیست'});if(REQUIRED_SPEAKER_ITEM[speakerId]&&!actor.socialItems?.includes(REQUIRED_SPEAKER_ITEM[speakerId]))return cb?.({ok:false,error:'برای استفاده از این اسپیکر، بسته مربوط را از فروشگاه بخرید'});const now=Date.now();if(now-(socket.data.lastSocialAction||0)<500)return cb?.({ok:false,error:'کمی صبر کن و دوباره بزن'});socket.data.lastSocialAction=now;io.to(r.code).emit('speaker',{from:actor.name,targetId,targetName:target.name,speakerId,text:phrase});cb?.({ok:true});});
 socket.on('disconnect',()=>{for(const roomId of socket.data.birthdayRoomIds||[]){io.in('birthday:'+roomId).fetchSockets().then(peers=>{const online=[...new Map(peers.filter(x=>x.data.birthdayUserId).map(x=>[x.data.birthdayUserId,{userId:x.data.birthdayUserId,displayName:x.data.birthdayDisplayName}])).values()];io.to('birthday:'+roomId).emit('birthday:presence',{online});}).catch(()=>{});}const playerId=socket.data.playerId;if(!playerId)return;for(const [code,r] of rooms){if(r.hostMode==='moderator'&&r.hostSocketId===socket.id){r.hostSocketId=null;io.to(code).emit('notice','اتصال گرداننده قطع شد؛ بازگشت با کلید گرداننده امکان‌پذیر است.');emitRoom(r);break;}const p=r.players.find(x=>x.id===playerId);if(!p||p.socketId!==socket.id)continue;p.socketId=null;if(r.hostPlayerId===playerId){r.hostSocketId=null;io.to(code).emit('notice','اتصال گرداننده قطع شد؛ بازگشت با توکن امکان‌پذیر است.');}emitRoom(r);break;}});
});

registerVoice(io,app,rooms,roomFor,hostRoom,R);

function adminAuth(req,res,next){
 const expected=String(process.env.CASPIAN_ADMIN_KEY||''),supplied=String(req.get('x-admin-key')||'');
 if(expected.length<32)return res.status(503).json({error:'کلید مدیر اصلی روی سرور تنظیم نشده است؛ CASPIAN_ADMIN_KEY باید حداقل ۳۲ نویسه باشد'});
 const a=Buffer.from(expected),b=Buffer.from(supplied);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(403).json({error:'کلید مدیریت نامعتبر است'});
 next();
}
async function adminAudit(action,targetType,targetId,details={}){await store.query('INSERT INTO caspian_admin_audit(action,target_type,target_id,details) VALUES($1,$2,$3,$4::jsonb)',[action,targetType,String(targetId||''),JSON.stringify(details)]);}
app.get('/admin-api/overview',adminAuth,async(_req,res)=>{
 try{const {rows}=await store.query(`SELECT
 (SELECT COUNT(*)::int FROM caspian_users) users,
 (SELECT COUNT(*)::int FROM caspian_users WHERE is_suspended) suspended_users,
 (SELECT COUNT(*)::int FROM caspian_sessions WHERE revoked_at IS NULL AND expires_at>NOW()) sessions,
 (SELECT COUNT(*)::int FROM caspian_rooms) saved_rooms,
 (SELECT COUNT(*)::int FROM caspian_game_payouts) payouts,
 (SELECT COALESCE(SUM(distributed_coins),0)::text FROM caspian_game_payouts) rewarded_coins,
 (SELECT COUNT(*)::int FROM caspian_cosmetics WHERE active=TRUE) active_items,
 (SELECT COUNT(*)::int FROM caspian_coin_orders WHERE status='pending') pending_orders,
 (SELECT COALESCE(SUM(balance),0)::text FROM caspian_wallets) wallet_coins`);
 res.json({ok:true,storage:store.isReady()?'postgresql':'offline',liveRooms:rooms.size,...rows[0]});}
 catch(e){res.status(503).json({error:'آمار پایگاه داده در دسترس نیست',detail:e.message});}
});
app.get('/admin-api/rooms',adminAuth,(_req,res)=>res.json({rooms:[...rooms.values()].map(r=>({code:r.code,scenarioId:r.scenario.id,scenarioName:r.scenario.name,phase:r.phase,started:r.started,finished:!!r.finished,roomOpen:r.roomOpen!==false,chatOpen:r.chatOpen!==false,round:r.round,players:r.players.map(p=>({id:p.id,name:p.name,alive:p.alive,role:p.role,host:p.id===r.hostPlayerId,connected:!!p.socketId}))}))}));
app.post('/admin-api/rooms/:code/action',adminAuth,async(req,res)=>{
 const r=rooms.get(String(req.params.code||'').toUpperCase());if(!r)return res.status(404).json({error:'اتاق پیدا نشد'});
 const {action,message,playerId}=req.body||{};
 if(action==='open'||action==='close'){if(r.started||r.finished)return res.status(409).json({error:'ورود پس از شروع یا پایان بازی قابل تغییر نیست'});r.roomOpen=action==='open';}
 else if(action==='chat-open'||action==='chat-close'){if(r.finished)return res.status(409).json({error:'بازی تمام شده است'});r.chatOpen=action==='chat-open';}
 else if(action==='announce'){const body=String(message||'').trim().slice(0,300);if(!body)return res.status(400).json({error:'متن پیام خالی است'});io.to(r.code).emit('notice','📣 پیام مدیریت CASPIAN: '+body);}
 else if(action==='remove-player'){const p=r.players.find(x=>x.id===playerId);if(!p)return res.status(404).json({error:'بازیکن پیدا نشد'});if(p.id===r.hostPlayerId)return res.status(409).json({error:'حذف گرداننده از این بخش مجاز نیست'});if(p.socketId){io.to(p.socketId).emit('notice','اتصال شما توسط مدیریت قطع شد');io.sockets.sockets.get(p.socketId)?.disconnect(true);}r.players=r.players.filter(x=>x.id!==playerId);}
 else return res.status(400).json({error:'عملیات ناشناخته است'});
 await store.save(r);await adminAudit('room_'+action,'room',r.code,{playerId:playerId||null});emitRoom(r);res.json({ok:true,room:{code:r.code,roomOpen:r.roomOpen,chatOpen:r.chatOpen,players:r.players.length}});
});
app.get('/admin-api/accounts',adminAuth,async(req,res)=>{
 try{const term=String(req.query.search||'').trim().slice(0,60);const {rows}=await store.query(`SELECT u.id,u.username,u.display_name,u.phone_e164,u.created_at,u.is_suspended,COALESCE(w.balance,'0') balance FROM caspian_users u LEFT JOIN caspian_wallets w ON w.user_id=u.id WHERE ($1='' OR u.username ILIKE '%'||$1||'%' OR u.display_name ILIKE '%'||$1||'%' OR u.phone_e164 ILIKE '%'||$1||'%' OR u.id::text ILIKE '%'||$1||'%') ORDER BY u.created_at DESC LIMIT 100`,[term]);res.json({accounts:rows});}
 catch(e){res.status(503).json({error:'فهرست حساب‌ها در دسترس نیست',detail:e.message});}
});
app.patch('/admin-api/accounts/:id',adminAuth,async(req,res)=>{
 const id=String(req.params.id||''),{suspended,displayName}=req.body||{};
 if(typeof suspended!=='boolean'&&displayName===undefined)return res.status(400).json({error:'تغییری ارسال نشده است'});
 try{const result=await store.withTransaction(async client=>{
  const user=(await client.query('SELECT id FROM caspian_users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!user)return null;
  if(typeof suspended==='boolean'){await client.query('UPDATE caspian_users SET is_suspended=$1,updated_at=NOW() WHERE id=$2',[suspended,id]);if(suspended)await client.query('UPDATE caspian_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL',[id]);}
  if(displayName!==undefined){const n=String(displayName).trim();if(!n||n.length>32)throw Error('نام نمایشی باید ۱ تا ۳۲ نویسه باشد');await client.query('UPDATE caspian_users SET display_name=$1,updated_at=NOW() WHERE id=$2',[n,id]);}
  return (await client.query('SELECT id,username,display_name,is_suspended FROM caspian_users WHERE id=$1',[id])).rows[0];
 });if(!result)return res.status(404).json({error:'حساب پیدا نشد'});
 await adminAudit('account_update','account',id,{suspended,displayName:displayName===undefined?undefined:String(displayName).slice(0,32)});res.json({ok:true,account:result});
 }catch(e){res.status(400).json({error:e.message});}
});
app.post('/admin-api/accounts/:id/wallet',adminAuth,async(req,res)=>{
 const id=String(req.params.id||''),delta=String(req.body?.delta||''),reason=String(req.body?.reason||'').trim().slice(0,200);
 if(!/^-?\d{1,15}$/.test(delta)||BigInt(delta)===0n||!reason)return res.status(400).json({error:'مبلغ صحیح و دلیل ثبت عملیات الزامی است'});
 try{const result=await store.withTransaction(async client=>{
  const user=(await client.query('SELECT id FROM caspian_users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!user)return null;
  const wallet=(await client.query('SELECT balance FROM caspian_wallets WHERE user_id=$1 FOR UPDATE',[id])).rows[0];if(!wallet)throw Error('کیف پول پیدا نشد');
  const next=BigInt(wallet.balance)+BigInt(delta);if(next<0n)throw Error('موجودی کیف پول نمی‌تواند منفی شود');
  await client.query('UPDATE caspian_wallets SET balance=$1,updated_at=NOW() WHERE user_id=$2',[next.toString(),id]);
  await client.query(`INSERT INTO caspian_wallet_ledger(user_id,amount,balance_after,entry_type,reference_type,reference_id,idempotency_key,metadata)
   VALUES($1,$2,$3,'admin_adjustment','admin',$4,$5,$6::jsonb)`,[id,delta,next.toString(),id,'admin:'+crypto.randomUUID(),JSON.stringify({reason})]);
  return {balance:next.toString()};
 });if(!result)return res.status(404).json({error:'حساب پیدا نشد'});
 await adminAudit('wallet_adjustment','account',id,{delta,reason});res.json({ok:true,...result});
 }catch(e){res.status(400).json({error:e.message});}
});
app.get('/admin-api/accounts/:id/ledger',adminAuth,async(req,res)=>{try{const {rows}=await store.query('SELECT amount,balance_after,entry_type,reference_type,reference_id,metadata,created_at FROM caspian_wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.params.id]);res.json({ledger:rows});}catch(e){res.status(503).json({error:'دفتر کیف پول در دسترس نیست'});}});
app.get('/admin-api/catalog',adminAuth,async(_req,res)=>{try{const {rows}=await store.query('SELECT id,name,description,category,price_coins,active,rarity,asset_url FROM caspian_cosmetics ORDER BY category,name');res.json({items:rows});}catch(e){res.status(503).json({error:'فروشگاه در دسترس نیست',detail:e.message});}});
const ADMIN_COIN_PACKAGES=[100,500,2000,3000,5000,10000,15000,20000,30000,40000,50000].map(coins=>({id:'coins-'+coins,coins}));
app.get('/admin-api/coin-packages',adminAuth,async(_req,res)=>{try{const {rows}=await store.query("SELECT setting_value FROM caspian_app_settings WHERE setting_key='coin_packages'");const saved=rows[0]?.setting_value||[];const values=Array.isArray(saved)?saved:JSON.parse(saved);const map=new Map(values.map(x=>[x.id,x.amountRial]));res.json({packages:ADMIN_COIN_PACKAGES.map(p=>({...p,amountRial:map.has(p.id)?map.get(p.id):null}))});}catch(e){res.status(503).json({error:'قیمت بسته‌های سکه در دسترس نیست'});}});
app.patch('/admin-api/coin-packages/:id',adminAuth,async(req,res)=>{const id=String(req.params.id||''),match=ADMIN_COIN_PACKAGES.find(p=>p.id===id);if(!match)return res.status(404).json({error:'بسته سکه پیدا نشد'});const amountRial=req.body?.amountRial;if(amountRial!==null&&(!Number.isSafeInteger(Number(amountRial))||Number(amountRial)<1000||Number(amountRial)>500000000))return res.status(400).json({error:'قیمت باید بین ۱٬۰۰۰ تا ۵۰۰٬۰۰۰٬۰۰۰ ریال باشد یا خالی بماند'});try{const current=await store.query("SELECT setting_value FROM caspian_app_settings WHERE setting_key='coin_packages'");const parsed=current.rows[0]?.setting_value||[];const list=Array.isArray(parsed)?parsed:JSON.parse(parsed);const next=list.filter(p=>p.id!==id);if(amountRial!==null)next.push({id,amountRial:Number(amountRial)});await store.query("INSERT INTO caspian_app_settings(setting_key,setting_value) VALUES('coin_packages',$1::jsonb) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()",[JSON.stringify(next)]);await adminAudit('coin_package_price_update','coin_package',id,{coins:match.coins,amountRial:amountRial===null?null:Number(amountRial)});res.json({ok:true,id,amountRial:amountRial===null?null:Number(amountRial)});}catch(e){res.status(400).json({error:'ذخیره قیمت بسته ناموفق بود'});}});

app.patch('/admin-api/catalog/:id',adminAuth,async(req,res)=>{
 const id=String(req.params.id||''),{priceCoins,active,name,description}=req.body||{};
 if(priceCoins===undefined&&active===undefined&&name===undefined&&description===undefined)return res.status(400).json({error:'تغییری ارسال نشده است'});
 if(priceCoins!==undefined&&(!/^\d{1,15}$/.test(String(priceCoins))))return res.status(400).json({error:'قیمت باید عدد صحیح نامنفی باشد'});
 if(active!==undefined&&typeof active!=='boolean')return res.status(400).json({error:'وضعیت فعال‌بودن نامعتبر است'});
 if(name!==undefined&&(!String(name).trim()||String(name).length>80))return res.status(400).json({error:'نام کالا باید ۱ تا ۸۰ نویسه باشد'});
 try{const {rows}=await store.query(`UPDATE caspian_cosmetics SET price_coins=COALESCE($2::bigint,price_coins),active=COALESCE($3::boolean,active),name=COALESCE($4,name),description=COALESCE($5,description) WHERE id=$1 RETURNING id,name,category,price_coins,active`,[id,priceCoins===undefined?null:String(priceCoins),active===undefined?null:active,name===undefined?null:String(name).trim(),description===undefined?null:String(description).slice(0,500)]);if(!rows[0])return res.status(404).json({error:'کالا پیدا نشد'});await adminAudit('catalog_update','cosmetic',id,{priceCoins,active,name,description});res.json({ok:true,item:rows[0]});}
 catch(e){res.status(400).json({error:'ویرایش کالا ناموفق بود',detail:e.message});}
});
app.get('/admin-api/payouts',adminAuth,async(_req,res)=>{try{const {rows}=await store.query('SELECT room_code,winner,prize_pool_coins,winner_count,distributed_coins,settled_at FROM caspian_game_payouts ORDER BY settled_at DESC LIMIT 100');res.json({payouts:rows});}catch(e){res.status(503).json({error:'گزارش جوایز در دسترس نیست',detail:e.message});}});
app.get('/admin-api/orders',adminAuth,async(_req,res)=>{try{const {rows}=await store.query(`SELECT o.id,u.username,o.provider,o.provider_reference,o.amount_minor,o.currency,o.coins,o.status,o.created_at,o.updated_at FROM caspian_coin_orders o JOIN caspian_users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 100`);res.json({orders:rows});}catch(e){res.status(503).json({error:'سفارش‌های خرید سکه در دسترس نیست',detail:e.message});}});
app.get('/admin-api/settings',adminAuth,async(_req,res)=>{try{const {rows}=await store.query('SELECT setting_key,setting_value,updated_at FROM caspian_app_settings ORDER BY setting_key');res.json({settings:rows});}catch(e){res.status(503).json({error:'تنظیمات برنامه در دسترس نیست'});}});
app.patch('/admin-api/settings/:key',adminAuth,async(req,res)=>{
 const key=String(req.params.key||''),allowed=new Set(['maintenance_mode','public_rooms_enabled','private_rooms_enabled','default_game_prize_coins','registration_enabled']);if(!allowed.has(key))return res.status(400).json({error:'این تنظیم قابل تغییر نیست'});
 let value=req.body?.value;if(key==='default_game_prize_coins'){if(!/^\d{1,9}$/.test(String(value)))return res.status(400).json({error:'مبلغ جایزه نامعتبر است'});value=Number(value);}else if(typeof value!=='boolean')return res.status(400).json({error:'مقدار تنظیم باید روشن/خاموش باشد'});
 try{const {rows}=await store.query('INSERT INTO caspian_app_settings(setting_key,setting_value) VALUES($1,$2::jsonb) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW() RETURNING setting_key,setting_value,updated_at',[key,JSON.stringify(value)]);await adminAudit('setting_update','setting',key,{value});res.json({ok:true,setting:rows[0]});}catch(e){res.status(400).json({error:'ذخیره تنظیم ناموفق بود'});}
});
app.get('/admin-api/audit',adminAuth,async(_req,res)=>{try{const {rows}=await store.query('SELECT action,target_type,target_id,details,created_at FROM caspian_admin_audit ORDER BY created_at DESC LIMIT 100');res.json({entries:rows});}catch(e){res.status(503).json({error:'گزارش فعالیت مدیر در دسترس نیست'});}});
app.get('/admin-api/scenarios',adminAuth,(_req,res)=>res.json({scenarios:R.listScenarios(),exclusive:R.EMPIRE_OF_SHADOWS}));
app.get('/admin-api/community-scenarios',adminAuth,async(_req,res)=>{try{const {rows}=await store.query(`SELECT s.id,s.name,s.description,s.visibility,s.status,s.version,s.created_at,s.updated_at,u.username AS owner FROM caspian_scenarios s JOIN caspian_users u ON u.id=s.owner_id ORDER BY s.updated_at DESC LIMIT 200`);res.json({scenarios:rows});}catch(e){res.status(503).json({error:'سناریوهای ساخته‌شده کاربران در دسترس نیست'});}});
app.patch('/admin-api/community-scenarios/:id',adminAuth,async(req,res)=>{const {status,visibility}=req.body||{};if(status!==undefined&&!['draft','published','archived'].includes(status))return res.status(400).json({error:'وضعیت سناریو نامعتبر است'});if(visibility!==undefined&&!['private','unlisted','public'].includes(visibility))return res.status(400).json({error:'سطح دسترسی سناریو نامعتبر است'});if(status===undefined&&visibility===undefined)return res.status(400).json({error:'تغییری ارسال نشده است'});try{const {rows}=await store.query(`UPDATE caspian_scenarios SET status=COALESCE($2,status),visibility=COALESCE($3,visibility),updated_at=NOW(),version=version+1 WHERE id=$1 RETURNING id,name,status,visibility,version`,[req.params.id,status||null,visibility||null]);if(!rows[0])return res.status(404).json({error:'سناریو پیدا نشد'});await adminAudit('community_scenario_update','scenario',req.params.id,{status,visibility});res.json({ok:true,scenario:rows[0]});}catch(e){res.status(400).json({error:'تغییر سناریو ناموفق بود'});}});


const port=process.env.PORT||3000;
store.init().then(async()=>{for(const r of await store.load())rooms.set(r.code,r);server.listen(port,'0.0.0.0',()=>console.log('CASPIAN online with PostgreSQL persistence on '+port+'; restored rooms: '+rooms.size));}).catch(e=>{console.error('CASPIAN database startup failed:',e);process.exit(1);});