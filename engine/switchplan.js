// Church Books engine — planning a switch to Kingdom Builders without breaking missions commitments.
// Projects the Missions fund month by month: today's model until the switch (the Missions offering in, today's
// missions spending out), then Missions' share of Kingdom Builders in, the same commitments out.
// Pure math; amounts are whole cents; months are 'YYYY-MM'.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksSwitchPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const idx = ym => { const [y, m] = ym.split('-').map(Number); return y * 12 + m - 1; };
  const ymOf = i => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`;
  // p: { from, switchAt, through, startBalance,
  //      before: { income: [12 monthly, Jan first], spending: [12] },            — today's missions offering and spending, by calendar month
  //      kbYear (Kingdom Builders giving per year), missionsPct, pattern: [12 weights],
  //      commitments (per month: partner support that must go out), projects (per month: missions projects and trips),
  //      tithesYear (per year, for a tithe-on-the-tithe backstop), titheOnTithePct }
  function project(p) {
    const W = p.pattern.reduce((a, b) => a + b, 0) || 1, rows = [];
    let bal = p.startBalance;
    for (let i = idx(p.from); i <= idx(p.through); i++) {
      const ym = ymOf(i), m = i % 12, after = i >= idx(p.switchAt);
      const kb = after ? Math.round(p.kbYear * p.pattern[m] / W) : 0;
      const inflow = after ? Math.round(kb * p.missionsPct / 100) : p.before.income[m];
      const backstop = after && p.titheOnTithePct ? Math.round(p.tithesYear / 12 * p.titheOnTithePct / 100) : 0;
      const outflow = after ? p.commitments + p.projects : p.before.spending[m];
      bal += inflow + backstop - outflow;
      rows.push({ ym, after, kb, inflow, backstop, outflow, balance: bal });
    }
    const afterRows = rows.filter(r => r.after), low = rows.reduce((a, r) => r.balance < a.balance ? r : a, rows[0] || { balance: p.startBalance });
    const missionsYear = Math.round(p.kbYear * p.missionsPct / 100), needYear = (p.commitments + p.projects) * 12, backstopYear = p.titheOnTithePct ? Math.round(p.tithesYear * p.titheOnTithePct / 100) : 0;
    const commitYear = p.commitments * 12;
    const sw = rows.findIndex(r => r.after);
    return { rows, low, atSwitch: sw > 0 ? rows[sw - 1].balance : p.startBalance,
      missionsYear, needYear, commitYear, backstopYear, shortYear: Math.max(0, needYear - missionsYear - backstopYear),
      minPctAll: p.kbYear ? Math.ceil((needYear - backstopYear) / p.kbYear * 1000) / 10 : null,            // to cover commitments and projects
      minPctCommit: p.kbYear ? Math.ceil((commitYear - backstopYear) / p.kbYear * 1000) / 10 : null,     // to cover commitments alone
      kbNeededAt: pct => Math.ceil((needYear - backstopYear) * 100 / pct),
      monthsCovered: afterRows.findIndex(r => r.balance < 0) === -1 ? afterRows.length : afterRows.findIndex(r => r.balance < 0) };
  }
  return { project };
});
