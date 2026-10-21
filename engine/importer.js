// Church Books engine — bringing in data from other systems: QuickBooks (Online exports to Excel/CSV, Desktop IIF),
// any spreadsheet or CSV, and PDFs (after the app pulls the text and positions out of them). Everything here is
// pure: files become rows, rows become a chart of accounts, opening balances, transactions or bank lines, and those
// become draft entries for the ledger to check. Amounts are whole cents; dates are 'YYYY-MM-DD'.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const clean = s => String(s == null ? '' : s).replace(/ /g, ' ').trim();
  const norm = s => clean(s).toLowerCase().replace(/^\d{3,6}\s*[-·:]?\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();

  // ---------- files → rows ----------
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r?\n/).find(l => l.trim()) || '';
    const delim = [',', '\t', ';'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(clean));
  }
  // QuickBooks Desktop .iif: tab-separated; !TRNS / !SPL / !ACCNT lines name the columns for the lines after them
  function parseIIF(text) {
    const heads = {}, accounts = [], txns = []; let cur = null;
    String(text).split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      const cells = line.split('\t').map(clean), tag = cells[0];
      if (tag.startsWith('!')) { heads[tag.slice(1)] = cells.slice(1).map(h => h.toUpperCase()); return; }
      const h = heads[tag]; if (!h) return;
      const o = Object.fromEntries(h.map((k, i) => [k, cells[i + 1] || '']));
      if (tag === 'ACCNT') accounts.push({ name: o.NAME, type: o.ACCNTTYPE, number: o.ACCNUM || '' });
      else if (tag === 'TRNS') { cur = { date: date(o.DATE), type: o.TRNSTYPE, num: o.DOCNUM, name: o.NAME, memo: o.MEMO, lines: [] }; txns.push(cur); line_(cur, o); }
      else if (tag === 'SPL' && cur) line_(cur, o);
      else if (tag === 'ENDTRNS') cur = null;
    });
    function line_(t, o) { const a = money(o.AMOUNT) || 0; if (!a) return; t.lines.push({ account: o.ACCNT, debit: a > 0 ? a : 0, credit: a < 0 ? -a : 0, class: o.CLASS || '', name: o.NAME || t.name, memo: o.MEMO || t.memo }); }
    return { accounts, txns };
  }
  // Bank downloads in OFX / QuickBooks Web Connect (.qbo): <STMTTRN> blocks, with or without closing tags
  function parseOFX(text) {
    const tag = (b, t) => ((b.match(new RegExp(`<${t}>([^<\r\n]*)`, 'i')) || [])[1] || '').trim();
    return String(text).split(/<STMTTRN>/i).slice(1).map(b => { const d = tag(b, 'DTPOSTED');
      return { date: d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null, amount: money(tag(b, 'TRNAMT')), desc: tag(b, 'NAME') || tag(b, 'MEMO'), ref: tag(b, 'CHECKNUM') || tag(b, 'FITID') }; })
      .filter(x => x.date && x.amount);
  }
  // PDF text → rows. items: [{ str, x, y, w, page }] in PDF units (y grows upward). Lines are items at the same height;
  // columns come from the header line's positions, so a right-aligned amount lands under its heading.
  function rowsFromPdf(items, { headerWords = HEADER_WORDS } = {}) {
    const parts = [];
    items.forEach(it => { const s = String(it.str || ''); if (!s.trim()) return;
      const cw = (it.w || s.length * 5) / Math.max(1, s.length), re = /\S+(?: \S+)*/g; let m;   // split runs of 2+ spaces (fixed-width text)
      while ((m = re.exec(s))) parts.push({ text: m[0], x0: it.x + m.index * cw, x1: it.x + (m.index + m[0].length) * cw, y: it.y, page: it.page || 1 }); });
    parts.sort((a, b) => a.page - b.page || b.y - a.y || a.x0 - b.x0);
    const lines = [];
    parts.forEach(p => { const l = lines[lines.length - 1];
      if (l && l.page === p.page && Math.abs(l.y - p.y) < 3) l.cells.push(p); else lines.push({ page: p.page, y: p.y, cells: [p] }); });
    lines.forEach(l => { l.cells.sort((a, b) => a.x0 - b.x0); const merged = [];
      l.cells.forEach(c => { const m = merged[merged.length - 1], cw = Math.max((m ? (m.x1 - m.x0) / Math.max(1, m.text.length) : 0), (c.x1 - c.x0) / Math.max(1, c.text.length));
        if (m && c.x0 - m.x1 < Math.max(4, cw * 1.6)) { m.text += ' ' + c.text; m.x1 = c.x1; } else merged.push({ ...c }); }); l.cells = merged; });   // one space joins words; a wider gap is a new column
    const score = l => l.cells.filter(c => headerWords.some(([, re]) => re.test(c.text.toLowerCase()))).length;
    const hi = lines.reduce((b, l, i) => score(l) > (b < 0 ? 1 : score(lines[b])) ? i : b, -1);
    if (hi < 0) return lines.map(l => l.cells.map(c => c.text));
    const cols = lines[hi].cells, headText = cols.map(c => c.text).join('|');
    const place = c => { let best = 0, bs = -Infinity;
      cols.forEach((h, i) => { const ov = Math.min(c.x1, h.x1 + 6) - Math.max(c.x0, h.x0 - 6), d = -Math.abs((c.x0 + c.x1) / 2 - (h.x0 + h.x1) / 2) / 1000, s = ov > 0 ? ov : d; if (s > bs) { bs = s; best = i; } });
      return best; };
    return lines.map((l, i) => {
      if (i < hi) return [l.cells.map(c => c.text).join(' ')];
      if (i > hi && l.cells.map(c => c.text).join('|') === headText) return null;     // the heading again on the next page
      const row = cols.map(() => ''); l.cells.forEach(c => { const k = i === hi ? cols.indexOf(c) : place(c); row[k] = row[k] ? row[k] + ' ' + c.text : c.text; });
      return row;
    }).filter(Boolean);
  }

  // ---------- values ----------
  function money(v) {
    if (typeof v === 'number') return Math.round(v * 100);
    let s = clean(v); if (!s || s === '-' || s === '—') return null;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s) || /\bCR$/i.test(s);
    s = s.replace(/[()$,\s]|CR$|DR$/gi, '').replace(/^-|-$/g, '');
    if (!/^\d*\.?\d+$/.test(s)) return null;
    const c = Math.round(parseFloat(s) * 100); return neg ? -c : c;
  }
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const ymd = (y, m, d) => (y < 100 ? (y += 2000) : y, m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
  function date(v) {
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return d.toISOString().slice(0, 10); }   // Excel serial
    const s = clean(v); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ymd(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) return ymd(+m[3], +m[1], +m[2]);
    if ((m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/)) && MON[m[1].slice(0, 3).toLowerCase()]) return ymd(+m[3], MON[m[1].slice(0, 3).toLowerCase()], +m[2]);
    if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{2,4})$/))) return ymd(+m[3], MON[m[2].toLowerCase()], +m[1]);
    return null;
  }

  // ---------- what kind of file is it ----------
  const HEADER_WORDS = [
    ['date', /^(trans(action)? |posting |post |txn )?date$/], ['type', /^(transaction |trans(action)? |txn |account )?type$/], ['num', /^(num|no\.?|number|ref( no\.?| #)?|doc( num)?|check( no\.?| #)?)$/],
    ['name', /^(name|payee|vendor|customer|donor|payee \/ payer)$/], ['memo', /^(memo|memo\/description|description|details|transaction description|line description)$/],
    ['account', /^(account|account name|account full name|full name|gl account|distribution account)$/], ['class', /^(class|fund|location|department|tag)$/],
    ['debit', /^(debit|debits|dr|debit amount)$/], ['credit', /^(credit|credits|cr|credit amount)$/], ['amount', /^(amount|net amount|transaction amount)$/],
    ['balance', /^(balance|running balance|ending balance)$/], ['deposit', /^(deposits?|money in|credits? \(\+\)|additions?)$/], ['withdrawal', /^(withdrawals?|money out|debits? \(-\)|payments?|subtractions?|checks? (and|&) debits)$/],
    ['detail', /^(detail type)$/], ['acctnum', /^(account ?#|acct ?#|account number|account no\.?)$/],
  ];
  function headerOf(row) {
    const cols = {}; row.forEach((c, i) => { const t = clean(c).toLowerCase(); const hit = HEADER_WORDS.find(([, re]) => re.test(t)); if (hit && cols[hit[0]] == null) cols[hit[0]] = i; });
    return cols;
  }
  function detect(rows) {
    let best = null;
    rows.slice(0, 20).forEach((r, i) => { const cols = headerOf(r), n = Object.keys(cols).length; if (n >= 2 && (!best || n > best.n)) best = { i, cols, n }; });
    if (!best) return { kind: 'unknown' };
    const { i, cols } = best, title = rows.slice(0, i).map(r => r.filter(Boolean).join(' ')).join(' · ');
    if (cols.debit != null && cols.credit != null && cols.account == null && cols.date == null) cols.account = Math.min(cols.debit, cols.credit) > 0 ? 0 : null;   // QuickBooks trial balance: the first heading is blank
    const asOf = (title.match(/as of ([A-Za-z]+\.? \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i) || [])[1];
    let kind = 'unknown';
    if (cols.date == null) {
      if (cols.account != null && cols.type != null) kind = 'accounts';
      else if (cols.account != null && cols.debit != null && cols.credit != null) kind = 'trialBalance';
    } else if (cols.account != null && (cols.debit != null || cols.amount != null)) kind = 'journal';
    else if (cols.amount != null || cols.deposit != null || cols.withdrawal != null) kind = 'bank';
    return { kind, header: i, cols, title, asOf: asOf ? date(asOf.replace(/\.(?= )/, '')) : null };
  }
  const isTotal = s => /^(total|totals|net income|grand total)\b/i.test(clean(s));
  const cell = (r, k, cols) => cols[k] == null ? '' : clean(r[cols[k]]);

  // ---------- reading each kind ----------
  function readAccounts(rows, d) {
    return rows.slice(d.header + 1).map(r => { const name = cell(r, 'account', d.cols), num = cell(r, 'acctnum', d.cols) || (name.match(/^(\d{3,6})\b/) || [])[1] || '';
      return name && !isTotal(name) ? { name, type: cell(r, 'type', d.cols), number: num } : null; }).filter(Boolean);
  }
  function readTrialBalance(rows, d) {
    const out = rows.slice(d.header + 1).map(r => { const name = cell(r, 'account', d.cols); if (!name || isTotal(name)) return null;
      const dr = money(cell(r, 'debit', d.cols)) || 0, cr = money(cell(r, 'credit', d.cols)) || 0; return dr || cr ? { account: name, debit: dr, credit: cr } : null; }).filter(Boolean);
    return { rows: out, debits: out.reduce((s, x) => s + x.debit, 0), credits: out.reduce((s, x) => s + x.credit, 0), asOf: d.asOf };
  }
  // A journal: each transaction is a few lines that balance. QuickBooks puts the date, type and number on the first
  // line only and a total line after; flat files repeat them on every line. Either way: a new transaction starts when
  // the last one balances and a new date or number shows up.
  function readJournal(rows, d) {
    const c = d.cols, txns = []; let cur = null, last = { date: null };
    const close = () => { if (cur && cur.lines.length) txns.push(cur); cur = null; };
    const bal = t => t.lines.reduce((s, l) => s + l.debit - l.credit, 0);
    rows.slice(d.header + 1).forEach(r => {
      if (!r.some(x => clean(x))) return;
      const dt = date(cell(r, 'date', c)), acct = cell(r, 'account', c), num = cell(r, 'num', c), type = cell(r, 'type', c);
      if (isTotal(r[0]) || isTotal(acct) || (!acct && !dt)) { if (cur && bal(cur) === 0) close(); return; }
      let dr = money(cell(r, 'debit', c)) || 0, cr = money(cell(r, 'credit', c)) || 0;
      if (c.debit == null && c.amount != null) { const a = money(cell(r, 'amount', c)) || 0; dr = a > 0 ? a : 0; cr = a < 0 ? -a : 0; }
      if (dr < 0) { cr += -dr; dr = 0; } if (cr < 0) { dr += -cr; cr = 0; }
      const key = `${dt || ''}|${num}|${type}`;
      if (dt && (!cur || (bal(cur) === 0 && cur.lines.length > 1 && (key !== cur.key || !num)))) { close(); cur = { key, date: dt, type, num, name: cell(r, 'name', c), memo: cell(r, 'memo', c), lines: [] }; last.date = dt; }
      if (!cur) cur = { key, date: dt || last.date, type, num, name: cell(r, 'name', c), memo: cell(r, 'memo', c), lines: [] };
      if (acct && (dr || cr)) cur.lines.push({ account: acct, debit: dr, credit: cr, class: cell(r, 'class', c), name: cell(r, 'name', c) || cur.name, memo: cell(r, 'memo', c) || cur.memo });
    });
    close();
    return txns;
  }
  function readBank(rows, d) {
    const c = d.cols;
    return rows.slice(d.header + 1).map(r => { const dt = date(cell(r, 'date', c)); if (!dt) return null;
      let a = c.amount != null ? money(cell(r, 'amount', c)) : (money(cell(r, 'deposit', c)) || 0) - Math.abs(money(cell(r, 'withdrawal', c)) || 0);
      if (c.amount == null && c.debit != null && c.credit != null) a = (money(cell(r, 'credit', c)) || 0) - Math.abs(money(cell(r, 'debit', c)) || 0);
      return a ? { date: dt, desc: cell(r, 'memo', c) || cell(r, 'name', c) || cell(r, 'num', c), amount: a, ref: cell(r, 'num', c) } : null; }).filter(Boolean);
  }

  // ---------- matching their accounts and classes to ours ----------
  const QB_TYPES = [
    [/^bank$|checking|savings/, 'asset', 'bank'], [/receivable/, 'asset'], [/fixed asset/, 'asset', 'fixed'], [/other (current )?asset|^asset/, 'asset'],
    [/credit ?card/, 'liability', 'card'], [/payable/, 'liability', 'payable'], [/liabilit|loan|mortgage/, 'liability'],
    [/equity|net assets|retained|fund balance/, 'net_assets'], [/income|revenue|contribution|support/, 'income'], [/expense|cost of goods|cogs/, 'expense']];
  // No type given (a trial balance, a journal): guess from the name. Order matters: "Mortgage Interest" is spending, "Interest Income" is income.
  const BY_NAME = [[/net assets|equity|retained|fund balance/, 'net_assets'], [/income|gifts?$|offerings?|tithes?|donations?|contributions?|revenue|grants? received/, 'income'],
    [/(charges?|fees?|expenses?|wages|salar(y|ies)|taxes|utilities|supplies|repairs|maintenance|interest|support|insurance|rent|postage|printing|travel|honorari(um|a))$/, 'expense'],
    [/mortgage|loan|notes? payable|payable|liabilit|credit card|mastercard|visa|amex/, 'liability', 'card'], [/checking|savings|petty cash|cash|money market|bank|cd$/, 'asset', 'bank'],
    [/building|land|equipment|vehicle|furniture|depreciation|improvements/, 'asset', 'fixed'], [/receivable|prepaid|deposit/, 'asset']];
  function typeFromName(name) { const s = norm(name); const hit = BY_NAME.find(([re]) => re.test(s)); if (!hit) return null;
    return { type: hit[1], sub: hit[1] === 'liability' ? (/card|mastercard|visa|amex/.test(s) ? 'card' : /payable/.test(s) ? 'payable' : undefined) : hit[2] }; }
  function ourType(t) { const s = clean(t).toLowerCase(); const hit = QB_TYPES.find(([re]) => re.test(s)); return hit ? { type: hit[1], sub: hit[2] } : null; }
  const words = s => new Set(norm(s).split(' ').filter(w => w && !/^\d+$/.test(w) && !['and', 'the', 'of', 'less'].includes(w)).map(w => w.length > 3 ? w.replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1') : w));   // ignore account numbers and last-4s; plurals
  const within = (a, b) => [...a].every(w => b.has(w));
  const sameWords = (a, b) => a.size === b.size && [...a].every(w => b.has(w));
  // Where a new account's number goes: banks 1000s, buildings and equipment 1600s, cards 2000s, bills 2100s, loans 2500s
  const rangeFor = (type, sub, n) => type === 'asset' ? (sub === 'bank' ? [1000, 1099] : sub === 'fixed' ? [1600, 1689] : [1100, 1599])
    : type === 'liability' ? (sub === 'card' ? [2000, 2099] : sub === 'payable' ? [2100, 2199] : /mortgage|loan|note/.test(n) ? [2500, 2999] : [2200, 2499]) : RANGE[type];
  const RANGE = { asset: [1000, 1999], liability: [2000, 2999], net_assets: [3000, 3999], income: [4000, 4999], expense: [5000, 5999] };
  const SAME = [['tithes', 'offering', 'contributions', 'giving', 'donations'], ['salaries', 'wages', 'staff pay'], ['utilities', 'electric', 'gas and electric'], ['missions', 'missionary support'], ['supplies', 'ministry supplies'], ['office', 'office expense', 'office supplies'], ['bank fees', 'bank service charges', 'service charges', 'bank charges'], ['merchant fees', 'processing fees', 'credit card fees'], ['payroll liabilities', 'payroll taxes owed', 'payroll tax payable', 'payroll taxes payable', 'payroll withholdings']];
  // their: [{ name, type?, number? }] · ours: [{ code, name, type }] → { [name]: { code, how, type, sub, newName? } }
  function guessAccounts(their, ours) {
    const taken = new Set(ours.map(a => a.code)), out = {};
    their.forEach(t => {
      const leaf = t.name.split(':').pop(), n = norm(leaf), ty = ourType(t.type) || typeFromName(leaf);
      const num = (t.number || '').match(/^\d{4}$/) ? t.number : (leaf.match(/^(\d{4})\b/) || [])[1];
      let hit = ty && ty.type === 'net_assets' ? ours.find(a => a.code === '3000') : null, how = hit ? 'equity' : '';
      if (!hit) { hit = ours.find(a => norm(a.name) === n && (!ty || a.type === ty.type)); how = hit ? 'name' : ''; }
      if (!hit) { const w = words(leaf); hit = ours.find(a => (!ty || a.type === ty.type) && sameWords(words(a.name), w)); how = hit ? 'name' : ''; }   // "Checking - First Bank" = "First Bank Checking"
      if (!hit) { const w = words(leaf); const cands = ours.filter(a => (!ty || a.type === ty.type) && a.code !== '3000' && (within(w, words(a.name)) || within(words(a.name), w)) && words(a.name).size && w.size);
        hit = cands.sort((a, b) => Math.abs(words(a.name).size - w.size) - Math.abs(words(b.name).size - w.size))[0]; how = hit ? 'similar' : ''; }   // "Payroll Taxes" ⊂ "Employer payroll taxes"
      if (!hit && num) { hit = ours.find(a => a.code === num && (!ty || a.type === ty.type) && norm(a.name).split(' ')[0] === n.split(' ')[0]); how = hit ? 'number' : ''; }
      if (!hit) { const g = SAME.find(set => set.some(w => n.includes(w))); if (g) { hit = ours.find(a => (!ty || a.type === ty.type) && g.some(w => norm(a.name).includes(w))); how = hit ? 'similar' : ''; } }
      if (hit) { out[t.name] = { code: hit.code, how }; return; }
      const type = (ty && ty.type) || 'expense', [lo, hi] = rangeFor(type, ty && ty.sub, n);
      let code = num && !taken.has(num) && +num >= lo && +num <= hi ? +num : null;
      if (!code) for (let c = lo; c <= hi; c += 10) if (!taken.has(String(c))) { code = c; break; }
      taken.add(String(code)); out[t.name] = { code: String(code), how: 'new', type, sub: ty && ty.sub, newName: leaf.replace(/^\d{4}\s*[-·]?\s*/, '') };
    });
    return out;
  }
  // their classes → our funds, by name; anything else → the operating fund
  function guessFunds(classes, funds, fallback) {
    return Object.fromEntries(classes.map(c => { const n = norm(c), f = funds.find(x => norm(x.name) === n || norm(x.id) === n || (n && (norm(x.name).includes(n) || n.includes(norm(x.name).replace(/ fund$/, ''))))); return [c, f ? f.id : fallback]; }));
  }

  // ---------- drafts for the ledger ----------
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  // txns → balanced entries. A transaction whose classes don't balance fund by fund (common in QuickBooks: the bank
  // line has one class, the gifts another) gets a "due between funds" line in each fund, which nets to zero.
  function toEntries(txns, { accounts, funds, fallbackFund, interfund = '1950', tag = 'import' }) {
    const entries = [], problems = [];
    txns.forEach((t, k) => {
      const missing = t.lines.filter(l => !accounts[l.account]).map(l => l.account);
      if (missing.length) { problems.push({ t, k, msg: `Account not matched: ${[...new Set(missing)].join(', ')}` }); return; }
      if (!t.date) { problems.push({ t, k, msg: 'No date' }); return; }
      const lines = t.lines.map(l => ({ account: accounts[l.account].code, fund: (l.class && funds[l.class]) || fallbackFund, ...(l.debit ? { debit: l.debit } : { credit: l.credit }), ...(l.name ? { party: l.name } : {}) }));
      const total = lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
      if (total !== 0) { problems.push({ t, k, msg: `Doesn't balance (off by ${(total / 100).toFixed(2)})` }); return; }
      const byFund = {}; lines.forEach(l => { byFund[l.fund] = (byFund[l.fund] || 0) + (l.debit || 0) - (l.credit || 0); });
      Object.entries(byFund).filter(([, v]) => v).forEach(([fund, v]) => lines.push({ account: interfund, fund, ...(v > 0 ? { credit: v } : { debit: -v }) }));
      const sig = `${t.date}|${t.type}|${t.num}|${t.lines.map(l => `${l.account}:${l.debit}:${l.credit}:${l.class}`).join(',')}`;
      entries.push({ date: t.date, memo: [t.type, t.num && `#${t.num}`, t.name, t.memo].filter(Boolean).join(' · ') || 'Imported entry', source: { type: tag, id: hash(sig) + '-' + k }, lines, interfund: Object.values(byFund).some(v => v) });
    });
    return { entries, problems };
  }
  // A trial balance → one opening entry. Last year's income and spending fold into the fund balance (3000).
  // shares: { fund: cents } — how much of the fund balance belongs to funds other than the fallback; that much of
  // the cash (bank account `bank`) moves to them on paper, so every fund starts with its own money.
  function openingEntry(tb, { accounts, date: d, fallbackFund, shares = {}, bank, types }) {
    const lines = [], problems = [];
    tb.rows.forEach(r => { const m = accounts[r.account]; if (!m) { problems.push({ msg: `Account not matched: ${r.account}` }); return; }
      const t = types[m.code], code = t === 'income' || t === 'expense' ? '3000' : m.code, net = r.debit - r.credit;
      if (net) lines.push({ account: code, fund: fallbackFund, ...(net > 0 ? { debit: net } : { credit: -net }) }); });
    const merged = {}; lines.forEach(l => { const k = l.account; merged[k] = (merged[k] || 0) + (l.debit || 0) - (l.credit || 0); });
    const out = Object.entries(merged).filter(([, v]) => v).map(([account, v]) => ({ account, fund: fallbackFund, ...(v > 0 ? { debit: v } : { credit: -v }) }));
    Object.entries(shares).filter(([f, v]) => v && f !== fallbackFund).forEach(([fund, v]) => {
      out.push({ account: bank, fund, debit: v }, { account: '3000', fund, credit: v }, { account: '3000', fund: fallbackFund, debit: v }, { account: bank, fund: fallbackFund, credit: v }); });
    if (tb.debits !== tb.credits) problems.push({ msg: `The trial balance doesn't balance: debits ${(tb.debits / 100).toFixed(2)}, credits ${(tb.credits / 100).toFixed(2)}` });
    return { entry: { date: d, memo: 'Opening balances (from QuickBooks)', source: { type: 'import_opening', id: d }, lines: out }, problems };
  }
  return { parseCSV, parseIIF, parseOFX, rowsFromPdf, money, date, headerOf, detect, readAccounts, readTrialBalance, readJournal, readBank, ourType, typeFromName, guessAccounts, guessFunds, toEntries, openingEntry, HEADER_WORDS };
});
