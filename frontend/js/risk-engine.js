import { RULESET_VERSION } from './demo-data.js';

export const FLAT_RATE = 0.0278;
export const n = value => Number(value) || 0;
export const money = value => `S$${n(value).toLocaleString('en-SG', { maximumFractionDigits: 0 })}`;
export const pct = value => `${(value * 100).toFixed(1)}%`;
export const ltvCap = omv => n(omv) <= 20000 ? 0.70 : 0.60;

export const REQUIRED_APPLICATION_FIELDS = Object.freeze([
  Object.freeze({ key: 'name', label: 'Full name', step: 1, kind: 'text', message: 'Enter your full name.' }),
  Object.freeze({ key: 'nric', label: 'NRIC / FIN', step: 1, kind: 'text', message: 'Enter your NRIC or FIN.' }),
  Object.freeze({ key: 'employer', label: 'Employer / business', step: 2, kind: 'text', message: 'Enter your employer or business name.' }),
  Object.freeze({ key: 'empMonths', label: 'Months in current employment', step: 2, kind: 'number', min: 0, message: 'Enter the number of months in your current employment.' }),
  Object.freeze({ key: 'incomeDeclared', label: 'Declared monthly income', step: 2, kind: 'number', min: 0, message: 'Enter your declared monthly income.' }),
  Object.freeze({ key: 'carPrice', label: 'Vehicle price', step: 4, kind: 'number', minExclusive: 0, message: 'Enter a vehicle price greater than zero.' }),
  Object.freeze({ key: 'loanAmount', label: 'Loan amount', step: 4, kind: 'number', minExclusive: 0, message: 'Enter a loan amount greater than zero.' }),
  Object.freeze({ key: 'downPayment', label: 'Down payment', step: 4, kind: 'number', min: 0, message: 'Enter the down payment amount.' })
]);

const CONSENT_ERROR = Object.freeze({
  key: 'consent',
  label: 'Applicant authorization',
  step: 1,
  message: 'Authorize the use of synthetic details before submission.'
});

const requiredFieldIsMissing = (app, definition) => {
  const value = app?.[definition.key];
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (definition.kind !== 'number') return false;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return true;
  if (definition.minExclusive !== undefined && numeric <= definition.minExclusive) return true;
  return definition.min !== undefined && numeric < definition.min;
};

export function normalizeRequiredTextValues(app = {}) {
  const normalized = { ...app };
  for (const definition of REQUIRED_APPLICATION_FIELDS) {
    if (definition.kind === 'text' && typeof normalized[definition.key] === 'string') {
      normalized[definition.key] = normalized[definition.key].trim();
    }
  }
  return normalized;
}

export function requiredFieldErrors(app, { step } = {}) {
  return REQUIRED_APPLICATION_FIELDS
    .filter(definition => step === undefined || definition.step === step)
    .filter(definition => requiredFieldIsMissing(app, definition));
}

export function validateFormAction(app, { action, step, delta = 0 } = {}) {
  if (action === 'save-draft' || (action === 'change-step' && Number(delta) <= 0)) {
    return { valid: true, errors: [], firstInvalidStep: null };
  }

  const errors = action === 'change-step'
    ? requiredFieldErrors(app, { step })
    : action === 'submit-application'
      ? requiredFieldErrors(app)
      : [];

  if (action === 'submit-application' && !app?.consent) errors.push(CONSENT_ERROR);
  return {
    valid: errors.length === 0,
    errors,
    firstInvalidStep: errors.length ? Math.min(...errors.map(error => error.step)) : null
  };
}

export function monthlyPayment(loan, years) {
  const y = n(years) || 1;
  return (n(loan) + n(loan) * FLAT_RATE * y) / (y * 12);
}

export function band(value, table) {
  for (const [max, score, label] of table) if (value < max) return [score, label];
  return [0, ''];
}

export function requiredMissing(app) {
  return requiredFieldErrors(app).map(definition => definition.label);
}

export function findDuplicates(app, allApps = []) {
  return allApps.filter(item => item.nric && item.nric === app.nric && item.id !== app.id);
}

