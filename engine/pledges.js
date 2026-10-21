// Church Books engine — pledge campaigns (e.g. a three-year building campaign). A household pledges an amount
// over the campaign and gives toward it as it goes; this works out what they've given, what's left, whether
// they're on pace, and what each gift would need to be to finish on time. Whole cents; dates are 'YYYY-MM-DD'.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksPledges = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FREQ = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', once: 'One gift' };
  const STEP = { weekly: d => d.setDate(d.getDate() + 7), monthly: d => d.setMonth(d.getMonth() + 1), quarterly: d => d.setMonth(d.getMonth() + 3), yearly: d => d.setFullYear(d.getFullYear() + 1) };
  const D = s => new Date(s + 'T12:00:00');
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // The dates gifts would fall on, from start up to (not past) end
  function dueDates(start, end, frequency) {
    if (frequency === 'once') return [end];               // one gift, due by the finish date
    if (!STEP[frequency]) return [start];
    const out = [], d = D(start);
    for (let i = 0; i < 2000 && ymd(d) <= end; i++) { out.push(ymd(d)); STEP[frequency](d); }
    return out.length ? out : [start];
  }
  // pledge: { amount, start, end, frequency, givenBefore? } · gifts: [{ date, amount }] toward the campaign
  function progress(pledge, gifts, today) {
    const inside = gifts.filter(g => g.date >= pledge.start && g.date <= pledge.end && g.date <= today);
    const given = (pledge.givenBefore || 0) + inside.reduce((s, g) => s + g.amount, 0);
    const left = Math.max(0, pledge.amount - given), dates = dueDates(pledge.start, pledge.end, pledge.frequency);
    const passed = dates.filter(d => d <= today).length, ahead = dates.length - passed;
    const expected = Math.round(pledge.amount * passed / dates.length);
    const status = given >= pledge.amount ? 'done' : today < pledge.start ? 'notStarted' : today > pledge.end ? 'short' : given >= expected ? 'onPace' : 'behind';
    return { amount: pledge.amount, given, left, pct: pledge.amount ? Math.min(1, given / pledge.amount) : 0, expected, status, extra: Math.max(0, given - pledge.amount),
      giftsLeft: ahead, nextAmount: left && ahead ? Math.ceil(left / ahead) : left, nextDate: dates.find(d => d > today) || null, gifts: inside.length };
  }
  // campaign: { goal } · rows: progress() results · givenAll: every gift to the campaign (pledged or not)
  function summary(campaign, rows, givenAll = 0) {
    const sum = f => rows.reduce((s, r) => s + f(r), 0);
    const pledged = sum(r => r.amount), towardPledges = sum(r => Math.min(r.given, r.amount));
    return { goal: campaign.goal || 0, households: rows.length, pledged, given: givenAll, towardPledges, left: sum(r => r.left), expected: sum(r => r.expected),
      beyond: Math.max(0, givenAll - towardPledges), pace: sum(r => Math.min(r.given, r.amount)) - sum(r => r.expected),
      counts: ['done', 'onPace', 'behind', 'short', 'notStarted'].reduce((o, k) => (o[k] = rows.filter(r => r.status === k).length, o), {}) };
  }
  return { FREQ, dueDates, progress, summary };
});
