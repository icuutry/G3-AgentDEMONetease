import assert from 'node:assert/strict';

import { createSupplementState } from './supplement-state.js';
import { supplementView } from './views.js';

const applicationA = {
  id: 'APP-A',
  status: 'need_info',
  needInfoReason: 'Please provide three months of bank statements.',
  supplementNote: 'Previously submitted note'
};
const applicationB = {
  ...applicationA,
  id: 'APP-B',
  supplementNote: 'Application B saved note'
};

function createHarness() {
  const state = createSupplementState();
  let uploads = [];

  function render(application) {
    if (state.reconcileRoute('supplement', application.id)) uploads = [];
    return supplementView({
      ...application,
      supplementNote: state.noteFor(application.id, application.supplementNote)
    }, uploads.map(file => file.name));
  }

  function addFile(application, displayedNote) {
    state.capture(application.id, displayedNote);
    uploads.push({
      name: `bank_statement_${uploads.length + 1}.pdf`,
      size: 0,
      contentType: 'application/pdf'
    });
    return render(application);
  }

  return {
    state,
    render,
    addFile,
    uploads: () => uploads,
    clearUploads: () => { uploads = []; }
  };
}

const oneFile = createHarness();
oneFile.render(applicationA);
const typedNote = '  First line\nSecond line & "quoted" <proof>  ';
const afterOneFile = oneFile.addFile(applicationA, typedNote);
assert.equal(oneFile.state.noteFor(applicationA.id), typedNote);
assert.match(afterOneFile, /bank_statement_1\.pdf/);
assert.match(
  afterOneFile,
  /  First line\nSecond line &amp; &quot;quoted&quot; &lt;proof&gt;  /
);
assert.doesNotMatch(afterOneFile, /<proof>/);

const afterTwoFiles = oneFile.addFile(applicationA, typedNote);
assert.equal(oneFile.state.noteFor(applicationA.id), typedNote);
assert.match(afterTwoFiles, /bank_statement_1\.pdf/);
assert.match(afterTwoFiles, /bank_statement_2\.pdf/);
assert.equal(oneFile.uploads().length, 2);
assert.deepEqual(oneFile.uploads()[1], {
  name: 'bank_statement_2.pdf',
  size: 0,
  contentType: 'application/pdf'
});

oneFile.state.capture(applicationA.id, 'same application draft');
oneFile.render(applicationA);
assert.equal(oneFile.state.noteFor(applicationA.id), 'same application draft');

const applicationBHtml = oneFile.render(applicationB);
assert.doesNotMatch(applicationBHtml, /same application draft/);
assert.match(applicationBHtml, /Application B saved note/);
assert.equal(oneFile.uploads().length, 0);

const navigation = createHarness();
navigation.render(applicationA);
navigation.state.capture(applicationA.id, 'stale after leaving');
assert.equal(navigation.state.reconcileRoute('status', applicationA.id), true);
assert.equal(navigation.state.get(), null);

const submission = createHarness();
submission.render(applicationA);
const displayedNote = '  note currently displayed\nfor submission  ';
submission.addFile(applicationA, displayedNote);
const submittedPayload = {
  note: submission.state.noteFor(applicationA.id).trim(),
  files: submission.uploads()
};
assert.equal(submittedPayload.note, 'note currently displayed\nfor submission');
assert.equal(submittedPayload.files.length, 1);

submission.state.markSubmissionSucceeded(applicationA.id);
submission.clearUploads();
assert.equal(submission.state.get(), null);
assert.deepEqual(submission.uploads(), []);

const failedSubmission = createHarness();
failedSubmission.render(applicationA);
failedSubmission.addFile(applicationA, displayedNote);
await assert.rejects(async () => {
  await Promise.reject(new Error('API failure'));
  failedSubmission.state.markSubmissionSucceeded(applicationA.id);
  failedSubmission.clearUploads();
}, /API failure/);
assert.equal(failedSubmission.state.noteFor(applicationA.id), displayedNote);
assert.equal(failedSubmission.uploads().length, 1);

const sessionReset = createHarness();
sessionReset.render(applicationA);
sessionReset.state.capture(applicationA.id, 'logout must clear this');
sessionReset.state.clear();
sessionReset.clearUploads();
assert.equal(sessionReset.state.get(), null);
assert.deepEqual(sessionReset.uploads(), []);

const requestHtml = createHarness().render(applicationA);
assert.match(requestHtml, /Please provide three months of bank statements\./);

console.log('SUPPLEMENT_STATE_TEST_OK');
