// Church Books engine — fixed assets: buildings, land, furniture, vehicles. Each is recorded at cost and its cost
// is spread over its useful life (straight line, by month, starting the month after it's put in service).
// Land is never depreciated. Pure date math on 'YYYY-MM' / 'YYYY-MM-DD'; amounts are whole cents.
//   asset: { id, name, account, fund, cost, placed: 'YYYY-MM-DD', lifeYears (0 = not depreciated), salvage?, disposed?: 'YYYY-MM-DD' }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksAssets = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const idx = ym => { const [y, m] = ym.slice(0, 7).split('-').map(Number); return y * 12 + (m - 1); };
  const ymOf = i => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`;
  const base = a => Math.max(0, a.cost - (a.salvage || 0));
  const months = a => Math.round((a.lifeYears || 0) * 12);
  const monthly = a => months(a) ? Math.floor(base(a) / months(a)) : 0;
  // How much has been depreciated through the end of a month (the last month takes the leftover cents)
  function accumulatedThrough(a, ym) {
    if (!months(a)) return 0;
    let last = idx(ym); if (a.disposed) last = Math.min(last, idx(a.disposed) - 1);
    const n = Math.min(months(a), Math.max(0, last - idx(a.placed)));
    return n >= months(a) ? base(a) : n * monthly(a);
  }
  const forMonth = (a, ym) => accumulatedThrough(a, ym) - accumulatedThrough(a, ymOf(idx(ym) - 1));
  const bookValue = (a, ym) => a.cost - accumulatedThrough(a, ym);
  // Each month's depreciation for a list of assets between two months (inclusive): [{ month, byFund: { fund: cents }, total }]
  function schedule(assets, fromYm, toYm) {
    const out = [];
    for (let i = idx(fromYm); i <= idx(toYm); i++) {
      const ym = ymOf(i), byFund = {};
      assets.forEach(a => { const d = forMonth(a, ym); if (d) byFund[a.fund] = (byFund[a.fund] || 0) + d; });
      const total = Object.values(byFund).reduce((s, x) => s + x, 0);
      if (total) out.push({ month: ym, byFund, total });
    }
    return out;
  }
  const yearsLeft = (a, ym) => months(a) ? Math.max(0, months(a) - Math.max(0, idx(ym) - idx(a.placed))) / 12 : null;
  return { accumulatedThrough, forMonth, bookValue, schedule, monthly, yearsLeft };
});
