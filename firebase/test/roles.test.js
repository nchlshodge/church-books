// Church roles, privacy and server-side controls. Every account here is made up and exists only on the emulator.
const test = require('node:test'), assert = require('node:assert');
const { admin, client, makeOrg, code } = require('./helpers.js');
const R = require('../functions/engine/rules.js');
const db = admin.firestore();
const org = 'rl-' + Date.now().toString(36);
let c;
// Grace's setup: people lee, office, youth; approvers come from its policies
test.before(async () => {
  c = await makeOrg(org, { 'own@r.org': ['owner', 'lee'], 'rev@r.org': ['reviewer', 'office'], 'rev2@r.org': ['bookkeeper', 'youth'],
    'lead@r.org': ['leader', 'youth'], 'cnt1@r.org': ['counter', 'office'], 'cnt2@r.org': ['counter', 'youth'], 'aud@r.org': ['viewer'] });
  const pol = (await db.doc(`orgs/${org}/settings/setup`).get()).data().policies || {};
  await db.doc(`orgs/${org}/settings/setup`).set({ policies: { ...pol, approvers: ['lee', 'office', 'youth'], approvalTiers: [{ upTo: 500, approvals: 1 }, { upTo: null, approvals: 2 }], alertOver: 1000 } }, { merge: true });
  await db.doc(`orgs/${org}/members/${c['lead@r.org'].uid}`).set({ budgets: ['Youth'] }, { merge: true });
  await db.doc(`orgs/${org}/members/${c['aud@r.org'].uid}`).set({ untilMs: Date.now() - 1000 }, { merge: true });   // an auditor whose access already ended
});
const reimb = (id, amount, budget = 'Youth') => ({ ...R.reimbursementOwed({ date: '2026-10-10', memo: 'Pizza for youth night', source: { type: 'expense', id }, amount, expense: '5000', fund: 'general', project: budget, person: 'Sam' }) });

test('spending is booked only after the server has recorded enough approvals', async () => {
  const draft = reimb('x1', 30000);
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft })), 'failed-precondition');                  // no approvals yet
  assert.strictEqual(await code(c['rev2@r.org'].call('booksApprove', { orgId: org, kind: 'expense', id: 'x1', amount: 300, submitter: 'youth' })), 'permission-denied');   // own spending
  const a = await c['rev@r.org'].call('booksApprove', { orgId: org, kind: 'expense', id: 'x1', amount: 300, submitter: 'youth' });
  assert.deepStrictEqual([a.done, a.have, a.need], [true, 1, 1]);
  assert.strictEqual(await code(c['rev@r.org'].call('booksApprove', { orgId: org, kind: 'expense', id: 'x1', amount: 300, submitter: 'youth' })), 'already-exists');
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: reimb('x1', 31000) })), 'failed-precondition');   // a different amount than approved
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft, approval: { kind: 'expense', id: 'x1' } })), 'ok');
  // over $500 needs two different approvers
  await c['rev@r.org'].call('booksApprove', { orgId: org, kind: 'expense', id: 'x2', amount: 800, submitter: 'youth' });
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: reimb('x2', 80000), approval: { kind: 'expense', id: 'x2' } })), 'failed-precondition');
  const b = await c['own@r.org'].call('booksApprove', { orgId: org, kind: 'expense', id: 'x2', amount: 800, submitter: 'youth' });
  assert.strictEqual(b.done, true);
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: reimb('x2', 80000), approval: { kind: 'expense', id: 'x2' } })), 'ok');
  // a card charge is booked when it arrives, reviewed after
  const card = R.cardCharge({ date: '2026-10-11', memo: 'Costco', source: { type: 'expense', id: 'x3' }, amount: 5000, expense: '5000', fund: 'general', project: 'Youth', card: '2000' });
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: card })), 'ok');
  const alerts = await db.collection(`orgs/${org}/alerts`).get();   // nothing over $1,000 left the bank yet
  assert.strictEqual(alerts.docs.filter(d => d.data().kind === 'payment').length, 0);
});

