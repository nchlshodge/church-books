// Fundwell — the only code that writes to a church's ledger. The browser reads the books but
// never writes them: every entry, reversal, lock and setup change comes through here, is checked
// with the same engine the app uses (engine/*.js, copied in by `npm run sync-engine`), and is
// saved in one transaction with a hash chain (engine/chain.js) so a hand-edited entry is detectable.
// Everything lives under orgs/{orgId}/… (plus bookUsers/ and bookInvites/) — see docs/multi-tenant-firebase.md.
// Every function name starts with "books" so it can share a Firebase project with other apps.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Setup = require('./engine/setup.js');
const Chain = require('./engine/chain.js');
const Approvals = require('./engine/approvals.js');
const Rules = require('./engine/rules.js');
const Reports = require('./engine/reports.js');

admin.initializeApp();
// Who may start a new church's books (comma-separated emails). Set per project in functions/.env.<project>.
const PLATFORM_ADMINS = defineString('BOOKS_PLATFORM_ADMINS', { default: '' });
const platformAdmin = token => !!token && token.email_verified === true &&
  PLATFORM_ADMINS.value().split(',').map(x => x.trim().toLowerCase()).filter(Boolean).includes(String(token.email || '').toLowerCase());
const db = admin.firestore();

const CAN_POST = ['owner', 'admin', 'bookkeeper', 'reviewer'];
// Data entry records money in and out — deposits, receipts, checks — but never approves, reverses, locks or changes settings
const CAN_ENTER = [...CAN_POST, 'entry', 'campus', 'payroll'];   // campus admins and payroll administrators record too, inside their limits
const CAN_ADMIN = ['owner', 'admin'];
// leader: a ministry leader — sees only reports for their own budgets. counter: counts the offering on Sunday.
const ROLES = ['owner', 'admin', 'bookkeeper', 'reviewer', 'viewer', 'leader', 'counter', 'sender', 'entry', 'campus', 'payroll'];
const COUNTERS = [...CAN_ENTER, 'counter'];
// Data only some people may see, kept apart from everything else (who gave what, salaries, medical, benevolence)
const PRIVATE = ['donors', 'payroll', 'medical', 'benevolence'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const bad = msg => new HttpsError('invalid-argument', msg);
const orgRef = id => db.doc(`orgs/${id}`);
const srcKey = s => encodeURIComponent(`${s.type}:${s.id}`);
// The budgets someone is limited to (department data entry: their budgets; campus admin: their campus's), with the
// projects inside them. null = no limit.
function scopeOf(who, setup) {
  const all = setup.budgets || [];
  const names = who.role === 'campus' ? ((setup.campuses || []).find(c => c.id === who.campus) || {}).budgets || []
    : who.role === 'entry' && (who.budgets || []).length ? who.budgets : null;   // data entry with no departments picked covers them all
  if (!names) return null;
  return new Set(names.flatMap(n => [n, ...all.filter(b => b.parent === n).map(b => b.name)]));
}
const payrollEntry = d => !!d.source && d.source.type === 'payroll';
const now = () => new Date().toISOString();

// Who's calling, and may they do this in this church?
async function memberOf(req, orgId, allowed) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  if (typeof orgId !== 'string' || !/^[a-z0-9-]{2,40}$/.test(orgId)) throw bad('Unknown church');
  const m = await db.doc(`orgs/${orgId}/members/${req.auth.uid}`).get();
  if (!m.exists) throw new HttpsError('permission-denied', 'You are not a member of this church');
  if (m.data().untilMs && Date.now() > m.data().untilMs) throw new HttpsError('permission-denied', `Your access ended on ${new Date(m.data().untilMs).toISOString().slice(0, 10)}`);
  if (!allowed.includes(m.data().role)) throw new HttpsError('permission-denied', `A ${m.data().role} can't do that`);
  return { uid: req.auth.uid, ...m.data() };
}
// Something the owner should know about (big payments, reopened months, role changes). Inside a transaction when given one.
function alert(tx, orgId, a) {
  const doc = { at: now(), seen: false, ...a }, ref = orgRef(orgId).collection('alerts').doc();
  return tx ? tx.create(ref, doc) : ref.set(doc);
}
// What needs approval before it can be booked: a bill, or spending paid from the bank or owed to someone
// (a card charge is booked when the card company reports it, and reviewed after).
function approvalNeeded(d) {
  if (!d.source) return null;
  if (d.source.type === 'bill') return 'bill';
  if (d.source.type === 'expense' && !d.lines.some(l => /^20\d\d$/.test(l.account) && l.credit)) return 'expense';
  if (d.source.type === 'check') return 'check';   // a check written by hand (not paying an approved bill or receipt) is approved like spending
  return null;
}
const spendTotal = d => d.lines.filter(l => /^5/.test(l.account)).reduce((s, l) => s + l.debit - l.credit, 0);
const moneyOut = d => d.lines.filter(l => /^10\d\d$/.test(l.account)).reduce((s, l) => s + l.credit - l.debit, 0);

