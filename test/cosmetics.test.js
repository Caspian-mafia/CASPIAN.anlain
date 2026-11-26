'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cosmetics = require('../cosmetics');
const platform = require('../platform');
const apocalypseIds = [
  'avatar-apoc-hellking','avatar-apoc-demon','avatar-apoc-vampire','avatar-apoc-iceghost',
  'avatar-apoc-darkwitch','avatar-apoc-shadowqueen','avatar-apoc-hellwolf','avatar-apoc-skullknight',
  'avatar-apoc-plague','avatar-apoc-crow','avatar-apoc-firelord','avatar-apoc-nightmare'
];
test('all apocalypse avatars are accepted in rooms and resolve to SVG assets', () => {
  for (const id of apocalypseIds) {
    assert.equal(cosmetics.isAvatarId(id), true, id);
    assert.deepEqual(platform.withCosmeticAsset({id,category:'avatar'}), {
      id,category:'avatar',asset_url:'/assets/cosmetics/avatars.svg#'+id
    });
  }
});
test('paid apocalypse avatars are not granted to new accounts as starter gifts', () => {
  assert.deepEqual(platform.STARTER_COSMETIC_IDS, ['avatar-starter-fox','avatar-starter-cat','avatar-starter-owl','frame-starter']);
  for (const id of apocalypseIds) assert.equal(platform.STARTER_COSMETIC_IDS.includes(id), false, id);
});
test('unknown cosmetic identifiers are rejected and known zodiac/frame routes remain stable', () => {
  assert.equal(cosmetics.isAvatarId('avatar-admin-injected'), false);
  assert.equal(cosmetics.isFrameId('frame-admin-injected'), false);
  assert.equal(platform.withCosmeticAsset({id:'avatar-zodiac-leo',category:'avatar'}).asset_url,'/assets/cosmetics/zodiac.svg#avatar-zodiac-leo');
  assert.equal(platform.withCosmeticAsset({id:'frame-royal-red',category:'frame'}).asset_url,'/assets/cosmetics/frames.svg#frame-royal-red');
});
