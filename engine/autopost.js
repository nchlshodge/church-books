// Fundwell engine — recording online giving without a person pressing Record on each payout. A payout records
// itself only when everything agrees: the gifts are all to ways to give the church knows, the gifts minus the fee
// equal what the giving system says it sent, and a bank deposit for that amount has arrived. Anything else waits
// ("waiting for the bank") or is set aside for a person ("needs a look"). A reviewer signs off each week's list.
// Pure: amounts are whole cents, dates 'YYYY-MM-DD'.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksAutopost = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const D = s => new Date(s + 'T12:00:00'), ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Weekdays after a and up to b (a payout on Friday has had 1 business day by Monday)
  function businessDays(a, b) { let n = 0; const d = D(a); while (ymd(d) < b) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n++; } return n; }
  const usd = c => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const weekOf = s => { const d = D(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };   // the Monday
  // p: { split: { givingId: cents }, fee, net? (what the giving system says it sent), gifts }
  function checkPayout(p, { known }) {
    const reasons = [], gross = Object.values(p.split || {}).reduce((s, v) => s + v, 0), net = gross - (p.fee || 0);
    const unknown = Object.keys(p.split || {}).filter(k => !known.has(k));
    if (unknown.length) reasons.push(`Gifts to ${unknown.join(', ')}, which isn't a way to give in the books yet`);
    if (!gross) reasons.push('No gifts in it');
    if (p.fee < 0 || p.fee > gross) reasons.push('The processing fee looks wrong');
    if (p.net != null && p.net !== net) reasons.push(`The giving system sent ${usd(p.net)}, but the gifts minus the fee come to ${usd(net)} — usually a refund or a disputed gift`);
    return { ok: !reasons.length, reasons, gross, net };
  }
  // Each bank deposit against the payouts still waiting: one payout, or several days in a row that the processor
  // sent together. payouts: [{ id, date, net }] · lines: [{ id, date, amount }] (deposits only)
  function matchDeposits(payouts, lines, { maxDays = 6 } = {}) {
    const open = payouts.slice().sort((a, b) => a.date < b.date ? -1 : 1), used = new Set(), out = [];
    lines.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(l => {
      const cands = open.filter(p => !used.has(p.id) && p.date <= l.date && businessDays(p.date, l.date) <= maxDays);
      let hit = cands.find(p => p.net === l.amount) ? [cands.find(p => p.net === l.amount)] : null;
      for (let i = 0; !hit && i < cands.length; i++) { let s = 0; for (let j = i; j < cands.length && s < l.amount; j++) { s += cands[j].net; if (s === l.amount && j > i) { hit = cands.slice(i, j + 1); break; } } }
      if (hit) { hit.forEach(p => used.add(p.id)); out.push({ line: l, payouts: hit.map(p => p.id) }); }
    });
    return out;
  }
  // Everything still New → ready (with its bank line), waiting for the bank, or needs a look
  function classify(payouts, lines, { known, today, waitDays = 3, maxDays = 6 }) {
    const checked = payouts.map(p => ({ p, c: checkPayout(p, { known }) }));
    const good = checked.filter(x => x.c.ok).map(x => ({ id: x.p.id, date: x.p.date, net: x.c.net }));
    const matches = matchDeposits(good, lines, { maxDays }), byPayout = {};
    matches.forEach(m => m.payouts.forEach(id => { byPayout[id] = m; }));
    return checked.map(({ p, c }) => {
      if (!c.ok) return { id: p.id, status: 'look', reasons: c.reasons, net: c.net };
      if (byPayout[p.id]) return { id: p.id, status: 'ready', line: byPayout[p.id].line, together: byPayout[p.id].payouts, net: c.net };
      const waited = businessDays(p.date, today);
      return waited > waitDays ? { id: p.id, status: 'look', reasons: [`No bank deposit for ${usd(c.net)} after ${waited} business days`], net: c.net }
        : { id: p.id, status: 'waiting', expectBy: (() => { const d = D(p.date); let n = 0; while (n < waitDays) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n++; } return ymd(d); })(), net: c.net };
    });
  }
  // items: [{ date, byFund: { fund: cents } }] → weeks, newest first, with totals by fund
  function weeks(items) {
    const w = {};
    items.forEach(x => { const k = weekOf(x.date), o = w[k] = w[k] || { week: k, count: 0, total: 0, byFund: {} }; o.count++;
      Object.entries(x.byFund).forEach(([f, v]) => { o.byFund[f] = (o.byFund[f] || 0) + v; o.total += v; }); });
    return Object.values(w).sort((a, b) => a.week < b.week ? 1 : -1);
  }
  return { businessDays, weekOf, checkPayout, matchDeposits, classify, weeks };
});
