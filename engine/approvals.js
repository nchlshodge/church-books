// Church Books engine — who has to approve spending, and whether it's approved yet.
//
// A church's policies set approval tiers by amount, e.g.
//   approvalTiers: [{ upTo: 500, approvals: 1 }, { upTo: 10000, approvals: 2 }, { upTo: null, approvals: 2, board: true }]
//   approvers: ['nick', 'pat']            // who may approve (defaults to the reviewers)
//   restrictedMinApprovals: 2             // money given for a purpose always gets at least this many
// Rules that always hold: nobody approves their own spending, a person counts once, and a
// tier marked board needs a recorded board vote (date + where it's written down).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksApprovals = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const tiersOf = pol => (pol.approvalTiers && pol.approvalTiers.length ? pol.approvalTiers : [{ upTo: null, approvals: 1 }]);
  const approversOf = pol => pol.approvers || pol.reviewers || [];

  // What this amount needs. amount is in dollars (or cents — just be consistent with upTo).
  function planFor(pol, { amount, restricted }) {
    const tier = tiersOf(pol).find(t => t.upTo == null || amount <= t.upTo);
    let approvals = tier.approvals;
    if (restricted) approvals = Math.max(approvals, pol.restrictedMinApprovals || 0);
    return { tier, approvals, board: !!tier.board, restricted: !!restricted };
  }

  // approvals: [{ by: personId, on }] or { kind: 'board', on, note }. submitter: personId who spent / entered it.
  function status(pol, plan, approvals, { submitter } = {}) {
    const allowed = approversOf(pol), seen = new Set(), problems = [];
    const people = [];
    (approvals || []).filter(a => a.kind !== 'board').forEach(a => {
      if (a.by === submitter) problems.push('self');
      else if (!allowed.includes(a.by)) problems.push('not_allowed');
      else if (seen.has(a.by)) problems.push('twice');
      else { seen.add(a.by); people.push(a.by); }
    });
    const boardOk = !plan.board || (approvals || []).some(a => a.kind === 'board' && a.on);
    const done = people.length >= plan.approvals && boardOk;
    const canStill = allowed.filter(id => id !== submitter && !seen.has(id));
    return { done, have: people.length, need: plan.approvals, boardOk, people, problems, canStill,
      stuck: !done && people.length + canStill.length < plan.approvals };   // not enough eligible people left
  }

  // Setup check: tiers go up in order, end with "everything above", and there are enough approvers.
  function validate(pol, people) {
    const out = [], tiers = pol.approvalTiers;
    if (!tiers) return out;
    if (!tiers.length) return ['Approval tiers: add at least one'];
    tiers.forEach((t, i) => {
      if (!(t.approvals >= 1)) out.push(`Approval tier ${i + 1}: needs at least one approval`);
      if (i < tiers.length - 1 && !(t.upTo > 0)) out.push(`Approval tier ${i + 1}: set the amount it goes up to`);
      if (i > 0 && t.upTo != null && tiers[i - 1].upTo != null && t.upTo <= tiers[i - 1].upTo) out.push(`Approval tier ${i + 1}: amounts have to go up`);
    });
    if (tiers[tiers.length - 1].upTo != null) out.push('Approval tiers: the last one should cover everything above (no upper limit)');
    const approvers = approversOf(pol);
    approvers.forEach(id => { if (!people[id]) out.push(`Approver "${id}" isn't one of the church's people`); });
    const most = Math.max(...tiers.map(t => t.approvals), pol.restrictedMinApprovals || 0);
    if (approvers.length < most) out.push(`Some spending needs ${most} approvals, but only ${approvers.length} ${approvers.length === 1 ? 'person is' : 'people are'} set up to approve`);
    return out;
  }

  return { planFor, status, validate };
});
