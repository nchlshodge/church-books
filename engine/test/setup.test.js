const test = require('node:test');
const assert = require('node:assert');
const S = require('../setup.js');
const R = require('../rules.js');
const Rep = require('../reports.js');
const { cents } = require('../ledger.js');
const RCC = require('../../churches/rcc-kb/setup.js');

// A completely different church: three ordinary funds, no splits, one bank, no cards.
const GRACE = {
  id: 'grace-community', name: 'Grace Community Church',
  funds: [
    { id: 'general', name: 'General Fund', restriction: 'without' },
    { id: 'building', name: 'Building Fund', restriction: 'with' },
    { id: 'missions', name: 'Missions', restriction: 'with' },
  ],
  operatingFund: 'general',
  giving: [
    { id: 'offering', name: 'General Offering', account: '4000', split: [{ to: 'general', pct: 100 }] },
    { id: 'building', name: 'Building Fund', account: '4010', split: [{ to: 'building', pct: 100 }] },
    { id: 'missions', name: 'Missions', account: '4020', split: [{ to: 'missions', pct: 90 }, { to: 'general', pct: 10 }] },
  ],
  banks: [{ code: '1000', name: 'Checking', last4: '0042' }],
  cards: [],
  people: { pastor: { name: 'Pastor Lee', role: 'Pastor' } },
  categories: { Supplies: '5100' },
  budgets: [{ name: 'Missions trip', fund: 'missions', budget: 5000 }],
  policies: { depositBank: '1000', feeFund: 'general', reviewers: ['pastor'] },
};

test('RCC and a completely different church both set up cleanly from their own files', () => {
  assert.deepStrictEqual(S.validateSetup(RCC), []);
  assert.deepStrictEqual(S.validateSetup(GRACE), []);
  const rcc = S.createBooks(RCC), grace = S.createBooks(GRACE);
  assert.strictEqual(rcc.account('4010').name, 'Kingdom Builders');
  assert.strictEqual(grace.account('4010').name, 'Building Fund');
  assert.strictEqual(grace.account('4020').name, 'Missions');
  assert.strictEqual(grace.account('2000'), null);                       // Grace has no cards
  assert.strictEqual(rcc.account('2010').name, 'Youth card ••3307');
  assert.deepStrictEqual(grace.funds.map(f => f.id), ['general', 'building', 'missions']);
});

test('the same engine posts each church by its own rules', () => {
  const L = S.createBooks(GRACE);
  L.post(R.giftsDeposit({ date: '2026-10-19', memo: 'Sunday', byGiving: { offering: cents(2000), missions: cents(500) }, fee: cents(30),
    giving: S.givingRules(GRACE), bank: '1000', feeFund: 'general' }));
  assert.strictEqual(L.natural('4020', { fund: 'missions' }), cents(450));
  assert.strictEqual(L.natural('4020', { fund: 'general' }), cents(50));
  assert.strictEqual(L.natural('1000'), cents(2470));
  assert.ok(Rep.balanceSheet(L).balanced);
});

test('a broken setup is refused with every problem spelled out', () => {
  const bad = {
    ...GRACE, id: 'Bad Id!',
    funds: [...GRACE.funds, { id: 'general', name: 'Dup', restriction: 'maybe' }],
    operatingFund: 'building',
    giving: [{ id: 'offering', name: 'Offering', account: '4000', split: [{ to: 'general', pct: 60 }, { to: 'nowhere', pct: 30 }] },
      { id: 'x', name: 'Clash', account: '4100', split: [{ to: 'general', pct: 100 }] }],
    cards: [{ code: '1999', name: 'Odd card', last4: '12' }],
    categories: { Mystery: '5999' },
    budgets: [{ name: 'Trip', fund: 'missions', budget: 100 }, { name: 'Bus', fund: 'general', budget: 50, parent: 'Trip' }],
    policies: { feeFund: 'ghost', reviewers: ['nobody'] },
  };
  const p = S.validateSetup(bad).join('\n');
  for (const expect of [/short id/, /Two funds use the id "general"/, /'with'/, /can't be restricted/, /no fund "nowhere"/, /adds up to 90%/,
    /giving accounts use codes 4000–4099/, /cards use codes 2000–2099/, /last 4 digits/, /Mystery/, /same fund as "Trip"/, /ghost/, /"nobody"/]) {
    assert.match(p, expect);
  }
  assert.throws(() => S.createBooks(bad), e => e.code === 'bad_setup' && /• /.test(e.message));
});

test('check printing settings: routing numbers must be real-looking, and blank stock needs the account number', () => {
  assert.ok(S.routingValid('123456780'));          // fictitious but passes the check digit
  assert.ok(!S.routingValid('123456789'));
  assert.ok(!S.routingValid('12345678'));
  const withChecks = (stock, bank) => ({ ...GRACE, banks: [{ code: '1000', name: 'Checking', last4: '0042', ...bank }], checks: { stock, bank: '1000', nextNumber: 2212, signers: ['pastor'] } });
  assert.deepStrictEqual(S.validateSetup(withChecks('preprinted', {})), []);
  assert.deepStrictEqual(S.validateSetup(withChecks('blank', { routing: '123456780', account: '00000042' })), []);
  const p = S.validateSetup(withChecks('blank', { routing: '123456789' })).join('\n');
  assert.match(p, /routing number isn't a valid/); assert.match(p, /add the account number/);
  assert.match(S.validateSetup({ ...withChecks('blank', {}), checks: { stock: 'laser', bank: '9999' } }).join('\n'), /blank stock or pre-printed[\s\S]*doesn't exist: 9999[\s\S]*next check number/);
});
