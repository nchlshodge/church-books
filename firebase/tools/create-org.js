// Start a church in Church Books: its org record, its first setup and an invite for its owner.
//
//   node tools/create-org.js --org rcc --setup ../churches/rcc/setup.js --owner you@church.org --person nick
//
// Against the emulators, set FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST (or run it with
// `firebase emulators:exec`); it then also creates the owner's sign-in with a generated password and
// writes it to emulator-users.json (local only — never used for a real project).
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const admin = require('../functions/node_modules/firebase-admin');
const Setup = require('../functions/engine/setup.js');

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const orgId = arg('org'), setupFile = arg('setup'), owner = (arg('owner') || '').toLowerCase(), person = arg('person');
if (!orgId || !setupFile || !owner) { console.error('Usage: --org <id> --setup <setup.js> --owner <email> [--person <id>]'); process.exit(1); }

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-churchbooks' });
const db = admin.firestore(), emulator = !!process.env.FIRESTORE_EMULATOR_HOST;

(async () => {
  const setup = JSON.parse(JSON.stringify(require(path.resolve(setupFile))));
  setup.id = orgId; const personId = person || setup.currentUser; delete setup.currentUser;
  const problems = Setup.validateSetup({ ...setup, currentUser: personId });
  if (problems.length) throw new Error('The setup has problems:\n• ' + problems.join('\n• '));
  const org = db.doc(`orgs/${orgId}`);
  if ((await org.get()).exists) throw new Error(`orgs/${orgId} already exists`);
  const at = new Date().toISOString(), meta = { version: 1, updatedAt: at, updatedBy: 'create-org', what: 'Church set up' };
  await org.set({ name: setup.name, shortName: setup.shortName, plan: 'pilot', status: 'active', createdAt: at });
  await org.collection('settings').doc('setup').set({ ...setup, ...meta });
  await org.collection('setupHistory').doc('00001').set({ setup, ...meta });
  await db.doc(`bookInvites/${owner}`).set({ orgs: { [orgId]: { role: 'owner', personId, invitedBy: 'create-org', at } } }, { merge: true });
  console.log(`Created orgs/${orgId}; ${owner} is invited as owner (person "${personId}").`);
  if (emulator) {
    const file = path.join(__dirname, '..', 'emulator-users.json'), users = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const password = users[owner] || crypto.randomBytes(9).toString('base64url');
    try { await admin.auth().createUser({ email: owner, password, emailVerified: true, displayName: (setup.people[personId] || {}).name }); } catch (e) { if (e.code !== 'auth/email-already-exists') throw e; }
    users[owner] = password; fs.writeFileSync(file, JSON.stringify(users, null, 2));
    console.log(`Emulator sign-in for ${owner} saved in emulator-users.json`);
  }
})().catch(err => { console.error(err.message); process.exit(1); });
