// Sample activity for Rochester Christian Church — made-up transactions for the mockup.
// In the hosted version these come from the church's own data (Planning Center, the bank,
// card feeds, receipts) and are stored per church. Nothing here changes the app's code.
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CHURCH_SAMPLE = data;
})(typeof self !== 'undefined' ? self : this, {
  today: '2026-10-18',
  statementThrough: 'Oct 17',
  payrollSchedule: { frequency: 'Monthly', next: 'Nov 15', approveBy: 'Nov 13' },

  // Online-giving payouts (by giving fund) and counted cash & checks
  payouts: [
  // push: the part of a giving fund's amount that was given to a giving push (a fund or label in the giving system)
  { date: 'Oct 17', gifts: 7,  split: { tithe: 760.00, kb: 175.00 }, push: { 'h-oct': 90 }, fee: 29.42, status: 'New' },
  { date: 'Oct 15', gifts: 38, split: { tithe: 6420.00, kb: 1380.00 }, push: { 'h-oct': 540 }, fee: 241.38, status: 'Recorded' },
  { date: 'Oct 13', gifts: 12, split: { tithe: 1980.00, kb: 150.00 }, push: { 'h-oct': 120 }, fee: 66.12, status: 'Recorded' },
  { date: 'Oct 8',  gifts: 41, split: { tithe: 7110.00, kb: 1775.00 }, push: { 'h-oct': 650 }, fee: 276.05, status: 'Recorded' },
  { date: 'Oct 6',  gifts: 9,  split: { tithe: 1405.00, kb: 100.00 }, push: { 'h-oct': 80 }, fee: 47.60, status: 'Recorded' },
],
  // Counted offerings. Counted → (taken to the bank) → Deposited
  cash: [
    { id: 'c1018', date: 'Oct 18', by: 'Dana Brooks', by2: 'Pat Ellis', cash: 1140.00, checks: 1985.00, split: { tithe: 2825.00, kb: 300.00 }, push: { 'h-oct': 150 }, status: 'Counted' },
    { id: 'c1012', date: 'Oct 12', by: 'Counting team A', by2: 'Counting team A', cash: 1284.00, checks: 2350.00, split: { tithe: 3354.00, kb: 280.00 }, push: { 'h-oct': 280 }, status: 'Deposited', deposited: 'Oct 13', slip: '0411', takenBy: 'Dana Brooks' },
    { id: 'c1005', date: 'Oct 5', by: 'Counting team B', by2: 'Counting team B', cash: 962.00, checks: 1875.00, status: 'Deposited', deposited: 'Oct 6', slip: '0410', takenBy: 'Dana Brooks' },
  ],

  // Spending. Stages: Needs receipt → Needs review → Done
  expenses: [
  { date: 'Oct 16', days: 2,  payee: "Lowe's",             amt: 142.88,  who: 'marcus', proj: 'Youth room remodel', acct: 'Building supplies',     paid: 'Facilities card ••5562', receipt: false, status: 'Needs receipt' },
  { date: 'Oct 16', days: 2,  payee: 'Costco',             amt: 214.37,  who: 'sam',    proj: 'Youth Retreat',      acct: 'Ministry supplies',     paid: 'Youth card ••3307',      receipt: true,  status: 'Needs review',
    splits: [{ proj: 'Youth Retreat', acct: 'Ministry supplies', amt: 164.37 }, { proj: 'Fall Festival', acct: 'Event supplies', amt: 50.00 }] },
  { date: 'Oct 15', days: 3,  payee: 'Rochester Gas & Electric', amt: 1842.10, who: 'dana', proj: 'Everyday ministry', acct: 'Utilities',          paid: 'Check #4418',            receipt: true,  status: 'Done' },
  { date: 'Oct 14', days: 4,  payee: 'Party City',         amt: 96.45,   who: 'dana',   proj: 'Fall Festival',      acct: 'Event supplies',        paid: 'Church Visa ••1104',     receipt: false, status: 'Needs receipt' },
  { date: 'Oct 13', days: 5,  payee: 'Home Depot',         amt: 388.02,  who: 'marcus', proj: 'Youth room remodel', acct: 'Building supplies',     paid: 'Facilities card ••5562', receipt: true,  status: 'Needs review' },
  { date: 'Oct 11', days: 7,  payee: 'Amazon',             amt: 57.98,   who: 'dana',   proj: 'Everyday ministry',  acct: 'Office supplies',       paid: 'Church Visa ••1104',     receipt: false, status: 'Needs receipt' },
  { date: 'Oct 10', days: 8,  payee: 'Wegmans',            amt: 142.60,  who: 'kelly',  proj: 'Fall Festival',      acct: 'Hospitality',           paid: 'Reimbursement',          receipt: true,  status: 'Needs review' },
  { date: 'Oct 6',  days: 12, payee: 'Michaels', amt: 38.47, who: 'kelly', proj: 'Fall Festival', acct: 'Event supplies', paid: 'Reimbursement', receipt: true, status: 'Done', reimb: 'To pay' },
  { date: 'Oct 15', days: 3, payee: 'Panera Bread', amt: 86.20, who: 'kelly', proj: 'MomCo', acct: 'Hospitality', paid: 'Reimbursement', receipt: true, status: 'Done', reimb: 'To pay' },
  { date: 'Oct 9',  days: 9,  payee: 'Target', amt: 52.18, who: 'sam', proj: 'Youth Ministry', acct: 'Ministry supplies', paid: 'Reimbursement', receipt: true, status: 'Done', reimb: 'To pay' },
  { date: 'Jul 30', days: 80, payee: 'Office Depot', amt: 64.20, who: 'marcus', proj: 'Everyday ministry', acct: 'Office supplies', paid: 'Reimbursement', receipt: true, status: 'Needs review' },
  { date: 'Oct 8',  days: 10, payee: 'Chick-fil-A',        amt: 68.40,   who: 'sam',    proj: 'Youth Retreat',      acct: 'Meals',                 paid: 'Youth card ••3307',      receipt: false, status: 'Needs receipt' },
  { date: 'Oct 9',  days: 9,  payee: 'Hope Haven Shelter', amt: 500.00,  who: 'dana',   proj: 'Everyday ministry',  acct: 'Benevolence aid',       paid: 'Check #4417',            receipt: true,  status: 'Done' },
  { date: 'Oct 7',  days: 11, payee: 'Camp Pinewood',      amt: 1200.00, who: 'sam',    proj: 'Youth Retreat',      acct: 'Retreat deposit',       paid: 'Check #4416',            receipt: true,  status: 'Done' },
  { date: 'Oct 3',  days: 15, payee: 'Genesee Design Group', amt: 8650.00, who: 'fin',  proj: 'New Building',       acct: 'Architect · design phase', paid: 'Check #4415',         receipt: true,  status: 'Done' },
  { date: 'Oct 1',  days: 17, payee: 'East Africa Mission Partners', amt: 1500.00, who: 'fin', proj: 'Kenya missions', acct: 'Missionary support',   paid: 'ACH',                    receipt: true,  status: 'Done' },
],
  // Event sign-ups (Planning Center Registrations). Each event is linked to the budget it belongs to;
  // payouts are recorded straight to those events. proj: null = not linked yet.
  registrations: {
    events: [
      { id: 'e1', name: 'Fall Youth Retreat 2026', proj: 'Youth Retreat', price: 150, signups: 18 },
      { id: 'e2', name: 'Fall Festival craft tables', proj: 'Fall Festival', price: 25, signups: 6 },
      { id: 'e3', name: 'Kenya Mission Trip 2027 — deposits', proj: 'Kenya missions', price: 500, signups: 4 },
      { id: 'e4', name: "Women's Retreat 2027", proj: null, price: 120, signups: 9 },
      { id: 'e5', name: 'MomCo fall dues', proj: 'MomCo', price: 40, signups: 18 },
    ],
    payouts: [
      { id: 'rp0', date: 'Oct 2', lines: [{ event: 'e5', count: 18, amount: 720 }], fee: 21.60, status: 'Recorded' },
      { id: 'rp1', date: 'Oct 3', lines: [{ event: 'e1', count: 10, amount: 1500 }, { event: 'e3', count: 2, amount: 1000 }], fee: 79.10, status: 'Recorded' },
      { id: 'rp2', date: 'Oct 10', lines: [{ event: 'e1', count: 6, amount: 900 }, { event: 'e2', count: 6, amount: 150 }], fee: 32.85, status: 'Recorded' },
      { id: 'rp3', date: 'Oct 17', lines: [{ event: 'e1', count: 2, amount: 300 }, { event: 'e3', count: 2, amount: 1000 }, { event: 'e4', count: 9, amount: 1080 }], fee: 72.05, status: 'New' },
    ],
    refunds: [{ id: 'rf1', date: 'Oct 12', event: 'e1', amount: 150, note: 'Family had a conflict', status: 'Recorded' }],
  },

  // Commitments from the giving system's pledge campaign (sample households — private in real life).
  // amounts follow the campaign's levels (Plan / Vision / Dream); given = given so far this year.
  commitments: {
    kb: [
      { household: 'The Alvarez household', amounts: [15000, 18800, 24000], given: 12750 },
      { household: 'The Brennan household', amounts: [12000, 15000, 19200], given: 9600 },
      { household: 'The Chen household', amounts: [10000, 12500, 16000], given: 7800 },
      { household: 'The Douglas household', amounts: [8000, 10000, 12800], given: 7200 },
      { household: 'The Esposito household', amounts: [7500, 9400, 12000], given: 4500 },
      { household: 'The Fairbanks household', amounts: [6000, 7500, 9600], given: 4920 },
      { household: 'The Garcia household', amounts: [6000, 7500, 9600], given: 4500 },
      { household: 'The Hughes household', amounts: [5000, 6200, 8000], given: 4750 },
      { household: 'The Ibrahim household', amounts: [5000, 6200, 8000], given: 2000 },
      { household: 'The Jensen household', amounts: [4800, 6000, 7700], given: 3840 },
      { household: 'The Kowalski household', amounts: [4000, 5000, 6400], given: 3320 },
      { household: 'The Lindqvist household', amounts: [3600, 4500, 5800], given: 2520 },
      { household: 'The Moreau household', amounts: [3000, 3800, 4800], given: 3060 },
      { household: 'The Nakamura household', amounts: [3000, 3800, 4800], given: 1500 },
      { household: 'The Okafor household', amounts: [2400, 3000, 3800], given: 1920 },
      { household: 'The Patel household', amounts: [2400, 3000, 3800], given: 2040 },
      { household: 'The Quinn household', amounts: [1800, 2200, 2900], given: 1420 },
      { household: 'The Russo household', amounts: [1200, 1500, 1900], given: 1200 },
      { household: 'The Silva household', amounts: [1200, 1500, 1900], given: 360 },
      { household: 'The Thompson household', amounts: [600, 800, 1000], given: 480 },
    ],
  },

  // Spending requests: asking before buying. Waiting → Approved (money set aside) → Used, or Declined / Expired
  requests: [
    { id: 'r1', who: 'sam', what: 'T-shirts for the youth retreat (40)', amt: 420.00, proj: 'Youth Retreat', acct: 'Ministry supplies', needBy: 'Nov 1', asked: 'Oct 16', why: 'Retreat theme shirts for every student and leader', status: 'Waiting', approvals: [] },
    { id: 'r2', who: 'marcus', what: 'Paint and trim for the youth room', amt: 650.00, proj: 'Youth room remodel', acct: 'Building supplies', needBy: 'Oct 25', asked: 'Oct 15', why: 'Second phase of the remodel', status: 'Waiting', approvals: [{ by: 'nick', on: 'Oct 16' }] },
    { id: 'r3', who: 'dana', what: 'Bounce house rental for Fall Festival', amt: 350.00, proj: 'Fall Festival', acct: 'Event supplies', needBy: 'Oct 31', asked: 'Oct 9', why: 'Kids area', status: 'Approved', approvals: [{ by: 'nick', on: 'Oct 10' }], approvedOn: 'Oct 10' },
    { id: 'r4', who: 'dana', what: 'Party supplies for Fall Festival', amt: 100.00, proj: 'Fall Festival', acct: 'Event supplies', needBy: 'Oct 20', asked: 'Oct 7', why: '', status: 'Approved', approvals: [{ by: 'nick', on: 'Oct 8' }], approvedOn: 'Oct 8' },
  ],

  // Vendors the church pays by check or ACH. entity decides whether they get a 1099.
  vendors: [
    { id: 'abc', name: 'ABC Fire Protection', entity: 'Corporation', email: 'billing@abcfire.example', payBy: 'Check', w9: 'On file', w9Date: 'Feb 3, 2025', tin: '4417' },
    { id: 'rge', name: 'Rochester Gas & Electric', entity: 'Utility / government', email: '', payBy: 'Check', w9: 'Not needed' },
    { id: 'genesee', name: 'Genesee Design Group', entity: 'LLC', email: 'ap@geneseedesign.example', payBy: 'ACH', w9: 'On file', w9Date: 'Aug 19, 2026', tin: '9031' },
    { id: 'bright', name: 'Bright Clean Services', entity: 'Individual / sole proprietor', email: 'tina@brightclean.example', payBy: 'ACH', w9: 'On file', w9Date: 'Jan 8, 2026', tin: '2290' },
    { id: 'santos', name: 'Rev. Maria Santos', entity: 'Individual / sole proprietor', email: 'msantos@example.com', payBy: 'Check', w9: 'Requested', w9Date: 'Oct 12, 2026' },
    { id: 'ellis', name: 'Jordan Ellis', entity: 'Individual / sole proprietor', email: 'jordan.ellis@example.com', payBy: 'ACH', w9: 'Missing' },
    { id: 'camp', name: 'Camp Pinewood', entity: 'Nonprofit', email: 'office@camppinewood.example', payBy: 'Check', w9: 'Not needed' },
    { id: 'eamp', name: 'East Africa Mission Partners', entity: 'Nonprofit', email: 'support@eamp.example', payBy: 'ACH', w9: 'Not needed' },
    { id: 'hopehaven', name: 'Hope Haven Shelter', entity: 'Nonprofit', email: 'office@hopehaven.example', payBy: 'Check', w9: 'Not needed', address: '88 Clinton Ave\nRochester, NY 14604' },
    { id: 'network', name: 'Finger Lakes Church Network', entity: 'Nonprofit', email: 'dues@flcn.example', payBy: 'ACH', w9: 'Not needed' },
    { id: 'insure', name: 'Keystone Church Insurance', entity: 'Corporation', email: 'billing@keystone.example', payBy: 'Check', w9: 'On file', w9Date: 'Mar 1, 2024', tin: '3381', address: 'PO Box 900\nHarrisburg, PA 17101' },
    { id: 'supply', name: 'Church Supply Co.', entity: 'Corporation', email: 'orders@churchsupply.example', payBy: 'ACH', w9: 'On file', w9Date: 'May 2, 2024', tin: '7710' },
  ],
  // Bills: To approve → Approved (scheduled) → Paid
  bills: [
    { id: 'b1', enteredBy: 'dana', vendor: 'abc', number: 'INV-2041', received: 'Oct 8', due: 'Oct 24', amt: 615.00, proj: 'Everyday ministry', acct: 'Fire inspection', status: 'To approve', file: 'INV-2041.pdf', note: 'Annual sprinkler inspection' },
    { id: 'b2', vendor: 'bright', number: '1018', received: 'Oct 1', due: 'Oct 15', amt: 480.00, proj: 'Everyday ministry', acct: 'Cleaning', status: 'Approved', file: 'BrightClean-1018.pdf', note: 'October cleaning' },
    { id: 'b3', vendor: 'santos', number: 'Honorarium', received: 'Oct 5', due: 'Oct 22', amt: 300.00, proj: 'Outreach Ministry', acct: 'Honorarium', status: 'Approved', payOn: 'Oct 22', method: 'Check', note: 'Guest speaker, Oct 4 outreach night' },
    { id: 'b4', enteredBy: 'dana', vendor: 'genesee', number: 'INV-778', received: 'Oct 12', due: 'Nov 11', amt: 12400.00, proj: 'New Building', acct: 'Architect · design phase', status: 'To approve', file: 'GDG-INV-778.pdf', note: 'Design development, phase 2' },
    { id: 'b5', vendor: 'ellis', number: 'Sept 28', received: 'Oct 1', due: 'Oct 2', amt: 150.00, proj: 'Everyday ministry', acct: 'Worship musicians', status: 'Paid', paidOn: 'Oct 2', method: 'ACH', note: 'Bass, Sept 28 services' },
  ],
  // Recurring payments: approved once (on the yearly total), then paid on schedule.
  // auto: true pays by itself on the date; false waits for one click.
  schedules: [
    { id: 's1', vendor: 'eamp', what: 'Missionary support — the Ochieng family, Kenya', amt: 1500.00, every: 'monthly', start: '2026-01-01', day: 1, lastRun: '2026-10-01', method: 'ACH', auto: true,
      proj: 'Kenya missions', acct: 'Missionary support', status: 'Active', approvals: [{ by: 'nick', on: 'Dec 14, 2025' }, { by: 'pat', on: 'Dec 14, 2025' }, { kind: 'board', on: 'Dec 9, 2025', note: 'December minutes, item 3' }] },
    { id: 's2', vendor: 'hopehaven', what: 'Monthly gift to Hope Haven Shelter', amt: 250.00, every: 'monthly', start: '2026-01-15', day: 15, lastRun: '2026-09-15', method: 'Check', auto: false,
      proj: 'Local outreach', acct: 'Benevolence aid', status: 'Active', approvals: [{ by: 'nick', on: 'Jan 5' }, { by: 'pat', on: 'Jan 6' }] },
    { id: 's3', vendor: 'network', what: 'Quarterly network dues', amt: 600.00, every: 'quarterly', start: '2026-01-10', day: 10, lastRun: '2026-07-10', method: 'ACH', auto: true,
      proj: 'Everyday ministry', acct: 'Dues & memberships', status: 'Active', approvals: [{ by: 'nick', on: 'Jan 5' }, { by: 'pat', on: 'Jan 6' }] },
    { id: 's4', vendor: 'insure', what: 'Property & liability insurance', amt: 6800.00, every: 'yearly', start: '2026-03-01', day: 1, lastRun: '2026-03-01', method: 'Check', auto: false,
      proj: 'Everyday ministry', acct: 'Insurance', status: 'Active', approvals: [{ by: 'nick', on: 'Feb 20' }, { by: 'pat', on: 'Feb 21' }] },
  ],
  subscriptions: [
  // budget: what it's counted against; card: last 4 digits, or payBy 'ACH' / 'Check'
  { id: 'sub1', name: 'Planning Center',       cost: 289.00, cycle: 'mo', next: 'Nov 1',  card: '1104', fund: 'gen', budget: 'Everyday ministry', billing: true,  last: 'Oct 17' },
  { id: 'sub2', name: 'Adobe Creative Cloud',  cost: 89.99,  cycle: 'mo', next: 'Oct 22', card: '1104', fund: 'gen', budget: 'Everyday ministry', billing: true,  last: 'Oct 15' },
  { id: 'sub3', name: 'CCLI Streaming + Copy', cost: 468.00, cycle: 'yr', next: 'Oct 30', card: '1104', fund: 'gen', budget: 'Everyday ministry', billing: false, flag: 'Renews soon' },
  { id: 'sub4', name: 'ProPresenter',          cost: 199.00, cycle: 'yr', next: 'Mar 4',  card: '1104', fund: 'gen', budget: 'Everyday ministry', billing: true,  last: 'Mar 4' },
  { id: 'sub5', name: 'Canva for Teams',       cost: 119.99, cycle: 'yr', next: 'Jan 12', card: '1104', fund: 'gen', budget: 'Everyday ministry', billing: true,  last: 'Jan 12' },
  { id: 'sub6', name: 'Zoom Pro',              cost: 15.99,  cycle: 'mo', next: 'Oct 28', card: '1104', fund: 'gen', budget: 'Everyday ministry', billing: false, flag: 'Not used in 60 days' },
  { id: 'sub7', name: 'Firebase (RCC Hub)',    cost: 5.00,   cycle: 'mo', next: 'Nov 1',  card: '1104', fund: 'gen', budget: 'Everyday ministry', billing: true,  last: 'Oct 1' },
  { id: 'sub8', name: 'Download Youth Ministry', cost: 19.99, cycle: 'mo', next: 'Nov 3', card: '3307', fund: 'gen', budget: 'Youth Ministry', billing: true, last: 'Oct 3' },
  { id: 'sub9', name: 'MomCo national membership', cost: 450.00, cycle: 'yr', next: 'Feb 1', payBy: 'ACH', fund: 'gen', budget: 'MomCo', billing: true, last: 'Feb 1' },
],
  inbox: [
  { date: 'Oct 17', from: 'Planning Center', addr: 'billing@planningcenter.com', subj: 'Your Planning Center receipt', file: 'PCO-receipt-Oct.pdf', amt: 289.00, state: 'matched', note: 'Planning Center subscription · filed under Everyday ministry' },
  { date: 'Oct 16', from: 'Marcus Hill', addr: 'forwarded', subj: "Fwd: Your Lowe's e-receipt", file: 'Lowes-receipt.pdf', amt: 142.88, state: 'suggest', payee: "Lowe's" },
  { date: 'Oct 15', from: 'Adobe', addr: 'message@adobe.com', subj: 'Your Adobe invoice', file: 'Adobe-invoice-8812.pdf', amt: 89.99, state: 'matched', note: 'Adobe Creative Cloud subscription · filed under Everyday ministry' },
  { date: 'Oct 14', from: 'Dana Brooks', addr: 'forwarded', subj: 'Fwd: Your Amazon.com order #112-4471', file: 'email', amt: 57.98, state: 'suggest', payee: 'Amazon' },
  { date: 'Oct 12', from: 'Church Supply Co.', addr: 'orders@churchsupply.example', subj: 'Invoice #20931 — due Nov 11', file: 'Invoice-20931.pdf', amt: 212.50, state: 'bill', vendor: 'supply', number: '20931', due: 'Nov 11', note: 'Looks like a bill to pay, not a card receipt' },
  { date: 'Oct 11', from: 'Canva', addr: 'no-reply@canva.com', subj: "What's new in Canva this month", file: '', amt: 0, state: 'ignored', note: 'Not a receipt' },
],
  bankLines: [
  { date: 'Oct 17', desc: 'STRIPE TRANSFER',   amt: 905.58,    match: null, ok: false, kind: 'payout' },
  { date: 'Oct 17', desc: 'STRIPE TRANSFER REG', amt: 2307.95, match: null, ok: false, kind: 'regpayout', ref: 'rp3' },
  { date: 'Oct 16', desc: 'COSTCO WHSE #0412', amt: -214.37,   match: 'Expense · Costco', ok: true },
  { date: 'Oct 15', desc: 'STRIPE TRANSFER',   amt: 7558.62,   match: 'Planning Center payout Oct 15', ok: true },
  { date: 'Oct 15', desc: 'CHECK 4418',        amt: -1842.10,  match: 'Check #4418 · RG&E', ok: true },
  { date: 'Oct 14', desc: 'ACH GUSTO PAYROLL', amt: -14212.48, match: 'Payroll Oct 15', ok: true },
  { date: 'Oct 14', desc: 'MOBILE DEPOSIT',    amt: 425.00,    match: null, ok: false },
  { date: 'Oct 13', desc: 'DEPOSIT',           amt: 3634.00,   match: 'Cash & checks Oct 12', ok: true },
  { date: 'Oct 13', desc: 'SERVICE CHARGE',    amt: -4.75,     match: null, ok: false },
],
  // Staff. alloc: how each person's pay is split across budgets, by the date it started (default: all to the payroll budget)
  staff: [
  { role: 'Lead Pastor',            type: 'Clergy',   gross: 4250.00, fund: 'gen' },
  { role: 'Associate Pastor',       type: 'Clergy',   gross: 3400.00, fund: 'gen',
      alloc: [{ from: '2026-10-01', lines: [{ proj: 'Staff & payroll', pct: 80 }, { proj: 'Kenya missions', pct: 20 }] }] },   // leads the Kenya partnership
  { role: 'Youth Pastor',           type: 'Clergy',   gross: 2600.00, fund: 'gen',
      alloc: [{ from: '2026-07-01', lines: [{ proj: 'Staff & payroll', pct: 75 }, { proj: 'Youth Ministry', pct: 25 }] }] },
  { role: 'Office Manager',         type: 'Employee', gross: 2100.00, fund: 'gen' },
  { role: 'Worship Director',       type: 'Employee', gross: 2300.00, fund: 'gen' },
  { role: 'Facilities (part-time)', type: 'Employee', gross: 980.00,  fund: 'gen',
      alloc: [{ from: '2026-10-01', lines: [{ proj: 'Staff & payroll', pct: 50 }, { proj: 'New Building', pct: 50 }] }] },   // oversees the building project
],
  // Gifts of something other than money. value = the church's fair value for its own books (never printed on the
  // donor's receipt). use: sell (→ 1300 until sold), keep (→ 1600 equipment & vehicles) or expense (used up → that account).
  nonCash: [
    { id: 'nc1', date: 'Oct 3', donor: 'd-parker', kind: 'stock', description: 'Apple Inc. common stock', quantity: 40, ticker: 'AAPL', value: 9124.00,
      valueHow: 'Average of the high and low price on Oct 3', giving: 'kb', use: 'sell', sold: { date: 'Oct 7', proceeds: 9180.00, fee: 0 }, ackSent: 'Oct 8' },
    { id: 'nc2', date: 'Oct 9', donor: 'd-nguyen', kind: 'goods', description: 'Yamaha P-125 digital keyboard (used, good condition)', value: 650.00,
      valueHow: 'Similar used listings online', giving: 'tithe', use: 'expense', account: '5100' },
    { id: 'nc4', date: 'Oct 12', donor: 'd-patel', kind: 'goods', description: 'Coffee, creamer and cups for Sunday fellowship', value: 180.00,
      valueHow: 'The store receipt', giving: 'tithe', use: 'expense', account: '5120', ackSent: 'Oct 13' },
    { id: 'nc3', date: 'Oct 14', donor: 'd-okafor', kind: 'vehicle', description: '2017 Honda Odyssey minivan, VIN ending 4471', value: 14500.00, claimed: 14500.00,
      valueHow: 'Qualified appraisal (Monroe Auto Appraisers)', giving: 'tithe', use: 'keep', keptForUse: true, boardAccepted: 'Oct 13', appraisalSeen: true },
  ],
  // Groups using the building. basis: 'fee' (set rent) or 'donation' (suggested donation — still rent up to the fair value).
  // days: weekly days (0 = Sunday); dates: one-time. payments cover a number of uses.
  rentals: [
    { id: 'r1', renter: 'Rochester Community Chorus', contact: 'Helen Marsh', email: 'helen@rochesterchorus.example', kind: 'Nonprofit group',
      space: 'hall', start: '2026-09-01', end: '2026-12-15', days: [2], from: '19:00', to: '21:00', basis: 'fee', asked: 120,
      signed: 'Aug 26', insuranceUntil: '2027-06-30', deposit: { amount: 200, received: 'Oct 2' }, payments: [{ date: 'Oct 2', amount: 600, uses: 5, method: 'Check #2214' }], status: 'Active' },
    { id: 'r2', renter: 'Parker family — birthday party', contact: 'Lisa Parker', email: 'parkers@example.com', donor: 'd-parker', kind: 'Family event',
      space: 'hall', dates: ['2026-10-10'], from: '14:00', to: '18:00', basis: 'donation', asked: 200,
      signed: 'Oct 1', payments: [{ date: 'Oct 10', amount: 400, uses: 1, method: 'Planning Center' }], status: 'Done' },
    { id: 'r3', renter: 'Thursday Recovery Group', contact: 'Mark D.', email: 'recovery.group@example.org', kind: 'Community group',
      space: 'classb', start: '2026-10-01', end: '2027-06-30', days: [4], from: '19:00', to: '20:30', basis: 'donation', asked: 20,
      signed: 'Sep 24', payments: [{ date: 'Oct 1', amount: 20, uses: 1, method: 'Cash' }, { date: 'Oct 8', amount: 20, uses: 1, method: 'Cash' }, { date: 'Oct 15', amount: 20, uses: 1, method: 'Cash' }], status: 'Active' },
    { id: 'r4', renter: 'Bright Futures Tutoring LLC', contact: 'Dana Wu', email: 'dana@brightfutures.example', kind: 'Business',
      space: 'classb', start: '2026-11-02', end: '2027-05-26', days: [1, 3], from: '15:30', to: '17:30', basis: 'fee', asked: 50, payments: [], status: 'Sent' },
  ],
  // Kingdom Builders partners: who the giving goes out to. annual = approved for this year; schedule: monthly,
  // quarterly, once (by dueBy) or asAble. paidBefore = paid Jan–Sep (already in the earlier books).
  // rubric answers are 0–3 per question. payThrough: a missionary is paid through their sending agency.
  partners: [
    { id: 'p1', name: 'Assemblies of God World Missions', category: 'global', fund: 'mis', budget: 'Kenya missions', status: 'Approved', annual: 24000, schedule: 'monthly', paidBefore: 18000,
      about: 'Missionary support and church planting through our denomination\'s sending agency.', verified: 'Denominational sending agency', since: 2019,
      rubric: { relationship: 3, vision: 3, affiliation: 3, years: 3, involvement: 2, field: 2, focus: 3, intangible: 3 }, payments: [{ date: 'Oct 1', amount: 2000, method: 'ACH' }] },
    { id: 'p2', name: 'Live Dead (through AGWM)', category: 'global', fund: 'mis', budget: 'Kenya missions', status: 'Approved', annual: 12000, schedule: 'quarterly', paidBefore: 9000,
      about: 'Church-planting teams among unreached people groups in East Africa.', verified: 'Paid through the AGWM project account', since: 2022,
      rubric: { relationship: 2, vision: 3, affiliation: 2, years: 2, involvement: 1, field: 3, focus: 3, intangible: 3 }, payments: [] },
    { id: 'p3', name: 'The Mensah family', category: 'global', fund: 'mis', budget: 'Global partners', status: 'Approved', annual: 3600, schedule: 'monthly', paidBefore: 2700,
      about: 'AGWM missionaries to Ghana, sent from RCC in 2021.', payThrough: 'AGWM missionary account #24117', verified: 'AGWM missionary account', since: 2021,
      rubric: { relationship: 3, vision: 3, affiliation: 3, years: 2, involvement: 3, field: 1, focus: 3, intangible: 3 }, payments: [{ date: 'Oct 1', amount: 300, method: 'ACH' }] },
    { id: 'p4', name: 'Convoy of Hope', category: 'global', fund: 'mis', budget: 'Global partners', status: 'Approved', annual: 5000, schedule: 'once', dueBy: '2026-11-20',
      about: 'Disaster relief and winter supplies for families — our October highlight.', verified: 'IRS Tax Exempt Organization Search · Oct 2, 2026', since: 2025,
      rubric: { relationship: 1, vision: 2, affiliation: 1, years: 3, involvement: 1, field: 1, focus: 2, intangible: 2 }, payments: [] },
    { id: 'p5', name: 'Hope Haven Shelter', category: 'local', fund: 'mis', budget: 'Local outreach', status: 'Approved', annual: 6000, schedule: 'quarterly', paidBefore: 4500,
      about: 'Emergency housing for women and children in Rochester.', verified: 'IRS Tax Exempt Organization Search · Jan 8, 2026', since: 2020,
      rubric: { relationship: 3, vision: 2, affiliation: 1, years: 3, involvement: 3, field: 0, focus: 2, intangible: 3 }, payments: [{ date: 'Oct 5', amount: 1500, method: 'ACH' }] },
    { id: 'p6', name: 'New Building', category: 'local', fund: 'bld', budget: 'New Building', status: 'Approved', annual: 40000, schedule: 'asAble', ours: true,
      about: 'Our own building project — the Local share is higher while it\'s underway.', payments: [] },
    { id: 'p7', name: 'Camp Pinewood scholarships', category: 'future', fund: 'prj', budget: 'Next generation', status: 'Approved', annual: 3000, schedule: 'once', dueBy: '2026-10-15',
      about: 'Summer camp for kids whose families can\'t afford it.', verified: 'IRS Tax Exempt Organization Search · Mar 3, 2026', since: 2024,
      rubric: { relationship: 2, vision: 2, affiliation: 1, years: 3, involvement: 2, field: 0, focus: 2, intangible: 3 }, payments: [{ date: 'Oct 6', amount: 3000, method: 'ACH' }] },
    { id: 'p8', name: 'Northeast Bible College', category: 'future', fund: 'prj', budget: 'Next generation', status: 'Approved', annual: 2500, schedule: 'once', dueBy: '2026-12-15',
      about: 'Church-match scholarships for RCC students studying for ministry.', verified: 'IRS Tax Exempt Organization Search · Aug 12, 2026', since: 2026,
      rubric: { relationship: 2, vision: 3, affiliation: 2, years: 3, involvement: 1, field: 0, focus: 2, intangible: 2 }, payments: [] },
    { id: 'p9', name: 'Clean Water Wells Initiative', category: 'global', fund: 'mis', status: 'Requested', requested: 5000, requestedOn: 'Oct 12',
      contact: 'Grace Adeyemi, Partnerships Director', email: 'partners@cleanwaterwells.example', about: 'Drilling wells with local churches in northern Nigeria; asking for 2 wells next year.',
      rubric: { relationship: 1, vision: 2, affiliation: 1, years: 2 }, payments: [] },
  ],
  // Giving pushes. highlight: one partner or project for a month (Ask, Update, Celebrate, Break); miracle: the
  // year-end Miracle Offering. counts: 'partner' (all of it goes to that partner) or 'split' (the giving fund's usual split).
  // raisedBefore / sentBefore: from before these books.
  pushes: [
    { id: 'h-sep', kind: 'highlight', name: 'Hope Haven winter beds', year: 2026, month: 9, partner: 'p5', giving: 'kb', counts: 'partner', goal: 2500, raisedBefore: 2480, sentBefore: 2480 },
    { id: 'h-oct', kind: 'highlight', name: 'Convoy of Hope winter relief', year: 2026, month: 10, partner: 'p4', giving: 'kb', counts: 'partner', goal: 3000 },
    { id: 'mo-2026', kind: 'miracle', name: 'Miracle Offering 2026', year: 2026, giving: 'kb', counts: 'split', goal: 55000 },
  ],
  // Households, with their regular giving per month (from the giving system) — for year-end statements
  donors: [
    { id: 'd-parker', name: 'Tom & Lisa Parker', address: '18 Linden St, Rochester, NY 14620', email: 'parkers@example.com', monthly: { tithe: 400, kb: 150 } },
    { id: 'd-nguyen', name: 'Anh & Mai Nguyen', address: '42 Grove Ave, Rochester, NY 14607', email: 'nguyen.family@example.com', monthly: { tithe: 260, kb: 75 } },
    { id: 'd-okafor', name: 'Chidi Okafor', address: '7 Westfield Rd, Rochester, NY 14611', email: 'chidi.okafor@example.com', monthly: { tithe: 520 } },
    { id: 'd-patel', name: 'Ravi & Priya Patel', address: '115 Elm Ridge Dr, Rochester, NY 14626', email: 'patels@example.com', monthly: { tithe: 300, kb: 100 } },
    { id: 'd-romero', name: 'Elena Romero', address: '9 Bay View Ter, Rochester, NY 14609', email: 'eromero@example.com', monthly: { tithe: 120, kb: 40 } },
    { id: 'd-kim', name: 'James & Sarah Kim', address: '233 Clover St, Rochester, NY 14610', email: 'kims@example.com', monthly: { kb: 500 } },
  ],
  checks: [
  { no: 4418, date: 'Oct 9', payee: 'Rochester Gas & Electric', amt: 1842.10, memo: 'Acct 22-4410', status: 'Cleared' },
  { no: 4417, date: 'Oct 8', payee: 'Hope Haven Shelter',       amt: 500.00,  memo: 'Benevolence', status: 'Cleared' },
  { no: 4416, date: 'Oct 6', payee: 'Camp Pinewood',            amt: 1200.00, memo: 'Retreat deposit', status: 'Outstanding' },
],

  // History before October, as you'd bring it over from the old books
  history: {
    opening: { date: '2026-01-01',
      assets: [['1000', 'gen', 41000], ['1000', 'mis', 12000], ['1000', 'prj', 6000], ['1000', 'bld', 1500], ['1010', 'bld', 120000], ['1050', 'gen', 2000]],
      liabilities: [['2000', 'gen', 3800], ['2010', 'gen', 1650], ['2020', 'gen', 380]] },
    monthlyGiving: {   // Jan–Sep totals by giving fund
      tithe: [28600, 29400, 31200, 33800, 29100, 27300, 26800, 27900, 35900],
      kb: [7800, 8200, 9400, 10100, 8600, 8000, 9200, 9700, 11000] },
    processorFeeRate: 0.021,
    payrollMonths: 9,
    spending: {        // Jan–Sep spending by fund: [account, budget, amount]
      gen: [['5200', 'Everyday ministry', 14500], ['5210', 'Everyday ministry', 9800], ['5300', 'Everyday ministry', 3200], ['5310', 'Everyday ministry', 4100],
        ['5100', 'Everyday ministry', 6000], ['5410', 'Everyday ministry', 4500], ['5110', 'Outreach Ministry', 1850], ['5110', 'Fall Festival', 947.27], ['5100', 'Youth Ministry', 6200],
        ['5120', 'MomCo', 1180], ['5100', 'MomCo', 540], ['5130', 'MomCo', 900]],
      mis: [['5400', 'Kenya missions', 27000], ['5400', 'Local outreach', 9200], ['5110', 'Missions Sunday', 642.18]],
      prj: [['5220', 'Youth room remodel', 3120]] },
    // Jan–Sep checks and ACH to vendors, by name: [who, fund, account, budget, amount] (they count toward 1099s)
    vendorPayments: [['Bright Clean Services', 'gen', '5210', 'Everyday ministry', 4320], ['Jordan Ellis', 'gen', '5130', 'Everyday ministry', 750],
      ['Genesee Design Group', 'bld', '5420', 'New Building', 6000], ['Rev. Maria Santos', 'gen', '5130', 'Outreach Ministry', 300],
      ['Hope Haven Shelter', 'gen', '5410', 'Everyday ministry', 1500], ['Sound Pro Rentals', 'gen', '5100', 'Everyday ministry', 1850]],
    // Money the board set aside from the operating fund: [date, from, to, amount, note]
    designations: [['2026-01-15', 'gen', 'res', 30000, 'Board set aside the operating reserve (minutes, Jan 12)']],
    lockedThrough: '2026-09-30',
    // The last bank reconciliation that was finished and signed off
    reconciled: { through: '2026-09-30', preparedBy: 'Dana Brooks', preparedOn: 'Oct 6', reviewedBy: 'Nick Hodge', reviewedOn: 'Oct 7' },
    // What the bank's own statement has that the books don't yet (and checks it hasn't seen clear)
    bankStatementAdjust: { '1000': [1200, 425, -4.75, 905.58, 2307.95] },
  },
});
