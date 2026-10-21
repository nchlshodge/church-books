const test = require('node:test'), assert = require('node:assert'), crypto = require('node:crypto');
const C = require('../chain.js');

test('sha256 matches the standard one, including non-English text', () => {
  for (const s of ['', 'abc', 'Kingdom Builders · 50% → Missions ✓', 'x'.repeat(1000)])
    assert.strictEqual(C.sha256(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
});

test('an edited entry breaks the chain from that point on', () => {
  const mk = (id, memo, amt) => ({ id, date: '2026-10-01', memo, source: null, postedAt: '2026-10-01T12:00:00Z', postedBy: 'Nick', reverses: null,
    lines: [{ account: '1000', fund: 'op', debit: amt, credit: 0 }, { account: '4000', fund: 'op', debit: 0, credit: amt }] });
  const entries = []; let prev = '';
  [['JE-00001', 'Gifts', 5000], ['JE-00002', 'More gifts', 7000], ['JE-00003', 'Even more', 100]].forEach(([id, m, a]) => { const e = mk(id, m, a); e.hash = C.hashEntry(prev, e); prev = e.hash; entries.push(e); });
  assert.deepStrictEqual(C.verify(entries), { ok: true, brokenAt: null, lastHash: prev });
  const tampered = JSON.parse(JSON.stringify(entries)); tampered[1].lines[0].debit = 70000; tampered[1].lines[1].credit = 70000;
  assert.strictEqual(C.verify(tampered).brokenAt, 'JE-00002');
  // key order doesn't matter, content does
  assert.strictEqual(C.canon({ b: 1, a: [1, { d: 2, c: null }] }), '{"a":[1,{"c":null,"d":2}],"b":1}');
});
