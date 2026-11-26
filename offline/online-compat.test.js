'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Offline = require('./offline/offline-engine');
const Online = require('./rules-engine');

const ROLE_BRIDGE = {
  godfather: 'امپراتور',
  strategist: 'استراتژیست',
  forger: 'جاعل',
  interrogator: 'بازجو',
  shadow_mafia: 'مافیای سایه',
  chaos_commander: 'فرمانده آشوب',
  serial_killer: 'قاتل زنجیره‌ای',
  detective: 'کارآگاه ویژه',
  doctor: 'پزشک اعظم',
  royal_guard: 'محافظ سلطنتی',
  judge: 'قاضی',
  hacker: 'هکر',
  reporter: 'خبرنگار',
  sniper: 'تک‌تیرانداز',
  influential_citizen: 'شهروند بانفوذ',
  analyst: 'شهروند تحلیلگر'
};

test('offline simulator and authoritative online engine share the exact Empire role roster', () => {
  const onlineRoles = Online.EMPIRE_OF_SHADOWS.roleCounts;
  assert.equal(Object.values(onlineRoles).reduce((a, b) => a + b, 0), 16);
  assert.equal(Object.keys(onlineRoles).length, 16);
  assert.equal(Object.keys(ROLE_BRIDGE).length, 16);
  for (const [offlineId, onlineName] of Object.entries(ROLE_BRIDGE)) {
    assert.equal(Offline.LABELS[offlineId] !== undefined, true, 'offline role exists: ' + offlineId);
    assert.equal(onlineRoles[onlineName], 1, 'online role exists exactly once: ' + onlineName);
    assert.equal(Online.roleGroup(onlineName), Offline.ROLE_FACTION[offlineId] === 'town' ? 'citizen' : Offline.ROLE_FACTION[offlineId]);
  }
});

test('offline and online engines agree on the 5 mafia / 2 independent / 9 citizen faction split', () => {
  const counts = { mafia: 0, independent: 0, citizen: 0 };
  for (const [offlineId, faction] of Object.entries(Offline.ROLE_FACTION)) {
    if (offlineId === 'citizen') continue;
    counts[faction === 'town' ? 'citizen' : faction]++;
  }
  assert.deepEqual(counts, { mafia: 5, independent: 2, citizen: 9 });
  const online = { mafia: 0, independent: 0, citizen: 0 };
  for (const [role, count] of Object.entries(Online.EMPIRE_OF_SHADOWS.roleCounts)) {
    const faction = Online.roleGroup(role);
    online[faction === 'town' ? 'citizen' : faction] += count;
  }
  assert.deepEqual(online, counts);
});

test('both engines retain the flagship scenario rule contract', () => {
  assert.equal(Online.EMPIRE_OF_SHADOWS.independentInvestigation, 'nonmafia');
  assert.equal(Online.EMPIRE_OF_SHADOWS.godfatherOverride, true);
  assert.equal(Online.EMPIRE_OF_SHADOWS.mafiaTieBreak, 'godfather');
  assert.equal(Online.EMPIRE_OF_SHADOWS.serialKillerWin, 'alive');
  assert.equal(Online.EMPIRE_OF_SHADOWS.mafiaWin, 'parity');
});
