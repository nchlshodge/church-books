// Church Books engine — dates for recurring payments (monthly missionary support, quarterly dues…).
// Pure date math on 'YYYY-MM-DD' strings, so it behaves the same everywhere.
//
// A schedule: { start: '2026-01-01', every: 'monthly', day?: 31, lastRun?: '2026-09-01',
//               endsOn?: '2027-06-30', count?: 12, status: 'Active' | 'Paused' | 'Ended' }
//   every: weekly · every2weeks · monthly · quarterly · yearly
//   day:   for monthly/quarterly/yearly — the day of the month (31 means "the last day" in short months)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksSchedule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STEP = { weekly: { days: 7 }, every2weeks: { days: 14 }, monthly: { months: 1 }, quarterly: { months: 3 }, yearly: { months: 12 } };
  const PER_YEAR = { weekly: 52, every2weeks: 26, monthly: 12, quarterly: 4, yearly: 1 };
  const LABEL = { weekly: 'Every week', every2weeks: 'Every 2 weeks', monthly: 'Every month', quarterly: 'Every 3 months', yearly: 'Every year' };

  const parse = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
  const fmt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const addDays = (s, n) => { const { y, m, d } = parse(s); const t = new Date(Date.UTC(y, m - 1, d + n)); return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };

  // The k-th payment date (k = 0 is the first)
  function nth(s, k) {
    const st = STEP[s.every]; if (!st) throw new Error(`Unknown frequency: ${s.every}`);
    if (st.days) return addDays(s.start, k * st.days);
    const { y, m, d } = parse(s.start), day = s.day || d;
    const mi = (m - 1) + k * st.months, yy = y + Math.floor(mi / 12), mm = (mi % 12) + 1;
    return fmt(yy, mm, Math.min(day, daysIn(yy, mm)));
  }
  // Every payment date in (after, upTo], in order, respecting the end date and count
  function between(s, after, upTo) {
    const out = [];
    for (let k = 0; k < 2000; k++) {
      const dt = nth(s, k);
      if (s.endsOn && dt > s.endsOn) break;
      if (s.count && k >= s.count) break;
      if (dt > upTo) break;
      if (!after || dt > after) out.push(dt);
    }
    return out;
  }
  // Payments that should have gone out by asOf and haven't (nothing for paused or ended schedules)
  const due = (s, asOf) => s.status && s.status !== 'Active' ? [] : between(s, s.lastRun || null, asOf);
  // The next payment after a date (or null when the schedule has ended)
  function next(s, after) {
    if (s.status === 'Ended') return null;
    for (let k = 0; k < 2000; k++) {
      const dt = nth(s, k);
      if ((s.endsOn && dt > s.endsOn) || (s.count && k >= s.count)) return null;
      if (dt > after) return dt;
    }
    return null;
  }
  const perYear = every => PER_YEAR[every];
  return { nth, between, due, next, perYear, LABEL, FREQUENCIES: Object.keys(STEP) };
});
