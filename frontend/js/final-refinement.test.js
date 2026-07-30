import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { serializeApplication } from './api-mappers.js';
import { PRESETS } from './demo-data.js';
import { applyProviderRetrieval } from './provenance.js';
import { applicantHomeView, caseView, formView } from './views.js';

const appSource = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');

const assessment = {
  score: 23,
  level: 'Low',
  recommendation: 'Approve',
  modelVersion: 'test-model',
  factors: [{
    id: 'DSR',
    label: 'debt_service_ratio',
    score: 5,
    fields: ['existingMonthly', 'incomeVerified', 'loanAmount']
  }],
  questions: ['verify_undeclared_installments_or_guarantees'],
  hard: [],
  rules: [],
  metrics: {
    gap: 0,
    ltv: 0.62,
    cap: 0.7,
    dsr: 0.32,
    monthly: 1200
  }
};

const application = {
  id: 'APP-UI',
  status: 'reviewing',
  consent: true,
  myinfoPulled: false,
  cpfPulled: false,
  creditPulled: false,
  name: 'Applicant Example',
  nric: 'S1••••23A',
  age: 35,
  residency: 'Singapore Citizen',
  phone: '9•••1234',
  education: 'Diploma',
  marital: 'Single',
  empType: 'Full-time employee',
  employer: 'Example Pte. Ltd.',
  title: 'Analyst',
  empMonths: 24,
  incomeDeclared: 5000,
  incomeVerified: 5000,
  existingMonthly: 500,
  outstanding: 10000,
  latePayments: 0,
  otherLoans: 1,
  carModel: 'Example Car',
  carPrice: 100000,
  omv: 20000,
  carAge: 2,
  downPayment: 30000,
  loanAmount: 70000,
  tenureYears: 5,
  decision: null,
  officerNote: ''
};

function renderCase(status, overrides = {}, decisionState = null) {
  const current = { ...application, ...overrides, status };
  return caseView(current, assessment, [current], decisionState);
}

function assertHumanPanelContains(html, pattern) {
  const humanPanelStart = html.indexOf('<section class="human-decision-panel"');
  assert.notEqual(humanPanelStart, -1);
  assert.ok(html.slice(humanPanelStart).match(pattern));
}

const reviewingHtml = renderCase('reviewing');
const analysisPanelStart = reviewingHtml.indexOf('<div class="decision-analysis-panel">');
const humanPanelStart = reviewingHtml.indexOf('<section class="human-decision-panel"');
assert.notEqual(reviewingHtml.indexOf('<div class="decision-workspace">'), -1);
assert.notEqual(analysisPanelStart, -1);
assert.notEqual(humanPanelStart, -1);
assert.ok(analysisPanelStart < humanPanelStart);
assert.ok(reviewingHtml.indexOf('Model recommendation') > analysisPanelStart);
assert.ok(reviewingHtml.indexOf('Model recommendation') < humanPanelStart);
assert.match(
  reviewingHtml,
  /<div class="human-decision-heading"><b id="human-decision-title-APP-UI" class="section-label">Human decision<\/b><span>Officer-owned outcome<\/span><\/div>/
);
assertHumanPanelContains(reviewingHtml, /data-action="pick-decision"[^>]*data-decision="Approve"[^>]*data-id="APP-UI"/);
assertHumanPanelContains(reviewingHtml, /data-action="pick-decision"[^>]*data-decision="Request Info"[^>]*data-id="APP-UI"/);
assertHumanPanelContains(reviewingHtml, /data-action="pick-decision"[^>]*data-decision="Reject"[^>]*data-id="APP-UI"/);
assertHumanPanelContains(reviewingHtml, /Officer rationale \(required\)/);
assertHumanPanelContains(
  reviewingHtml,
  /data-action="commit-decision"[^>]*data-id="APP-UI"[^>]*data-eligible="true" disabled/
);

