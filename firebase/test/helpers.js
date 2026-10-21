// Shared test setup: talks to the local emulators only (project demo-churchbooks).
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8299';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9299';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9399';
const PROJECT = 'demo-churchbooks';
const admin = require('../functions/node_modules/firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const SETUP = require('../../churches/grace/setup.js');

let n = 0;
// A signed-in client for one person. Each gets its own app instance.
async function client(email, password = 'test-pass-123') {
  try { await admin.auth().createUser({ email, password, emailVerified: true }); } catch (e) { if (e.code !== 'auth/email-already-exists') throw e; }
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` }, `c${++n}`);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9299', { disableWarnings: true });
  const fns = getFunctions(app, 'us-central1'); connectFunctionsEmulator(fns, '127.0.0.1', 5299);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return { uid: cred.user.uid, call: (name, data) => httpsCallable(fns, name)(data).then(r => r.data) };
}
// A church with its setup (no entries) and members with the given roles: { email: [role, personId] }
async function makeOrg(orgId, members) {
  const db = admin.firestore(), at = new Date().toISOString();
  const setup = JSON.parse(JSON.stringify(SETUP)); setup.id = orgId; delete setup.currentUser;
  await db.doc(`orgs/${orgId}`).set({ name: setup.name, shortName: setup.shortName, plan: 'test', status: 'active', createdAt: at });
  await db.doc(`orgs/${orgId}/settings/setup`).set({ ...setup, version: 1 });
  const out = {};
  for (const [email, [role, personId]] of Object.entries(members)) {
    const c = await client(email);
    await db.doc(`orgs/${orgId}/members/${c.uid}`).set({ role, personId: personId || null, name: email.split('@')[0], email });
    out[role] = out[role] || c; out[email] = c;
  }
  return out;
}
const gift = (date, amt, id) => ({ date, memo: `Gifts ${id}`, source: id ? { type: 'test_gift', id } : null,
  lines: [{ account: '1000', fund: 'general', debit: amt }, { account: '4000', fund: 'general', credit: amt }] });
const code = p => p.then(() => 'ok', e => e.code.replace('functions/', ''));
module.exports = { admin, client, makeOrg, gift, code, PROJECT, SETUP };
