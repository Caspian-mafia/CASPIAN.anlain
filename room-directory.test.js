'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { listPublicRooms } = require('./room-directory');

function room(code, overrides = {}) {
  return {
    code, visibility: 'public', roomOpen: true, started: false, finished: false,
    phase: 'لابی', hostMode: 'player', createdAt: '2026-11-26T10:00:00.000Z',
    scenario: { id: 'empire-of-shadows', name: 'امپراتوری سایه‌ها', players: { min: 16, max: 16 } },
    players: [{ id: 'p1' }, { id: 'p2' }],
    ...overrides
  };
}

test('فهرست اتاق فقط اتاق عمومیِ باز و در انتظار را نشان می‌دهد', () => {
  const rooms = new Map([
    ['A1', room('A1')],
    ['B2', room('B2', { visibility: 'private' })],
    ['C3', room('C3', { started: true })],
    ['D4', room('D4', { roomOpen: false })],
    ['E5', room('E5', { finished: true })]
  ]);
  const result = listPublicRooms(rooms);
  assert.deepEqual(result.map(item => item.code), ['A1']);
});

test('فیلتر سناریو و سقف تعداد اعمال می‌شود', () => {
  const rooms = new Map([
    ['A1', room('A1')],
    ['B2', room('B2', { scenario: { id: 'classic', name: 'کلاسیک', players: { min: 7, max: 16 } } })]
  ]);
  assert.deepEqual(listPublicRooms(rooms, { scenarioId: 'classic' }).map(item => item.code), ['B2']);
  assert.equal(listPublicRooms(rooms, { limit: 1 }).length, 1);
});

test('خروجی عمومی هیچ توکن یا نقش مخفی بازیکن را افشا نمی‌کند', () => {
  const rooms = new Map([['A1', room('A1', { hostKey: 'secret', players: [{ id: 'p1', role: 'پدرخوانده', tokenHash: 'secret' }] })]]);
  const item = listPublicRooms(rooms)[0];
  assert.equal(Object.hasOwn(item, 'hostKey'), false);
  assert.equal(Object.hasOwn(item, 'playersList'), false);
  assert.equal(JSON.stringify(item).includes('پدرخوانده'), false);
});