// Only the fields an entry is allowed to have, in the shape the engine saves them
function cleanDraft(d) {
  if (!d || typeof d !== 'object') throw bad('Empty entry');
  const lines = Array.isArray(d.lines) ? d.lines : [];
  return {
    date: String(d.date || ''), memo: String(d.memo || '').trim().slice(0, 500),
    source: d.source && d.source.type && d.source.id != null ? { type: String(d.source.type), id: String(d.source.id) } : null,
    lines: lines.slice(0, 500).map(l => ({ account: String(l.account), fund: String(l.fund), debit: l.debit || 0, credit: l.credit || 0,
      project: l.project || null, party: l.party || null, memo: l.memo || null })),
  };
}
// Check a draft with the engine: balanced in every fund, real accounts and funds, whole cents, open month
function check(setup, state, draft) {
  if (!setup) throw new HttpsError('failed-precondition', 'This church has no setup yet');
  try {
    const L = Setup.createBooks(setup, { lockedThrough: state.lockedThrough || null });
    L.post({ date: draft.date, memo: draft.memo, lines: draft.lines }, 'check');
  } catch (err) { throw new HttpsError('failed-precondition', err.message); }
}
const freshState = () => ({ seq: 0, lockedThrough: null, lastHash: '', usedAccounts: [], usedFunds: [] });

// Write one entry: entries/JE-…, sources/…, an audit row, and the new ledger state. Inside a transaction.
function writeEntry(tx, orgId, state, draft, who, extra = {}) {
  const org = orgRef(orgId), seq = (state.seq || 0) + 1, id = 'JE-' + String(seq).padStart(5, '0');
  const entry = { id, date: draft.date, memo: draft.memo, source: draft.source, lines: draft.lines, postedAt: now(), postedBy: who.name || who.email || who.uid, reverses: extra.reverses || null };
  entry.hash = Chain.hashEntry(state.lastHash || '', entry);
  tx.create(org.collection('entries').doc(id), { ...entry, seq, prev: state.lastHash || '', postedByUid: who.uid });
  if (draft.source) tx.create(org.collection('sources').doc(srcKey(draft.source)), { entryId: id });
  if (extra.marker) tx.create(org.collection('sources').doc(extra.marker), { entryId: id });
  tx.create(org.collection('audit').doc(), { at: entry.postedAt, by: entry.postedBy, uid: who.uid, action: extra.reverses ? 'reverse' : 'post', entry: id, memo: entry.memo });
  const used = (list, more) => [...new Set([...(list || []), ...more])].sort();
  tx.set(org.collection('ledger').doc('state'), { seq, lastHash: entry.hash, lastEntryAt: entry.postedAt,
    usedAccounts: used(state.usedAccounts, draft.lines.map(l => l.account)), usedFunds: used(state.usedFunds, draft.lines.map(l => l.fund)) }, { merge: true });
  return entry;
}
async function readBase(tx, orgId) {
  const org = orgRef(orgId);
  const [s, st] = await Promise.all([tx.get(org.collection('settings').doc('setup')), tx.get(org.collection('ledger').doc('state'))]);
  return { setup: s.exists ? s.data() : null, state: st.exists ? { ...freshState(), ...st.data() } : freshState() };
}

// Post one entry. expectId: the id the caller's own copy gave it (if they differ, the caller reloads).
exports.booksPostEntry = onCall(async req => {
  const { orgId, draft: raw, expectId, approval } = req.data || {};
  const who = await memberOf(req, orgId, CAN_ENTER), draft = cleanDraft(raw);
  if (who.role === 'payroll' && !payrollEntry(draft)) throw new HttpsError('permission-denied', 'The payroll administrator records payroll only');
  return db.runTransaction(async tx => {
    const org = orgRef(orgId), { setup, state } = await readBase(tx, orgId);
    check(setup, state, draft);
    // Spending that needs approval can only be booked once the server has recorded enough approvals, for this amount
    // someone limited to certain budgets books income and spending only to those budgets
    const scope = scopeOf(who, setup);
    if (scope && draft.lines.some(l => /^[45]/.test(l.account) && !scope.has(l.project))) throw new HttpsError('permission-denied', 'That\'s outside the budgets you\'re set up for');
    const need = approvalNeeded(draft);
    let ap = null, ck = null;
    if (need) {
      if (!approval || approval.kind !== need || !approval.id) throw new HttpsError('failed-precondition', `This ${need === 'bill' ? 'bill' : 'spending'} needs its approvals before it can be booked`);
      ap = await tx.get(org.collection('approvals').doc(`${need}:${approval.id}`));
      if (!ap.exists || !ap.data().done) throw new HttpsError('failed-precondition', 'It isn\'t fully approved yet');
      if (ap.data().amount !== spendTotal(draft)) throw new HttpsError('failed-precondition', 'The amount changed after it was approved — it has to be approved again');
    }
    // A check is booked only with a number the server handed out, and each number once
    if (draft.source && draft.source.type === 'check') {
      ck = await tx.get(org.collection('checkNumbers').doc(String(draft.source.id)));
      if (!ck.exists || ck.data().status === 'void') throw new HttpsError('failed-precondition', `Check #${draft.source.id} wasn't issued by the books (or was voided)`);
    }
    if (draft.source) {
      const dup = await tx.get(org.collection('sources').doc(srcKey(draft.source)));
      if (dup.exists) throw new HttpsError('already-exists', `Already posted: ${draft.source.type} ${draft.source.id} (entry ${dup.data().entryId})`);
    }
    const e = writeEntry(tx, orgId, state, draft, who);
    if (ck) tx.update(ck.ref, { status: 'used', entryId: e.id });
    const out = moneyOut(draft), over = Math.round(((setup.policies || {}).alertOver || 5000) * 100);
    if (out >= over) alert(tx, orgId, { kind: 'payment', entry: e.id, amount: out, memo: e.memo, by: e.postedBy });
    return { id: e.id, hash: e.hash, inSync: !expectId || expectId === e.id };
  });
});

