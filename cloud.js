// Church Books — the cloud connection (index.html?cloud). Signs the person in, loads their church's
// books from Firestore, then starts the app. While the app runs it:
//   • sends every ledger change (post, reverse, lock) to the Cloud Functions, one at a time, in order —
//     the server re-checks it with the same engine and is the record; the browser never writes the ledger
//   • saves everyday work (bills, vendors, receipts, reconciliations, the file list…) when it changes
//   • uploads attached files to the church's private storage
// Every value shown on these screens goes through esc(). Which Firebase project: cloud-config.js.
(function () {
  const CFG = window.BOOKS_CLOUD_CONFIG;
  firebase.initializeApp(CFG.firebase);
  const auth = firebase.auth(), fs = firebase.firestore(), storage = firebase.storage(), fns = firebase.app().functions(CFG.region || 'us-central1');
  if (!CFG.emulator) fs.settings({ experimentalAutoDetectLongPolling: true, merge: true });   // same as the Hub pages (some church networks block streaming)
  if (CFG.emulator) {
    const p = CFG.ports;
    auth.useEmulator(`http://127.0.0.1:${p.auth}`, { disableWarnings: true });
    fs.useEmulator('127.0.0.1', p.firestore); fns.useEmulator('127.0.0.1', p.functions); storage.useEmulator('127.0.0.1', p.storage);
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const shortOf = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const META = ['version', 'updatedAt', 'updatedBy', 'what'];
  const strip = s => { const c = JSON.parse(JSON.stringify(s)); delete c.currentUser; META.forEach(k => delete c[k]); return c; };
  const WORKERS = ['owner', 'admin', 'bookkeeper', 'reviewer'];

  const Cloud = window.Cloud = { replaying: false };
  // Kept apart from everyday work: who gave what (donors + non-cash gifts) and salaries (staff)
  const PRIVATE_OF = { donors: 'donors', nonCash: 'donors', pledges: 'donors', staff: 'payroll' };   // who pledged what is private too
  let rawPriv = {}, rawWs = {}, rawExp = {}, orgId = null, me = null, hooks = null, lastSetup = '', lastWs = {}, lastExp = {}, chain = Promise.resolve(), pending = 0, problem = null, timer = null;

  /* ---------- the sign-in and loading screens ---------- */
  function gate(html) {
    let g = document.getElementById('cloudGate');
    if (!g) { g = document.createElement('div'); g.id = 'cloudGate'; document.body.appendChild(g); }
    g.innerHTML = `<div class="cg-card"><div class="cg-brand">Church Books</div>${html}</div>`;   // html is built with esc()
    return g;
  }
  const style = document.createElement('style');
  style.textContent = `#cloudGate{position:fixed;inset:0;z-index:200;background:var(--bg,#f6f1e7);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif}
    .cg-card{background:#fff;border:1px solid var(--line,#e6dfd2);border-radius:16px;padding:28px;width:100%;max-width:400px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
    .cg-brand{font-family:'Playfair Display',Georgia,serif;font-size:26px;margin-bottom:6px}.cg-card p{color:#6b6559;font-size:14px;margin:0 0 16px;line-height:1.5}
    .cg-card input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #ddd5c6;border-radius:10px;font:inherit;margin-bottom:10px}
    .cg-card button{width:100%;padding:11px;border-radius:10px;border:1px solid #ddd5c6;background:#fff;font:inherit;font-weight:600;cursor:pointer;margin-bottom:8px}
    .cg-card button.pri{background:var(--blue,#2557b8);color:#fff;border-color:transparent}.cg-err{color:#b3261e;font-size:13.5px;margin-top:6px;white-space:pre-line}
    .cg-or{text-align:center;color:#9b9384;font-size:12px;margin:8px 0}.cg-dev{font-size:12px;color:#9b9384;margin-top:12px}
    #cloudChip{position:fixed;left:12px;bottom:12px;z-index:150;background:#fff;border:1px solid var(--line,#e6dfd2);border-radius:999px;padding:6px 12px;font:600 12.5px Inter,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.08);display:flex;gap:8px;align-items:center;max-width:calc(100vw - 24px)}
    #cloudChip.err{background:#fdecea;color:#8c1d18;border-color:#f3b8b2}#cloudChip button{border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;padding:0}`;
  document.head.appendChild(style);

  function signInScreen(err) {
    const g = gate(`<p>Sign in to see your church's books.</p>
      ${CFG.emulator ? '' : '<button class="pri" id="cgGoogle">Sign in with Google</button><div class="cg-or">or</div>'}
      <input id="cgEmail" type="email" placeholder="Email" autocomplete="username"><input id="cgPass" type="password" placeholder="Password" autocomplete="current-password">
      <button class="${CFG.emulator ? 'pri' : ''}" id="cgGo">Sign in</button><div class="cg-err">${esc(err || '')}</div>
      ${CFG.emulator ? '<div class="cg-dev">Local test mode — using the Firebase emulators on this computer. Nothing here is saved online.</div>' : ''}`);
    const go = () => auth.signInWithEmailAndPassword(g.querySelector('#cgEmail').value.trim(), g.querySelector('#cgPass').value)
      .catch(e => signInScreen(/invalid-credential|wrong-password|user-not-found/.test(e.code) ? "That email and password don't match." : e.message));
    g.querySelector('#cgGo').onclick = go; g.querySelector('#cgPass').onkeydown = e => { if (e.key === 'Enter') go(); };
    const gb = g.querySelector('#cgGoogle'); if (gb) gb.onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => signInScreen(e.message));
  }
  function stop(msg) { const g = gate(`<div class="cg-err" style="margin-bottom:12px">${esc(msg)}</div><button id="cgOut">Sign out</button>`); g.querySelector('#cgOut').onclick = () => auth.signOut(); }
  const call = (name, data) => fns.httpsCallable(name)({ orgId, ...data }).then(r => r.data);

  // Waits for sign-in, picks the church, loads it. Resolves when the app can start.
  Cloud.start = () => new Promise(resolve => {
    let started = false;
    auth.onAuthStateChanged(async user => {
      if (started) { if (!user) location.reload(); return; }
      if (!user) { signInScreen(); return; }
      gate('<p>Opening your books…</p>');
      try {
        const j = await fns.httpsCallable('booksJoinOrgs')({}).then(r => r.data), ids = Object.keys(j.orgs || {});
        if (!ids.length) { if (j.canCreate) startChurch(user); else stop(`${user.email} hasn't been invited to a church's books yet. Ask your church's admin to invite this email address.`); return; }
        const want = new URLSearchParams(location.search).get('org');
        orgId = ids.includes(want) ? want : ids.length === 1 ? ids[0] : null;
        if (!orgId) {
          const g = gate(`<p>Which church?</p>${ids.map(id => `<button data-org="${esc(id)}">${esc(id)}</button>`).join('')}`);
          g.querySelectorAll('[data-org]').forEach(b => { b.onclick = () => { const u = new URL(location.href); u.searchParams.set('org', b.dataset.org); location.href = u; }; });
          return;
        }
        if (await load(user)) { started = true; resolve(); }
      } catch (e) { stop(e.message); }
    });
  });

  async function load(user) {
    const org = fs.doc(`orgs/${orgId}`);
    const m = await org.collection('members').doc(user.uid).get(); me = { uid: user.uid, ...m.data() };
    if (me.untilMs && Date.now() > me.untilMs) throw new Error(`Your access ended on ${new Date(me.untilMs).toLocaleDateString()}.`);
    if (me.role === 'leader') { leaderScreen(); return false; }
    if (me.role === 'counter') { counterScreen(); return false; }
    if (!['owner', 'admin', 'bookkeeper', 'reviewer', 'viewer'].includes(me.role)) throw new Error('Your role only sends receipts. The receipt page for phones is coming soon.');
    const [setupSnap, stateSnap, entriesSnap, wsSnap, expSnap] = await Promise.all([org.collection('settings').doc('setup').get(), org.collection('ledger').doc('state').get(),
      org.collection('entries').orderBy('seq').get(), org.collection('workspace').get(), org.collection('expenses').get()]);
    if (!setupSnap.exists) throw new Error('This church has no setup yet.');
    const setup = setupSnap.data(), state = stateSnap.exists ? stateSnap.data() : { seq: 0, lockedThrough: null };
    if (!me.personId || !(setup.people || {})[me.personId]) throw new Error(`Your sign-in isn't linked to anyone in ${setup.shortName}'s people list yet. Ask the admin to fix your invite.`);
    if (!state.seq && !wsSnap.size && !(await emptyBooks(setup))) return false;   // bringing books in reloads the page
    const ws = {}; wsSnap.forEach(d => { rawWs[d.id] = d.data().json; ws[d.id] = JSON.parse(rawWs[d.id]); });
    // Private information, only if this person may see it (otherwise those pages are simply empty for them)
    for (const kind of ['donors', 'payroll']) { if (!canPrivate(kind)) continue;
      try { const d = await org.collection('private').doc(kind).get(); if (!d.exists) continue; rawPriv[kind] = d.data().json; const v = JSON.parse(rawPriv[kind]);
        if (kind === 'donors') { ws.donors = v.donors || []; ws.nonCash = v.nonCash || []; ws.pledges = v.pledges || []; } else ws.staff = v.staff || []; } catch (e) { /* not allowed */ } }
    let alerts = [];
    if (['owner', 'admin'].includes(me.role)) { try { (await org.collection('alerts').orderBy('at', 'desc').limit(20).get()).forEach(d => alerts.push({ id: d.id, ...d.data() })); } catch (e) { /* none */ } }
    const expenses = []; expSnap.forEach(d => { const x = JSON.parse(d.data().json); rawExp[x.id] = d.data().json; expenses.push(x); });
    const t = new Date(), next15 = new Date(t.getFullYear(), t.getMonth() + (t.getDate() > 15 ? 1 : 0), 15), yest = new Date(t.getTime() - 86400000);
    const { app, ...sample } = ws;
    window.CHURCH_SETUP = { ...strip(setup), currentUser: me.personId };
    window.CHURCH_SAMPLE = { payouts: [], cash: [], subscriptions: [], inbox: [], bankLines: [], staff: [], checks: [], vendors: [], bills: [], schedules: [], requests: [], nonCash: [], donors: [], pledges: [], pledgeCampaigns: [], rentals: [], partners: [], pushes: [], assets: [],
      registrations: { events: [], payouts: [], refunds: [] }, commitments: {}, statementThrough: shortOf(yest),
      payrollSchedule: { frequency: 'Monthly', next: shortOf(next15), approveBy: shortOf(new Date(next15.getTime() - 2 * 86400000)) },
      ...sample, expenses: expenses.sort((a, b) => (a._order || 0) - (b._order || 0)), today: localToday() };
    window.CLOUD = { orgId, role: me.role, uid: me.uid, access: me.access || [], untilMs: me.untilMs || null, alerts, entries: entriesSnap.docs.map(d => d.data()), state, app: app || null };
    document.getElementById('cloudGate').remove();
    return true;
  }
  // A church with nothing in it yet: the owner brings in an export, or starts fresh.
  function emptyBooks(setup) {
    return new Promise(resolve => {
      const owner = me.role === 'owner';
      const g = gate(`<p><b>${esc(setup.name)}</b>'s books are empty.</p>${owner ? `<p>Bring in an export from Church Books (Settings → History &amp; export → “Export everything”), or start with just the setup.</p>
        <input type="file" id="cgFile" accept=".json,application/json"><button class="pri" id="cgImport">Bring in the file</button><button id="cgEmpty">Start with empty books</button><div class="cg-err" id="cgErr"></div>`
        : '<p>The owner needs to bring the books in first.</p><button id="cgEmpty">Look around anyway</button>'}`);
      g.querySelector('#cgEmpty').onclick = () => resolve(true);
      const imp = g.querySelector('#cgImport');
      if (imp) imp.onclick = async () => {
        const f = g.querySelector('#cgFile').files[0], errBox = g.querySelector('#cgErr');
        if (!f) { errBox.textContent = 'Pick the export file first.'; return; }
        imp.disabled = true; imp.textContent = 'Checking every entry…';
        try {
          const data = JSON.parse(await f.text()); if (data.format !== 'church-books-export') throw new Error('That file is not a Church Books export.');
          const r = await Cloud.importBooks(data); imp.textContent = `Brought in ${r.entries} entries`; setTimeout(() => location.reload(), 600); resolve(false);
        } catch (e) { errBox.textContent = e.message; imp.disabled = false; imp.textContent = 'Bring in the file'; }
      };
    });
  }
  Cloud.importBooks = data => call('booksImport', { data });
  const canPrivate = kind => me && (me.role === 'owner' || (me.access || []).includes(kind));
  Cloud.canPrivate = canPrivate;
  // Books administrators only: start a church from an "Export everything" file (its setup, and its books if it has any).
  function startChurch(user) {
    const g = gate(`<p>Start a church's books. Use an export from Church Books (Settings → History &amp; export → “Export everything”).</p>
      <input type="file" id="scFile" accept=".json,application/json"><input id="scId" placeholder="Church id, e.g. rcc"><select id="scMe" style="width:100%;padding:11px;border:1px solid #ddd5c6;border-radius:10px;margin-bottom:10px;font:inherit"><option value="">Who you are — pick the file first</option></select>
      <label style="display:flex;gap:8px;font-size:13.5px;color:#6b6559;margin-bottom:12px"><input type="checkbox" id="scBooks" checked style="width:auto;margin:0"> Bring in the entries and everyday work too (uncheck for just the setup)</label>
      <button class="pri" id="scGo">Start</button><button id="cgOut">Sign out</button><div class="cg-err" id="scErr"></div>`);
    let data = null; const err = g.querySelector('#scErr');
    g.querySelector('#cgOut').onclick = () => auth.signOut();
    g.querySelector('#scFile').onchange = async e => {
      try { data = JSON.parse(await e.target.files[0].text()); if (data.format !== 'church-books-export') throw new Error('That file is not a Church Books export.'); err.textContent = '';
        const people = Object.entries(data.setup.people || {}).filter(([, p]) => !p.group);
        g.querySelector('#scMe').innerHTML = people.map(([id, p]) => `<option value="${esc(id)}" ${String(p.email || '').toLowerCase() === String(user.email).toLowerCase() ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
        if (!g.querySelector('#scId').value) g.querySelector('#scId').value = String(data.setup.id || '').replace(/[^a-z0-9-]/g, '');
      } catch (x) { data = null; err.textContent = x.message; }
    };
    g.querySelector('#scGo').onclick = async () => {
      if (!data) { err.textContent = 'Pick the export file first.'; return; }
      const id = g.querySelector('#scId').value.trim(), btn = g.querySelector('#scGo'); btn.disabled = true; btn.textContent = 'Starting…';
      try {
        orgId = id; await call('booksCreateOrg', { setup: data.setup, personId: g.querySelector('#scMe').value });
        if (g.querySelector('#scBooks').checked && data.entries.length) { btn.textContent = 'Checking every entry…'; await call('booksImport', { data }); }
        const u = new URL(location.href); u.searchParams.set('org', id); location.href = u;
      } catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Start'; }
    };
  }
  Cloud.invite = (email, role, personId, more = {}) => call('booksInviteMember', { email, role, personId, ...more });

  /* ---------- while the app runs ---------- */
  function chip() {
    let c = document.getElementById('cloudChip');
    if (!c) { c = document.createElement('div'); c.id = 'cloudChip'; document.body.appendChild(c); }
    c.className = problem ? 'err' : '';
    c.innerHTML = problem ? `⚠ ${esc(problem)} <button id="cloudReload">Reload</button>`
      : `${pending ? '☁ Saving…' : '☁ Saved'} · ${esc(me.name || me.email || '')} (${esc(me.role)}${me.role === 'viewer' ? ' · view only' : ''})${me.untilMs ? ` · access until ${new Date(me.untilMs).toLocaleDateString()}` : ''}${CFG.emulator ? ' · test mode' : ''} <button id="cloudOut">Sign out</button>`;
    const o = c.querySelector('#cloudOut'); if (o) o.onclick = () => auth.signOut();
    const r = c.querySelector('#cloudReload'); if (r) r.onclick = () => location.reload();
  }
  function fail(err, what) {
    problem = `Not saved${what ? ` (${what})` : ''}: ${(err && err.message) || err}`; chip();
    console.error('Church Books cloud:', what, err);
  }
  function track(p, what) { pending++; chip(); return p.catch(e => fail(e, what)).finally(() => { pending--; chip(); }); }
  // Ledger changes go to the server one at a time, in order, after any setup change they depend on.
  Cloud.call = (name, data, what) => {
    if (name === 'booksPostEntry' && Cloud.approvalRef) data = { ...data, approval: Cloud.approvalRef };   // the approval this posting relies on
    chain = track(chain.then(flushSetup).then(() => call(name, data)).then(r => {
      if (r && r.inSync === false) problem = 'Someone else saved at the same moment — reload to see their change';
      return r;
    }), what || name);
    return chain;
  };
  async function flushSetup() {
    const s = JSON.stringify(strip(hooks.setup()));
    if (s === lastSetup) return;
    await call('booksUpdateSetup', { setup: JSON.parse(s), what: hooks.lastChange() }); lastSetup = s;
  }
  // Called after every render: saves whatever changed, a moment later.
  Cloud.changed = () => { clearTimeout(timer); timer = setTimeout(save, 700); };
  function save() {
    if (!hooks || !WORKERS.includes(me.role)) return;
    if (JSON.stringify(strip(hooks.setup())) !== lastSetup) chain = track(chain.then(flushSetup), 'settings');
    const org = fs.doc(`orgs/${orgId}`), by = me.name || me.email, at = new Date().toISOString(), jobs = [];
    const wsAll = hooks.workspace();
    const priv = { donors: JSON.stringify({ donors: wsAll.donors || [], nonCash: wsAll.nonCash || [], pledges: wsAll.pledges || [] }), payroll: JSON.stringify({ staff: wsAll.staff || [] }) };
    Object.entries(priv).forEach(([kind, j]) => { if (!canPrivate(kind) || j === rawPriv[kind]) return;
      if (kind === 'donors' && rawPriv.donors == null && !(wsAll.donors || []).length && !(wsAll.nonCash || []).length && !(wsAll.pledges || []).length) return;
      if (kind === 'payroll' && rawPriv.payroll == null && !(wsAll.staff || []).length) return;
      jobs.push(org.collection('private').doc(kind).set({ json: j, updatedAt: at, updatedBy: by }).then(() => { rawPriv[kind] = j; })); });
    Object.entries(wsAll).forEach(([k, v]) => {
      if (PRIVATE_OF[k]) return;   // saved above, apart from everything else
      const j = JSON.stringify(v === undefined ? null : v);
      if (j === lastWs[k]) return;
      if (j.length > 880000) { fail(new Error(`${k} is too big to save in one piece`), k); return; }
      jobs.push(org.collection('workspace').doc(k).set({ json: j, updatedAt: at, updatedBy: by }).then(() => { lastWs[k] = j; }));
    });
    hooks.expenses().forEach((x, i) => {
      if (!x.id) return; const j = JSON.stringify({ ...x, _order: i });
      if (j !== lastExp[x.id]) jobs.push(org.collection('expenses').doc(x.id).set({ json: j, status: x.status || 'Needs receipt', senderUid: x.senderUid || null }).then(() => { lastExp[x.id] = j; }));
    });
    if (jobs.length) track(Promise.all(jobs), 'everyday work');
  }
  // The app hands over how to read its state; whatever it has now is the saved starting point.
  Cloud.attach = h => {
    hooks = h; lastSetup = JSON.stringify(strip(h.setup()));
    lastWs = { ...rawWs }; lastExp = { ...rawExp };   // what's in the cloud now; anything the app changed while starting up is saved next
    chip(); Cloud.changed();
  };
  // Files: the bytes go to orgs/{org}/files/{fileId}/{name}; the file list is saved with the everyday work.
  const TYPE = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp', gif: 'image/gif', csv: 'text/csv', txt: 'text/plain', eml: 'message/rfc822',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword' };
  Cloud.upload = (fileId, file) => {
    const name = file.name.replace(/[^\w.\- ]/g, '_'), path = `orgs/${orgId}/files/${fileId}/${name}`, ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    track(storage.ref(path).put(file, { contentType: file.type || TYPE[ext] || 'application/octet-stream' }), `uploading ${file.name}`);
    return path;
  };
  Cloud.url = path => storage.ref(path).getDownloadURL();
  // A count the second counter confirmed is booked by the server; the app takes the same entry in
  Cloud.confirmCount = (countId, cash, checks) => Cloud.call('booksConfirmCount', { countId, cash, checks }, 'confirming the count').then(r => { if (r && r.entry && hooks && hooks.adopt) hooks.adopt(r.entry); return r; });

  /* ---------- Ministry leaders: their own budgets' reports, built by the server ---------- */
  function leaderScreen() {
    const g = gate(`<p>Your ministry ${me.budgets.length > 1 ? 'budgets' : 'budget'}</p>${me.budgets.map(b => `<button data-lb="${esc(b)}">${esc(b)}</button>`).join('')}<div id="lbOut"></div><button id="cgOut">Sign out</button>`);
    g.querySelector('.cg-card').style.maxWidth = '640px';
    g.querySelector('#cgOut').onclick = () => auth.signOut();
    const money = n => (n < 0 ? '−' : '') + '$' + (Math.abs(n) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    g.querySelectorAll('[data-lb]').forEach(b => { b.onclick = async () => { const out = g.querySelector('#lbOut'); out.innerHTML = '<p>Adding it up…</p>';
      try { const r = await call('booksLeaderReport', { budget: b.dataset.lb }), x = r.report;
        out.innerHTML = `<h3 style="margin:14px 0 4px">${esc(r.budget)}</h3><p>Budget ${money(r.amount)} · spent ${money(x.spent)} · came in ${money(x.income)} · <b>left ${money(r.amount - x.spent)}</b></p>
          <table style="width:100%;font-size:13.5px;border-collapse:collapse">${x.byCategory.map(c => `<tr><td style="padding:3px 0">${esc(c.key)}</td><td style="text-align:right">${money(c.amount)}</td></tr>`).join('')}</table>
          <h4 style="margin:12px 0 4px">Every charge</h4><table style="width:100%;font-size:12.5px;border-collapse:collapse">${x.lines.slice(0, 80).map(l => `<tr><td style="padding:2px 0">${esc(l.date)}</td><td>${esc(l.party || l.memo)}</td><td>${esc(l.name)}</td><td style="text-align:right">${l.type === 'income' && l.amount > 0 ? '+' : ''}${money(l.amount)}</td></tr>`).join('')}</table>`;
      } catch (e) { out.innerHTML = `<div class="cg-err">${esc(e.message)}</div>`; } }; });
  }
  /* ---------- Counters: count the offering; a second person confirms; the server books it ---------- */
  async function counterScreen() {
    const org = fs.doc(`orgs/${orgId}`), setup = (await org.collection('settings').doc('setup').get()).data(), giving = setup.giving || [];
    const draw = async msg => {
      let waiting = []; try { (await org.collection('counts').where('status', '==', 'waiting').get()).forEach(d => waiting.push({ id: d.id, ...d.data() })); } catch (e) { /* none */ }
      const g = gate(`<p>Count the offering. A second counter confirms it with their own sign-in before it's recorded.</p>
        <input id="ctD" type="date" value="${localToday()}"><input id="ctC" type="number" step=".01" placeholder="Cash counted"><input id="ctK" type="number" step=".01" placeholder="Checks counted">
        ${giving.map(gv => `<input data-ctg="${esc(gv.id)}" type="number" step=".01" placeholder="Given to ${esc(gv.name)}">`).join('')}
        <button class="pri" id="ctGo">Save my count</button><div class="cg-err">${esc(msg || '')}</div>
        ${waiting.length ? `<p style="margin-top:14px"><b>Waiting for a second counter</b></p>${waiting.map(w => `<button data-ctok="${esc(w.id)}" ${w.first.uid === me.uid ? 'disabled' : ''}>${esc(w.date)} · counted by ${esc(w.first.name)}${w.first.uid === me.uid ? ' (you — someone else confirms)' : ' — confirm'}</button>`).join('')}` : ''}
        <button id="cgOut">Sign out</button>`);
      g.querySelector('#cgOut').onclick = () => auth.signOut();
      g.querySelector('#ctGo').onclick = async () => { const split = {}; g.querySelectorAll('[data-ctg]').forEach(i => { if (+i.value) split[i.dataset.ctg] = +i.value; });
        try { await call('booksStartCount', { date: g.querySelector('#ctD').value, cash: +g.querySelector('#ctC').value || 0, checks: +g.querySelector('#ctK').value || 0, split }); draw('Saved — now a second counter confirms it.'); } catch (e) { draw(e.message); } };
      g.querySelectorAll('[data-ctok]').forEach(b => { b.onclick = async () => { const cash = prompt('Cash you counted'), checks = prompt('Checks you counted'); if (cash == null || checks == null) return;
        try { await call('booksConfirmCount', { countId: b.dataset.ctok, cash: +cash, checks: +checks }); draw('Confirmed and recorded. Thank you!'); } catch (e) { draw(e.message); } }; });
    };
    draw();
  }
  Cloud.info = () => ({ orgId, role: me && me.role, pending, problem });
  Cloud.idle = () => chain.then(() => new Promise(r => { const t = setInterval(() => { if (!pending) { clearInterval(t); r(Cloud.info()); } }, 100); }));
})();
