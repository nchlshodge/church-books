// Church setup — Hope Fellowship (a made-up demo church with EMPTY books).
// For trying the import: bring its QuickBooks files in from samples/import/ (Settings → Bring in data).
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CHURCH_SETUP = data;
})(typeof self !== 'undefined' ? self : this, {
  id: 'hope',
  name: 'Hope Fellowship',
  shortName: 'Hope',
  address: 'Canandaigua, NY',
  appName: 'Books',
  logo: '',
  timezone: 'America/New_York',
  fiscalYearStart: '01-01',
  receiptsEmail: 'receipts@hopefellowship.example',
  receiptLinkBase: 'hope.example/r/',

  funds: [
    { id: 'general', name: 'General Fund', restriction: 'without', color: '#2557b8' },
    { id: 'building', name: 'Building Fund', restriction: 'with', color: '#b5892a' },
    { id: 'missions', name: 'Missions', restriction: 'with', color: '#2e7a52' },
  ],
  operatingFund: 'general',

  giving: [
    { id: 'offering', name: 'Tithes & Offerings', account: '4000', color: '#2557b8', split: [{ to: 'general', pct: 100 }] },
    { id: 'building', name: 'Building Fund Gifts', account: '4010', color: '#b5892a', split: [{ to: 'building', pct: 100 }] },
    { id: 'missions', name: 'Missions Gifts', account: '4020', color: '#2e7a52', split: [{ to: 'missions', pct: 100 }] },
  ],

  banks: [
    { code: '1000', name: 'First Bank Checking', last4: '3381' },
    { code: '1010', name: 'First Bank Savings', last4: '3382' },
  ],
  cards: [
    { code: '2000', name: 'Church Mastercard', last4: '9001', holder: 'office', limit: 4000, style: '', closes: 20, due: 'Nov 14', payFrom: '1000', alertAt: 75, autopay: 'Full statement balance' },
  ],

  checks: { stock: 'preprinted', bank: '1000', nextNumber: 2212, signers: ['lee', 'office'], layout: 'top', offsetX: 0, offsetY: 0 },

  people: {
    lee:    { name: 'Pastor Lee', role: 'Senior Pastor', phone: '(217) 555-0101', email: 'pastor.lee@example.org' },
    office: { name: 'Jordan Park', role: 'Office Administrator', phone: '(217) 555-0102', email: 'jordan.park@example.org' },
    youth:  { name: 'Ava Kim', role: 'Youth Leader', phone: '(217) 555-0103', email: 'ava.kim@example.org', payBack: { method: 'ACH', last4: '4410' } },
  },
  admins: ['lee'],              // can change these settings
  currentUser: 'lee',

  categories: { 'Grounds': '5210', 'Repairs': '5210', 'Supplies': '5100', 'Events': '5110', 'Utilities': '5200', 'Office': '5300', 'Missions support': '5400' },

  budgets: [
    { name: 'Ministry operations', fund: 'general', lead: 'office', budget: 24000 },
    { name: 'Staff', fund: 'general', lead: 'lee', budget: 84000 },
    { name: 'Youth', fund: 'general', lead: 'youth', budget: 6000 },
    { name: 'Summer camp', fund: 'general', lead: 'youth', budget: 2000, date: 'Jul 14–18', done: true, parent: 'Youth' },
    { name: 'Building repairs', fund: 'building', lead: 'office', budget: 15000 },
    { name: 'Missions partners', fund: 'missions', lead: 'lee', budget: 18000 },
  ],

  policies: {
    depositBank: '1000', feeFund: 'general', reviewers: ['lee'], approvers: ['lee', 'office'],
    approvalTiers: [{ upTo: 1000, approvals: 1 }, { upTo: null, approvals: 2 }], restrictedMinApprovals: 1, askFirstOver: 500, requestGoodForDays: 45,
    lookClosely: { amount: 500 }, reimburseWithinDays: 60, countersRequired: 2, depositWithinDays: 3, receiptReminders: [0, 5, 10], cashCushion: 5000, secondSignerOver: 2500, housingShare: 0.25, form1099Threshold: 2000,
  },

  // Files attached to receipts, bills, vendors, statements and entries
  attachments: { maxMB: 25, keepYears: 7, receiptsOver: 0 },
  notifications: {
    weekly: { on: true, day: 1, hour: 8, to: ['lee'], via: 'email' },
    budgets: { on: true, thresholds: [80, 100], to: ['lead'], alsoAt100: ['admins'], via: 'email' },
    bills: { on: true, before: [5, 1], to: ['approvers'], via: 'email' },
    cards: { on: false, to: ['holder'], via: 'text' },
    deposits: { on: true, to: ['admins'], via: 'email' },
    approvals: { on: true, to: ['approvers'], via: 'email' },
  },
  integrations: { giving: 'Tithe.ly', registrations: 'Tithe.ly Events', processor: 'Tithe.ly', payroll: 'ADP' },
});
