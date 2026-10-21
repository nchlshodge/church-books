const test = require('node:test');
const assert = require('node:assert');
const A = require('../approvals.js');

const POL = { reviewers: ['nick'], approvers: ['nick', 'pat'], restrictedMinApprovals: 2,
  approvalTiers: [{ upTo: 500, approvals: 1 }, { upTo: 10000, approvals: 2 }, { upTo: null, approvals: 2, board: true }] };

test('the amount picks the tier; money given for a purpose always gets two', () => {
  assert.strictEqual(A.planFor(POL, { amount: 142.60 }).approvals, 1);
  assert.strictEqual(A.planFor(POL, { amount: 500 }).approvals, 1);                 // "up to" includes the limit
  assert.strictEqual(A.planFor(POL, { amount: 500.01 }).approvals, 2);
  assert.ok(A.planFor(POL, { amount: 12400 }).board);
  assert.strictEqual(A.planFor(POL, { amount: 88, restricted: true }).approvals, 2);
  assert.strictEqual(A.planFor({ reviewers: ['x'] }, { amount: 1e6 }).approvals, 1);   // no tiers set: one approval
});

test('nobody approves their own spending, a person counts once, and big ones need a board vote', () => {
  const plan = A.planFor(POL, { amount: 12400 });
  let s = A.status(POL, plan, [{ by: 'nick', on: 'Oct 18' }], { submitter: 'dana' });
  assert.deepStrictEqual([s.done, s.have, s.need, s.boardOk], [false, 1, 2, false]);
  s = A.status(POL, plan, [{ by: 'nick' }, { by: 'nick' }, { by: 'dana' }, { by: 'stranger' }], { submitter: 'dana' });
  assert.strictEqual(s.have, 1);
  assert.deepStrictEqual(s.problems.sort(), ['not_allowed', 'self', 'twice']);
  s = A.status(POL, plan, [{ by: 'nick' }, { by: 'pat' }, { kind: 'board', on: '2026-10-12', note: 'Minutes §4' }], { submitter: 'dana' });
  assert.ok(s.done);
  // Nick can't approve his own $900 purchase, and only Pat is left — two approvals can't happen
  const mine = A.status(POL, A.planFor(POL, { amount: 900 }), [{ by: 'pat' }], { submitter: 'nick' });
  assert.ok(mine.stuck && !mine.done);
});

test('approval settings are checked when the church is set up', () => {
  assert.deepStrictEqual(A.validate(POL, { nick: {}, pat: {} }), []);
  const p = A.validate({ approvers: ['nick'], approvalTiers: [{ upTo: 1000, approvals: 1 }, { upTo: 500, approvals: 3 }] }, { nick: {} }).join('\n');
  assert.match(p, /amounts have to go up/); assert.match(p, /cover everything above/); assert.match(p, /needs 3 approvals, but only 1 person/);
});
