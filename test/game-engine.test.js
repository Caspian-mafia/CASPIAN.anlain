const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/game-engine');

function sample() {
  return E.createGame({
    players:[{id:'d',name:'کارآگاه'},{id:'g',name:'پدرخوانده'},{id:'m',name:'مافیا'},{id:'c',name:'شهروند'},{id:'s',name:'قاتل'}],
    roles:[{type:'detective',faction:'citizen'},{type:'godfather',faction:'mafia'},{type:'mafia',faction:'mafia'},{type:'citizen',faction:'citizen'},{type:'serial_killer',faction:'independent'}]
  });
}
test('کارآگاه پدرخوانده را شهروند می‌بیند',()=>assert.deepEqual(E.investigate(sample(),'d','g'),{result:'citizen'}));
test('استعلام مستقل فقط مافیا/غیرمافیا است',()=>{
 const g=sample(); g.players[0].role={type:'independent_investigator',faction:'independent'};
 assert.deepEqual(E.investigate(g,'d','s'),{result:'nonmafia'});
});
test('در تساوی، انتخاب پدرخوانده تعیین‌کننده است',()=>{
 const g=sample();
 assert.equal(E.resolveMafiaVote(g,{g:'c',m:'s'}).targetId,'c');
});
test('پیروزی مافیا با رسیدن به اکثریت یا تساوی زنده‌ها',()=>{
 const g=sample(); g.players.find(p=>p.id==='c').alive=false; g.players.find(p=>p.id==='s').alive=false;
 assert.equal(E.checkWinner(g).winner,'mafia');
});
test('حذف آخرین مافیا پیروزی شهروندان است',()=>{
 const g=sample(); g.players.find(p=>p.id==='g').alive=false; g.players.find(p=>p.id==='m').alive=false;
 assert.equal(E.checkWinner(g).winner,'citizens');
});
