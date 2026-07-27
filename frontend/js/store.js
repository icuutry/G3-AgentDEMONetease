import { INITIAL_CASES, PRESETS, RULESET_VERSION, STORAGE_KEY } from './demo-data.js';
import { evaluate } from './risk-engine.js';

let state;

export function blankApplication() {
  return {
    id: null, status: 'draft', createdAt: null, submittedAt: null,
    consent: false, myinfoPulled: false, cpfPulled: false, creditPulled: false,
    name: '', nric: '', age: '', residency: 'Singapore Citizen', phone: '',
    empType: 'Full-time employee', employer: '', title: '', empMonths: '',
    incomeDeclared: '', incomeVerified: '', education: '', marital: '',
    existingMonthly: '', outstanding: '', latePayments: '', otherLoans: '',
    carModel: '', carPrice: '', omv: '', carAge: '', downPayment: '', loanAmount: '', tenureYears: 5,
    decision: null, officerNote: '', needInfoReason: '', supplementNote: '', supplementFiles: []
  };
}

function auditRecord(appId, action, actor, timestamp, note) {
  return { appId, action, actor, ts: timestamp, note, modelVersion: RULESET_VERSION };
}

function createInitialState() {
  const now = Date.now();
  const apps = INITIAL_CASES.map((definition, index) => {
    const app = Object.assign(blankApplication(), PRESETS[definition.preset], definition);
    delete app.preset;
    delete app.suffix;
    delete app.duplicateOf;
    app.consent = app.myinfoPulled = app.cpfPulled = app.creditPulled = true;
    app.id = `CAR-2026-${String(index + 1).padStart(3, '0')}`;
    app.createdAt = now - (6 - index) * 86400000;
    app.submittedAt = app.createdAt + 3600000;
    app.name += definition.suffix || '';
    return app;
  });
  INITIAL_CASES.forEach((definition, index) => {
    if (definition.duplicateOf != null) apps[index].nric = apps[definition.duplicateOf].nric;
  });
  const audit = [];
  apps.forEach(app => {
    audit.push(auditRecord(app.id, 'Submitted', 'Applicant', app.submittedAt, 'Application submitted with 16 of 16 information items.'));
    audit.push(auditRecord(app.id, 'Information Retrieved', 'System', app.submittedAt + 60000, 'MyInfo Sandbox authorization and retrieval completed.'));
    const result = evaluate(app, apps);
    audit.push(auditRecord(app.id, 'Risk Assessed', 'System', app.submittedAt + 120000, `Risk score ${result.score} / ${result.level}; recommendation: ${result.recommendation}.`));
    if (app.status === 'approved') audit.push(auditRecord(app.id, 'Approved', 'Officer01', app.submittedAt + 7200000, app.officerNote));
    if (app.status === 'rejected') audit.push(auditRecord(app.id, 'Rejected', 'Officer01', app.submittedAt + 7200000, app.officerNote));
    if (app.status === 'need_info') audit.push(auditRecord(app.id, 'Information Requested', 'Officer01', app.submittedAt + 5400000, app.needInfoReason));
  });
  return { apps, audit, seq: apps.length, role: null };
}

export function initializeStore() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    state = saved ? JSON.parse(saved) : createInitialState();
  } catch {
    state = createInitialState();
  }
  persist();
  return state;
}

export function getState() { return state; }
export function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Storage can be unavailable in privacy modes. */ }
}
export function resetState() { state = createInitialState(); persist(); return state; }
export function setRole(role) { state.role = role; persist(); }
export function listApplications() { return state.apps; }
export function findApplication(id) { return state.apps.find(app => app.id === id); }
export function getAuditLogs(id) { return state.audit.filter(item => !id || item.appId === id); }
export function addAudit(appId, action, actor, note) {
  state.audit.push(auditRecord(appId, action, actor, Date.now(), note));
  persist();
}

export function createApplication(payload = {}) {
  state.seq += 1;
  const app = Object.assign(blankApplication(), payload, {
    id: `CAR-2026-${String(state.seq).padStart(3, '0')}`,
    createdAt: Date.now(),
    status: 'draft'
  });
  state.apps.push(app);
  persist();
  return app;
}

export function updateApplication(id, payload) {
  const app = findApplication(id);
  if (!app) return null;
  Object.assign(app, payload);
  persist();
  return app;
}

export function submitApplication(id) {
  const app = findApplication(id);
  if (!app) return null;
  app.status = 'submitted';
  app.submittedAt = Date.now();
  addAudit(id, 'Submitted', 'Applicant', 'Application submitted with the applicant’s authorization.');
  const result = evaluate(app, state.apps);
  addAudit(id, 'Risk Assessed', 'System', `Risk score ${result.score} / ${result.level}; recommendation: ${result.recommendation}.`);
  app.status = 'reviewing';
  persist();
  return app;
}

export function decideApplication(id, action, payload = {}) {
  const app = findApplication(id);
  if (!app) return null;
  const note = payload.note || '';
  app.officerNote = note;
  if (action === 'Approve') {
    app.status = 'approved'; app.decision = 'Approve';
    addAudit(id, 'Approved', 'Officer01', note);
  } else if (action === 'Reject') {
    app.status = 'rejected'; app.decision = 'Reject';
    addAudit(id, 'Rejected', 'Officer01', note);
  } else {
    app.status = 'need_info'; app.decision = null; app.needInfoReason = note;
    addAudit(id, 'Information Requested', 'Officer01', note);
  }
  persist();
  return app;
}

export function submitSupplement(id, payload = {}) {
  const app = findApplication(id);
  if (!app) return null;
  app.supplementNote = payload.note || '';
  app.supplementFiles = payload.files || [];
  app.status = 'reviewing';
  addAudit(id, 'Supplement Submitted', 'Applicant', `${app.supplementFiles.length} file(s) submitted. ${app.supplementNote}`.trim());
  persist();
  return app;
}
