import { STATUS, STEP_NAMES } from './demo-data.js';
import { findDuplicates, money, n, pct, requiredMissing } from './risk-engine.js';

export const esc = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
export const fmtTime = timestamp => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const tag = status => `<span class="tag ${STATUS[status]?.cls || 't-gray'}">${STATUS[status]?.label || status}</span>`;
const button = (label, action, extra = '', data = '') => `<button class="btn ${extra}" data-action="${action}" ${data}>${label}</button>`;
const field = (app, key, label, type = 'text', readonly = false) => `
  <label class="f"><span>${label}</span><input name="${key}" type="${type}" value="${esc(app[key])}" ${readonly ? 'readonly' : ''}></label>`;
const select = (app, key, label, options) => `
  <label class="f"><span>${label}</span><select name="${key}">
    ${options.map(option => `<option ${String(app[key]) === String(option) ? 'selected' : ''}>${option}</option>`).join('')}
  </select></label>`;

export function homeView() {
  return `<section class="hero" aria-labelledby="home-title">
    <div class="hero-main">
      <div class="hero-copy">
        <div class="eyebrow">Explainable lending workflow</div>
        <h1 id="home-title">AI Car Loan Approval &amp; Risk Control Agent</h1>
        <p>One connected workflow for applicant data collection, deterministic risk assessment, human review, and auditable decisions.</p>
        <div class="capabilities" aria-label="Product capabilities">
          <span>Applicant Portal</span>
          <span>Explainable Risk</span>
          <span>Human Review</span>
          <span>Audit Trail</span>
        </div>
      </div>
      <div class="automotive-visual" aria-hidden="true">
        <div class="visual-arch">
          <div class="road-line"></div>
          <div class="vehicle">
            <span class="vehicle-cabin"></span>
            <span class="vehicle-body"></span>
            <span class="vehicle-window vehicle-window-left"></span>
            <span class="vehicle-window vehicle-window-right"></span>
            <span class="vehicle-light"></span>
            <span class="vehicle-wheel vehicle-wheel-left"></span>
            <span class="vehicle-wheel vehicle-wheel-right"></span>
          </div>
          <span class="visual-chip visual-chip-risk">Risk evidence</span>
          <span class="visual-chip visual-chip-review">Human reviewed</span>
        </div>
      </div>
    </div>

    <div class="rolecards" aria-label="Choose a portal">
      <button class="rolecard rolecard-applicant" data-action="navigate" data-route="#/login/applicant">
        <span class="roleicon roleicon-user" aria-hidden="true"></span>
        <span class="rolecard-copy">
          <b>Applicant Portal</b>
          <span>Create an application, retrieve simulated records, track status, and provide additional information.</span>
        </span>
        <span class="rolecard-action">Enter Applicant Portal <span aria-hidden="true">&rarr;</span></span>
      </button>
      <button class="rolecard rolecard-officer" data-action="navigate" data-route="#/login/officer">
        <span class="roleicon roleicon-shield" aria-hidden="true"></span>
        <span class="rolecard-copy">
          <b>Loan Officer Portal</b>
          <span>Review applications, inspect risk evidence, test scenarios, and record accountable decisions.</span>
        </span>
        <span class="rolecard-action">Enter Loan Officer Portal <span aria-hidden="true">&rarr;</span></span>
      </button>
    </div>

    <div class="workflow-strip" aria-label="Product workflow">
      <div class="workflow-item"><span class="workflow-number">1</span><div><b>Collect</b><span>Synthetic applicant data</span></div></div>
      <div class="workflow-item"><span class="workflow-number">2</span><div><b>Assess</b><span>Deterministic risk rules</span></div></div>
      <div class="workflow-item"><span class="workflow-number">3</span><div><b>Review</b><span>Human decision control</span></div></div>
      <div class="workflow-item"><span class="workflow-number">4</span><div><b>Audit</b><span>Versioned activity records</span></div></div>
    </div>
  </section>`;
}

