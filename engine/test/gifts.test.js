const test = require('node:test'), assert = require('node:assert');
const G = require('../gifts.js'), R = require('../rules.js'), S = require('../setup.js');

test('stock: recorded at its value, sold, the gain shared by each fund', () => {
  const L = S.createBooks(require('../../churches/grace/setup.js'));
  const byFund = [{ fund: 'building', amount: 600000 }, { fund: 'missions', amount: 312400 }];
  L.post(R.nonCashGift({ date: '2026-10-03', memo: '40 shares AAPL', byFund, toAccount: '1300', party: 'Parker' }), 't');
  assert.strictEqual(L.natural('1300'), 912400); assert.strictEqual(L.natural('4800'), 912400);
  L.post(R.saleOfDonatedItem({ date: '2026-10-07', memo: 'Sold', byFund, proceeds: 918000, fee: 1000, bank: '1000' }), 't');
  assert.strictEqual(L.natural('1300'), 0); assert.strictEqual(L.natural('1000'), 917000); assert.strictEqual(L.natural('4810'), 4600);
  assert.strictEqual(L.natural('1000', { fund: 'building' }) + L.natural('1000', { fund: 'missions' }), 917000);
  assert.throws(() => R.nonCashGift({ date: '2026-10-03', memo: 'x', byFund: [], toAccount: '1300' }), /fair value/);
});

test('the paperwork each gift needs', () => {
  const keys = (g, p) => G.paperwork(g, p).map(s => s.key + (s.done ? '✓' : ''));
  assert.deepStrictEqual(keys({ kind: 'goods', date: '2026-10-09', value: 65000 }), ['ack', 'f8283a✓']);
  assert.deepStrictEqual(keys({ kind: 'stock', date: '2026-10-03', value: 912400 }, { sellPromptly: true, boardAcceptOver: 500000 }), ['ack', 'f8283a✓', 'sell']);   // traded stock: no appraisal
  const van = { kind: 'vehicle', date: '2026-10-14', value: 1450000, keptForUse: true };
  assert.deepStrictEqual(keys(van, { boardAcceptOver: 500000 }), ['board', 'ack', 'appraisal', 'f8283', 'f1098c']);
  assert.strictEqual(G.paperwork(van).find(s => s.key === 'f1098c').due, '2026-11-13');
  const sold = { ...van, keptForUse: false, f8283Signed: true, soldOn: '2027-03-01' };
  assert.strictEqual(G.paperwork(sold).find(s => s.key === 'f8282').due, '2027-07-04');
  assert.strictEqual(G.paperwork({ ...sold, soldOn: '2030-01-01' }).some(s => s.key === 'f8282'), false);   // after 3 years: no 8282
  assert.deepStrictEqual(keys({ kind: 'services', date: '2026-10-01', value: 0 }), ['thanks']);
  assert.strictEqual(G.nextStep(van, { boardAcceptOver: 500000 }).key, 'f1098c');
  assert.strictEqual(G.acknowledgment({ kind: 'goods', date: '2026-10-09', description: 'Yamaha keyboard' }, { church: { name: 'Grace' }, donor: { name: 'Nguyen' } }).paragraphs.join(' ').includes('$'), false);
});

test('when part of a payment is a gift, and the year-end statement', () => {
  assert.deepStrictEqual(G.quidProQuo({ paid: 10000, fairValue: 4000 }), { paid: 10000, fairValue: 4000, deductible: 6000, disclosureRequired: true });
  assert.strictEqual(G.quidProQuo({ paid: 5000, fairValue: 4000 }).disclosureRequired, false);
  assert.strictEqual(G.quidProQuo({ paid: 20000, fairValue: 25000 }).deductible, 0);
  const st = G.statement({ year: 2026, gifts: [{ date: '2026-01-04', fund: 'Tithes', amount: 10000 }, { date: '2025-12-28', fund: 'Tithes', amount: 99 }, { date: '2026-02-01', fund: 'Kingdom Builders', amount: 5000 }],
    nonCash: [{ date: '2026-10-09', description: 'Keyboard' }], partial: [{ date: '2026-05-01', paid: 15000, fairValue: 5000, what: 'Room use' }] });
  assert.deepStrictEqual([st.cashTotal, st.byFund.Tithes, st.nonCash.length, st.partialDeductible, st.deductibleCash], [15000, 10000, 1, 10000, 25000]);
});