const selectedHtml = renderCase('reviewing', {}, {
  applicationId: 'APP-UI',
  action: 'Request Info'
});
assert.match(
  selectedHtml,
  /data-decision="Request Info"[^>]*data-id="APP-UI"[^>]*aria-pressed="true"/
);
assert.match(selectedHtml, /Request Info selected\. Add a rationale to continue\./);

const unavailableStates = {
  draft: [
    'Not yet submitted',
    'This draft must be submitted before an Officer decision can be recorded.'
  ],
  submitted: [
    'Awaiting active review',
    'This application has been submitted and is waiting to enter the active review stage.'
  ],
  need_info: [
    'Waiting for applicant information',
    'Continue the decision after the requested supplementary information is submitted.'
  ]
};
for (const [status, [title, body]] of Object.entries(unavailableStates)) {
  const html = renderCase(status);
  assertHumanPanelContains(
    html,
    new RegExp(`<div class="note warn decision-unavailable"><b>${title}</b><p>${body}</p></div>`)
  );
  assert.match(
    html,
    /<div class="human-decision-heading">[\s\S]*?<\/div>\s*<div class="note warn decision-unavailable">/
  );
}

for (const [status, decision, note, tone] of [
  ['approved', 'Approve', 'Approved by Officer.', ''],
  ['rejected', 'Reject', 'Rejected by Officer.', ' bad']
]) {
  const html = renderCase(status, { decision, officerNote: note });
  assertHumanPanelContains(
    html,
    new RegExp(`<div class="note decision-completed${tone}"><b>Completed: ${decision}</b><br>${note}</div>`)
  );
  assert.doesNotMatch(html, /id="officer-note"/);
}

