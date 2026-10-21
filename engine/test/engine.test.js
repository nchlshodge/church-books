const test = require('node:test');
const assert = require('node:assert');
const { fromJSON, cents, splitCents } = require('../ledger.js');
const R = require('../rules.js');
const Rep = require('../reports.js');
const S = require('../setup.js');
const SETUP = require('../../churches/rcc-kb/setup.js');
const GIV = S.givingRules(SETUP);

let tick = 0;
const books = () => S.createBooks(SETUP, { clock: () => `2026-10-18T12:00:${String(tick++ % 60).padStart(2, '0')}Z` });
const code = fn => { try { fn(); } catch (e) { return e.code; } return null; };
const opening = L => L.post(R.openingBalances({ date: '2026-10-01',
  assets: [{ account: '1000', fund: 'gen', amount: cents(80000) }, { account: '1000', fund: 'mis', amount: cents(20000) }, { account: '1010', fund: 'bld', amount: cents(150000) }],
  liabilities: [{ account: '2000', fund: 'gen', amount: cents(3000) }] }), 'nick');

test('money is whole cents, and splits always add back to the exact total', () => {
  assert.strictEqual(cents('1,234.56'), 123456);
  assert.strictEqual(cents(0.1 + 0.2), 30);
  const parts = splitCents(10001, [{ pct: 50 }, { pct: 35 }, { pct: 15 }]);
  assert.deepStrictEqual(parts.map(p => p.cents), [5001, 3500, 1500]);
  assert.strictEqual(parts.reduce((s, p) => s + p.cents, 0), 10001);
  assert.strictEqual(code(() => cents('abc')), 'bad_amount');
});

test('an entry must balance — overall and inside every fund', () => {
  const L = books();
  const ok = { date: '2026-10-05', memo: 'Test', lines: [{ account: '1000', fund: 'gen', debit: 500 }, { account: '4000', fund: 'gen', credit: 500 }] };
  assert.ok(L.post(ok).id);
  assert.strictEqual(code(() => L.post({ ...ok, lines: [{ account: '1000', fund: 'gen', debit: 500 }, { account: '4000', fund: 'gen', credit: 400 }] })), 'unbalanced');
  // balances overall but not per fund: Operating's cash paired with Missions' income
  assert.strictEqual(code(() => L.post({ ...ok, lines: [{ account: '1000', fund: 'gen', debit: 500 }, { account: '4000', fund: 'mis', credit: 500 }] })), 'unbalanced');
});

test('bad lines are refused with a plain reason', () => {
  const L = books();
  const e = lines => ({ date: '2026-10-05', memo: 'x', lines });
  assert.strictEqual(code(() => L.post(e([{ account: '9999', fund: 'gen', debit: 1 }, { account: '4000', fund: 'gen', credit: 1 }]))), 'no_account');
  assert.strictEqual(code(() => L.post(e([{ account: '1000', fund: 'zzz', debit: 1 }, { account: '4000', fund: 'zzz', credit: 1 }]))), 'no_fund');
  assert.strictEqual(code(() => L.post(e([{ account: '1000', fund: 'gen', debit: 1.5 }, { account: '4000', fund: 'gen', credit: 1.5 }]))), 'bad_amount');
  assert.strictEqual(code(() => L.post(e([{ account: '1000', fund: 'gen', debit: 1, credit: 1 }, { account: '4000', fund: 'gen', credit: 1 }]))), 'bad_line');
  assert.strictEqual(code(() => L.post(e([{ account: '1000', fund: 'gen', debit: 1 }]))), 'too_few_lines');
  assert.strictEqual(code(() => L.post({ ...e([{ account: '1000', fund: 'gen', debit: 1 }, { account: '4000', fund: 'gen', credit: 1 }]), date: '10/5/2026' })), 'bad_date');
  assert.strictEqual(code(() => L.post({ ...e([{ account: '1000', fund: 'gen', debit: 1 }, { account: '4000', fund: 'gen', credit: 1 }]), memo: ' ' })), 'no_memo');
  L.deactivateAccount('4200');
  assert.strictEqual(code(() => L.post(e([{ account: '1000', fund: 'gen', debit: 1 }, { account: '4200', fund: 'gen', credit: 1 }]))), 'inactive_account');
});

test('entries are permanent: the same import never posts twice, and posted entries cannot be edited', () => {
  const L = books();
  const draft = R.giftsDeposit({ date: '2026-10-15', memo: 'Payout', source: { type: 'pco_payout', id: 'po_1' }, byGiving: { tithe: 10000 }, fee: 300, giving: GIV, bank: '1000', feeFund: 'gen' });
  const e = L.post(draft);
  assert.strictEqual(code(() => L.post(draft)), 'duplicate');
  assert.strictEqual(L.findBySource('pco_payout', 'po_1').id, e.id);
  assert.ok(Object.isFrozen(e) && Object.isFrozen(e.lines[0]));
  try { e.lines[0].debit = 1; e.memo = 'changed'; } catch (_) { /* strict mode throws; either way nothing changes */ }
  assert.strictEqual(L.get(e.id).memo, 'Payout');
  assert.notStrictEqual(L.get(e.id).lines[0].debit, 1);
});

