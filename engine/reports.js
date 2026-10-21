// Church Books engine — reports built straight from the ledger. Nothing here is stored; it's all added up
// from entries, so the reports can never drift from the books. Amounts are whole cents.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksReports = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const sumBy = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const neg = n => 0 - n; // flips the sign without ever producing -0

  // Every account's balance. Debits must equal credits, or something is badly wrong.
  function trialBalance(L, { through } = {}) {
    const rows = L.accounts.map(a => {
      const b = L.balance({ account: a.code, through });
      return { code: a.code, name: a.name, type: a.type, debit: b > 0 ? b : 0, credit: b < 0 ? neg(b) : 0 };
    }).filter(r => r.debit || r.credit);
    const debit = sumBy(rows, r => r.debit), credit = sumBy(rows, r => r.credit);
    return { rows, debit, credit, balanced: debit === credit };
  }

  // Statement of Financial Position, one column per fund plus a total.
  // Fund balance = what's been closed into 3000 + this year's income minus expenses so far.
  function balanceSheet(L, { through } = {}) {
    const col = fund => {
      const sect = type => L.accounts.filter(a => a.type === type).map(a => ({ code: a.code, name: a.name, amount: L.natural(a.code, { fund, through }) })).filter(r => r.amount);
      const assets = sect('asset'), liabilities = sect('liability');
      const closed = neg(L.balance({ account: '3000', fund, through }));
      const thisYear = neg(L.balance({ type: 'income', fund, through }) + L.balance({ type: 'expense', fund, through }));
      const totalAssets = sumBy(assets, r => r.amount), totalLiabilities = sumBy(liabilities, r => r.amount);
      return { fund, assets, liabilities, closed, thisYear, fundBalance: closed + thisYear, totalAssets, totalLiabilities,
        balanced: totalAssets === totalLiabilities + closed + thisYear };
    };
    const funds = L.funds.map(f => ({ ...col(f.id), name: f.name, restriction: f.restriction, designated: !!f.designated, property: !!f.property }));
    const total = col(undefined);
    return { through, funds, total, balanced: total.balanced && funds.every(f => f.balanced) };
  }

  // Statement of Activities for a date range: what came in and went out, by fund, and in the
  // two columns auditors expect. Spending from a restricted fund is shown as money
  // "released from restriction" — the givers' purpose was met.
  function activities(L, { from, to } = {}) {
    const range = { from, through: to };
    const rowsFor = (type, fund) => L.accounts.filter(a => a.type === type && a.sub !== 'transfer').map(a => {
      const b = L.balance({ ...range, account: a.code, fund });
      return { code: a.code, name: a.name, amount: type === 'income' ? neg(b) : b };
    }).filter(r => r.amount);
    const transfersNet = fund => neg(L.balance({ ...range, account: '4950', fund }) + L.balance({ ...range, account: '5950', fund }));
    const funds = L.funds.map(f => {
      const income = rowsFor('income', f.id), expenses = rowsFor('expense', f.id);
      const inT = sumBy(income, r => r.amount), outT = sumBy(expenses, r => r.amount), tr = transfersNet(f.id);
      return { fund: f.id, name: f.name, restriction: f.restriction, income, expenses, totalIncome: inT, totalExpenses: outT, transfers: tr, change: inT - outT + tr };
    });
    const w = funds.filter(f => f.restriction === 'without'), r = funds.filter(f => f.restriction === 'with');
    const releases = sumBy(r, f => f.totalExpenses);
    const without = { income: sumBy(w, f => f.totalIncome), released: releases, expenses: sumBy(funds, f => f.totalExpenses), transfers: sumBy(w, f => f.transfers) };
    without.change = without.income + without.released - without.expenses + without.transfers;
    const withR = { income: sumBy(r, f => f.totalIncome), released: neg(releases), transfers: sumBy(r, f => f.transfers) };
    withR.change = withR.income + withR.released + withR.transfers;
    return { from, to, funds, without, with: withR, change: without.change + withR.change };
  }

  // Net assets the way an auditor reads them: without donor restrictions (split into what the board
  // has set aside and what it hasn't), and with donor restrictions.
  function netAssets(L, { through } = {}) {
    const bs = balanceSheet(L, { through }), row = f => ({ fund: f.fund, name: f.name, amount: f.fundBalance });
    const free = bs.funds.filter(f => f.restriction === 'without' && !f.designated && !f.property).map(row);
    const property = bs.funds.filter(f => f.restriction === 'without' && f.property).map(row), propertyTotal = sumBy(property, r => r.amount);
    const designated = bs.funds.filter(f => f.restriction === 'without' && f.designated).map(row);
    const restricted = bs.funds.filter(f => f.restriction === 'with').map(row);
    const undesignated = sumBy(free, r => r.amount), designatedTotal = sumBy(designated, r => r.amount), withTotal = sumBy(restricted, r => r.amount);
    return { through, undesignated, undesignatedFunds: free, designated, designatedTotal, property, propertyTotal, withoutTotal: undesignated + designatedTotal + propertyTotal, restricted, withTotal, total: undesignated + designatedTotal + propertyTotal + withTotal };
  }

  // Everything recorded against some budgets (a ministry and the projects and events inside it) over a period:
  // spending and income by category, by month, by payee, by budget, and each line. Transfers aren't spending.
  function projectReport(L, { projects, from, to } = {}) {
    const names = new Set(projects), acct = new Map(L.accounts.map(a => [a.code, a])), lines = [];
    L.entries.forEach(e => { if ((from && e.date < from) || (to && e.date > to)) return;
      e.lines.forEach(l => { if (!names.has(l.project)) return; const a = acct.get(l.account); if (!a || a.sub === 'transfer' || (a.type !== 'expense' && a.type !== 'income')) return;
        const amount = a.type === 'expense' ? l.debit - l.credit : l.credit - l.debit;
        lines.push({ date: e.date, entry: e.id, memo: e.memo, party: l.party || null, account: l.account, name: a.name, type: a.type, project: l.project, fund: l.fund, amount }); }); });
    const group = (type, key) => { const m = new Map(); lines.filter(x => x.type === type).forEach(x => { const k = key(x); m.set(k, (m.get(k) || 0) + x.amount); });
      return [...m].map(([k, amount]) => ({ key: k, amount })).filter(x => x.amount).sort((a, b) => b.amount - a.amount); };
    const spent = sumBy(lines.filter(x => x.type === 'expense'), x => x.amount), income = sumBy(lines.filter(x => x.type === 'income'), x => x.amount);
    return { from, to, spent, income, net: spent - income, lines: lines.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
      byCategory: group('expense', x => x.name), incomeByCategory: group('income', x => x.name), byMonth: group('expense', x => x.date.slice(0, 7)).sort((a, b) => a.key < b.key ? -1 : 1),
      byPayee: group('expense', x => x.party || '(no payee)'), byProject: group('expense', x => x.project), incomeByProject: group('income', x => x.project) };
  }

  // Statement of cash flows (indirect method) for a period, from the change in every balance. It always
  // reconciles: operating + investing = the change in cash. Depreciation and donated property aren't cash.
  function cashFlows(L, { from, to }) {
    // Opening balances are where the period starts, not activity in it
    const inRange = L.entries.filter(e => e.date >= from && e.date <= to), act = inRange.filter(e => !(e.source && e.source.type === 'opening')), opening = inRange.filter(e => e.source && e.source.type === 'opening');
    const sumLines = (entries, codes) => sumBy(entries, e => sumBy(e.lines.filter(l => codes.includes(l.account)), l => l.debit - l.credit));
    const before = (() => { const d = new Date(from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    const delta = codes => sumLines(act, codes);
    const of = pred => L.accounts.filter(pred).map(a => a.code);
    const cash = of(a => a.type === 'asset' && ['bank', 'cash', 'transit'].includes(a.sub)), ppe = of(a => a.type === 'asset' && ['fixed', 'building'].includes(a.sub)), contra = of(a => a.sub === 'contra');
    const otherAssets = of(a => a.type === 'asset' && !cash.includes(a.code) && !ppe.includes(a.code) && !contra.includes(a.code)), liabs = L.accounts.filter(a => a.type === 'liability');
    const donated = sumBy(act.filter(e => e.lines.some(l => l.account === '4800' && l.credit)), e => sumBy(e.lines.filter(l => ppe.includes(l.account)), l => l.debit));
    const gain = sumBy(act.filter(e => e.source && e.source.type === 'asset_disposal'), e => sumBy(e.lines.filter(l => l.account === '4810'), l => l.credit - l.debit));
    const changeInNet = delta(of(a => a.type === 'asset')) + delta(liabs.map(a => a.code));   // assets up, liabilities (credit balances) up — both net of each other
    const dep = sumLines(act.filter(e => !(e.source && e.source.type === 'year_close')), ['5800']);   // the year-end close moves it to fund balance; that isn't a reversal
    const changes = [...otherAssets.map(c => ({ name: L.account(c).name, amount: neg(delta([c])) })), ...liabs.map(a => ({ name: a.name, amount: neg(delta([a.code])) }))].filter(x => x.amount);
    const operating = changeInNet + dep - donated - gain + sumBy(changes, x => x.amount);
    const fixedOut = neg(delta(ppe) + delta(contra)) - dep + donated + gain;
    const cashStart = sumBy(cash, c => L.balance({ account: c, through: before })) + sumLines(opening, cash), cashEnd = sumBy(cash, c => L.balance({ account: c, through: to }));
    return { from, to, changeInNet, depreciation: dep, donatedProperty: donated, gainOnSale: gain, changes, operating, investing: fixedOut, net: operating + fixedOut, cashStart, cashEnd, reconciles: operating + fixedOut === cashEnd - cashStart };
  }

  // Statement of functional expenses: each kind of spending split into program, management & general, and fundraising.
  // map: { default: 'program', byAccount: { code: 'management' | { program: 80, management: 15, fundraising: 5 } }, byProject: { budget: … } }
  // A budget's setting wins over the account's. Transfers aren't spending.
  const FUNCTIONS = ['program', 'management', 'fundraising'];
  function functionalExpenses(L, { from, to, map = {} } = {}) {
    const rows = new Map();
    L.entries.forEach(e => { if ((from && e.date < from) || (to && e.date > to)) return;
      e.lines.forEach(l => { const a = L.account(l.account); if (!a || a.type !== 'expense' || a.sub === 'transfer') return;
        const amt = l.debit - l.credit; if (!amt) return;
        const rule = (map.byProject || {})[l.project] || (map.byAccount || {})[l.account] || map.default || 'program';
        const pcts = typeof rule === 'string' ? { [rule]: 100 } : rule, row = rows.get(l.account) || { code: l.account, name: a.name, program: 0, management: 0, fundraising: 0, total: 0 };
        const keys = FUNCTIONS.filter(f => pcts[f]); let left = amt;
        keys.forEach((f, i) => { const part = i === keys.length - 1 ? left : Math.round(amt * pcts[f] / 100); row[f] += part; left -= part; });
        row.total += amt; rows.set(l.account, row); }); });
    const list = [...rows.values()].sort((x, y) => x.code < y.code ? -1 : 1), tot = { program: 0, management: 0, fundraising: 0, total: 0 };
    list.forEach(r => FUNCTIONS.concat('total').forEach(k => { tot[k] += r[k]; }));
    return { from, to, rows: list, total: tot };
  }

  // Every line of every entry, flat — for the accountant's spreadsheet
  function ledgerRows(L, { from, to } = {}) {
    const out = [];
    L.entries.forEach(e => { if ((from && e.date < from) || (to && e.date > to)) return;
      e.lines.forEach(l => { const a = L.account(l.account), f = L.fund(l.fund);
        out.push({ date: e.date, entry: e.id, memo: e.memo, account: l.account, accountName: a ? a.name : '', type: a ? a.type : '', fund: l.fund, fundName: f ? f.name : '', budget: l.project || '', party: l.party || '',
          debit: l.debit, credit: l.credit, source: e.source ? `${e.source.type}:${e.source.id}` : '', reverses: e.reverses || '', postedBy: e.postedBy }); }); });
    return out;
  }

  // How much of a bank account belongs to each fund.
  function cashByFund(L, account, { through } = {}) {
    const byFund = L.funds.map(f => ({ fund: f.id, name: f.name, amount: L.natural(account, { fund: f.id, through }) })).filter(r => r.amount);
    return { account, total: sumBy(byFund, r => r.amount), byFund };
  }

  // Spending against each budget. Projects roll up into the ministry they sit inside.
  // budgets: [{ name, budget (cents), parent? }]
  // committed: { [budget name]: cents } — approved spending requests not bought yet. They aren't
  // in the books (nothing has been spent), but they're promised, so they come out of what's left.
  function budgetVsActual(L, budgets, { from, to, committed = {} } = {}) {
    const own = name => L.balance({ type: 'expense', project: name, from, through: to });
    const ownIn = name => 0 - L.balance({ type: 'income', project: name, from, through: to });   // e.g. event sign-ups
    const roll = (b, f) => f(b.name) + sumBy(budgets.filter(k => k.parent === b.name), k => roll(k, f));
    return budgets.map(b => {
      const a = roll(b, own), c = roll(b, n => committed[n] || 0), inc = roll(b, ownIn);
      return { name: b.name, parent: b.parent || null, budget: b.budget, actual: a, committed: c, income: inc, net: a - inc, left: b.budget - a - c, over: a + c > b.budget };
    });
  }

  // What each payee was paid out of the given accounts in a date range — built from the
  // "who was paid" (party) tag on lines. Pass the bank accounts to get what counts for 1099s
  // (check, ACH, cash); card payments are reported by the card company instead.
  // A refund from a payee (a debit back into the bank) reduces their total.
  function paidByParty(L, { accounts, from, to }) {
    const totals = new Map();
    for (const e of L.entries) {
      if (from && e.date < from) continue;
      if (to && e.date > to) continue;
      for (const l of e.lines) {
        if (!l.party || !accounts.includes(l.account)) continue;
        totals.set(l.party, (totals.get(l.party) || 0) + l.credit - l.debit);
      }
    }
    return [...totals].map(([party, amount]) => ({ party, amount })).filter(r => r.amount !== 0).sort((a, b) => b.amount - a.amount);
  }

  // Bank reconciliation for one account as of a statement date.
  // cleared: entry ids already seen on a bank statement (this one or earlier ones).
  // Everything else in the books up to that date is either a check/payment the bank hasn't
  // paid yet (outstanding) or a deposit it hasn't received yet (in transit).
  //   adjusted bank = statement balance − outstanding + in transit   →   must equal the books
  function reconciliation(L, { account, through, statementBalance, cleared }) {
    const isCleared = id => cleared instanceof Set ? cleared.has(id) : (cleared || []).includes(id);
    const items = [];
    for (const e of L.entries) {
      if (through && e.date > through) continue;
      const amt = e.lines.filter(l => l.account === account).reduce((s, l) => s + l.debit - l.credit, 0);
      if (!amt) continue;
      items.push({ entry: e.id, date: e.date, memo: e.memo, amount: amt, cleared: isCleared(e.id) });
    }
    const open = items.filter(i => !i.cleared);
    const outstanding = open.filter(i => i.amount < 0), inTransit = open.filter(i => i.amount > 0);
    const book = L.natural(account, { through });
    const out = 0 - sumBy(outstanding, i => i.amount), dit = sumBy(inTransit, i => i.amount);
    const adjusted = statementBalance - out + dit;
    return { account, through, statementBalance, book, outstanding, inTransit, outstandingTotal: out, inTransitTotal: dit,
      adjusted, difference: adjusted - book, balanced: adjusted === book, items };
  }

  // Things a board should hear about for a period: large spending, money moved between funds,
  // reversals (corrections and voided checks). over: cents — spending at or above this is "large".
  function notable(L, { from, to, over = 100000 } = {}) {
    const out = [];
    for (const e of L.entries) {
      if ((from && e.date < from) || (to && e.date > to)) continue;
      const exp = e.lines.filter(l => { const a = L.account(l.account); return a.type === 'expense' && a.sub !== 'transfer' && a.sub !== 'payroll'; }).reduce((s, l) => s + l.debit - l.credit, 0);   // payroll is routine
      const moved = e.lines.filter(l => l.account === '5950').reduce((s, l) => s + l.debit, 0);
      if (e.reverses) out.push({ kind: 'reversal', entry: e.id, date: e.date, memo: e.memo, amount: e.lines.reduce((s, l) => s + l.debit, 0) });
      else if (moved) out.push({ kind: 'transfer', entry: e.id, date: e.date, memo: e.memo, amount: moved });
      else if (exp >= over && !(e.source && String(e.source.type).startsWith('import'))) out.push({ kind: 'large', entry: e.id, date: e.date, memo: e.memo, amount: exp });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  // Quick health check for the Books page: the things that must always be true, and warnings.
  function health(L, { through } = {}) {
    const tb = trialBalance(L, { through }), bs = balanceSheet(L, { through });
    const checks = [
      { ok: tb.balanced, text: 'Debits equal credits' },
      { ok: bs.balanced, text: 'Every fund balances on its own' },
    ];
    const banks = L.accounts.filter(a => ['bank', 'cash', 'transit'].includes(a.sub));
    L.funds.forEach(f => {
      const cash = sumBy(banks, a => L.natural(a.code, { fund: f.id, through }));
      if (cash < 0) checks.push({ ok: false, warn: true, text: `${f.name} has spent ${(-cash / 100).toFixed(2)} more cash than it has. Record a loan from another fund or move money in.` });
    });
    return { ok: checks.every(c => c.ok), checks };
  }

  return { trialBalance, netAssets, projectReport, cashFlows, functionalExpenses, ledgerRows, balanceSheet, activities, cashByFund, budgetVsActual, paidByParty, reconciliation, notable, health };
});
