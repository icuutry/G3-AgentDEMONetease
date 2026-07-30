import assert from 'node:assert/strict';

import { createDecisionState } from './decision-state.js';
import { caseView } from './views.js';

const state = createDecisionState();

assert.equal(state.select('CASE-A', 'Approve'), true);
assert.deepEqual(state.get(), {
  applicationId: 'CASE-A',
  action: 'Approve'
});

state.select('CASE-A', 'Reject');
assert.equal(state.validate({
  applicationId: 'CASE-B',
  note: 'Reject this case.',
  eligible: true
}).valid, false);

state.reconcileRoute('case', 'CASE-B');
assert.equal(state.get(), null);

for (const route of ['queue', 'audit', 'login', '']) {
  state.select('CASE-A', 'Approve');
  state.reconcileRoute(route);
  assert.equal(state.get(), null);
}

state.select('CASE-A', 'Approve');
state.reconcileRoute('case', 'CASE-A');
assert.deepEqual(state.get(), {
  applicationId: 'CASE-A',
  action: 'Approve'
});

assert.equal(state.validate({
  applicationId: 'CASE-B',
  note: 'Rationale without a case B selection.',
  eligible: true
}).valid, false);

state.clear();
state.select('CASE-A', 'Reject');
const staleValidation = state.validate({
  applicationId: 'CASE-B',
  note: 'Case B rationale.',
  eligible: true
});
assert.equal(staleValidation.valid, false);
assert.equal(staleValidation.reason, 'application_mismatch');

assert.equal(state.select('CASE-B', 'Unknown Action'), false);
assert.equal(state.get(), null);

state.select('CASE-B', 'Request Info');
assert.equal(state.validate({
  applicationId: 'CASE-B',
  note: '   ',
  eligible: true
}).valid, false);
assert.equal(state.validate({
  applicationId: 'CASE-B',
  note: 'Valid rationale.',
  eligible: false
}).reason, 'ineligible_status');

const validCaseB = state.validate({
  applicationId: 'CASE-B',
  note: 'Please provide the latest bank statement.',
  eligible: true
});
assert.deepEqual(validCaseB, {
  valid: true,
  reason: null,
  action: 'Request Info'
});

state.markSubmissionSucceeded('CASE-B');
assert.equal(state.get(), null);

state.select('CASE-B', 'Approve');
let successShown = false;
await assert.rejects(async () => {
  const validation = state.validate({
    applicationId: 'CASE-B',
    note: 'Valid rationale.',
    eligible: true
  });
  assert.equal(validation.valid, true);
  await Promise.reject(new Error('API failure'));
  state.markSubmissionSucceeded('CASE-B');
  successShown = true;
}, /API failure/);
assert.deepEqual(state.get(), {
  applicationId: 'CASE-B',
  action: 'Approve'
});
assert.equal(successShown, false);

const result = {
  score: 12,
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
const application = {
  id: 'CASE-&quot;"',
  name: 'Case B Applicant',
  status: 'reviewing',
  decision: null,
  officerNote: '',
  loanAmount: 10000,
  tenureYears: 5
};
const selectedHtml = caseView(application, result, [], {
  applicationId: application.id,
  action: 'Approve'
});
assert.match(selectedHtml, /data-decision="Approve"[^>]*data-id="CASE-&amp;quot;&quot;"/);
assert.match(selectedHtml, /data-id="CASE-&amp;quot;&quot;"[^>]*disabled/);
assert.match(selectedHtml, /Approve selected\. Add a rationale to continue\./);

const newCaseHtml = caseView(
  { ...application, id: 'CASE-C' },
  result,
  [],
  state.get()
);
assert.match(newCaseHtml, /No action selected\./);
assert.match(newCaseHtml, /data-decision="Approve"[^>]*aria-pressed="false"/);
assert.match(newCaseHtml, /data-id="CASE-C"[^>]*disabled/);

console.log('DECISION_STATE_TEST_OK');