test('mistakes are fixed by reversing, never deleting — once, with a reason', () => {
  const L = books();
  const e = L.post(R.bankPayment({ bank: '1000', date: '2026-10-09', memo: 'Hope Haven', amount: 50000, expense: '5410', fund: 'gen' }));
  assert.strictEqual(code(() => L.reverse(e.id, {})), 'no_reason');
  const r = L.reverse(e.id, { reason: 'Wrong fund', by: 'nick' });
  assert.strictEqual(r.reverses, e.id);
  assert.strictEqual(L.balance({ account: '5410' }), 0);
  assert.strictEqual(L.entries.length, 2);
  assert.strictEqual(code(() => L.reverse(e.id, { reason: 'again' })), 'already_reversed');
  assert.strictEqual(code(() => L.reverse(r.id, { reason: 'undo' })), 'cant_reverse');
});

test('a locked month takes no new entries; corrections go in an open month', () => {
  const L = books();
  const e = L.post(R.bankPayment({ bank: '1000', date: '2026-09-20', memo: 'Sept bill', amount: 1000, expense: '5200', fund: 'gen' }));
  L.lock('2026-09-30', 'nick');
  assert.strictEqual(code(() => L.post(R.bankPayment({ bank: '1000', date: '2026-09-25', memo: 'late', amount: 1, expense: '5200', fund: 'gen' }))), 'locked');
  assert.strictEqual(code(() => L.reverse(e.id, { reason: 'oops' })), 'locked');                 // defaults to the original date
  assert.ok(L.reverse(e.id, { reason: 'oops', date: '2026-10-02' }));                              // fixed in October
  assert.strictEqual(code(() => L.lock('2026-08-31')), 'cant_unlock');
  assert.strictEqual(code(() => L.unlock(null, '')), 'no_reason');
  L.unlock('2026-08-31', 'Auditor adjustment', 'nick');
  assert.strictEqual(L.lockedThrough, '2026-08-31');
  assert.deepStrictEqual(L.audit.filter(a => a.action === 'lock' || a.action === 'unlock').map(a => a.action), ['lock', 'unlock']);
});

test('a Planning Center payout: tithes to Operating, Kingdom Builders split, fee from Operating, cash lands per fund', () => {
  const L = books();
  L.post(R.giftsDeposit({ date: '2026-10-17', memo: 'PCO payout Oct 17', source: { type: 'pco_payout', id: 'po_9' },
    byGiving: { tithe: cents(760), kb: cents(175) }, fee: cents(29.42), giving: GIV, bank: '1000', feeFund: 'gen' }));
  assert.strictEqual(L.natural('4000', { fund: 'gen' }), cents(760));
  assert.strictEqual(L.natural('4010', { fund: 'mis' }), cents(87.50));
  assert.strictEqual(L.natural('4010', { fund: 'bld' }), cents(61.25));
  assert.strictEqual(L.natural('4010', { fund: 'prj' }), cents(26.25));
  assert.strictEqual(L.natural('5500', { fund: 'gen' }), cents(29.42));
  assert.strictEqual(L.natural('1000'), cents(905.58));                         // matches the bank deposit
  assert.strictEqual(L.natural('1000', { fund: 'gen' }), cents(760 - 29.42));
  assert.strictEqual(code(() => R.giftsDeposit({ date: '2026-10-17', memo: 'x', byGiving: { kb: 100 }, bank: '1000', giving: { kb: { account: '4010', split: [{ to: 'mis', pct: 60 }] } } })), 'bad_alloc');
});

test('card charges are owed by the fund that spent; paying the bill takes cash from those same funds', () => {
  const L = books(); opening(L);
  L.post(R.cardCharge({ date: '2026-10-13', memo: 'Home Depot', card: '2020', amount: cents(388.02), expense: '5220', fund: 'prj', project: 'Youth room remodel' }));
  L.post(R.cardCharge({ date: '2026-10-16', memo: "Lowe's", card: '2020', amount: cents(142.88), expense: '5220', fund: 'gen' }));
  L.post(R.giftsDeposit({ date: '2026-10-15', memo: 'gifts', byGiving: { kb: cents(1000) }, giving: GIV, bank: '1000', feeFund: 'gen' }));
  const owed = Object.fromEntries(L.funds.map(f => [f.id, L.natural('2020', { fund: f.id })]));
  L.post(R.cardPayment({ bank: '1000', date: '2026-10-20', memo: 'Facilities card bill', card: '2020', amount: cents(530.90), owedByFund: owed }));
  assert.strictEqual(L.natural('2020'), 0);
  assert.strictEqual(L.natural('1000', { fund: 'prj' }), cents(150 - 388.02));  // Projects paid for its own purchase
  assert.strictEqual(L.natural('5220', { project: 'Youth room remodel' }), cents(388.02));
  assert.strictEqual(code(() => R.cardPayment({ bank: '1000', date: '2026-10-21', memo: 'x', card: '2020', amount: 1, owedByFund: {} })), 'nothing_owed');
});

