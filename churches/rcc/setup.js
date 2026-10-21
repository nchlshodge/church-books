// Church setup — Rochester Christian Church (today's model; realistic sample shaped like the Sept 2026 board packet).
// Everything that makes the books RCC's lives here. Another church gets its own copy of
// this file; the engine and the app don't change. In the hosted version this is the
// church's settings document, edited from an admin screen.
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CHURCH_SETUP = data;
})(typeof self !== 'undefined' ? self : this, {
  id: 'rcc',
  name: 'Rochester Christian Church',
  shortName: 'RCC',
  address: 'Rochester, NY',
  appName: 'Books',
  logo: '../rcc-logo-plain.png',
  timezone: 'America/New_York',
  fiscalYearStart: '01-01',
  receiptsEmail: 'receipts@rochesterchristian.church',
  receiptLinkBase: 'rcc.church/r/',

  // Where money is set aside. 'with' = givers restricted it to a purpose. Shaped like RCC's September 2026 packet
  // (today's model: a separate offering for each purpose). Kingdom Builders is planned for 2028 — see churches/rcc-kb.
  funds: [
    { id: 'gen', name: 'General Fund', restriction: 'without', color: '#2557b8', about: 'Day-to-day ministry' },
    { id: 'mis', name: 'Missions', restriction: 'with', color: '#2e7a52', partners: 'global' },
    { id: 'bld', name: 'New Legacy Building', restriction: 'with', color: '#b5892a', about: 'The new building campaign' },
    { id: 'reno', name: 'Building Renovation', restriction: 'with', color: '#7b5ea7', about: 'Repairs and renovations to the current building' },
    { id: 'ben', name: 'Benevolence', restriction: 'with', color: '#c0603a', about: 'Help for people in need' },
    // Board-designated: unrestricted money the board set aside for staff medical reimbursements
    { id: 'med', name: 'Medical Reimbursement', restriction: 'without', designated: true, color: '#4a6b8a', about: 'Set aside by the board for staff medical reimbursements', approvedOn: 'Jan 2019' },
    // What the church has invested in its buildings, land and equipment (net of depreciation) — not spendable cash
    { id: 'ppe', name: 'Buildings & Equipment', restriction: 'without', property: true, color: '#8a8f98', about: 'Invested in property and equipment' },
  ],
  operatingFund: 'gen',

  // What members can give to today. Each offering goes 100% to its own fund.
  giving: [
    { id: 'tithe', name: 'Tithes & Offerings', account: '4000', color: '#2557b8', split: [{ to: 'gen', pct: 100 }] },
    { id: 'missions', name: 'Missions Offering', account: '4010', color: '#2e7a52', split: [{ to: 'mis', pct: 100 }] },
    { id: 'legacy', name: 'New Legacy Building', account: '4020', color: '#b5892a', annualGoal: 250000, split: [{ to: 'bld', pct: 100 }] },   // three-year pledges: see pledgeCampaigns in sample.js
    { id: 'reno', name: 'Building Renovation', account: '4030', color: '#7b5ea7', split: [{ to: 'reno', pct: 100 }] },
    { id: 'benev', name: 'Benevolence', account: '4040', color: '#c0603a', split: [{ to: 'ben', pct: 100 }] },
  ],

  banks: [   // sample account details, not RCC's real numbers
    { code: '1000', name: 'PNC General Checking', last4: '4821', bankName: 'Sample Community Bank', bankCity: 'Rochester, NY', routing: '123456780', account: '0000004821' },
    { code: '1010', name: 'PNC Money Market', last4: '7710', rate: 3.25 },
    { code: '1020', name: 'Genisys 14-month CD', last4: '8541', rate: 4.05, matures: '2027-02-15' },
    { code: '1030', name: 'Genisys Savings & Checking', last4: '2040' },
    { code: '1040', name: 'Medical Checking', last4: '6882' },
    { code: '1045', name: 'Medical Money Market', last4: '4853', rate: 3.25 },
    { code: '1090', name: 'Petty Cash', kind: 'cash', note: 'Locked box in office' },
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

  // Accounts RCC wants beyond the standard list (shaped like its expense groups)
  extraAccounts: [
    { code: '5030', name: 'Health & dental insurance', type: 'expense', sub: 'payroll' }, { code: '5040', name: 'Retirement (403b)', type: 'expense', sub: 'payroll' },
    { code: '5050', name: 'Workers compensation', type: 'expense', sub: 'payroll' },
    { code: '5130', name: 'Guest speakers & honorariums', type: 'expense' }, { code: '5140', name: 'Dues, conferences & memberships', type: 'expense' }, { code: '5150', name: 'Childcare workers', type: 'expense' },
    { code: '5230', name: 'Insurance', type: 'expense' }, { code: '5240', name: 'Security, alarm & fire', type: 'expense' }, { code: '5250', name: 'Lawn, snow & landscaping', type: 'expense' },
    { code: '5260', name: 'Janitorial supplies', type: 'expense' }, { code: '5320', name: 'CPA & legal', type: 'expense' }, { code: '5330', name: 'Marketing', type: 'expense' },
    { code: '5405', name: 'Other missionary support', type: 'expense' }, { code: '5406', name: 'Missions projects & trips', type: 'expense' },
    { code: '5430', name: 'Building campaign costs', type: 'expense' }, { code: '5700', name: 'Vehicles & transportation', type: 'expense' },
  ],

  // Spending categories people pick from → the account they post to.
  categories: {
    'Ministry supplies': '5100', 'Event supplies': '5110', 'Retreat deposit': '5110', 'Hospitality': '5120', 'Meals': '5120',
    'Utilities': '5200', 'Fire inspection': '5240', 'Repairs': '5210', 'Building supplies': '5220', 'Office supplies': '5300', 'Software': '5310',
    'Missionary support': '5400', 'Other missionary support': '5405', 'Missions trip': '5406', 'Benevolence aid': '5410', 'Architect · design phase': '5420',
    'Cleaning': '5260', 'Lawn & snow': '5250', 'Honorarium': '5130', 'Worship musicians': '5130', 'Dues & memberships': '5140', 'Childcare': '5150', 'Insurance': '5230',
    'CPA & legal': '5320', 'Campaign costs': '5430', 'Vehicle': '5700',
  },

  // How spending splits between ministry (program), running the church (management) and raising money (fundraising),
  // for the statement of functional expenses. A budget's setting wins over the account's.
  functions: {
    default: 'program',
    byAccount: {
      '5000': { program: 75, management: 20, fundraising: 5 }, '5010': { program: 75, management: 20, fundraising: 5 }, '5020': { program: 75, management: 20, fundraising: 5 },
      '5030': { program: 75, management: 20, fundraising: 5 }, '5040': { program: 75, management: 20, fundraising: 5 }, '5050': { program: 75, management: 20, fundraising: 5 },
      '5200': { program: 85, management: 15 }, '5230': { program: 80, management: 20 }, '5800': { program: 85, management: 15 },
      '5300': 'management', '5310': 'management', '5320': 'management', '5600': 'management', '5500': 'fundraising', '5430': 'fundraising',
    },
    byProject: { 'Finance & administration': 'management' },
  },

  // Yearly budgets, by fund (rounded, shaped like the packet). A project or event can sit inside one ministry.
  budgets: [
    { name: 'Staff & payroll', fund: 'gen', lead: 'fin', budget: 960000 },
    { name: 'Building & utilities', fund: 'gen', lead: 'marcus', budget: 95000 },
    { name: 'Property maintenance', fund: 'gen', lead: 'marcus', budget: 24000 },
    { name: 'Tech, media & sound', fund: 'gen', lead: 'dana', budget: 17000 },
    { name: 'Auto & transportation', fund: 'gen', lead: 'marcus', budget: 6000 },
    { name: 'Finance & administration', fund: 'gen', lead: 'fin', budget: 9000 },
    { name: 'Everyday ministry', fund: 'gen', lead: 'dana', budget: 21000 },
    { name: 'Outreach Ministry', fund: 'gen', lead: 'dana', budget: 22000 },
    { name: 'Fall Festival', fund: 'gen', lead: 'dana', budget: 1500, date: 'Oct 31', parent: 'Outreach Ministry' },
    { name: 'Christmas Eve', fund: 'gen', lead: 'dana', budget: 2800, date: 'Dec 24', parent: 'Outreach Ministry' },
    { name: 'Pastoral & staff ministries', fund: 'gen', lead: 'fin', budget: 11500 },
    { name: 'Worship ministries', fund: 'gen', lead: 'dana', budget: 4800 },
    { name: 'Prayer ministries', fund: 'gen', lead: 'kelly', budget: 1200 },
    { name: 'Adult ministries', fund: 'gen', lead: 'kelly', budget: 12300 },
    // MomCo keeps its dues; at the end of the school year what's left goes to help pay for its childcare
    { name: 'MomCo', fund: 'gen', lead: 'kelly', budget: 3600, parent: 'Adult ministries', incomeAdds: true, seasonEnds: '05-31', leftoverTo: 'MomCo childcare' },
    { name: 'MomCo childcare', fund: 'gen', lead: 'kelly', budget: 4800, parent: 'Adult ministries' },
    { name: 'Kids ministries', fund: 'gen', lead: 'dana', budget: 15500 },
    { name: 'Youth Ministry', fund: 'gen', lead: 'sam', budget: 12000 },
    { name: 'Youth Retreat', fund: 'gen', lead: 'sam', budget: 4200, date: 'Nov 14–16', parent: 'Youth Ministry' },
    { name: 'Young adults', fund: 'gen', lead: 'sam', budget: 4000 },
    { name: 'Guest speakers', fund: 'gen', lead: 'fin', budget: 20000 },
    { name: 'AG missionary support', fund: 'mis', lead: 'fin', budget: 270000 },
    { name: 'Other missions support', fund: 'mis', lead: 'fin', budget: 180000 },
    { name: 'Missions projects & trips', fund: 'mis', lead: 'fin', budget: 150000 },
    { name: 'Kenya trip 2027', fund: 'mis', lead: 'fin', budget: 12000, parent: 'Missions projects & trips' },
    { name: 'Local outreach', fund: 'mis', lead: 'fin', budget: 12000 },
    { name: 'Missions Sunday', fund: 'mis', lead: 'fin', budget: 600, date: 'Sep 21', done: true, parent: 'Local outreach' },
    { name: 'New Legacy Building', fund: 'bld', lead: 'fin', budget: 60000 },
    { name: 'Building renovations', fund: 'reno', lead: 'marcus', budget: 40000 },
    { name: 'Youth room remodel', fund: 'reno', lead: 'marcus', budget: 8000, parent: 'Building renovations' },
    { name: 'Benevolence & compassion', fund: 'ben', lead: 'fin', budget: 8000 },
    { name: 'Medical reimbursements', fund: 'med', lead: 'fin', budget: 6000 },
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
    titheOnTithe: { on: false, pct: 10, from: 'tithe', payTo: 'p1', day: 5, account: '5400', start: '2026-10', auto: false },   // not RCC's practice today — available if the board adopts it
    capitalizeOver: 2500,         // things over this that last more than a year are recorded as buildings & equipment
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
