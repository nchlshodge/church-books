// Sample activity for Grace Community Church (made up).
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CHURCH_SAMPLE = data;
})(typeof self !== 'undefined' ? self : this, {
  today: '2026-10-18',
  statementThrough: 'Oct 16',
  payrollSchedule: { frequency: 'Monthly', next: 'Oct 30', approveBy: 'Oct 28' },

  payouts: [
    { date: 'Oct 16', gifts: 22, split: { offering: 3400, building: 450, missions: 300 }, fee: 121.20, status: 'New' },
    { date: 'Oct 9', gifts: 25, split: { offering: 3900, building: 300, missions: 250 }, fee: 130.50, status: 'Recorded' },
    { date: 'Oct 2', gifts: 19, split: { offering: 3100, building: 200, missions: 400 }, fee: 109.70, status: 'Recorded' },
  ],
  cash: [
    { id: 'g1018', date: 'Oct 18', by: 'Jordan Park', by2: 'Ava Kim', cash: 520.00, checks: 880.00, split: { offering: 1150.00, building: 150.00, missions: 100.00 }, status: 'Counted' },
    { id: 'g1011', date: 'Oct 11', by: 'Ushers', by2: 'Ushers', cash: 640.00, checks: 1210.00, status: 'Deposited', deposited: 'Oct 12', slip: '118', takenBy: 'Jordan Park' },
  ],

  expenses: [
    { date: 'Oct 14', days: 4, payee: 'Walmart', amt: 86.20, who: 'youth', proj: 'Youth', acct: 'Supplies', paid: 'Church Mastercard ••9001', receipt: false, status: 'Needs receipt' },
    { date: 'Oct 12', days: 6, payee: 'City Water', amt: 312.40, who: 'office', proj: 'Ministry operations', acct: 'Utilities', paid: 'Check #2210', receipt: true, status: 'Done' },
    { date: 'Oct 10', days: 8, payee: 'Staples', amt: 64.99, who: 'office', proj: 'Ministry operations', acct: 'Office', paid: 'Church Mastercard ••9001', receipt: true, status: 'Needs review' },
    { date: 'Oct 13', days: 5, payee: 'Hobby Lobby', amt: 41.30, who: 'youth', proj: 'Youth', acct: 'Supplies', paid: 'Reimbursement', receipt: true, status: 'Done', reimb: 'To pay' },
    { date: 'Oct 5', days: 13, payee: 'Hope Mission Partners', amt: 1500.00, who: 'lee', proj: 'Missions partners', acct: 'Missions support', paid: 'ACH', receipt: true, status: 'Done' },
  ],
  registrations: {
    events: [{ id: 'ge1', name: 'Youth Lock-in', proj: 'Youth', price: 10, signups: 25 }],
    payouts: [{ id: 'grp1', date: 'Oct 16', lines: [{ event: 'ge1', count: 25, amount: 250 }], fee: 9.55, status: 'New' }],
    refunds: [],
  },
  commitments: {
    building: [
      { household: 'The Abbott household', amounts: [5000], given: 3500 }, { household: 'The Baker household', amounts: [3000], given: 3000 },
      { household: 'The Cruz household', amounts: [2400], given: 1200 }, { household: 'The Dunn household', amounts: [1800], given: 1500 },
      { household: 'The Ellis household', amounts: [1200], given: 400 }, { household: 'The Ford household', amounts: [1000], given: 900 },
    ],
  },
  requests: [
    { id: 'gr1', who: 'youth', what: 'Pizza for the youth lock-in', amt: 120.00, proj: 'Youth', acct: 'Supplies', needBy: 'Oct 24', asked: 'Oct 17', why: '25 students', status: 'Waiting', approvals: [] },
  ],
  vendors: [
    { id: 'roof', name: 'Springfield Roofing', entity: 'LLC', email: 'office@springfieldroofing.example', payBy: 'Check', w9: 'On file', w9Date: 'Apr 4, 2026', tin: '5521' },
    { id: 'water', name: 'City Water', entity: 'Utility / government', email: '', payBy: 'Check', w9: 'Not needed' },
    { id: 'hope', name: 'Hope Mission Partners', entity: 'Nonprofit', email: 'give@hopemission.example', payBy: 'ACH', w9: 'Not needed' },
    { id: 'lawn', name: 'Prairie Lawn Care', entity: 'Individual / sole proprietor', email: 'sam@prairielawn.example', payBy: 'Check', w9: 'Missing' },
  ],
  bills: [
    { id: 'g1', enteredBy: 'office', vendor: 'lawn', number: 'Oct mowing', received: 'Oct 14', due: 'Oct 28', amt: 260.00, proj: 'Building repairs', acct: 'Grounds', status: 'To approve', note: 'Four mows in October' },
  ],
  schedules: [
    { id: 'gs1', vendor: 'hope', what: 'Monthly missions support', amt: 1500.00, every: 'monthly', start: '2026-01-05', day: 5, lastRun: '2026-10-05', method: 'ACH', auto: true,
      proj: 'Missions partners', acct: 'Missions support', status: 'Active', approvals: [{ by: 'lee', on: 'Jan 2' }, { by: 'office', on: 'Jan 2' }] },
  ],
  subscriptions: [
    { name: 'Tithe.ly', cost: 49.00, cycle: 'mo', next: 'Nov 1', card: '9001', fund: 'general', billing: true, last: 'Oct 1' },
    { name: 'Church website', cost: 240.00, cycle: 'yr', next: 'Oct 30', card: '9001', fund: 'general', billing: false, flag: 'Renews soon' },
  ],
  inbox: [
    { date: 'Oct 15', from: 'Ava Kim', addr: 'forwarded', subj: 'Fwd: Your Walmart receipt', file: 'email', amt: 86.20, state: 'suggest', payee: 'Walmart' },
    { date: 'Oct 1', from: 'Tithe.ly', addr: 'billing@tithe.ly', subj: 'Your Tithe.ly invoice', file: 'Tithely-Oct.pdf', amt: 49.00, state: 'matched', note: 'Tithe.ly subscription · filed under Ministry operations' },
  ],
  bankLines: [
    { date: 'Oct 16', desc: 'TITHELY PAYOUT', amt: 4028.80, match: null, ok: false, kind: 'payout' },
    { date: 'Oct 16', desc: 'TITHELY EVENTS', amt: 240.45, match: null, ok: false, kind: 'regpayout', ref: 'grp1' },
    { date: 'Oct 12', desc: 'CHECK 2210', amt: -312.40, match: 'Check #2210 · City Water', ok: true },
  ],
  staff: [
    { role: 'Senior Pastor', type: 'Clergy', gross: 4200.00, fund: 'general' },
    { role: 'Office Administrator', type: 'Employee', gross: 1800.00, fund: 'general' },
    { role: 'Worship Leader (part-time)', type: 'Employee', gross: 900.00, fund: 'general' },
  ],
  checks: [
    { no: null, date: '—', payee: 'Springfield Roofing', amt: 850.00, memo: 'Gutter repair', category: 'Supplies', status: 'Ready to print' },
    { no: 2210, date: 'Oct 11', payee: 'City Water', amt: 312.40, memo: 'Acct 77-120', status: 'Cleared' },
  ],

  history: {
    opening: { date: '2026-01-01',
      assets: [['1000', 'general', 25000], ['1000', 'building', 8000], ['1000', 'missions', 3000], ['1010', 'building', 40000]],
      liabilities: [['2000', 'general', 900]] },
    monthlyGiving: {
      offering: [15800, 16200, 17400, 18900, 16000, 15100, 14800, 15300, 17900],
      building: [1500, 1700, 2100, 1900, 1600, 1400, 1300, 1800, 2000],
      missions: [1200, 1300, 1600, 1500, 1300, 1100, 1200, 1400, 1700] },
    processorFeeRate: 0.029,
    payrollMonths: 9,
    spending: {
      general: [['5200', 'Ministry operations', 9000], ['5100', 'Ministry operations', 4000], ['5300', 'Ministry operations', 2100], ['5100', 'Youth', 2500], ['5110', 'Summer camp', 1900]],
      building: [['5210', 'Building repairs', 6200]],
      missions: [['5400', 'Missions partners', 12000]] },
    vendorPayments: [['Prairie Lawn Care', 'building', '5210', 'Building repairs', 1820], ['Springfield Roofing', 'building', '5210', 'Building repairs', 3400]],
    lockedThrough: '2026-09-30',
    // The last bank reconciliation that was finished and signed off
    reconciled: { through: '2026-09-30', preparedBy: 'Jordan Park', preparedOn: 'Oct 6', reviewedBy: 'Pastor Lee', reviewedOn: 'Oct 7' },
    bankStatementAdjust: { '1000': [4028.80, 240.45] },
  },
});