// The only way to undo an entry: a mirror image, in an open month, with a reason. Each entry once.
exports.booksReverseEntry = onCall(async req => {
  const { orgId, entryId, reason, date, expectId } = req.data || {};
  const who = await memberOf(req, orgId, CAN_POST);
  if (!reason || !String(reason).trim()) throw bad('Say why it is being reversed');
  return db.runTransaction(async tx => {
    const org = orgRef(orgId), { setup, state } = await readBase(tx, orgId);
    const [orig, marker] = await Promise.all([tx.get(org.collection('entries').doc(String(entryId))), tx.get(org.collection('sources').doc(srcKey({ type: 'reversal', id: entryId })))]);
    if (!orig.exists) throw new HttpsError('not-found', `No entry ${entryId}`);
    if (orig.data().reverses) throw new HttpsError('failed-precondition', `${entryId} is itself a reversal`);
    if (marker.exists) throw new HttpsError('already-exists', `${entryId} was already reversed`);
    const o = orig.data(), d = date || o.date;
    if (!ISO.test(d)) throw bad('Dates are YYYY-MM-DD');
    const draft = { date: d, memo: `Reverses ${entryId}: ${String(reason).trim()}`, source: null, lines: o.lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })) };
    check(setup, state, draft);
    const e = writeEntry(tx, orgId, state, draft, who, { reverses: entryId, marker: srcKey({ type: 'reversal', id: entryId }) });
    return { id: e.id, hash: e.hash, inSync: !expectId || expectId === e.id };
  });
});

// Close the books through a date. Writes a snapshot of every account × fund balance at that date.
exports.booksLockMonth = onCall(async req => {
  const { orgId, through } = req.data || {};
  const who = await memberOf(req, orgId, CAN_ADMIN);
  if (!ISO.test(through || '')) throw bad('Lock date must be YYYY-MM-DD');
  return db.runTransaction(async tx => {
    const org = orgRef(orgId), { state } = await readBase(tx, orgId);
    if (state.lockedThrough && through < state.lockedThrough) throw new HttpsError('failed-precondition', 'To reopen a closed month, unlock it with a reason');
    const entries = await tx.get(org.collection('entries').where('date', '<=', through));
    const bal = {};
    entries.forEach(d => d.data().lines.forEach(l => { const k = `${l.account}|${l.fund}`; bal[k] = (bal[k] || 0) + l.debit - l.credit; }));
    tx.set(org.collection('snapshots').doc(through), { through, balances: bal, entries: entries.size, lastHash: state.lastHash || '', at: now(), by: who.name || who.uid });
    tx.set(org.collection('ledger').doc('state'), { lockedThrough: through }, { merge: true });
    tx.create(org.collection('audit').doc(), { at: now(), by: who.name || who.uid, uid: who.uid, action: 'lock', through });
    return { lockedThrough: through };
  });
});
exports.booksUnlockMonth = onCall(async req => {
  const { orgId, through, reason } = req.data || {};
  const who = await memberOf(req, orgId, ['owner']);   // reopening closed books is the owner's call alone
  if (!reason || !String(reason).trim()) throw bad('Say why a closed month is being reopened');
  if (through && !ISO.test(through)) throw bad('Dates are YYYY-MM-DD');
  return db.runTransaction(async tx => {
    const org = orgRef(orgId), { state } = await readBase(tx, orgId);
    tx.set(org.collection('ledger').doc('state'), { lockedThrough: through || null }, { merge: true });
    tx.create(org.collection('audit').doc(), { at: now(), by: who.name || who.uid, uid: who.uid, action: 'unlock', from: state.lockedThrough, to: through || null, reason: String(reason).trim() });
    alert(tx, orgId, { kind: 'unlock', from: state.lockedThrough, to: through || null, reason: String(reason).trim(), by: who.name || who.uid });
    return { lockedThrough: through || null };
  });
});

// Save a new version of the church's setup. Checked with validateSetup(), and it can't drop an
// account or fund the books already use. Every version is kept in setupHistory.
exports.booksUpdateSetup = onCall(async req => {
  const { orgId, setup, what } = req.data || {};
  const who = await memberOf(req, orgId, CAN_ADMIN);
  if (!setup || typeof setup !== 'object') throw bad('No setup');
  const clean = JSON.parse(JSON.stringify({ ...setup, id: orgId })); delete clean.currentUser; delete clean.version;
  const problems = Setup.validateSetup({ ...clean, currentUser: Object.keys(clean.people || {})[0] });
  if (problems.length) throw new HttpsError('failed-precondition', 'The setup has problems:\n• ' + problems.join('\n• '));
  return db.runTransaction(async tx => {
    const org = orgRef(orgId), { setup: old, state } = await readBase(tx, orgId);
    const codes = new Set(Setup.buildChart(clean).map(a => a.code)), funds = new Set(clean.funds.map(f => f.id));
    const lost = [...(state.usedAccounts || []).filter(c => !codes.has(c)).map(c => `account ${c}`), ...(state.usedFunds || []).filter(f => !funds.has(f)).map(f => `fund ${f}`)];
    if (lost.length) throw new HttpsError('failed-precondition', `These are used in the books and can't be removed: ${lost.join(', ')}`);
    const version = ((old && old.version) || 0) + 1, meta = { version, updatedAt: now(), updatedBy: who.name || who.uid, what: String(what || 'Setup changed').slice(0, 200) };
    tx.set(org.collection('settings').doc('setup'), { ...clean, ...meta });
    tx.set(org.collection('setupHistory').doc(String(version).padStart(5, '0')), { setup: clean, ...meta });
    tx.create(org.collection('audit').doc(), { at: meta.updatedAt, by: meta.updatedBy, uid: who.uid, action: 'setup', version, what: meta.what });
    return { version };
  });
});

