import assert from 'node:assert/strict';

import { serializeApplication } from './api-mappers.js';
import { PRESETS } from './demo-data.js';
import {
  applyProvenanceAwareEdit,
  applyProviderRetrieval,
  fieldProvenance,
  invalidatedProviderFlags,
  PROVIDER_GROUPS,
  providerForField,
  providerRetrieved
} from './provenance.js';
import { caseView } from './views.js';

assert.deepEqual(PROVIDER_GROUPS.myinfo.fields, [
  'name',
  'nric',
  'age',
  'residency',
  'phone',
  'education',
  'marital'
]);
assert.equal(PROVIDER_GROUPS.myinfo.flag, 'myinfoPulled');

assert.deepEqual(PROVIDER_GROUPS.cpf.fields, ['incomeVerified']);
assert.equal(PROVIDER_GROUPS.cpf.flag, 'cpfPulled');

assert.deepEqual(PROVIDER_GROUPS.creditReport.fields, [
  'existingMonthly',
  'outstanding',
  'latePayments',
  'otherLoans'
]);
assert.equal(PROVIDER_GROUPS.creditReport.flag, 'creditPulled');

assert.equal(providerForField('employer'), null);
assert.equal(providerForField('empType'), null);
assert.equal(providerForField('title'), null);
assert.equal(providerForField('incomeDeclared'), null);

const fullyRetrieved = {
  myinfoPulled: true,
  cpfPulled: true,
  creditPulled: true,
  name: 'Applicant',
  incomeVerified: 6000,
  existingMonthly: 500
};

assert.deepEqual(fieldProvenance(fullyRetrieved, 'name'), {
  sourceLabel: 'MyInfo',
  stateLabel: 'Verified',
  stateClass: 'verified'
});
assert.deepEqual(fieldProvenance({ ...fullyRetrieved, myinfoPulled: false }, 'name'), {
  sourceLabel: 'Applicant',
  stateLabel: 'Self-declared',
  stateClass: 'declared'
});
assert.deepEqual(fieldProvenance(fullyRetrieved, 'incomeVerified'), {
  sourceLabel: 'CPF',
  stateLabel: 'Verified',
  stateClass: 'verified'
});
assert.deepEqual(
  fieldProvenance({ ...fullyRetrieved, cpfPulled: false }, 'incomeVerified'),
  {
    sourceLabel: 'Applicant',
    stateLabel: 'Self-declared',
    stateClass: 'declared'
  }
);
assert.deepEqual(fieldProvenance(fullyRetrieved, 'existingMonthly'), {
  sourceLabel: 'Credit report',
  stateLabel: 'Verified',
  stateClass: 'verified'
});
assert.deepEqual(fieldProvenance({ ...fullyRetrieved, name: '' }, 'name'), {
  sourceLabel: 'Applicant',
  stateLabel: 'Not provided',
  stateClass: 'pending'
});

for (const field of ['empType', 'employer', 'title', 'incomeDeclared']) {
  assert.notEqual(fieldProvenance(fullyRetrieved, field).sourceLabel, 'CPF');
}

const myinfoEdited = applyProvenanceAwareEdit(fullyRetrieved, 'name', 'Edited name');
assert.equal(myinfoEdited.name, 'Edited name');
assert.equal(myinfoEdited.myinfoPulled, false);
assert.equal(myinfoEdited.cpfPulled, true);
assert.equal(myinfoEdited.creditPulled, true);

const cpfEdited = applyProvenanceAwareEdit(fullyRetrieved, 'incomeVerified', '6100');
assert.equal(cpfEdited.incomeVerified, '6100');
assert.equal(cpfEdited.myinfoPulled, true);
assert.equal(cpfEdited.cpfPulled, false);
assert.equal(cpfEdited.creditPulled, true);

const unchangedCpf = applyProvenanceAwareEdit(fullyRetrieved, 'incomeVerified', '6000');
assert.equal(unchangedCpf.cpfPulled, true);

const creditEdited = applyProvenanceAwareEdit(fullyRetrieved, 'latePayments', '1');
assert.equal(creditEdited.latePayments, '1');
assert.equal(creditEdited.myinfoPulled, true);
assert.equal(creditEdited.cpfPulled, true);
assert.equal(creditEdited.creditPulled, false);

const ordinaryEdited = applyProvenanceAwareEdit(fullyRetrieved, 'employer', 'Manual Employer');
assert.equal(ordinaryEdited.employer, 'Manual Employer');
assert.equal(ordinaryEdited.myinfoPulled, true);
assert.equal(ordinaryEdited.cpfPulled, true);
assert.equal(ordinaryEdited.creditPulled, true);

assert.deepEqual(invalidatedProviderFlags(cpfEdited), {
  cpfPulled: false
});

assert.deepEqual(
  serializeApplication({
    myinfoPulled: false,
    cpfPulled: false,
    creditPulled: false,
    incomeVerified: '6100'
  }, { patch: true }),
  {
    myinfoPulled: false,
    cpfPulled: false,
    creditPulled: false,
    incomeVerified: 6100
  }
);

const savedCpfEdit = {
  ...fullyRetrieved,
  ...serializeApplication(cpfEdited, { patch: true })
};
assert.equal(savedCpfEdit.incomeVerified, 6100);
assert.equal(savedCpfEdit.cpfPulled, false);
assert.notEqual(fieldProvenance(savedCpfEdit, 'incomeVerified').stateLabel, 'Verified');

