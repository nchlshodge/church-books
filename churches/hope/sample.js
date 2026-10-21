// Hope Fellowship has empty books: everything comes in through the import (samples/import/).
(function (root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CHURCH_SAMPLE = data;
})(typeof self !== 'undefined' ? self : this, {
  today: '2026-04-15',
  statementThrough: 'Apr 14',
  payrollSchedule: { frequency: 'Monthly', next: 'Apr 30', approveBy: 'Apr 28' },
  payouts: [], cash: [], expenses: [], subscriptions: [], inbox: [], bankLines: [], staff: [], checks: [], vendors: [], bills: [], schedules: [], requests: [],
  nonCash: [], donors: [], pledges: [], pledgeCampaigns: [], rentals: [], partners: [], pushes: [], assets: [],
  registrations: { events: [], payouts: [], refunds: [] }, commitments: {},
});