// Bring a church's existing books in (from the app's "Export everything" file). Only into an
// empty ledger, by its owner. Every entry is re-checked by replaying it through the engine first.
exports.booksImport = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async req => {
  const { orgId, data } = req.data || {};
  const who = await memberOf(req, orgId, ['owner']);
  if (!data || !data.setup || !Array.isArray(data.entries)) throw bad('That file is not a Fundwell export');
  const org = orgRef(orgId), st = await org.collection('ledger').doc('state').get();
  if (st.exists && st.data().seq > 0) throw new HttpsError('failed-precondition', 'These books already have entries; importing only works into empty books');
  const setup = JSON.parse(JSON.stringify({ ...data.setup, id: orgId })); delete setup.currentUser;
  let L;
  try {
    L = Setup.createBooks({ ...setup, currentUser: Object.keys(setup.people || {})[0] });
    data.entries.forEach(e => L.post({ date: e.date, memo: e.memo, source: e.source, reverses: e.reverses, lines: e.lines }, e.postedBy));
    if (data.lockedThrough) L.lock(data.lockedThrough, 'import');
  } catch (err) { throw new HttpsError('failed-precondition', `The file didn't pass the checks: ${err.message}`); }
  // Writes in batches (an import can be thousands of entries); the state doc goes last, so a half-finished import still shows as empty
  let prev = '', batch = db.batch(), n = 0;
  const flush = async (force) => { if (n >= 400 || (force && n)) { await batch.commit(); batch = db.batch(); n = 0; } };
  const at = now();
  for (const [i, e] of L.entries.entries()) {
    const entry = { id: e.id, date: e.date, memo: e.memo, source: e.source, lines: e.lines.map(l => ({ ...l })), postedAt: data.entries[i].postedAt || at, postedBy: e.postedBy, reverses: e.reverses };
    entry.hash = Chain.hashEntry(prev, entry);
    batch.set(org.collection('entries').doc(e.id), { ...entry, seq: i + 1, prev, postedByUid: who.uid, imported: true }); n++;
    if (e.source) { batch.set(org.collection('sources').doc(srcKey(e.source)), { entryId: e.id }); n++; }
    if (e.reverses) { batch.set(org.collection('sources').doc(srcKey({ type: 'reversal', id: e.reverses })), { entryId: e.id }); n++; }
    prev = entry.hash; await flush();
  }
  const ws = data.workspace || {}, privOf = { donors: 'donors', nonCash: 'donors', pledges: 'donors', staff: 'payroll', compPlan: 'payroll' };
  Object.entries(ws).forEach(([kind, json]) => { if (privOf[kind] || !/^[a-zA-Z]{1,40}$/.test(kind) || typeof json !== 'string' || json.length >= 900000) return;
    batch.set(org.collection('workspace').doc(kind), { json, updatedAt: at, updatedBy: who.name || who.uid }); n++; });
  // who gave what and salaries go to private/, readable only by the owner and people given access
  const pj = k => { try { return JSON.parse(ws[k] || 'null') || []; } catch (e) { return []; } };
  batch.set(org.collection('private').doc('donors'), { json: JSON.stringify({ donors: pj('donors'), nonCash: pj('nonCash'), pledges: pj('pledges') }), updatedAt: at, updatedBy: who.name || who.uid });
  batch.set(org.collection('private').doc('payroll'), { json: JSON.stringify({ staff: pj('staff'), compPlan: (() => { try { return JSON.parse(ws.compPlan || 'null'); } catch (e) { return null; } })() }), updatedAt: at, updatedBy: who.name || who.uid }); n += 2;
  (data.expenses || []).forEach(x => { if (x && x.id) { batch.set(org.collection('expenses').doc(String(x.id)), { json: JSON.stringify(x), status: x.status || 'Needs receipt', senderUid: null }); n++; } });
  await flush(true);
  const used = k => [...new Set(L.entries.flatMap(e => e.lines.map(l => l[k])))].sort();
  const version = 1, meta = { version, updatedAt: at, updatedBy: who.name || who.uid, what: 'Brought in from an export' };
  batch.set(org.collection('settings').doc('setup'), { ...setup, ...meta });
  batch.set(org.collection('setupHistory').doc('00001'), { setup, ...meta });
  batch.set(org.collection('audit').doc(), { at, by: meta.updatedBy, uid: who.uid, action: 'import', entries: L.entries.length });
  batch.set(org.collection('ledger').doc('state'), { seq: L.entries.length, lastHash: prev, lastEntryAt: at, lockedThrough: L.lockedThrough || null, usedAccounts: used('account'), usedFunds: used('fund') });
  await batch.commit();
  return { entries: L.entries.length, lastHash: prev };
});

