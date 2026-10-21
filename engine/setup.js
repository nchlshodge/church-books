// Church Books engine — turns one church's setup file into its books.
//
// Nothing about any particular church lives in the engine. Each church has a setup
// (see churches/<id>/setup.js) that names its funds, how giving is split, its bank
// accounts and cards, its budgets and its policies. validateSetup() explains every
// problem in plain words; createBooks() refuses to start until there are none.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ledger.js'), require('./template.js'), require('./approvals.js'));
  else root.BooksSetup = factory(root.BooksLedger, root.BooksTemplate, root.BooksApprovals);
})(typeof self !== 'undefined' ? self : this, function (Ledger, Template, Approvals) {
  const RESTRICTIONS = ['with', 'without'];
  const range = (code, lo, hi) => /^\d{4}$/.test(code) && +code >= lo && +code <= hi;

  // Every account this church will use: the standard list plus its own banks, cards and giving funds.
  function buildChart(setup) {
    return [
      ...(setup.banks || []).map(b => ({ code: b.code, name: b.name + (b.last4 ? ` ••${b.last4}` : ''), type: 'asset', sub: b.kind === 'cash' ? 'cash' : 'bank' })),
      ...(setup.cards || []).map(c => ({ code: c.code, name: `${c.name} ••${c.last4}`, type: 'liability', sub: 'card' })),
      ...(setup.giving || []).map(g => ({ code: g.account, name: g.name, type: 'income', sub: 'giving' })),
      ...Template.STANDARD_ACCOUNTS,
      ...(setup.extraAccounts || []),
    ].sort((a, b) => a.code.localeCompare(b.code));
  }

  // US bank routing (ABA) numbers carry a check digit: 3·(d1+d4+d7) + 7·(d2+d5+d8) + (d3+d6+d9) ≡ 0 mod 10
  function routingValid(r) {
    if (!/^\d{9}$/.test(r || '')) return false;
    const d = r.split('').map(Number);
    return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
  }

  function validateSetup(setup) {
    const problems = [], say = m => problems.push(m);
    if (!setup || typeof setup !== 'object') return ['The setup is empty'];
    if (!setup.id || !/^[a-z0-9-]{2,40}$/.test(setup.id)) say('The church needs a short id (lowercase letters, numbers, dashes)');
    if (!setup.name) say('The church needs a name');

    const funds = setup.funds || [];
    if (!funds.length) say('Add at least one fund');
    const fundIds = new Set();
    funds.forEach(f => {
      if (!f.id || !f.name) say('Every fund needs an id and a name');
      else if (fundIds.has(f.id)) say(`Two funds use the id "${f.id}"`);
      fundIds.add(f.id);
      if (!RESTRICTIONS.includes(f.restriction)) say(`${f.name || f.id}: say whether givers restricted it ('with') or not ('without')`);
      if (f.designated && f.restriction !== 'without') say(`${f.name || f.id}: only money givers didn't restrict can be board-designated`);
    });
    const op = funds.find(f => f.id === setup.operatingFund);
    if (!op) say('Pick the operating fund (day-to-day ministry)');
    else if (op.restriction !== 'without') say(`The operating fund (${op.name}) can't be restricted`);
    else if (op.designated) say(`The operating fund (${op.name}) can't be board-designated`);

    const codes = new Set(Template.STANDARD_ACCOUNTS.map(a => a.code));
    const claim = (code, what) => { if (codes.has(code)) say(`${what}: account ${code} is already used`); codes.add(code); };
    (setup.banks || []).forEach(b => { if (!range(b.code, 1000, 1099)) say(`${b.name}: bank accounts use codes 1000–1099`); else claim(b.code, b.name); });
    if (!(setup.banks || []).some(b => b.kind !== 'cash')) say('Add at least one bank account');
    (setup.cards || []).forEach(c => {
      if (!range(c.code, 2000, 2099)) say(`${c.name}: cards use codes 2000–2099`); else claim(c.code, c.name);
      if (!/^\d{4}$/.test(c.last4 || '')) say(`${c.name}: add the card's last 4 digits`);
    });

    const giving = setup.giving || [];
    if (!giving.length) say('Add at least one way to give (a giving fund)');
    const givIds = new Set();
    giving.forEach(g => {
      if (!g.id || !g.name) { say('Every giving fund needs an id and a name'); return; }
      if (givIds.has(g.id)) say(`Two giving funds use the id "${g.id}"`); givIds.add(g.id);
      if (!range(g.account, 4000, 4099)) say(`${g.name}: giving accounts use codes 4000–4099`); else claim(g.account, g.name);
      const split = g.split || [];
      if (!split.length) say(`${g.name}: say which fund(s) its gifts go to`);
      split.forEach(p => { if (!fundIds.has(p.to)) say(`${g.name}: there's no fund "${p.to}"`); if (!(p.pct > 0)) say(`${g.name}: every share must be more than 0%`); });
      const total = split.reduce((s, p) => s + (p.pct || 0), 0);
      if (split.length && Math.abs(total - 100) > 1e-9) say(`${g.name}: the split adds up to ${total}%, not 100%`);
    });
    (setup.extraAccounts || []).forEach(a => claim(a.code, a.name));

    const ck = setup.checks;
    if (ck) {
      if (!['blank', 'preprinted'].includes(ck.stock)) say("Checks: say whether the church prints on blank stock or pre-printed checks");
      const b = (setup.banks || []).find(x => x.code === ck.bank);
      if (!b) say(`Checks are drawn on a bank account that doesn't exist: ${ck.bank}`);
      else if (ck.stock === 'blank') {
        if (!routingValid(b.routing)) say(`${b.name}: the routing number isn't a valid 9-digit bank routing number`);
        if (!/^\d{4,17}$/.test(b.account || '')) say(`${b.name}: add the account number (needed to print on blank check stock)`);
      }
      if (!(ck.nextNumber > 0)) say('Checks: set the next check number');
      (ck.signers || []).forEach(id => { if (!(setup.people || {})[id]) say(`Check signer "${id}" isn't one of the church's people`); });
    }
    if (setup.admins) {
      if (!setup.admins.length) say('Pick at least one admin (someone who can change these settings)');
      setup.admins.forEach(id => { if (!(setup.people || {})[id]) say(`Admin "${id}" isn't one of the church's people`); });
    }
    const pol = setup.policies || {};
    if (pol.feeFund && !fundIds.has(pol.feeFund)) say(`Processing fees go to a fund that doesn't exist: ${pol.feeFund}`);
    if (pol.depositBank && !(setup.banks || []).some(b => b.code === pol.depositBank)) say(`Deposits go to a bank account that doesn't exist: ${pol.depositBank}`);
    const people = setup.people || {};
    (pol.reviewers || []).forEach(id => { if (!people[id]) say(`Reviewer "${id}" isn't one of the church's people`); });
    if (!(pol.reviewers || []).length) say('Pick at least one person to review spending');
    Approvals.validate(pol, people).forEach(say);

    const allCodes = new Set(buildChart(setup).map(a => a.code));
    Object.entries(setup.categories || {}).forEach(([label, code]) => { if (!allCodes.has(code)) say(`Category "${label}" points at account ${code}, which doesn't exist`); });

    const budgets = setup.budgets || [];
    const names = new Set();
    budgets.forEach(b => {
      if (names.has(b.name)) say(`Two budgets are called "${b.name}"`); names.add(b.name);
      if (!fundIds.has(b.fund)) say(`Budget "${b.name}" comes out of a fund that doesn't exist: ${b.fund}`);
      if (!(b.budget >= 0)) say(`Budget "${b.name}" needs an amount`);
      if (b.parent) {
        const p = budgets.find(x => x.name === b.parent);
        if (!p) say(`Budget "${b.name}" is inside "${b.parent}", which doesn't exist`);
        else if (p.parent) say(`"${b.name}" can only sit one level deep`);
        else if (p.fund !== b.fund) say(`"${b.name}" has to come out of the same fund as "${p.name}"`);
      }
    });
    return problems;
  }

  // Giving funds in the shape the posting rules want: { [id]: { account, split } }
  function givingRules(setup) {
    return Object.fromEntries((setup.giving || []).map(g => [g.id, { account: g.account, split: g.split.map(p => ({ to: p.to, pct: p.pct })) }]));
  }

  function createBooks(setup, opts) {
    const problems = validateSetup(setup);
    if (problems.length) throw new Ledger.LedgerError('bad_setup', 'The church setup has problems:\n• ' + problems.join('\n• '));
    return Ledger.createLedger({ ...opts, accounts: buildChart(setup), funds: setup.funds.map(f => ({ id: f.id, name: f.name, restriction: f.restriction, ...(f.designated ? { designated: true } : {}), ...(f.property ? { property: true } : {}) })) });
  }

  return { buildChart, validateSetup, givingRules, createBooks, routingValid };
});
