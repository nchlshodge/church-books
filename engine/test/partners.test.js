const test = require('node:test'), assert = require('node:assert');
const P = require('../partners.js');

test('the rubric: 8 questions, 0–3 each, banded Low / Average / High', () => {
  assert.strictEqual(P.RUBRIC.length, 8);
  assert.deepStrictEqual(P.score({ relationship: 3, vision: 3, affiliation: 3, years: 3, involvement: 2, field: 2, focus: 3, intangible: 3 }), { total: 22, answered: 8, complete: true, band: 'High' });
  assert.deepStrictEqual(P.score({ relationship: 1, vision: 2, affiliation: 1, years: 2 }), { total: 6, answered: 4, complete: false, band: 'Low' });
  assert.strictEqual(P.score({ relationship: 9, vision: 2 }).total, 2);   // out-of-range answers are ignored
  assert.deepStrictEqual([P.band(8), P.band(9), P.band(16), P.band(17)], ['Low', 'Average', 'Average', 'High']);
});

test('Local / Global / Future against their target ranges', () => {
  const mix = P.categoryMix([{ fund: 'mis', pct: 50 }, { fund: 'bld', pct: 35 }, { fund: 'prj', pct: 15 }], { mis: 'global', bld: 'local', prj: 'future' });
  assert.deepStrictEqual(mix.map(m => [m.cat, m.pct, m.status]), [['local', 35, 'above'], ['global', 50, 'within'], ['future', 15, 'within']]);
});

test('what each partner should have by now, and the totals by category', () => {
  const today = '2026-10-18';
  assert.strictEqual(P.expectedByNow({ annual: 2400000, schedule: 'monthly' }, today), 2000000);
  assert.strictEqual(P.expectedByNow({ annual: 1200000, schedule: 'quarterly' }, today), 1200000);
  assert.strictEqual(P.expectedByNow({ annual: 500000, schedule: 'once', dueBy: '2026-11-15' }, today), 0);
  assert.deepStrictEqual(P.standing({ annual: 2400000, schedule: 'monthly', paid: 1800000 }, today), { expected: 2000000, due: 200000, left: 600000, pct: 0.75 });
  const t = P.byCategory([{ status: 'Approved', category: 'global', annual: 100, paid: 60 }, { status: 'Approved', category: 'local', annual: 50, paid: 40 }, { status: 'Requested', category: 'global', annual: 999, paid: 0 }]);
  assert.deepStrictEqual([t.global.approved, t.global.paid, t.local.share, t.future.partners], [100, 60, 0.4, 0]);
});

test('tithe on the tithe: a share of last month\'s tithes, every month from the start', () => {
  assert.deepStrictEqual(P.titheMonths({ start: '2026-10', today: '2026-10-18', day: 5 }), [{ month: '2026-10', basis: '2026-09', payOn: '2026-10-05', due: true }]);
  const m = P.titheMonths({ start: '2026-11', today: '2027-01-03', day: 5 });
  assert.deepStrictEqual(m.map(x => [x.month, x.basis, x.due]), [['2026-11', '2026-10', true], ['2026-12', '2026-11', true], ['2027-01', '2026-12', false]]);
  assert.strictEqual(P.titheShare(3590000, 10), 359000);
  assert.strictEqual(P.titheShare(-5, 10), 0);
});
