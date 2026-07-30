import assert from 'node:assert/strict';

import {
  evaluate,
  normalizeRequiredTextValues,
  requiredFieldErrors,
  validateFormAction
} from './risk-engine.js';
import { formView } from './views.js';

const completeApplication = {
  consent: true,
  name: 'Test Applicant',
  nric: 'S8000001A',
  employer: 'Example Pte Ltd',
  empMonths: 20,
  incomeDeclared: 6000,
  carPrice: 115000,
  loanAmount: 71300,
  downPayment: 43700
};

assert.deepEqual(
  requiredFieldErrors({ ...completeApplication, employer: '' }).map(error => error.key),
  ['employer']
);
assert.deepEqual(
  requiredFieldErrors({ ...completeApplication, employer: '   ' }).map(error => error.key),
  ['employer']
);
assert.equal(requiredFieldErrors(completeApplication).length, 0);

const blockedContinue = validateFormAction(
  { ...completeApplication, employer: ' ' },
  { action: 'change-step', step: 2, delta: 1 }
);
assert.equal(blockedContinue.valid, false);
assert.deepEqual(blockedContinue.errors.map(error => error.key), ['employer']);

const allowedBack = validateFormAction(
  { ...completeApplication, employer: '' },
  { action: 'change-step', step: 2, delta: -1 }
);
assert.equal(allowedBack.valid, true);

const allowedSave = validateFormAction(
  { ...completeApplication, employer: '' },
  { action: 'save-draft', step: 2 }
);
assert.equal(allowedSave.valid, true);

const blockedSubmit = validateFormAction(
  { ...completeApplication, employer: '' },
  { action: 'submit-application' }
);
assert.equal(blockedSubmit.valid, false);
assert.equal(blockedSubmit.firstInvalidStep, 2);
assert.deepEqual(blockedSubmit.errors.map(error => error.key), ['employer']);

const earliestInvalidStep = validateFormAction(
  { ...completeApplication, name: ' ', employer: '' },
  { action: 'submit-application' }
);
assert.equal(earliestInvalidStep.firstInvalidStep, 1);

assert.deepEqual(
  normalizeRequiredTextValues({
    ...completeApplication,
    name: '  Test Applicant  ',
    employer: '  Example  Holdings  '
  }),
  {
    ...completeApplication,
    name: 'Test Applicant',
    employer: 'Example  Holdings'
  }
);

const stepTwoHtml = formView({
  app: {
    ...completeApplication,
    id: 'APP-TEST',
    status: 'draft',
    employer: '',
    cpfPulled: false,
    incomeVerified: null,
    tenureYears: 5
  },
  step: 2,
  assessment: evaluate(completeApplication),
  errors: { employer: 'Enter your employer or business name.' },
  validationSummary: 'Complete the required fields before continuing.'
});
assert.match(stepTwoHtml, /name="employer"[^>]*required aria-required="true"/);
assert.match(stepTwoHtml, /name="employer"[^>]*aria-invalid="true"[^>]*aria-describedby="error-employer"/);
assert.match(stepTwoHtml, /Enter your employer or business name\./);
assert.match(stepTwoHtml, /Simulated CPF contribution record/);
assert.match(
  stepTwoHtml,
  /Employment details and declared income must still be entered by the applicant\./
);
assert.match(stepTwoHtml, /Demo data &middot; CPF record not retrieved/);
assert.match(stepTwoHtml, /name="incomeVerified"[^>]*type="number"/);
assert.doesNotMatch(stepTwoHtml, /name="incomeVerified"[^>]*readonly/);

const retrievedStepTwoHtml = formView({
  app: {
    ...completeApplication,
    id: 'APP-TEST',
    status: 'draft',
    cpfPulled: true,
    incomeVerified: 6000,
    tenureYears: 5
  },
  step: 2,
  assessment: evaluate(completeApplication)
});
assert.match(retrievedStepTwoHtml, /Retrieved &middot; CPF record linked/);

console.log('RISK_ENGINE_VALIDATION_TEST_OK');
