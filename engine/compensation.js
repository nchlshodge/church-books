// Fundwell engine — staff pay and raises. Pay grades (a midpoint with a range around it), where each person
// lands by years of service and hours, the whole package (salary, housing, health, retirement, gifts), what it
// costs the church, and how next year compares with this year. Pure math; whole cents.
//
// Clergy: the church pays no employer Social Security/Medicare for credentialed ministers (they pay SECA), and a
// housing allowance only splits the same pay into salary + housing — it doesn't change the church's cost.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BooksComp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const FICA = 0.0765;
  // The lines of a pay package, in the order a statement shows them
  const ITEMS = [
    { key: 'salary', label: 'Salary', icon: '💵', cash: true },
    { key: 'housing', label: 'Housing allowance', icon: '🏠', cash: true },
    { key: 'health', label: 'Health insurance', icon: '🩺' },
    { key: 'retirement', label: 'Retirement', icon: '🏦' },
    { key: 'other', label: 'Other benefits', icon: '📱' },
    { key: 'appreciation', label: 'Pastor appreciation', icon: '🙏', cash: true },
    { key: 'christmas', label: 'Christmas bonus', icon: '🎄', cash: true },
  ];
  // grade: { midpoint } (full-time annual, cents) · spread: 0.15 = min 85%, max 115% of the midpoint
  const range = (grade, spread = 0.15) => ({ min: Math.round(grade.midpoint * (1 - spread)), mid: grade.midpoint, max: Math.round(grade.midpoint * (1 + spread)) });
  // Where someone lands: from the grade minimum toward the maximum by years of service, prorated by hours,
  // and never below the minimum wage for those hours.
  function target(person, grade, { spread = 0.15, yearsToMax = 15, fullTimeHours = 40, minWage = 0 } = {}) {
    if (!grade) return null;
    const r = range(grade, spread), share = Math.min(1, Math.max(0, (person.years || 0) / yearsToMax)), hours = person.hours || fullTimeHours;
    const part = Math.min(1, hours / fullTimeHours);   // full time and more counts as full time
    const fte = r.min + (r.max - r.min) * share, prorated = Math.round(fte * part);
    const floor = Math.round(minWage * hours * 52);
    return { amount: Math.max(prorated, floor), min: Math.round(r.min * part), max: Math.round(r.max * part), floor, byFloor: floor > prorated };
  }
  // pkg: { salary, housing, health, retirement, other, appreciation, christmas } (cents) · clergy: true/false
  function total(pkg, { clergy = false } = {}) {
    const v = k => pkg[k] || 0, pay = v('salary') + v('housing'), cashGifts = v('appreciation') + v('christmas');
    const comp = ITEMS.reduce((s, i) => s + v(i.key), 0);
    const employerTax = clergy ? 0 : Math.round((pay + cashGifts) * FICA);   // gifts in cash are wages too
    return { pay, comp, employerTax, cost: comp + employerTax, cash: pay + cashGifts };
  }
  // Retirement as the Michigan Ministry Network suggests: a fixed amount, and/or 50¢ per $1 up to a share of pay
  const retirement = ({ fixed = 0, matchRate = 0.5, matchCap = 0.025, contributes = true } = {}, pay) => fixed + (contributes ? Math.round(pay * matchCap * matchRate) : 0);
  function change(before, after) {
    const d = after - before;
    return { amount: d, pct: before ? d / before : null };
  }
  // people: [{ clergy, now: pkg, next: pkg, target? }] → totals for this year and next, and who needs a look
  function summary(people) {
    const add = (k, f) => people.reduce((s, p) => s + f(total(p[k] || {}, p)), 0);
    const now = { pay: add('now', t => t.pay), comp: add('now', t => t.comp), tax: add('now', t => t.employerTax), cost: add('now', t => t.cost) };
    const next = { pay: add('next', t => t.pay), comp: add('next', t => t.comp), tax: add('next', t => t.employerTax), cost: add('next', t => t.cost) };
    return { now, next, raise: change(now.pay, next.pay), cost: change(now.cost, next.cost),
      belowRange: people.filter(p => p.target && total(p.next || {}, p).pay < p.target.min).length,
      belowFloor: people.filter(p => p.target && p.target.floor && total(p.next || {}, p).pay < p.target.floor).length };
  }
  return { FICA, ITEMS, range, target, total, retirement, change, summary };
});