// Invites: an admin invites an email address with a role; that person signs in and joins.
// budgets: for a ministry leader, the budgets they can see · until: last day of access (YYYY-MM-DD) · access: private data they may see
exports.booksInviteMember = onCall(async req => {
  const { orgId, email, role, personId, budgets, until, access, campus, reports } = req.data || {};
  const who = await memberOf(req, orgId, CAN_ADMIN);
  const em = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw bad('That email address does not look right');
  if (!ROLES.includes(role)) throw bad(`Role must be one of: ${ROLES.join(', ')}`);
  if (role === 'owner' && who.role !== 'owner') throw new HttpsError('permission-denied', 'Only an owner can add another owner');
  if (role === 'leader' && !(Array.isArray(budgets) && budgets.length)) throw bad('Pick the budgets a ministry leader can see');
  if (until && !ISO.test(until)) throw bad('The end date is YYYY-MM-DD');
  const acc = Array.isArray(access) ? access.filter(a => PRIVATE.includes(a)) : [];
  if (acc.length && who.role !== 'owner') throw new HttpsError('permission-denied', 'Only an owner can give access to private information');
  if (role === 'campus') { const st = (await orgRef(orgId).collection('settings').doc('setup').get()).data() || {}; if (!(st.campuses || []).some(c => c.id === campus)) throw bad('Pick the campus this admin runs'); }
  const scoped = role === 'leader' || (role === 'entry' && Array.isArray(budgets) && budgets.length);   // data entry can be limited to certain departments
  const grant = { role, personId: personId || null, invitedBy: who.uid, at: now(), ...(scoped ? { budgets: budgets.map(String) } : {}),
    ...(role === 'campus' ? { campus: String(campus) } : {}), ...(role === 'entry' && reports === false ? { reports: false } : {}),
    ...(until ? { untilMs: Date.parse(until + 'T23:59:59') } : {}), ...(acc.length ? { access: acc } : {}) };
  await db.doc(`bookInvites/${em}`).set({ orgs: { [orgId]: grant } }, { merge: true });
  await orgRef(orgId).collection('audit').add({ at: now(), by: who.name || who.uid, uid: who.uid, action: 'invite', email: em, role, until: until || null, access: acc });
  await alert(null, orgId, { kind: 'role', email: em, role, access: acc, by: who.name || who.uid });
  return { ok: true };
});
// Called after sign-in: turns any invites for this (verified) email into memberships.
exports.booksJoinOrgs = onCall(async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const { email, email_verified: verified, name } = req.auth.token;
  const em = String(email || '').toLowerCase(), joined = [];
  if (em && verified) {
    const inv = await db.doc(`bookInvites/${em}`).get();
    for (const [orgId, i] of Object.entries(inv.exists ? inv.data().orgs || {} : {})) {
      const mRef = db.doc(`orgs/${orgId}/members/${req.auth.uid}`);
      if (!(await mRef.get()).exists) {
        const setup = await db.doc(`orgs/${orgId}/settings/setup`).get(), person = setup.exists && i.personId ? (setup.data().people || {})[i.personId] : null;
        await mRef.set({ role: i.role, personId: i.personId || null, name: (person && person.name) || name || em, email: em, invitedBy: i.invitedBy || null, joinedAt: now(),
          ...(i.budgets ? { budgets: i.budgets } : {}), ...(i.campus ? { campus: i.campus } : {}), ...(i.reports === false ? { reports: false } : {}), ...(i.untilMs ? { untilMs: i.untilMs } : {}), ...(i.access ? { access: i.access } : {}) });
        joined.push(orgId);
      }
      await db.doc(`bookUsers/${req.auth.uid}`).set({ email: em, orgs: { [orgId]: i.role } }, { merge: true });
    }
    if (inv.exists) await inv.ref.delete();
  }
  const u = await db.doc(`bookUsers/${req.auth.uid}`).get();
  return { joined, orgs: u.exists ? u.data().orgs || {} : {}, canCreate: platformAdmin(req.auth.token) };
});

// Start a new church: its org, first setup, and the caller as its owner. Only the books administrators
// (BOOKS_PLATFORM_ADMINS) can do this — it's how the first church gets in without server keys.
exports.booksCreateOrg = onCall(async req => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  if (!platformAdmin(req.auth.token)) throw new HttpsError('permission-denied', 'Only the Fundwell administrator can start a new church');
  const { orgId, setup: raw, personId } = req.data || {};
  if (typeof orgId !== 'string' || !/^[a-z0-9-]{2,40}$/.test(orgId)) throw bad('Church id: 2–40 lowercase letters, numbers or dashes');
  if (!raw || typeof raw !== 'object') throw bad('No setup');
  const setup = JSON.parse(JSON.stringify({ ...raw, id: orgId })); delete setup.currentUser; ['version', 'updatedAt', 'updatedBy', 'what'].forEach(k => delete setup[k]);
  if (!personId || !(setup.people || {})[personId]) throw bad('Pick who you are in the setup\'s people list');
  const problems = Setup.validateSetup({ ...setup, currentUser: personId });
  if (problems.length) throw new HttpsError('failed-precondition', 'The setup has problems:\n• ' + problems.join('\n• '));
  const org = orgRef(orgId), at = now(), em = String(req.auth.token.email).toLowerCase(), name = setup.people[personId].name;
  await db.runTransaction(async tx => {
    if ((await tx.get(org)).exists) throw new HttpsError('already-exists', `There's already a church with the id "${orgId}"`);
    const meta = { version: 1, updatedAt: at, updatedBy: name, what: 'Church set up' };
    tx.set(org, { name: setup.name, shortName: setup.shortName, plan: 'pilot', status: 'active', createdAt: at, createdBy: em });
    tx.set(org.collection('settings').doc('setup'), { ...setup, ...meta });
    tx.set(org.collection('setupHistory').doc('00001'), { setup, ...meta });
    tx.set(org.collection('members').doc(req.auth.uid), { role: 'owner', personId, name, email: em, invitedBy: null, joinedAt: at });
    tx.set(db.doc(`bookUsers/${req.auth.uid}`), { email: em, orgs: { [orgId]: 'owner' } }, { merge: true });
    tx.create(org.collection('audit').doc(), { at, by: name, uid: req.auth.uid, action: 'create_org' });
  });
  return { orgId };
});