export function loginView(role) {
  const applicant = role === 'applicant';
  const account = applicant ? 'applicant@demo.com' : 'officer@demo.com';
  return `<div class="card" style="max-width:520px;margin:50px auto">
    <p class="eyebrow">${applicant ? 'Applicant portal' : 'Loan officer portal'}</p>
    <h1>${applicant ? 'Applicant sign in' : 'Officer sign in'}</h1>
    <p class="sub">Demo account: <span class="mono">${account}</span> · Password: <span class="mono">demo123</span>.</p>
    <form id="login-form" data-role="${role}">
      ${field({ username: '' }, 'username', 'Demo account')}
      ${field({ password: '' }, 'password', 'Password', 'password')}
      <div class="btnrow">
        <button class="btn pri" type="submit">Sign in</button>
        ${button('Fill demo account', 'fill-login', '', `data-account="${account}"`)}
        ${button('Back', 'navigate', '', 'data-route="#/"')}
      </div>
    </form>
  </div>`;
}

export function applicantHomeView(apps) {
  const summary = {
    total: apps.length,
    reviewing: apps.filter(app => ['submitted', 'reviewing'].includes(app.status)).length,
    needInfo: apps.filter(app => app.status === 'need_info').length,
    completed: apps.filter(app => ['approved', 'rejected'].includes(app.status)).length
  };
  const statusMessages = {
    draft: 'Application not submitted',
    submitted: 'Automated assessment and officer review in progress',
    reviewing: 'Automated assessment and officer review in progress',
    need_info: 'Additional information is required',
    approved: 'Application approved',
    rejected: 'Application declined'
  };
  const rows = apps.slice().sort((a, b) => b.createdAt - a.createdAt).map(app => {
    const vehicleEntered = String(app.carModel ?? '').trim().length > 0;
    const hasLoanContext = vehicleEntered || Number(app.carPrice) > 0 || Number(app.downPayment) > 0;
    const loanAmountMissing = app.loanAmount === null || app.loanAmount === undefined || app.loanAmount === '';
    const unenteredDraftLoan = app.status === 'draft'
      && (loanAmountMissing || (Number(app.loanAmount) === 0 && !hasLoanContext));
    const vehicleDisplay = app.status === 'draft' && !vehicleEntered
      ? 'Not entered'
      : app.carModel || 'Not selected';
    const loanAmountDisplay = unenteredDraftLoan ? '—' : money(app.loanAmount);
    const applicantStatusLabel = ['submitted', 'reviewing'].includes(app.status)
      ? 'In Review'
      : STATUS[app.status]?.label || app.status;
    const applicantStatusTag = `<span class="tag ${STATUS[app.status]?.cls || 't-gray'}">${esc(applicantStatusLabel)}</span>`;
    let action;
    if (app.status === 'draft') {
      action = button('Continue Application', 'navigate', 'sm dashboard-action action-primary', `data-route="#/form/${esc(app.id)}"`);
    } else if (app.status === 'need_info') {
      action = button('Provide Information', 'navigate', 'sm dashboard-action action-attention', `data-route="#/supplement/${esc(app.id)}"`);
    } else if (['approved', 'rejected'].includes(app.status)) {
      action = button('View Decision', 'navigate', 'sm dashboard-action action-secondary', `data-route="#/status/${esc(app.id)}"`);
    } else {
      action = button('View Status', 'navigate', 'sm dashboard-action action-secondary', `data-route="#/status/${esc(app.id)}"`);
    }
    return `<tr>
      <td data-label="Application ID"><span class="mono app-id">${esc(app.id)}</span></td>
      <td data-label="Vehicle">${esc(vehicleDisplay)}</td>
      <td data-label="Loan amount"><span class="mono">${loanAmountDisplay}</span></td>
      <td data-label="Status"><div class="application-status">${applicantStatusTag}<span>${statusMessages[app.status] || 'Current application status'}</span></div></td>
      <td data-label="Created"><span class="mono muted">${fmtTime(app.createdAt)}</span></td>
      <td data-label="Next action"><div class="btnrow application-actions">${action}</div></td>
    </tr>`;
  }).join('');
  const applicationList = rows
    ? `<div class="application-table-wrap"><table class="application-table">
        <caption class="sr">Your car loan applications</caption>
        <thead><tr><th>Application ID</th><th>Vehicle</th><th>Loan amount</th><th>Status</th><th>Created</th><th>Next action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`
    : `<div class="application-empty">
        <span class="empty-mark" aria-hidden="true"></span>
        <h2>No applications yet</h2>
        <p>Start a new application to explore the complete applicant and risk-review workflow.</p>
        ${button('New application', 'new-application', 'pri')}
      </div>`;
  return `<section class="applicant-dashboard" aria-labelledby="applications-title">
    <header class="dashboard-header">
      <div>
        <p class="eyebrow">Applicant dashboard</p>
        <h1 id="applications-title">My Applications</h1>
        <p>Create a new application, continue a draft, or track an existing case.</p>
      </div>
      ${button('New application', 'new-application', 'pri dashboard-new')}
    </header>

    <section class="app-summary" aria-label="Application summary">
      <div class="summary-card summary-total"><span class="summary-mark" aria-hidden="true"></span><div><strong>${summary.total}</strong><b>Total Applications</b><span>All saved cases</span></div></div>
      <div class="summary-card summary-review"><span class="summary-mark" aria-hidden="true"></span><div><strong>${summary.reviewing}</strong><b>In Review</b><span>Assessment underway</span></div></div>
      <div class="summary-card summary-info"><span class="summary-mark" aria-hidden="true"></span><div><strong>${summary.needInfo}</strong><b>Need Information</b><span>Applicant action required</span></div></div>
      <div class="summary-card summary-complete"><span class="summary-mark" aria-hidden="true"></span><div><strong>${summary.completed}</strong><b>Completed</b><span>Decision recorded</span></div></div>
    </section>

    <section class="application-list" aria-labelledby="application-list-title">
      <div class="application-list-heading">
        <div><p class="section-label">Applications</p><h2 id="application-list-title">Application history</h2></div>
        <span>${summary.total} ${summary.total === 1 ? 'record' : 'records'}</span>
      </div>
      ${applicationList}
    </section>
  </section>`;
}

