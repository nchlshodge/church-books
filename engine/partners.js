// Church Books engine — Kingdom Builders partners: who the above-and-beyond giving goes out to.
// Partners sit in three categories — Local, Global and Future (next-generation leaders) — each with a
// target share of the giving. New partners are scored on an 8-question rubric (0–3 each, 0–24 total).
// Pure functions; amounts are whole cents.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksPartners = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CATEGORIES = { local: 'Local', global: 'Global', future: 'Future' };
  const DEFAULT_RANGES = { local: [10, 30], global: [50, 70], future: [10, 15] };
  // The rubric: each answer 0–3. Wording is the church's own summary of each question.
  const RUBRIC = [
    { key: 'relationship', label: 'Relationship', opts: ['We don\'t know them, or have concerns', 'Good things heard secondhand', 'We know good things firsthand', 'We know them very well'] },
    { key: 'vision', label: 'Vision & DNA', opts: ['Vision unclear', 'Clear, but a different approach', 'A similar approach', 'Big vision, very like ours'] },
    { key: 'affiliation', label: 'Agency or affiliation', opts: ['Independent or little known', 'With a reputable organization or our network', 'Part of our movement', 'From our own church'] },
    { key: 'years', label: 'Years of service', opts: ['0–1 years', '2–3 years', '4–9 years', '10+ years'] },
    { key: 'involvement', label: 'Church involvement', opts: ['Can\'t host our teams', 'Could host a team or people', 'We\'ve sent a team or people', 'We send teams again and again'] },
    { key: 'field', label: 'Mission field', opts: ['Already well served by missions', 'Lightly served', 'Unreached or restricted access', 'No known missions presence'] },
    { key: 'focus', label: 'Ministry focus', opts: ['Admin support or brand-new start-up', 'Humanitarian help without evangelism', 'Humanitarian help with discipleship', 'Church planting'] },
    { key: 'intangible', label: 'Our sense of it', opts: ['Not feeling it', 'Neutral', 'Excited', 'Can\'t explain it — we\'re in'] },
  ];
  const band = total => total <= 8 ? 'Low' : total <= 16 ? 'Average' : 'High';
  function score(answers = {}) {
    const vals = RUBRIC.map(q => answers[q.key]).filter(v => Number.isInteger(v) && v >= 0 && v <= 3);
    const total = vals.reduce((s, v) => s + v, 0);
    return { total, answered: vals.length, complete: vals.length === RUBRIC.length, band: band(total) };
  }
  // How the giving split lines up with each category's target range.
  // split: [{ fund, pct }] · categoryOf: { fund: 'local'|'global'|'future' } · ranges: { cat: [min, max] }
  function categoryMix(split, categoryOf, ranges = DEFAULT_RANGES) {
    return Object.keys(CATEGORIES).map(cat => {
      const pct = split.filter(l => categoryOf[l.fund] === cat).reduce((s, l) => s + l.pct, 0), [lo, hi] = ranges[cat] || [0, 100];
      return { cat, label: CATEGORIES[cat], pct, range: [lo, hi], status: pct < lo ? 'below' : pct > hi ? 'above' : 'within' };
    });
  }
  // What a partner should have received by now this year, by its schedule.
  // p: { annual (cents), schedule: 'monthly'|'quarterly'|'once'|'asAble', dueBy? (YYYY-MM-DD for once) }
  function expectedByNow(p, today) {
    const m = +today.slice(5, 7);
    if (p.schedule === 'monthly') return Math.round(p.annual * m / 12);
    if (p.schedule === 'quarterly') return Math.round(p.annual * Math.ceil(m / 3) / 4);
    if (p.schedule === 'once') return !p.dueBy || p.dueBy <= today ? p.annual : 0;
    return 0;   // as funds allow
  }
  // Where each partner stands. partners: [{ ..., annual, paid (cents this year) }]
  function standing(p, today) {
    const expected = expectedByNow(p, today), left = Math.max(0, p.annual - p.paid);
    return { expected, due: Math.max(0, Math.min(left, expected - p.paid)), left, pct: p.annual ? p.paid / p.annual : 0 };
  }
  // Totals by category: approved for the year and paid so far
  function byCategory(partners) {
    const out = Object.fromEntries(Object.keys(CATEGORIES).map(c => [c, { cat: c, label: CATEGORIES[c], approved: 0, paid: 0, partners: 0 }]));
    partners.filter(p => p.status === 'Approved').forEach(p => { const o = out[p.category]; if (!o) return; o.approved += p.annual; o.paid += p.paid; o.partners++; });
    const paidAll = Object.values(out).reduce((s, o) => s + o.paid, 0);
    Object.values(out).forEach(o => { o.share = paidAll ? o.paid / paidAll : 0; });
    return out;
  }
  // Tithe on the tithe: each month the church gives pct% of the PREVIOUS month's tithes (from its own operating
  // money — members' tithes aren't split). Every payment month from the start through this month.
  const prevMonth = ym => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
  function titheMonths({ start, today, day = 5 }) {
    const out = [], end = today.slice(0, 7);
    for (let ym = start; ym <= end; ) {
      const payOn = `${ym}-${String(Math.min(day, 28)).padStart(2, '0')}`;
      out.push({ month: ym, basis: prevMonth(ym), payOn, due: payOn <= today });
      const [y, m] = ym.split('-').map(Number); ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    }
    return out;
  }
  const titheShare = (tithes, pct) => Math.round(Math.max(0, tithes) * pct / 100);

  return { titheMonths, titheShare, CATEGORIES, DEFAULT_RANGES, RUBRIC, score, band, categoryMix, expectedByNow, standing, byCategory };
});