test('moving money: between bank accounts is neither income nor spending; between funds needs approval for restricted money', () => {
  const L = books(); opening(L);
  L.post(R.bankTransfer({ date: '2026-10-10', memo: 'Savings to checking', from: '1010', to: '1000', amount: cents(5000), fund: 'bld' }));
  assert.strictEqual(L.balance({ type: 'income' }) + L.balance({ type: 'expense' }), 0);
  assert.strictEqual(L.natural('1000', { fund: 'bld' }), cents(5000));
  assert.strictEqual(code(() => R.fundTransfer({ bank: '1000', date: '2026-10-11', memo: 'x', fromFund: 'mis', toFund: 'gen', amount: 100, restrictedFrom: true })), 'restricted');
  L.post(R.fundTransfer({ bank: '1000', date: '2026-10-11', memo: 'Board approved', fromFund: 'gen', toFund: 'mis', amount: cents(1000) }));
  assert.strictEqual(L.natural('1000'), cents(80000 + 20000 + 5000));            // bank total unchanged
  assert.strictEqual(L.natural('1000', { fund: 'mis' }), cents(21000));
});

test('payroll charges each fund for its own staff', () => {
  const L = books(); opening(L);
  L.post(R.payroll({ bank: '1000', date: '2026-10-15', memo: 'Payroll Oct 15', source: { type: 'payroll', id: '2026-10-15' }, rows: [
    { fund: 'gen', wages: cents(9000), housing: cents(3000), employerTax: cents(700), project: 'Staff & payroll' },
    { fund: 'mis', wages: cents(1000) },
  ] }));
  assert.strictEqual(L.natural('5010', { fund: 'gen' }), cents(3000));
  assert.strictEqual(L.balance({ type: 'expense', project: 'Staff & payroll' }), cents(12700));   // counts against the payroll budget
  assert.strictEqual(L.natural('1000'), cents(100000 - 13700));
});

test('reports: trial balance, balance sheet per fund, and the restricted / unrestricted view all agree', () => {
  const L = books(); opening(L);
  L.post(R.giftsDeposit({ date: '2026-10-15', memo: 'payout', byGiving: { tithe: cents(6420), kb: cents(1380) }, fee: cents(241.38), giving: GIV, bank: '1000', feeFund: 'gen' }));
  L.post(R.bankPayment({ bank: '1000', date: '2026-10-01', memo: 'Kenya support', amount: cents(1500), expense: '5400', fund: 'mis', project: 'Kenya missions' }));
  L.post(R.cardCharge({ date: '2026-10-14', memo: 'Party City', card: '2000', amount: cents(96.45), expense: '5110', fund: 'gen', project: 'Fall Festival' }));
  const tb = Rep.trialBalance(L);
  assert.ok(tb.balanced);
  const bs = Rep.balanceSheet(L);
  assert.ok(bs.balanced);
  const mis = bs.funds.find(f => f.fund === 'mis');
  assert.strictEqual(mis.fundBalance, cents(20000 + 690 - 1500));
  const act = Rep.activities(L, { from: '2026-10-01', to: '2026-10-31' });
  assert.strictEqual(act.with.released, 0 - cents(1500));                           // Missions spending = released from restriction
  assert.strictEqual(act.without.released, cents(1500));
  assert.strictEqual(act.change, -(L.balance({ type: 'income', from: '2026-10-01' }) + L.balance({ type: 'expense', from: '2026-10-01' })));
  assert.strictEqual(Rep.cashByFund(L, '1000').total, L.natural('1000'));
  const bva = Rep.budgetVsActual(L, [{ name: 'Outreach Ministry', budget: cents(8000) }, { name: 'Fall Festival', budget: cents(1500), parent: 'Outreach Ministry' }]);
  assert.strictEqual(bva[0].actual, cents(96.45));                               // project rolls up into its ministry
  assert.ok(Rep.health(L).ok);
});

test('health check warns when a fund spends cash it does not have', () => {
  const L = books(); opening(L);
  L.post(R.bankPayment({ bank: '1000', date: '2026-10-03', memo: 'Architect', amount: cents(8650), expense: '5420', fund: 'prj' }));
  const h = Rep.health(L);
  assert.ok(!h.ok);
  assert.match(h.checks.find(c => c.warn).text, /^Projects has spent 8650\.00 more cash than it has/);
});

