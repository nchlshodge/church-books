// Fundwell engine — turning Planning Center Giving donations into a day of giving. Planning Center's API lists
// donations (amount_cents, fee_cents, completed_at, refunded) with their designations (each a fund and an
// amount_cents); it doesn't list payouts. So each morning we take yesterday's completed online gifts, add them up
// by way to give, and make one payout for the day — the same thing the treasurer has always recorded.
// funds: { [Planning Center fund id or name]: our giving id }. Pure; whole cents.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksPco = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // donations: [{ id, amount_cents, fee_cents, completed_at, refunded, payment_method, designations: [{ fund, amount_cents }] }]
  // dateOf: turns completed_at into the church's local date ('YYYY-MM-DD')
  function days(donations, { funds, dateOf = s => String(s).slice(0, 10), online = d => d.payment_method !== 'cash' && d.payment_method !== 'check' }) {
    const out = {};
    donations.filter(d => d.completed_at && !d.refunded && online(d)).forEach(d => {
      const day = dateOf(d.completed_at), o = out[day] = out[day] || { date: day, gifts: 0, split: {}, fee: 0, unknownFunds: [], ids: [] };
      o.gifts++; o.ids.push(d.id); o.fee += Math.abs(d.fee_cents || 0);
      (d.designations || []).forEach(x => { const g = funds[x.fund] || funds[String(x.fund).toLowerCase()];
        const key = g || `unmatched:${x.fund}`; if (!g && !o.unknownFunds.includes(x.fund)) o.unknownFunds.push(x.fund);
        o.split[key] = (o.split[key] || 0) + x.amount_cents; });
    });
    return Object.values(out).sort((a, b) => a.date < b.date ? -1 : 1).map(o => ({ ...o, net: Object.values(o.split).reduce((s, v) => s + v, 0) - o.fee, source: { type: 'pco_day', id: o.date } }));
  }
  return { days };
});
