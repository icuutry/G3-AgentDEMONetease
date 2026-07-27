import { PRESETS, RULESET_VERSION } from './demo-data.js';
import * as api from './api.js';
import {
  addAudit, findApplication, getAuditLogs, getState, initializeStore, listApplications,
  persist, resetState, setRole, updateApplication
} from './store.js';
import { evaluate, money, n, pct, requiredMissing } from './risk-engine.js';
import {
  applicantHomeView, auditView, caseView, formView, homeView, loginView, notFoundView,
  queueView, statusView, supplementView, unauthorizedView
} from './views.js';

const appRoot = document.getElementById('app');
let formStep = 1;
let activeDraftId = null;
let uploads = [];
let selectedDecision = null;
let queueFilters = { kw: '', status: '', level: '' };

function navigate(route) {
  location.hash = route;
  if (location.hash === route) render();
}

function routeParts() {
  return (location.hash || '#/').slice(2).split('/').filter(Boolean);
}

function requireRole(role) {
  return getState().role === role;
}

async function render() {
  const [page = '', id] = routeParts();
  const state = getState();
  document.getElementById('who').textContent = state.role
    ? `Signed in as ${state.role === 'applicant' ? 'Applicant' : 'Loan Officer'}` : 'Not signed in';
  document.getElementById('ver').textContent = RULESET_VERSION;

  if (!page) appRoot.innerHTML = homeView();
  else if (page === 'login' && ['applicant', 'officer'].includes(id)) appRoot.innerHTML = loginView(id);
  else if (page === 'apply-home') appRoot.innerHTML = requireRole('applicant') ? applicantHomeView(await api.listApplications()) : unauthorizedView();
  else if (page === 'form') {
    if (!requireRole('applicant')) appRoot.innerHTML = unauthorizedView();
    else {
      const application = findApplication(id);
      if (!application) appRoot.innerHTML = notFoundView();
      else {
        if (activeDraftId !== id) { activeDraftId = id; formStep = 1; }
        appRoot.innerHTML = formView({ app: application, step: formStep, assessment: evaluate(application, listApplications()) });
      }
    }
  } else if (page === 'status') {
    const application = findApplication(id);
    appRoot.innerHTML = requireRole('applicant') && application ? statusView(application, getAuditLogs(id)) : requireRole('applicant') ? notFoundView() : unauthorizedView();
  } else if (page === 'supplement') {
    const application = findApplication(id);
    appRoot.innerHTML = requireRole('applicant') && application ? supplementView(application, uploads) : requireRole('applicant') ? notFoundView() : unauthorizedView();
  } else if (page === 'queue') {
    if (!requireRole('officer')) appRoot.innerHTML = unauthorizedView();
    else {
      const applications = listApplications();
      const assessments = Object.fromEntries(applications.map(application => [application.id, evaluate(application, applications)]));
      appRoot.innerHTML = queueView(applications, { ...queueFilters, assessments });
    }
  } else if (page === 'case') {
    const application = findApplication(id);
    appRoot.innerHTML = requireRole('officer') && application
      ? caseView(application, evaluate(application, listApplications()), listApplications())
      : requireRole('officer') ? notFoundView() : unauthorizedView();
  } else if (page === 'audit') appRoot.innerHTML = requireRole('officer') ? auditView(getAuditLogs()) : unauthorizedView();
  else appRoot.innerHTML = notFoundView();
}

function collectApplicationForm() {
  const form = document.getElementById('application-form');
  if (!form) return null;
  const application = findApplication(form.dataset.id);
  if (!application) return null;
  const data = new FormData(form);
  for (const [key, value] of data.entries()) {
    if (key !== 'consent') application[key] = value;
  }
  application.consent = Boolean(form.elements.consent?.checked ?? application.consent);
  persist();
  return application;
}

