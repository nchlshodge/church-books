const test = require('node:test'), assert = require('node:assert');
const A = require('../attachments.js');
const f = (name, extra = {}) => ({ name, size: 2048, by: 'Nick', at: '2026-10-19T09:00:00', ...extra });

test('adding, linking and finding files', () => {
  const s = A.create();
  const r = s.add(f('Costco receipt.jpg', { hash: 'abc' }), { kind: 'expense', id: 'x2', role: 'receipt' });
  assert.equal(r.id, 'F1'); assert.equal(r.type, 'Photo');
  assert.ok(s.has('expense', 'x2')); assert.ok(s.has('expense', 'x2', 'receipt')); assert.ok(!s.has('expense', 'x3'));
  s.link('F1', { kind: 'entry', id: 'JE-0007' }, 'Nick'); s.link('F1', { kind: 'entry', id: 'JE-0007' }, 'Nick');
  assert.equal(s.get('F1').links.length, 2);
  assert.equal(s.forItem('entry', 'JE-0007').length, 1);
  assert.equal(s.duplicateOf('abc').id, 'F1'); assert.equal(s.duplicateOf('zzz'), null);
  s.add(f('Invoice 1182.pdf', { note: 'October cleaning' }), { kind: 'bill', id: 'b1' });
  assert.deepEqual(s.search('cleaning').map(d => d.id), ['F2']);
  assert.deepEqual(s.search('', { kind: 'bill' }).map(d => d.id), ['F2']);
  assert.deepEqual(s.search('', { type: 'PDF' }).map(d => d.id), ['F2']);
});

test('what files are allowed', () => {
  const s = A.create({ maxBytes: 1000 });
  assert.throws(() => s.add(f('virus.exe'), { kind: 'bill', id: 1 }), /only photos/);
  assert.throws(() => s.add(f('big.pdf'), { kind: 'bill', id: 1 }), /too big/);
  assert.throws(() => s.add(f('a.pdf', { size: 0 }), { kind: 'bill', id: 1 }), /empty/);
  assert.throws(() => s.add(f('a.pdf', { size: 10 }), null), /attached to something/);
  assert.throws(() => s.add(f('a.pdf', { size: 10, by: '' }), { kind: 'bill', id: 1 }), /Who/);
  assert.equal(A.typeOf('Statement.PDF'), 'PDF'); assert.equal(A.typeOf('noext'), null);
});

test('removing keeps a record, and locked months keep their files', () => {
  const s = A.create();
  s.add(f('w9.pdf'), { kind: 'vendor', id: 'v1', role: 'w9' }); s.link('F1', { kind: 'bill', id: 'b1' }, 'Nick');
  assert.throws(() => s.remove('F1', { by: 'Nick' }), /why/);
  assert.throws(() => s.remove('F1', { by: 'Nick', reason: 'x', locked: true }), /locked month/);
  s.remove('F1', { link: { kind: 'bill', id: 'b1' }, by: 'Nick', reason: 'Wrong bill' });
  assert.ok(!s.has('bill', 'b1')); assert.ok(s.has('vendor', 'v1', 'w9'));
  s.remove('F1', { by: 'Nick', reason: 'Old form' });
  assert.equal(s.docs.length, 0); assert.equal(s.removed.length, 1);
  assert.deepEqual(s.log.map(l => l.action), ['add', 'link', 'unlink', 'remove']);
  const back = A.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(back.removed[0].removed.reason, 'Old form');
  assert.equal(back.add(f('next.pdf'), { kind: 'bill', id: 2 }).id, 'F2');
});

test('what still needs paperwork, and how long to keep it', () => {
  const s = A.create(); s.add(f('r.jpg'), { kind: 'expense', id: 'x1', role: 'receipt' });
  const items = [{ kind: 'expense', id: 'x1', amount: 5000, role: 'receipt' }, { kind: 'expense', id: 'x2', amount: 5000, role: 'receipt' }, { kind: 'expense', id: 'x3', amount: 500, role: 'receipt' }];
  assert.deepEqual(s.missing(items).map(i => i.id), ['x2', 'x3']);
  assert.deepEqual(s.missing(items, { over: 1000 }).map(i => i.id), ['x2']);
  assert.equal(A.keepUntil('2026-10-19'), '2033-12-31');
});
