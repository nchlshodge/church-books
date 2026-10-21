// Church Books engine — yearly commitment campaigns (e.g. Kingdom Builders: Plan / Vision / Dream).
// Commitments live in the giving system (who committed what is private); this adds them up
// against what's actually been given, which comes from the books. All amounts are whole cents.
//
// campaign:    { levels: ['Plan', 'Vision', 'Dream'], goal, commitments: [{ household, amounts: [plan, vision, dream], given }] }
// givenTotal:  everything given to this giving fund this year (from the books), committed or not
// yearDone:    share of the campaign year that has passed (0–1)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksCampaigns = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  function summarize(c, { givenTotal = 0, yearDone = 0 } = {}) {
    const levels = c.levels && c.levels.length ? c.levels : ['Commitment'];
    const rows = (c.commitments || []).map(r => {
      const base = r.amounts[0] || 0, given = r.given || 0;
      const status = given >= base ? 'reached' : given >= Math.round(base * yearDone) ? 'onPace' : 'behind';
      return { ...r, base, given, pct: base ? given / base : 0, status };
    });
    const totals = levels.map((name, i) => ({ name, amount: sum(rows, r => r.amounts[i] || 0) }));
    const committedGiven = sum(rows, r => r.given);
    const planTotal = totals[0].amount;
    const expectedByNow = Math.round(planTotal * yearDone);
    return {
      levels: totals, goal: c.goal || 0, households: rows.length,
      given: givenTotal, committedGiven, otherGiven: Math.max(0, givenTotal - committedGiven),
      planTotal, expectedByNow, pace: committedGiven - expectedByNow,
      projected: Math.round(givenTotal / (yearDone || 1)),            // where the year lands at this rate
      counts: { reached: rows.filter(r => r.status === 'reached').length, onPace: rows.filter(r => r.status === 'onPace').length, behind: rows.filter(r => r.status === 'behind').length },
      rows,
    };
  }
  return { summarize };
});