test('year-end close moves income and expenses into each fund balance and locks the year', () => {
  const L = books(); opening(L);
  L.post(R.giftsDeposit({ date: '2026-11-01', memo: 'gifts', byGiving: { tithe: cents(1000), kb: cents(200) }, giving: GIV, bank: '1000', feeFund: 'gen' }));
  L.post(R.bankPayment({ bank: '1000', date: '2026-11-02', memo: 'utility', amount: cents(300), expense: '5200', fund: 'gen' }));
  const before = Rep.balanceSheet(L).funds.map(f => f.fundBalance);
  L.closeYear(2026, 'nick');
  assert.strictEqual(L.balance({ type: 'income' }) + L.balance({ type: 'expense' }), 0);
  assert.deepStrictEqual(Rep.balanceSheet(L).funds.map(f => f.fundBalance), before);   // nothing lost
  assert.strictEqual(L.lockedThrough, '2026-12-31');
  assert.strictEqual(code(() => L.closeYear(2026)), 'locked');
});

test('saved books reload exactly, and a tampered file is refused', () => {
  const L = books(); opening(L);
  L.post(R.giftsDeposit({ date: '2026-10-15', memo: 'payout', source: { type: 'pco_payout', id: 'po_1' }, byGiving: { tithe: 5000 }, giving: GIV, bank: '1000', feeFund: 'gen' }));
  L.lock('2026-09-30');
  const json = JSON.parse(JSON.stringify(L.toJSON()));
  const back = fromJSON(json);
  assert.deepStrictEqual(Rep.trialBalance(back), Rep.trialBalance(L));
  assert.strictEqual(back.lockedThrough, '2026-09-30');
  assert.strictEqual(code(() => back.post(R.giftsDeposit({ date: '2026-10-15', memo: 'again', source: { type: 'pco_payout', id: 'po_1' }, byGiving: { tithe: 5000 }, giving: GIV, bank: '1000', feeFund: 'gen' }))), 'duplicate');
  json.entries[1].lines[0].debit += 100;                                           // someone edits the file
  assert.strictEqual(code(() => fromJSON(json)), 'unbalanced');
});

test('one receipt split across budgets and funds: each budget gets its share, each fund owes its own part', () => {
  const L = books();
  L.post(R.cardCharge({ date: '2026-10-16', memo: 'Costco', card: '2010', amount: cents(214.37), splits: [
    { amount: cents(164.37), expense: '5100', fund: 'gen', project: 'Youth Retreat' },
    { amount: cents(50), expense: '5110', fund: 'gen', project: 'Fall Festival' },
  ] }));
  assert.strictEqual(L.balance({ type: 'expense', project: 'Youth Retreat' }), cents(164.37));
  assert.strictEqual(L.balance({ type: 'expense', project: 'Fall Festival' }), cents(50));
  assert.strictEqual(L.natural('2010'), cents(214.37));                          // the card still shows one charge
  assert.strictEqual(L.get('JE-00001').lines.filter(l => l.account === '2010').length, 1);   // one fund → one card line

  L.post(R.cardCharge({ date: '2026-10-17', memo: "Lowe's", card: '2020', amount: cents(300), splits: [
    { amount: cents(200), expense: '5220', fund: 'prj', project: 'Youth room remodel' },
    { amount: cents(100), expense: '5210', fund: 'gen', project: 'Everyday ministry' },
  ] }));
  assert.strictEqual(L.natural('2020', { fund: 'prj' }), cents(200));            // Projects owes its share of the bill
  assert.strictEqual(L.natural('2020', { fund: 'gen' }), cents(100));

  L.post(R.bankPayment({ date: '2026-10-18', memo: 'Wegmans (reimbursement)', bank: '1000', amount: cents(142.60), splits: [
    { amount: cents(100), expense: '5120', fund: 'gen', project: 'Fall Festival' },
    { amount: cents(42.60), expense: '5120', fund: 'mis', project: 'Local outreach' },
  ] }));
  assert.strictEqual(L.natural('1000', { fund: 'mis' }), 0 - cents(42.60));
  assert.ok(Rep.trialBalance(L).balanced && Rep.balanceSheet(L).balanced);
});

test('a split that does not add up to the receipt is refused', () => {
  const base = { date: '2026-10-16', memo: 'x', card: '2000', amount: cents(100) };
  assert.strictEqual(code(() => R.cardCharge({ ...base, splits: [{ amount: cents(60), expense: '5100', fund: 'gen' }, { amount: cents(30), expense: '5100', fund: 'gen' }] })), 'split_total');
  assert.strictEqual(code(() => R.cardCharge({ ...base, splits: [{ amount: 0, expense: '5100', fund: 'gen' }, { amount: cents(100), expense: '5100', fund: 'gen' }] })), 'bad_split');
  assert.strictEqual(code(() => R.cardCharge({ ...base, splits: [{ amount: cents(100), fund: 'gen' }] })), 'bad_split');
  assert.strictEqual(code(() => R.bankPayment({ date: '2026-10-16', memo: 'x', amount: 100, expense: '5100', fund: 'gen' })), 'no_bank');
});

