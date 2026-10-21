// Church Books engine — posting rules. Each function turns one everyday event into a ready-to-post entry.
// They only build entries; ledger.post() checks and saves them. All amounts are whole cents.
//
// Shared cash: the church has one checking account, but every fund owns a slice of it.
// So every line that touches a bank account carries a fund. The bank's real balance is the
// sum across funds, and each fund always balances on its own.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ledger.js'));
  else root.BooksRules = factory(root.BooksLedger);
})(typeof self !== 'undefined' ? self : this, function (Ledger) {
  const { splitCents, LedgerError } = Ledger;
  const fail = (code, msg) => { throw new LedgerError(code, msg); };

  function addTo(map, fund, n) { map.set(fund, (map.get(fund) || 0) + n); }

  // Gifts arriving in the bank: an online-giving payout, or a counted cash & check deposit.
  // giving:   the church's giving funds from its setup — { [id]: { account, split: [{ to, pct }] } }
  //           (build it with BooksSetup.givingRules(setup))
  // byGiving: { [givingId]: cents }    fee: processor fee in cents (0 for cash)
  // feeFund:  the fund that absorbs processing fees, so designated gifts stay whole
  function giftsDeposit({ date, source, memo, byGiving, fee = 0, giving, bank, feeFund }) {
    if (!giving) fail('no_giving', 'Pass the church\'s giving funds');
    if (!bank) fail('no_bank', 'Say which bank account the deposit landed in');
    if (fee && !feeFund) fail('no_fee_fund', 'Say which fund pays processing fees');
    const lines = [], cash = new Map();
    for (const [g, amt] of Object.entries(byGiving)) {
      if (!amt) continue;
      const def = giving[g] || fail('no_giving', `Unknown giving fund: ${g}`);
      if (def.split.reduce((s, p) => s + p.pct, 0) !== 100) fail('bad_alloc', `The ${g} split must add up to 100%`);
      for (const p of splitCents(amt, def.split)) {
        if (!p.cents) continue;
        lines.push({ account: def.account, fund: p.to, credit: p.cents });
        addTo(cash, p.to, p.cents);
      }
    }
    if (fee) { lines.push({ account: '5500', fund: feeFund, debit: fee, memo: 'Processing fee' }); addTo(cash, feeFund, -fee); }
    for (const [fund, n] of cash) {
      if (n > 0) lines.unshift({ account: bank, fund, debit: n });
      else if (n < 0) lines.unshift({ account: bank, fund, credit: -n });
    }
    return { date, memo, source, lines };
  }

  // One purchase can be split across budgets and funds: half Youth, half Hospitality.
  // Pass either one expense (amount, expense, fund, project) or splits: [{ amount, expense, fund, project }].
  // The pieces must add up to the receipt total exactly.
  function pieces({ amount, expense, fund, project, splits }) {
    const parts = splits && splits.length ? splits : [{ amount, expense, fund, project }];
    parts.forEach((p, i) => {
      if (!Number.isInteger(p.amount) || p.amount <= 0) fail('bad_split', `Split ${i + 1} needs an amount above zero`);
      if (!p.expense || !p.fund) fail('bad_split', `Split ${i + 1} needs a category and a fund`);
    });
    const total = parts.reduce((s, p) => s + p.amount, 0);
    if (splits && splits.length && amount != null && total !== amount) fail('split_total', `The splits add up to ${(total / 100).toFixed(2)}, but the receipt is ${(amount / 100).toFixed(2)}`);
    return parts;
  }
  // The expense lines, then one paying line per fund (each fund pays for its own share).
  function spendLines(parts, payAccount, party) {
    const lines = parts.map(p => ({ account: p.expense, fund: p.fund, debit: p.amount, project: p.project, party }));
    const byFund = new Map();
    parts.forEach(p => addTo(byFund, p.fund, p.amount));
    for (const [fund, n] of byFund) lines.push({ account: payAccount, fund, credit: n, party });
    return lines;
  }

  // A purchase on a church card: the expense now, owed to the card company until the bill is paid.
  function cardCharge({ date, source, memo, card, party, ...spend }) {
    return { date, memo, source, lines: spendLines(pieces(spend), card, party) };
  }

  // Paying the card bill. owedByFund comes from the ledger: how much of the card balance
  // each fund ran up. A partial payment is shared out in the same proportions.
  function cardPayment({ date, source, memo, card, bank, amount, owedByFund }) {
    const owed = Object.entries(owedByFund).filter(([, n]) => n > 0);
    const total = owed.reduce((s, [, n]) => s + n, 0);
    if (!total) fail('nothing_owed', 'Nothing is owed on this card');
    if (amount > total) fail('overpay', 'That is more than the card balance');
    const parts = splitCents(amount, owed.map(([fund, n]) => ({ fund, pct: n / total * 100 })));
    const lines = [];
    parts.forEach(p => { if (p.cents) lines.push({ account: card, fund: p.fund, debit: p.cents }, { account: bank, fund: p.fund, credit: p.cents }); });
    return { date, memo, source, lines };
  }

  // Paid straight from the bank: a check, an ACH, or paying someone back.
  function bankPayment({ date, source, memo, bank, party, ...spend }) {
    if (!bank) fail('no_bank', 'Say which bank account it was paid from');
    return { date, memo, source, lines: spendLines(pieces(spend), bank, party) };
  }

  // A vendor's bill, approved but not paid yet: the expense now, owed in "Bills to pay" (2100)
  // until it's paid. Takes the same single expense or splits as a card charge.
  function billReceived({ date, source, memo, vendor, payable = '2100', ...spend }) {
    if (!vendor) fail('no_vendor', 'Say who the bill is from');
    return { date, memo, source, lines: spendLines(pieces(spend), payable, vendor) };
  }

  // Paying a bill. byFund: how much of it each fund owes (from the bill's own lines),
  // so each fund pays its own share. Partial payments are allowed; overpaying isn't.
  function billPayment({ date, source, memo, vendor, bank, byFund, amount, payable = '2100' }) {
    if (!vendor) fail('no_vendor', 'Say who is being paid');
    if (!bank) fail('no_bank', 'Say which bank account it was paid from');
    const owed = Object.entries(byFund).filter(([, n]) => n > 0);
    const total = owed.reduce((s, [, n]) => s + n, 0);
    if (!total) fail('nothing_owed', 'Nothing is owed on this bill');
    const pay = amount == null ? total : amount;
    if (!Number.isInteger(pay) || pay <= 0) fail('bad_amount', 'Payments are positive whole cents');
    if (pay > total) fail('overpay', 'That is more than is owed on the bill');
    const shares = splitCents(pay, owed.map(([fund, n]) => ({ fund, pct: n / total * 100 })));
    const lines = [];
    shares.forEach(p => { if (p.cents) lines.push({ account: payable, fund: p.fund, debit: p.cents, party: vendor }, { account: bank, fund: p.fund, credit: p.cents, party: vendor }); });
    return { date, memo, source, lines };
  }

  // Moving money between the church's own bank accounts. Not income, not spending.
  function bankTransfer({ date, source, memo, from, to, amount, fund }) {
    if (from === to) fail('same_account', 'Pick two different accounts');
    return { date, memo, source, lines: [
      { account: to, fund, debit: amount },
      { account: from, fund, credit: amount },
    ] };
  }

  // Moving money from one fund to another (on paper — the cash stays in the same bank account).
  // Money given for a purpose can't be moved out without the board saying so. Setting money aside in a
  // board-designated fund (or releasing it) is also the board's decision.
  function fundTransfer({ date, source, memo, fromFund, toFund, amount, bank, restrictedFrom = false, designatedFrom = false, designatedTo = false, boardApproved = false }) {
    if (fromFund === toFund) fail('same_fund', 'Pick two different funds');
    if (restrictedFrom && !boardApproved) fail('restricted', 'Money given for a purpose can only leave its fund with board approval');
    if ((designatedFrom || designatedTo) && !boardApproved) fail('designated', 'Setting money aside for a board purpose, or releasing it, is a board decision — mark it board-approved');
    return { date, memo, source, lines: [
      { account: '5950', fund: fromFund, debit: amount },
      { account: bank, fund: fromFund, credit: amount },
      { account: bank, fund: toFund, debit: amount },
      { account: '4950', fund: toFund, credit: amount },
    ] };
  }

  // One payday from the payroll service. rows: [{ fund, wages, housing, employerTax, project? }] in cents.
  // The service pulls pay plus taxes from the bank, so it all comes out of the bank that day.
  function payroll({ date, source, memo, rows, bank }) {
    const lines = [];
    for (const r of rows) {
      let out = 0;
      if (r.wages) { lines.push({ account: '5000', fund: r.fund, debit: r.wages, project: r.project }); out += r.wages; }
      if (r.housing) { lines.push({ account: '5010', fund: r.fund, debit: r.housing, project: r.project }); out += r.housing; }
      if (r.employerTax) { lines.push({ account: '5020', fund: r.fund, debit: r.employerTax, project: r.project }); out += r.employerTax; }
      if (out) lines.push({ account: bank, fund: r.fund, credit: out });
    }
    return { date, memo, source, lines };
  }

  // Sign-up money for events (e.g. Planning Center Registrations), recorded straight to each event.
  // byEvent: [{ project, fund, amount }] in cents · fee: processor fee (one Processing fees expense, like giving)
  // An event that hasn't happened yet: the money is held as "received for future events" (2400) — it's owed to
  // the event (or a refund) until the event takes place. byEvent items with deferred: true go there instead of income.
  function eventIncome({ date, source, memo, bank, byEvent, fee = 0, feeFund, account = '4100' }) {
    if (!bank) fail('no_bank', 'Say which bank account it landed in');
    if (fee && !feeFund) fail('no_fee_fund', 'Say which fund pays processing fees');
    const lines = [], cash = new Map();
    byEvent.forEach((e, i) => {
      if (!Number.isInteger(e.amount) || e.amount <= 0) fail('bad_amount', `Event ${i + 1}: amounts are positive whole cents`);
      if (!e.project || !e.fund) fail('no_event', `Event ${i + 1}: say which event budget it belongs to`);
      lines.push({ account: e.deferred ? '2400' : account, fund: e.fund, credit: e.amount, project: e.project }); addTo(cash, e.fund, e.amount);
    });
    if (fee) { lines.push({ account: '5500', fund: feeFund, debit: fee, memo: 'Processing fee' }); addTo(cash, feeFund, -fee); }
    for (const [fund, n] of cash) {
      if (n > 0) lines.unshift({ account: bank, fund, debit: n });
      else if (n < 0) lines.unshift({ account: bank, fund, credit: -n });
    }
    return { date, memo, source, lines };
  }
  // A refund to someone who cancelled: the event's income goes down by that much.
  // deferred: the event hasn't happened, so the refund comes out of "received for future events"
  function eventRefund({ date, source, memo, bank, project, fund, amount, account = '4100', deferred = false }) {
    if (!bank) fail('no_bank', 'Say which bank account it came out of');
    return { date, memo, source, lines: [{ account: deferred ? '2400' : account, fund, debit: amount, project }, { account: bank, fund, credit: amount }] };
  }
  // The event happened: what was held for it becomes its income.
  function recognizeEventIncome({ date, source, memo, project, fund, amount, account = '4100' }) {
    if (!(amount > 0)) fail('no_amount', 'Nothing is held for this event');
    return { date, memo, source, lines: [{ account: '2400', fund, debit: amount, project }, { account, fund, credit: amount, project }] };
  }
  // End of a ministry's season: what it brought in and didn't use moves to another budget in the same fund
  // (e.g. MomCo's leftover dues go to help pay for childcare). Nothing leaves the bank; only the budget tag changes.
  function moveLeftover({ date, source, memo, fund, account = '4100', fromProject, toProject, amount }) {
    if (!(amount > 0)) fail('no_amount', 'Nothing left over to move');
    if (!fromProject || !toProject || fromProject === toProject) fail('bad_project', 'Pick a different budget to move it to');
    return { date, memo, source, lines: [{ account, fund, debit: amount, project: fromProject }, { account, fund, credit: amount, project: toProject }] };
  }
  // A month's depreciation: the cost of buildings and equipment spread over their useful lives. Nothing leaves the bank.
  // byFund: [{ fund, amount }] (cents)
  function depreciation({ date, source, memo, byFund }) {
    const parts = byFund.filter(p => p.amount);
    if (!parts.length) fail('no_amount', 'No depreciation to record');
    const lines = [];
    parts.forEach(p => { lines.push({ account: '5800', fund: p.fund, debit: p.amount }); lines.push({ account: '1690', fund: p.fund, credit: p.amount }); });
    return { date, memo, source, lines };
  }
  // Buying a building, equipment or a vehicle: it becomes an asset (cost), not an expense.
  function assetPurchase({ date, source, memo, bank, fund, amount, account, party }) {
    if (!/^16[0-4]0$/.test(account || '')) fail('bad_account', 'Pick the kind of asset');
    return { date, memo, source, lines: [{ account, fund, debit: amount, party }, { account: bank, fund, credit: amount, party }] };
  }
  // Selling or scrapping an asset: its cost and depreciation come off the books; the difference from what came in is a gain or loss.
  function assetDisposal({ date, source, memo, bank, fund, cost, accumulated, proceeds = 0, account }) {
    const book = cost - accumulated, diff = proceeds - book, lines = [{ account: '1690', fund, debit: accumulated }, { account, fund, credit: cost }];
    if (proceeds) lines.unshift({ account: bank, fund, debit: proceeds });
    if (diff > 0) lines.push({ account: '4810', fund, credit: diff });
    if (diff < 0) lines.push({ account: '4810', fund, debit: -diff });
    return { date, memo, source, lines: lines.filter(l => l.debit || l.credit) };
  }

  // Payroll lines from the staff list. Each person: { gross (cents per payday), clergy, allocation: [{ fund, project, pct }] }
  // Pay, housing allowance (clergy only) and employer taxes (not for clergy — they pay SECA themselves)
  // are each split by the allocation to the cent, then combined by fund and budget.
  function payrollRows(staff, { housingShare = 0, employerTaxRate = 0.0765 } = {}) {
    const rows = new Map();
    staff.forEach((s, i) => {
      const alloc = s.allocation || [];
      if (!alloc.length) fail('no_allocation', `Staff member ${i + 1} isn't assigned to a fund`);
      const total = alloc.reduce((t, a) => t + a.pct, 0);
      if (Math.abs(total - 100) > 1e-9) fail('bad_allocation', `Staff member ${i + 1}'s split adds up to ${total}%, not 100%`);
      const housing = s.clergy ? Math.round(s.gross * housingShare) : 0;
      const pieces = { wages: splitCents(s.gross - housing, alloc), housing: splitCents(housing, alloc), employerTax: splitCents(s.clergy ? 0 : Math.round(s.gross * employerTaxRate), alloc) };
      alloc.forEach((a, k) => {
        const key = a.fund + '|' + (a.project || '');
        const r = rows.get(key) || { fund: a.fund, project: a.project, wages: 0, housing: 0, employerTax: 0 };
        r.wages += pieces.wages[k].cents; r.housing += pieces.housing[k].cents; r.employerTax += pieces.employerTax[k].cents;
        rows.set(key, r);
      });
    });
    return [...rows.values()];
  }

  // Starting point when the church starts using the books: what each fund has in each account, and owes on each card.
  // assets / liabilities: [{ account, fund, amount }]
  function openingBalances({ date, assets = [], liabilities = [] }) {
    const lines = [], net = new Map();
    assets.forEach(a => { if (a.amount) { lines.push({ account: a.account, fund: a.fund, debit: a.amount }); addTo(net, a.fund, a.amount); } });
    liabilities.forEach(l => { if (l.amount) { lines.push({ account: l.account, fund: l.fund, credit: l.amount }); addTo(net, l.fund, -l.amount); } });
    for (const [fund, n] of net) lines.push(n >= 0 ? { account: '3000', fund, credit: n } : { account: '3000', fund, debit: -n });
    return { date, memo: 'Opening balances', source: { type: 'opening', id: date }, lines };
  }

  // Taking counted cash and checks to the bank. Counting posts gifts into 1100 (counted, not yet
  // deposited); this moves them into the bank account, fund by fund. One deposit can carry
  // several counts (two Sundays in one trip). byFund: { fund: cents } — what's in the bag.
  function deposit({ date, source, memo, bank, byFund, holding = '1100' }) {
    if (!bank) fail('no_bank', 'Say which bank account it went into');
    const lines = [];
    Object.entries(byFund).forEach(([fund, n]) => {
      if (!n) return;
      if (!Number.isInteger(n) || n < 0) fail('bad_amount', 'Deposit amounts are positive whole cents');
      lines.push({ account: bank, fund, debit: n }, { account: holding, fund, credit: n });
    });
    if (!lines.length) fail('empty_deposit', 'Nothing to deposit');
    return { date, memo, source, lines };
  }

  // Paying someone back for something they bought with their own money. Same two steps as a
  // bill: approved → the church owes them (2150 Reimbursements owed) → paid by ACH or check.
  const reimbursementOwed = ({ person, ...o }) => billReceived({ ...o, vendor: person, payable: '2150' });
  const reimbursementPayment = ({ person, ...o }) => billPayment({ ...o, vendor: person, payable: '2150' });

  // A gift of something other than money, at its fair value the day it arrived. toAccount says what
  // happens to it: '1300' (to be sold, like stock), '1600' (kept and used, like a van) or an expense
  // account (used up, like coffee supplies). byFund: [{ fund, amount }] — e.g. the giving fund's split.
  function nonCashGift({ date, source, memo, byFund, toAccount, party }) {
    if (!toAccount) fail('no_account', 'Say whether the gift will be sold, kept or used up');
    const parts = (byFund || []).filter(p => p.amount);
    if (!parts.length) fail('no_value', 'A non-cash gift needs its fair value');
    parts.forEach(p => { if (!Number.isInteger(p.amount) || p.amount < 0) fail('bad_amount', 'Amounts are whole cents'); });
    const lines = [];
    parts.forEach(p => { lines.push({ account: toAccount, fund: p.fund, debit: p.amount, party }); lines.push({ account: '4800', fund: p.fund, credit: p.amount, party }); });
    return { date, memo, source, lines };
  }
  // Selling a donated item (stock, crypto, goods): the money lands in the bank, the item leaves 1300,
  // and the difference from its value on the gift day is a gain or loss. Each fund keeps its share.
  // byFund: what each fund recorded for the item [{ fund, amount }]. proceeds / fee in cents. fromAccount: 1300,
  // or 1600 when the church sells something it had kept and used.
  function saleOfDonatedItem({ date, source, memo, byFund, proceeds, fee = 0, bank, fromAccount = '1300' }) {
    if (!bank) fail('no_bank', 'Say which bank account the money landed in');
    const parts = byFund.filter(p => p.amount), carrying = parts.reduce((s, p) => s + p.amount, 0), net = proceeds - fee;
    if (!carrying) fail('no_value', 'Nothing recorded for this item');
    if (!Number.isInteger(net) || net < 0) fail('bad_amount', 'The money received has to be whole cents, after fees');
    // share the money received the same way the item was recorded; leftover cents go to the largest share
    const shares = parts.map(p => Math.floor(net * p.amount / carrying)); let left = net - shares.reduce((a, b) => a + b, 0);
    const order = parts.map((p, i) => i).sort((i, j) => parts[j].amount - parts[i].amount);
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) shares[order[k]]++;
    const lines = [];
    parts.forEach((p, i) => {
      if (shares[i]) lines.push({ account: bank, fund: p.fund, debit: shares[i] });
      lines.push({ account: fromAccount, fund: p.fund, credit: p.amount });
      const diff = shares[i] - p.amount;
      if (diff > 0) lines.push({ account: '4810', fund: p.fund, credit: diff });
      if (diff < 0) lines.push({ account: '4810', fund: p.fund, debit: -diff });
    });
    return { date, memo, source, lines };
  }

  // A rental payment. Up to the fair value of the use of the space it's rent (building rental income) —
  // even when the renter calls it a donation. Only what's above the fair value is a gift.
  // rent / gift in cents; giftByFund: how the gift part is split [{ fund, amount }] (e.g. by the giving fund's split).
  function rentalPayment({ date, source, memo, bank, fund, rent, giftByFund = [], giftAccount, party }) {
    if (!bank) fail('no_bank', 'Say which bank account the money landed in');
    const gifts = giftByFund.filter(p => p.amount), lines = [], cash = new Map();
    if (rent) { lines.push({ account: '4200', fund, credit: rent, party }); cash.set(fund, rent); }
    if (gifts.length && !giftAccount) fail('no_account', 'Say which giving account the gift part goes to');
    gifts.forEach(p => { lines.push({ account: giftAccount, fund: p.fund, credit: p.amount, party }); cash.set(p.fund, (cash.get(p.fund) || 0) + p.amount); });
    if (!lines.length) fail('no_amount', 'Nothing was paid');
    for (const [f, n] of cash) lines.unshift({ account: bank, fund: f, debit: n });
    return { date, memo, source, lines };
  }
  // A security deposit: held for the renter (it's theirs — a liability), then returned or kept for damage.
  function rentalDeposit({ date, source, memo, bank, fund, amount, action }) {
    if (!amount) fail('no_amount', 'A deposit needs an amount');
    const lines = action === 'receive' ? [{ account: bank, fund, debit: amount }, { account: '2300', fund, credit: amount }]
      : action === 'return' ? [{ account: '2300', fund, debit: amount }, { account: bank, fund, credit: amount }]
      : action === 'keep' ? [{ account: '2300', fund, debit: amount }, { account: '4200', fund, credit: amount, memo: 'Deposit kept for damage' }]
      : fail('bad_action', 'A deposit is received, returned or kept');
    return { date, memo, source, lines };
  }

  return { moveLeftover, recognizeEventIncome, depreciation, assetPurchase, assetDisposal, rentalPayment, rentalDeposit, nonCashGift, saleOfDonatedItem, eventIncome, eventRefund, payrollRows, deposit, reimbursementOwed, reimbursementPayment, giftsDeposit, cardCharge, cardPayment, bankPayment, billReceived, billPayment, bankTransfer, fundTransfer, payroll, openingBalances };
});
