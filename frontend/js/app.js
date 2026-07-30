import { PRESETS, RULESET_VERSION } from './demo-data.js';
import * as api from './api.js';
import {
  evaluate, money, normalizeRequiredTextValues, pct, validateFormAction
} from './risk-engine.js';
import {
  applicantHomeView, auditView, caseView, formView, homeView, loginView, notFoundView,
  queueView, statusView, supplementView, unauthorizedView
} from './views.js?v=20260730-ui-final-1';

const appRoot = document.getElementById('app');
const toastRegion = document.getElementById('toast-region');
const headerActions = document.getElementById('header-actions');
const switchPortalButton = document.getElementById('switch-portal');
const resetDemoButton = document.getElementById('reset-demo');
let currentUser = null;
let formStep = 1;
let activeDraftId = null;
let activeDraft = null;
let uploads = [];
let selectedDecision = null;
let selectedMockPersona = 'low';
let queueFilters = { kw: '', status: '', level: '' };
let applicationsCache = [];
let auditCache = [];
let formErrors = {};
let formValidationSummary = '';
const assessmentCache = new Map();
let suppressNextHashRender = false;

function clearTemporaryState() {
  formStep = 1;
  activeDraftId = null;
  activeDraft = null;
  uploads = [];
  selectedDecision = null;
  selectedMockPersona = 'low';
  queueFilters = { kw: '', status: '', level: '' };
  applicationsCache = [];
  auditCache = [];
  formErrors = {};
  formValidationSummary = '';
  assessmentCache.clear();
}

function clearFormValidation() {
  formErrors = {};
  formValidationSummary = '';
}

function applyFormValidation(validation, summary) {
  formErrors = Object.fromEntries(validation.errors.map(error => [error.key, error.message]));
  formValidationSummary = summary;
}

function reconcileFormValidation(draft) {
  const invalidKeys = new Set(
    validateFormAction(draft, { action: 'submit-application' }).errors.map(error => error.key)
  );
  formErrors = Object.fromEntries(
    Object.entries(formErrors).filter(([key]) => invalidKeys.has(key))
  );
  if (!Object.keys(formErrors).length) formValidationSummary = '';
}

function focusFirstInvalidControl() {
  const target = document.querySelector('#application-form [aria-invalid="true"]')
    || document.getElementById('form-validation-summary');
  if (target) target.focus();
}

function clearResolvedFieldError(control, draft) {
  const key = control?.name;
  if (!key || !formErrors[key]) return;
  const validation = validateFormAction(draft, { action: 'submit-application' });
  if (validation.errors.some(error => error.key === key)) return;

  delete formErrors[key];
  control.removeAttribute('aria-invalid');
  control.removeAttribute('aria-describedby');
  const wrapper = control.closest('.field-error');
  if (wrapper) wrapper.classList.remove('field-error');
  document.getElementById(`error-${key}`)?.remove();
  document.querySelector(`#form-validation-summary [data-field="${key}"]`)?.remove();
  if (!document.querySelector('#form-validation-summary li')) {
    document.getElementById('form-validation-summary')?.remove();
    formValidationSummary = '';
  }
}

function updateHeaderVisibility(user) {
  const role = user?.role;
  const isAuthenticated = Boolean(user);
  const showReset = role === 'officer';

  switchPortalButton.hidden = !isAuthenticated;
  resetDemoButton.hidden = !showReset;
  headerActions.classList.toggle('has-visible-actions', isAuthenticated);
}

async function navigate(route) {
  if (location.hash !== route) {
    suppressNextHashRender = true;
    location.hash = route;
  }
  await renderSafely();
}

function routeParts() {
  return (location.hash || '#/').slice(2).split('/').filter(Boolean);
}

function requireRole(role) {
  return currentUser?.role === role;
}

function showMessage(message, tone = 'info') {
  if (!toastRegion) {
    window.alert(message);
    return;
  }
  toastRegion.replaceChildren();
  const toast = document.createElement('div');
  toast.className = `toast ${tone === 'error' ? 'toast-error' : ''}`;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  const copy = document.createElement('span');
  copy.className = 'toast-message';
  copy.textContent = message;
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = '×';
  close.addEventListener('click', () => toast.remove());
  toast.append(copy, close);
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 5200);
}

