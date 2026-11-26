'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const {io}=require('socket.io-client');

async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const v=await fn();if(v)return v;await wait(50);}throw Error('Timed out waiting for multiplayer event');}
function emitAck(socket,event,payload={}){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Timeout: '+event)),5000);socket.emit(event,payload,r=>{clearTimeout(t);r?.ok?resolve(r):reject(Error(r?.error||event+' failed'));});});}
test('live 16-player room: private roles, night actions, day voting', {timeout:45000}, async t=>{
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),CASPIAN_TEST_MEMORY:'1'},stdio:'ignore'});
 const clients=[];
 t.after(()=>{for(const c of clients)c.close();child.kill('SIGTERM');});
 await waitFor(async()=>{try{const r=await fetch(base+'/health');return r.ok;}catch{return false;}},15000);
 const connect=()=>new Promise((resolve,reject)=>{const s=io(base,{transports:['websocket'],reconnection:false});clients.push(s);s.once('connect',()=>resolve(s));s.once('connect_error',reject);});
 const host=await connect();
 const created=await emitAck(host,'create',{name:'گرداننده',avatarId:'avatar-godfather',frameId:'frame-diamond'});
 const code=created.code;
 const denied=await fetch(base+'/api/scenario?room='+code);assert.equal(denied.status,403);
 const allowed=await fetch(base+'/api/scenario?room='+code,{headers:{'x-host-key':created.hostKey}});assert.equal(allowed.status,200);
 const roomStates=new Map(),roles=new Map(),playerIds=new Map([[host.id,created.playerId]]),playerTokens=new Map([[host.id,created.playerToken]]);
 for(let i=0;i<16;i++){
  const c=i===0?host:await connect();
  c.on('room',r=>{if(r.code===code)roomStates.set(c.id,r);});
  if(i>0){const joined=await emitAck(c,'join',{code,name:'بازیکن'+i});playerIds.set(c.id,joined.playerId);playerTokens.set(c.id,joined.playerToken);}
 }
 await waitFor(()=>[...roomStates.values()].find(r=>r.players.length===16));
 const hostProfile=[...roomStates.values()].find(r=>r.players.length===16).players.find(p=>p.id===created.playerId);
 assert.equal(hostProfile.avatarId,'avatar-starter-fox','client-supplied premium avatars must not be trusted');
 assert.equal(hostProfile.frameId,'frame-starter','client-supplied premium frames must not be trusted');
 const cardsByClient=new Map();for(const c of clients){c.on('myRole',r=>roles.set(c.id,r));c.on('role-cards:available',cards=>cardsByClient.set(c.id,cards));}
 const started=await emitAck(host,'assignRoles');assert.equal(started.selecting,true);
 await assert.rejects(emitAck(host,'assignRoles'),/این بازی قبلاً شروع شده است/);
 await waitFor(()=>cardsByClient.size===16);
 const deck=[...cardsByClient.get(host.id)];
 for(const c of clients){const card=deck.shift();await emitAck(c,'role-cards:pick',{cardId:card.id});}
 await waitFor(()=>roles.size===16);assert.equal(roles.size,16);
 for(let n=0;n<5;n++)await emitAck(host,'host:advance-flow');
 await emitAck(host,'host:advance-flow');
 const abilityRoles=new Set(['پزشک','کارآگاه','قاتل زنجیره‌ای','مستقل']);
 const abilityTurns=[...roles.values()].filter(role=>abilityRoles.has(role)).length;
 for(let i=0;i<abilityTurns;i++)await emitAck(host,'host:advance-flow');
 await waitFor(()=>[...roomStates.values()].some(r=>r.gameStage==='discussion'));
 await emitAck(host,'host:advance-flow');
 const dayRoom=[...roomStates.values()].find(r=>r.gameStage==='vote');
 const alive=dayRoom.players.filter(p=>p.alive);
 for(const c of clients){
  if(!alive.some(p=>p.id===playerIds.get(c.id)))continue;
  const target=alive.find(p=>p.id!==playerIds.get(c.id));
  if(target)await emitAck(c,'dayVote',{targetId:target.id});
 }
 const result=await emitAck(host,'resolveDayVote');
 assert.equal(result.ok,true);
 assert.equal(alive.length,16-dayRoom.players.filter(p=>!p.alive).length);
 const original=clients[1],stableId=playerIds.get(original.id),stableToken=playerTokens.get(original.id),originalRole=roles.get(original.id);
 original.close();
 const replacement=await connect();
 const resumed=await emitAck(replacement,'resumePlayer',{code,playerId:stableId,playerToken:stableToken});
 assert.equal(resumed.playerId,stableId);
 assert.equal(resumed.isHost,false);
 assert.equal(resumed.role,originalRole);
});

