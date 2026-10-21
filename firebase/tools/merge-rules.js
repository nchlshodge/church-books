// Puts the Church Books rules block into another app's rules files (the RCC Hub's), just before its
// final default-deny rule. Writes NEW files and changes nothing else:
//   node tools/merge-rules.js ../../firestore-v21.rules ../../firestore-v22.rules ../../storage.rules ../../storage-v22.rules
// Run it again whenever the books rules change; it replaces the old block if the file already has one.
const fs = require('fs'), path = require('path');
const [fsIn, fsOut, stIn, stOut] = process.argv.slice(2);
if (!stOut) { console.error('Usage: merge-rules.js <firestore in> <firestore out> <storage in> <storage out>'); process.exit(1); }
const BEGIN = '// ===== BEGIN CHURCH BOOKS =====', END = '// ===== END CHURCH BOOKS =====';
const block = file => { const s = fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); return s.slice(s.indexOf(BEGIN), s.indexOf(END) + END.length); };
function merge(src, out, books, catchAll) {
  let s = fs.readFileSync(src, 'utf8');
  if (s.includes(BEGIN)) s = s.slice(0, s.lastIndexOf('\n', s.indexOf(BEGIN))) + s.slice(s.indexOf(END) + END.length);
  const at = s.lastIndexOf(catchAll); if (at < 0) throw new Error(`${src}: can't find its default rule "${catchAll}"`);
  const lineStart = s.lastIndexOf('\n', at) + 1, indent = s.slice(lineStart, at);
  const ind = books.split('\n').map((l, i) => (i ? indent : '') + l.replace(/^    /, '')).join('\n');
  // keep any comment lines just above the default rule with it
  let cut = lineStart; while (true) { const prev = s.lastIndexOf('\n', cut - 2) + 1, line = s.slice(prev, cut - 1).trim(); if (line.startsWith('//')) cut = prev; else break; }
  s = s.slice(0, cut) + indent + ind + '\n\n' + s.slice(cut);
  fs.writeFileSync(out, s); console.log(`${out}: books block added (${ind.split('\n').length} lines)`);
}
merge(fsIn, fsOut, block('firestore.rules'), 'match /{document=**}');
merge(stIn, stOut, block('storage.rules'), 'match /{allPaths=**}');
