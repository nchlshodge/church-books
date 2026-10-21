// Church Books engine — the ledger. Pure JavaScript, no Firebase, no DOM: runs in the browser and in Node.
//
// The rules it enforces (these are what make the books trustworthy):
//   • Every entry balances — debits equal credits — and balances within EACH fund,
//     so every fund always has its own complete set of books.
//   • Money is whole cents (integers). No floating-point pennies.
//   • Every line names a real, active account and a real fund.
//   • Nothing posts into a locked month. Mistakes are fixed with a reversing entry,
//     never by editing or deleting — entries are permanent.
//   • The same import (a Planning Center payout, a card charge…) can't post twice.
//   • Every change is written to the audit trail: who, what, when.
//   • A line can name who was paid (party) — that's what 1099 totals are built from.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksLedger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  class LedgerError extends Error {
    constructor(code, message) { super(message); this.code = code; this.name = 'LedgerError'; }
  }
  const fail = (code, msg) => { throw new LedgerError(code, msg); };

  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const isDate = d => typeof d === 'string' && DATE.test(d) && !isNaN(Date.parse(d + 'T00:00:00Z'));
  const isCents = n => Number.isInteger(n) && n > 0;
  const DEBIT_NORMAL = { asset: true, expense: true, liability: false, net_assets: false, income: false };
  const TYPES = Object.keys(DEBIT_NORMAL);

  // dollars (number or "1,234.56") → integer cents
  function cents(v) {
    const n = typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : v;
    if (typeof n !== 'number' || !isFinite(n)) fail('bad_amount', `Not an amount: ${v}`);
    return Math.round(n * 100);
  }
  // split `total` cents by percentages; the last share takes the leftover cent so it always adds up
  function splitCents(total, parts) {
    let used = 0;
    return parts.map((p, i) => {
      const c = i === parts.length - 1 ? total - used : Math.round(total * p.pct / 100);
      used += c; return { ...p, cents: c };
    });
  }

  function createLedger(opts) {
    opts = opts || {};
    const clock = opts.clock || (() => new Date().toISOString());
    const state = {
      accounts: new Map(), funds: new Map(), entries: [], audit: [],
      lockedThrough: opts.lockedThrough || null, seq: 0, sources: new Map(),
    };

    function log(by, action, detail) { state.audit.push(Object.freeze({ at: clock(), by: by || 'system', action, ...detail })); }

    function addAccount(a, by) {
      if (!a || !/^\d{4}$/.test(a.code)) fail('bad_account', 'Account codes are 4 digits');
      if (!a.name) fail('bad_account', `Account ${a.code} needs a name`);
      if (!TYPES.includes(a.type)) fail('bad_account', `Account ${a.code} has an unknown type: ${a.type}`);
      if (state.accounts.has(a.code)) fail('duplicate_account', `Account ${a.code} already exists`);
      state.accounts.set(a.code, Object.freeze({ active: true, ...a }));
      log(by, 'add_account', { code: a.code, name: a.name });
    }
    function addFund(f, by) {
      if (!f || !f.id || !f.name) fail('bad_fund', 'A fund needs an id and a name');
      if (!['with', 'without'].includes(f.restriction)) fail('bad_fund', `Fund ${f.id}: restriction must be 'with' or 'without'`);
      if (state.funds.has(f.id)) fail('duplicate_fund', `Fund ${f.id} already exists`);
      state.funds.set(f.id, Object.freeze({ active: true, ...f }));
      log(by, 'add_fund', { fund: f.id, name: f.name });
    }
    // Accounts with history are never deleted — they're switched off for new entries.
    function deactivateAccount(code, by) {
      const a = state.accounts.get(code) || fail('no_account', `No account ${code}`);
      state.accounts.set(code, Object.freeze({ ...a, active: false }));
      log(by, 'deactivate_account', { code });
    }

    // Renaming never changes history: entries refer to codes and ids, and the old name is kept in the audit trail.
    function renameFund(id, name, by) {
      const f = state.funds.get(id) || fail('no_fund', `No fund ${id}`);
      if (!name || !String(name).trim()) fail('bad_fund', 'A fund needs a name');
      state.funds.set(id, Object.freeze({ ...f, name: String(name).trim() }));
      log(by, 'rename_fund', { fund: id, from: f.name, name: String(name).trim() });
    }
    function renameAccount(code, name, by) {
      const a = state.accounts.get(code) || fail('no_account', `No account ${code}`);
      if (!name || !String(name).trim()) fail('bad_account', 'An account needs a name');
      state.accounts.set(code, Object.freeze({ ...a, name: String(name).trim() }));
      log(by, 'rename_account', { code, from: a.name, name: String(name).trim() });
    }

    function isLocked(date) { return !!state.lockedThrough && date <= state.lockedThrough; }

    function validate(draft) {
      if (!draft || typeof draft !== 'object') fail('bad_entry', 'Empty entry');
      if (!isDate(draft.date)) fail('bad_date', `Entry date must be YYYY-MM-DD, got ${draft.date}`);
      if (isLocked(draft.date)) fail('locked', `The books are locked through ${state.lockedThrough}. Post a correction in an open month instead.`);
      if (!draft.memo || !String(draft.memo).trim()) fail('no_memo', 'Every entry needs a short description');
      const lines = draft.lines;
      if (!Array.isArray(lines) || lines.length < 2) fail('too_few_lines', 'An entry needs at least two lines');
      const perFund = new Map();
      lines.forEach((l, i) => {
        const where = `Line ${i + 1}`;
        const acct = state.accounts.get(l.account) || fail('no_account', `${where}: no account ${l.account}`);
        if (!acct.active) fail('inactive_account', `${where}: account ${l.account} (${acct.name}) is switched off`);
        if (!state.funds.has(l.fund)) fail('no_fund', `${where}: no fund ${l.fund}`);
        const d = l.debit || 0, c = l.credit || 0;
        if ((d && c) || (!d && !c)) fail('bad_line', `${where}: needs a debit or a credit, not both`);
        if (!isCents(d || c)) fail('bad_amount', `${where}: amounts are positive whole cents`);
        perFund.set(l.fund, (perFund.get(l.fund) || 0) + d - c);
      });
      for (const [fund, diff] of perFund) {
        if (diff !== 0) fail('unbalanced', `The ${state.funds.get(fund).name} lines don't balance (off by ${(diff / 100).toFixed(2)})`);
      }
      if (draft.source) {
        const key = draft.source.type + ':' + draft.source.id;
        if (state.sources.has(key)) fail('duplicate', `Already posted: ${key} (entry ${state.sources.get(key)})`);
      }
    }

    function post(draft, by) {
      validate(draft);
      const id = 'JE-' + String(++state.seq).padStart(5, '0');
      const entry = deepFreeze({
        id, date: draft.date, memo: String(draft.memo).trim(), source: draft.source || null,
        lines: draft.lines.map(l => ({ account: l.account, fund: l.fund, debit: l.debit || 0, credit: l.credit || 0, project: l.project || null, party: l.party || null, memo: l.memo || null })),
        postedAt: draft.postedAt || clock(), postedBy: by || 'system', reverses: draft.reverses || null,
      });
      state.entries.push(entry);
      if (entry.source) state.sources.set(entry.source.type + ':' + entry.source.id, id);
      log(by, 'post', { entry: id, memo: entry.memo });
      return entry;
    }

    // The only way to undo an entry: a mirror-image entry, dated in an open month.
    function reverse(entryId, { date, reason, by } = {}) {
      const orig = get(entryId) || fail('no_entry', `No entry ${entryId}`);
      if (orig.reverses) fail('cant_reverse', `${entryId} is itself a reversal`);
      if (reversalOf(entryId)) fail('already_reversed', `${entryId} was already reversed`);
      if (!reason) fail('no_reason', 'Say why it is being reversed');
      return post({
        date: date || orig.date, memo: `Reverses ${entryId}: ${reason}`, reverses: entryId,
        lines: orig.lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })),
      }, by);
    }
    const get = id => state.entries.find(e => e.id === id) || null;
    const reversalOf = id => state.entries.find(e => e.reverses === id) || null;
    const findBySource = (type, id) => { const e = state.sources.get(type + ':' + id); return e ? get(e) : null; };

    function lock(through, by) {
      if (!isDate(through)) fail('bad_date', 'Lock date must be YYYY-MM-DD');
      if (state.lockedThrough && through < state.lockedThrough) fail('cant_unlock', 'Use unlock() with a reason to open a closed month');
      state.lockedThrough = through; log(by, 'lock', { through });
    }
    function unlock(through, reason, by) {
      if (!reason) fail('no_reason', 'Say why a closed month is being reopened');
      const was = state.lockedThrough; state.lockedThrough = through || null;
      log(by, 'unlock', { from: was, to: state.lockedThrough, reason });
    }

    // Sum of debits minus credits, filtered. Use natural() for the "normal" sign.
    function balance(filter) {
      const f = filter || {};
      let total = 0;
      for (const e of state.entries) {
        if (f.through && e.date > f.through) continue;
        if (f.from && e.date < f.from) continue;
        for (const l of e.lines) {
          if (f.account && l.account !== f.account) continue;
          if (f.fund && l.fund !== f.fund) continue;
          if (f.project && l.project !== f.project) continue;
          if (f.party && l.party !== f.party) continue;
          if (f.type && state.accounts.get(l.account).type !== f.type) continue;
          total += l.debit - l.credit;
        }
      }
      return total;
    }
    // Balance with the sign people expect: a bank account or a card balance is positive.
    function natural(code, filter) {
      const a = state.accounts.get(code) || fail('no_account', `No account ${code}`);
      const b = balance({ ...filter, account: code });
      return DEBIT_NORMAL[a.type] ? b : 0 - b; // 0 - b, not -b: never return -0
    }

    // Year-end: move each fund's income and expenses into its fund balance, then lock the year.
    function closeYear(year, by) {
      const end = `${year}-12-31`, from = `${year}-01-01`;
      if (isLocked(end)) fail('locked', `${year} is already closed`);
      const lines = [];
      for (const fund of state.funds.keys()) {
        let net = 0;
        for (const a of state.accounts.values()) {
          if (a.type !== 'income' && a.type !== 'expense') continue;
          const b = balance({ account: a.code, fund, from, through: end });
          if (!b) continue;
          lines.push(b > 0 ? { account: a.code, fund, credit: b } : { account: a.code, fund, debit: -b });
          net += b;
        }
        if (net) lines.push(net > 0 ? { account: '3000', fund, debit: net } : { account: '3000', fund, credit: -net });
      }
      let entry = null;
      if (lines.length) entry = post({ date: end, memo: `Close ${year}: income and expenses into fund balances`, source: { type: 'year_close', id: String(year) }, lines }, by);
      lock(end, by);
      return entry;
    }

    const api = {
      addAccount, addFund, deactivateAccount, renameFund, renameAccount, post, reverse, lock, unlock, closeYear,
      balance, natural, get, reversalOf, findBySource, isLocked,
      get lockedThrough() { return state.lockedThrough; },
      get entries() { return state.entries.slice(); },
      get audit() { return state.audit.slice(); },
      get accounts() { return [...state.accounts.values()]; },
      get funds() { return [...state.funds.values()]; },
      account: code => state.accounts.get(code) || null,
      fund: id => state.funds.get(id) || null,
      toJSON() {
        return { accounts: api.accounts, funds: api.funds, entries: state.entries, audit: state.audit, lockedThrough: state.lockedThrough, seq: state.seq };
      },
    };

    (opts.accounts || []).forEach(a => addAccount(a, 'setup'));
    (opts.funds || []).forEach(f => addFund(f, 'setup'));
    return api;
  }

  // Rebuild a ledger from saved JSON — re-checks every entry, so a tampered file won't load.
  function fromJSON(data, opts) {
    const L = createLedger({ ...opts, accounts: data.accounts.map(a => ({ ...a, active: true })), funds: data.funds });
    data.entries.forEach(e => L.post({ date: e.date, memo: e.memo, source: e.source, reverses: e.reverses, lines: e.lines, postedAt: e.postedAt }, e.postedBy));
    data.accounts.filter(a => a.active === false).forEach(a => L.deactivateAccount(a.code, 'restore'));
    if (data.lockedThrough) L.lock(data.lockedThrough, 'restore');
    return L;
  }

  function deepFreeze(o) { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); }

  return { createLedger, fromJSON, LedgerError, cents, splitCents, DEBIT_NORMAL };
});