test('public room snapshots expose cosmetics only and guest seats reject account-profile rewrites', {timeout:20000}, async t=>{
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),CASPIAN_TEST_MEMORY:'1'},stdio:'ignore'});
 const clients=[];t.after(()=>{for(const c of clients)c.close();child.kill('SIGTERM');});
 await waitFor(async()=>{try{return (await fetch(base+'/health')).ok;}catch{return false;}},15000);
 const connect=()=>new Promise((resolve,reject)=>{const s=io(base,{transports:['websocket'],reconnection:false});clients.push(s);s.once('connect',()=>resolve(s));s.once('connect_error',reject);});
 const host=await connect();
 const created=await emitAck(host,'create',{name:'میزبان',userId:'forged-user',avatarId:'avatar-godfather',frameId:'frame-diamond',authToken:'invalid'});
 const guest=await connect();
 const joined=await emitAck(guest,'join',{code:created.code,name:'مهمان',userId:'forged-user',avatarId:'avatar-godfather',frameId:'frame-diamond',authToken:'invalid'});
 const snapshot=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),3000);host.on('room',r=>{if(r.code===created.code){clearTimeout(timer);resolve(r);}});});
 assert.ok(snapshot);
 for(const player of snapshot.players){
  assert.equal(player.avatarId,'avatar-starter-fox');
  assert.equal(player.frameId,'frame-starter');
  for(const secret of ['userId','role','tokenHash','playerToken','authToken','wallet','balance'])assert.equal(Object.hasOwn(player,secret),false);
 }
 const before=snapshot.players.find(p=>p.id===joined.playerId);
 await assert.rejects(emitAck(guest,'refreshProfile',{authToken:'x'.repeat(48),userId:'forged-user'}),/به‌روزرسانی زنده فقط برای حساب متصل/);
 const resumed=await emitAck(guest,'resumePlayer',{code:created.code,playerId:joined.playerId,playerToken:joined.playerToken,authToken:'x'.repeat(48),userId:'forged-user'});
 assert.equal(resumed.playerId,joined.playerId);
 const after=resumed.room.players.find(p=>p.id===joined.playerId);
 assert.equal(after.avatarId,before.avatarId);
 assert.equal(after.frameId,before.frameId);
 for(const player of resumed.room.players){
  for(const secret of ['userId','role','tokenHash','playerToken','authToken','wallet','balance'])assert.equal(Object.hasOwn(player,secret),false);
 }
});

test('host can open and close room entry and chat, and broadcast announcements', {timeout:25000}, async t=>{
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),CASPIAN_TEST_MEMORY:'1'},stdio:'ignore'});
 const clients=[];t.after(()=>{for(const c of clients)c.close();child.kill('SIGTERM');});
 await waitFor(async()=>{try{return (await fetch(base+'/health')).ok;}catch{return false;}},15000);
 const connect=()=>new Promise((resolve,reject)=>{const s=io(base,{transports:['websocket'],reconnection:false});clients.push(s);s.once('connect',()=>resolve(s));s.once('connect_error',reject);});
 const host=await connect(),created=await emitAck(host,'create',{name:'میزبان'}),guest=await connect();
 await emitAck(guest,'join',{code:created.code,name:'مهمان'});
 await assert.rejects(emitAck(guest,'setRoomOpen',{open:false}),/گرداننده/);
 await emitAck(host,'setRoomOpen',{open:false});
 const denied=await connect();clients.push(denied);
 await assert.rejects(emitAck(denied,'join',{code:created.code,name:'بازیکن سوم'}),/بسته/);
 await emitAck(host,'setRoomOpen',{open:true});
 await emitAck(denied,'join',{code:created.code,name:'بازیکن سوم'});
 await emitAck(host,'setChatOpen',{open:false});
 await assert.rejects(emitAck(guest,'chat',{message:'سلام'}),/گفت‌وگو/);
 const notice=new Promise(resolve=>guest.once('notice',resolve));
 await emitAck(host,'hostMessage',{message:'همه آماده باشند'});
 assert.match(await notice,/پیام گرداننده.*همه آماده باشند/);
 await emitAck(host,'setChatOpen',{open:true});
 await emitAck(guest,'chat',{message:'گفت‌وگوی دوباره فعال شد'});
});