function stepOne(app) {
  return `<div class="note"><b>MyInfo Sandbox</b><br>Authorize a simulated retrieval of identity details. No real government service is contacted.</div>
    <div class="btnrow" style="margin-bottom:16px">${button('Use MyInfo simulated authorization', 'pull-myinfo', 'pri')}${button('View authorization scope', 'toggle-scope')}</div>
    <div id="scope-note" class="note" hidden>Scope: name, masked NRIC / FIN, age, residency status, phone number, education, and marital status.</div>
    <div class="grid2">${field(app, 'name', 'Full name')}${field(app, 'nric', 'NRIC / FIN')}
      ${field(app, 'age', 'Age', 'number')}${select(app, 'residency', 'Residency status', ['Singapore Citizen', 'Permanent Resident', 'Work Pass Holder'])}
      ${field(app, 'phone', 'Mobile number')}${field(app, 'education', 'Highest education')}
      ${field(app, 'marital', 'Marital status')}</div>
    <label class="consent"><input name="consent" type="checkbox" style="width:auto" ${app.consent ? 'checked' : ''}>
      I authorize the use of these synthetic details for this loan assessment.</label>`;
}

function stepTwo(app) {
  return `<div class="grid2">${select(app, 'empType', 'Employment type', ['Full-time employee', 'Self-employed / part-time', 'Contract employee'])}
    ${field(app, 'employer', 'Employer / business')}${field(app, 'title', 'Job title')}${field(app, 'empMonths', 'Months in current employment', 'number')}
    ${field(app, 'incomeDeclared', 'Declared monthly income (S$)', 'number')}${field(app, 'incomeVerified', 'Verified monthly income (S$)', 'number', true)}</div>
    <div class="btnrow">${button('Retrieve simulated CPF contribution record', 'pull-cpf')}</div>`;
}

function stepThree(app) {
  return `<div class="btnrow" style="margin-bottom:18px">${button('Authorize simulated credit report retrieval', 'pull-credit')}</div>
    <div class="grid2">${field(app, 'existingMonthly', 'Existing monthly repayments (S$)', 'number')}
      ${field(app, 'outstanding', 'Total outstanding debt (S$)', 'number')}
      ${field(app, 'latePayments', 'Late payments in the last 12 months', 'number')}
      ${field(app, 'otherLoans', 'Other active loans', 'number')}</div>
    <div class="note">The sandbox returns synthetic credit values only. No credit bureau is contacted.</div>`;
}

