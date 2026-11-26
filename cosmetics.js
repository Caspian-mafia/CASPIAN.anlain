'use strict';
const AVATAR_ASSET_IDS = new Set([
  'avatar-fox','avatar-cat','avatar-wolf','avatar-owl','avatar-dragon','avatar-king',
  'avatar-detective','avatar-doctor','avatar-godfather','avatar-hitman','avatar-witch',
  'avatar-vampire','avatar-pirate','avatar-samurai','avatar-raven','avatar-tiger',
  'avatar-ice-queen','avatar-phantom','avatar-alchemist',
  'avatar-starter-fox','avatar-starter-cat','avatar-starter-owl',
  'avatar-apoc-hellking','avatar-apoc-demon','avatar-apoc-vampire',
  'avatar-apoc-iceghost','avatar-apoc-darkwitch','avatar-apoc-shadowqueen',
  'avatar-apoc-hellwolf','avatar-apoc-skullknight','avatar-apoc-plague',
  'avatar-apoc-crow','avatar-apoc-firelord','avatar-apoc-nightmare'
]);
const ZODIAC_AVATAR_IDS = new Set([
  'avatar-zodiac-aries','avatar-zodiac-taurus','avatar-zodiac-gemini',
  'avatar-zodiac-cancer','avatar-zodiac-leo','avatar-zodiac-virgo',
  'avatar-zodiac-libra','avatar-zodiac-scorpio','avatar-zodiac-sagittarius',
  'avatar-zodiac-capricorn','avatar-zodiac-aquarius','avatar-zodiac-pisces'
]);
const FRAME_ASSET_IDS = new Set([
  'frame-starter','frame-bronze','frame-silver','frame-gold','frame-neon',
  'frame-fire','frame-caspian','frame-iron','frame-emerald','frame-sapphire',
  'frame-amethyst','frame-shadow','frame-royal-red','frame-celestial','frame-diamond'
]);
function isAvatarId(id) { return AVATAR_ASSET_IDS.has(String(id)) || ZODIAC_AVATAR_IDS.has(String(id)); }
function isFrameId(id) { return FRAME_ASSET_IDS.has(String(id)); }
function withCosmeticAsset(item) {
  const id = String(item?.id || '');
  if (item?.category === 'avatar' && AVATAR_ASSET_IDS.has(id)) return { ...item, asset_url: '/assets/cosmetics/avatars.svg#' + id };
  if (item?.category === 'avatar' && ZODIAC_AVATAR_IDS.has(id)) return { ...item, asset_url: '/assets/cosmetics/zodiac.svg#' + id };
  if (item?.category === 'frame' && FRAME_ASSET_IDS.has(id)) return { ...item, asset_url: '/assets/cosmetics/frames.svg#' + id };
  return item;
}
module.exports = { AVATAR_ASSET_IDS, ZODIAC_AVATAR_IDS, FRAME_ASSET_IDS, isAvatarId, isFrameId, withCosmeticAsset };