test('dedicated Empire of Shadows room deals its exact role deck', {timeout:45000}, async t=>{
 const port=await freePort(),base='http://127.0.0.1:'+port;const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),CASPIAN_TEST_MEMORY:'1'},stdio:'ignore'});const clients=[];t.after(()=>{for(const c of clients)c.close();child.kill('SIGTERM');});await waitFor(async()=>{try{return (await fetch(base+'/health')).ok;}catch{return false;}},15000);
 const connect=()=>new Promise((resolve,reject)=>{const s=io(base,{transports:['websocket'],reconnection:false});clients.push(s);s.once('connect',()=>resolve(s));s.once('connect_error',reject);});const host=await connect(),created=await emitAck(host,'create',{name:'گرداننده',scenarioId:'empire-of-shadows'});const scenarioResponse=await fetch(base+'/api/scenario?room='+created.code,{headers:{'x-host-key':created.hostKey}});assert.equal(scenarioResponse.status,200);const scenario=await scenarioResponse.json();assert.equal(scenario.id,'empire-of-shadows');assert.equal(scenario.name,'امپراتوری سایه‌ها');const roles=[],cardsByClient=new Map();host.on('myRole',r=>roles.push(r));host.on('role-cards:available',cards=>cardsByClient.set(host.id,cards));for(let i=1;i<16;i++){const c=await connect();c.on('myRole',r=>roles.push(r));c.on('role-cards:available',cards=>cardsByClient.set(c.id,cards));await emitAck(c,'join',{code:created.code,name:'بازیکن'+i});}await emitAck(host,'assignRoles');await waitFor(()=>cardsByClient.size===16);const deck=[...cardsByClient.get(host.id)];for(const c of clients){const card=deck.shift();await emitAck(c,'role-cards:pick',{cardId:card.id});}await waitFor(()=>roles.length===16);const count=role=>roles.filter(x=>x===role).length;for(const role of ['امپراتور','استراتژیست','جاعل','بازجو','مافیای سایه','فرمانده آشوب','قاتل زنجیره‌ای','کارآگاه ویژه','پزشک اعظم','محافظ سلطنتی','قاضی','هکر','خبرنگار','تک‌تیرانداز','شهروند بانفوذ','شهروند تحلیلگر'])assert.equal(count(role),1,`expected exactly one ${role}`);
});

test('separate moderator host does not consume a player seat and can inspect the role deck', {timeout:30000}, async t => {
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),CASPIAN_TEST_MEMORY:'1'},stdio:'ignore'});
 const clients=[];t.after(()=>{for(const c of clients)c.close();child.kill('SIGTERM');});
 await waitFor(async()=>{try{return (await fetch(base+'/health')).ok;}catch{return false;}},15000);
 const connect=()=>new Promise((resolve,reject)=>{const s=io(base,{transports:['websocket'],reconnection:false});clients.push(s);s.once('connect',()=>resolve(s));s.once('connect_error',reject);});
 const host=await connect(),created=await emitAck(host,'create',{name:'ناظر',scenarioId:'royal-investigation',hostMode:'moderator'});
 assert.equal(created.hostMode,'moderator');assert.equal(created.playerId,null);
 const states=[];host.on('room',r=>{if(r.code===created.code)states.push(r);});
 for(let i=0;i<8;i++){const c=await connect();await emitAck(c,'join',{code:created.code,name:'بازیکن'+i});}
 await waitFor(()=>states.some(r=>r.players.length===8));
 assert.equal(states.at(-1).players.some(p=>p.host),false);
 const deck=new Promise(resolve=>host.once('host:role-deck',resolve));
 await emitAck(host,'assignRoles');
 const cards=await deck;assert.equal(cards.length,8);assert.ok(cards.every(c=>typeof c.role==='string'));
 await emitAck(host,'host:advance-flow');
});
