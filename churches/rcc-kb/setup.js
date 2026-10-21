// Church setup — RCC after the switch to Kingdom Builders (planned for 2028). A preview of that model; today's books are in churches/rcc.
// Everything that makes the books RCC's lives here. Another church gets its own copy of
// this file; the engine and the app don't change. In the hosted version this is the
// church's settings document, edited from an admin screen.
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CHURCH_SETUP = data;
})(typeof self !== 'undefined' ? self : this, {
  id: 'rcc-kb',
  name: 'Rochester Christian Church (2028, Kingdom Builders)',
  shortName: 'RCC',
  address: 'Rochester, NY',
  appName: 'Books',
  logo: '../rcc-logo-plain.png',
  timezone: 'America/New_York',
  fiscalYearStart: '01-01',
  receiptsEmail: 'receipts@rochesterchristian.church',
  receiptLinkBase: 'rcc.church/r/',

  // Where money is set aside. 'with' = givers restricted it to a purpose.
  funds: [
    { id: 'gen', name: 'Operating', restriction: 'without', color: '#2557b8', about: 'Day-to-day ministry' },
    // partners: which Kingdom Builders category the fund's partners fall in (Local / Global / Future)
    { id: 'mis', name: 'Missions', restriction: 'with', color: '#2e7a52', partners: 'global' },
    { id: 'bld', name: 'New Building', restriction: 'with', color: '#b5892a', partners: 'local' },
    { id: 'prj', name: 'Projects', restriction: 'with', color: '#7b5ea7', partners: 'future' },
    // Board-designated: nobody restricted this money, but the board set it aside. The board can change its mind.
    { id: 'res', name: 'Operating Reserve', restriction: 'without', designated: true, color: '#4a6b8a',
      about: 'Three months of operating costs, for emergencies', approvedOn: 'Jan 12, 2026' },
  ],
  operatingFund: 'gen',

  // What members can give to, and where each gift goes. Splits add up to 100%.
  // RCC follows River Valley's Kingdom Builders model: tithes stay whole,
  // Kingdom Builders gifts are split across the vision funds.
  giving: [
    { id: 'tithe', name: 'Tithes', account: '4000', color: '#2557b8', split: [{ to: 'gen', pct: 100 }] },
    { id: 'kb', name: 'Kingdom Builders', account: '4010', color: '#b5892a', annualGoal: 120000, since: 'Jan 1, 2026', why: 'Kingdom Builders 2026 plan',
      campaign: { year: 2026, levels: ['Plan', 'Vision', 'Dream'], commitmentSunday: 'Jan 18', about: 'Plan: what I can give from my budget. Vision: a stretch. Dream: only if God provides.' },
      // Target share of each Kingdom Builders category (Local is expected to run higher in building years)
      partnerRanges: { local: [10, 30], global: [50, 70], future: [10, 15] },
      // How the year's giving arrives, for the cash forecast: 'q4' = most of it in Oct–Dec (Miracle Offering in November)
      pattern: 'q4',
      split: [{ to: 'mis', pct: 50 }, { to: 'bld', pct: 35 }, { to: 'prj', pct: 15 }] },
  ],

  banks: [
    { code: '1000', name: 'Operating Checking', last4: '4821', bankName: 'Sample Community Bank', bankCity: 'Rochester, NY', routing: '123456780', account: '0000004821' },   // sample numbers, not real
    { code: '1010', name: 'Building Savings', last4: '7710' },
    { code: '1050', name: 'Petty Cash', kind: 'cash', note: 'Locked box in office' },
  ],
  cards: [
    { code: '2000', name: 'Church Visa', last4: '1104', holder: 'dana', limit: 15000, style: '', closes: 25, due: 'Nov 19', payFrom: '1000', alertAt: 80, autopay: 'Full statement balance' },
    { code: '2010', name: 'Youth card', last4: '3307', holder: 'sam', limit: 2500, style: 'gold', closes: 25, due: 'Nov 19', payFrom: '1000', alertAt: 80, autopay: '' },
    { code: '2020', name: 'Facilities card', last4: '5562', holder: 'marcus', limit: 5000, style: 'alt', closes: 25, due: 'Nov 19', payFrom: '1000', alertAt: 80, autopay: 'Full statement balance' },
  ],

  // Printing checks. blank = the app prints everything including the MICR bank line (needs MICR toner);
  // preprinted = the bank's checks already have it, so only the payee, amount and date are printed.
  checks: { stock: 'blank', bank: '1000', nextNumber: 4419, signers: ['nick', 'pat'], layout: 'top', offsetX: 0, offsetY: 0 },

  // People who send receipts or review them (sample names except Nick).
  people: {
    dana:   { name: 'Dana Brooks', role: 'Office Manager', phone: '(585) 555-0142', email: 'dana.brooks@example.org', payBack: { method: 'Check' } },
    sam:    { name: 'Sam Rivera', role: 'Youth Pastor', phone: '(585) 555-0177', email: 'sam.rivera@example.org', payBack: { method: 'ACH', last4: '0912' } },
    marcus: { name: 'Marcus Hill', role: 'Facilities', phone: '(585) 555-0119', email: 'marcus.hill@example.org' },
    kelly:  { name: 'Kelly Tran', role: 'Hospitality volunteer', phone: '(585) 555-0163', email: 'kelly.tran@example.org', payBack: { method: 'ACH', last4: '6631' } },
    fin:    { name: 'Finance team', role: 'Treasurer + bookkeeper', phone: '', email: 'finance@example.org', group: true },
    nick:   { name: 'Nick Hodge', role: 'Admin', phone: '', email: 'nick@rochesterchristian.church' },
    pat:    { name: 'Pat Ellis', role: 'Treasurer', phone: '', email: 'pat.ellis@example.org' },
  },
  admins: ['nick'],              // can change these settings
  currentUser: 'nick',

  // Accounts RCC wants beyond the standard list
  extraAccounts: [{ code: '5130', name: 'Guest speakers & honorariums', type: 'expense' }, { code: '5140', name: 'Dues & memberships', type: 'expense' }, { code: '5230', name: 'Insurance', type: 'expense' }],

  // Spending categories people pick from → the account they post to.
  categories: {
    'Ministry supplies': '5100', 'Event supplies': '5110', 'Retreat deposit': '5110', 'Hospitality': '5120', 'Meals': '5120',
    'Utilities': '5200', 'Fire inspection': '5210', 'Building supplies': '5220', 'Office supplies': '5300',
    'Missionary support': '5400', 'Benevolence aid': '5410', 'Architect · design phase': '5420',
    'Cleaning': '5210', 'Honorarium': '5130', 'Worship musicians': '5130', 'Dues & memberships': '5140', 'Insurance': '5230',
  },

  // Yearly budgets. A project can sit inside one ministry (one level).
  budgets: [
    { name: 'Everyday ministry', fund: 'gen', lead: 'dana', budget: 60000 },
    { name: 'Staff & payroll', fund: 'gen', lead: 'fin', budget: 195000 },
    { name: 'Outreach Ministry', fund: 'gen', lead: 'dana', budget: 8000 },
    { name: 'Fall Festival', fund: 'gen', lead: 'dana', budget: 1500, date: 'Oct 31', parent: 'Outreach Ministry' },
    { name: 'Christmas Eve', fund: 'gen', lead: 'dana', budget: 2800, date: 'Dec 24', parent: 'Outreach Ministry' },
    { name: 'Youth Ministry', fund: 'gen', lead: 'sam', budget: 12000 },
    { name: 'Youth Retreat', fund: 'gen', lead: 'sam', budget: 4200, date: 'Nov 14–16', parent: 'Youth Ministry' },
    { name: 'MomCo', fund: 'gen', lead: 'kelly', budget: 3600 },
    { name: 'Kenya missions', fund: 'mis', lead: 'fin', budget: 36000 },
    { name: 'Local outreach', fund: 'mis', lead: 'fin', budget: 12000 },
    { name: 'Missions Sunday', fund: 'mis', lead: 'fin', budget: 600, date: 'Sep 21', done: true, parent: 'Local outreach' },
    { name: 'New Building', fund: 'bld', lead: 'fin', budget: 40000 },
    { name: 'Youth room remodel', fund: 'prj', lead: 'marcus', budget: 8000 },
    { name: 'Global partners', fund: 'mis', lead: 'fin', budget: 10000 },
    { name: 'Missions from the tithe', fund: 'gen', lead: 'fin', budget: 10500 },
    { name: 'Next generation', fund: 'prj', lead: 'sam', budget: 6000 },
  ],

  // Renting out the building. rate = the fair value of an hour in that space (what similar spaces nearby charge).
  // Renters may pay by donation, but up to the fair value it's rent; only the amount above it is a gift.
  rentals: {
    fund: 'gen', basis: 'donation', depositDefault: 200, insuranceForRecurring: true,
    spaces: [
      { id: 'hall', name: 'Fellowship Hall', rate: 60, holds: 120 },
      { id: 'classb', name: 'Classroom B', rate: 25, holds: 25 },
      { id: 'sanct', name: 'Sanctuary', rate: 120, holds: 300 },
    ],
  },

  policies: {
    // Gift acceptance: the board accepts gifts at or over this value (and all real estate); stock and crypto are sold right away
    gifts: { boardAcceptOver: 5000, sellPromptly: true },
    // Tithe on the tithe: each month the church gives pct% of last month's tithes to missions, from its own operating
    // money (members' tithes still go 100% to Operating). payTo: a partner id. Started October 2026.
    titheOnTithe: { on: true, pct: 10, from: 'tithe', payTo: 'p1', day: 5, budget: 'Missions from the tithe', account: '5400', start: '2026-10', auto: false },
    depositBank: '1000',          // where giving payouts and cash deposits land
    feeFund: 'gen',               // processing fees come out of here, so designated gifts stay whole
    reviewers: ['nick'],          // who reviews receipts
    approvers: ['nick', 'pat'],   // who can approve spending; bigger amounts need two of them
    approvalTiers: [
      { upTo: 500, approvals: 1 },
      { upTo: 10000, approvals: 2 },
      { upTo: null, approvals: 2, board: true },   // over $10,000: two approvals and a board vote
    ],
    restrictedMinApprovals: 2,
    askFirstOver: 250,            // buying more than this needs an approved spending request first
    requestGoodForDays: 30,       // an approved request expires if nothing is bought by then    // money given for a purpose (Kingdom Builders) always gets two
    lookClosely: { amount: 250 }, // flag for reviewers: reimbursements, restricted money, and anything this big or bigger
    receiptReminders: [0, 3, 7],  // text on these days after a charge; reviewers copied on the last one
    reimburseWithinDays: 60,
    countersRequired: 2,          // two unrelated people count every offering
    depositWithinDays: 2,         // flag counted money that hasn't reached the bank after this many days      // accountable plan: receipts for reimbursement within 60 days of buying
    cashCushion: 10000,           // warn before a card payment would leave less than this in the operating fund
    secondSignerOver: 1000,       // checks above this need two signers
    housingShare: 0.30,           // sample: share of clergy pay designated as housing allowance
    form1099Threshold: 2000,      // 1099-NEC/MISC: $600 through 2025, $2,000 from 2026 — confirm each year with your CPA
  },

  // Who hears about what, and how. Recipients: person ids, or 'approvers' / 'admins' / 'lead' (the budget's leader) / 'holder' (the card's holder)
  // Files attached to receipts, bills, vendors, statements and entries
  attachments: { maxMB: 25, keepYears: 7, receiptsOver: 0 },
  notifications: {
    weekly: { on: true, day: 1, hour: 7, to: ['approvers'], via: 'email' },          // Monday 7am treasurer summary
    budgets: { on: true, thresholds: [75, 100], to: ['lead'], alsoAt100: ['admins'], via: 'email' },
    bills: { on: true, before: [3], to: ['approvers'], via: 'email' },
    cards: { on: true, to: ['holder', 'admins'], via: 'text' },
    deposits: { on: true, to: ['admins'], via: 'text' },
    approvals: { on: true, to: ['approvers'], via: 'email' },                         // a daily "waiting for you" note
  },

  integrations: { giving: 'Planning Center Giving', registrations: 'Planning Center Registrations', processor: 'Stripe', payroll: 'ADP' },
});
