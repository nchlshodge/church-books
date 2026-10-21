// Church Books engine — the congregation's giving page: recurring-gift dates, processing fees (and covering
// them), and turning a day's charges into one payout for the books. Pure functions; whole cents; dates are
// 'YYYY-MM-DD' strings, and "today" is always passed in.
//
// A recurring gift: { amount, giving, frequency, start, end?: 'YYYY-MM-DD' | null, status: 'active' | 'paused' | 'cancelled' }
//   frequency: weekly · every2weeks · monthly (the start's day of the month; 31 means the last day) · firstFifteenth
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksGiving = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LABEL = { weekly: 'Every week', every2weeks: 'Every 2 weeks', monthly: 'Every month', firstFifteenth: 'The 1st and 15th' };
  const PER_YEAR = { weekly: 52, every2weeks: 26, monthly: 12, firstFifteenth: 24 };
  // Stripe's standard US pricing (Oct 2026 — check the church's own Stripe account; nonprofits can ask for a lower card rate).
  // pct is a fraction of the amount charged, fixed and cap are cents.
  const RATES = { card: { pct: 0.029, fixed: 30 }, bank: { pct: 0.008, fixed: 0, cap: 500 } };

  const parse = s => s.split('-').map(Number);
  const fmt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const addDays = (s, n) => { const [y, m, d] = parse(s), t = new Date(Date.UTC(y, m - 1, d + n)); return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  const addMonths = (s, k, day) => { const [y, m, d] = parse(s), mi = m - 1 + k, yy = y + Math.floor(mi / 12), mm = (mi % 12) + 1; return fmt(yy, mm, Math.min(day || d, daysIn(yy, mm))); };

  // The k-th gift date (k = 0 is the first). The 1st-and-15th schedule starts at the first of those on or after the start.
  function nth(s, k) {
    if (s.frequency === 'weekly') return addDays(s.start, 7 * k);
    if (s.frequency === 'every2weeks') return addDays(s.start, 14 * k);
    if (s.frequency === 'monthly') return addMonths(s.start, k, s.day);
    if (s.frequency === 'firstFifteenth') {
      const [y, m, d] = parse(s.start), skip = d === 1 ? 0 : d <= 15 ? 1 : 2, i = k + skip;
      return fmt(y + Math.floor((m - 1 + Math.floor(i / 2)) / 12), ((m - 1 + Math.floor(i / 2)) % 12) + 1, i % 2 ? 15 : 1);
    }
    throw new Error(`Unknown frequency: ${s.frequency}`);
  }
  // Every gift date in (after, upTo], in order, stopping at the end date
  function between(s, after, upTo) {
    const out = [];
    for (let k = 0; k < 5000; k++) {
      const dt = nth(s, k);
      if ((s.end && dt > s.end) || dt > upTo) break;
      if (!after || dt > after) out.push(dt);
    }
    return out;
  }
  // The next gift after a date — null when it's paused, cancelled or finished
  function next(s, after) {
    if (s.status && s.status !== 'active') return null;
    for (let k = 0; k < 5000; k++) {
      const dt = nth(s, k);
      if (s.end && dt > s.end) return null;
      if (dt > after) return dt;
    }
    return null;
  }
  const upcoming = (s, after, n) => { const out = []; let d = after; while (out.length < n && (d = next(s, d))) out.push(d); return out; };
  const perMonth = (amount, frequency) => Math.round(amount * PER_YEAR[frequency] / 12);
  const perYear = (amount, frequency) => amount * PER_YEAR[frequency];

  // What the processor keeps from a charge of `gross` cents
  function fee(gross, method, rates = RATES) {
    const r = rates[method]; if (!r) throw new Error(`Unknown payment method: ${method}`);
    const f = Math.round(gross * r.pct) + (r.fixed || 0);
    return r.cap != null ? Math.min(f, r.cap) : f;
  }
  // Covering the fee: the smallest charge that leaves the church the whole gift → { gross, fee, cover }
  function cover(amount, method, rates = RATES) {
    const r = rates[method]; if (!r) throw new Error(`Unknown payment method: ${method}`);
    let gross = Math.ceil((amount + (r.fixed || 0)) / (1 - r.pct));
    if (r.cap != null) gross = Math.min(gross, amount + r.cap);
    while (gross - fee(gross, method, rates) < amount) gross++;
    while (gross - 1 - fee(gross - 1, method, rates) >= amount) gross--;
    return { gross, fee: fee(gross, method, rates), cover: gross - amount };
  }

  // A gift as it's charged: { amount (what they chose), coverFee?, method } → { amount, cover, gross, fee, net }
  function charge(g, rates = RATES) {
    if (!Number.isInteger(g.amount) || g.amount <= 0) throw new Error('A gift needs an amount above zero');
    if (g.coverFee) { const c = cover(g.amount, g.method, rates); return { amount: g.amount, cover: c.cover, gross: c.gross, fee: c.fee, net: c.gross - c.fee }; }
    const f = fee(g.amount, g.method, rates);
    return { amount: g.amount, cover: 0, gross: g.amount, fee: f, net: g.amount - f };
  }

  // One payout from the processor, shaped like the books' giving payouts (see R.giftsDeposit):
  // charges: [{ giving, amount, cover, fee, refund? }] → { gifts, byGiving, fee, gross, net }.
  // Each gift goes whole to its own way to give; the fee-cover part goes to coverTo (the way to give whose money
  // pays the fees, so a designated fund isn't credited for money that was really for fees). A refund comes back out.
  function payout(charges, coverTo) {
    const byGiving = {}, add = (g, n) => { if (n) byGiving[g] = (byGiving[g] || 0) + n; };
    let feeTotal = 0, gifts = 0;
    for (const c of charges) {
      const sign = c.refund ? -1 : 1;
      add(c.giving, sign * c.amount);
      add(coverTo || c.giving, sign * (c.cover || 0));
      feeTotal += c.fee || 0;                    // a refund doesn't give the fee back
      if (!c.refund) gifts++;
    }
    const gross = Object.values(byGiving).reduce((s, n) => s + n, 0);
    return { gifts, byGiving, fee: feeTotal, gross, net: gross - feeTotal };
  }

  // A year's gifts for the statement: gifts [{ date, giving, gross, refunded? }] → { total, byGiving, count }
  function yearTotals(gifts, year) {
    const inYear = gifts.filter(g => g.date.slice(0, 4) === String(year) && !g.refunded);
    const byGiving = {};
    inYear.forEach(g => { byGiving[g.giving] = (byGiving[g.giving] || 0) + g.gross; });
    return { total: inYear.reduce((s, g) => s + g.gross, 0), byGiving, count: inYear.length };
  }

  return { LABEL, PER_YEAR, RATES, FREQUENCIES: Object.keys(LABEL), nth, between, next, upcoming, perMonth, perYear, fee, cover, charge, payout, yearTotals };
});
