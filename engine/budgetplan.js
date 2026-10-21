// Church Books engine — planning next year's budget: spreading amounts over the months and
// checking that each fund's planned spending fits what's expected to come in. Whole cents.
//
// A spread: { type: 'even' }                       — the same every month
//           { type: 'month', month: 0–11 }         — all in one month (an event)
//           { type: 'quarterly' }                  — four equal amounts: Jan, Apr, Jul, Oct
//           { type: 'custom', weights: [12 numbers] } — any pattern (e.g. percentages)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksBudgetPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);

  function weightsOf(spec) {
    const t = (spec && spec.type) || 'even';
    if (t === 'even') return Array(12).fill(1);
    if (t === 'month') { const w = Array(12).fill(0); w[Math.max(0, Math.min(11, spec.month | 0))] = 1; return w; }
    if (t === 'quarterly') return [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];
    if (t === 'custom') {
      const w = (spec.weights || []).slice(0, 12).map(x => Math.max(0, +x || 0));
      while (w.length < 12) w.push(0);
      if (!sum(w)) throw new Error('A custom spread needs at least one month above zero');
      return w;
    }
    throw new Error(`Unknown spread: ${t}`);
  }

  // Twelve monthly amounts that add back to the exact total (leftover cents go to the biggest months first)
  function spread(amount, spec) {
    const w = weightsOf(spec), total = sum(w);
    const raw = w.map(x => amount * x / total), out = raw.map(Math.floor);
    let left = amount - sum(out);
    const order = raw.map((x, i) => [x - Math.floor(x), w[i], i]).sort((a, b) => b[0] - a[0] || b[1] - a[1] || a[2] - b[2]);
    for (let k = 0; left > 0 && k < order.length; k++) { if (w[order[k][2]]) { out[order[k][2]]++; left--; } if (k === order.length - 1 && left > 0) k = -1; }
    return out;
  }

  // lines: [{ name, fund, amount, parent?, spread }] — a line inside another (parent) is part of its budget, not extra.
  // incomeByFund: { fund: cents expected in }  ·  startByFund: { fund: cents on hand at the start }
  function check(lines, { incomeByFund = {}, startByFund = {}, funds = [] } = {}) {
    const top = lines.filter(l => !l.parent);
    const ids = funds.length ? funds : [...new Set([...top.map(l => l.fund), ...Object.keys(incomeByFund)])];
    const byFund = ids.map(fund => {
      const planned = sum(top.filter(l => l.fund === fund), l => l.amount), income = incomeByFund[fund] || 0, start = startByFund[fund] || 0;
      return { fund, income, planned, start, difference: income - planned, endsWith: start + income - planned, usesReserves: planned > income };
    });
    const inside = lines.filter(l => l.parent).reduce((m, l) => { m[l.parent] = (m[l.parent] || 0) + l.amount; return m; }, {});
    const overParent = top.filter(l => (inside[l.name] || 0) > l.amount).map(l => l.name);
    // A ministry's months: its own part spread its way, plus each project inside it spread the project's way
    // (so Fall Festival lands in October even though it's inside Outreach Ministry).
    const lineMonths = l => {
      const kids = lines.filter(k => k.parent === l.name), own = spread(Math.max(0, l.amount - sum(kids, k => k.amount)), l.spread);
      kids.forEach(k => spread(k.amount, k.spread).forEach((v, i) => { own[i] += v; }));
      return own;
    };
    const perLine = new Map(top.map(l => [l, lineMonths(l)]));
    const months = Array.from({ length: 12 }, (_, m) => ids.reduce((o, fund) => { o[fund] = sum(top.filter(l => l.fund === fund), l => perLine.get(l)[m]); return o; }, {}));
    return { byFund, overParent, months, planned: sum(byFund, f => f.planned), income: sum(byFund, f => f.income),
      balanced: byFund.every(f => !f.usesReserves) && !overParent.length };
  }

  return { spread, check, weightsOf };
});
