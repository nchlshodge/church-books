const test = require('node:test'), assert = require('node:assert');
const Rt = require('../rentals.js'), R = require('../rules.js'), S = require('../setup.js');

test('when a rental is rent and when part of it is a gift', () => {
  const chorus = { start: '2026-09-01', end: '2026-12-15', days: [2], from: '19:00', to: '21:00' };
  assert.deepStrictEqual(Rt.uses(chorus, '2026-09-01', '2026-09-30'), ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29']);
  assert.strictEqual(Rt.fairPerUse(chorus, 6000), 12000);
  assert.deepStrictEqual(Rt.splitPayment({ paid: 40000, uses: 1, fairPerUse: 24000 }), { paid: 40000, fair: 24000, rent: 24000, gift: 16000, disclosureRequired: true });
  assert.deepStrictEqual(Rt.splitPayment({ paid: 2000, uses: 1, fairPerUse: 3750 }), { paid: 2000, fair: 3750, rent: 2000, gift: 0, disclosureRequired: false });   // a "donation" below fair value is all rent
  const s = Rt.summary(chorus, { rate: 6000, asked: 12000, payments: [{ date: '2026-10-02', amount: 60000, uses: 5 }], today: '2026-10-18' });
  assert.deepStrictEqual([s.usesSoFar, s.usesUnpaid, s.askedUnpaid, s.rent, s.gift, s.nextUse], [7, 2, 24000, 60000, 0, '2026-10-20']);
  const party = { dates: ['2026-10-10'], from: '14:00', to: '18:00' };
  assert.strictEqual(Rt.summary(party, { rate: 6000, asked: 20000, payments: [{ amount: 40000, uses: 1 }], today: '2026-10-18' }).gift, 16000);
});

test('rental payments and deposits in the books', () => {
  const L = S.createBooks(require('../../churches/grace/setup.js'));
  L.post(R.rentalPayment({ date: '2026-10-10', memo: 'Party', bank: '1000', fund: 'general', rent: 24000, giftByFund: [{ fund: 'general', amount: 16000 }], giftAccount: '4000' }), 't');
  assert.deepStrictEqual([L.natural('4200'), L.natural('4000'), L.natural('1000')], [24000, 16000, 40000]);
  L.post(R.rentalDeposit({ date: '2026-10-02', memo: 'Deposit', bank: '1000', fund: 'general', amount: 20000, action: 'receive' }), 't');
  assert.strictEqual(L.natural('2300'), 20000);
  L.post(R.rentalDeposit({ date: '2026-12-20', memo: 'Kept', bank: '1000', fund: 'general', amount: 5000, action: 'keep' }), 't');
  L.post(R.rentalDeposit({ date: '2026-12-20', memo: 'Back', bank: '1000', fund: 'general', amount: 15000, action: 'return' }), 't');
  assert.deepStrictEqual([L.natural('2300'), L.natural('4200'), L.natural('1000')], [0, 29000, 45000]);
  assert.throws(() => R.rentalPayment({ date: '2026-10-10', memo: 'x', bank: '1000', fund: 'general', rent: 0 }), /Nothing was paid/);
});