function stepFour(app, assessment) {
  const metrics = assessment.metrics;
  const exceeds = metrics.ltv > metrics.cap + 0.0001;
  return `<div class="grid2">${field(app, 'carModel', 'Vehicle make and model')}${field(app, 'carPrice', 'Vehicle price (S$)', 'number')}
    ${field(app, 'omv', 'Open Market Value (S$)', 'number')}${field(app, 'carAge', 'Vehicle age (years)', 'number')}
    ${field(app, 'downPayment', 'Down payment (S$)', 'number')}${field(app, 'loanAmount', 'Loan amount (S$)', 'number')}
    ${select(app, 'tenureYears', 'Loan tenure (years)', [1, 2, 3, 4, 5, 6, 7].map(String))}</div>
    <div class="note ${exceeds ? 'bad' : ''}" id="ltv-check">
      <b>LTV check: ${pct(metrics.ltv)}</b> · Applicable cap: ${pct(metrics.cap)} · Estimated monthly payment: ${money(metrics.monthly)}
      <br>${exceeds ? 'The requested financing exceeds the applicable cap.' : 'The requested financing is within the applicable cap.'}
    </div>`;
}

function stepFive(app, assessment) {
  const missing = requiredMissing(app);
  return `<div class="grid2">
    <div class="fgroup"><b>Applicant</b><div class="chk"><span>Name</span><span>${esc(app.name)}</span></div>
      <div class="chk"><span>NRIC / FIN</span><span class="mono">${esc(app.nric)}</span></div>
      <div class="chk"><span>Employer</span><span>${esc(app.employer)}</span></div>
      <div class="chk"><span>Verified monthly income</span><span>${money(app.incomeVerified)}</span></div></div>
    <div class="fgroup"><b>Loan</b><div class="chk"><span>Vehicle</span><span>${esc(app.carModel)}</span></div>
      <div class="chk"><span>Price</span><span>${money(app.carPrice)}</span></div>
      <div class="chk"><span>Loan amount</span><span>${money(app.loanAmount)}</span></div>
      <div class="chk"><span>Indicative risk band</span><span class="tag ${assessment.level === 'Low' ? 't-ok' : assessment.level === 'High' ? 't-bad' : 't-warn'}">${assessment.level}</span></div></div>
  </div>
  ${missing.length ? `<div class="note bad">Complete these required fields before submission: ${missing.join(', ')}.</div>` : ''}
  ${!app.consent ? '<div class="note bad">Applicant authorization is required before submission.</div>' : ''}
  <div class="note">By submitting, you confirm that all entered information is complete and accurate for this synthetic demonstration.</div>`;
}

export function formView({ app, step, assessment }) {
  const panels = [stepOne(app), stepTwo(app), stepThree(app), stepFour(app, assessment), stepFive(app, assessment)];
  return `<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:18px">
    <div><h1>Car loan application</h1><p class="sub mono">${app.id} · ${STATUS[app.status].label}</p></div>
    <span style="flex:1"></span><div class="btnrow"><span class="muted">Load preset:</span>
      ${button('Low risk', 'load-preset', 'sm', 'data-kind="low"')}${button('Medium risk', 'load-preset', 'sm', 'data-kind="medium"')}${button('High risk', 'load-preset', 'sm', 'data-kind="high"')}</div>
  </div>
  <div class="steps">${STEP_NAMES.map((name, index) => `<div class="step ${index + 1 === step ? 'on' : index + 1 < step ? 'done' : ''}"><span>${index + 1}</span>${name}</div>`).join('')}</div>
  <form id="application-form" data-id="${app.id}" class="card">${panels[step - 1]}
    <div class="hr"></div><div class="btnrow">
      ${step > 1 ? button('Previous', 'change-step', '', 'data-delta="-1"') : button('Back to list', 'navigate', '', 'data-route="#/apply-home"')}
      ${step < 5 ? button('Next', 'change-step', 'pri', 'data-delta="1"') : button('Submit application', 'submit-application', 'pri')}
      ${button('Save draft', 'save-draft')}</div>
  </form>`;
}

