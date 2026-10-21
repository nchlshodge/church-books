const test = require('node:test'), assert = require('node:assert');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs'), path = require('path');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } = require('firebase/firestore');
const { ref, uploadBytes, getBytes } = require('firebase/storage');

let env;
test.before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-churchbooks',
    firestore: { host: '127.0.0.1', port: 8299, rules: fs.readFileSync(process.env.BOOKS_FS_RULES || path.join(__dirname, '../firestore.rules'), 'utf8') },
    storage: { host: '127.0.0.1', port: 9399, rules: fs.readFileSync(process.env.BOOKS_ST_RULES || path.join(__dirname, '../storage.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore(), m = (org, uid, role) => setDoc(doc(db, `orgs/${org}/members/${uid}`), { role });
    await setDoc(doc(db, 'orgs/ra'), { name: 'A' }); await setDoc(doc(db, 'orgs/rb'), { name: 'B' });
    await m('ra', 'owner', 'owner'); await m('ra', 'rev', 'reviewer'); await m('ra', 'board', 'viewer'); await m('ra', 'vol', 'sender'); await m('ra', 'vol2', 'sender');
    await m('rb', 'bOwner', 'owner');
    await setDoc(doc(db, 'orgs/ra/entries/JE-00001'), { memo: 'x' }); await setDoc(doc(db, 'orgs/rb/entries/JE-00001'), { memo: 'y' });
    await setDoc(doc(db, 'orgs/ra/settings/setup'), { name: 'A' }); await setDoc(doc(db, 'orgs/ra/workspace/bills'), { json: '[]' });
    await setDoc(doc(db, 'orgs/ra/expenses/e1'), { senderUid: 'vol', status: 'Needs receipt', json: '{}' });
    await setDoc(doc(db, 'orgs/ra/expenses/e2'), { senderUid: 'vol', status: 'Done', json: '{}' });
    await setDoc(doc(db, 'bookUsers/vol'), { orgs: { ra: 'sender' } });
    await m('ra', 'payclerk', 'bookkeeper'); await setDoc(doc(db, 'orgs/ra/members/payclerk'), { role: 'bookkeeper', access: ['payroll'] });
    await m('ra', 'lead', 'leader'); await m('ra', 'cnt', 'counter');
    await setDoc(doc(db, 'orgs/ra/members/gone'), { role: 'viewer', untilMs: Date.now() - 1000 });
    await setDoc(doc(db, 'orgs/ra/private/payroll'), { json: '[]' }); await setDoc(doc(db, 'orgs/ra/private/donors'), { json: '[]' });
    await setDoc(doc(db, 'orgs/ra/counts/k1'), { status: 'waiting' }); await setDoc(doc(db, 'orgs/ra/alerts/a1'), { kind: 'payment' });
  });
});
test.after(() => env.cleanup());
const as = uid => env.authenticatedContext(uid).firestore();

test('one church can never see another church', async () => {
  await assertSucceeds(getDoc(doc(as('owner'), 'orgs/ra/entries/JE-00001')));
  await assertFails(getDoc(doc(as('owner'), 'orgs/rb/entries/JE-00001')));
  await assertFails(getDoc(doc(as('bOwner'), 'orgs/ra/settings/setup')));
  await assertFails(getDocs(collection(as('bOwner'), 'orgs/ra/workspace')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'orgs/ra')));
});

test('nobody writes the ledger from the browser, not even the owner', async () => {
  for (const p of ['entries/JE-00002', 'sources/x', 'audit/a', 'ledger/state', 'snapshots/2026-09-30', 'settings/setup', 'members/owner', 'setupHistory/00002'])
    await assertFails(setDoc(doc(as('owner'), `orgs/ra/${p}`), { x: 1 }));
  await assertFails(updateDoc(doc(as('owner'), 'orgs/ra/entries/JE-00001'), { memo: 'changed' }));
  await assertFails(deleteDoc(doc(as('owner'), 'orgs/ra/entries/JE-00001')));
  await assertFails(setDoc(doc(as('owner'), 'bookInvites/someone@x.org'), { orgs: {} }));
  await assertFails(setDoc(doc(as('vol'), 'bookUsers/vol'), { orgs: { rb: 'owner' } }));
});

test('everyday work: reviewers save it, the board only reads it, senders see neither', async () => {
  await assertSucceeds(setDoc(doc(as('rev'), 'orgs/ra/workspace/bills'), { json: '[{"id":"b1"}]', updatedAt: 'now', updatedBy: 'Pat' }));
  await assertFails(setDoc(doc(as('rev'), 'orgs/ra/workspace/bills'), { json: '[]', sneaky: true }));
  await assertSucceeds(getDoc(doc(as('board'), 'orgs/ra/workspace/bills')));
  await assertFails(setDoc(doc(as('board'), 'orgs/ra/workspace/bills'), { json: '[]' }));
  await assertFails(getDoc(doc(as('vol'), 'orgs/ra/workspace/bills')));
  await assertFails(getDoc(doc(as('vol'), 'orgs/ra/entries/JE-00001')));
});

