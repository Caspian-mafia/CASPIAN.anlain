'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const {io}=require('socket.io-client');
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await wait(50);}throw Error('server timeout');}
function emitAck(socket,event,payload={}){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout '+event)),5000);socket.emit(event,payload,r=>{clearTimeout(timer);r?.ok?resolve(r):reject(Error(r?.error||event+' failed'));});});}
test('players can send targeted free reactions, stickers and speakers; premium speakers require ownership',{timeout:30000},async t=>{
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),CASPIAN_TEST_MEMORY:'1'},stdio:'ignore'});
 const clients=[];t.after(()=>{for(const client of clients)client.close();child.kill('SIGTERM');});
 await waitFor(async()=>{try{return (await fetch(base+'/health')).ok;}catch{return false;}});
 const connect=()=>new Promise((resolve,reject)=>{const client=io(base,{transports:['websocket'],reconnection:false});clients.push(client);client.once('connect',()=>resolve(client));client.once('connect_error',reject);});
 const host=await connect(),created=await emitAck(host,'create',{name:'میزبان'}),guest=await connect();
 await emitAck(guest,'join',{code:created.code,name:'بازیکن دوم'});
 const reaction=new Promise(resolve=>host.once('socialReaction',resolve));
 await emitAck(guest,'socialReaction',{targetId:created.playerId,type:'like'});
 const r=await reaction;assert.equal(r.targetId,created.playerId);assert.equal(r.totals.like,1);
 await wait(650);
 const sticker=new Promise(resolve=>host.once('playerSticker',resolve));
 await emitAck(guest,'playerSticker',{targetId:created.playerId,stickerId:'suspect'});
 assert.equal((await sticker).stickerId,'suspect');
 await wait(650);
 const speaker=new Promise(resolve=>host.once('speaker',resolve));
 await emitAck(guest,'speaker',{targetId:created.playerId,speakerId:'watching'});
 assert.equal((await speaker).speakerId,'watching');
 await wait(650);
 await assert.rejects(emitAck(guest,'speaker',{targetId:created.playerId,speakerId:'neck'}),/بسته مربوط/);
 await wait(650);
 await assert.rejects(emitAck(guest,'playerSticker',{targetId:created.playerId,stickerId:'mafia-alert'}),/بسته آن را از فروشگاه/);
});