test('a bill: owed when approved, each fund pays its own share, and the books know who was paid', () => {
  const L = books(); opening(L);
  L.post(R.billReceived({ date: '2026-10-10', memo: 'ABC Fire Protection INV-2041', vendor: 'ABC Fire Protection', source: { type: 'bill', id: 'b1' },
    amount: cents(900), splits: [
      { amount: cents(615), expense: '5210', fund: 'gen', project: 'Everyday ministry' },
      { amount: cents(285), expense: '5210', fund: 'prj', project: 'Youth room remodel' },
    ] }));
  assert.strictEqual(L.natural('2100'), cents(900));                               // owed, not paid
  assert.strictEqual(L.natural('2100', { fund: 'prj' }), cents(285));
  assert.strictEqual(L.balance({ type: 'expense', project: 'Youth room remodel' }), cents(285));   // counts against the budget now

  const owed = Object.fromEntries(L.funds.map(f => [f.id, L.natural('2100', { fund: f.id, party: 'ABC Fire Protection' })]));
  L.post(R.billPayment({ date: '2026-10-20', memo: 'Pay INV-2041 (check #4419)', vendor: 'ABC Fire Protection', bank: '1000', byFund: owed, amount: cents(400) }));
  assert.strictEqual(L.natural('2100'), cents(500));                               // partly paid
  const rest = Object.fromEntries(L.funds.map(f => [f.id, L.natural('2100', { fund: f.id, party: 'ABC Fire Protection' })]));
  L.post(R.billPayment({ date: '2026-10-25', memo: 'Pay the rest', vendor: 'ABC Fire Protection', bank: '1000', byFund: rest }));
  assert.strictEqual(L.natural('2100'), 0);
  assert.strictEqual(L.natural('1000', { fund: 'prj' }), 0 - cents(285));          // Projects paid its own share
  // paid to this vendor this year = credits to the bank tagged with them
  assert.strictEqual(0 - L.balance({ account: '1000', party: 'ABC Fire Protection' }), cents(900));
  assert.ok(Rep.balanceSheet(L).balanced);

  assert.strictEqual(code(() => R.billPayment({ date: '2026-10-26', memo: 'x', vendor: 'ABC', bank: '1000', byFund: { gen: 100 }, amount: 200 })), 'overpay');
  assert.strictEqual(code(() => R.billPayment({ date: '2026-10-26', memo: 'x', vendor: 'ABC', bank: '1000', byFund: {} })), 'nothing_owed');
  assert.strictEqual(code(() => R.billReceived({ date: '2026-10-26', memo: 'x', amount: 1, expense: '5100', fund: 'gen' })), 'no_vendor');
});

test('1099 totals: what each payee got by check or ACH in the year — not by card, minus refunds', () => {
  const L = books(); opening(L);
  L.post(R.bankPayment({ date: '2026-03-01', memo: 'Cleaning', bank: '1000', party: 'Bright Clean', amount: cents(1500), expense: '5210', fund: 'gen' }));
  L.post(R.billReceived({ date: '2026-10-01', memo: 'Cleaning Oct', vendor: 'Bright Clean', amount: cents(600), expense: '5210', fund: 'gen' }));
  L.post(R.billPayment({ date: '2026-10-15', memo: 'Pay', vendor: 'Bright Clean', bank: '1000', byFund: { gen: cents(600) } }));
  L.post(R.cardCharge({ date: '2026-10-02', memo: 'On the card', card: '2000', party: 'Bright Clean', amount: cents(5000), expense: '5210', fund: 'gen' }));
  L.post(R.bankPayment({ date: '2025-12-30', memo: 'Last year', bank: '1000', party: 'Bright Clean', amount: cents(999), expense: '5210', fund: 'gen' }));
  L.post({ date: '2026-10-20', memo: 'Refund of an overpayment', lines: [{ account: '1000', fund: 'gen', debit: cents(100), party: 'Bright Clean' }, { account: '5210', fund: 'gen', credit: cents(100) }] });
  L.post(R.bankPayment({ date: '2026-05-01', memo: 'Guest speaker', bank: '1000', party: 'Rev. Santos', amount: cents(300), expense: '5100', fund: 'gen' }));
  const rows = Rep.paidByParty(L, { accounts: ['1000', '1010', '1050'], from: '2026-01-01', to: '2026-12-31' });
  assert.deepStrictEqual(rows, [{ party: 'Bright Clean', amount: cents(2000) }, { party: 'Rev. Santos', amount: cents(300) }]);
  assert.deepStrictEqual(Rep.paidByParty(L, { accounts: ['2000'], from: '2026-01-01' }), [{ party: 'Bright Clean', amount: cents(5000) }]);   // card: reported by the card company
});

