const test = require('node:test');
const assert = require('node:assert');
const N = require('../notify.js');

test('budget alerts at 75% and 100% go out once each; budgets spending faster than the year are flagged', () => {
  const budgets = [{ name: 'Fall Festival', lead: 'dana', budget: 150000, spent: 120000, held: 0, event: true },
    { name: 'Youth Ministry', lead: 'sam', budget: 1200000, spent: 1250000 }, { name: 'Office', lead: 'dana', budget: 100000, spent: 70000 }];
  const a = N.budgetAlerts(budgets, { yearDone: 0.5 });
  assert.deepStrictEqual(a.map(x => x.key), ['budget:Fall Festival:75', 'budget:Youth Ministry:100', 'budget:Office:fast']);
  const again = N.budgetAlerts(budgets, { yearDone: 0.5, sent: new Set(a.map(x => x.key)) });
  assert.deepStrictEqual(again, []);
  assert.strictEqual(N.budgetAlerts([{ name: 'X', budget: 100, spent: 60, held: 20 }], {})[0].level, 75);   // held money counts
});

test('bill reminders: a few days before, and once when late; bills waiting for approval or paid are left alone', () => {
  const bills = [{ id: 'a', due: '2026-10-20', status: 'Approved' }, { id: 'b', due: '2026-10-15', status: 'Approved' },
    { id: 'c', due: '2026-11-11', status: 'Approved' }, { id: 'd', due: '2026-10-19', status: 'To approve' }, { id: 'e', due: '2026-10-10', status: 'Paid' }];
  const r = N.billReminders(bills, { today: '2026-10-18', before: [3] });
  assert.deepStrictEqual(r.map(x => [x.key, x.days]), [['bill:a:3', 2], ['bill:b:late', 3]]);
  assert.deepStrictEqual(N.billReminders(bills, { today: '2026-10-18', before: [3], sent: new Set(['bill:a:3', 'bill:b:late']) }), []);
});

test('card alerts and the weekly schedule', () => {
  assert.deepStrictEqual(N.cardAlerts([{ last4: '3307', bal: 2200, limit: 2500, alertAt: 80 }, { last4: '1104', bal: 100, limit: 15000, alertAt: 80 }]).map(x => x.key), ['card:3307:80']);
  const mon7 = { day: 1, hour: 7 };
  const w = N.weeklyDue(mon7, '2026-10-12T07:00:00', '2026-10-18T12:00:00');           // sent last Monday, now Sunday
  assert.strictEqual(w.due, false);
  assert.strictEqual(new Date(w.next).getDate(), 19);                                   // next: Monday the 19th
  assert.strictEqual(N.weeklyDue(mon7, '2026-10-12T07:00:00', '2026-10-19T08:00:00').due, true);
  assert.strictEqual(N.weeklyDue(mon7, null, '2026-10-19T06:00:00').due, true);         // never sent → send the last slot
});