test('check numbers come from the server, once each', async () => {
  const { numbers } = await c['rev@r.org'].call('booksReserveChecks', { orgId: org, count: 2 });
  assert.strictEqual(numbers.length, 2); assert.strictEqual(numbers[1], numbers[0] + 1);
  const ck = no => R.bankPayment({ date: '2026-10-12', memo: `Check #${no}`, source: { type: 'check', id: String(no) }, amount: 150000, expense: '5000', fund: 'general', bank: '1000', party: 'Roofer' });
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: ck(99999) })), 'failed-precondition');   // never issued
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: ck(numbers[0]) })), 'ok');
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: ck(numbers[0]) })), 'already-exists');
  await c['rev@r.org'].call('booksVoidCheck', { orgId: org, no: numbers[1], reason: 'Printed crooked' });
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: ck(numbers[1]) })), 'failed-precondition');
  const next = await c['rev@r.org'].call('booksReserveChecks', { orgId: org, count: 1 });
  assert.strictEqual(next.numbers[0], numbers[1] + 1);   // a voided number is never handed out again
  const alerts = (await db.collection(`orgs/${org}/alerts`).get()).docs.map(d => d.data());
  assert.ok(alerts.some(a => a.kind === 'payment' && a.amount === 150000));   // $1,500 left the bank: the owner hears about it
});

test('Sunday counts need a second person, and matching totals', async () => {
  const cnt1 = c['cnt1@r.org'], cnt2 = c['cnt2@r.org'];
  assert.strictEqual(await code(cnt1.call('booksPostEntry', { orgId: org, draft: reimb('x9', 100) })), 'permission-denied');   // counters can't post anything else
  const { id } = await cnt1.call('booksStartCount', { orgId: org, date: '2026-10-18', cash: 1140, checks: 1985, split: { offering: 2825, building: 300 } });
  assert.strictEqual(await code(cnt1.call('booksConfirmCount', { orgId: org, countId: id, cash: 1140, checks: 1985 })), 'permission-denied');
  assert.strictEqual(await code(cnt2.call('booksConfirmCount', { orgId: org, countId: id, cash: 1140, checks: 1980 })), 'failed-precondition');
  const r = await cnt2.call('booksConfirmCount', { orgId: org, countId: id, cash: 1140, checks: 1985 });
  assert.ok(r.entry && r.entry.id);
  assert.strictEqual(r.entry.lines.filter(l => l.account === '1100').reduce((s, l) => s + l.debit, 0), 312500);
  assert.strictEqual(await code(cnt2.call('booksConfirmCount', { orgId: org, countId: id, cash: 1140, checks: 1985 })), 'failed-precondition');
});

test('a ministry leader sees only their own budget, and nothing else', async () => {
  const lead = c['lead@r.org'];
  const r = await lead.call('booksLeaderReport', { orgId: org, budget: 'Youth' });
  assert.deepStrictEqual([r.budget, r.report.spent], ['Youth', 30000 + 80000 + 5000]);   // the test checks weren't for Youth
  assert.strictEqual(await code(lead.call('booksLeaderReport', { orgId: org, budget: 'Building' })), 'permission-denied');
  assert.strictEqual(await code(lead.call('booksPostEntry', { orgId: org, draft: reimb('x8', 100) })), 'permission-denied');
});

test('expired access, owner-only reopening, and owner-only private access', async () => {
  assert.strictEqual(await code(c['aud@r.org'].call('booksLeaderReport', { orgId: org, budget: 'Youth' })), 'permission-denied');
  await c['own@r.org'].call('booksLockMonth', { orgId: org, through: '2026-09-30' });
  assert.strictEqual(await code(c['rev2@r.org'].call('booksUnlockMonth', { orgId: org, through: '2026-08-31', reason: 'late fee' })), 'permission-denied');
  assert.strictEqual(await code(c['own@r.org'].call('booksUnlockMonth', { orgId: org, through: '2026-08-31', reason: 'Late bank fee' })), 'ok');
  assert.ok((await db.collection(`orgs/${org}/alerts`).get()).docs.some(d => d.data().kind === 'unlock'));
  // an admin can invite, but only the owner can grant private access
  await db.doc(`orgs/${org}/members/${c['rev2@r.org'].uid}`).set({ role: 'admin' }, { merge: true });
  assert.strictEqual(await code(c['rev2@r.org'].call('booksInviteMember', { orgId: org, email: 'x@r.org', role: 'viewer', access: ['payroll'] })), 'permission-denied');
  assert.strictEqual(await code(c['rev2@r.org'].call('booksInviteMember', { orgId: org, email: 'x@r.org', role: 'leader' })), 'invalid-argument');   // leaders need budgets
  assert.strictEqual(await code(c['own@r.org'].call('booksInviteMember', { orgId: org, email: 'aud2@r.org', role: 'viewer', until: '2026-12-31', access: ['donors'] })), 'ok');
  const nu = await client('aud2@r.org'); await nu.call('booksJoinOrgs', {});
  const m = (await db.doc(`orgs/${org}/members/${nu.uid}`).get()).data();
  assert.deepStrictEqual([m.role, m.access, m.untilMs > Date.now()], ['viewer', ['donors'], true]);
});
