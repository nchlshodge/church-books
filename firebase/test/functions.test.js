const test = require('node:test'), assert = require('node:assert');
const { admin, client, makeOrg, gift, code } = require('./helpers.js');
const Chain = require('../functions/engine/chain.js');
const db = admin.firestore();
const org = 'fn-' + Date.now().toString(36);

test('posting: the engine checks every entry, sources post once, the chain holds', async () => {
  const c = await makeOrg(org, { 'owner@t.org': ['owner', 'lee'], 'rev@t.org': ['reviewer', 'office'], 'board@t.org': ['viewer'], 'vol@t.org': ['sender', 'youth'] });
  const r1 = await c.reviewer.call('booksPostEntry', { orgId: org, draft: gift('2026-10-01', 5000, 'a'), expectId: 'JE-00001' });
  assert.deepStrictEqual([r1.id, r1.inSync], ['JE-00001', true]);
  assert.strictEqual(await code(c.reviewer.call('booksPostEntry', { orgId: org, draft: gift('2026-10-02', 100, 'a') })), 'already-exists');
  const unbalanced = gift('2026-10-02', 100); unbalanced.lines[1].credit = 90;
  assert.strictEqual(await code(c.reviewer.call('booksPostEntry', { orgId: org, draft: unbalanced })), 'failed-precondition');
  const noAcct = gift('2026-10-02', 100); noAcct.lines[0].account = '1999';
  assert.strictEqual(await code(c.reviewer.call('booksPostEntry', { orgId: org, draft: noAcct })), 'failed-precondition');
  assert.strictEqual(await code(c.viewer.call('booksPostEntry', { orgId: org, draft: gift('2026-10-02', 100) })), 'permission-denied');
  assert.strictEqual(await code(c.sender.call('booksPostEntry', { orgId: org, draft: gift('2026-10-02', 100) })), 'permission-denied');
  const stranger = await client('stranger@else.org');
  assert.strictEqual(await code(stranger.call('booksPostEntry', { orgId: org, draft: gift('2026-10-02', 100) })), 'permission-denied');
  const r2 = await c.owner.call('booksPostEntry', { orgId: org, draft: gift('2026-10-03', 7000, 'b'), expectId: 'JE-00001' });
  assert.deepStrictEqual([r2.id, r2.inSync], ['JE-00002', false]);   // someone else posted first → the caller reloads
  const entries = (await db.collection(`orgs/${org}/entries`).orderBy('seq').get()).docs.map(d => d.data());
  assert.strictEqual(Chain.verify(entries).ok, true);
  entries[0].memo = 'Edited by hand'; assert.strictEqual(Chain.verify(entries).brokenAt, 'JE-00001');
});

test('reversing, locking and reopening', async () => {
  const c = await makeOrg(org + 'b', { 'owner2@t.org': ['owner', 'lee'], 'rev2@t.org': ['reviewer', 'office'] }), o = org + 'b';
  await c.reviewer.call('booksPostEntry', { orgId: o, draft: gift('2026-09-20', 5000, 'x') });
  assert.strictEqual(await code(c.reviewer.call('booksReverseEntry', { orgId: o, entryId: 'JE-00001' })), 'invalid-argument');   // no reason
  const rv = await c.reviewer.call('booksReverseEntry', { orgId: o, entryId: 'JE-00001', reason: 'Wrong fund', date: '2026-10-01' });
  assert.strictEqual(rv.id, 'JE-00002');
  assert.strictEqual(await code(c.reviewer.call('booksReverseEntry', { orgId: o, entryId: 'JE-00001', reason: 'again' })), 'already-exists');
  assert.strictEqual(await code(c.reviewer.call('booksReverseEntry', { orgId: o, entryId: 'JE-00002', reason: 'undo the undo' })), 'failed-precondition');
  assert.strictEqual(await code(c.reviewer.call('booksLockMonth', { orgId: o, through: '2026-09-30' })), 'permission-denied');
  await c.owner.call('booksLockMonth', { orgId: o, through: '2026-09-30' });
  const snap = (await db.doc(`orgs/${o}/snapshots/2026-09-30`).get()).data();
  assert.deepStrictEqual([snap.entries, snap.balances['1000|general']], [1, 5000]);
  assert.strictEqual(await code(c.reviewer.call('booksPostEntry', { orgId: o, draft: gift('2026-09-25', 100) })), 'failed-precondition');
  assert.strictEqual(await code(c.owner.call('booksLockMonth', { orgId: o, through: '2026-08-31' })), 'failed-precondition');
  assert.strictEqual(await code(c.owner.call('booksUnlockMonth', { orgId: o, through: '2026-08-31' })), 'invalid-argument');
  await c.owner.call('booksUnlockMonth', { orgId: o, through: '2026-08-31', reason: 'Late bank fee' });
  assert.strictEqual(await code(c.reviewer.call('booksPostEntry', { orgId: o, draft: gift('2026-09-25', 100) })), 'ok');
});

