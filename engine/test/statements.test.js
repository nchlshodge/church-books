const test = require('node:test'), assert = require('node:assert');
const A = require('../assets.js'), R = require('../rules.js'), Rep = require('../reports.js'), S = require('../setup.js');

test('fixed assets: straight-line by month, land never, disposed stops', () => {
  const van = { cost: 3600000, placed: '2026-01-15', lifeYears: 5, fund: 'general' };
  assert.strictEqual(A.monthly(van), 60000);
  assert.strictEqual(A.forMonth(van, '2026-01'), 0);              // starts the month after it's put in service
  assert.strictEqual(A.accumulatedThrough(van, '2026-12'), 660000);
  assert.strictEqual(A.accumulatedThrough(van, '2035-01'), 3600000);   // fully depreciated, never more
  assert.strictEqual(A.bookValue(van, '2026-12'), 2940000);
  assert.strictEqual(A.accumulatedThrough({ cost: 100, placed: '2020-01-01', lifeYears: 0 }, '2030-01'), 0);   // land
  assert.strictEqual(A.accumulatedThrough({ ...van, disposed: '2026-07-10' }, '2026-12'), 300000);
  const odd = { cost: 1000, placed: '2026-01-01', lifeYears: 0.25, fund: 'g' };   // 3 months: 333, 333, 334
  assert.deepStrictEqual(A.schedule([odd], '2026-01', '2026-06').map(x => x.total), [333, 333, 334]);
});

test('event income is held until the event, then recognized', () => {
  const L = S.createBooks(require('../../churches/grace/setup.js'));
  L.post(R.eventIncome({ date: '2026-10-03', memo: 'Trip deposits', bank: '1000', byEvent: [{ project: 'Trip 2027', fund: 'missions', amount: 100000, deferred: true }] }), 't');
  assert.deepStrictEqual([L.natural('2400'), L.natural('4100')], [100000, 0]);
  L.post(R.eventRefund({ date: '2026-10-05', memo: 'Refund', bank: '1000', project: 'Trip 2027', fund: 'missions', amount: 20000, deferred: true }), 't');
  L.post(R.recognizeEventIncome({ date: '2027-06-15', memo: 'Trip happened', project: 'Trip 2027', fund: 'missions', amount: 80000 }), 't');
  assert.deepStrictEqual([L.natural('2400'), L.natural('4100')], [0, 80000]);
});

test('cash flows reconcile, with depreciation, a donated van and an asset sale', () => {
  const setup = JSON.parse(JSON.stringify(require('../../churches/grace/setup.js')));
  const L = S.createBooks(setup);
  const g = (date, amt) => L.post({ date, memo: 'Gifts', lines: [{ account: '1000', fund: 'general', debit: amt }, { account: '4000', fund: 'general', credit: amt }] }, 't');
  L.post(R.openingBalances({ date: '2026-01-01', assets: [{ account: '1000', fund: 'general', amount: 5000000 }, { account: '1610', fund: 'general', amount: 30000000 }], liabilities: [] }), 't');
  g('2026-02-01', 1000000);
  L.post(R.assetPurchase({ date: '2026-02-10', memo: 'Sound board', bank: '1000', fund: 'general', amount: 800000, account: '1630' }), 't');
  L.post(R.depreciation({ date: '2026-02-28', memo: 'Feb', byFund: [{ fund: 'general', amount: 120000 }] }), 't');
  L.post(R.nonCashGift({ date: '2026-03-01', memo: 'Van', byFund: [{ fund: 'general', amount: 1500000 }], toAccount: '1600' }), 't');
  L.post({ date: '2026-03-05', memo: 'Bill', lines: [{ account: '5200', fund: 'general', debit: 30000 }, { account: '2100', fund: 'general', credit: 30000 }] }, 't');
  L.post({ ...R.assetDisposal({ date: '2026-03-20', memo: 'Sold old piano', bank: '1000', fund: 'general', cost: 200000, accumulated: 150000, proceeds: 90000, account: '1630' }), source: { type: 'asset_disposal', id: 'piano' } }, 't');
  const cf = Rep.cashFlows(L, { from: '2026-02-01', to: '2026-03-31' });
  assert.strictEqual(cf.reconciles, true);
  assert.strictEqual(cf.cashEnd - cf.cashStart, 1000000 - 800000 + 90000);
  assert.strictEqual(cf.investing, -800000 + 90000);
  assert.strictEqual(cf.operating, 1000000);                          // gifts in; the bill isn't paid yet, depreciation and the van aren't cash
  assert.deepStrictEqual([cf.depreciation, cf.donatedProperty, cf.gainOnSale], [120000, 1500000, 40000]);
});

