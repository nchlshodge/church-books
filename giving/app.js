// Church Books — the congregation's giving page (mockup on sample data; no real payments).
// Loaded by giving/index.html after the church's setup.js and sample.js and the engine modules it uses.
// How it would really work, with Stripe Connect: docs/giving-site.md.
// Everything put into the page goes through esc() first.
/* ======================================================================
   Who the church is, and the sample data the page runs on
   ====================================================================== */
const SETUP = window.CHURCH_SETUP, SAMPLE = window.CHURCH_SAMPLE || {}, PL = window.BooksPledges, G = window.BooksGiving;
const TODAY = SAMPLE.today || new Date().toISOString().slice(0, 10), YEAR = +TODAY.slice(0, 4);
const SITE = SETUP.givingSite || {};                       // optional per-church settings for this page: { color, rates, amounts }
const RATES = SITE.rates || G.RATES;
const WAYS = SETUP.giving || [];
const way = id => WAYS.find(w => w.id === id) || WAYS[0];
const fundOf = id => (SETUP.funds || []).find(f => f.id === id) || {};
const wayAbout = w => fundOf(w.split[0] && w.split[0].to).about || '';
const DONORS = SAMPLE.donors || [], CAMPS = SAMPLE.pledgeCampaigns || [], PLEDGES = SAMPLE.pledges || [];
const ASSET = p => !p ? '' : /^(https?:|data:|\/)/.test(p) ? p : '../' + p;   // setup paths are relative to Accounting/
document.documentElement.style.setProperty('--brand', SITE.color || SETUP.brandColor || '#2557b8');
document.title = `Give · ${SETUP.shortName || SETUP.name}`;

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cents = d => Math.round(d * 100);
const money = c => (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const D = s => new Date(s + 'T12:00:00');
const day = s => D(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const longDay = s => D(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const shortDay = s => D(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
const rid = p => p + Math.random().toString(36).slice(2, 10);
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
const FREQ_OPTS = [['once', 'One time'], ['weekly', 'Weekly'], ['every2weeks', 'Every 2 weeks'], ['monthly', 'Monthly'], ['firstFifteenth', '1st & 15th']];
const freqWord = f => ({ weekly: 'every week', every2weeks: 'every 2 weeks', monthly: 'every month', firstFifteenth: 'on the 1st and 15th' })[f];
const shortName = () => SETUP.shortName || 'the church';

/* ======================================================================
   What this browser remembers (the demo's stand-in for the church's database)
   ====================================================================== */
const KEY = 'churchbooks-giving-' + window.CHURCH_ID;
const LAST4 = ['6789', '4410', '2087', '9031', '5522', '3176'];
function fresh() {
  // Each sample household already gives monthly on the 5th (their giving in sample.js), from a saved bank account
  const recurring = [], methods = [];
  DONORS.forEach((d, i) => {
    methods.push({ id: `pm-${d.id}`, donor: d.id, type: 'bank', label: 'Sample Community Bank', last4: LAST4[i % 6], stripe: `pm_demo_${d.id.slice(2)}` });
    Object.entries(d.monthly || {}).forEach(([g, amt]) => recurring.push({ id: `r-${d.id}-${g}`, donor: d.id, giving: g, amount: cents(amt), frequency: 'monthly',
      start: `${YEAR - 1}-01-05`, end: null, status: 'active', method: `pm-${d.id}`, coverFee: false, stripe: `sub_demo_${d.id.slice(2)}_${g}` }));
  });
  return { v: 1, user: null, gifts: [], recurring, methods, givers: [] };
}
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.v === 1 ? s : null; } catch (e) { return null; } }
let S = load() || fresh();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private window: the demo just won't remember */ } };

/* ======================================================================
   The giver: who they are, their gifts, their pledges
   ====================================================================== */
const me = () => S.user && (DONORS.find(d => d.id === S.user) || S.givers.find(g => g.id === S.user));
const byEmail = e => { e = (e || '').trim().toLowerCase(); return DONORS.find(d => (d.email || '').toLowerCase() === e) || S.givers.find(g => g.email.toLowerCase() === e); };
const firstName = p => p.name.split(/\s|&/)[0];
const myMethods = () => S.methods.filter(m => m.donor && m.donor === S.user);
const methodOf = id => S.methods.find(m => m.id === id);
const methodLabel = m => m ? `${m.label} ••${m.last4}` : '';
// Sample history: each household's monthly gifts on the 5th, from January last year to today
function sampleHistory(d) {
  const out = [];
  if (!d || !d.monthly) return out;
  for (const [g, amt] of Object.entries(d.monthly)) for (const dt of G.between({ frequency: 'monthly', start: `${YEAR - 1}-01-05` }, null, TODAY)) {
    const a = cents(amt);
    out.push({ id: `h-${d.id}-${g}-${dt}`, donor: d.id, date: dt, giving: g, amount: a, cover: 0, gross: a, fee: G.fee(a, 'bank', RATES), method: `pm-${d.id}`, status: 'paid', recurring: `r-${d.id}-${g}` });
  }
  return out;
}
// Their gifts: the history, what they gave here, and anything given as a guest with the same email
function myGifts() {
  const p = me(); if (!p) return [];
  const e = (p.email || '').toLowerCase();
  return [...sampleHistory(DONORS.find(d => d.id === p.id)), ...S.gifts.filter(g => g.donor === p.id || (!g.donor && (g.email || '').toLowerCase() === e))]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
const counts = g => g.status !== 'failed' && g.status !== 'refunded';
const campOf = id => CAMPS.find(c => c.id === id) || CAMPS[0];
const myPledges = () => PLEDGES.filter(p => p.donor && p.donor === S.user && p.status !== 'Cancelled');
// The same pledge math the books use (engine/pledges.js): gifts to the campaign's way to give count toward it
function pledgeFacts(pl) {
  const c = campOf(pl.campaign);
  const terms = { amount: cents(pl.amount), start: pl.start || c.start, end: pl.end || c.end, frequency: pl.frequency || 'monthly', givenBefore: cents(pl.givenBefore || 0) };
  const gifts = myGifts().filter(g => g.giving === c.giving && counts(g)).map(g => ({ date: g.date, amount: g.amount }));
  return { ...PL.progress(terms, gifts, TODAY), pl, c, terms };
}
const pledgeFor = givingId => myPledges().find(p => campOf(p.campaign).giving === givingId);
const perGift = f => ({ weekly: 'a week', monthly: 'a month', quarterly: 'a quarter', yearly: 'a year', once: '' })[f];
const perNoun = f => ({ weekly: 'weeks', quarterly: 'quarters', yearly: 'years' })[f] || 'months';
const recGross = r => { const m = methodOf(r.method); return G.charge({ amount: r.amount, method: m ? m.type : 'bank', coverFee: r.coverFee }, RATES).gross; };

/* ======================================================================
   Views
   ====================================================================== */
const app = document.getElementById('app');
let route = 'give', draft, signin = null, last = null, showAllGifts = false;
const newDraft = (o = {}) => ({ amount: '', giving: WAYS[0].id, freq: 'once', start: TODAY, endMode: 'never', end: '', method: 'bank', coverFee: false,
  name: me() ? me().name : '', email: me() ? me().email : '', tempBank: null, tempCard: null, ...o });
draft = newDraft();
const VIEWS = { give: viewGive, mine: viewMine, signin: viewSignin, done: viewDone };
const put = (el, html) => { el.innerHTML = html; };

function renderBar() {
  const logo = ASSET(SETUP.logo), on = r => route === r ? 'on' : '';
  put(document.getElementById('bar'), `<a class="brand" href="#give">${logo ? `<img src="${esc(logo)}" alt="${esc(SETUP.name)}">` : `<span class="mark">${esc((SETUP.shortName || SETUP.name).slice(0, 3))}</span>`}<b>${esc(SETUP.name)}</b></a>
    <nav class="tabs"><a href="#give" class="${on('give')}">Give</a>${me() ? `<a href="#mine" class="${on('mine')}">My giving</a>` : `<a href="#signin" class="${on('signin')}">Sign in</a>`}</nav>`);
  put(document.getElementById('foot'), `${esc(SETUP.name)}${SETUP.address ? ' · ' + esc(SETUP.address) : ''}<br>Gifts are tax-deductible as allowed by law. Payments processed by Stripe.
    <br>${me() ? `<button class="btn link small" data-act="signout">Sign out</button> · ` : ''}<button class="btn link small" data-act="reset">Reset demo</button>`);
}
function render() {
  route = (location.hash || '#give').slice(1) || 'give';
  if (!VIEWS[route]) route = 'give';
  if (route === 'mine' && !me()) { signin = signin || { step: 'email', email: '', returnTo: 'mine' }; route = 'signin'; }
  if (route === 'done' && !last) route = 'give';
  renderBar();
  put(app, VIEWS[route]());
  if (route === 'give') updateSum();
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
const go = r => { if (location.hash === '#' + r) render(); else location.hash = r; };

/* ---------- Give ---------- */
function viewGive() {
  const p = me(), d = draft, recurring = d.freq !== 'once', amounts = SITE.amounts || [25, 50, 100, 250, 500];
  const savedBank = myMethods().find(m => m.type === 'bank'), savedCard = myMethods().find(m => m.type === 'card');
  const pl = p && pledgeFor(d.giving);
  return `<div class="narrow">
    <h1>${p ? `Thank you for giving, ${esc(firstName(p))}` : `Give to ${esc(SETUP.shortName || SETUP.name)}`}</h1>
    <p class="lead">${p ? 'Choose an amount and where it goes.' : 'Give once as a guest, or <a href="#signin">sign in with your email</a> to set up recurring gifts and see your giving.'}</p>
    <div class="card">
      <label class="label" for="amt">Amount</label>
      <div class="amount"><span>$</span><input id="amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(d.amount)}" data-in="amount"></div>
      <div class="chips">${amounts.map(a => `<button class="chip" data-act="amt" data-v="${esc(a)}">$${esc(a.toLocaleString())}</button>`).join('')}</div>

      <span class="label">Give to</span>
      <div class="ways" role="radiogroup" aria-label="Give to">${WAYS.map(w => `<button class="opt ${d.giving === w.id ? 'on' : ''}" role="radio" aria-checked="${d.giving === w.id}" data-act="way" data-v="${esc(w.id)}">
        <span class="dot" style="background:${esc(w.color || 'var(--brand)')}"></span><span><span class="t">${esc(w.name)}</span>${wayAbout(w) ? `<br><span class="s">${esc(wayAbout(w))}</span>` : ''}</span>${p && pledgeFor(w.id) ? '<span class="tag">Your pledge</span>' : ''}</button>`).join('')}</div>
      ${pl ? `<p class="small muted" style="margin-top:8px">Counts toward your ${esc(campOf(pl.campaign).name)} pledge.</p>` : ''}

      <span class="label">How often</span>
      <div class="seg" role="radiogroup" aria-label="How often">${FREQ_OPTS.map(([k, l]) => `<button class="${d.freq === k ? 'on' : ''}" role="radio" aria-checked="${d.freq === k}" data-act="freq" data-v="${k}">${l}</button>`).join('')}</div>
      ${recurring ? `<div class="row2" style="margin-top:12px">
          <div><label class="label" for="start" style="margin-top:0">First gift</label><input class="field" type="date" id="start" min="${TODAY}" value="${esc(d.start)}" data-ch="start"></div>
          <div><label class="label" for="endMode" style="margin-top:0">Ends</label><select class="field" id="endMode" data-ch="endMode"><option value="never" ${d.endMode === 'never' ? 'selected' : ''}>Until I stop it</option><option value="date" ${d.endMode === 'date' ? 'selected' : ''}>On a date</option></select></div></div>
        ${d.endMode === 'date' ? `<label class="label" for="end">Last gift on or before</label><input class="field" type="date" id="end" min="${esc(d.start)}" value="${esc(d.end)}" data-ch="end">` : ''}
        ${!p ? `<div class="note">Recurring gifts need a quick sign-in (we email you a code — no password) so you can pause or change them any time.</div>` : ''}` : ''}

      <span class="label">Pay with</span>
      <div class="pay" role="radiogroup" aria-label="Pay with">
        <button class="opt ${d.method === 'bank' ? 'on' : ''}" role="radio" aria-checked="${d.method === 'bank'}" data-act="method" data-v="bank"><span class="tag">Lowest fee</span><span class="t">Bank account</span><span class="s">${savedBank ? esc(methodLabel(savedBank)) : 'From checking or savings'}</span></button>
        <button class="opt ${d.method === 'card' ? 'on' : ''}" role="radio" aria-checked="${d.method === 'card'}" data-act="method" data-v="card"><span class="t">Card</span><span class="s">${savedCard ? esc(methodLabel(savedCard)) : 'Debit or credit'}</span></button>
      </div>
      <p class="small muted" style="margin-top:8px" id="feeHint"></p>
      ${payElement(savedBank, savedCard)}

      <label class="check"><input type="checkbox" data-ch="coverFee" ${d.coverFee ? 'checked' : ''}><span>Cover the processing fee <span class="muted" id="coverAmt"></span><br><span class="small muted">So ${esc(shortName())} receives your whole gift.</span></span></label>

      ${!p && !recurring ? `<span class="label">For your receipt</span>
        <div class="row2"><input class="field" placeholder="Your name" autocomplete="name" value="${esc(d.name)}" data-in="name" aria-label="Your name"><input class="field" type="email" placeholder="Email" autocomplete="email" value="${esc(d.email)}" data-in="email" aria-label="Email"></div>` : ''}

      <div class="sum" id="sum" aria-live="polite"></div>
      <div class="err" id="err" role="alert"></div>
      <button class="btn primary big" data-act="give" id="giveBtn">Give</button>
      <p class="fine">🔒 Card and bank details go straight to Stripe's secure fields and never touch ${esc(shortName())}'s servers.</p>
    </div></div>`;
}
// Stand-ins for Stripe's Payment Element (card) and Financial Connections (bank). Nothing is typed or sent anywhere.
function payElement(savedBank, savedCard) {
  const d = draft;
  if (d.method === 'bank') {
    if (savedBank) return `<div class="element"><div class="who">Saved bank</div>${esc(methodLabel(savedBank))} · verified</div>`;
    if (d.tempBank) return `<div class="element"><div class="who">Bank connected (demo)</div>${esc(d.tempBank.label)} ••${esc(d.tempBank.last4)} <button class="btn link small" data-act="bankPick" style="margin-left:6px">Change</button></div>`;
    return `<div class="element"><div class="who">Stripe · bank (demo)</div><p class="small muted" style="margin-bottom:8px">Sign in to your bank to connect it in a few seconds. The real page opens Stripe's secure bank sign-in.</p><button class="btn sm" data-act="bankPick">Connect your bank</button></div>`;
  }
  if (savedCard) return `<div class="element"><div class="who">Saved card</div>${esc(methodLabel(savedCard))}</div>`;
  if (d.tempCard) return `<div class="element"><div class="who">Card (demo)</div>${esc(d.tempCard.label)} ••${esc(d.tempCard.last4)} <button class="btn link small" data-act="cardClear" style="margin-left:6px">Change</button></div>`;
  return `<div class="element"><div class="who">Stripe · card (demo)</div><p class="small muted" style="margin-bottom:8px">Stripe's card field goes here, with Apple Pay and Google Pay. This demo doesn't take card numbers.</p><button class="btn sm" data-act="cardTest">Use a test card</button></div>`;
}
const parseAmt = s => { const n = parseFloat(String(s).replace(/[^0-9.]/g, '')); return isFinite(n) && n > 0 ? cents(n) : 0; };
function updateSum() {
  const el = document.getElementById('sum'); if (!el) return;
  const amt = parseAmt(draft.amount), w = way(draft.giving), btn = document.getElementById('giveBtn'), recurring = draft.freq !== 'once';
  const ca = document.getElementById('coverAmt'), hint = document.getElementById('feeHint');
  const base = amt || 10000, saves = G.fee(base, 'card', RATES) - G.fee(base, 'bank', RATES);
  hint.textContent = draft.method === 'card' ? `Giving by bank would save ${shortName()} ${money(saves)} on ${amt ? 'this gift' : 'every $100'}.` : `The bank fee is ${money(G.fee(base, 'bank', RATES))} on ${amt ? 'this gift' : 'every $100'} — ${money(saves)} less than a card.`;
  if (!amt) { el.textContent = 'Enter an amount to see your total.'; ca.textContent = ''; btn.textContent = recurring ? (me() ? 'Set up recurring gift' : 'Continue with email') : 'Give'; return; }
  const ch = G.charge({ amount: amt, method: draft.method, coverFee: draft.coverFee }, RATES), cov = G.cover(amt, draft.method, RATES);
  ca.textContent = `(+${money(cov.cover)})`;
  const first = recurring && G.next({ frequency: draft.freq, start: draft.start }, addDays(draft.start, -1)), dd = s => s.slice(0, 4) === String(YEAR) ? shortDay(s) : day(s);
  const when = !recurring ? 'today' : `${freqWord(draft.freq)}, starting ${first === TODAY ? 'today' : dd(first)}${draft.endMode === 'date' && draft.end ? ` until ${dd(draft.end)}` : ''}`;
  put(el, `You'll give <b class="num">${money(ch.gross)}</b> to <b>${esc(w.name)}</b> ${esc(when)}.<br>${esc(SETUP.shortName || 'The church')} receives <b class="num">${money(ch.net)}</b> after the ${money(ch.fee)} ${draft.method === 'bank' ? 'bank' : 'card'} fee.`
    + (recurring && draft.freq !== 'monthly' ? `<br><span class="small">That's about ${money(G.perMonth(ch.gross, draft.freq))} a month.</span>` : ''));
  btn.textContent = recurring ? (me() ? `Start ${money(ch.gross)} ${({ weekly: 'weekly', every2weeks: 'every-2-weeks', monthly: 'monthly', firstFifteenth: 'twice-monthly' })[draft.freq]} gift` : 'Continue with email') : `Give ${money(ch.gross)}`;
}
function payMethod() {
  const saved = myMethods().find(m => m.type === draft.method);
  if (saved) return saved;
  const t = draft.method === 'bank' ? draft.tempBank : draft.tempCard;
  const m = { id: rid('pm-'), donor: S.user || null, type: draft.method, label: t.label, last4: t.last4, stripe: rid('pm_demo_') };
  S.methods.push(m);              // signed in: saved to their Stripe customer so later gifts are one tap. Guest: kept only with this gift.
  return m;
}
function submitGive() {
  const err = document.getElementById('err'), amt = parseAmt(draft.amount), recurring = draft.freq !== 'once', p = me();
  const fail = m => { err.textContent = m; };
  if (!amt) return fail('Enter an amount.');
  if (amt < 100) return fail('The smallest gift online is $1.');
  if (amt > 10000000) return fail('For gifts over $100,000, please call the church office.');
  if (recurring && !p) { signin = { step: 'email', email: draft.email || '', returnTo: 'give' }; return go('signin'); }
  if (recurring && draft.start < TODAY) return fail('Choose a first gift date of today or later.');
  if (recurring && draft.endMode === 'date' && (!draft.end || draft.end < draft.start)) return fail('Choose an end date after the first gift.');
  if (!p && !draft.name.trim()) return fail('Add your name for the receipt.');
  if (!p && !validEmail(draft.email)) return fail('Add an email so we can send your receipt.');
  if (!myMethods().find(m => m.type === draft.method) && !(draft.method === 'bank' ? draft.tempBank : draft.tempCard))
    return fail(draft.method === 'bank' ? 'Connect your bank first.' : 'Add a card first.');
  const m = payMethod(), ch = G.charge({ amount: amt, method: draft.method, coverFee: draft.coverFee }, RATES);
  const gift = (extra = {}) => ({ id: rid('g-'), donor: p ? p.id : null, name: p ? p.name : draft.name.trim(), email: p ? p.email : draft.email.trim(), date: TODAY,
    giving: draft.giving, ...ch, method: m.id, methodLabel: methodLabel(m), type: m.type, status: m.type === 'bank' ? 'processing' : 'paid', stripe: rid('pi_demo_'), ...extra });
  if (!recurring) {
    const g = gift(); S.gifts.push(g); last = { gift: g };
  } else {
    const r = { id: rid('r-'), donor: p.id, giving: draft.giving, amount: amt, frequency: draft.freq, start: draft.start, end: draft.endMode === 'date' ? draft.end : null,
      status: 'active', method: m.id, coverFee: draft.coverFee, stripe: rid('sub_demo_'), created: TODAY };
    S.recurring.push(r);
    let g = null;
    if (G.next(r, addDays(TODAY, -1)) === TODAY) { g = gift({ recurring: r.id }); S.gifts.push(g); }   // the first gift is today
    last = { rec: r, gift: g };
  }
  save(); draft = newDraft({ giving: draft.giving, method: draft.method }); go('done');
}

/* ---------- Thank you ---------- */
function viewDone() {
  const p = me(), g = last.gift, r = last.rec, w = way((r || g).giving), who = p || g;
  const m = g ? null : methodOf(r.method);
  return `<div class="narrow"><div class="card done"><div class="ok" aria-hidden="true">✓</div>
    <h1>Thank you${who ? ', ' + esc(firstName(who)) : ''}!</h1>
    <p class="lead">${r ? `Your gift to ${esc(w.name)} is set up — ${esc(freqWord(r.frequency))}.` : `Your gift to ${esc(w.name)} is on its way.`}</p>
    <div class="facts">
      ${g ? `<span>${r ? 'Given today' : 'Amount'}</span><span class="num"><b>${money(g.gross)}</b>${g.cover ? ` <span class="muted">incl. ${money(g.cover)} fee</span>` : ''}</span>${r ? '' : `<span>Date</span><span>${longDay(g.date)}</span>`}` : ''}
      ${r ? `<span>Each gift</span><span class="num"><b>${money(recGross(r))}</b></span>
        <span>${g ? 'Next gift' : 'First gift'}</span><span>${longDay(G.next(r, g ? TODAY : addDays(TODAY, -1)) || r.start)}</span><span>Ends</span><span>${r.end ? longDay(r.end) : 'When you stop it'}</span>` : ''}
      <span>Paid with</span><span>${esc(g ? g.methodLabel : methodLabel(m))}</span>
      <span>Receipt</span><span>${g ? `Emailed to ${esc(g.email)}` : `Emailed after each gift`}</span>
    </div>
    ${g && g.status === 'processing' ? `<p class="small muted" style="margin-top:14px">Bank gifts take a few business days to finish. We'll email you if anything goes wrong.</p>` : ''}
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:22px">
      <a class="btn" href="#give">Give again</a>${p ? `<a class="btn primary" href="#mine">See my giving</a>` : `<button class="btn primary" data-act="guestAccount">Keep track of my giving</button>`}</div>
    ${!p ? `<p class="small muted" style="margin-top:14px">No password — we email you a code, and today's gift shows up in your history.</p>` : ''}
  </div></div>`;
}

/* ---------- Sign in ---------- */
function viewSignin() {
  const s = signin = signin || { step: 'email', email: '', returnTo: 'mine' };
  if (s.step === 'email') return `<div class="narrow"><div class="card">
    <h1>Sign in</h1><p class="lead">Enter your email and we'll send you a 6-digit code and a sign-in link. No password to remember.</p>
    <label class="label" for="em">Email</label><input class="field" id="em" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(s.email)}" data-sin="email">
    <div class="err" id="err" role="alert"></div>
    <button class="btn primary big" data-act="sendCode">Email me a code</button>
    <p class="fine">Just giving once? <a href="#give">Give as a guest</a> — no account needed.</p>
    ${DONORS.length ? `<div class="note"><b>Demo:</b> try a sample household — ${DONORS.slice(0, 4).map(d => `<button class="btn link small" data-act="demoEmail" data-v="${esc(d.email)}">${esc(d.name)}</button>`).join(', ')}</div>` : ''}
  </div></div>`;
  return `<div class="narrow"><div class="card">
    <h1>Check your email</h1><p class="lead">We sent a code to <b>${esc(s.email)}</b>. Enter it here, or tap the link in the email.</p>
    ${!s.known ? `<label class="label" for="nm">Your name</label><input class="field" id="nm" autocomplete="name" placeholder="First and last name" value="${esc(s.name || '')}" data-sin="name">
      <p class="small muted" style="margin-top:6px">There's no giving account for this email yet, so we'll start one.</p>` : ''}
    <label class="label" for="cd">Code</label><input class="field code" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" data-sin="code">
    <div class="err" id="err" role="alert"></div>
    <button class="btn primary big" data-act="verify">Sign in</button>
    <div class="note"><b>Demo email:</b> your code is <b class="num">${esc(s.code)}</b>. <button class="btn link small" data-act="magic">Or tap the sign-in link</button></div>
    <p class="fine"><button class="btn link small" data-act="sinBack">Use a different email</button> · The code works for 10 minutes.</p>
  </div></div>`;
}
function sendCode() {
  const e = (signin.email || '').trim();
  if (!validEmail(e)) { const er = document.getElementById('err'); if (er) er.textContent = 'Enter your email address.'; return; }
  const known = byEmail(e);
  signin = { ...signin, email: e, step: 'code', known: !!known, typed: '', code: String(Math.floor(100000 + Math.random() * 900000)) };
  render(); setTimeout(() => { const c = document.getElementById(known ? 'cd' : 'nm'); c && c.focus(); }, 30);
}
function verify(skipCode) {
  const err = document.getElementById('err');
  if (!skipCode && (signin.typed || '').trim() !== signin.code) { err.textContent = "That code doesn't match. Check the email and try again."; return; }
  let p = byEmail(signin.email);
  if (!p) {
    if (!(signin.name || '').trim()) { err.textContent = 'Add your name so your receipts are right.'; return; }
    p = { id: rid('gv-'), name: signin.name.trim(), email: signin.email }; S.givers.push(p);
  }
  S.user = p.id;
  // A bank or card they used as a guest with this email becomes theirs
  S.methods.forEach(m => { if (!m.donor && S.gifts.some(g => g.method === m.id && (g.email || '').toLowerCase() === p.email.toLowerCase())) m.donor = p.id; });
  const back = signin.returnTo || 'mine'; signin = null; save();
  draft.name = p.name; draft.email = p.email;
  toast(`Signed in as ${p.email}`);
  go(back);
}

/* ---------- My giving ---------- */
function viewMine() {
  const p = me(), year = myGifts().filter(g => g.date.slice(0, 4) === String(YEAR) && counts(g));
  const tot = G.yearTotals(year, YEAR), max = Math.max(1, ...Object.values(tot.byGiving));
  const recs = S.recurring.filter(r => r.donor === p.id && r.status !== 'cancelled').sort((a, b) => (a.status === 'paused') - (b.status === 'paused') || b.amount - a.amount);
  const ended = S.recurring.filter(r => r.donor === p.id && r.status === 'cancelled');
  const shown = showAllGifts ? year : year.slice(0, 8);
  const guestFound = S.gifts.filter(g => !g.donor && (g.email || '').toLowerCase() === p.email.toLowerCase()).length;
  return `<div class="hello"><div><h1>Hi, ${esc(p.name)}</h1><p class="muted">${esc(p.email)}</p></div><a class="btn primary" href="#give">Give</a></div>
  <div class="mine"><div class="stack">
    ${myPledges().map(pl => pledgeCard(pledgeFacts(pl))).join('')}
    <div class="card"><div class="card-head"><h2>Recurring gifts</h2><button class="btn link small" data-act="newRec">+ Add</button></div>
      ${recs.length ? recs.map(recCard).join('') : `<div class="empty">No recurring gifts yet.<br><button class="btn sm" data-act="newRec" style="margin-top:10px">Set one up</button></div>`}
      ${ended.length ? `<p class="small muted" style="margin-top:12px">Stopped: ${ended.map(r => `${money(r.amount)} to ${esc(way(r.giving).name)}`).join(' · ')}</p>` : ''}
    </div>
  </div><div class="stack">
    <div class="card"><div class="muted small">Given in ${YEAR}</div><div class="big-num num">${money(tot.total)}</div><div class="muted small">${tot.count} gift${tot.count === 1 ? '' : 's'}</div>
      <div class="bars">${Object.entries(tot.byGiving).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<div class="r"><span>${esc(way(g).name)}</span><span class="num">${money(n)}</span><i><b style="width:${n / max * 100}%;background:${esc(way(g).color || 'var(--brand)')}"></b></i></div>`).join('')}</div>
      ${guestFound ? `<p class="small muted" style="margin-top:10px">Includes ${guestFound} gift${guestFound === 1 ? '' : 's'} you gave as a guest with this email.</p>` : ''}
    </div>
    <div class="card"><div class="card-head"><h2>Statements</h2></div>
      <ul class="list">
        <li><div class="grow"><div class="t">${YEAR} so far</div><div class="s">Through ${shortDay(TODAY)} · the final one comes in January</div></div><button class="btn sm" data-act="stmt" data-v="${YEAR}">View</button></li>
        <li><div class="grow"><div class="t">${YEAR - 1} year-end statement</div><div class="s">For your taxes</div></div><button class="btn sm" data-act="stmt" data-v="${YEAR - 1}">Download</button></li>
      </ul></div>
    <div class="card"><div class="card-head"><h2>Gifts this year</h2></div>
      ${year.length ? `<ul class="list">${shown.map(giftRow).join('')}</ul>${year.length > shown.length ? `<button class="btn link small" data-act="allGifts" style="margin-top:8px">Show all ${year.length}</button>` : ''}` : `<div class="empty">No gifts yet this year.</div>`}
    </div>
    <div class="card"><div class="card-head"><h2>Payment methods</h2></div>
      ${myMethods().length ? `<ul class="list">${myMethods().map(m => `<li><div class="grow"><div class="t">${esc(methodLabel(m))}</div><div class="s">${m.type === 'bank' ? 'Bank account · lowest fee' : 'Card'}${S.recurring.some(r => r.method === m.id && r.status !== 'cancelled') ? ' · used by recurring gifts' : ''}</div></div></li>`).join('')}</ul>` : `<div class="empty">Saved when you give.</div>`}
    </div>
  </div></div>`;
}
// The same box the books show for a household's pledge (giverPledgeHTML in Accounting/index.html), plus one-tap giving
function pledgeCard(f) {
  const c = f.c, t = f.terms, rec = S.recurring.find(r => r.donor === S.user && r.giving === c.giving && r.status === 'active');
  const msg = f.status === 'done' ? `Your pledge is complete${f.extra ? ` — and you've given ${money(f.extra)} beyond it` : ''}. Thank you!`
    : t.frequency === 'once' ? `Your gift of ${money(f.left)} is due by ${longDay(t.end)}.`
    : `To finish by ${longDay(t.end)}: about <b class="num">${money(f.nextAmount)} ${perGift(t.frequency)}</b> for the ${f.giftsLeft} ${perNoun(t.frequency)} left.`;
  const oneTap = f.status === 'done' ? 0 : t.frequency === 'once' ? f.left : f.nextAmount, pct = Math.round(f.pct * 100);
  return `<div class="card giver-pledge" style="padding:18px">
    <div class="muted small">${esc(SETUP.name)} · ${esc(c.name)}</div><h3 style="margin:4px 0 12px">Your pledge</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">
      <div><div class="muted small">You pledged</div><div class="num pl-n">${money(f.amount)}</div></div>
      <div><div class="muted small">You've given</div><div class="num pl-n" style="color:var(--green)">${money(f.given)}</div></div>
      <div><div class="muted small">Left to give</div><div class="num pl-n">${money(f.left)}</div></div></div>
    <div style="height:12px;border-radius:8px;background:var(--line);overflow:hidden;margin:14px 0 8px" role="progressbar" aria-label="Pledge progress" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="display:block;height:100%;width:${pct}%;background:var(--green)"></i></div>
    <div class="muted small">${pct}% of your pledge · ${longDay(t.start)} – ${longDay(t.end)}</div>
    <p style="margin:12px 0 0">${msg}</p>
    ${rec ? `<p class="small muted" style="margin-top:6px">Your recurring ${money(recGross(rec))} ${esc(freqWord(rec.frequency))} counts toward it.</p>` : ''}
    ${oneTap ? `<div class="pledge-acts"><button class="btn primary" data-act="pledgeGive" data-v="${esc(f.pl.id)}">Give ${money(oneTap)} now</button>
      ${!rec && t.frequency !== 'once' ? `<button class="btn" data-act="pledgeRec" data-v="${esc(f.pl.id)}">Give it ${t.frequency === 'weekly' ? 'weekly' : 'monthly'}</button>` : ''}</div>` : ''}
  </div>`;
}
function recCard(r) {
  const w = way(r.giving), m = methodOf(r.method), nx = G.next(r, TODAY), paused = r.status === 'paused';
  return `<div class="rec ${paused ? 'paused' : ''}"><div class="top"><span class="amt num">${money(recGross(r))}</span>${paused ? '<span class="pill gold">Paused</span>' : nx ? `<span class="small muted">Next: ${shortDay(nx)}</span>` : '<span class="pill gray">Finished</span>'}</div>
    <div style="font-weight:600">${esc(w.name)}</div>
    <div class="small muted">${esc(G.LABEL[r.frequency])}${r.end ? ` until ${shortDay(r.end)}` : ''} · ${esc(methodLabel(m))}${r.coverFee ? ' · covers the fee' : ''}</div>
    <div class="acts"><button class="btn sm" data-act="${paused ? 'resume' : 'pause'}" data-v="${esc(r.id)}">${paused ? 'Resume' : 'Pause'}</button><button class="btn sm" data-act="editRec" data-v="${esc(r.id)}">Edit</button><button class="btn sm danger" data-act="cancelRec" data-v="${esc(r.id)}">Cancel</button></div></div>`;
}
function giftRow(g) {
  const w = way(g.giving);
  const st = g.status === 'processing' ? ' <span class="pill gold">Processing</span>' : '';
  return `<li><span class="dot" style="background:${esc(w.color || 'var(--brand)')}"></span>
    <div class="grow"><div class="t">${esc(w.name)}${st}</div><div class="s">${day(g.date)} · ${esc(g.methodLabel || methodLabel(methodOf(g.method)) || 'Bank')}${g.recurring ? ' · recurring' : ''}</div></div><span class="num" style="font-weight:600">${money(g.gross)}</span></li>`;
}

/* ---------- Sheets ---------- */
let veil = null;
function sheet(html, wide) {
  closeSheet();
  veil = document.createElement('div'); veil.className = 'veil';
  put(veil, `<div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`);
  veil.addEventListener('click', e => { if (e.target === veil) closeSheet(); });
  document.body.appendChild(veil);
  const f = veil.querySelector('input, select, button.primary'); f && f.focus();
}
function closeSheet() { if (veil) { veil.remove(); veil = null; } document.body.classList.remove('printing'); }
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }

const BANKS = ['Sample Community Bank', 'Chase', 'Bank of America', 'ESL Federal Credit Union', 'M&T Bank', 'Wells Fargo'];
function bankPicker() {
  sheet(`<h2>Connect your bank</h2><p class="lead">A demo of Stripe's bank sign-in. In real life you sign in on your bank's own page; ${esc(shortName())} never sees your login or account number.</p>
    <div class="ways">${BANKS.map((b, i) => `<button class="opt" data-act="bankChosen" data-v="${i}"><span class="t">${esc(b)}</span><span class="s" style="margin-left:auto">Checking ••${LAST4[(i + 2) % 6]}</span></button>`).join('')}</div>
    <div class="acts"><button class="btn" data-act="close">Cancel</button></div>`);
}
function editRec(r, title) {
  const isNew = !r || !r.id;
  r = r || { giving: WAYS[0].id, amount: 0, frequency: 'monthly', end: null, coverFee: false };
  const m = myMethods().find(x => x.type === 'bank') || myMethods()[0];
  sheet(`<h2>${esc(title || (isNew ? 'New recurring gift' : 'Change recurring gift'))}</h2>
    <label class="label" for="eAmt">Amount</label><div class="amount"><span>$</span><input id="eAmt" inputmode="decimal" value="${r.amount ? (r.amount / 100).toFixed(r.amount % 100 ? 2 : 0) : ''}" placeholder="0"></div>
    <label class="label" for="eWay">Give to</label><select class="field" id="eWay">${WAYS.map(w => `<option value="${esc(w.id)}" ${w.id === r.giving ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>
    <label class="label" for="eFreq">How often</label><select class="field" id="eFreq">${G.FREQUENCIES.map(f => `<option value="${f}" ${f === r.frequency ? 'selected' : ''}>${esc(G.LABEL[f])}</option>`).join('')}</select>
    <label class="label" for="eEnd">Ends</label><input class="field" type="date" id="eEnd" min="${addDays(TODAY, 1)}" value="${esc(r.end || '')}"><p class="small muted" style="margin-top:4px">Leave empty to keep giving until you stop it.</p>
    <label class="check"><input type="checkbox" id="eCover" ${r.coverFee ? 'checked' : ''}><span>Cover the processing fee</span></label>
    ${isNew ? `<p class="small muted" style="margin-top:10px">${m ? `Starts tomorrow, from ${esc(methodLabel(m))}.` : 'Next, choose how to pay.'}</p>` : ''}
    <div class="err" id="eErr" role="alert"></div>
    <div class="acts"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="saveRec" data-v="${isNew ? '' : esc(r.id)}">${isNew ? (m ? 'Start gift' : 'Next') : 'Save changes'}</button></div>`);
}
function saveRec(id) {
  const amt = parseAmt(document.getElementById('eAmt').value), giving = document.getElementById('eWay').value, freq = document.getElementById('eFreq').value;
  const end = document.getElementById('eEnd').value || null, coverFee = document.getElementById('eCover').checked, err = document.getElementById('eErr');
  if (amt < 100) { err.textContent = 'Enter an amount of at least $1.'; return; }
  if (end && end <= TODAY) { err.textContent = 'Choose an end date after today.'; return; }
  if (!id) {
    const m = myMethods().find(x => x.type === 'bank') || myMethods()[0];
    if (!m) { closeSheet(); draft = newDraft({ amount: String(amt / 100), giving, freq, start: addDays(TODAY, 1), endMode: end ? 'date' : 'never', end: end || '', coverFee }); return go('give'); }
    S.recurring.push({ id: rid('r-'), donor: S.user, giving, amount: amt, frequency: freq, start: addDays(TODAY, 1), end, status: 'active', method: m.id, coverFee, stripe: rid('sub_demo_'), created: TODAY });
    toast('Recurring gift started');
  } else {
    const r = S.recurring.find(x => x.id === id);
    if (freq !== r.frequency) r.start = G.next(r, TODAY) || addDays(TODAY, 1);   // a new rhythm starts from the next gift date
    Object.assign(r, { amount: amt, giving, frequency: freq, end, coverFee });
    toast('Saved — the change starts with the next gift');
  }
  save(); closeSheet(); render();
}
function statement(year) {
  const p = me(), gifts = myGifts().filter(g => g.date.slice(0, 4) === String(year) && counts(g)).sort((a, b) => a.date.localeCompare(b.date));
  const t = G.yearTotals(gifts, year), pls = myPledges().map(pledgeFacts), final = year < YEAR;
  sheet(`<div class="stmt">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
      <div>${ASSET(SETUP.logo) ? `<img src="${esc(ASSET(SETUP.logo))}" alt="" style="height:40px;margin-bottom:6px">` : ''}<div style="font-weight:700">${esc(SETUP.name)}</div><div class="small muted">${esc(SETUP.address || '')}</div></div>
      <div><h2>${year} giving statement</h2><div class="small muted">${final ? `January 1 – December 31, ${year}` : `January 1 – ${longDay(TODAY)} (so far)`}</div></div></div>
    <div style="margin:18px 0 6px"><b>${esc(p.name)}</b><br><span class="small muted">${esc(p.address || p.email)}</span></div>
    <table><thead><tr><th>Given to</th><th class="r">Total</th></tr></thead><tbody>${Object.entries(t.byGiving).map(([g, n]) => `<tr><td>${esc(way(g).name)}</td><td class="r num">${money(n)}</td></tr>`).join('')}
      <tr><td><b>Total gifts</b></td><td class="r num"><b>${money(t.total)}</b></td></tr></tbody></table>
    <table><thead><tr><th>Date</th><th>Given to</th><th class="r">Amount</th></tr></thead><tbody>${gifts.map(g => `<tr><td>${day(g.date)}</td><td>${esc(way(g.giving).name)}</td><td class="r num">${money(g.gross)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No gifts</td></tr>'}</tbody></table>
    ${pls.length ? `<p class="small" style="margin-top:12px">${pls.map(f => `${esc(f.c.name)} pledge: ${money(f.amount)} pledged, ${money(f.given)} given, ${money(f.left)} left.`).join('<br>')}</p>` : ''}
    <p class="small muted" style="margin-top:14px">No goods or services were provided in exchange for these contributions, other than intangible religious benefits. Please keep this statement for your tax records.</p>
    <div class="acts"><button class="btn" data-act="close">Close</button><button class="btn primary" data-act="print">Save as PDF</button></div></div>`, true);
}

/* ======================================================================
   Taps and typing
   ====================================================================== */
const findRec = id => S.recurring.find(r => r.id === id);
const pledgeAmt = f => f.terms.frequency === 'once' ? f.left : f.nextAmount;
const A = {
  amt: v => { draft.amount = v; document.getElementById('amt').value = v; document.getElementById('err').textContent = ''; updateSum(); },
  way: v => { draft.giving = v; render(); },
  freq: v => { draft.freq = v; render(); },
  method: v => { draft.method = v; render(); },
  bankPick: bankPicker,
  bankChosen: v => { draft.tempBank = { label: BANKS[+v], last4: LAST4[(+v + 2) % 6] }; closeSheet(); render(); },
  cardTest: () => { draft.tempCard = { label: 'Visa (test)', last4: '4242' }; render(); },
  cardClear: () => { draft.tempCard = null; render(); },
  give: submitGive,
  guestAccount: () => { signin = { step: 'email', email: last && last.gift ? last.gift.email : '', returnTo: 'mine' }; go('signin'); if (signin.email) sendCode(); },
  sendCode, verify: () => verify(false), magic: () => verify(true),
  sinBack: () => { signin.step = 'email'; render(); },
  demoEmail: v => { signin.email = v; sendCode(); },
  signout: () => { S.user = null; save(); draft = newDraft(); showAllGifts = false; toast('Signed out'); go('give'); },
  reset: () => { try { localStorage.removeItem(KEY); } catch (x) { /* nothing saved */ } S = fresh(); draft = newDraft(); last = null; toast('Demo reset'); go('give'); },
  pause: v => { findRec(v).status = 'paused'; save(); closeSheet(); render(); toast('Paused — nothing is taken until you resume'); },
  resume: v => { const r = findRec(v); r.status = 'active'; save(); render(); toast(G.next(r, TODAY) ? `Resumed — next gift ${shortDay(G.next(r, TODAY))}` : 'Resumed'); },
  editRec: v => editRec(findRec(v)), newRec: () => editRec(null), saveRec: v => saveRec(v),
  cancelRec: v => { const r = findRec(v); sheet(`<h2>Stop this recurring gift?</h2><p class="lead">${money(recGross(r))} to ${esc(way(r.giving).name)}, ${esc(freqWord(r.frequency))}. Gifts you've already given stay in your history. If it's just for a while, you can pause it instead.</p>
    <div class="acts"><button class="btn" data-act="close">Keep it</button><button class="btn" data-act="pause" data-v="${esc(r.id)}">Pause instead</button><button class="btn primary" data-act="cancelYes" data-v="${esc(r.id)}" style="background:var(--red);border-color:var(--red)">Stop gift</button></div>`); },
  cancelYes: v => { findRec(v).status = 'cancelled'; save(); closeSheet(); render(); toast('Recurring gift stopped'); },
  allGifts: () => { showAllGifts = true; render(); },
  stmt: v => statement(+v),
  print: () => { document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); },
  close: closeSheet,
  pledgeGive: v => {
    const f = pledgeFacts(PLEDGES.find(p => p.id === v)), amt = pledgeAmt(f), m = myMethods().find(x => x.type === 'bank') || myMethods()[0];
    if (!m) { draft = newDraft({ amount: String(amt / 100), giving: f.c.giving }); return go('give'); }
    sheet(`<h2>Give ${money(amt)} toward your pledge?</h2><p class="lead">To ${esc(way(f.c.giving).name)}, from ${esc(methodLabel(m))}. ${esc(SETUP.shortName || 'The church')} receives ${money(amt - G.fee(amt, m.type, RATES))} after the fee.</p>
      <div class="acts"><button class="btn" data-act="close">Not now</button><button class="btn primary" data-act="pledgeYes" data-v="${esc(v)}">Give ${money(amt)}</button></div>`);
  },
  pledgeYes: v => {
    const f = pledgeFacts(PLEDGES.find(p => p.id === v)), amt = pledgeAmt(f), m = myMethods().find(x => x.type === 'bank') || myMethods()[0], p = me();
    S.gifts.push({ id: rid('g-'), donor: p.id, name: p.name, email: p.email, date: TODAY, giving: f.c.giving, ...G.charge({ amount: amt, method: m.type }, RATES),
      method: m.id, methodLabel: methodLabel(m), type: m.type, status: m.type === 'bank' ? 'processing' : 'paid', stripe: rid('pi_demo_'), pledge: f.pl.id });
    save(); closeSheet(); render(); toast(`Thank you! ${money(amt)} given toward your pledge`);
  },
  pledgeRec: v => {
    const f = pledgeFacts(PLEDGES.find(p => p.id === v));
    editRec({ giving: f.c.giving, amount: f.nextAmount, frequency: f.terms.frequency === 'weekly' ? 'weekly' : 'monthly', end: f.terms.end, coverFee: false }, 'Give toward your pledge regularly');
  },
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || !A[b.dataset.act]) return;
  e.preventDefault(); A[b.dataset.act](b.dataset.v);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.in) { draft[t.dataset.in] = t.value; if (t.dataset.in === 'amount') updateSum(); const er = document.getElementById('err'); if (er) er.textContent = ''; }
  if (t.dataset.sin) { if (t.dataset.sin === 'code') signin.typed = t.value; else signin[t.dataset.sin] = t.value; }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset.ch) return;
  draft[t.dataset.ch] = t.type === 'checkbox' ? t.checked : t.value;
  if (t.dataset.ch === 'coverFee') updateSum(); else render();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') return closeSheet();
  if (e.key !== 'Enter' || !e.target.dataset || !e.target.dataset.sin) return;
  if (e.target.dataset.sin === 'email') sendCode(); else verify(false);
});

render();