test('setup changes are checked and every version is kept', async () => {
  const c = await makeOrg(org + 'c', { 'owner3@t.org': ['owner', 'lee'], 'rev3@t.org': ['reviewer', 'office'] }), o = org + 'c';
  const setup = (await db.doc(`orgs/${o}/settings/setup`).get()).data();
  await c.reviewer.call('booksPostEntry', { orgId: o, draft: { date: '2026-10-01', memo: 'Missions gift', lines: [{ account: '1000', fund: 'missions', debit: 100 }, { account: '4020', fund: 'missions', credit: 100 }] } });
  assert.strictEqual(await code(c.reviewer.call('booksUpdateSetup', { orgId: o, setup })), 'permission-denied');
  const renamed = { ...setup, name: 'Grace Fellowship' };
  assert.strictEqual((await c.owner.call('booksUpdateSetup', { orgId: o, setup: renamed, what: 'New name' })).version, 2);
  const broken = JSON.parse(JSON.stringify(setup)); broken.funds = broken.funds.filter(f => f.id !== 'missions');
  assert.strictEqual(await code(c.owner.call('booksUpdateSetup', { orgId: o, setup: broken })), 'failed-precondition');
  const hist = await db.collection(`orgs/${o}/setupHistory`).get();
  assert.strictEqual(hist.size, 1);
  assert.strictEqual((await db.doc(`orgs/${o}/settings/setup`).get()).data().name, 'Grace Fellowship');
});

test('invites turn into memberships at sign-in; imports only go into empty books', async () => {
  const c = await makeOrg(org + 'd', { 'owner4@t.org': ['owner', 'lee'] }), o = org + 'd';
  assert.strictEqual(await code(c.owner.call('booksInviteMember', { orgId: o, email: 'new@t.org', role: 'wizard' })), 'invalid-argument');
  await c.owner.call('booksInviteMember', { orgId: o, email: 'New@T.org', role: 'reviewer', personId: 'office' });
  const nu = await client('new@t.org'), j = await nu.call('booksJoinOrgs', {});
  assert.deepStrictEqual([j.joined, j.orgs], [[o], { [o]: 'reviewer' }]);
  assert.strictEqual((await db.doc(`orgs/${o}/members/${nu.uid}`).get()).data().role, 'reviewer');
  const setup = (await db.doc(`orgs/${o}/settings/setup`).get()).data();
  const data = { setup, lockedThrough: '2026-09-30', entries: [gift('2026-09-01', 1000, 'i1'), gift('2026-10-01', 2000, 'i2')], workspace: { vendors: '[]' }, expenses: [{ id: 'x1', payee: 'Costco', status: 'Done' }] };
  assert.strictEqual(await code(nu.call('booksImport', { orgId: o, data })), 'permission-denied');
  const bad = JSON.parse(JSON.stringify(data)); bad.entries[1].lines[0].debit = 1;
  assert.strictEqual(await code(c.owner.call('booksImport', { orgId: o, data: bad })), 'failed-precondition');
  assert.strictEqual((await c.owner.call('booksImport', { orgId: o, data })).entries, 2);
  const st = (await db.doc(`orgs/${o}/ledger/state`).get()).data();
  assert.deepStrictEqual([st.seq, st.lockedThrough], [2, '2026-09-30']);
  assert.strictEqual(await code(c.owner.call('booksImport', { orgId: o, data })), 'failed-precondition');
  assert.strictEqual(await code(nu.call('booksPostEntry', { orgId: o, draft: gift('2026-10-05', 10, 'i1') })), 'already-exists');
});

