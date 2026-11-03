const test = require('node:test'), assert = require('node:assert');
const C = require('../compensation.js');

test('pay grades: placement by years, prorated by hours, never below minimum wage', () => {
  const grade = { midpoint: 6000000 };                                   // $60,000 full time
  assert.deepStrictEqual(C.range(grade), { min: 5100000, mid: 6000000, max: 6900000 });
  assert.strictEqual(C.target({ years: 0, hours: 40 }, grade).amount, 5100000);
  assert.strictEqual(C.target({ years: 15, hours: 40 }, grade).amount, 6900000);
  assert.strictEqual(C.target({ years: 30, hours: 40 }, grade).amount, 6900000);   // capped at the top of the range
  assert.strictEqual(C.target({ years: 5, hours: 20 }, grade).amount, 2850000);    // $57,000 × half time
  assert.strictEqual(C.target({ years: 15, hours: 50 }, grade).amount, 6900000);   // more than full time is still full time
  const tiny = C.target({ years: 0, hours: 8 }, { midpoint: 3000000 }, { minWage: 1500 });   // $15/hr × 8 hrs × 52
  assert.deepStrictEqual([tiny.amount, tiny.byFloor], [624000, true]);
});

test('the package: clergy cost the church no employer tax; housing is part of pay, not extra', () => {
  const pkg = { salary: 5000000, housing: 2000000, health: 1200000, retirement: 87500, appreciation: 50000, christmas: 100000 };
  const pastor = C.total(pkg, { clergy: true }), staff = C.total({ ...pkg, housing: 0, salary: 7000000 }, { clergy: false });
  assert.deepStrictEqual([pastor.pay, pastor.comp, pastor.employerTax, pastor.cost], [7000000, 8437500, 0, 8437500]);
  assert.strictEqual(staff.employerTax, Math.round((7000000 + 150000) * 0.0765));
  assert.strictEqual(C.retirement({ fixed: 50000 }, 7000000), 50000 + 87500);   // $500 + 50% of 2.5% of $70,000
});

test('raises: this year against next, and who is below their range', () => {
  const people = [
    { clergy: true, now: { salary: 5000000, housing: 1000000 }, next: { salary: 5100000, housing: 1100000 }, target: { min: 5500000, floor: 0 } },
    { clergy: false, now: { salary: 3000000 }, next: { salary: 3090000 }, target: { min: 3200000, floor: 3120000 } },
  ];
  const s = C.summary(people);
  assert.deepStrictEqual([s.now.pay, s.next.pay, s.raise.amount, s.belowRange, s.belowFloor], [9000000, 9290000, 290000, 1, 1]);
  assert.strictEqual(Math.round(s.raise.pct * 1000) / 10, 3.2);
  assert.strictEqual(s.next.cost, 9290000 + Math.round(3090000 * 0.0765));
});
