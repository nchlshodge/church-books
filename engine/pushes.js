// Church Books engine — giving pushes: a monthly highlight (Ask, Update, Celebrate, Break) and the
// year-end Miracle Offering, with the dates worked out for any year. Pure date math on 'YYYY-MM-DD'.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksPushes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const fmt = d => d.toISOString().slice(0, 10);
  const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12));
  const add = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
  // The n-th given weekday (0 = Sunday) of a month
  function nth(y, m, weekday, n) { const first = day(y, m, 1), off = (weekday - first.getUTCDay() + 7) % 7; return fmt(day(y, m, 1 + off + (n - 1) * 7)); }
  const sundays = (y, m) => [1, 2, 3, 4, 5].map(n => nth(y, m, 0, n)).filter(d => +d.slice(5, 7) === m);
  const PHASES = ['ask', 'update', 'celebrate', 'break', 'break'];
  // Where a month's highlight stands on a date: the most recent Sunday decides the week
  function rhythm(y, m, today) {
    const s = sundays(y, m), past = s.filter(d => d <= today);
    if (!past.length) return { phase: 'before', week: 0, sunday: s[0], sundays: s };
    const i = past.length - 1;
    return { phase: today > add(s[s.length - 1], 6) ? 'after' : PHASES[i], week: i + 1, sunday: s[i], sundays: s };
  }
  // The Miracle Offering calendar for a year: the banquet (fourth Friday of October), talking about it two
  // weeks ahead, the offering weekend two weeks before Thanksgiving, a two-week window, the reveal three
  // weekends later, then the final push to December 31.
  function miracleDates(y) {
    const thanksgiving = nth(y, 11, 4, 4), offering = add(thanksgiving, -11);
    return { banquet: nth(y, 10, 5, 4), talkUp: add(offering, -14), offering, windowEnd: add(offering, 14), reveal: add(offering, 21), thanksgiving, yearEnd: `${y}-12-31` };
  }
  function miraclePhase(d, today) {
    if (today < d.banquet) return 'before';
    if (today < d.talkUp) return 'banquet';
    if (today < d.offering) return 'talk';
    if (today <= d.windowEnd) return 'window';
    if (today < d.reveal) return 'counting';
    if (today <= d.yearEnd) return 'final';
    return 'done';
  }
  // Add up what came in for a push. gifts: [{ date, amount }] (cents)
  function tally(gifts, { from, to, before = 0, goal = 0 } = {}) {
    const g = gifts.filter(x => (!from || x.date >= from) && (!to || x.date <= to));
    const raised = before + g.reduce((s, x) => s + x.amount, 0);
    return { raised, count: g.length, pct: goal ? raised / goal : 0, left: Math.max(0, goal - raised) };
  }
  // Closing the gap at year-end: what's still needed for the year's goal
  const gap = ({ goal, given }) => ({ goal, given, gap: Math.max(0, goal - given), pct: goal ? given / goal : 0 });
  return { sundays, rhythm, miracleDates, miraclePhase, tally, gap, nth };
});
