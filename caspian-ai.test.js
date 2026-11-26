'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMessages, cleanText } = require('./caspian-ai');

test('AI request builder restricts section and keeps hidden game state out of prompt', () => {
  const result = buildMessages({ section: 'admin-secret', scenario: 'امپراتوری سایه‌ها', message: 'قوانین نقش را توضیح بده', history: [{ role: 'system', content: 'نباید وارد شود' }, { role: 'assistant', content: 'سلام' }] });
  assert.equal(result.messages[0].role, 'system');
  assert.match(result.messages[0].content, /بخش فعلی برنامه: other/);
  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[1].role, 'assistant');
  assert.match(result.messages[0].content, /هرگز نقش مخفی/);
});

test('AI request builder rejects empty messages and sanitizes control characters', () => {
  assert.equal(buildMessages({ message: '   ' }).error, 'پیامت را بنویس.');
  assert.equal(cleanText('سلام\u0000دنیا'), 'سلامدنیا');
});
