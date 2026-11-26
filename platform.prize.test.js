'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {calculatePrizeShares}=require('./platform');

test('official CASPIAN 20,000-coin pool is split equally between winning accounts',()=>{
 const shares=calculatePrizeShares(['winner-b','winner-a'],20_000);
 assert.deepEqual(shares,[{userId:'winner-a',coins:10_000},{userId:'winner-b',coins:10_000}]);
 assert.equal(shares.reduce((sum,x)=>sum+x.coins,0),20_000);
});

test('indivisible remainder is assigned deterministically without losing coins',()=>{
 const shares=calculatePrizeShares(['c','a','b'],20_000);
 assert.deepEqual(shares,[{userId:'a',coins:6_667},{userId:'b',coins:6_667},{userId:'c',coins:6_666}]);
 assert.equal(shares.reduce((sum,x)=>sum+x.coins,0),20_000);
});

test('duplicate account ids cannot receive multiple shares for one winner account',()=>{
 const shares=calculatePrizeShares(['a','a','b'],20_000);
 assert.deepEqual(shares,[{userId:'a',coins:10_000},{userId:'b',coins:10_000}]);
});

test('no registered winning accounts means no account-wallet payout is created',()=>{
 assert.deepEqual(calculatePrizeShares([],20_000),[]);
});