export function statusView(app, logs) {
  const stages = [
    ['Application created', app.createdAt],
    ['Application submitted', app.submittedAt],
    ['Automated checks completed', logs.find(item => item.action === 'Risk Assessed')?.ts],
    [app.status === 'need_info' ? 'Additional information requested' : 'Officer review', logs.find(item => ['Approved', 'Rejected', 'Information Requested'].includes(item.action))?.ts],
    [app.status === 'approved' ? 'Application approved' : app.status === 'rejected' ? 'Application rejected' : 'Final decision', ['approved', 'rejected'].includes(app.status) ? logs.find(item => ['Approved', 'Rejected'].includes(item.action))?.ts : null]
  ];
  const reached = app.status === 'draft' ? 0 : app.status === 'submitted' ? 1 : ['reviewing', 'need_info'].includes(app.status) ? 3 : 4;
  return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
    <div><h1>Application status</h1><p class="sub mono">${app.id}</p></div><span style="flex:1"></span>${tag(app.status)}
  </div><div class="grid2">
    <div class="card"><h2>Progress</h2><ol class="tl">${stages.map(([label, time], index) =>
      `<li class="${index < reached ? 'done' : index === reached ? 'now' : ''}"><b>${label}</b><div class="muted mono">${fmtTime(time)}</div></li>`).join('')}</ol></div>
    <div class="card"><h2>Application summary</h2>
      <div class="chk"><span>Applicant</span><span>${esc(app.name)}</span></div><div class="chk"><span>Vehicle</span><span>${esc(app.carModel)}</span></div>
      <div class="chk"><span>Loan amount</span><span>${money(app.loanAmount)}</span></div>
      ${app.needInfoReason ? `<div class="note warn"><b>Information requested</b><br>${esc(app.needInfoReason)}</div>` : ''}
      ${app.officerNote && ['approved', 'rejected'].includes(app.status) ? `<div class="note ${app.status === 'rejected' ? 'bad' : ''}"><b>Officer decision</b><br>${esc(app.officerNote)}</div>` : ''}
      <div class="btnrow">${button('Back to list', 'navigate', '', 'data-route="#/apply-home"')}
      ${app.status === 'need_info' ? button('Provide information', 'navigate', 'warn', `data-route="#/supplement/${app.id}"`) : ''}</div>
    </div></div>`;
}

export function supplementView(app, uploads = []) {
  return `<div class="card" style="max-width:760px;margin:20px auto"><h1>Provide additional information</h1>
    <p class="mono sub">${app.id}</p><div class="note warn"><b>Officer request</b><br>${esc(app.needInfoReason)}</div>
    <form id="supplement-form" data-id="${app.id}">
      <label class="f"><span>Applicant note</span><textarea name="supplementNote" placeholder="Explain the documents provided">${esc(app.supplementNote)}</textarea></label>
      <div class="fgroup"><b>Simulated uploads</b><div id="upload-list">${uploads.length ? uploads.map(name => `<div class="chk"><span>${esc(name)}</span><span class="tag t-ok">Ready</span></div>`).join('') : '<p class="muted">No files added yet.</p>'}</div></div>
      <div class="btnrow">${button('Add simulated file', 'mock-upload')}${button('Submit information', 'submit-supplement', 'pri')}${button('Back', 'navigate', '', `data-route="#/status/${app.id}"`)}</div>
    </form></div>`;
}

export function queueView(apps, query) {
  const assessed = apps.map(app => ({ app, result: query.assessments[app.id] })).filter(({ app, result }) => {
    const keyword = query.kw.toLowerCase();
    return (!keyword || app.id.toLowerCase().includes(keyword) || app.name.toLowerCase().includes(keyword))
      && (!query.status || app.status === query.status) && (!query.level || result.level === query.level);
  });
  const pending = apps.filter(app => ['submitted', 'reviewing', 'need_info'].includes(app.status)).length;
  return `<div class="statrow"><div class="stat"><div class="n">${apps.length}</div><div class="l">All cases</div></div>
    <div class="stat"><div class="n">${pending}</div><div class="l">Open cases</div></div>
    <div class="stat"><div class="n">${apps.filter(app => app.status === 'approved').length}</div><div class="l">Approved</div></div>
    <div class="stat"><div class="n">${apps.filter(app => app.status === 'rejected').length}</div><div class="l">Rejected</div></div></div>
    <div style="display:flex;align-items:center;gap:14px;margin:18px 0"><div><h1>Officer queue</h1><p class="sub">Prioritized application review workspace</p></div>
      <span style="flex:1"></span>${button('Audit records', 'navigate', '', 'data-route="#/audit"')}</div>
    <div class="card"><div class="btnrow" style="margin-bottom:16px">
      <input id="queue-keyword" style="flex:2;min-width:200px" placeholder="Search application ID or applicant" value="${esc(query.kw)}">
      <select id="queue-status" style="flex:1"><option value="">All statuses</option>${Object.entries(STATUS).map(([key, value]) => `<option value="${key}" ${query.status === key ? 'selected' : ''}>${value.label}</option>`).join('')}</select>
      <select id="queue-level" style="flex:1"><option value="">All risk bands</option>${['Low', 'Medium', 'High'].map(level => `<option ${query.level === level ? 'selected' : ''}>${level}</option>`).join('')}</select>
      ${button('Apply filters', 'filter-queue')}</div>
      <table><thead><tr><th>Application</th><th>Applicant</th><th>Loan</th><th>Status</th><th>Risk</th><th>Score</th><th>Action</th></tr></thead>
      <tbody>${assessed.map(({ app, result }) => `<tr><td class="mono">${app.id}</td><td>${esc(app.name)}</td><td class="mono">${money(app.loanAmount)}</td>
        <td>${tag(app.status)}</td><td><span class="tag ${result.level === 'Low' ? 't-ok' : result.level === 'High' ? 't-bad' : 't-warn'}">${result.level}</span></td>
        <td class="mono">${result.score}</td><td>${button('Review', 'navigate', 'sm pri', `data-route="#/case/${app.id}"`)}</td></tr>`).join('') || '<tr><td colspan="7">No matching cases.</td></tr>'}</tbody></table>
    </div>`;
}

const PROFILE_FIELDS = [
  ['name', 'Full name', 'MyInfo', true], ['nric', 'NRIC / FIN', 'MyInfo', false], ['age', 'Age', 'MyInfo', false],
  ['residency', 'Residency status', 'MyInfo', false], ['employer', 'Employer / business', 'Applicant', true], ['title', 'Job title', 'Applicant', false],
  ['empMonths', 'Months employed', 'Applicant', true], ['incomeDeclared', 'Declared monthly income', 'Applicant', true],
  ['incomeVerified', 'Verified monthly income', 'CPF Sandbox', true], ['existingMonthly', 'Existing monthly repayments', 'Credit Sandbox', true],
  ['outstanding', 'Outstanding debt', 'Credit Sandbox', true], ['latePayments', 'Late payments', 'Credit Sandbox', true],
  ['carPrice', 'Vehicle price', 'Applicant', true], ['omv', 'OMV', 'Applicant', true], ['downPayment', 'Down payment', 'Applicant', true],
  ['loanAmount', 'Loan amount', 'Applicant', true], ['tenureYears', 'Loan tenure', 'Applicant', true]
];
const MONEY_FIELDS = new Set(['incomeDeclared', 'incomeVerified', 'existingMonthly', 'outstanding', 'carPrice', 'omv', 'downPayment', 'loanAmount']);

function profileHtml(app) {
  return `<div class="fgroup"><b>Verified applicant profile</b>${PROFILE_FIELDS.map(([key, label, source, model]) => {
    const value = MONEY_FIELDS.has(key) ? money(app[key]) : key === 'tenureYears' ? `${esc(app[key])} years` : esc(app[key] || '—');
    return `<div class="frow" id="f_${key}"><div class="k">${label}</div><div class="v ${MONEY_FIELDS.has(key) ? 'mono' : ''}">${value}</div>
      <div><span class="chip">${source}</span><span class="chip ok">Verified</span><span class="chip ${model ? 'ok' : 'ref'}">${model ? 'Used by model' : 'Verification only'}</span></div></div>`;
  }).join('')}</div>${button('View original submission', 'show-original', 'sm')}`;
}

function checksHtml(app, result, allApps) {
  const missing = requiredMissing(app), duplicates = findDuplicates(app, allApps), metrics = result.metrics;
  const checks = [
    ['MyInfo authorization', app.myinfoPulled, app.myinfoPulled ? 'Retrieved' : 'Not retrieved'],
    ['CPF contribution record', app.cpfPulled || n(app.incomeVerified) > 0, n(app.incomeVerified) > 0 ? 'Retrieved' : 'Not retrieved'],
    ['Credit report authorization', app.creditPulled, app.creditPulled ? 'Retrieved' : 'Not retrieved'],
    ['Required information', missing.length === 0, missing.length ? `${missing.length} missing` : 'Complete']
  ];
  const consistency = [
    ['Income consistency', metrics.gap > 0.15, `${pct(metrics.gap)} difference`],
    ['Loan components equal vehicle price', Math.abs(n(app.downPayment) + n(app.loanAmount) - n(app.carPrice)) > 1, money(n(app.downPayment) + n(app.loanAmount))],
    ['Duplicate application check', duplicates.length > 0, duplicates.length ? `${duplicates.length} with the same NRIC: ${duplicates.map(item => item.id).join(', ')}` : 'None found']
  ];
  return `<div class="fgroup"><b>Information completeness</b>${checks.map(([label, ok, detail]) => `<div class="chk"><span>${label}<br><span class="muted">${detail}</span></span><span class="tag ${ok ? 't-ok' : 't-warn'}">${ok ? 'Complete' : 'Attention'}</span></div>`).join('')}</div>
    <div class="fgroup"><b>Consistency checks</b>${consistency.map(([label, issue, detail]) => `<div class="chk"><span>${label}<br><span class="muted mono">${detail}</span></span><span class="tag ${issue ? 't-warn' : 't-ok'}">${issue ? 'Potential inconsistency' : 'Consistent'}</span></div>`).join('')}</div>
    <div class="fgroup"><b>Key metrics</b><div class="chk"><span>LTV</span><span class="mono">${pct(metrics.ltv)} / ${pct(metrics.cap)} cap</span></div>
      <div class="chk"><span>Debt service ratio</span><span class="mono">${pct(metrics.dsr)}</span></div><div class="chk"><span>Estimated monthly payment</span><span class="mono">${money(metrics.monthly)}</span></div></div>
    <div class="fgroup"><b>Triggered rules</b>
      ${result.hard.map(item => `<div class="note bad" style="margin:6px 0"><span class="mono">${item.rule}</span> ${item.text}</div>`).join('')}
      ${result.rules.length ? result.rules.map(rule => `<div class="chk"><span class="mono" style="font-size:12px">${rule}</span></div>`).join('') : '<div class="muted">No scoring rules were triggered.</div>'}</div>`;
}

function decisionHtml(app, result) {
  const max = Math.max(...result.factors.map(item => item.score), 1);
  const color = result.level === 'High' ? 'var(--bad)' : result.level === 'Medium' ? 'var(--warn)' : 'var(--ok)';
  const locked = ['approved', 'rejected'].includes(app.status);
  return `<div class="score"><span class="n" style="color:${color}">${result.score}</span><span class="sub">/ 100 · Risk band <b>${result.level}</b></span></div>
    <p class="muted mono">Model ${result.modelVersion} · Deterministic and reproducible</p><div class="hr"></div>
    <b class="section-label">Primary risk factors (select to inspect evidence)</b>
    <div style="margin-top:10px">${result.factors.length ? result.factors.map(item => `<button class="bar" data-action="highlight-fields" data-fields="${item.fields.join(',')}">
      <span class="lb"><span>${item.label}</span><span class="mono">+${item.score}</span></span><span class="track"><span class="fill" style="width:${Math.round(item.score / max * 100)}%"></span></span></button>`).join('') : '<p class="muted">No risk factors were triggered beyond the base score.</p>'}</div>
    ${result.questions.length ? `<div class="fgroup"><b>Questions to verify</b>${result.questions.map(question => `<div class="chk"><span>· ${question}</span></div>`).join('')}</div>` : ''}
    <div class="note"><b>AI processing recommendation: ${result.recommendation}</b><br>The model advises only. A loan officer must confirm and record the final decision.</div>
    <details style="margin:12px 0"><summary class="btn sm">Adjust parameters and rerun</summary><div style="margin-top:12px">
      <label class="f"><span>Down payment (S$)</span><input id="s-down" type="number" value="${n(app.downPayment)}"></label>
      <label class="f"><span>Verified monthly income (S$)</span><input id="s-income" type="number" value="${n(app.incomeVerified)}"></label>
      ${button('Recalculate', 'rerun-risk', 'sm', `data-id="${app.id}"`)}<div id="rerun-output" style="margin-top:10px"></div></div></details>
    <div class="hr thick"></div><b class="section-label">Human decision</b>
    ${locked ? `<div class="note ${app.status === 'rejected' ? 'bad' : ''}" style="margin-top:10px"><b>Completed: ${app.decision}</b><br>${esc(app.officerNote)}</div>` :
    `<div class="btnrow" style="margin:12px 0">${button('Approve', 'pick-decision', 'ok', 'data-decision="Approve"')}
      ${button('Request information', 'pick-decision', 'warn', 'data-decision="Request Info"')}${button('Reject', 'pick-decision', 'bad', 'data-decision="Reject"')}</div>
      <label class="f"><span>Officer rationale (required)</span><textarea id="officer-note" placeholder="Explain why you accept or adjust the model recommendation"></textarea></label>
      <p class="muted" id="decision-info">No action selected.</p>
      ${button('Submit final action', 'commit-decision', 'pri', `data-id="${app.id}" disabled`)}`}`;
}

export function caseView(app, result, allApps) {
  return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px"><div><h1>Case review</h1><p class="sub mono">${app.id} · ${esc(app.name)}</p></div>
    <span style="flex:1"></span>${tag(app.status)}${button('Back to queue', 'navigate', '', 'data-route="#/queue"')}${button('Audit records', 'navigate', '', 'data-route="#/audit"')}</div>
    <div class="cols"><section class="col"><div class="colhd"><b>1 · Verified profile</b><div class="muted">Facts and source provenance</div></div><div class="colbd">${profileHtml(app)}</div></section>
      <section class="col"><div class="colhd"><b>2 · Automated checks</b><div class="muted">Completeness, consistency, and rules</div></div><div class="colbd">${checksHtml(app, result, allApps)}</div></section>
      <section class="col"><div class="colhd"><b>3 · Assessment & decision</b><div class="muted">Model advice separated from human judgment</div></div><div class="colbd">${decisionHtml(app, result)}</div></section></div>`;
}

export function auditView(logs) {
  const rows = logs.slice().sort((a, b) => b.ts - a.ts).map(item => `<tr><td class="mono">${fmtTime(item.ts)}</td><td class="mono">${item.appId}</td>
    <td><span class="tag t-gray">${item.action}</span></td><td>${item.actor}</td><td class="mono muted">${item.modelVersion}</td><td>${esc(item.note)}</td></tr>`).join('');
  return `<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px"><div><h1>Audit records</h1><p class="sub">Chronological, versioned workflow history</p></div>
    <span style="flex:1"></span>${button('Export CSV', 'export-audit')}${button('Back to queue', 'navigate', '', 'data-route="#/queue"')}</div>
    <div class="card"><table><thead><tr><th>Time</th><th>Application ID</th><th>Action</th><th>Actor</th><th>Model version</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function notFoundView() {
  return `<div class="card"><h1>Page not found</h1><p>The requested route does not exist.</p>${button('Return home', 'navigate', 'pri', 'data-route="#/"')}</div>`;
}

export function unauthorizedView() {
  return `<div class="card"><h1>Sign in required</h1><p>Please choose the appropriate role before opening this page.</p>${button('Choose role', 'navigate', 'pri', 'data-route="#/"')}</div>`;
}