test('reimbursements: owed to the person when approved, paid back in one payment, never on a 1099 list by mistake', () => {
  const L = books(); opening(L);
  L.post(R.reimbursementOwed({ date: '2026-10-10', memo: 'Wegmans', person: 'Kelly Tran', amount: cents(142.60), expense: '5120', fund: 'gen', project: 'Fall Festival' }));
  L.post(R.reimbursementOwed({ date: '2026-10-12', memo: 'Michaels', person: 'Kelly Tran', amount: cents(40), splits: [
    { amount: cents(25), expense: '5110', fund: 'gen', project: 'Fall Festival' }, { amount: cents(15), expense: '5100', fund: 'mis', project: 'Local outreach' }] }));
  assert.strictEqual(L.natural('2150', { party: 'Kelly Tran' }), cents(182.60));
  assert.strictEqual(L.balance({ type: 'expense', project: 'Fall Festival' }), cents(167.60));      // counts against the budget when approved
  const owed = Object.fromEntries(L.funds.map(f => [f.id, L.natural('2150', { fund: f.id, party: 'Kelly Tran' })]));
  L.post(R.reimbursementPayment({ date: '2026-10-20', memo: 'Pay Kelly back (ACH)', person: 'Kelly Tran', bank: '1000', byFund: owed }));
  assert.strictEqual(L.natural('2150'), 0);
  assert.strictEqual(L.natural('1000', { fund: 'mis' }), cents(20000 - 15));                   // Missions paid its own share
  assert.ok(Rep.balanceSheet(L).balanced);
});

test('counted cash waits in "counted, not yet deposited" until it reaches the bank — two Sundays can go in one deposit', () => {
  const L = books();
  const count = (date, tithe, kb) => L.post(R.giftsDeposit({ date, memo: 'Sunday count', source: { type: 'cash', id: date }, byGiving: { tithe, kb }, giving: GIV, bank: '1100', feeFund: 'gen' }));
  count('2026-10-11', cents(3000), cents(200));
  count('2026-10-18', cents(2500), cents(400));
  assert.strictEqual(L.natural('1100'), cents(6100));
  assert.strictEqual(L.natural('1000'), 0);                                         // not in the bank yet
  assert.strictEqual(L.natural('4010', { fund: 'mis' }), cents(300));               // but the gifts already count, split by fund
  const inBag = Object.fromEntries(L.funds.map(f => [f.id, L.natural('1100', { fund: f.id })]));
  L.post(R.deposit({ date: '2026-10-19', memo: 'Deposit slip 0412 (two Sundays)', source: { type: 'deposit', id: '0412' }, bank: '1000', byFund: inBag }));
  assert.strictEqual(L.natural('1100'), 0);
  assert.strictEqual(L.natural('1000'), cents(6100));
  assert.strictEqual(L.natural('1000', { fund: 'bld' }), cents(210));
  assert.ok(Rep.health(L).ok && Rep.balanceSheet(L).balanced);
  assert.strictEqual(code(() => R.deposit({ date: '2026-10-19', memo: 'x', bank: '1000', byFund: {} })), 'empty_deposit');
});

test('bank reconciliation: statement − outstanding checks + deposits in transit must equal the books, to the cent', () => {
  const L = books(); opening(L);                                                    // $80,000 operating + $20,000 missions in 1000
  const chk = L.post(R.bankPayment({ date: '2026-10-07', memo: 'Check 4416', bank: '1000', amount: cents(1200), expense: '5110', fund: 'gen' }));
  const util = L.post(R.bankPayment({ date: '2026-10-09', memo: 'Utility ACH', bank: '1000', amount: cents(1842.10), expense: '5200', fund: 'gen' }));
  const dep = L.post(R.giftsDeposit({ date: '2026-10-17', memo: 'Deposit', byGiving: { tithe: cents(3634) }, giving: GIV, bank: '1000', feeFund: 'gen' }));
  const later = L.post(R.bankPayment({ date: '2026-10-20', memo: 'After the statement', bank: '1000', amount: cents(50), expense: '5200', fund: 'gen' }));
  const open = L.entries[0].id;
  // the bank saw the opening balance and the utility payment, not the check or Friday's deposit
  const stmt = cents(100000 - 1842.10);
  const r = Rep.reconciliation(L, { account: '1000', through: '2026-10-17', statementBalance: stmt, cleared: [open, util.id] });
  assert.deepStrictEqual(r.outstanding.map(i => i.entry), [chk.id]);
  assert.deepStrictEqual(r.inTransit.map(i => i.entry), [dep.id]);
  assert.ok(!r.items.some(i => i.entry === later.id));                              // after the statement date: not part of it
  assert.strictEqual(r.book, cents(100000 - 1200 - 1842.10 + 3634));
  assert.strictEqual(r.difference, 0); assert.ok(r.balanced);
  // a bank fee the books don't have yet shows up as a difference until it's recorded
  const off = Rep.reconciliation(L, { account: '1000', through: '2026-10-17', statementBalance: stmt - cents(4.75), cleared: [open, util.id] });
  assert.strictEqual(off.difference, 0 - cents(4.75));
});