assert.match(cssSource, /\.decision-workspace\{display:grid;grid-template-columns:minmax\(0,1fr\);align-items:start;gap:20px\}/);
assert.match(cssSource, /\.decision-analysis-panel,\.human-decision-panel\{min-width:0\}/);
assert.match(
  cssSource,
  /@media\(max-width:1320px\)\{[\s\S]*?\.decision-workspace\{grid-template-columns:minmax\(0,1fr\) minmax\(320px,\.85fr\);gap:28px\}/
);
assert.match(
  cssSource,
  /@media\(max-width:980px\)\{[\s\S]*?\.decision-workspace\{grid-template-columns:minmax\(0,1fr\)\}/
);
assert.match(
  cssSource,
  /@media\(max-width:460px\)\{[\s\S]*?\.decision-options\{grid-template-columns:1fr\}/
);
assert.doesNotMatch(cssSource, /\.officer-decision-col \.colbd>/);
assert.doesNotMatch(cssSource, /\.decision-workspace\{[^}]*\b(?:height|min-height):/);
assert.doesNotMatch(cssSource, /\.human-decision-panel\{[^}]*\b(?:height|min-height):/);
assert.ok(reviewingHtml.indexOf('officer-decision-col') < reviewingHtml.indexOf('decision-workspace'));

assert.match(appSource, /api\.createApplication\(\{ residency: '' \}\)/);
assert.match(appSource, /for \(const \[key, value\] of new FormData\(form\)\.entries\(\)\)/);
assert.deepEqual(serializeApplication({ residency: '' }), { residency: '' });
assert.notEqual(serializeApplication({ residency: '' }).residency, 'Select residency status');

function renderForm(app, step = 1) {
  return formView({ app, step, assessment });
}

const blankDraft = { ...application, status: 'draft', residency: '', consent: false };
const blankStepOne = renderForm(blankDraft);
assert.match(
  blankStepOne,
  /<select name="residency">\s*<option value="" disabled selected>Select residency status<\/option>/
);
assert.doesNotMatch(blankStepOne, /value="Singapore Citizen" selected/);
assert.match(blankStepOne, /Demo data · Not retrieved/);

for (const residency of [
  'Singapore Citizen',
  'Permanent Resident',
  'Work Pass Holder'
]) {
  const html = renderForm({ ...blankDraft, residency });
  assert.match(
    html,
    new RegExp(`value="${residency}" selected`)
  );
  assert.doesNotMatch(
    html,
    /<option value="" disabled selected>Select residency status<\/option>/
  );
  assert.deepEqual(serializeApplication({ residency }), { residency });
}

const reviewHtml = renderForm(blankDraft, 5);
assert.match(reviewHtml, /<span>Residency<\/span><strong>—<\/strong>/);
const employmentHtml = renderForm({ ...blankDraft, empType: 'Full-time employee' }, 2);
assert.doesNotMatch(employmentHtml, /Select residency status/);
assert.match(employmentHtml, /<select name="empType">\s*<option value="Full-time employee" selected>/);
const tenureHtml = renderForm({ ...blankDraft, tenureYears: 5 }, 4);
assert.doesNotMatch(tenureHtml, /Select residency status/);
assert.match(tenureHtml, /<select name="tenureYears">[\s\S]*?<option value="5" selected>/);

for (const personaId of ['low', 'medium', 'high']) {
  const unrelatedEmployer = `Manual employer ${personaId}`;
  const initial = { ...blankDraft, employer: unrelatedEmployer };
  const retrieved = applyProviderRetrieval(initial, {
    ...initial,
    ...PRESETS[personaId],
    myinfoPulled: true
  }, 'myinfo');
  assert.equal(retrieved.residency, PRESETS[personaId].residency);
  assert.equal(retrieved.myinfoPulled, true);
  assert.equal(retrieved.employer, unrelatedEmployer);
  assert.match(
    renderForm(retrieved),
    new RegExp(`value="${PRESETS[personaId].residency}" selected`)
  );
}
assert.equal(PRESETS.low.name, 'Amelia Tan');
assert.equal(PRESETS.low.carModel, 'Toyota Corolla Altis 1.6');
assert.equal(PRESETS.medium.carModel, 'Honda Civic 1.5 Turbo');
assert.equal(PRESETS.high.carModel, 'Mazda 3 1.5');

const historyApplications = [
  ['CAR-2026-001', 'Nissan Sylphy 1.6', 'approved', 71300, 1],
  ['CAR-2026-002', 'Honda Civic 1.5 Turbo', 'reviewing', 90000, 2],
  ['CAR-2026-003', 'Mazda 3 1.5', 'rejected', 91000, 3],
  ['CAR-2026-004', 'Honda HR-V 1.5', 'need_info', 90000, 4],
  ['CAR-2026-005', 'Toyota Corolla Altis 1.6', 'reviewing', 71300, 5]
].map(([id, carModel, status, loanAmount, createdAt]) => ({
  id,
  carModel,
  status,
  loanAmount,
  createdAt
}));
const historyHtml = applicantHomeView(historyApplications);
const historyBody = historyHtml.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';
assert.equal((historyBody.match(/<tr>/g) || []).length, 5);
assert.equal(new Set(historyApplications.map(item => item.carModel)).size, 5);
for (const application of historyApplications) {
  assert.match(historyHtml, new RegExp(application.carModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
for (const [earlier, later] of [
  ['CAR-2026-005', 'CAR-2026-004'],
  ['CAR-2026-004', 'CAR-2026-003'],
  ['CAR-2026-003', 'CAR-2026-002'],
  ['CAR-2026-002', 'CAR-2026-001']
]) {
  assert.ok(historyHtml.indexOf(earlier) < historyHtml.indexOf(later));
}
assert.match(historyHtml, /data-route="#\/supplement\/CAR-2026-004">Provide Information<\/button>/);
assert.match(historyHtml, /data-route="#\/status\/CAR-2026-005">View Status<\/button>/);
assert.match(historyHtml, /data-route="#\/status\/CAR-2026-003">View Decision<\/button>/);
assert.match(historyHtml, /S\$71,300/);
assert.doesNotMatch(historyHtml, /<th>Applicant<\/th>/);

console.log('FINAL_REFINEMENT_TEST_OK');
