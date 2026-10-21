const test = require('node:test'), assert = require('node:assert');
const S = require('../subscriptions.js'), Rep = require('../reports.js'), Setup = require('../setup.js');

test('subscriptions: yearly cost by budget, renewals, price changes, cycle guess', () => {
  const subs = [{ name: 'Planning Center', cost: 28900, cycle: 'mo', next: '2026-11-01', budget: 'Everyday ministry' },
    { name: 'CCLI', cost: 46800, cycle: 'yr', next: '2026-10-30', budget: 'Everyday ministry' }, { name: 'MomCo dues', cost: 45000, cycle: 'yr', next: '2027-02-01', budget: 'MomCo' },
    { name: 'Old app', cost: 999, cycle: 'mo', next: '2026-11-01', budget: 'Everyday ministry', active: false }];
  const b = S.byBudget(subs);
  assert.deepStrictEqual([b['Everyday ministry'].annual, b['Everyday ministry'].count, b.MomCo.annual], [28900 * 12 + 46800, 2, 45000]);
  assert.strictEqual(S.nextAfter({ next: '2026-01-31', cycle: 'mo' }, '2026-10-18'), '2026-10-31');
  assert.strictEqual(S.nextAfter({ next: '2026-03-04', cycle: 'yr' }, '2026-10-18'), '2027-03-04');
  assert.deepStrictEqual(S.renewals(subs, '2026-10-18', 20).map(x => x.s.name), ['CCLI', 'Planning Center']);
  assert.deepStrictEqual(S.priceCheck(subs[0], [{ date: '2026-09-17', amount: 28900 }, { date: '2026-10-17', amount: 31900 }]), { changed: true, from: 28900, to: 31900, on: '2026-10-17', up: true });
  assert.strictEqual(S.priceCheck(subs[0], [{ date: '2026-10-17', amount: 28900 }]).changed, false);
  assert.deepStrictEqual([S.guessCycle([{ date: '2026-01-05' }]), S.guessCycle([{ date: '2026-01-05' }, { date: '2026-02-05' }]), S.guessCycle([{ date: '2025-03-04' }, { date: '2026-03-04' }])], ['mo', 'mo', 'yr']);
});

test('a ministry report: spending and income for a budget and the projects inside it', () => {
  const L = Setup.createBooks(require('../../churches/grace/setup.js'));
  const pay = (date, amount, expense, project, party) => L.post({ date, memo: `${party} · ${project}`, lines: [{ account: expense, fund: 'general', debit: amount, project, party }, { account: '1000', fund: 'general', credit: amount, party }] }, 't');
  pay('2026-09-05', 10000, '5000', 'Youth', 'Costco'); pay('2026-10-02', 5000, '5010', 'Camp', 'Camp Pinewood'); pay('2026-10-03', 2000, '5000', 'Other', 'Target');
  L.post({ date: '2026-10-04', memo: 'Camp sign-ups', lines: [{ account: '1000', fund: 'general', debit: 3000 }, { account: '4000', fund: 'general', credit: 3000, project: 'Camp' }] }, 't');
  const r = Rep.projectReport(L, { projects: ['Youth', 'Camp'] });
  assert.deepStrictEqual([r.spent, r.income, r.net, r.lines.length], [15000, 3000, 12000, 3]);
  assert.deepStrictEqual(r.byPayee.map(x => x.key), ['Costco', 'Camp Pinewood']);
  assert.deepStrictEqual(r.byMonth.map(x => [x.key, x.amount]), [['2026-09', 10000], ['2026-10', 5000]]);
  assert.strictEqual(Rep.projectReport(L, { projects: ['Youth', 'Camp'], from: '2026-10-01', to: '2026-10-31' }).spent, 5000);
});