test('renaming a fund or account keeps every entry and records the old name', () => {
  const L = books(); opening(L);
  L.renameFund('prj', 'Special Projects', 'nick');
  L.renameAccount('5210', 'Repairs & upkeep', 'nick');
  assert.strictEqual(L.fund('prj').name, 'Special Projects');
  assert.strictEqual(L.account('5210').name, 'Repairs & upkeep');
  const log = L.audit.filter(a => a.action.startsWith('rename_'));
  assert.deepStrictEqual(log.map(a => [a.from, a.name]), [['Projects', 'Special Projects'], ['Repairs & maintenance', 'Repairs & upkeep']]);
  assert.ok(Rep.trialBalance(L).balanced);
  assert.strictEqual(code(() => L.renameFund('zzz', 'x')), 'no_fund');
  assert.strictEqual(code(() => L.renameAccount('5210', ' ')), 'bad_account');
});

test('approved requests are set aside in the budget: spent + set aside + left = budget, rolled up into the ministry', () => {
  const L = books(); opening(L);
  L.post(R.cardCharge({ date: '2026-10-14', memo: 'Party City', card: '2000', amount: cents(300), expense: '5110', fund: 'gen', project: 'Fall Festival' }));
  const rows = Rep.budgetVsActual(L, [{ name: 'Outreach Ministry', budget: cents(8000) }, { name: 'Fall Festival', budget: cents(1500), parent: 'Outreach Ministry' }],
    { committed: { 'Fall Festival': cents(350) } });
  const ff = rows.find(r => r.name === 'Fall Festival'), om = rows.find(r => r.name === 'Outreach Ministry');
  assert.deepStrictEqual([ff.actual, ff.committed, ff.left], [cents(300), cents(350), cents(850)]);
  assert.deepStrictEqual([om.actual, om.committed], [cents(300), cents(350)]);          // rolls up
  assert.ok(!ff.over);
  assert.ok(Rep.budgetVsActual(L, [{ name: 'Fall Festival', budget: cents(600) }], { committed: { 'Fall Festival': cents(350) } })[0].over);
});

test('a salary split across budgets and funds: every cent lands somewhere, clergy get housing and no employer tax', () => {
  const staff = [
    { gross: cents(3400), clergy: true, allocation: [{ fund: 'gen', project: 'Staff & payroll', pct: 80 }, { fund: 'mis', project: 'Kenya missions', pct: 20 }] },
    { gross: cents(980), clergy: false, allocation: [{ fund: 'gen', project: 'Staff & payroll', pct: 50 }, { fund: 'bld', project: 'New Building', pct: 50 }] },
    { gross: cents(2100), clergy: false, allocation: [{ fund: 'gen', project: 'Staff & payroll', pct: 100 }] },
  ];
  const rows = R.payrollRows(staff, { housingShare: 0.3 });
  const by = p => rows.find(r => r.project === p);
  assert.deepStrictEqual(by('Kenya missions'), { fund: 'mis', project: 'Kenya missions', wages: cents(476), housing: cents(204), employerTax: 0 });
  assert.strictEqual(by('New Building').wages, cents(490));
  const all = k => rows.reduce((s, r) => s + r[k], 0);
  assert.strictEqual(all('wages') + all('housing'), cents(3400 + 980 + 2100));                     // nothing lost to rounding
  assert.strictEqual(all('employerTax'), Math.round(cents(980) * .0765) + Math.round(cents(2100) * .0765));
  const L = books(); opening(L);
  L.post(R.payroll({ date: '2026-10-15', memo: 'Payroll', bank: '1000', rows }));
  assert.strictEqual(L.balance({ type: 'expense', project: 'Kenya missions' }), cents(680));
  assert.strictEqual(L.natural('1000', { fund: 'mis' }), cents(20000 - 680));                       // Missions paid its share
  assert.strictEqual(code(() => R.payrollRows([{ gross: 100, allocation: [{ fund: 'gen', pct: 90 }] }])), 'bad_allocation');
  assert.strictEqual(code(() => R.payrollRows([{ gross: 100, allocation: [] }])), 'no_allocation');
});

