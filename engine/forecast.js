// Church Books engine — cash-flow forecast. Given what each fund has now and a list of money
// expected in and out (by period), it works out each fund's cash at the end of every period and
// warns when a fund runs out or drops below its cushion. Whole cents; signed amounts (in > 0, out < 0).
//
// periods: ['Rest of Oct', 'Nov', …]          start: { fund: cents }
// flows:   [{ period: index, fund, amount, kind, label }]
// cushion: { fund: cents }                    — warn below this (optional per fund)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksForecast = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function run({ periods, start = {}, flows = [], cushion = {}, funds }) {
    const ids = funds || [...new Set([...Object.keys(start), ...flows.map(f => f.fund)])];
    flows.forEach((f, i) => {
      if (!Number.isInteger(f.amount)) throw new Error(`Flow ${i + 1}: amounts are whole cents`);
      if (!(f.period >= 0 && f.period < periods.length)) throw new Error(`Flow ${i + 1}: no period ${f.period}`);
    });
    const kinds = [...new Set(flows.map(f => f.kind))];
    const byFund = ids.map(fund => {
      let bal = start[fund] || 0;
      const rows = periods.map((label, p) => {
        const here = flows.filter(f => f.fund === fund && f.period === p);
        const byKind = Object.fromEntries(kinds.map(k => [k, here.filter(f => f.kind === k).reduce((s, f) => s + f.amount, 0)]));
        const inflow = here.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0), outflow = here.filter(f => f.amount < 0).reduce((s, f) => s + f.amount, 0);
        const begin = bal; bal += inflow + outflow;
        return { period: p, label, begin, inflow, outflow, byKind, end: bal };
      });
      const low = rows.reduce((m, r) => r.end < m.end ? r : m, { end: start[fund] || 0, label: 'now', period: -1 });
      return { fund, start: start[fund] || 0, rows, end: bal, low };
    });
    const warnings = [];
    byFund.forEach(f => {
      const firstNeg = f.rows.find(r => r.end < 0);
      if (firstNeg) warnings.push({ fund: f.fund, kind: 'negative', period: firstNeg.period, label: firstNeg.label, amount: firstNeg.end });
      else if (cushion[f.fund] != null) { const under = f.rows.find(r => r.end < cushion[f.fund]); if (under) warnings.push({ fund: f.fund, kind: 'cushion', period: under.period, label: under.label, amount: under.end, cushion: cushion[f.fund] }); }
    });
    const total = periods.map((label, p) => {
      const rs = byFund.map(f => f.rows[p]);
      return { period: p, label, begin: rs.reduce((s, r) => s + r.begin, 0), inflow: rs.reduce((s, r) => s + r.inflow, 0), outflow: rs.reduce((s, r) => s + r.outflow, 0), end: rs.reduce((s, r) => s + r.end, 0),
        byKind: Object.fromEntries(kinds.map(k => [k, rs.reduce((s, r) => s + (r.byKind[k] || 0), 0)])) };
    });
    return { byFund, total, kinds, warnings };
  }
  // Giving that doesn't arrive evenly — e.g. Kingdom Builders, with most of it in Oct–Dec. Works out each
  // period's expected giving from a 12-month pattern (weights, January first).
  //   periods: [{ y, m (0–11), share (of the month still ahead) }] · year: this year · givenSoFar (cents, this year)
  //   elapsed: months of this year gone (e.g. 9.6) · target: what the year should come to (a goal or commitments),
  //   or null to go by this year's pace. Next year's months use the same year total.
  // The pattern decides how much of the year is behind us: by the pace, the year = given so far ÷ that share;
  // with a target, what's left of it (never below zero) is spread over the rest of the year.
  function seasonalGiving({ periods, year, pattern, givenSoFar, elapsed, target = null, growth = 0 }) {
    const W = pattern.reduce((a, b) => a + b, 0) || 1, full = Math.floor(elapsed);
    const elapsedW = pattern.slice(0, full).reduce((a, b) => a + b, 0) + (pattern[full] || 0) * (elapsed - full);
    const paceYear = elapsedW ? givenSoFar / (elapsedW / W) : 0;
    const yearTotal = target != null ? Math.max(target, givenSoFar) : paceYear;
    const left = Math.max(0, yearTotal - givenSoFar), thisW = periods.filter(p => p.y === year).reduce((s, p) => s + pattern[p.m] * p.share, 0) || 1;
    const out = periods.map(p => p.y === year ? left * pattern[p.m] * p.share / thisW : yearTotal * (1 + growth) * pattern[p.m] / W * p.share);
    return { amounts: out.map(Math.round), yearTotal: Math.round(yearTotal), paceYear: Math.round(paceYear), shareBehind: elapsedW / W };
  }
  return { run, seasonalGiving };
});
