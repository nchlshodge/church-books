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
  // a check written by hand is approved like spending: $1,500 needs two approvers who didn't write it
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: ck(numbers[0]) })), 'failed-precondition');
  const apCk = who => c[who].call('booksApprove', { orgId: org, kind: 'check', id: 'ck1', amount: 1500, submitter: 'office' });
  assert.strictEqual(await code(apCk('rev@r.org')), 'permission-denied');                  // office wrote it
  await apCk('own@r.org'); const two = await apCk('rev2@r.org'); assert.strictEqual(two.done, true);
  const withAp = { orgId: org, draft: ck(numbers[0]), approval: { kind: 'check', id: 'ck1' } };
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', withAp)), 'ok');
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', withAp)), 'already-exists');
  await c['rev@r.org'].call('booksVoidCheck', { orgId: org, no: numbers[1], reason: 'Printed crooked' });
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: ck(numbers[1]), approval: { kind: 'check', id: 'ck1' } })), 'failed-precondition');
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

test('data entry records money but never approves, reverses, locks or sees private information', async () => {
  const e = await makeOrg(org + 'e', { 'own-e@r.org': ['owner', 'lee'], 'entry-e@r.org': ['entry', 'office'] }), o = org + 'e';
  const gift = { date: '2026-10-04', memo: 'Sunday offering', source: { type: 'test_gift', id: 'e1' }, lines: [{ account: '1000', fund: 'general', debit: 50000 }, { account: '4000', fund: 'general', credit: 50000 }] };
  assert.strictEqual((await e['entry-e@r.org'].call('booksPostEntry', { orgId: o, draft: gift })).id, 'JE-00001');                                   // records a deposit
  assert.strictEqual(await code(e['entry-e@r.org'].call('booksPostEntry', { orgId: o, draft: reimb('e2', 2000) })), 'failed-precondition');          // spending still needs approvals
  assert.strictEqual(await code(e['entry-e@r.org'].call('booksApprove', { orgId: o, kind: 'expense', id: 'e2', amount: 20, submitter: 'youth' })), 'permission-denied');
  assert.strictEqual(await code(e['entry-e@r.org'].call('booksReverseEntry', { orgId: o, entryId: 'JE-00001', reason: 'oops' })), 'permission-denied');
  assert.strictEqual(await code(e['entry-e@r.org'].call('booksLockMonth', { orgId: o, through: '2026-09-30' })), 'permission-denied');
  assert.strictEqual(await code(e['entry-e@r.org'].call('booksUpdateSetup', { orgId: o, setup: {} })), 'permission-denied');
  assert.deepStrictEqual((await e['entry-e@r.org'].call('booksReserveChecks', { orgId: o, count: 1 })).numbers.length, 1);                           // writes checks
});

test('the department head says yes first, then finance; department heads approve nothing else', async () => {
  // Grace's Youth budget is led by "youth" (here a department head); office spent it
  const d = reimb('dx1', 30000);
  const ap = (who, extra = {}) => c[who].call('booksApprove', { orgId: org, kind: 'expense', id: 'dx1', amount: 300, submitter: 'office', budget: 'Youth', ...extra });
  const fin = await ap('own@r.org'); assert.deepStrictEqual([fin.done, fin.deptOk], [false, false]);   // finance alone isn't enough
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: d, approval: { kind: 'expense', id: 'dx1' } })), 'failed-precondition');
  const dept = await ap('lead@r.org'); assert.deepStrictEqual([dept.done, dept.deptOk], [true, true]);
  assert.strictEqual(await code(c['rev@r.org'].call('booksPostEntry', { orgId: org, draft: d, approval: { kind: 'expense', id: 'dx1' } })), 'ok');
  // a department head can't approve another department's spending, or act as finance
  assert.strictEqual(await code(c['lead@r.org'].call('booksApprove', { orgId: org, kind: 'expense', id: 'dx2', amount: 50, submitter: 'office', budget: 'Ministry operations' })), 'permission-denied');
});

