'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const registerVoice = require('../voice-signaling');

function fixture() {
  const handlers = {};
  const emitted = [];
  const ioHandlers = {};
  const io = {
    on: (name, fn) => { ioHandlers[name] = fn; },
    to: target => ({ emit: (event, payload) => emitted.push({ target, event, payload }) })
  };
  const app = { get: () => {} };
  const room = {
    code: 'ABC123', phase: 'شب', finished: false, narratorMode: 'hybrid',
    scenario: { id: 'empire-of-shadows' }, hostPlayerId: 'h', hostSocketId: 'sock-h',
    players: [
      { id: 'h', socketId: 'sock-h', name: 'Host', role: 'امپراتور', alive: true },
      { id: 'm', socketId: 'sock-m', name: 'Mafia', role: 'استراتژیست', alive: true },
      { id: 'c', socketId: 'sock-c', name: 'Citizen', role: 'پزشک اعظم', alive: true }
    ]
  };
  const rooms = new Map([[room.code, room]]);
  function makeSocket(id, playerId) {
    const socket = {
      id, data: { playerId }, joined: new Set(),
      on: (name, fn) => { handlers[id + ':' + name] = fn; },
      emit: (event, payload) => emitted.push({ target: id, event, payload }),
      join: channel => socket.joined.add(channel),
      leave: channel => socket.joined.delete(channel),
      to: target => ({ emit: (event, payload) => emitted.push({ target, event, payload }) })
    };
    return socket;
  }
  const host = makeSocket('sock-h', 'h');
  const mafia = makeSocket('sock-m', 'm');
  const citizen = makeSocket('sock-c', 'c');
  const roomFor = socket => [...rooms.values()].find(r => r.players.some(p => p.id === socket.data.playerId && p.socketId === socket.id));
  const hostRoom = socket => room.hostPlayerId === socket.data.playerId && room.hostSocketId === socket.id ? room : null;
  registerVoice(io, app, rooms, roomFor, hostRoom, { roleGroup: role => role === 'امپراتور' || role === 'استراتژیست' ? 'mafia' : 'citizen' });
  for (const socket of [host, mafia, citizen]) ioHandlers.connection(socket);
  return { room, host, mafia, citizen, handlers, emitted };
}

test('night voice is restricted to mafia faction', () => {
  const f = fixture();
  let citizenResult;
  f.handlers['sock-c:voice:join']({}, result => { citizenResult = result; });
  assert.equal(citizenResult.ok, false);
  assert.equal(f.citizen.data.voiceChannel, null);
  let mafiaResult;
  f.handlers['sock-m:voice:join']({}, result => { mafiaResult = result; });
  assert.equal(mafiaResult.ok, true);
  assert.equal(mafiaResult.audience, 'mafia');
});

test('signaling cannot cross the night faction boundary', () => {
  const f = fixture();
  f.handlers['sock-m:voice:join']({}, () => {});
  let result;
  f.handlers['sock-m:voice:signal']({ targetPlayerId: 'c', signal: { type: 'offer', sdp: { type: 'offer', sdp: 'x' } } }, value => { result = value; });
  assert.equal(result.ok, false);
});

test('host can change narrator mode and announce only in narrator-enabled modes', () => {
  const f = fixture();
  let changed;
  f.handlers['sock-h:voice:set-mode']({ mode: 'narrator' }, value => { changed = value; });
  assert.equal(changed.ok, true);
  assert.equal(f.room.narratorMode, 'narrator');
  let announced;
  f.handlers['sock-h:voice:announce']({ text: 'شب آغاز شد' }, value => { announced = value; });
  assert.equal(announced.ok, true);
  assert.ok(f.emitted.some(item => item.event === 'voice:narrator-line' && item.payload.text === 'شب آغاز شد'));
  f.handlers['sock-h:voice:set-mode']({ mode: 'host' }, () => {});
  let blocked;
  f.handlers['sock-h:voice:announce']({ text: 'این نباید پخش شود' }, value => { blocked = value; });
  assert.equal(blocked.ok, false);
});

test('citizen ability voice is a private host-and-active-player channel', () => {
  const f = fixture();
  f.room.gameStage = 'citizenAbilities';
  f.room.turnPlayerId = 'c';
  let citizenResult;
  f.handlers['sock-c:voice:join']({}, value => { citizenResult = value; });
  assert.equal(citizenResult.ok, true);
  assert.equal(citizenResult.audience, 'citizen-host:c');
  let mafiaResult;
  f.handlers['sock-m:voice:join']({}, value => { mafiaResult = value; });
  assert.equal(mafiaResult.ok, false);
});

test('mafia planning voice is private to mafia and host', () => {
  const f = fixture();
  f.room.gameStage = 'mafiaTalk';
  let mafiaResult;
  f.handlers['sock-m:voice:join']({}, value => { mafiaResult = value; });
  assert.equal(mafiaResult.ok, true);
  assert.equal(mafiaResult.audience, 'mafia');
  let citizenResult;
  f.handlers['sock-c:voice:join']({}, value => { citizenResult = value; });
  assert.equal(citizenResult.ok, false);
});

test('public speaking turns limit microphone permission to selected player and host', () => {
  const f = fixture();
  f.room.gameStage = 'day1';
  f.room.speakerTurnId = 'c';
  f.handlers['sock-c:voice:mic-request']({}, value => { assert.equal(value.allowed, true); });
  f.handlers['sock-m:voice:mic-request']({}, value => { assert.equal(value.allowed, false); });
  f.handlers['sock-h:voice:mic-request']({}, value => { assert.equal(value.allowed, true); });
});
