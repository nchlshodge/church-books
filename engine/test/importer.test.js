const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const I = require('../importer.js'), S = require('../setup.js');
const sample = f => fs.readFileSync(path.join(__dirname, '../../samples/import', f), 'utf8');
const hope = () => S.createBooks(require('../../churches/hope/setup.js'));
const ours = L => L.accounts.map(a => ({ code: a.code, name: a.name, type: a.type }));

test('money, dates and CSV quirks from other systems', () => {
  assert.deepStrictEqual(['$1,234.56', '(1,234.56)', '-12.00', '1,000.00 CR', '', '—', 'abc', 5.5].map(I.money), [123456, -123456, -1200, -100000, null, null, null, 550]);
  assert.deepStrictEqual(['01/05/2026', '1/5/26', '2026-01-05', 'Jan 5, 2026', 'January 5 2026', '5-Jan-26', 46027].map(I.date), Array(7).fill('2026-01-05'));
  assert.deepStrictEqual(I.parseCSV('﻿a,"b, c","say ""hi"""\r\n1,2,3'), [['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  assert.deepStrictEqual(I.parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('QuickBooks account list → our chart: matches by name, folds equity into fund balance, proposes new accounts', () => {
  const rows = I.parseCSV(sample('hope-quickbooks-account-list.csv')), d = I.detect(rows);
  assert.strictEqual(d.kind, 'accounts');
  const list = I.readAccounts(rows, d), L = hope(), m = I.guessAccounts(list, ours(L));
  assert.strictEqual(list.length, 25);
  assert.deepStrictEqual([m['Utilities'].code, m['Salaries & Wages'].code, m['Tithes & Offerings'].how, m['Unrestricted Net Assets'].code, m['Net Assets - Missions'].code], ['5200', '5000', 'name', '3000', '3000']);
  assert.strictEqual(m['Missions Support'].code, '5400');           // "Missionary support"
  assert.deepStrictEqual(['Building', 'Accumulated Depreciation', 'Interest Income', 'Payroll Taxes', 'Bank Service Charges', 'Payroll Liabilities'].map(k => m[k].code), ['1610', '1690', '4900', '5020', '5600', '2200']);
  assert.deepStrictEqual([m['Petty Cash'].code.slice(0, 2), m['Mortgage - First Bank'].code.slice(0, 2)], ['10', '25']);   // a new bank with the banks, a loan with the loans
  assert.strictEqual(m['Mortgage - First Bank'].how, 'new');
  assert.strictEqual(m['Mortgage - First Bank'].type, 'liability');
  assert.ok(+m['Mortgage - First Bank'].code >= 2000 && +m['Mortgage - First Bank'].code < 3000);
  const codes = Object.values(m).filter(x => x.how === 'new').map(x => x.code);
  assert.strictEqual(new Set(codes).size, codes.length, 'new accounts get different codes');
});

test('a QuickBooks journal (CSV): grouped transactions, classes to funds, and fund-by-fund balance', () => {
  const rows = I.parseCSV(sample('hope-quickbooks-journal-jan-2026.csv')), d = I.detect(rows);
  assert.strictEqual(d.kind, 'journal');
  const txns = I.readJournal(rows, d);
  assert.strictEqual(txns.length, 9);
  assert.deepStrictEqual([txns[0].date, txns[0].lines.length, txns[1].num, txns[3].lines.length], ['2026-01-04', 4, '4012', 4]);
  const L = hope(), names = [...new Set(txns.flatMap(t => t.lines.map(l => l.account)))].map(name => ({ name }));
  const acc = I.guessAccounts(names, ours(L));
  Object.values(acc).filter(a => a.how === 'new').forEach(a => L.addAccount({ code: a.code, name: a.newName, type: a.type, ...(a.sub ? { sub: a.sub } : {}) }, 't'));
  const funds = I.guessFunds(['General', 'Building Fund', 'Missions'], L.funds.map(f => ({ id: f.id, name: f.name })), 'general');
  assert.deepStrictEqual(funds, { General: 'general', 'Building Fund': 'building', Missions: 'missions' });
  const { entries, problems } = I.toEntries(txns, { accounts: acc, funds, fallbackFund: 'general' });
  assert.deepStrictEqual(problems, []);
  assert.strictEqual(entries[0].interfund, true);                   // the bank line is General, the gifts are split by fund
  entries.forEach(e => L.post(e, 't'));
  assert.strictEqual(L.balance({ account: '1950' }), 0);            // due between funds nets to zero
  assert.strictEqual(0 - L.balance({ type: 'income', fund: 'building' }), 205000);
  assert.strictEqual(L.balance({ account: acc['Checking - First Bank'].code }), 984000 - 141233 + 1046500 - 690000 - 200000 - 165000 - 1200);
  assert.throws(() => L.post(entries[0], 't'), /Already posted/);   // importing the same file twice doesn't double up
});

test('QuickBooks Desktop (IIF) and a trial balance as opening balances', () => {
  const { txns } = I.parseIIF(sample('hope-quickbooks-desktop-feb-2026.iif'));
  assert.strictEqual(txns.length, 5);
  assert.deepStrictEqual(txns[2].lines.map(l => [l.account, l.class, l.debit, l.credit]), [['Checking - First Bank', 'Building Fund', 0, 340000], ['Repairs & Maintenance', 'Building Fund', 340000, 0]]);
  // a trial balance as it comes out of Excel: titles, a blank first heading, totals
  const rows = [['Hope Fellowship'], ['Trial Balance'], ['As of December 31, 2025'], [], ['', 'Debit', 'Credit'],
    ['Checking - First Bank', '1,000.00', ''], ['Building', '5,000.00', ''], ['Mortgage - First Bank', '', '3,000.00'], ['Unrestricted Net Assets', '', '2,500.00'],
    ['Net Assets - Missions', '', '300.00'], ['Tithes & Offerings', '', '900.00'], ['Utilities', '700.00', ''], ['TOTAL', '6,700.00', '6,700.00']];
  const d = I.detect(rows), tb = I.readTrialBalance(rows, d);
  assert.deepStrictEqual([d.kind, d.asOf, tb.rows.length, tb.debits, tb.credits], ['trialBalance', '2025-12-31', 7, 670000, 670000]);
  const L = hope(), acc = I.guessAccounts(tb.rows.map(r => ({ name: r.account, type: { 'Mortgage - First Bank': 'Long Term Liabilities', 'Unrestricted Net Assets': 'Equity', 'Net Assets - Missions': 'Equity', Building: 'Fixed Assets' }[r.account] })), ours(L));
  Object.values(acc).filter(a => a.how === 'new').forEach(a => L.addAccount({ code: a.code, name: a.newName, type: a.type }, 't'));
  const types = Object.fromEntries(L.accounts.map(a => [a.code, a.type]));
  const { entry, problems } = I.openingEntry(tb, { accounts: acc, date: '2025-12-31', fallbackFund: 'general', shares: { missions: 30000 }, bank: '1000', types });
  assert.deepStrictEqual(problems, []);
  L.post(entry, 't');
  assert.deepStrictEqual([L.balance({ account: '1000', fund: 'general' }), L.balance({ account: '1000', fund: 'missions' })], [70000, 30000]);
  assert.strictEqual(0 - L.balance({ account: '3000' }), 300000);   // 2,500 + 300 + 900 − 700: last year's income and spending fold into the fund balance
  assert.strictEqual(acc['Checking - First Bank'].code, '1000');
  assert.strictEqual(0 - L.balance({ account: '3000', fund: 'missions' }), 30000);
});

test('a printed report (PDF text with positions) and a bank statement', () => {
  // as pdf.js hands it over: fixed-width lines, one text run per line
  const cw = 6, line = (y, s) => ({ str: s, x: 30, y, w: s.length * cw, page: 1 });
  const pad = (s, n) => s.padEnd(n), rp = (s, n) => s.padStart(n);
  const L1 = pad('Date', 12) + pad('Description', 28) + rp('Withdrawals', 14) + rp('Deposits', 14) + rp('Balance', 14);
  const L2 = pad('03/01/2026', 12) + pad('DEPOSIT', 28) + rp('', 14) + rp('9,960.00', 14) + rp('40,143.00', 14);
  const L3 = pad('03/05/2026', 12) + pad('CHECK 4018', 28) + rp('1,190.12', 14) + rp('', 14) + rp('38,952.88', 14);
  const rows = I.rowsFromPdf([line(700, 'First Bank'), line(680, L1), line(668, L2), line(656, L3)]);
  const d = I.detect(rows);
  assert.strictEqual(d.kind, 'bank');
  assert.deepStrictEqual(I.readBank(rows, d), [{ date: '2026-03-01', desc: 'DEPOSIT', amount: 996000, ref: '' }, { date: '2026-03-05', desc: 'CHECK 4018', amount: -119012, ref: '' }]);
  // the same report as separate words (how most PDFs come apart)
  const words = [['Date', 30], ['Account', 200], ['Debit', 400], ['Credit', 480]].map(([s, x]) => ({ str: s, x, y: 600, w: s.length * 5 }))
    .concat([['03/05/2026', 30], ['Utilities', 200], ['1,190.12', 392]].map(([s, x]) => ({ str: s, x, y: 588, w: s.length * 5 })))
    .concat([['Checking', 200], ['1,190.12', 470]].map(([s, x]) => ({ str: s, x, y: 576, w: s.length * 5 })));
  const r2 = I.rowsFromPdf(words), d2 = I.detect(r2), t2 = I.readJournal(r2, d2);
  assert.deepStrictEqual([d2.kind, t2.length, t2[0].lines.map(l => [l.account, l.debit, l.credit])], ['journal', 1, [['Utilities', 119012, 0], ['Checking', 0, 119012]]]);
});

test('bank downloads (OFX / QuickBooks .qbo)', () => {
  const ofx = 'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20260305120000\n<TRNAMT>-1190.12\n<FITID>A1\n<CHECKNUM>4018\n<NAME>CHECK 4018\n</STMTTRN>\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260301<TRNAMT>9960.00<FITID>A2<NAME>DEPOSIT</STMTTRN></BANKTRANLIST>';
  assert.deepStrictEqual(I.parseOFX(ofx), [{ date: '2026-03-05', amount: -119012, desc: 'CHECK 4018', ref: '4018' }, { date: '2026-03-01', amount: 996000, desc: 'DEPOSIT', ref: 'A2' }]);
});

test('guessing an account type from its name when the file has no types', () => {
  assert.deepStrictEqual(['Mortgage Interest', 'Interest Income', 'Bank Service Charges', 'Mortgage - First Bank', 'Church Mastercard', 'Petty Cash', 'Accumulated Depreciation', 'Unrestricted Net Assets', 'Building Fund Gifts', 'Payroll Liabilities']
    .map(n => (I.typeFromName(n) || {}).type), ['expense', 'income', 'expense', 'liability', 'liability', 'asset', 'asset', 'net_assets', 'income', 'liability']);
});

test('a PDF that comes apart word by word keeps multi-word cells together', () => {
  const W = (s, x, y) => ({ str: s, x, y, w: s.length * 4.8 });
  const items = [W('Date', 30, 600), W('Account', 150, 600), W('Class', 270, 600), W('Debit', 360, 600), W('Credit', 430, 600),
    W('03/01/2026', 30, 588), W('Checking', 150, 588), W('-', 193.2, 588), W('First', 202.8, 588), W('Bank', 231.6, 588), W('General', 270, 588), W('9,960.00', 352, 588),
    W('Building', 150, 576), W('Fund', 193.2, 576), W('Gifts', 217.2, 576), W('Building', 270, 576), W('Fund', 313.2, 576), W('9,960.00', 427, 576)];
  const rows = I.rowsFromPdf(items), d = I.detect(rows), t = I.readJournal(rows, d);
  assert.deepStrictEqual(t[0].lines.map(l => [l.account, l.class]), [['Checking - First Bank', 'General'], ['Building Fund Gifts', 'Building Fund']]);
});