function showMessage(message) {
  window.alert(message);
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (!action) return;
  if (action === 'navigate') return navigate(button.dataset.route);
  if (action === 'switch-role') { setRole(null); return navigate('#/'); }
  if (action === 'reset-demo') {
    if (!window.confirm('Reset all demo records? Any applications you created will be removed.')) return;
    resetState(); formStep = 1; activeDraftId = null; uploads = []; selectedDecision = null;
    return navigate('#/');
  }
  if (action === 'fill-login') {
    document.querySelector('[name="username"]').value = button.dataset.account;
    document.querySelector('[name="password"]').value = 'demo123';
    return;
  }
  if (action === 'new-application') {
    const application = await api.createApplication();
    formStep = 1; activeDraftId = application.id;
    return navigate(`#/form/${application.id}`);
  }
  if (action === 'change-step') {
    collectApplicationForm();
    formStep = Math.max(1, Math.min(5, formStep + Number(button.dataset.delta)));
    return render();
  }
  if (action === 'save-draft') {
    collectApplicationForm();
    showMessage('Draft saved.');
    return;
  }
  if (action === 'load-preset') {
    const form = document.getElementById('application-form');
    const application = findApplication(form.dataset.id);
    Object.assign(application, structuredClone(PRESETS[button.dataset.kind]), {
      consent: true, myinfoPulled: true, cpfPulled: true, creditPulled: true
    });
    persist();
    showMessage(`${button.dataset.kind[0].toUpperCase() + button.dataset.kind.slice(1)}-risk preset loaded.`);
    return render();
  }
  if (action === 'pull-myinfo') {
    const application = collectApplicationForm();
    const sample = PRESETS.low;
    Object.assign(application, {
      name: application.name || sample.name, nric: application.nric || sample.nric,
      age: application.age || sample.age, residency: application.residency || sample.residency,
      phone: application.phone || sample.phone, education: application.education || sample.education,
      marital: application.marital || sample.marital, consent: true, myinfoPulled: true
    });
    addAudit(application.id, 'Information Retrieved', 'Applicant', 'MyInfo Sandbox identity details retrieved with simulated authorization.');
    showMessage('MyInfo Sandbox details retrieved.');
    return render();
  }
  if (action === 'toggle-scope') {
    const note = document.getElementById('scope-note');
    note.hidden = !note.hidden;
    return;
  }
  if (action === 'pull-cpf') {
    const application = collectApplicationForm();
    application.incomeVerified = application.incomeVerified || application.incomeDeclared || PRESETS.low.incomeVerified;
    application.cpfPulled = true; persist();
    addAudit(application.id, 'CPF Retrieved', 'Applicant', 'Synthetic CPF contribution record retrieved.');
    showMessage('Synthetic CPF contribution record retrieved.');
    return render();
  }
  if (action === 'pull-credit') {
    const application = collectApplicationForm();
    if (application.existingMonthly === '') application.existingMonthly = PRESETS.low.existingMonthly;
    if (application.outstanding === '') application.outstanding = PRESETS.low.outstanding;
    if (application.latePayments === '') application.latePayments = PRESETS.low.latePayments;
    if (application.otherLoans === '') application.otherLoans = PRESETS.low.otherLoans;
    application.creditPulled = true; persist();
    addAudit(application.id, 'Credit Report Retrieved', 'Applicant', 'Synthetic credit report retrieved with simulated authorization.');
    showMessage('Synthetic credit report retrieved.');
    return render();
  }
  if (action === 'submit-application') {
    const application = collectApplicationForm();
    const missing = requiredMissing(application);
    if (missing.length) return showMessage(`Complete these required fields: ${missing.join(', ')}.`);
    if (!application.consent) return showMessage('Applicant authorization is required before submission.');
    await api.submitApplication(application.id);
    showMessage('Application submitted. Automated checks are complete and the case is now in the officer queue.');
    return navigate(`#/status/${application.id}`);
  }
  if (action === 'mock-upload') {
    uploads.push(`bank_statement_${uploads.length + 1}.pdf`);
    return render();
  }
  if (action === 'submit-supplement') {
    if (!uploads.length) return showMessage('Add at least one simulated file before submitting.');
    const form = document.getElementById('supplement-form');
    await api.submitSupplement(form.dataset.id, { note: form.elements.supplementNote.value.trim(), files: uploads });
    uploads = [];
    showMessage('Supplementary information submitted. The application has returned to officer review.');
    return navigate(`#/status/${form.dataset.id}`);
  }
  if (action === 'filter-queue') {
    queueFilters = {
      kw: document.getElementById('queue-keyword').value.trim(),
      status: document.getElementById('queue-status').value,
      level: document.getElementById('queue-level').value
    };
    return render();
  }
  if (action === 'show-original') return showMessage('Demo environment: this action would display the applicant’s original form snapshot and submitted document list.');
  if (action === 'highlight-fields') {
    document.querySelectorAll('.frow').forEach(element => element.classList.remove('hl'));
    button.dataset.fields.split(',').forEach(key => {
      const field = document.getElementById(`f_${key}`);
      if (field) { field.classList.add('hl'); field.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
    return;
  }
  if (action === 'rerun-risk') {
    const application = findApplication(button.dataset.id);
    const scenario = { ...application, downPayment: document.getElementById('s-down').value, incomeVerified: document.getElementById('s-income').value };
    scenario.loanAmount = n(application.carPrice) - n(scenario.downPayment);
    const before = evaluate(application, listApplications()), after = evaluate(scenario, listApplications());
    const delta = after.score - before.score;
    document.getElementById('rerun-output').innerHTML = `<div class="note">Adjusted risk score <b>${after.score}</b> (was ${before.score}, ${delta >= 0 ? '+' : ''}${delta}); band <b>${after.level}</b>; recommendation <b>${after.recommendation}</b>.<br><span class="muted">Sensitivity test only. The case and audit records are unchanged.</span></div>`;
    return;
  }
  if (action === 'pick-decision') {
    selectedDecision = button.dataset.decision;
    document.querySelectorAll('[data-action="pick-decision"]').forEach(element => { element.style.outline = ''; });
    button.style.outline = '3px solid var(--brand)';
    document.getElementById('decision-info').textContent = `${selectedDecision} selected. Add a rationale to continue.`;
    updateDecisionButton();
    return;
  }
  if (action === 'commit-decision') {
    const note = document.getElementById('officer-note').value.trim();
    if (!selectedDecision || !note) return;
    if (selectedDecision === 'Approve') await api.approveApplication(button.dataset.id, { note });
    else if (selectedDecision === 'Reject') await api.rejectApplication(button.dataset.id, { note });
    else await api.requestSupplement(button.dataset.id, { note });
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
  const { metrics } = evaluate(application, listApplications());
  const exceeds = metrics.ltv > metrics.cap + 0.0001;
  box.classList.toggle('bad', exceeds);
  box.innerHTML = `<b>LTV check: ${pct(metrics.ltv)}</b> · Applicable cap: ${pct(metrics.cap)} · Estimated monthly payment: ${money(metrics.monthly)}
    <br>${exceeds ? 'The requested financing exceeds the applicable cap.' : 'The requested financing is within the applicable cap.'}`;
}

function exportAudit() {
  const logs = getAuditLogs();
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['Time', 'Application ID', 'Action', 'Actor', 'Model version', 'Note'],
    ...logs.map(item => [new Date(item.ts).toISOString(), item.appId, item.action, item.actor, item.modelVersion, item.note])];
  const csv = rows.map(row => row.map(quote).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'audit_log.csv'; link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  event.preventDefault();
  handleAction(button);
});
appRoot.addEventListener('input', event => {
  if (event.target.id === 'officer-note') updateDecisionButton();
  if (event.target.closest('#application-form')) refreshLtvCheck(collectApplicationForm());
});
appRoot.addEventListener('change', event => {
  if (event.target.closest('#application-form')) refreshLtvCheck(collectApplicationForm());
});
appRoot.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id !== 'login-form') return;
  const username = event.target.elements.username.value.trim();
  const password = event.target.elements.password.value;
  if (!username) return showMessage('Enter the demo account or use “Fill demo account”.');
  if (password !== 'demo123') return showMessage('The demo password is demo123.');
  const role = event.target.dataset.role;
  setRole(role);
  navigate(role === 'applicant' ? '#/apply-home' : '#/queue');
});
window.addEventListener('hashchange', render);

initializeStore();
render();
