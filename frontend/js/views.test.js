import assert from 'node:assert/strict';

import { queueView } from './views.js';

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

console.log('VIEWS_QUEUE_TEST_OK');