// ---- Approvals, recorded by the server ----
// Each approver signs in and approves for themselves. Nobody approves their own spending, approvers come from the
// church's policy, the tiers decide how many are needed, and if the amount changes the approvals start over.
// kind: 'expense' | 'bill' · amount: dollars · submitter: the person who spent it or entered the bill
exports.booksApprove = onCall(async req => {
  const { orgId, kind, id, amount, restricted, submitter, board, budget } = req.data || {};
  const who = await memberOf(req, orgId, [...CAN_POST, 'leader', 'campus']);
  if (!['expense', 'bill', 'check'].includes(kind) || !id) throw bad('Approve an expense, a bill or a check');
  const amt = Math.round(+amount * 100);
  if (!(amt > 0)) throw bad('The amount has to be more than zero');
  if (!who.personId) throw new HttpsError('failed-precondition', 'Your sign-in isn\'t linked to anyone in the people list');
  return db.runTransaction(async tx => {
    const org = orgRef(orgId), { setup } = await readBase(tx, orgId), ref = org.collection('approvals').doc(`${kind}:${id}`), cur = await tx.get(ref);
    const pol = { ...(setup.policies || {}) }; pol.approvers = pol.approvers || pol.reviewers || [];
    const prev = cur.exists && cur.data().amount === amt ? cur.data() : null;   // a new amount starts over
    const list = prev ? prev.list.slice() : [], boardVote = board && board.on ? { kind: 'board', on: String(board.on), note: String(board.note || '').slice(0, 200) } : (prev && prev.board) || null;
    // The department head comes from the setup (the lead of the budget, or of the ministry it's inside), never from the browser
    const all = setup.budgets || [], b = all.find(x => x.name === (prev ? prev.budget : budget)), top = b && b.parent ? all.find(x => x.name === b.parent) : b;
    const dept = top && top.lead && (setup.people || {})[top.lead] && !(setup.people || {})[top.lead].group ? top.lead : null;
    const camp = (setup.campuses || []).find(c => c.admin && top && (c.budgets || []).includes(top.name));   // a campus admin is an approver for their campus
    if (camp && !pol.approvers.includes(camp.admin)) pol.approvers = [...pol.approvers, camp.admin];
    if (who.role === 'campus' && !(camp && camp.id === who.campus)) throw new HttpsError('permission-denied', 'That isn\'t your campus\'s spending');
    const plan = Approvals.planFor(pol, { amount: amt / 100, restricted: !!restricted, dept });
    const deptStep = !!plan.dept && plan.dept !== submitter && !list.some(a => a.kind === 'dept');
    if (board && board.on && !CAN_ADMIN.includes(who.role)) throw new HttpsError('permission-denied', 'Only an admin can record a board vote');
    if (!board || !board.on) {
      if (who.personId === submitter) throw new HttpsError('permission-denied', 'You can\'t approve your own spending');
      if (list.some(a => a.by === who.personId)) throw new HttpsError('already-exists', 'You already approved this');
      if (deptStep && who.personId === plan.dept) list.push({ by: who.personId, uid: who.uid, at: now(), kind: 'dept' });
      else if (who.role === 'leader') throw new HttpsError('permission-denied', 'Department heads approve only their own department\'s spending, as the first step');
      else if (!pol.approvers.includes(who.personId)) throw new HttpsError('permission-denied', 'You\'re not one of the approvers');
      else list.push({ by: who.personId, uid: who.uid, at: now() });
    }
    const st = Approvals.status(pol, plan, [...list, ...(boardVote ? [boardVote] : [])], { submitter });
    tx.set(ref, { kind, id: String(id), amount: amt, submitter: submitter || null, restricted: !!restricted, budget: (prev ? prev.budget : budget) || null, dept: plan.dept, list, board: boardVote, need: plan.approvals, needsBoard: plan.board, done: st.done, updatedAt: now() });
    tx.create(org.collection('audit').doc(), { at: now(), by: who.name || who.uid, uid: who.uid, action: 'approve', item: `${kind}:${id}`, amount: amt, done: st.done });
    return { done: st.done, have: st.have, need: st.need, boardOk: st.boardOk, deptOk: st.deptOk, dept: plan.dept, list: list.map(a => ({ by: a.by, at: a.at, kind: a.kind || null })) };
  });
});

// ---- Check numbers, handed out by the server so none is used twice ----
exports.booksReserveChecks = onCall(async req => {
  const { orgId, count = 1 } = req.data || {};
  const who = await memberOf(req, orgId, CAN_ENTER), n = Math.floor(+count);
  if (!(n >= 1 && n <= 50)) throw bad('Reserve 1 to 50 checks at a time');
  return db.runTransaction(async tx => {
    const org = orgRef(orgId), { setup, state } = await readBase(tx, orgId), first = state.nextCheck || (setup.checks && setup.checks.nextNumber) || 1001;
    for (let i = 0; i < n; i++) tx.create(org.collection('checkNumbers').doc(String(first + i)), { no: first + i, status: 'issued', by: who.name || who.uid, uid: who.uid, at: now() });
    tx.set(org.collection('ledger').doc('state'), { nextCheck: first + n }, { merge: true });
    return { numbers: Array.from({ length: n }, (_, i) => first + i) };
  });
});
exports.booksVoidCheck = onCall(async req => {
  const { orgId, no, reason } = req.data || {};
  const who = await memberOf(req, orgId, CAN_POST);
  if (!reason || !String(reason).trim()) throw bad('Say why the check is void');
  const ref = orgRef(orgId).collection('checkNumbers').doc(String(no)), d = await ref.get();
  if (!d.exists) throw new HttpsError('not-found', `Check #${no} wasn't issued by the books`);
  await ref.update({ status: 'void', voidReason: String(reason).trim(), voidBy: who.name || who.uid, voidAt: now() });   // the number is never handed out again
  return { ok: true };
});