async function handleError(error) {
  const message = error instanceof api.ApiError
    ? error.message
    : error instanceof Error && error.message
      ? error.message
      : 'Something went wrong while contacting the API.';
  showMessage(message || 'Unable to complete the request.', 'error');

  if (error instanceof api.ApiError && error.status === 401) {
    api.logout();
    currentUser = null;
    clearTemporaryState();
    await navigate('#/');
  }
}

async function getApplicationOrNull(applicationId) {
  try {
    return await api.getApplication(applicationId);
  } catch (error) {
    if (error instanceof api.ApiError && error.status === 404) return null;
    throw error;
  }
}

async function render() {
  const [page = '', id] = routeParts();
  document.getElementById('who').textContent = currentUser
    ? `Signed in as ${currentUser.displayName || (currentUser.role === 'applicant' ? 'Applicant' : 'Loan Officer')}`
    : 'Not signed in';
  document.getElementById('ver').textContent = RULESET_VERSION;
  updateHeaderVisibility(currentUser);

  if (!page) {
    appRoot.innerHTML = homeView();
  } else if (page === 'login' && ['applicant', 'officer'].includes(id)) {
    appRoot.innerHTML = loginView(id);
  } else if (page === 'apply-home') {
    if (!requireRole('applicant')) {
      appRoot.innerHTML = unauthorizedView();
    } else {
      applicationsCache = await api.listApplications();
      appRoot.innerHTML = applicantHomeView(applicationsCache);
    }
  } else if (page === 'form') {
    if (!requireRole('applicant')) {
      appRoot.innerHTML = unauthorizedView();
    } else {
      if (activeDraftId !== id || !activeDraft) {
        activeDraft = await getApplicationOrNull(id);
        if (!activeDraft) {
          appRoot.innerHTML = notFoundView();
          return;
        }
        activeDraftId = id;
        formStep = 1;
        clearFormValidation();
      }
      appRoot.innerHTML = formView({
        app: activeDraft,
        step: formStep,
        assessment: evaluate(activeDraft, applicationsCache),
        errors: formErrors,
        validationSummary: formValidationSummary
      });
    }
  } else if (page === 'status') {
    if (!requireRole('applicant')) {
      appRoot.innerHTML = unauthorizedView();
    } else {
      const [application, logs] = await Promise.all([
        getApplicationOrNull(id),
        api.getAuditLogs(id)
      ]);
      if (!application) {
        appRoot.innerHTML = notFoundView();
        return;
      }
      auditCache = logs;
      appRoot.innerHTML = statusView(application, logs);
    }
  } else if (page === 'supplement') {
    if (!requireRole('applicant')) {
      appRoot.innerHTML = unauthorizedView();
    } else {
      const application = await getApplicationOrNull(id);
      appRoot.innerHTML = application
        ? supplementView(application, uploads.map(file => file.name))
        : notFoundView();
    }
  } else if (page === 'queue') {
    if (!requireRole('officer')) {
      appRoot.innerHTML = unauthorizedView();
    } else {
      applicationsCache = await api.listApplications();
      const assessments = Object.fromEntries(applicationsCache.map(application => [
        application.id,
        application.riskAssessment || { level: 'Unassessed', score: '—' }
      ]));
      appRoot.innerHTML = queueView(applicationsCache, { ...queueFilters, assessments });
    }
  } else if (page === 'case') {
    if (!requireRole('officer')) {
      appRoot.innerHTML = unauthorizedView();
    } else {
      const [application, applications] = await Promise.all([
        getApplicationOrNull(id),
        api.listApplications()
      ]);
      if (!application) {
        appRoot.innerHTML = notFoundView();
        return;
      }
      applicationsCache = applications;
      const assessment = application.riskAssessment
        || await api.evaluateApplication(application.id, {}, false);
      assessmentCache.set(application.id, assessment);
      appRoot.innerHTML = caseView(application, assessment, applications);
    }
  } else if (page === 'audit') {
    if (!requireRole('officer')) {
      appRoot.innerHTML = unauthorizedView();
    } else {
      auditCache = await api.getAuditLogs();
      appRoot.innerHTML = auditView(auditCache);
    }
  } else {
    appRoot.innerHTML = notFoundView();
  }
}

async function renderSafely() {
  try {
    await render();
  } catch (error) {
    await handleError(error);
  }
}