test('event sign-ups go straight to the event; refunds come back off it; the event shows its net cost', () => {
  const L = books(); opening(L);
  L.post(R.eventIncome({ date: '2026-10-10', memo: 'Registrations payout', source: { type: 'reg_payout', id: 'p1' }, bank: '1000', feeFund: 'gen', fee: cents(39.50),
    byEvent: [{ project: 'Youth Retreat', fund: 'gen', amount: cents(1200) }, { project: 'Kenya missions', fund: 'mis', amount: cents(300) }] }));
  L.post(R.eventRefund({ date: '2026-10-12', memo: 'Refund: cancelled sign-up', bank: '1000', project: 'Youth Retreat', fund: 'gen', amount: cents(150) }));
  L.post(R.bankPayment({ date: '2026-10-07', memo: 'Camp deposit', bank: '1000', amount: cents(1200), expense: '5110', fund: 'gen', project: 'Youth Retreat' }));
  const [yr] = Rep.budgetVsActual(L, [{ name: 'Youth Retreat', budget: cents(4200) }]);
  assert.deepStrictEqual([yr.actual, yr.income, yr.net], [cents(1200), cents(1050), cents(150)]);
  assert.strictEqual(L.natural('4100', { fund: 'mis' }), cents(300));                              // a missions trip's sign-ups stay in Missions
  assert.strictEqual(L.natural('1000'), cents(100000 + 1500 - 39.50 - 150 - 1200));
  assert.ok(Rep.balanceSheet(L).balanced);
  assert.strictEqual(code(() => R.eventIncome({ date: '2026-10-10', memo: 'x', bank: '1000', byEvent: [{ fund: 'gen', amount: 100 }] })), 'no_event');
});

test('what the board should hear about: large spending, money moved between funds, corrections — not routine payroll', () => {
  const L = books(); opening(L);
  L.post(R.bankPayment({ date: '2026-09-05', memo: 'Architect', bank: '1000', amount: cents(8650), expense: '5420', fund: 'gen', project: 'New Building' }));
  L.post(R.bankPayment({ date: '2026-09-06', memo: 'Coffee', bank: '1000', amount: cents(40), expense: '5120', fund: 'gen' }));
  L.post(R.fundTransfer({ date: '2026-09-10', memo: 'Board-approved move', bank: '1000', fromFund: 'gen', toFund: 'mis', amount: cents(1000) }));
  L.post(R.payroll({ date: '2026-09-15', memo: 'Payroll', bank: '1000', rows: [{ fund: 'gen', wages: cents(12000) }] }));
  const wrong = L.post(R.bankPayment({ date: '2026-09-20', memo: 'Wrong vendor', bank: '1000', amount: cents(300), expense: '5100', fund: 'gen' }));
  L.reverse(wrong.id, { reason: 'Paid twice', date: '2026-09-21' });
  L.post(R.bankPayment({ date: '2026-10-02', memo: 'October, outside the range', bank: '1000', amount: cents(5000), expense: '5100', fund: 'gen' }));
  const n = Rep.notable(L, { from: '2026-09-01', to: '2026-09-30', over: cents(1000) });
  assert.deepStrictEqual(n.map(x => [x.kind, x.memo.split(':')[0]]), [['large', 'Architect'], ['transfer', 'Board-approved move'], ['reversal', `Reverses ${wrong.id}`]]);
  assert.strictEqual(n[0].amount, cents(8650));
});

test('board-designated money: still unrestricted, but setting it aside or releasing it is a board decision', () => {
  const S = require('../setup.js'), Rules = require('../rules.js'), Rep = require('../reports.js');
  const setup = JSON.parse(JSON.stringify(require('../../churches/grace/setup.js')));
  setup.funds.push({ id: 'res', name: 'Reserve', restriction: 'without', designated: true });
  const L = S.createBooks(setup);
  L.post({ date: '2026-01-05', memo: 'Gifts', lines: [{ account: '1000', fund: 'general', debit: 100000 }, { account: '4000', fund: 'general', credit: 100000 }] }, 't');
  const move = o => Rules.fundTransfer({ date: '2026-01-10', memo: 'Set aside', fromFund: 'general', toFund: 'res', amount: 30000, bank: '1000', designatedTo: true, ...o });
  assert.throws(() => move({}), /board decision/);
  L.post(move({ boardApproved: true }), 't');
  const n = Rep.netAssets(L);
  assert.deepStrictEqual([n.undesignated, n.designatedTotal, n.withoutTotal, n.withTotal, n.total], [70000, 30000, 100000, 0, 100000]);
  assert.strictEqual(Rep.activities(L, { from: '2026-01-01', to: '2026-12-31' }).without.change, 100000);   // moving within unrestricted money changes nothing overall
  const bad = JSON.parse(JSON.stringify(setup)); bad.funds.find(f => f.id === 'building').designated = true;
  assert.match(S.validateSetup(bad).join(' '), /only money givers didn't restrict/);
  const bad2 = JSON.parse(JSON.stringify(setup)); bad2.funds.find(f => f.id === 'general').designated = true;
  assert.match(S.validateSetup(bad2).join(' '), /operating fund .* can't be board-designated/);
});