// ---- Sunday counts: two different people, totals that match, then the server books it ----
// split: { givingFundId: dollars } (defaults to all of it to the first way to give)
exports.booksStartCount = onCall(async req => {
  const { orgId, date, cash, checks, split } = req.data || {};
  const who = await memberOf(req, orgId, COUNTERS);
  if (!ISO.test(date || '')) throw bad('The date is YYYY-MM-DD');
  const c = Math.round(+cash * 100), k = Math.round(+checks * 100);
  if (!(c >= 0 && k >= 0 && c + k > 0)) throw bad('Enter the cash and checks counted');
  const sp = Object.fromEntries(Object.entries(split || {}).map(([g, a]) => [g, Math.round(+a * 100)]).filter(([, a]) => a > 0));
  if (Object.keys(sp).length && Object.values(sp).reduce((s, a) => s + a, 0) !== c + k) throw bad('The split has to add up to the total counted');
  const ref = await orgRef(orgId).collection('counts').add({ date, cash: c, checks: k, split: sp, status: 'waiting', first: { uid: who.uid, name: who.name || who.email || who.uid, at: now() } });
  return { id: ref.id };
});
exports.booksConfirmCount = onCall(async req => {
  const { orgId, countId, cash, checks } = req.data || {};
  const who = await memberOf(req, orgId, COUNTERS);
  return db.runTransaction(async tx => {
    const org = orgRef(orgId), ref = org.collection('counts').doc(String(countId)), cur = await tx.get(ref);
    if (!cur.exists) throw new HttpsError('not-found', 'No such count');
    const c = cur.data();
    if (c.status !== 'waiting') throw new HttpsError('failed-precondition', 'This count is already confirmed');
    if (c.first.uid === who.uid) throw new HttpsError('permission-denied', 'A second person has to count it too');
    if (Math.round(+cash * 100) !== c.cash || Math.round(+checks * 100) !== c.checks) throw new HttpsError('failed-precondition', 'Your totals don\'t match the first count — count it again together');
    const { setup, state } = await readBase(tx, orgId), giving = Setup.givingRules(setup), first = (setup.giving || [])[0];
    const byGiving = Object.keys(c.split || {}).length ? c.split : { [first.id]: c.cash + c.checks };
    const draft = cleanDraft(Rules.giftsDeposit({ date: c.date, bank: '1100', memo: `Offering counted ${c.date} · ${c.first.name} & ${who.name || who.uid}`, source: { type: 'cash', id: ref.id }, byGiving, giving, feeFund: (setup.policies || {}).feeFund }));
    check(setup, state, draft);
    const dup = await tx.get(org.collection('sources').doc(srcKey(draft.source)));
    if (dup.exists) throw new HttpsError('already-exists', 'Already booked');
    const e = writeEntry(tx, orgId, state, draft, who);
    tx.update(ref, { status: 'counted', second: { uid: who.uid, name: who.name || who.email || who.uid, at: now() }, entryId: e.id });
    return { entry: e };
  });
});

// ---- Ministry leaders: a report for their own budgets, built here, so they never read the books ----
exports.booksLeaderReport = onCall(async req => {
  const { orgId, budget, from, to } = req.data || {};
  const who = await memberOf(req, orgId, [...CAN_POST, 'viewer', 'leader']);
  const org = orgRef(orgId), setup = (await org.collection('settings').doc('setup').get()).data();
  const all = setup.budgets || [], b = all.find(x => x.name === budget);
  // a leader asking about someone else's budget learns nothing — not even whether it exists
  if (who.role === 'leader' && !(b && (who.budgets || []).some(n => n === b.name || n === b.parent))) throw new HttpsError('permission-denied', 'That budget isn\'t one of yours');
  if (!b) throw new HttpsError('not-found', 'No such budget');
  const names = [b.name, ...all.filter(x => x.parent === b.name).map(x => x.name)];
  const snap = await org.collection('entries').orderBy('seq').get();
  const chart = Setup.buildChart(setup), L = { accounts: chart, entries: snap.docs.map(d => d.data()) };
  const r = Reports.projectReport(L, { projects: names, from: from || null, to: to || null });
  const pay = new Set(chart.filter(a => a.sub === 'payroll').map(a => a.code));
  r.lines = r.lines.map(l => pay.has(l.account) ? { ...l, party: null, memo: 'Staff pay' } : l);   // no individual pay in a leader's report
  return { budget: b.name, amount: Math.round((b.budget || 0) * 100), lead: b.lead || null, date: b.date || null, names, report: r, mine: who.role === 'leader' ? who.budgets : null };
});