function collectApplicationForm() {
  const form = document.getElementById('application-form');
  if (!form || !activeDraft || form.dataset.id !== activeDraft.id) return activeDraft;

  let draft = { ...activeDraft };
  for (const [key, value] of new FormData(form).entries()) {
    if (key !== 'consent') draft[key] = value;
  }
  const consent = form.elements.consent;
  if (consent) draft.consent = consent.checked;
  draft = normalizeRequiredTextValues(draft);
  activeDraft = draft;
  return activeDraft;
}

async function saveActiveDraft({ notify = false } = {}) {
  const draft = collectApplicationForm();
  if (!draft?.id) return null;

  activeDraft = await api.updateApplication(draft.id, draft);
  activeDraftId = activeDraft.id;
  const index = applicationsCache.findIndex(application => application.id === activeDraft.id);
  if (index >= 0) applicationsCache[index] = activeDraft;
  if (notify) showMessage('Draft saved.');
  return activeDraft;
}

async function persistInvalidRequiredText(draft, validation) {
  const clearedText = Object.fromEntries(
    validation.errors
      .filter(error => typeof draft?.[error.key] === 'string')
      .map(error => [error.key, draft[error.key]])
  );
  if (!draft?.id || !Object.keys(clearedText).length) return;

  const saved = await api.updateApplication(draft.id, clearedText);
  activeDraft = { ...saved, ...draft };
  activeDraftId = activeDraft.id;
  const index = applicationsCache.findIndex(application => application.id === activeDraft.id);
  if (index >= 0) applicationsCache[index] = activeDraft;
}

