'use strict';

function listPublicRooms(rooms, options = {}) {
  const scenarioId = String(options.scenarioId || '').trim();
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 30));
  return [...rooms.values()]
    .filter(room => room && room.visibility !== 'private')
    .filter(room => room.roomOpen !== false && !room.started && !room.finished)
    .filter(room => !scenarioId || String(room.scenario?.id || '') === scenarioId)
    .map(room => ({
      code: room.code,
      scenarioId: room.scenario?.id || 'classic',
      scenarioName: room.scenario?.name || 'سناریوی نامشخص',
      players: Array.isArray(room.players) ? room.players.length : 0,
      capacity: Number(room.scenario?.maxPlayers || room.scenario?.players?.max || 16),
      minPlayers: Number(room.scenario?.minPlayers || room.scenario?.players?.min || 16),
      hostMode: room.hostMode === 'moderator' ? 'moderator' : 'player',
      phase: room.phase || 'لابی',
      chatOpen: room.chatOpen !== false,
      createdAt: room.createdAt || null
    }))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.code.localeCompare(b.code))
    .slice(0, limit);
}

module.exports = { listPublicRooms };
