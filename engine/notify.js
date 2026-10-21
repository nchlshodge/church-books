// Church Books engine — deciding which alerts should go out now. Each alert has a key, and a key
// that's already in `sent` never goes out again (so a budget at 80% isn't announced every day).
// Pure: it only returns what to send; sending is someone else's job.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksNotify = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

  // budgets: [{ name, lead, budget, spent, held, event? }] (cents) · thresholds: percents, e.g. [75, 100]
  function budgetAlerts(budgets, { thresholds = [75, 100], yearDone = 0, fastBy = 0.1, sent = new Set() } = {}) {
    const out = [];
    budgets.forEach(b => {
      if (!b.budget) return;
      const used = (b.spent + (b.held || 0)) / b.budget;
      const hit = thresholds.filter(t => used * 100 >= t).pop();
      if (hit != null) { const key = `budget:${b.name}:${hit}`; if (!sent.has(key)) out.push({ key, kind: 'budget', level: hit, budget: b, used }); }
      if (!b.event && hit == null && used > yearDone + fastBy) { const key = `budget:${b.name}:fast`; if (!sent.has(key)) out.push({ key, kind: 'budgetFast', budget: b, used }); }
    });
    return out;
  }
  // bills: [{ id, due, status, amount, vendor }] · before: days ahead to remind
  function billReminders(bills, { today, before = [3], sent = new Set() }) {
    const out = [];
    bills.filter(b => b.status !== 'Paid' && b.status !== 'To approve').forEach(b => {
      const d = days(today, b.due);
      if (d < 0) { const key = `bill:${b.id}:late`; if (!sent.has(key)) out.push({ key, kind: 'billLate', bill: b, days: -d }); return; }
      const win = before.filter(n => d <= n).sort((a, c) => a - c)[0];
      if (win != null) { const key = `bill:${b.id}:${win}`; if (!sent.has(key)) out.push({ key, kind: 'billSoon', bill: b, days: d }); }
    });
    return out;
  }
  // cards: [{ name, last4, bal, limit, alertAt }]
  const cardAlerts = (cards, { sent = new Set() } = {}) => cards.filter(c => c.limit && c.bal / c.limit * 100 >= c.alertAt)
    .map(c => ({ key: `card:${c.last4}:${c.alertAt}`, kind: 'card', card: c })).filter(a => !sent.has(a.key));
  // A weekly message: due when the week's send time has passed and it hasn't gone out this week.
  // when: { day: 0–6 (Sun–Sat), hour } · lastSent: ISO date-time or null · now: ISO date-time
  function weeklyDue(when, lastSent, now) {
    const n = new Date(now), slot = new Date(n);
    slot.setHours(when.hour || 0, 0, 0, 0); slot.setDate(slot.getDate() - ((slot.getDay() - when.day + 7) % 7));
    if (slot > n) slot.setDate(slot.getDate() - 7);
    const next = new Date(slot); next.setDate(next.getDate() + 7);
    return { due: !lastSent || new Date(lastSent) < slot, slot: slot.toISOString(), next: next.toISOString() };
  }
  return { budgetAlerts, billReminders, cardAlerts, weeklyDue };
});