export function evaluate(app, allApps = []) {
  const factors = [], rules = [], questions = [], hard = [];
  const price = n(app.carPrice), loan = n(app.loanAmount), omv = n(app.omv);
  const cap = ltvCap(omv), ltv = price > 0 ? loan / price : 0;
  const monthly = monthlyPayment(loan, app.tenureYears);
  const income = n(app.incomeVerified) || n(app.incomeDeclared);
  const dsr = income > 0 ? (n(app.existingMonthly) + monthly) / income : 1;
  const dpRatio = price > 0 ? n(app.downPayment) / price : 0;
  const gap = n(app.incomeVerified) > 0
    ? Math.abs(n(app.incomeDeclared) - n(app.incomeVerified)) / n(app.incomeVerified) : 0;

  if (price > 0 && ltv > cap + 0.0001) hard.push({ rule: 'MAS-LTV-01', text: `LTV ${pct(ltv)} exceeds the ${pct(cap)} cap for this OMV band`, action: 'Reject' });
  if (n(app.tenureYears) > 7) hard.push({ rule: 'MAS-TENURE-01', text: `Loan tenure of ${app.tenureYears} years exceeds the 7-year cap`, action: 'Reject' });
  const missing = requiredMissing(app);
  if (missing.length) hard.push({ rule: 'DOC-COMPLETE-01', text: `Required information missing: ${missing.join(', ')}`, action: 'Manual Review' });

  const add = (id, label, score, detail, fields) => {
    if (score > 0) {
      factors.push({ id, label, score, fields });
      rules.push(`${id} · ${detail}`);
    }
  };
  const [sDsr, tDsr] = band(dsr, [[0.30, 0, ''], [0.40, 5, 'DSR of 30–40%'], [0.55, 12, 'DSR of 40–55%'], [99, 22, 'DSR above 55%']]);
  add('DSR', `Debt service pressure (DSR ${pct(dsr)})`, sDsr, tDsr, ['existingMonthly', 'incomeVerified', 'loanAmount']);
  if (sDsr >= 12) questions.push('Confirm whether there are undeclared instalments or guarantee obligations.');

  const [sDp, tDp] = band(dpRatio, [[0.35, 10, 'Down payment below 35%'], [0.40, 7, 'Down payment of 35–40%'], [0.45, 4, 'Down payment of 40–45%'], [99, 0, '']]);
  add('DOWN', `Down payment ratio (${pct(dpRatio)})`, sDp, tDp, ['downPayment', 'carPrice']);

  const [sInc, tInc] = band(gap, [[0.05, 0, ''], [0.15, 7, 'Income difference of 5–15%'], [0.30, 13, 'Income difference of 15–30%'], [99, 18, 'Income difference above 30%']]);
  add('INCGAP', `Income consistency (${pct(gap)} difference)`, sInc, tInc, ['incomeDeclared', 'incomeVerified']);
  if (sInc >= 13) questions.push('Request three months of bank statements to verify declared income.');

  const months = n(app.empMonths);
  const [sEmp, tEmp] = band(months, [[6, 8, 'Employed for under 6 months'], [12, 6, 'Employed for 6–12 months'], [24, 3, 'Employed for 12–24 months'], [9999, 0, '']]);
  add('EMP', `Employment stability (${months} months)`, sEmp, tEmp, ['empMonths', 'employer']);
  if (sEmp >= 6) questions.push('Confirm current employment and probation status.');

  const late = n(app.latePayments);
  const [sLate, tLate] = band(late, [[1, 0, ''], [2, 5, 'One late payment in 12 months'], [4, 11, 'Two or three late payments in 12 months'], [999, 15, 'Four or more late payments in 12 months']]);
  add('LATE', `Late-payment history (${late})`, sLate, tLate, ['latePayments', 'outstanding']);
  if (sLate >= 11) questions.push('Review late-payment details and confirm that all arrears are settled.');

  const life = n(app.carAge) + n(app.tenureYears);
  add('CAR', `Vehicle age and residual value (${life} years total)`, life > 10 ? 6 : 0, 'Vehicle age plus tenure exceeds 10 years', ['carAge', 'tenureYears']);

  const duplicates = findDuplicates(app, allApps);
  if (duplicates.length) {
    factors.push({ id: 'DUP', label: `Duplicate application (${duplicates.length} with the same NRIC)`, score: 6, fields: ['nric'] });
    rules.push('DUP · Another current or historical application uses the same NRIC');
    questions.push(`Confirm whether ${duplicates.map(item => item.id).join(', ')} relates to the same borrowing purpose.`);
  }

  let score = Math.max(0, Math.min(100, Math.round(8 + factors.reduce((sum, item) => sum + item.score, 0))));
  const level = score >= 65 ? 'High' : score >= 35 ? 'Medium' : 'Low';
  let recommendation = level === 'High' ? 'Reject' : level === 'Medium' ? 'Manual Review' : 'Approve';
  if (hard.some(item => item.action === 'Reject')) recommendation = 'Reject';
  else if (hard.length) recommendation = 'Manual Review';
  factors.sort((a, b) => b.score - a.score);
  return { score, level, recommendation, factors, rules, questions, hard, modelVersion: RULESET_VERSION, metrics: { ltv, cap, dsr, dpRatio, gap, monthly } };
}
