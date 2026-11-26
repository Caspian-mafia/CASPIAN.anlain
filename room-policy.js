'use strict';
function canUseChat(room) { return Boolean(room && room.chatOpen !== false && !room.finished); }
module.exports = { canUseChat };
