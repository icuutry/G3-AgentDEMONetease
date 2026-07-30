import assert from 'node:assert/strict';

import { caseView, queueView } from './views.js';

const applications = [
  { id: 'APP-BLANK', name: '', status: 'draft', loanAmount: 10000 },
  { id: 'APP-NULL', name: null, status: 'submitted', loanAmount: 20000 },
  { id: 'APP-UNDEFINED', name: undefined, status: 'reviewing', loanAmount: 30000 },
  { id: 'APP-NAMED', name: 'Alice Example', status: 'reviewing', loanAmount: 40000 }
];

const assessments = {
  'APP-BLANK': { level: 'Low', score: 10 },
  'APP-NULL': { level: 'Medium', score: 40 },
  'APP-UNDEFINED': { level: 'High', score: 70 },
  'APP-NAMED': { level: 'Low', score: 20 }
};

function renderQueue(filters = {}) {
  return queueView(applications, {
    kw: '',
    status: '',
    level: '',
    assessments,
    ...filters
  });
}

assert.doesNotThrow(() => renderQueue({ kw: 'unrelated' }));
assert.doesNotThrow(() => queueView(
  [{ ...applications[0], name: null }],
  { kw: 'unrelated', status: '', level: '', assessments }
));
assert.doesNotThrow(() => queueView(
  [{ ...applications[0], name: undefined }],
  { kw: 'unrelated', status: '', level: '', assessments }
));

const idSearch = renderQueue({ kw: '  app-blank  ' });
assert.match(idSearch, /APP-BLANK/);
assert.match(idSearch, /data-route="#\/case\/APP-BLANK"/);
assert.doesNotMatch(idSearch, /APP-NULL/);

const applicantSearch = renderQueue({ kw: 'alice' });
assert.match(applicantSearch, /Alice Example/);
assert.match(applicantSearch, /APP-NAMED/);
assert.doesNotMatch(applicantSearch, /APP-BLANK/);

const noKeyword = renderQueue();
for (const application of applications) {
  assert.match(noKeyword, new RegExp(application.id));
}

const statusFiltered = renderQueue({ status: 'reviewing' });
assert.match(statusFiltered, /APP-UNDEFINED/);
assert.match(statusFiltered, /APP-NAMED/);
assert.doesNotMatch(statusFiltered, /APP-BLANK/);
assert.doesNotMatch(statusFiltered, /APP-NULL/);

const riskFiltered = renderQueue({ level: 'Low' });
assert.match(riskFiltered, /APP-BLANK/);
assert.match(riskFiltered, /APP-NAMED/);
assert.doesNotMatch(riskFiltered, /APP-NULL/);
assert.doesNotMatch(riskFiltered, /APP-UNDEFINED/);

const combinedFilters = renderQueue({
  kw: 'alice',
  status: 'reviewing',
  level: 'Low'
});
assert.match(combinedFilters, /APP-NAMED/);
assert.doesNotMatch(combinedFilters, /APP-BLANK|APP-NULL|APP-UNDEFINED/);

assert.match(
  noKeyword,
  /<b class="queue-applicant">—<\/b>/
);
assert.match(
  noKeyword,
  /data-route="#\/case\/APP-BLANK">View draft<\/button>/
);

const caseResult = {
  score: 20,
  level: 'Low',
  recommendation: 'Approve',
  modelVersion: 'test-model',
  factors: [],
  questions: [],
  hard: [],
  rules: [],
  metrics: {
    gap: 0,
    ltv: 0.5,
    cap: 0.7,
    dsr: 0.2,
    monthly: 500
  }
};

const caseApplication = {
  id: 'APP-PROFILE',
  status: 'reviewing',
  name: 'Normal Applicant',
  nric: 'S1234567A',
  age: 35,
  residency: 'Singapore Citizen',
  employer: 'Example Employer',
  title: 'Analyst',
  empMonths: 24,
  incomeDeclared: 5000,
  incomeVerified: 5000,
  existingMonthly: 500,
  outstanding: 10000,
  latePayments: 1,
  carPrice: 80000,
  omv: 40000,
  downPayment: 20000,
  loanAmount: 60000,
  tenureYears: 5,
  myinfoPulled: false,
  cpfPulled: false,
  creditPulled: false,
  decision: null,
  officerNote: ''
};

function renderCase(overrides = {}) {
  const application = { ...caseApplication, ...overrides };
  return caseView(application, caseResult, [application]);
}

function profileRow(html, field) {
  const start = html.indexOf(`id="f_${field}"`);
  assert.notEqual(start, -1, `Missing profile row for ${field}`);
  const end = html.indexOf('<div class="frow"', start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

function profileValue(html, field) {
  const match = profileRow(html, field).match(/<div class="v [^"]*">([\s\S]*?)<\/div>/);
  assert.ok(match, `Missing profile value for ${field}`);
  return match[1];
}

for (const missingValue of [null, undefined, '', '   ']) {
  assert.equal(profileValue(renderCase({ incomeDeclared: missingValue }), 'incomeDeclared'), '—');
  assert.equal(profileValue(renderCase({ tenureYears: missingValue }), 'tenureYears'), '—');
}

assert.equal(profileValue(renderCase({ incomeDeclared: 0 }), 'incomeDeclared'), 'S$0');
assert.equal(profileValue(renderCase({ incomeDeclared: '0' }), 'incomeDeclared'), 'S$0');
assert.equal(profileValue(renderCase({ incomeDeclared: 12345 }), 'incomeDeclared'), 'S$12,345');
assert.equal(profileValue(renderCase({ incomeDeclared: -500 }), 'incomeDeclared'), 'S$-500');

const tenureCases = [
  [0, '0 years'],
  ['0', '0 years'],
  [1, '1 year'],
  ['1', '1 year'],
  [5, '5 years']
];
for (const [tenureYears, expected] of tenureCases) {
  assert.equal(profileValue(renderCase({ tenureYears }), 'tenureYears'), expected);
}

const zeroGeneralValues = renderCase({ empMonths: 0, latePayments: 0 });
assert.equal(profileValue(zeroGeneralValues, 'empMonths'), '0');
assert.equal(profileValue(zeroGeneralValues, 'latePayments'), '0');
assert.equal(profileValue(renderCase({ title: '   ' }), 'title'), '—');
assert.equal(profileValue(renderCase({ title: 'Senior Analyst' }), 'title'), 'Senior Analyst');

const unsafeEmployer = 'Research <script>"quoted" & evidence</script>';
const escapedProfile = renderCase({ employer: unsafeEmployer });
assert.equal(
  profileValue(escapedProfile, 'employer'),
  'Research &lt;script&gt;&quot;quoted&quot; &amp; evidence&lt;/script&gt;'
);
assert.doesNotMatch(profileRow(escapedProfile, 'employer'), /<script>/);

const profileRegression = renderCase();
assert.match(profileRow(profileRegression, 'incomeDeclared'), /<div class="v mono">S\$5,000<\/div>/);
assert.match(profileRow(profileRegression, 'name'), /chip[\s\S]*Applicant[\s\S]*Self-declared[\s\S]*Used in assessment/);
assert.match(profileRow(profileRegression, 'age'), /Reference only/);
assert.match(profileRegression, /data-action="show-original"[^>]*>View original submission<\/button>/);
assert.match(profileRegression, /Debt service ratio<\/span><span class="mono">20\.0%<\/span>/);

console.log('VIEWS_QUEUE_TEST_OK');