async function retrieveMockData(retrieve, description) {
  const draft = await saveActiveDraft();
  if (!draft) return;
  const response = await retrieve(draft.id, selectedMockPersona);
  activeDraft = response.application;
  activeDraftId = activeDraft.id;
  reconcileFormValidation(activeDraft);
  showMessage(`${description} retrieved from ${response.label || response.provider}.`);
  await render();
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (!action) return;

  if (action === 'navigate') {
    if (routeParts()[0] === 'form' && button.dataset.route === '#/apply-home') {
      await saveActiveDraft();
    }
    return navigate(button.dataset.route);
  }
  if (action === 'switch-role') {
    api.logout();
    currentUser = null;
    clearTemporaryState();
    return navigate('#/');
  }
  if (action === 'reset-demo') {
    if (!requireRole('officer')) {
      return showMessage('Only an authenticated Loan Officer can reset the demo data.');
    }
    if (!window.confirm('Reset all demo records? Any applications you created will be removed.')) return;
    await api.resetDemo();
    clearTemporaryState();
    showMessage('Demo records restored.');
    return navigate('#/queue');
  }
  if (action === 'fill-login') {
    document.querySelector('[name="username"]').value = button.dataset.account;
    document.querySelector('[name="password"]').value = 'demo123';
    return;
  }
  if (action === 'new-application') {
    activeDraft = await api.createApplication();
    activeDraftId = activeDraft.id;
    formStep = 1;
    clearFormValidation();
    return navigate(`#/form/${activeDraft.id}`);
  }
  if (action === 'change-step') {
    const delta = Number(button.dataset.delta);
    const draft = collectApplicationForm();
    const validation = validateFormAction(draft, { action, step: formStep, delta });
    if (!validation.valid) {
      await persistInvalidRequiredText(draft, validation);
      applyFormValidation(validation, 'Complete the required fields before continuing.');
      await render();
      focusFirstInvalidControl();
      return;
    }
    clearFormValidation();
    await saveActiveDraft();
    formStep = Math.max(1, Math.min(5, formStep + delta));
    return render();
  }
  if (action === 'save-draft') {
    clearFormValidation();
    await saveActiveDraft({ notify: true });
    return render();
  }
  if (action === 'load-preset') {
    selectedMockPersona = button.dataset.kind;
    let draft = await saveActiveDraft();
    for (const retrieve of [api.retrieveMyInfo, api.retrieveCpf, api.retrieveCreditReport]) {
      const response = await retrieve(draft.id, selectedMockPersona);
      draft = response.application;
      activeDraft = draft;
      activeDraftId = draft.id;
    }
    const preset = PRESETS[selectedMockPersona];
    activeDraft = await api.updateApplication(draft.id, {
      empType: preset.empType,
      employer: preset.employer,
      title: preset.title,
      empMonths: preset.empMonths,
      incomeDeclared: preset.incomeDeclared,
      carModel: preset.carModel,
      carPrice: preset.carPrice,
      omv: preset.omv,
      carAge: preset.carAge,
      downPayment: preset.downPayment,
      loanAmount: preset.loanAmount,
      tenureYears: preset.tenureYears
    });
    activeDraftId = activeDraft.id;
    clearFormValidation();
    showMessage(`${selectedMockPersona[0].toUpperCase() + selectedMockPersona.slice(1)}-risk preset retrieved from the frozen Mock API dataset.`);
    return render();
  }
  if (action === 'pull-myinfo') {
    return retrieveMockData(api.retrieveMyInfo, 'MyInfo Sandbox details');
  }
  if (action === 'toggle-scope') {
    const note = document.getElementById('scope-note');
    note.hidden = !note.hidden;
    return;
  }
  if (action === 'pull-cpf') {
    return retrieveMockData(api.retrieveCpf, 'Synthetic CPF contribution record');
  }
  if (action === 'pull-credit') {
    return retrieveMockData(api.retrieveCreditReport, 'Synthetic credit report');
  }
  if (action === 'submit-application') {
    const currentDraft = collectApplicationForm();
    const validation = validateFormAction(currentDraft, { action });
    if (!validation.valid) {
      await persistInvalidRequiredText(currentDraft, validation);
      formStep = validation.firstInvalidStep;
      applyFormValidation(validation, 'Required information is incomplete.');
      await render();
      focusFirstInvalidControl();
      return;
    }
    clearFormValidation();
    const draft = await saveActiveDraft();
    activeDraft = await api.submitApplication(draft.id);
    activeDraftId = activeDraft.id;
    showMessage('Application submitted. Automated checks are complete and the case is now in the officer queue.');
    return navigate(`#/status/${activeDraft.id}`);
  }
  if (action === 'mock-upload') {
    uploads.push({
      name: `bank_statement_${uploads.length + 1}.pdf`,
      size: 0,
      contentType: 'application/pdf'
    });
    return render();
  }
  if (action === 'submit-supplement') {
    if (!uploads.length) return showMessage('Add at least one simulated file before submitting.');
    const form = document.getElementById('supplement-form');
    const application = await api.submitSupplement(form.dataset.id, {
      note: form.elements.supplementNote.value.trim(),
      files: uploads
    });
    uploads = [];
    activeDraft = application;
    activeDraftId = application.id;
    showMessage('Supplementary information submitted. The application has returned to officer review.');
    return navigate(`#/status/${application.id}`);
  }
  if (action === 'filter-queue') {
    queueFilters = {
      kw: document.getElementById('queue-keyword').value.trim(),
      status: document.getElementById('queue-status').value,
      level: document.getElementById('queue-level').value
    };
    return render();
  }
  if (action === 'show-original') {
    return showMessage('Demo environment: this action would display the applicant’s original form snapshot and submitted document list.');
  }
  if (action === 'highlight-fields') {
    document.querySelectorAll('.frow').forEach(element => element.classList.remove('hl'));
    button.dataset.fields.split(',').forEach(key => {
      const field = document.getElementById(`f_${key}`);
      if (field) {
        field.classList.add('hl');
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    return;
  }
  if (action === 'rerun-risk') {
    const applicationId = button.dataset.id;
    const before = assessmentCache.get(applicationId);
    const after = await api.evaluateApplication(applicationId, {
      downPayment: document.getElementById('s-down').value,
      incomeVerified: document.getElementById('s-income').value
    }, false);
    const delta = before ? after.score - before.score : 0;
    document.getElementById('rerun-output').innerHTML = `<div class="note">Adjusted risk score <b>${after.score}</b>${before ? ` (was ${before.score}, ${delta >= 0 ? '+' : ''}${delta})` : ''}; band <b>${after.level}</b>; recommendation <b>${after.recommendation}</b>.<br><span class="muted">Sensitivity test only. The case and audit records are unchanged.</span></div>`;
    return;
  }
  if (action === 'pick-decision') {
    selectedDecision = button.dataset.decision;
    document.querySelectorAll('[data-action="pick-decision"]').forEach(element => {
      element.style.outline = '';
    });
    button.style.outline = '3px solid var(--brand)';
    document.getElementById('decision-info').textContent = `${selectedDecision} selected. Add a rationale to continue.`;
    updateDecisionButton();
    return;
  }
  if (action === 'commit-decision') {
    const note = document.getElementById('officer-note').value.trim();
    if (!selectedDecision || !note) return showMessage('Select a decision and enter a nonblank rationale.');
    let application;
    if (selectedDecision === 'Approve') {
      application = await api.approveApplication(button.dataset.id, { note });
    } else if (selectedDecision === 'Reject') {
      application = await api.rejectApplication(button.dataset.id, { note });
    } else {
      application = await api.requestSupplement(button.dataset.id, { note });
    }
    const index = applicationsCache.findIndex(item => item.id === application.id);
    if (index >= 0) applicationsCache[index] = application;
    selectedDecision = null;
    showMessage('The action was recorded, the applicant status was updated, and an audit record was created.');
    return navigate('#/queue');
  }
  if (action === 'export-audit') return exportAudit();
}

function updateDecisionButton() {
  const note = document.getElementById('officer-note');
  const submit = document.querySelector('[data-action="commit-decision"]');
  if (submit) submit.disabled = !(selectedDecision && note?.value.trim());
}

function refreshLtvCheck(application) {
  const box = document.getElementById('ltv-check');
  if (!box || !application) return;
  const { metrics } = evaluate(application, applicationsCache);
  const exceeds = metrics.ltv > metrics.cap + 0.0001;
  box.classList.toggle('bad', exceeds);
  box.innerHTML = `<b>LTV check: ${pct(metrics.ltv)}</b> · Applicable cap: ${pct(metrics.cap)} · Estimated monthly payment: ${money(metrics.monthly)}
    <br>${exceeds ? 'The requested financing exceeds the applicable cap.' : 'The requested financing is within the applicable cap.'}`;
}

async function exportAudit() {
  const logs = await api.getAuditLogs();
  auditCache = logs;
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['Time', 'Application ID', 'Action', 'Actor', 'Model version', 'Note'],
    ...logs.map(item => [new Date(item.ts).toISOString(), item.appId, item.action, item.actor, item.modelVersion, item.note])];
  const csv = rows.map(row => row.map(quote).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'audit_log.csv';
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  event.preventDefault();
  const wasDisabled = button.disabled;
  button.disabled = true;
  try {
    await handleAction(button);
  } catch (error) {
    await handleError(error);
  } finally {
    if (button.isConnected) button.disabled = wasDisabled;
  }
});

appRoot.addEventListener('input', event => {
  if (event.target.id === 'officer-note') updateDecisionButton();
  if (event.target.closest('#application-form')) {
    const draft = collectApplicationForm();
    clearResolvedFieldError(event.target, draft);
    refreshLtvCheck(draft);
  }
});

appRoot.addEventListener('change', event => {
  if (event.target.closest('#application-form')) {
    const draft = collectApplicationForm();
    clearResolvedFieldError(event.target, draft);
    refreshLtvCheck(draft);
  }
});

appRoot.addEventListener('submit', async event => {
  event.preventDefault();
  if (event.target.id !== 'login-form') return;

  const submit = event.target.querySelector('[type="submit"]');
  const wasDisabled = submit?.disabled;
  if (submit) submit.disabled = true;
  try {
    const username = event.target.elements.username.value.trim();
    const password = event.target.elements.password.value;
    const role = event.target.dataset.role;
    if (!username) {
      showMessage('Enter the demo account or use “Fill demo account”.');
      return;
    }
    const credentials = role === 'applicant'
      ? { role, email: username, password }
      : username.includes('@')
        ? { role, email: username, password }
        : { role, staffId: username, password };
    currentUser = await api.login(credentials);
    clearTemporaryState();
    await navigate(role === 'applicant' ? '#/apply-home' : '#/queue');
  } catch (error) {
    await handleError(error);
  } finally {
    if (submit?.isConnected) submit.disabled = wasDisabled;
  }
});

window.addEventListener('hashchange', () => {
  if (suppressNextHashRender) {
    suppressNextHashRender = false;
    return;
  }
  void renderSafely();
});

async function start() {
  if (api.hasSession()) {
    try {
      currentUser = await api.getCurrentUser();
    } catch (error) {
      api.logout();
      currentUser = null;
      await handleError(error);
    }
  }
  await renderSafely();
}

void start();
