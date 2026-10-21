// Church Books engine — the standard chart of accounts every church starts with.
// A church's own setup adds its bank accounts (1000–1099), cards (2000–2099) and
// giving funds (4000–4099), plus any extra accounts it wants.
//
// Account types and which side makes them grow:
//   asset, expense            → debit
//   liability, net_assets,
//   income                    → credit
//
// Codes the engine relies on: 1100 counted-not-deposited, 2100 bills to pay, 2150 reimbursements owed, 3000 fund balance,
// 4950/5950 transfers between funds, 5500 processing fees. Everything else is a sensible default a church can rename.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksTemplate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STANDARD_ACCOUNTS = [
    { code: '1100', name: 'Counted, not yet deposited', type: 'asset', sub: 'transit' },
    { code: '1300', name: 'Donated items to sell', type: 'asset', sub: 'noncash' },
    { code: '1500', name: 'Construction in progress', type: 'asset', sub: 'building' },
    { code: '1600', name: 'Equipment & vehicles', type: 'asset', sub: 'fixed' },
    { code: '1610', name: 'Buildings', type: 'asset', sub: 'fixed' },
    { code: '1620', name: 'Land', type: 'asset', sub: 'fixed' },
    { code: '1630', name: 'Furniture & fixtures', type: 'asset', sub: 'fixed' },
    { code: '1640', name: 'Outdoor improvements', type: 'asset', sub: 'fixed' },
    { code: '1690', name: 'Less accumulated depreciation', type: 'asset', sub: 'contra' },
    { code: '1950', name: 'Due between funds', type: 'asset', sub: 'interfund' },   // imported entries whose classes didn't balance by fund; nets to zero
    { code: '2100', name: 'Bills to pay', type: 'liability', sub: 'payable' },
    { code: '2150', name: 'Reimbursements owed', type: 'liability', sub: 'payable' },
    { code: '2200', name: 'Payroll taxes owed', type: 'liability', sub: 'payroll' },
    { code: '2300', name: 'Rental deposits held', type: 'liability', sub: 'deposit' },
    { code: '2400', name: 'Received for future events', type: 'liability', sub: 'deferred' },
    { code: '3000', name: 'Fund balance', type: 'net_assets' },
    { code: '4100', name: 'Event registrations', type: 'income' },
    { code: '4200', name: 'Building rental', type: 'income' },
    { code: '4800', name: 'Non-cash gifts', type: 'income', sub: 'noncash' },
    { code: '4810', name: 'Gain or loss on donated items sold', type: 'income', sub: 'noncash' },
    { code: '4900', name: 'Interest', type: 'income' },
    { code: '4950', name: 'Transfers in from other funds', type: 'income', sub: 'transfer' },
    { code: '5000', name: 'Salaries & wages', type: 'expense', sub: 'payroll' },
    { code: '5010', name: 'Housing allowance', type: 'expense', sub: 'payroll' },
    { code: '5020', name: 'Employer payroll taxes', type: 'expense', sub: 'payroll' },
    { code: '5100', name: 'Ministry supplies', type: 'expense' },
    { code: '5110', name: 'Events', type: 'expense' },
    { code: '5120', name: 'Hospitality & meals', type: 'expense' },
    { code: '5200', name: 'Utilities', type: 'expense' },
    { code: '5210', name: 'Repairs & maintenance', type: 'expense' },
    { code: '5220', name: 'Building supplies', type: 'expense' },
    { code: '5300', name: 'Office supplies', type: 'expense' },
    { code: '5310', name: 'Software & subscriptions', type: 'expense' },
    { code: '5400', name: 'Missionary support', type: 'expense' },
    { code: '5410', name: 'Benevolence', type: 'expense' },
    { code: '5420', name: 'Architect & design', type: 'expense' },
    { code: '5500', name: 'Processing fees', type: 'expense' },
    { code: '5600', name: 'Bank fees', type: 'expense' },
    { code: '5800', name: 'Depreciation', type: 'expense', sub: 'noncash' },
    { code: '5950', name: 'Transfers out to other funds', type: 'expense', sub: 'transfer' },
  ];
  return { STANDARD_ACCOUNTS };
});