test('only the books administrators can start a church', async () => {
  const setup = JSON.parse(JSON.stringify(require('../../churches/grace/setup.js'))), o = org + 'e';
  const plat = await client('platform@t.org'), other = await client('nobody@t.org');
  assert.strictEqual((await plat.call('booksJoinOrgs', {})).canCreate, true);
  assert.strictEqual((await other.call('booksJoinOrgs', {})).canCreate, false);
  assert.strictEqual(await code(other.call('booksCreateOrg', { orgId: o, setup, personId: 'lee' })), 'permission-denied');
  assert.strictEqual(await code(plat.call('booksCreateOrg', { orgId: o, setup, personId: 'nobody' })), 'invalid-argument');
  assert.deepStrictEqual(await plat.call('booksCreateOrg', { orgId: o, setup, personId: 'lee' }), { orgId: o });
  assert.strictEqual(await code(plat.call('booksCreateOrg', { orgId: o, setup, personId: 'lee' })), 'already-exists');
  assert.strictEqual((await db.doc(`orgs/${o}/members/${plat.uid}`).get()).data().role, 'owner');
  assert.strictEqual(await code(plat.call('booksPostEntry', { orgId: o, draft: gift('2026-10-01', 100, 'z') })), 'ok');
});

test('the server knows the newer accounts: non-cash gifts, donated items, rental deposits', async () => {
  const c = await makeOrg(org + 'f', { 'owner6@t.org': ['owner', 'lee'], 'rev6@t.org': ['reviewer', 'office'] }), o = org + 'f';
  const R = require('../functions/engine/rules.js');
  const gift = R.nonCashGift({ date: '2026-10-03', memo: 'Stock gift', byFund: [{ fund: 'general', amount: 900000 }], toAccount: '1300', party: 'Parker' });
  assert.strictEqual(await code(c.reviewer.call('booksPostEntry', { orgId: o, draft: { ...gift, source: { type: 'noncash', id: 'nc1' } } })), 'ok');
  const sale = R.saleOfDonatedItem({ date: '2026-10-07', memo: 'Sold', byFund: [{ fund: 'general', amount: 900000 }], proceeds: 905000, bank: '1000' });
  assert.strictEqual(await code(c.reviewer.call('booksPostEntry', { orgId: o, draft: sale })), 'ok');
  const dep = R.rentalDeposit({ date: '2026-10-02', memo: 'Deposit', bank: '1000', fund: 'general', amount: 20000, action: 'receive' });
  assert.strictEqual(await code(c.reviewer.call('booksPostEntry', { orgId: o, draft: dep })), 'ok');
  const setup = (await db.doc(`orgs/${o}/settings/setup`).get()).data();
  const withReserve = { ...setup, funds: [...setup.funds, { id: 'res', name: 'Reserve', restriction: 'without', designated: true }] };
  assert.strictEqual((await c.owner.call('booksUpdateSetup', { orgId: o, setup: withReserve, what: 'Board reserve' })).version, 2);
  const bad = { ...setup, funds: [...setup.funds, { id: 'res2', name: 'Bad', restriction: 'with', designated: true }] };
  assert.strictEqual(await code(c.owner.call('booksUpdateSetup', { orgId: o, setup: bad })), 'failed-precondition');
});
