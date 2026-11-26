'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makePasswordHash,verifyPassword,coinPackages,STARTER_COSMETIC_IDS,calculatePrizeShares}=require('./platform');

test('passwords are stored as salted scrypt hashes and verified',async()=>{
 const encoded=await makePasswordHash('correct horse battery staple');
 assert.match(encoded,/^scrypt\$16384\$8\$1\$/);
 assert.equal(await verifyPassword('correct horse battery staple',encoded),true);
 assert.equal(await verifyPassword('wrong password',encoded),false);
});

test('coin catalog always contains the requested independent bundles',()=>{
 const previous=process.env.CASPIAN_COIN_PACKAGES;
 delete process.env.CASPIAN_COIN_PACKAGES;
 const expected=[100,500,2000,3000,5000,10000,15000,20000,30000,40000,50000];
 assert.deepEqual(coinPackages().map(p=>p.coins),expected);
 assert.deepEqual(coinPackages().map(p=>p.amountRial),[1000000,2000000,3500000,5000000,7500000,10000000,15000000,20000000,30000000,40000000,50000000]);
 if(previous===undefined)delete process.env.CASPIAN_COIN_PACKAGES;
 else process.env.CASPIAN_COIN_PACKAGES=previous;
});

test('only valid server-configured Rial prices are enabled',()=>{
 const previous=process.env.CASPIAN_COIN_PACKAGES;
 process.env.CASPIAN_COIN_PACKAGES=JSON.stringify([
  {id:'coins-100',amountRial:100000,coins:100},
  {id:'coins-500',amountRial:100,coins:500},
  {id:'coins-2000',amountRial:1000.5,coins:2000}
 ]);
 const packages=coinPackages();
 assert.equal(packages[0].amountRial,100000);
 assert.equal(packages[1].amountRial,null);
 assert.equal(packages[2].amountRial,null);
 if(previous===undefined)delete process.env.CASPIAN_COIN_PACKAGES;
 else process.env.CASPIAN_COIN_PACKAGES=previous;
});

test('new accounts receive three free starter avatars and one free frame',()=>{
 assert.deepEqual(STARTER_COSMETIC_IDS,['avatar-starter-fox','avatar-starter-cat','avatar-starter-owl','frame-starter']);
});

test('guest profile starter items are the same permanent starter set',()=>{
 assert.deepEqual(STARTER_COSMETIC_IDS,['avatar-starter-fox','avatar-starter-cat','avatar-starter-owl','frame-starter']);
});

test('Iranian mobile numbers normalize to E.164',()=>{
 const {normalizeIranPhone}=require('./platform');
 assert.equal(normalizeIranPhone('09123456789'),'+989123456789');
 assert.equal(normalizeIranPhone('+989123456789'),'+989123456789');
 assert.equal(normalizeIranPhone('09 123-456-789'),'+989123456789');
 assert.equal(normalizeIranPhone('(0912) 345-6789'),'+989123456789');
 assert.equal(normalizeIranPhone('12345'),null);
 assert.equal(normalizeIranPhone('+994501234567'),null);
});


test('coin packages are priced from 100,000 to 5,000,000 toman',()=>{
 const previous=process.env.CASPIAN_COIN_PACKAGES;
 delete process.env.CASPIAN_COIN_PACKAGES;
 const packages=coinPackages();
 assert.equal(packages[0].amountRial,1000000);
 assert.equal(packages.at(-1).amountRial,50000000);
 assert.equal(packages.length,11);
 assert.ok(packages.every((item,index)=>index===0||item.amountRial>packages[index-1].amountRial));
 if(previous===undefined)delete process.env.CASPIAN_COIN_PACKAGES;
 else process.env.CASPIAN_COIN_PACKAGES=previous;
});


test('20,000-coin match prize is split equally with deterministic remainder',()=>{
 assert.deepEqual(calculatePrizeShares(['user-c','user-a','user-b'],20_000),[
  {userId:'user-a',coins:6_667},{userId:'user-b',coins:6_667},{userId:'user-c',coins:6_666}
 ]);
 assert.deepEqual(calculatePrizeShares(['user-a','user-a'],20_000),[{userId:'user-a',coins:20_000}]);
 assert.deepEqual(calculatePrizeShares([],20_000),[]);
});


test('paid avatar and frame catalog prices start at 30,000 coins while starter items remain free',()=>{
 const fs=require('node:fs');
 const schema=fs.readFileSync(require('node:path').join(__dirname,'database','platform-schema.sql'),'utf8');
 assert.match(schema,/WHEN 'avatar-fox' THEN 30000/);
 assert.match(schema,/WHEN 'frame-bronze' THEN 30000/);
 assert.match(schema,/WHEN 'frame-diamond' THEN 180000/);
 assert.match(schema,/WHERE id IN \([\s\S]*?'frame-diamond'/);
 assert.match(schema,/\('avatar-starter-fox',[^\n]*,0,/);
 assert.match(schema,/\('frame-starter',[^\n]*,0,/);
});
