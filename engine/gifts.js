// Church Books engine — what the IRS expects around gifts, in plain rules. Pure functions, no dates of
// "today" hidden inside: everything is passed in. Amounts are whole cents. This is guidance built into the
// workflow, not tax advice — the church's accountant has the last word.
//
// Non-cash gifts: the church describes what it received and when; it never puts a value on the receipt
// (the donor values it). Over $500 the donor files Form 8283; over $5,000 (except publicly traded stock) the
// donor needs a qualified appraisal and the church signs Form 8283 Section B — and if the church then sells
// or gives the item away within 3 years, it files Form 8282 within 125 days. Donated vehicles worth over
// $500 get Form 1098-C from the church within 30 days.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksGifts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KINDS = {
    stock:    { label: 'Stock or mutual fund', sellable: true, traded: true },
    crypto:   { label: 'Cryptocurrency', sellable: true },
    goods:    { label: 'Goods or equipment', sellable: true },
    vehicle:  { label: 'Vehicle', sellable: true },
    property: { label: 'Real estate', sellable: true, board: true },
    services: { label: 'Services (volunteer work)', notDeductible: true },
  };
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const addYears = (iso, n) => `${+iso.slice(0, 4) + n}${iso.slice(4)}`;

  // The steps a non-cash gift needs. gift: { kind, date, value (church's fair value, cents), claimed? (what
  // the donor says it's worth, cents), ackSent?, boardAccepted?, f8283Signed?, soldOn?, f8282Filed?, f1098cSent?, keptForUse? }
  // policy: { boardAcceptOver (cents), sellPromptly } → [{ key, label, who, due, done, why }]
  function paperwork(g, policy = {}) {
    const k = KINDS[g.kind] || KINDS.goods, claimed = g.claimed != null ? g.claimed : g.value, steps = [];
    const add = (key, label, who, due, done, why) => steps.push({ key, label, who, due: due || null, done: !!done, why });
    if (k.board || (policy.boardAcceptOver && g.value >= policy.boardAcceptOver && !k.traded))   // traded stock is simply sold
      add('board', 'Board accepts the gift', 'church', null, g.boardAccepted, 'Large or unusual gifts are accepted by the board under the gift policy before they\'re taken on.');
    if (k.notDeductible) {
      add('thanks', 'Thank-you note (no tax receipt)', 'church', null, g.ackSent, 'Time and services aren\'t tax-deductible, so there\'s no tax receipt — but out-of-pocket costs a volunteer paid are, and over $250 they need a written acknowledgment.');
      return steps;
    }
    add('ack', 'Written acknowledgment to the donor', 'church', `${+g.date.slice(0, 4) + 1}-01-31`, g.ackSent,
      'Required for gifts of $250 or more before the donor files. It describes the item — the church doesn\'t state a value — and says whether anything was given in return.');
    if (claimed > 500000 && !k.traded) {
      add('appraisal', 'Qualified appraisal', 'donor', null, g.appraisalSeen, 'Over $5,000 the donor needs a qualified appraisal for their deduction. The church can keep a copy on file.');
      add('f8283', 'Sign Form 8283, Section B', 'church', null, g.f8283Signed, 'The church signs to confirm it received the item — not to agree with the value.');
    } else if (claimed > 50000) add('f8283a', 'Donor files Form 8283, Section A', 'donor', null, true, 'Over $500 the donor reports it on Form 8283. Nothing for the church to sign.');
    if (g.kind === 'vehicle' && claimed > 50000) {
      const from = g.soldOn || (g.keptForUse ? g.date : null);
      add('f1098c', 'Send Form 1098-C to the donor', 'church', from ? addDays(from, 30) : null, g.f1098cSent,
        g.keptForUse ? 'The church is using the vehicle, so the donor can deduct its fair value — Form 1098-C (with that certification) goes out within 30 days of the gift.'
          : 'When the church sells it, the donor\'s deduction is usually what it sold for — Form 1098-C goes out within 30 days of the sale.');
    }
    if (g.f8283Signed && g.soldOn && g.soldOn <= addYears(g.date, 3))
      add('f8282', 'File Form 8282 with the IRS', 'church', addDays(g.soldOn, 125), g.f8282Filed, 'The church signed Form 8283 and sold the item within 3 years, so it reports the sale to the IRS (and sends the donor a copy).');
    if (k.sellable && (g.kind === 'stock' || g.kind === 'crypto') && policy.sellPromptly && !g.soldOn)
      add('sell', 'Sell it', 'church', addDays(g.date, 7), false, 'The gift policy is to sell gifts of stock and crypto right away, so the value isn\'t left to the market.');
    return steps;
  }
  const nextStep = (g, policy) => paperwork(g, policy).filter(s => !s.done && s.who === 'church').sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1)[0] || null;

  // A payment where the giver got something back (a dinner ticket, the use of a room): only what's
  // above the fair value of what they received is a gift. Over $75 the church must say so in writing.
  function quidProQuo({ paid, fairValue }) {
    const deductible = Math.max(0, paid - fairValue);
    return { paid, fairValue, deductible, disclosureRequired: paid > 7500 && fairValue > 0 };
  }

  // The words of a receipt for one non-cash gift. church: { name, address, ein? } · donor: { name, address? }
  function acknowledgment(g, { church, donor }) {
    const k = KINDS[g.kind] || KINDS.goods;
    return {
      title: `Gift receipt · ${donor.name}`,
      paragraphs: [
        `Thank you for your gift to ${church.name}.`,
        `On ${g.date} we received: ${g.description}${g.kind === 'stock' && g.quantity ? ` (${g.quantity} shares${g.ticker ? ' of ' + g.ticker : ''})` : ''}.`,
        k.notDeductible ? 'Donated time and services are not tax-deductible; this note is our thanks.'
          : 'We do not state a value for gifts of property; the value is for you to determine.' + (g.kind === 'vehicle' ? ' A Form 1098-C will follow for this vehicle.' : ''),
        'No goods or services were provided in exchange for this gift, other than intangible religious benefits.',
        `${church.name}${church.address ? ' · ' + church.address : ''}${church.ein ? ' · EIN ' + church.ein : ''} is a church described in section 170(b)(1)(A)(i) of the Internal Revenue Code.`,
      ],
    };
  }

  // A household's year-end giving statement: cash gifts (from the giving system), non-cash gifts
  // (described, no value) and payments where only part was a gift. → totals the receipt can state.
  function statement({ year, gifts = [], nonCash = [], partial = [] }) {
    const inYear = d => String(d).slice(0, 4) === String(year);
    const cash = gifts.filter(x => inYear(x.date)), nc = nonCash.filter(x => inYear(x.date)), qp = partial.filter(x => inYear(x.date));
    const byFund = {}; cash.forEach(x => { byFund[x.fund] = (byFund[x.fund] || 0) + x.amount; });
    const qpDeductible = qp.reduce((s, x) => s + quidProQuo(x).deductible, 0);
    return { year, cash, byFund, cashTotal: cash.reduce((s, x) => s + x.amount, 0), nonCash: nc, partial: qp.map(x => ({ ...x, ...quidProQuo(x) })), partialDeductible: qpDeductible,
      deductibleCash: cash.reduce((s, x) => s + x.amount, 0) + qpDeductible };
  }
  return { KINDS, paperwork, nextStep, quidProQuo, acknowledgment, statement };
});
