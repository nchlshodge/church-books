// Church Books engine — renting out the building. Pure date and money math; amounts are whole cents.
//
// The IRS line, built in: paying to use the building is rent, not a gift — even when the church asks for a
// "donation". Only what someone pays above the fair value of their use is a contribution, and when a payment
// over $75 is part rent, part gift, the renter must be told in writing how much was the gift.
//
// An agreement: { start, end, days: [0–6] (weekly) | dates: ['YYYY-MM-DD'] (one-time), from: 'HH:MM', to: 'HH:MM' }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksRentals = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const mins = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const hours = a => Math.max(0, (mins(a.to) - mins(a.from)) / 60);
  // Every date the space is used, between two dates (inclusive)
  function uses(a, from, to) {
    if (a.dates) return a.dates.filter(d => d >= from && d <= to).sort();
    const out = [], lo = from > a.start ? from : a.start, hi = a.end && a.end < to ? a.end : to;
    for (let d = new Date(lo + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= hi; d.setUTCDate(d.getUTCDate() + 1))
      if ((a.days || []).includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    return out;
  }
  // The fair value of one use: the space's hourly rate × hours (rate in cents)
  const fairPerUse = (a, rate) => Math.round(rate * hours(a));
  // Split one payment covering some uses into rent and gift
  function splitPayment({ paid, uses: n, fairPerUse: f }) {
    const fair = n * f, rent = Math.min(paid, fair), gift = paid - rent;
    return { paid, fair, rent, gift, disclosureRequired: gift > 0 && paid > 7500 };
  }
  // Where an agreement stands today. payments: [{ date, amount, uses }] · asked: what the church asks per use
  function summary(a, { rate, asked, payments = [], today }) {
    const all = uses(a, a.start || (a.dates || [])[0], today), f = fairPerUse(a, rate);
    const usesPaid = payments.reduce((s, p) => s + (p.uses || 0), 0), paid = payments.reduce((s, p) => s + p.amount, 0);
    const split = payments.map(p => splitPayment({ paid: p.amount, uses: p.uses || 0, fairPerUse: f }));
    return { usesSoFar: all.length, lastUse: all[all.length - 1] || null, nextUse: uses(a, today > (a.start || '') ? nextDay(today) : a.start, '9999-12-31')[0] || null,
      fairPerUse: f, usesPaid, usesUnpaid: Math.max(0, all.length - usesPaid), askedUnpaid: Math.max(0, all.length - usesPaid) * asked, paid,
      rent: split.reduce((s, x) => s + x.rent, 0), gift: split.reduce((s, x) => s + x.gift, 0) };
  }
  const nextDay = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  return { hours, uses, fairPerUse, splitPayment, summary };
});
