const test = require('node:test'), assert = require('node:assert');
const A = require('../autopost.js'), PCO = require('../pco.js');
const known = new Set(['tithe', 'missions', 'legacy']);

test('business days and weeks', () => {
  assert.deepStrictEqual([A.businessDays('2026-10-16', '2026-10-19'), A.businessDays('2026-10-16', '2026-10-18'), A.businessDays('2026-10-13', '2026-10-16')], [1, 0, 3]);
  assert.deepStrictEqual([A.weekOf('2026-10-18'), A.weekOf('2026-10-12'), A.weekOf('2026-10-14')], ['2026-10-12', '2026-10-12', '2026-10-12']);
});

test('a payout records itself only when everything agrees', () => {
  const ok = { split: { tithe: 486000, missions: 123000 }, fee: 7703 };
  assert.deepStrictEqual(A.checkPayout(ok, { known }), { ok: true, reasons: [], gross: 609000, net: 601297 });
  assert.match(A.checkPayout({ ...ok, split: { tithe: 100, camp: 50 } }, { known }).reasons[0], /camp/);
  assert.match(A.checkPayout({ ...ok, net: 590000 }, { known }).reasons[0], /refund/);
});

test('matching bank deposits: one payout, or two days sent together; waiting; needs a look', () => {
  const payouts = [
    { id: 'a', date: '2026-10-13', split: { tithe: 100000 }, fee: 3000 },          // 970.00 — its own deposit
    { id: 'b', date: '2026-10-14', split: { tithe: 50000 }, fee: 1500 },           // 485.00 ┐ sent together
    { id: 'c', date: '2026-10-15', split: { missions: 20000 }, fee: 600 },         // 194.00 ┘ = 679.00
    { id: 'd', date: '2026-10-16', split: { tithe: 30000 }, fee: 900 },            // no deposit yet — waiting
    { id: 'e', date: '2026-10-08', split: { legacy: 40000 }, fee: 1200 },          // no deposit after a week — look
    { id: 'f', date: '2026-10-16', split: { tithe: 10000 }, fee: 300, net: 9000 }, // amounts disagree — look
  ];
  const lines = [{ id: 'L1', date: '2026-10-15', amount: 97000 }, { id: 'L2', date: '2026-10-19', amount: 67900 }, { id: 'L3', date: '2026-10-19', amount: 12345 }];
  const r = Object.fromEntries(A.classify(payouts, lines, { known, today: '2026-10-19' }).map(x => [x.id, x]));
  assert.deepStrictEqual([r.a.status, r.a.line.id, r.b.status, r.c.status, r.b.line.id, r.b.together], ['ready', 'L1', 'ready', 'ready', 'L2', ['b', 'c']]);
  assert.deepStrictEqual([r.d.status, r.d.expectBy], ['waiting', '2026-10-21']);
  assert.deepStrictEqual([r.e.status, r.f.status], ['look', 'look']);
  assert.match(r.e.reasons[0], /No bank deposit/);
  const w = A.weeks([{ date: '2026-10-13', byFund: { gen: 970 } }, { date: '2026-10-15', byFund: { gen: 485, mis: 194 } }, { date: '2026-10-06', byFund: { gen: 10 } }]);
  assert.deepStrictEqual(w.map(x => [x.week, x.count, x.total]), [['2026-10-12', 2, 1649], ['2026-10-05', 1, 10]]);
});

test('Planning Center donations → one day of giving', () => {
  const funds = { 'General Fund': 'tithe', Missions: 'missions' };
  const donations = [
    { id: 1, amount_cents: 10000, fee_cents: -320, completed_at: '2026-10-17T14:02:00Z', payment_method: 'card', designations: [{ fund: 'General Fund', amount_cents: 10000 }] },
    { id: 2, amount_cents: 5000, fee_cents: -60, completed_at: '2026-10-17T20:10:00Z', payment_method: 'ach', designations: [{ fund: 'General Fund', amount_cents: 4000 }, { fund: 'Missions', amount_cents: 1000 }] },
    { id: 3, amount_cents: 2500, fee_cents: -103, completed_at: '2026-10-17T21:00:00Z', payment_method: 'card', refunded: true, designations: [{ fund: 'Missions', amount_cents: 2500 }] },
    { id: 4, amount_cents: 2000, fee_cents: 0, completed_at: '2026-10-17T15:00:00Z', payment_method: 'cash', designations: [{ fund: 'General Fund', amount_cents: 2000 }] },
    { id: 5, amount_cents: 700, fee_cents: -50, completed_at: '2026-10-18T13:00:00Z', payment_method: 'card', designations: [{ fund: 'Youth Camp', amount_cents: 700 }] },
  ];
  const d = PCO.days(donations, { funds });
  assert.deepStrictEqual(d[0], { date: '2026-10-17', gifts: 2, split: { tithe: 14000, missions: 1000 }, fee: 380, unknownFunds: [], ids: [1, 2], net: 14620, source: { type: 'pco_day', id: '2026-10-17' } });
  assert.deepStrictEqual([d[1].unknownFunds, A.checkPayout(d[1], { known }).ok], [['Youth Camp'], false]);   // a new fund → needs a look
});
