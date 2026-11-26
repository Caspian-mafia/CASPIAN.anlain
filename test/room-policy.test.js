'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canUseChat } = require('../room-policy');
test('chat works in an open lobby', () => assert.equal(canUseChat({phase:'لابی',chatOpen:true,finished:false}), true));
test('host chat toggle is enforced during day and night', () => {
  assert.equal(canUseChat({phase:'روز',started:true,chatOpen:false,finished:false}), false);
  assert.equal(canUseChat({phase:'شب',started:true,chatOpen:false,finished:false}), false);
  assert.equal(canUseChat({phase:'روز',started:true,chatOpen:true,finished:false}), true);
});
test('chat is unavailable after match completion', () => {
  assert.equal(canUseChat({phase:'پایان بازی',chatOpen:true,finished:true}), false);
  assert.equal(canUseChat(null), false);
});