test('senders send their own receipts and can only see their own', async () => {
  const vol = as('vol');
  await assertSucceeds(getDoc(doc(vol, 'orgs/ra/expenses/e1')));
  await assertFails(getDoc(doc(as('vol2'), 'orgs/ra/expenses/e1')));
  await assertSucceeds(setDoc(doc(vol, 'orgs/ra/expenses/e3'), { senderUid: 'vol', status: 'Needs review', json: '{}' }));
  await assertFails(setDoc(doc(vol, 'orgs/ra/expenses/e4'), { senderUid: 'vol', status: 'Done', json: '{}' }));
  await assertFails(setDoc(doc(vol, 'orgs/ra/expenses/e5'), { senderUid: 'vol2', status: 'Needs review', json: '{}' }));
  await assertSucceeds(updateDoc(doc(vol, 'orgs/ra/expenses/e1'), { status: 'Needs review' }));
  await assertFails(updateDoc(doc(vol, 'orgs/ra/expenses/e1'), { status: 'Done' }));
  await assertFails(updateDoc(doc(vol, 'orgs/ra/expenses/e2'), { json: '{"amt":1}' }));
  await assertSucceeds(updateDoc(doc(as('rev'), 'orgs/ra/expenses/e1'), { status: 'Done' }));
  await assertFails(deleteDoc(doc(as('owner'), 'orgs/ra/expenses/e1')));
});

test('files: members upload, books roles read, nothing is replaced or deleted', async () => {
  const st = uid => env.authenticatedContext(uid).storage();
  const pdf = new Uint8Array([37, 80, 68, 70]), F = 'F' + Date.now();   // a fresh name each run: files can never be replaced
  await assertSucceeds(uploadBytes(ref(st('vol'), `orgs/ra/files/${F}a/receipt.pdf`), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(st('vol'), `orgs/ra/files/${F}b/run.exe`), pdf, { contentType: 'application/x-msdownload' }));
  await assertFails(uploadBytes(ref(st('bOwner'), `orgs/ra/files/${F}c/x.pdf`), pdf, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(ref(st('rev'), `orgs/ra/files/${F}a/receipt.pdf`), pdf, { contentType: 'application/pdf' }));
  await assertSucceeds(getBytes(ref(st('board'), `orgs/ra/files/${F}a/receipt.pdf`)));
  await assertFails(getBytes(ref(st('vol'), `orgs/ra/files/${F}a/receipt.pdf`)));
  await assertFails(getBytes(ref(st('bOwner'), `orgs/ra/files/${F}a/receipt.pdf`)));
});

test('private information: only the owner and people given that kind of access', async () => {
  await assertSucceeds(getDoc(doc(as('owner'), 'orgs/ra/private/payroll')));
  await assertSucceeds(getDoc(doc(as('payclerk'), 'orgs/ra/private/payroll')));
  await assertFails(getDoc(doc(as('payclerk'), 'orgs/ra/private/donors')));
  await assertFails(getDoc(doc(as('rev'), 'orgs/ra/private/payroll')));
  await assertFails(getDoc(doc(as('board'), 'orgs/ra/private/donors')));
  await assertSucceeds(setDoc(doc(as('payclerk'), 'orgs/ra/private/payroll'), { json: '[{"gross":1}]', updatedAt: 'x', updatedBy: 'y' }));
  await assertFails(setDoc(doc(as('rev'), 'orgs/ra/private/payroll'), { json: '[]' }));
  await assertFails(setDoc(doc(as('rev'), 'orgs/ra/workspace/staff'), { json: '[]' }));   // salaries can't be saved where everyone can read them
  await assertFails(setDoc(doc(as('rev'), 'orgs/ra/workspace/donors'), { json: '[]' }));
});

test('leaders, counters and expired access', async () => {
  await assertFails(getDoc(doc(as('lead'), 'orgs/ra/entries/JE-00001')));      // leaders get reports from the server, not the books
  await assertFails(getDoc(doc(as('lead'), 'orgs/ra/workspace/bills')));
  await assertSucceeds(getDoc(doc(as('cnt'), 'orgs/ra/counts/k1')));
  await assertFails(getDoc(doc(as('cnt'), 'orgs/ra/entries/JE-00001')));
  await assertFails(setDoc(doc(as('cnt'), 'orgs/ra/counts/k2'), { status: 'counted' }));   // only the server books a count
  await assertFails(getDoc(doc(as('gone'), 'orgs/ra/entries/JE-00001')));       // access ended
  await assertFails(getDoc(doc(as('rev'), 'orgs/ra/alerts/a1')));
  await assertSucceeds(getDoc(doc(as('owner'), 'orgs/ra/alerts/a1')));
  await assertFails(setDoc(doc(as('owner'), 'orgs/ra/approvals/expense:x1'), { done: true }));   // approvals are recorded by the server only
});