test('functional expenses split by account and by budget, to the cent', () => {
  const L = S.createBooks(require('../../churches/grace/setup.js'));
  const pay = (acct, amt, project) => L.post({ date: '2026-03-01', memo: 'x', lines: [{ account: acct, fund: 'general', debit: amt, project }, { account: '1000', fund: 'general', credit: amt }] }, 't');
  pay('5000', 1000001); pay('5300', 5000); pay('5100', 7000, 'Stewardship campaign');
  const f = Rep.functionalExpenses(L, { map: { default: 'program', byAccount: { '5000': { program: 80, management: 15, fundraising: 5 }, '5300': 'management' }, byProject: { 'Stewardship campaign': 'fundraising' } } });
  const sal = f.rows.find(r => r.code === '5000');
  assert.strictEqual(sal.program + sal.management + sal.fundraising, 1000001);
  assert.deepStrictEqual([f.total.management >= 5000, f.rows.find(r => r.code === '5100').fundraising], [true, 7000]);
  assert.strictEqual(f.total.total, 1000001 + 5000 + 7000);
  assert.strictEqual(Rep.ledgerRows(L).length, 6);
});

test('cash flows for a closed year: depreciation still counts as not-cash after the year-end close', () => {
  const L = S.createBooks(require('../../churches/grace/setup.js'));
  L.post(R.openingBalances({ date: '2025-01-01', assets: [{ account: '1000', fund: 'general', amount: 100000 }, { account: '1610', fund: 'general', amount: 1200000 }], liabilities: [] }), 't');
  L.post({ date: '2025-03-01', memo: 'Gifts', lines: [{ account: '1000', fund: 'general', debit: 50000 }, { account: '4000', fund: 'general', credit: 50000 }] }, 't');
  L.post(R.depreciation({ date: '2025-06-30', memo: 'Dep', byFund: [{ fund: 'general', amount: 30000 }] }), 't');
  L.closeYear(2025, 't');
  const cf = Rep.cashFlows(L, { from: '2025-01-01', to: '2025-12-31' });
  assert.deepStrictEqual([cf.reconciles, cf.depreciation, cf.investing, cf.operating], [true, 30000, 0, 50000]);
});

test('end of season: leftover dues move to another budget, cash and fund totals unchanged', () => {
  const L = S.createBooks(require('../../churches/grace/setup.js'));
  L.post({ date: '2026-02-01', memo: 'Dues', lines: [{ account: '1000', fund: 'general', debit: 72000 }, { account: '4100', fund: 'general', credit: 72000, project: 'MomCo' }] }, 't');
  const cash = L.balance({ account: '1000' }), fundIncome = L.balance({ type: 'income', fund: 'general' });
  L.post(R.moveLeftover({ date: '2026-05-31', memo: 'MomCo leftover to childcare', source: { type: 'season_close', id: 'MomCo|2026-05-31' }, fund: 'general', fromProject: 'MomCo', toProject: 'MomCo childcare', amount: 25000 }), 't');
  assert.strictEqual(0 - L.balance({ type: 'income', project: 'MomCo' }), 47000);
  assert.strictEqual(0 - L.balance({ type: 'income', project: 'MomCo childcare' }), 25000);
  assert.deepStrictEqual([L.balance({ account: '1000' }), L.balance({ type: 'income', fund: 'general' })], [cash, fundIncome]);
  assert.throws(() => R.moveLeftover({ date: '2026-05-31', memo: 'x', fund: 'general', fromProject: 'MomCo', toProject: 'MomCo', amount: 100 }), /different budget/);
});
