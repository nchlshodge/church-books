// Church Books engine — files attached to anything: receipts, invoices, W-9s, bank statements,
// deposit slips, board minutes. Entries in the books are frozen, so files live beside them and are
// linked by { kind, id } (e.g. { kind: 'bill', id: 'b3' } or { kind: 'entry', id: 'JE-0042' }).
// A file is never really deleted: removing it hides it and records who and why (and files on a
// locked month can't be removed at all). The file bytes themselves are stored elsewhere (by `ref`).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksAttachments = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TYPES = { pdf: 'PDF', jpg: 'Photo', jpeg: 'Photo', png: 'Photo', heic: 'Photo', webp: 'Photo', gif: 'Photo',
    csv: 'Spreadsheet', xlsx: 'Spreadsheet', xls: 'Spreadsheet', docx: 'Document', doc: 'Document', txt: 'Document', eml: 'Email' };
  const extOf = name => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const typeOf = name => TYPES[extOf(name)] || null;
  const sameLink = (a, b) => a.kind === b.kind && String(a.id) === String(b.id);
  const fail = msg => { throw new Error(msg); };

  function create({ maxBytes = 25 * 1024 * 1024, docs = [], log = [], seq = 0 } = {}) {
    const state = { docs: docs.map(d => ({ ...d, links: d.links.map(l => ({ ...l })) })), log: log.slice(), seq };
    const live = d => !d.removed;
    const get = id => state.docs.find(d => d.id === id) || fail(`No file ${id}`);
    const checkLink = l => { if (!l || !l.kind || l.id == null || l.id === '') fail('A file has to be attached to something'); return { kind: l.kind, id: String(l.id), ...(l.role ? { role: l.role } : {}) }; };

    // file: { name, size (bytes), by, at (ISO), ref?, hash?, note? } · link: { kind, id, role? }
    function add(file, link) {
      const name = String(file.name || '').trim();
      if (!name) fail('The file needs a name');
      const type = typeOf(name); if (!type) fail(`${name}: only photos, PDFs, spreadsheets and documents can be attached`);
      if (!(file.size > 0)) fail(`${name} is empty`);
      if (file.size > maxBytes) fail(`${name} is too big (the limit is ${Math.round(maxBytes / 1048576)} MB)`);
      if (!file.by) fail('Who added it?');
      const doc = { id: `F${++state.seq}`, name, type, size: file.size, by: file.by, at: file.at || new Date().toISOString(),
        ref: file.ref || null, hash: file.hash || null, note: file.note || '', links: [checkLink(link)] };
      state.docs.push(doc); state.log.push({ action: 'add', doc: doc.id, name, link: doc.links[0], by: doc.by, at: doc.at });
      return doc;
    }
    function link(id, l, by) {
      const d = get(id), nl = checkLink(l);
      if (!live(d)) fail(`${d.name} was removed`);
      if (d.links.some(x => sameLink(x, nl))) return d;
      d.links.push(nl); state.log.push({ action: 'link', doc: id, link: nl, by }); return d;
    }
    // Take a file off one thing (or off everything when no link is given). locked: the item is in a locked month.
    function remove(id, { link: l, by, reason, locked = false, at } = {}) {
      const d = get(id);
      if (locked) fail(`${d.name} is part of a locked month and has to stay`);
      if (!reason || !String(reason).trim()) fail('Say why it is being removed');
      if (l) { d.links = d.links.filter(x => !sameLink(x, l)); if (d.links.length) { state.log.push({ action: 'unlink', doc: id, link: l, by, reason, at }); return d; } }
      d.removed = { by, reason: String(reason).trim(), at: at || new Date().toISOString() };
      state.log.push({ action: 'remove', doc: id, by, reason: d.removed.reason, at: d.removed.at });
      return d;
    }
    const forItem = (kind, id, role) => state.docs.filter(d => live(d) && d.links.some(l => sameLink(l, { kind, id }) && (!role || l.role === role)));
    const has = (kind, id, role) => forItem(kind, id, role).length > 0;
    const duplicateOf = hash => hash ? state.docs.find(d => live(d) && d.hash === hash) || null : null;
    function search(text = '', { kind, type } = {}) {
      const q = String(text).trim().toLowerCase();
      return state.docs.filter(live).filter(d => (!kind || d.links.some(l => l.kind === kind)) && (!type || d.type === type) && (!q || (d.name + ' ' + d.note).toLowerCase().includes(q)));
    }
    // items: [{ kind, id, label, amount, role? }] — which of them still need a file (amount at or over `over`)
    const missing = (items, { over = 0 } = {}) => items.filter(i => (i.amount == null || Math.abs(i.amount) >= over) && !has(i.kind, i.id, i.role));
    const toJSON = () => ({ docs: state.docs, log: state.log, seq: state.seq });
    return { add, link, remove, get, forItem, has, duplicateOf, search, missing, toJSON,
      get docs() { return state.docs.filter(live); }, get removed() { return state.docs.filter(d => !live(d)); }, get log() { return state.log.slice(); } };
  }
  // How long to keep a file: until the end of the year it belongs to, plus `years` (7 is the usual advice)
  const keepUntil = (dateIso, years = 7) => `${+String(dateIso).slice(0, 4) + years}-12-31`;
  return { create, fromJSON: (j, o = {}) => create({ ...o, ...j }), typeOf, keepUntil, TYPES };
});