// ---------- Planning Center Giving: the morning pull ----------
// Every morning at 6:00 each connected church's completed online gifts from the days since the last pull are added up
// into one payout per day (engine/pco.js) and saved with the church's other payouts as "New". The app then records each
// one by itself when the bank deposit matches (engine/autopost.js) or sets it aside to "need a look".
// The connection lives at orgs/{org}/connections/pco: { status: 'connected', mode: 'test' | 'live', funds: { PCO fund: giving id },
// lastDay, testDonations? }. Test mode reads sample donations saved on that record — nothing reaches Planning Center.
// Live mode will read Planning Center's API with the church's own sign-in (OAuth; the access key kept in Secret Manager,
// never in Firestore). It isn't switched on yet.
const Pco = require('./engine/pco.js');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const localDay = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz || 'America/New_York' });   // 'YYYY-MM-DD'
const shortDay = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayBefore = ymd => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
async function pcoDonations(conn) {
  if (conn.mode === 'test') return conn.testDonations || [];
  throw new HttpsError('failed-precondition', 'The live Planning Center connection isn\'t switched on yet — this church is set up for test data only');
}
async function pullPlanningCenter(orgId, today) {
  const connRef = db.doc(`orgs/${orgId}/connections/pco`), conn = (await connRef.get()).data();
  if (!conn || conn.status !== 'connected') return { skipped: 'not connected' };
  const setup = (await db.doc(`orgs/${orgId}/settings/setup`).get()).data() || {}, tz = setup.timezone;
  const through = dayBefore(today || localDay(now(), tz)), after = conn.lastDay || dayBefore(through);   // yesterday and anything missed since
  const days = Pco.days(await pcoDonations(conn), { funds: conn.funds || {}, dateOf: s => localDay(s, tz) }).filter(d => d.date > after && d.date <= through);
  const wsRef = db.doc(`orgs/${orgId}/workspace/payouts`);
  const added = await db.runTransaction(async tx => {
    const doc = await tx.get(wsRef), payouts = doc.exists ? JSON.parse(doc.data().json || '[]') : [];
    const fresh = days.filter(d => !payouts.some(p => p.source && p.source.id === d.date && p.source.type === 'pco_day'))
      .map(d => ({ date: shortDay(d.date), gifts: d.gifts, split: Object.fromEntries(Object.entries(d.split).map(([k, v]) => [k, v / 100])), fee: d.fee / 100, net: d.net / 100,
        status: 'New', source: d.source, from: 'Planning Center', pulledAt: now() }));
    if (fresh.length) tx.set(wsRef, { json: JSON.stringify([...fresh.reverse(), ...payouts]), updatedAt: now(), updatedBy: 'Planning Center (morning pull)' });
    tx.set(connRef, { lastDay: through, lastPull: now(), lastFound: fresh.length }, { merge: true });
    return fresh.length;
  });
  return { days: days.length, added, through };
}
exports.booksPcoMorningPull = onSchedule({ schedule: 'every day 06:00', timeZone: 'America/New_York' }, async () => {
  for (const o of (await db.collection('orgs').get()).docs) {   // a church at a time; one church's problem doesn't stop the rest
    try { await pullPlanningCenter(o.id); } catch (e) { console.error('Planning Center pull failed', o.id, e.message); }
  }
});
// "Check now" — the same pull, on demand. today (optional, 'YYYY-MM-DD') is for tests.
exports.booksPcoPullNow = onCall(async req => {
  const { orgId, today } = req.data || {};
  await memberOf(req, orgId, CAN_ENTER);
  if (today != null && !ISO.test(today)) throw bad('today is a date like 2026-10-19');
  return pullPlanningCenter(orgId, today);
});

// ---------- People limited to part of the books ----------
// Department data entry, campus admins and payroll administrators never read the whole ledger; this hands them their part:
// whole entries that touch their budgets (payroll: payroll entries), with staff pay shown without names.
exports.booksScopedBooks = onCall({ memory: '512MiB' }, async req => {
  const { orgId } = req.data || {};
  const who = await memberOf(req, orgId, ['entry', 'campus', 'payroll']);
  const org = orgRef(orgId), setup = (await org.collection('settings').doc('setup').get()).data() || {};
  const scope = scopeOf(who, setup);
  if (!scope && who.role !== 'payroll') throw new HttpsError('failed-precondition', 'This sign-in reads the whole books the usual way');
  const state = (await org.collection('ledger').doc('state').get()).data() || { seq: 0, lockedThrough: null };
  const chart = Setup.buildChart(setup), pay = new Set(chart.filter(a => a.sub === 'payroll').map(a => a.code));
  const entries = (await org.collection('entries').orderBy('seq').get()).docs.map(d => d.data())
    .filter(e => who.role === 'payroll' ? payrollEntry(e) || e.lines.some(l => pay.has(l.account)) : e.lines.some(l => scope.has(l.project)))
    .map(e => who.role === 'payroll' ? e : { ...e, lines: e.lines.map(l => pay.has(l.account) ? { ...l, party: null } : l), memo: e.lines.some(l => pay.has(l.account)) ? 'Staff pay' : e.memo });
  const ws = {};
  if (scope) for (const kind of ['bills', 'checks', 'requests']) {
    const d = await org.collection('workspace').doc(kind).get(), list = d.exists ? JSON.parse(d.data().json || '[]') : [];
    ws[kind] = list.filter(x => [x.proj, ...(x.splits || []).map(p => p.proj)].some(p => scope.has(p)));
  }
  return { setup, state: { seq: state.seq || 0, lockedThrough: state.lockedThrough || null }, entries, workspace: ws, scope: scope ? [...scope] : null };
});

// ---------- Approving the pay plan ----------
// The payroll administrator proposes next year's pay (in private/payroll); an admin who didn't prepare it approves it, and the
// server keeps that approved copy (payPlans/{year}) where nobody can change it.
exports.booksApprovePayPlan = onCall(async req => {
  const { orgId } = req.data || {};
  const who = await memberOf(req, orgId, CAN_ADMIN);
  const org = orgRef(orgId), d = await org.collection('private').doc('payroll').get();
  const plan = d.exists ? (JSON.parse(d.data().json || '{}').compPlan || null) : null;
  if (!plan || !plan.year) throw new HttpsError('failed-precondition', 'There\'s no pay plan to approve');
  if (plan.submitted && plan.submitted.by === who.personId) throw new HttpsError('permission-denied', 'Someone other than the person who prepared it has to approve it');
  await org.collection('payPlans').doc(String(plan.year)).set({ plan: JSON.stringify(plan), approvedBy: who.personId || who.uid, approvedAt: now() });
  await org.collection('audit').add({ at: now(), by: who.name || who.uid, uid: who.uid, action: 'approve_pay_plan', year: plan.year });
  return { year: plan.year, approvedBy: who.personId };
});
