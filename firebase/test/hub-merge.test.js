// Only runs against the merged Hub rules (BOOKS_FS_RULES set): the Hub's own rules still behave the same.
const test = require('node:test'), assert = require('node:assert');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const { doc, getDoc, setDoc } = require('firebase/firestore');
const { ref, uploadBytes } = require('firebase/storage');
const on = !!process.env.BOOKS_FS_RULES;
let env;
test.before(async () => { if (!on) return;
  env = await initializeTestEnvironment({ projectId: 'demo-churchbooks-hub',
    firestore: { host: '127.0.0.1', port: 8299, rules: fs.readFileSync(process.env.BOOKS_FS_RULES, 'utf8') },
    storage: { host: '127.0.0.1', port: 9399, rules: fs.readFileSync(process.env.BOOKS_ST_RULES, 'utf8') } });
  await env.withSecurityRulesDisabled(async ctx => { const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin1'), { isAdmin: true, approved: true }); await setDoc(doc(db, 'users/plain'), { approved: true });
    await setDoc(doc(db, 'orgs/rcc/members/plain'), { role: 'reviewer' }); await setDoc(doc(db, 'orgs/rcc/entries/JE-00001'), { memo: 'x' }); });
});
test.after(() => on && env.cleanup());
const as = (uid, provider = 'google.com') => env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }).firestore();

test('Hub rules unchanged: users, admin powers, default deny', { skip: !on }, async () => {
  await assertSucceeds(getDoc(doc(as('plain'), 'users/plain')));
  await assertFails(getDoc(doc(as('plain'), 'users/admin1')));
  await assertSucceeds(getDoc(doc(as('admin1'), 'users/plain')));
  await assertFails(setDoc(doc(as('plain'), 'users/plain'), { approved: true, isAdmin: true }));
  await assertFails(getDoc(doc(as('plain'), 'nothingHere/x')));
  await assertFails(uploadBytes(ref(env.authenticatedContext('plain').storage(), 'random/x.pdf'), new Uint8Array([1]), { contentType: 'application/pdf' }));
});
test('a Hub admin gets nothing in the books without a books membership', { skip: !on }, async () => {
  await assertFails(getDoc(doc(as('admin1'), 'orgs/rcc/entries/JE-00001')));
  await assertFails(setDoc(doc(as('admin1'), 'orgs/rcc/workspace/bills'), { json: '[]' }));
  await assertSucceeds(getDoc(doc(as('plain'), 'orgs/rcc/entries/JE-00001')));
  await assertFails(setDoc(doc(as('admin1'), 'bookUsers/admin1'), { orgs: { rcc: 'owner' } }));
});
