const DEFAULT_RULES = Object.freeze({
  investigatorResult: 'mafia_or_citizen',
  independentInvestigation: 'nonmafia',
  godfatherOverride: true,
  mafiaTieBreaker: 'godfather',
  serialKillerWinCondition: 'alive',
  mafiaWinCondition: 'parity'
});

function normalizeRules(input = {}) {
  const r = { ...DEFAULT_RULES, ...input };
  if (!['mafia_or_citizen', 'alignment'].includes(r.investigatorResult)) throw new Error('قانون استعلام کارآگاه نامعتبر است');
  if (r.independentInvestigation !== 'nonmafia') throw new Error('قانون استعلام مستقل‌ها نامعتبر است');
  if (typeof r.godfatherOverride !== 'boolean') throw new Error('قانون پدرخوانده نامعتبر است');
  if (r.mafiaTieBreaker !== 'godfather') throw new Error('قانون تساوی رأی مافیا نامعتبر است');
  if (!['alive', 'last_standing'].includes(r.serialKillerWinCondition)) throw new Error('شرط پیروزی قاتل زنجیره‌ای نامعتبر است');
  if (!['parity', 'elimination'].includes(r.mafiaWinCondition)) throw new Error('شرط پیروزی مافیا نامعتبر است');
  return r;
}

function publicPlayer(p) {
  return { id:p.id, name:p.name, alive:p.alive, host:!!p.host, role:undefined };
}
function alivePlayers(game) { return game.players.filter(p => p.alive); }
function roleOf(game, id) { return game.players.find(p => p.id === id)?.role || null; }
function alignment(role) {
  if (!role) return 'unknown';
  if (role.faction === 'mafia' || role.type === 'godfather') return 'mafia';
  if (role.faction === 'independent' || role.faction === 'serial_killer') return 'independent';
  return 'citizen';
}
function investigate(game, actorId, targetId) {
  const actor = game.players.find(p => p.id === actorId);
  const target = game.players.find(p => p.id === targetId);
  if (!actor || !target || !actor.alive || !target.alive) throw new Error('بازیکن معتبر نیست');
  const actorType = actor.role?.type;
  if (!['detective', 'independent_investigator'].includes(actorType)) throw new Error('این نقش اجازه استعلام ندارد');
  const a = alignment(target.role);
  if (actorType === 'independent_investigator') return { result: a === 'mafia' ? 'mafia' : 'nonmafia' };
  if (game.rules.godfatherOverride && target.role?.type === 'godfather') return { result:'citizen' };
  return { result: game.rules.investigatorResult === 'mafia_or_citizen' ? (a === 'mafia' ? 'mafia' : 'citizen') : a };
}
function resolveMafiaVote(game, votes) {
  const counts = new Map();
  for (const [voterId, targetId] of Object.entries(votes || {})) {
    const voter = game.players.find(p => p.id === voterId);
    const target = game.players.find(p => p.id === targetId);
    if (voter?.alive && alignment(voter.role) === 'mafia' && target?.alive) counts.set(targetId, (counts.get(targetId)||0)+1);
  }
  if (!counts.size) return { targetId:null, tied:false };
  const max = Math.max(...counts.values());
  const tied = [...counts.values()].filter(n=>n===max).length > 1;
  if (!tied) return { targetId:[...counts].find(([,n])=>n===max)[0], tied:false };
  const godfather = game.players.find(p=>p.alive && p.role?.type==='godfather');
  if (game.rules.mafiaTieBreaker==='godfather' && godfather) {
    const chosen = votes[godfather.id];
    if (chosen && counts.get(chosen)===max) return { targetId:chosen, tied:true, decidedBy:'godfather' };
  }
  return { targetId:null, tied:true, decidedBy:null };
}
function checkWinner(game) {
  const alive = alivePlayers(game);
  const sk = alive.find(p=>p.role?.type==='serial_killer');
  if (game.rules.serialKillerWinCondition==='alive' && sk && alive.length===1) return { winner:'serial_killer', reason:'serial_killer_alive' };
  const mafia = alive.filter(p=>alignment(p.role)==='mafia').length;
  const others = alive.length-mafia;
  if (game.rules.mafiaWinCondition==='parity' && mafia>0 && mafia>=others) return { winner:'mafia', reason:'parity' };
  if (mafia===0) return { winner:'citizens', reason:'mafia_eliminated' };
  return null;
}
function createGame({ players, roles, rules } = {}) {
  if (!Array.isArray(players) || !Array.isArray(roles) || players.length !== roles.length) throw new Error('تعداد بازیکنان و نقش‌ها باید برابر باشد');
  const ids = new Set(players.map(p=>p.id));
  if (ids.size !== players.length || players.some(p=>!p.id || !p.name)) throw new Error('شناسه یا نام بازیکن نامعتبر است');
  return { phase:'night', players:players.map((p,i)=>({...p,alive:true,role:roles[i]})), rules:normalizeRules(rules), winner:null, history:[] };
}
function eliminate(game, playerId, cause='manual') {
  const p = game.players.find(x=>x.id===playerId);
  if (!p || !p.alive) throw new Error('بازیکن زنده پیدا نشد');
  p.alive=false;
  game.history.push({type:'elimination',playerId,cause,at:new Date().toISOString()});
  game.winner=checkWinner(game);
  return game.winner;
}
module.exports = { DEFAULT_RULES, normalizeRules, publicPlayer, alivePlayers, alignment, investigate, resolveMafiaVote, checkWinner, createGame, eliminate };