const manualDraft = {
  id: 'APP-1',
  consent: false,
  myinfoPulled: false,
  cpfPulled: false,
  creditPulled: false,
  name: 'Manual name',
  employer: 'Manual Employer',
  incomeDeclared: 5200,
  incomeVerified: 5000,
  existingMonthly: 300,
  carModel: 'Manual car'
};

const myinfoRetrieved = applyProviderRetrieval(manualDraft, {
  ...manualDraft,
  consent: true,
  myinfoPulled: true,
  name: 'MyInfo name',
  employer: 'Must not replace manual employer'
}, 'myinfo');
assert.equal(myinfoRetrieved.myinfoPulled, true);
assert.equal(myinfoRetrieved.name, 'MyInfo name');
assert.equal(myinfoRetrieved.consent, true);
assert.equal(myinfoRetrieved.employer, 'Manual Employer');

const cpfRetrieved = applyProviderRetrieval(manualDraft, {
  ...manualDraft,
  cpfPulled: true,
  incomeVerified: 6000,
  employer: 'Must not replace manual employer'
}, 'cpf');
assert.equal(cpfRetrieved.cpfPulled, true);
assert.equal(cpfRetrieved.incomeVerified, 6000);
assert.equal(cpfRetrieved.employer, 'Manual Employer');
assert.equal(cpfRetrieved.incomeDeclared, 5200);

const creditRetrieved = applyProviderRetrieval(manualDraft, {
  ...manualDraft,
  creditPulled: true,
  existingMonthly: 500,
  outstanding: 12000,
  latePayments: 0,
  otherLoans: 1,
  carModel: 'Must not replace manual car'
}, 'creditReport');
assert.equal(creditRetrieved.creditPulled, true);
assert.equal(creditRetrieved.existingMonthly, 500);
assert.equal(creditRetrieved.outstanding, 12000);
assert.equal(creditRetrieved.latePayments, 0);
assert.equal(creditRetrieved.otherLoans, 1);
assert.equal(creditRetrieved.carModel, 'Manual car');

for (const preset of Object.values(PRESETS)) {
  assert.equal('myinfoPulled' in preset, false);
  assert.equal('cpfPulled' in preset, false);
  assert.equal('creditPulled' in preset, false);
  const presetOnly = { ...preset, myinfoPulled: false, cpfPulled: false, creditPulled: false };
  assert.notEqual(fieldProvenance(presetOnly, 'name').stateLabel, 'Verified');
  assert.notEqual(fieldProvenance(presetOnly, 'incomeVerified').stateLabel, 'Verified');
  assert.notEqual(fieldProvenance(presetOnly, 'existingMonthly').stateLabel, 'Verified');
}

const caseResult = {
  score: 20,
  level: 'Low',
  recommendation: 'Approve',
  modelVersion: 'test-model',
  metrics: {
    ltv: 0.6,
    cap: 0.7,
    dsr: 0.2,
    gap: 0,
    monthly: 1000
  },
  factors: [],
  hard: [],
  rules: [],
  questions: []
};

const caseApplication = {
  ...PRESETS.low,
  id: 'APP-CASE',
  status: 'reviewing',
  myinfoPulled: true,
  cpfPulled: false,
  creditPulled: true,
  decision: null,
  officerNote: ''
};
const caseHtml = caseView(caseApplication, caseResult, [caseApplication]);

const profileRow = (html, field) => {
  const start = html.indexOf(`id="f_${field}"`);
  assert.notEqual(start, -1, `Missing profile row for ${field}`);
  const end = html.indexOf('<div class="frow"', start + 1);
  return html.slice(start, end === -1 ? undefined : end);
};

assert.match(profileRow(caseHtml, 'name'), /MyInfo[\s\S]*Verified/);
assert.match(profileRow(caseHtml, 'incomeVerified'), /Applicant[\s\S]*Self-declared/);
assert.doesNotMatch(profileRow(caseHtml, 'incomeVerified'), /CPF[\s\S]*Verified/);
assert.match(profileRow(caseHtml, 'existingMonthly'), /Credit report[\s\S]*Verified/);
assert.match(profileRow(caseHtml, 'employer'), /Applicant[\s\S]*Self-declared/);
assert.doesNotMatch(profileRow(caseHtml, 'employer'), /CPF/);
assert.match(
  caseHtml,
  /CPF contribution record<br><span class="muted">Not retrieved<\/span>[\s\S]*?<span class="tag t-warn">Attention<\/span>/
);

const missingNameHtml = caseView(
  { ...caseApplication, name: null },
  caseResult,
  [{ ...caseApplication, name: null }]
);
assert.doesNotMatch(profileRow(missingNameHtml, 'name'), />Verified</);

const missingCpfIncomeHtml = caseView(
  { ...caseApplication, cpfPulled: true, incomeVerified: null },
  caseResult,
  [{ ...caseApplication, cpfPulled: true, incomeVerified: null }]
);
assert.doesNotMatch(profileRow(missingCpfIncomeHtml, 'incomeVerified'), />Verified</);

const cpfRetrievedHtml = caseView(
  { ...caseApplication, cpfPulled: true },
  caseResult,
  [{ ...caseApplication, cpfPulled: true }]
);
assert.match(
  cpfRetrievedHtml,
  /CPF contribution record<br><span class="muted">Retrieved<\/span>[\s\S]*?<span class="tag t-ok">Complete<\/span>/
);
assert.equal(providerRetrieved(caseApplication, 'cpf'), false);
assert.equal(providerRetrieved({ ...caseApplication, cpfPulled: true }, 'cpf'), true);

console.log('PROVENANCE_TEST_OK');
