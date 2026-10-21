// Church Books engine — subscriptions: anything the church pays for on a cycle (software, dues, curriculum).
// Knowing them helps set budgets (they're a floor nobody gets to cut mid-year) and catch renewals and price
// rises. Pure functions; amounts are whole cents, dates 'YYYY-MM-DD'.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksSubscriptions = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PER_YEAR = { mo: 12, qtr: 4, yr: 1 };
  const MONTHS = { mo: 1, qtr: 3, yr: 12 };
  const annual = s => s.cost * (PER_YEAR[s.cycle] || 12);
  // The next renewal after a date
  function nextAfter(s, from) {
    let [y, m, d] = s.next.split('-').map(Number);
    const step = MONTHS[s.cycle] || 1, key = () => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    while (key() <= from) { m += step; while (m > 12) { m -= 12; y++; } }
    return key();
  }
  // Yearly cost by budget: { budget: { annual, count, names } }
  function byBudget(subs) {
    const out = {};
    subs.filter(s => s.active !== false).forEach(s => { const k = s.budget || '(no budget)', o = out[k] = out[k] || { budget: k, annual: 0, count: 0, names: [] }; o.annual += annual(s); o.count++; o.names.push(s.name); });
    return out;
  }
  // Renewals in the next n days
  const renewals = (subs, today, days) => { const end = new Date(today + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate() + days); const e = end.toISOString().slice(0, 10);
    return subs.filter(s => s.active !== false).map(s => ({ s, on: nextAfter(s, new Date(new Date(today + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10)) })).filter(x => x.on <= e).sort((a, b) => a.on < b.on ? -1 : 1); };
  // Did the price change? charges: [{ date, amount }] for this subscription
  function priceCheck(s, charges) {
    const last = charges.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
    return !last || last.amount === s.cost ? { changed: false } : { changed: true, from: s.cost, to: last.amount, on: last.date, up: last.amount > s.cost };
  }
  // A guess at the cycle from a charge amount and earlier charges from the same payee
  function guessCycle(charges) {
    if (charges.length < 2) return 'mo';
    const d = charges.map(c => Date.parse(c.date)).sort((a, b) => a - b), gap = (d[d.length - 1] - d[0]) / (d.length - 1) / 86400000;
    return gap > 200 ? 'yr' : gap > 60 ? 'qtr' : 'mo';
  }
  return { PER_YEAR, annual, nextAfter, byBudget, renewals, priceCheck, guessCycle };
});