test('data entry for certain departments, a campus admin and a payroll administrator stay inside their limits', async () => {
  const o = org + 's', d = await makeOrg(o, { 'own-s@r.org': ['owner', 'lee'], 'adm-s@r.org': ['admin', 'office'], 'yth-s@r.org': ['entry', 'youth'], 'cmp-s@r.org': ['campus', 'youth'], 'pay-s@r.org': ['payroll', 'office'] });
  await db.doc(`orgs/${o}/members/${d['yth-s@r.org'].uid}`).set({ budgets: ['Youth'] }, { merge: true });
  await db.doc(`orgs/${o}/members/${d['cmp-s@r.org'].uid}`).set({ campus: 'east' }, { merge: true });
  await db.doc(`orgs/${o}/settings/setup`).set({ campuses: [{ id: 'east', name: 'East campus', budgets: ['Building repairs'], admin: 'youth' }] }, { merge: true });
  const spend = (id, budget, amt = 4000) => ({ date: '2026-10-05', memo: `Supplies ${id}`, source: { type: 'test_spend', id }, lines: [{ account: '5100', fund: 'general', debit: amt, project: budget }, { account: '1000', fund: 'general', credit: amt }] });
  // department data entry: inside their departments (projects inside them too), never outside
  assert.strictEqual(await code(d['yth-s@r.org'].call('booksPostEntry', { orgId: o, draft: spend('a', 'Summer camp') })), 'ok');
  assert.strictEqual(await code(d['yth-s@r.org'].call('booksPostEntry', { orgId: o, draft: spend('b', 'Ministry operations') })), 'permission-denied');
  await d['own-s@r.org'].call('booksPostEntry', { orgId: o, draft: spend('c', 'Ministry operations', 9900) });
  const mine = await d['yth-s@r.org'].call('booksScopedBooks', { orgId: o });
  assert.deepStrictEqual(mine.entries.map(e => e.memo), ['Supplies a']);   // the rest of the books never leave the server
  // a campus admin approves their campus's spending (as a finance approval), and nobody else's
  const ap = (who, id, budget) => d[who].call('booksApprove', { orgId: o, kind: 'expense', id, amount: 40, submitter: 'office', budget });
  assert.strictEqual((await ap('cmp-s@r.org', 'e1', 'Building repairs')).have, 1);
  assert.strictEqual(await code(ap('cmp-s@r.org', 'e2', 'Ministry operations')), 'permission-denied');
  // the payroll administrator records payroll only, and can't approve their own pay plan
  const payDraft = { date: '2026-10-15', memo: 'Payroll Oct 15', source: { type: 'payroll', id: '2026-10-15' }, lines: [{ account: '5000', fund: 'general', debit: 300000, project: 'Staff' }, { account: '1000', fund: 'general', credit: 300000 }] };
  assert.strictEqual(await code(d['pay-s@r.org'].call('booksPostEntry', { orgId: o, draft: spend('d', 'Staff') })), 'permission-denied');
  assert.strictEqual(await code(d['pay-s@r.org'].call('booksPostEntry', { orgId: o, draft: payDraft })), 'ok');
  assert.deepStrictEqual((await d['pay-s@r.org'].call('booksScopedBooks', { orgId: o })).entries.map(e => e.memo), ['Payroll Oct 15']);
  await db.doc(`orgs/${o}/private/payroll`).set({ json: JSON.stringify({ staff: [], compPlan: { year: 2027, people: [], submitted: { by: 'office', on: 'Nov 6' } } }) });
  assert.strictEqual(await code(d['pay-s@r.org'].call('booksApprovePayPlan', { orgId: o })), 'permission-denied');   // not an admin
  assert.strictEqual(await code(d['adm-s@r.org'].call('booksApprovePayPlan', { orgId: o })), 'permission-denied');   // office prepared it
  assert.strictEqual((await d['own-s@r.org'].call('booksApprovePayPlan', { orgId: o })).year, 2027);
  assert.ok((await db.doc(`orgs/${o}/payPlans/2027`).get()).exists);
});
