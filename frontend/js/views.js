import { STATUS, STEP_NAMES } from './demo-data.js';
import {
  findDuplicates, money, n, pct, REQUIRED_APPLICATION_FIELDS, requiredMissing
} from './risk-engine.js';

export const esc = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
export const fmtTime = timestamp => {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const tag = status => `<span class="tag ${STATUS[status]?.cls || 't-gray'}">${STATUS[status]?.label || status}</span>`;
const button = (label, action, extra = '', data = '') => `<button class="btn ${extra}" data-action="${action}" ${data}>${label}</button>`;
const requiredApplicationFields = new Map(REQUIRED_APPLICATION_FIELDS.map(definition => [definition.key, definition]));
const field = (app, key, label, type = 'text', readonly = false, errors = {}) => {
  const definition = requiredApplicationFields.get(key);
  const required = Boolean(definition && !readonly);
  const error = errors[key];
  const errorId = `error-${key}`;
  const minimum = definition?.minExclusive !== undefined
    ? 'min="0.01"'
    : definition?.min !== undefined
      ? `min="${definition.min}"`
      : '';
  return `<label class="f ${readonly ? 'readonly-field' : ''} ${error ? 'field-error' : ''}">
    <span class="field-label">${label}${required ? ' <abbr class="required-mark" title="required">*</abbr>' : ''}</span>
    <input name="${key}" type="${type}" value="${esc(app[key])}" ${minimum} ${readonly ? 'readonly' : ''} ${required ? 'required aria-required="true"' : ''} ${error ? `aria-invalid="true" aria-describedby="${errorId}"` : ''}>
    ${readonly ? '<small class="field-help">Retrieved from simulated CPF contribution data &middot; Read only</small>' : ''}
    ${error ? `<small class="field-error-message" id="${errorId}">${esc(error)}</small>` : ''}
  </label>`;
};
const select = (app, key, label, options) => `
  <label class="f"><span class="field-label">${label}</span><select name="${key}">
    ${options.map(option => `<option ${String(app[key]) === String(option) ? 'selected' : ''}>${option}</option>`).join('')}
  </select></label>`;
const formStepDetails = [
  ['Applicant details', 'Provide your identity details and authorize simulated data retrieval.'],
  ['Employment & income', 'Add your employment information and retrieve a simulated contribution record.'],
  ['Debt & credit', 'Review existing commitments using synthetic credit information.'],
  ['Vehicle & loan', 'Enter the vehicle and financing details for this application.'],
  ['Review & submit', 'Review your information and confirm the synthetic application before submission.']
];
const reviewText = value => {
  const text = String(value ?? '').trim();
  return text ? esc(text) : '—';
};
const reviewMoney = value => value === null || value === undefined || value === '' ? '—' : money(value);

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
  const portal = applicant ? 'Applicant portal' : 'Loan officer portal';
  const description = applicant
    ? 'Create an application, retrieve simulated records, and follow its status.'
    : 'Review applications, inspect risk evidence, and record accountable decisions.';
  return `<section class="login-page login-${role}" aria-labelledby="login-title">
    <div class="login-context">
      <div class="login-role-mark" aria-hidden="true"><span></span></div>
      <p class="eyebrow">${portal.toUpperCase()}</p>
      <h1 id="login-title">${applicant ? 'Applicant sign in' : 'Officer sign in'}</h1>
      <p>${description}</p>
      <div class="login-assurance"><b>Educational prototype</b><span>All accounts and records use synthetic demonstration data.</span></div>
    </div>
    <div class="login-card">
      <div class="login-card-heading"><h2>Access the demo</h2><p>Use the provided credentials or fill them automatically.</p></div>
      <div class="demo-credentials" aria-label="Demo credentials">
        <div><span>Demo account</span><b class="mono">${account}</b></div>
        <div><span>Password</span><b class="mono">demo123</b></div>
      </div>
      <form id="login-form" data-role="${role}">
        ${field({ username: '' }, 'username', applicant ? 'Email address' : 'Email or staff ID')}
        ${field({ password: '' }, 'password', 'Password', 'password')}
        <button class="btn pri login-submit" type="submit">Sign in</button>
        <div class="login-secondary-actions">
          ${button('Fill demo account', 'fill-login', '', `data-account="${account}"`)}
          ${button('Back to portal selection', 'navigate', '', 'data-route="#/"')}
        </div>
      </form>
    </div>
  </section>`;
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

function stepOne(app, errors) {
  const consentError = errors.consent;
  return `<div class="data-source-panel">
      <div class="data-source-copy"><span class="source-kicker">Retrieve verified information</span><h3>Simulated MyInfo</h3>
        <p>Use simulated government data to prefill eligible identity fields. No real government service is contacted.</p></div>
      <span class="source-status ${app.myinfoPulled ? 'is-ready' : ''}">${app.myinfoPulled ? 'Retrieved · Prefilled fields are editable' : 'Demo data · Not retrieved'}</span>
      <div class="data-source-actions">${button('Use MyInfo simulated authorization', 'pull-myinfo', 'source-action')}${button('View authorization scope', 'toggle-scope', 'source-secondary')}</div>
    </div>
    <div id="scope-note" class="note scope-note" hidden>Scope: name, masked NRIC / FIN, age, residency status, phone number, education, and marital status.</div>
    <div class="grid2">${field(app, 'name', 'Full name', 'text', false, errors)}${field(app, 'nric', 'NRIC / FIN', 'text', false, errors)}
      ${field(app, 'age', 'Age', 'number', false, errors)}${select(app, 'residency', 'Residency status', ['Singapore Citizen', 'Permanent Resident', 'Work Pass Holder'])}
      ${field(app, 'phone', 'Mobile number', 'text', false, errors)}${field(app, 'education', 'Highest education', 'text', false, errors)}
      ${field(app, 'marital', 'Marital status', 'text', false, errors)}</div>
    <label class="consent ${consentError ? 'field-error' : ''}"><input name="consent" type="checkbox" style="width:auto" required aria-required="true" ${app.consent ? 'checked' : ''} ${consentError ? 'aria-invalid="true" aria-describedby="error-consent"' : ''}>
      <span>I authorize the use of these synthetic details for this loan assessment.
      ${consentError ? `<small class="field-error-message" id="error-consent">${esc(consentError)}</small>` : ''}</span></label>`;
}

function stepTwo(app, errors) {
  return `<div class="data-source-panel compact-source">
      <div class="data-source-copy"><span class="source-kicker">Retrieve verified information</span><h3>Simulated CPF contribution record</h3>
        <p>Retrieve synthetic contribution data to verify monthly income. Employment details and declared income must still be entered by the applicant.</p></div>
      <span class="source-status ${app.cpfPulled ? 'is-ready' : ''}">${app.cpfPulled ? 'Retrieved &middot; Verified income available' : 'Demo data &middot; Verified income not retrieved'}</span>
      <div class="data-source-actions">${button('Retrieve simulated CPF contribution record', 'pull-cpf', 'source-action')}</div>
    </div>
    <div class="grid2">${select(app, 'empType', 'Employment type', ['Full-time employee', 'Self-employed / part-time', 'Contract employee'])}
    ${field(app, 'employer', 'Employer / business', 'text', false, errors)}${field(app, 'title', 'Job title', 'text', false, errors)}${field(app, 'empMonths', 'Months in current employment', 'number', false, errors)}
    ${field(app, 'incomeDeclared', 'Declared monthly income (S$)', 'number', false, errors)}${field(app, 'incomeVerified', 'Verified monthly income (S$)', 'number', true, errors)}</div>`;
}

function stepThree(app, errors) {
  return `<div class="data-source-panel compact-source">
      <div class="data-source-copy"><span class="source-kicker">Retrieve verified information</span><h3>Simulated credit report</h3>
        <p>Use synthetic credit data to prefill the commitments below. No credit bureau is contacted.</p></div>
      <span class="source-status ${app.creditPulled ? 'is-ready' : ''}">${app.creditPulled ? 'Retrieved · Prefilled fields are editable' : 'Demo data · Not retrieved'}</span>
      <div class="data-source-actions">${button('Authorize simulated credit report retrieval', 'pull-credit', 'source-action')}</div>
    </div>
    <div class="grid2">${field(app, 'existingMonthly', 'Existing monthly repayments (S$)', 'number', false, errors)}
      ${field(app, 'outstanding', 'Total outstanding debt (S$)', 'number', false, errors)}
      ${field(app, 'latePayments', 'Late payments in the last 12 months', 'number', false, errors)}
      ${field(app, 'otherLoans', 'Other active loans', 'number', false, errors)}</div>`;
}

function stepFour(app, assessment, errors) {
  const metrics = assessment.metrics;
  const exceeds = metrics.ltv > metrics.cap + 0.0001;
  return `<div class="grid2">${field(app, 'carModel', 'Vehicle make and model', 'text', false, errors)}${field(app, 'carPrice', 'Vehicle price (S$)', 'number', false, errors)}
    ${field(app, 'omv', 'Open Market Value (S$)', 'number', false, errors)}${field(app, 'carAge', 'Vehicle age (years)', 'number', false, errors)}
    ${field(app, 'downPayment', 'Down payment (S$)', 'number', false, errors)}${field(app, 'loanAmount', 'Loan amount (S$)', 'number', false, errors)}
    ${select(app, 'tenureYears', 'Loan tenure (years)', [1, 2, 3, 4, 5, 6, 7].map(String))}</div>
    <div class="note ${exceeds ? 'bad' : ''}" id="ltv-check">
      <b>LTV check: ${pct(metrics.ltv)}</b> · Applicable cap: ${pct(metrics.cap)} · Estimated monthly payment: ${money(metrics.monthly)}
      <br>${exceeds ? 'The requested financing exceeds the applicable cap.' : 'The requested financing is within the applicable cap.'}
    </div>`;
}

function stepFive(app, assessment) {
  const missing = requiredMissing(app);
  return `<div class="review-grid">
    <section class="review-group"><h3>Applicant details</h3>
      <div class="review-row"><span>Full name</span><strong>${reviewText(app.name)}</strong></div>
      <div class="review-row"><span>NRIC / FIN</span><strong class="mono">${reviewText(app.nric)}</strong></div>
      <div class="review-row"><span>Residency</span><strong>${reviewText(app.residency)}</strong></div>
      <div class="review-row"><span>Mobile number</span><strong>${reviewText(app.phone)}</strong></div>
    </section>
    <section class="review-group"><h3>Employment and income</h3>
      <div class="review-row"><span>Employer</span><strong>${reviewText(app.employer)}</strong></div>
      <div class="review-row"><span>Job title</span><strong>${reviewText(app.title)}</strong></div>
      <div class="review-row"><span>Months employed</span><strong>${reviewText(app.empMonths)}</strong></div>
      <div class="review-row"><span>Declared monthly income</span><strong>${reviewMoney(app.incomeDeclared)}</strong></div>
      <div class="review-row"><span>Verified monthly income</span><strong>${reviewMoney(app.incomeVerified)}</strong></div>
    </section>
    <section class="review-group"><h3>Debt and credit</h3>
      <div class="review-row"><span>Monthly repayments</span><strong>${reviewMoney(app.existingMonthly)}</strong></div>
      <div class="review-row"><span>Outstanding debt</span><strong>${reviewMoney(app.outstanding)}</strong></div>
      <div class="review-row"><span>Late payments</span><strong>${reviewText(app.latePayments)}</strong></div>
      <div class="review-row"><span>Other active loans</span><strong>${reviewText(app.otherLoans)}</strong></div>
    </section>
    <section class="review-group"><h3>Vehicle and loan request</h3>
      <div class="review-row"><span>Vehicle</span><strong>${reviewText(app.carModel)}</strong></div>
      <div class="review-row"><span>Vehicle price</span><strong>${reviewMoney(app.carPrice)}</strong></div>
      <div class="review-row"><span>Open Market Value</span><strong>${reviewMoney(app.omv)}</strong></div>
      <div class="review-row"><span>Down payment</span><strong>${reviewMoney(app.downPayment)}</strong></div>
      <div class="review-row"><span>Loan amount</span><strong>${reviewMoney(app.loanAmount)}</strong></div>
      <div class="review-row"><span>Tenure</span><strong>${app.tenureYears ? `${reviewText(app.tenureYears)} years` : '—'}</strong></div>
      <div class="review-row"><span>Indicative risk band</span><strong><span class="tag ${assessment.level === 'Low' ? 't-ok' : assessment.level === 'High' ? 't-bad' : 't-warn'}">${esc(assessment.level)}</span></strong></div>
    </section>
  </div>
  ${missing.length ? `<div class="note bad form-alert" role="alert">Complete these required fields before submission: ${missing.join(', ')}.</div>` : ''}
  ${!app.consent ? '<div class="note bad form-alert" role="alert">Applicant authorization is required before submission.</div>' : ''}
  <div class="submission-notice"><b>Synthetic demonstration</b><span>By submitting, you confirm that all entered information is complete and accurate for this synthetic demonstration.</span></div>`;
}

export function formView({ app, step, assessment, errors = {}, validationSummary = '' }) {
  const panels = [stepOne(app, errors), stepTwo(app, errors), stepThree(app, errors), stepFour(app, assessment, errors), stepFive(app, assessment)];
  const [stepTitle, stepDescription] = formStepDetails[step - 1];
  const visibleErrors = Object.entries(errors).filter(([key]) => {
    if (key === 'consent') return step === 1;
    return requiredApplicationFields.get(key)?.step === step;
  });
  const primaryAction = step < STEP_NAMES.length
    ? button('Continue', 'change-step', 'pri form-primary', 'data-delta="1"')
    : button('Submit application', 'submit-application', 'pri form-primary');
  return `<section class="application-flow" aria-labelledby="application-page-title">
    <div class="form-top-nav">${button('← Back to applications', 'navigate', 'form-back-link', 'data-route="#/apply-home"')}</div>
    <header class="form-page-header">
      <div><p class="eyebrow">New application</p><h1 id="application-page-title">Apply for a car loan</h1>
        <p>Complete the steps below. You can review your information before submission.</p>
        <span class="application-reference mono">${esc(app.id)} · ${esc(STATUS[app.status].label)}</span></div>
      <div class="demo-preset-panel"><span>Demo data presets</span><div class="preset-actions">
        ${button('Low risk', 'load-preset', 'sm', 'data-kind="low"')}${button('Medium risk', 'load-preset', 'sm', 'data-kind="medium"')}${button('High risk', 'load-preset', 'sm', 'data-kind="high"')}
      </div></div>
    </header>
    <nav class="form-progress" aria-label="Application progress">
      <div class="progress-summary"><span>Step ${step} of ${STEP_NAMES.length}</span><strong>${stepTitle}</strong></div>
      <ol class="form-stepper">${STEP_NAMES.map((name, index) => {
        const number = index + 1;
        const state = number === step ? 'current' : number < step ? 'complete' : 'future';
        return `<li class="${state}" ${number === step ? 'aria-current="step"' : ''}><span class="step-marker">${number < step ? '✓' : number}</span><span class="step-name">${name}</span></li>`;
      }).join('')}</ol>
    </nav>
    <form id="application-form" data-id="${esc(app.id)}" class="application-form-card">
      <div class="form-section-heading"><p>Step ${step}</p><h2 id="form-step-heading">${stepTitle}</h2><span>${stepDescription}</span></div>
      ${validationSummary && visibleErrors.length ? `<div class="form-validation-summary" id="form-validation-summary" role="alert" tabindex="-1">
        <b>${esc(validationSummary)}</b><ul>${visibleErrors.map(([key, message]) => `<li data-field="${esc(key)}">${esc(message)}</li>`).join('')}</ul>
      </div>` : ''}
      <div class="form-step-content">${panels[step - 1]}</div>
      <footer class="form-actions">
        <div class="form-actions-back">${step > 1 ? button('Back', 'change-step', 'form-secondary', 'data-delta="-1"') : ''}</div>
        <div class="form-actions-main">${button('Save draft', 'save-draft', 'form-save')}${primaryAction}</div>
      </footer>
    </form>
  </section>`;
}

export function statusView(app, logs) {
  const auditLogs = Array.isArray(logs) ? logs : [];
  const riskLog = auditLogs.find(item => item.action === 'Risk Assessed');
  const reviewLog = auditLogs.find(item => ['Approved', 'Rejected', 'Information Requested'].includes(item.action));
  const decisionLog = auditLogs.find(item => item.action === (app.status === 'approved' ? 'Approved' : 'Rejected'));
  const statusDetails = {
    draft: {
      headline: 'Application not submitted',
      supporting: 'Finish the remaining details when you are ready.',
      description: 'Your application is saved as a draft and has not entered assessment.',
      next: 'Continue the application, review the details, and submit it when you are ready.',
      tone: 'draft'
    },
    submitted: {
      headline: 'Application received',
      supporting: 'Follow the progress of your submitted application.',
      description: 'Your application has been submitted. Automated assessment and officer review are in progress.',
      next: 'No action is required right now. Your application is being assessed.',
      tone: 'review'
    },
    reviewing: {
      headline: 'Review in progress',
      supporting: 'Track the current review and any required next step.',
      description: 'The automated assessment is complete and an officer review is in progress.',
      next: 'No action is required right now. Return to this page later to see the recorded outcome.',
      tone: 'review'
    },
    need_info: {
      headline: 'Additional information required',
      supporting: 'Review the request and provide the information needed to continue.',
      description: 'The review is paused until you provide the requested information.',
      next: 'Submit the requested information so the officer can continue reviewing your application.',
      tone: 'attention'
    },
    approved: {
      headline: 'Application approved',
      supporting: 'Review the recorded outcome and available decision details.',
      description: 'An approval decision has been recorded for this application.',
      next: 'The decision has been recorded. Review the decision details below.',
      tone: 'approved'
    },
    rejected: {
      headline: 'Application declined',
      supporting: 'Review the recorded outcome and available decision explanation.',
      description: 'A decline decision has been recorded for this application.',
      next: 'The decision has been recorded. Review the available explanation below.',
      tone: 'rejected'
    }
  };
  const detail = statusDetails[app.status] || {
    headline: STATUS[app.status]?.label || 'Application status',
    supporting: 'Review the latest available information for this application.',
    description: 'Review the current application status and progress below.',
    next: 'Return to your applications list for the latest available information.',
    tone: 'draft'
  };
  const stages = [
    ['Application created', app.createdAt],
    ['Application submitted', app.submittedAt],
    ['Automated assessment', riskLog?.ts],
    [app.status === 'need_info' ? 'Additional information requested' : 'Officer review', reviewLog?.ts],
    ['Decision recorded', decisionLog?.ts]
  ];
  const currentStage = app.status === 'draft' ? -1 : app.status === 'submitted' ? 2 : ['reviewing', 'need_info'].includes(app.status) ? 3 : 4;
  const completedThrough = app.status === 'draft' ? 0 : app.status === 'submitted' ? 1 : ['reviewing', 'need_info'].includes(app.status) ? 2 : 3;
  const primaryAction = app.status === 'draft'
    ? button('Continue Application', 'navigate', 'status-primary pri', `data-route="#/form/${esc(app.id)}"`)
      : app.status === 'need_info'
      ? button('Provide Information', 'navigate', 'status-primary status-primary-attention', `data-route="#/supplement/${esc(app.id)}"`)
      : '';
  const statusBadge = `<span class="tag ${STATUS[app.status]?.cls || 't-gray'}">${esc(STATUS[app.status]?.label || app.status)}</span>`;
  const unavailable = '&mdash;';
  const overview = [
    ['Application ID', esc(app.id), 'mono'],
    ['Created date', app.createdAt ? fmtTime(app.createdAt) : unavailable, 'mono'],
    ['Vehicle', String(app.carModel ?? '').trim() ? esc(app.carModel) : unavailable, ''],
    ['Vehicle price', app.carPrice === null || app.carPrice === undefined || app.carPrice === '' ? unavailable : money(app.carPrice), 'mono'],
    ['Requested loan amount', app.loanAmount === null || app.loanAmount === undefined || app.loanAmount === '' ? unavailable : money(app.loanAmount), 'mono'],
    ['Loan tenure', app.tenureYears === null || app.tenureYears === undefined || app.tenureYears === '' ? unavailable : `${esc(app.tenureYears)} years`, ''],
    ['Current status', esc(STATUS[app.status]?.label || app.status), '']
  ];
  const decided = ['approved', 'rejected'].includes(app.status);

  return `<section class="status-page" aria-labelledby="status-page-title">
    <div class="status-top-nav">${button('Back to applications', 'navigate', 'status-back', 'data-route="#/apply-home"')}</div>
    <header class="status-page-header">
      <div>
        <p class="eyebrow">APPLICATION STATUS</p>
        <h1 id="status-page-title">Application ${esc(app.id)}</h1>
        <p>${esc(detail.supporting)}</p>
      </div>
      <div class="status-current">${statusBadge}</div>
    </header>

    <section class="status-banner status-banner-${detail.tone}" role="status" aria-labelledby="status-summary-title">
      <div class="status-banner-copy">
        <span class="status-signal" aria-hidden="true"></span>
        <div><h2 id="status-summary-title">${esc(detail.headline)}</h2><p>${esc(detail.description)}</p></div>
      </div>
      ${primaryAction ? `<div class="status-banner-action">${primaryAction}</div>` : ''}
    </section>

    <section class="status-card status-progress-card" aria-labelledby="status-progress-title">
      <div class="status-section-heading"><div><p class="eyebrow">WORKFLOW</p><h2 id="status-progress-title">Application progress</h2></div></div>
      <ol class="status-progress">${stages.map(([label, time], index) => {
        const state = index <= completedThrough ? 'complete' : index === currentStage ? 'current' : 'future';
        const stateLabel = state === 'complete' ? 'Completed' : state === 'current' ? 'Current stage' : 'Upcoming';
        return `<li class="${state}" ${state === 'current' ? 'aria-current="step"' : ''}>
          <span class="status-progress-marker" aria-hidden="true">${state === 'complete' ? '&#10003;' : index + 1}</span>
          <div><b>${esc(label)}</b><span>${time ? fmtTime(time) : stateLabel}</span></div>
        </li>`;
      }).join('')}</ol>
    </section>

    <div class="status-detail-grid">
      <section class="status-card" aria-labelledby="application-overview-title">
        <div class="status-section-heading"><div><p class="eyebrow">DETAILS</p><h2 id="application-overview-title">Application overview</h2></div></div>
        <dl class="status-overview">${overview.map(([label, value, className]) =>
          `<div><dt>${label}</dt><dd class="${className}">${value}</dd></div>`).join('')}</dl>
      </section>
      <section class="status-card status-next-card" aria-labelledby="status-next-title">
        <div class="status-section-heading"><div><p class="eyebrow">NEXT STEP</p><h2 id="status-next-title">What happens next</h2></div></div>
        <p>${esc(detail.next)}</p>
      </section>
    </div>

    ${app.status === 'need_info' && app.needInfoReason ? `<section class="status-card status-request-card" aria-labelledby="status-request-title">
      <div class="status-section-heading"><div><p class="eyebrow">ACTION REQUIRED</p><h2 id="status-request-title">Information requested</h2></div></div>
      <p>${esc(app.needInfoReason)}</p>
    </section>` : ''}

    ${decided ? `<section class="status-card status-decision-card status-decision-${app.status}" aria-labelledby="status-decision-title">
      <div class="status-section-heading"><div><p class="eyebrow">RECORDED OUTCOME</p><h2 id="status-decision-title">Decision</h2></div>${statusBadge}</div>
      <dl class="status-decision-details">
        <div><dt>Decision status</dt><dd>${esc(STATUS[app.status]?.label || app.status)}</dd></div>
        <div><dt>Decision date</dt><dd class="mono">${decisionLog?.ts ? fmtTime(decisionLog.ts) : unavailable}</dd></div>
      </dl>
      ${app.officerNote ? `<div class="status-decision-explanation"><h3>Decision explanation</h3><p>${esc(app.officerNote)}</p></div>` : ''}
      <p class="status-prototype-note">This is a simulated decision for demonstration purposes.</p>
    </section>` : ''}
  </section>`;
}

export function supplementView(app, uploads = []) {
  const files = uploads.map((file, index) => {
    const name = typeof file === 'string' ? file : file?.name || `document_${index + 1}.pdf`;
    return `<li><span class="upload-file-mark" aria-hidden="true"></span><div><b>${esc(name)}</b><span>Simulated PDF document</span></div><span class="tag t-ok">Ready</span></li>`;
  }).join('');
  return `<section class="supplement-page" aria-labelledby="supplement-title">
    <div class="supplement-nav">${button('Back to application status', 'navigate', 'supplement-back', `data-route="#/status/${app.id}"`)}</div>
    <header class="supplement-header"><div><p class="eyebrow">ACTION REQUIRED</p><h1 id="supplement-title">Provide additional information</h1>
      <p><span class="mono">${esc(app.id)}</span> · Add the requested evidence so review can continue.</p></div>${tag(app.status)}</header>
    <section class="supplement-request" aria-labelledby="officer-request-title">
      <span class="supplement-request-mark" aria-hidden="true">!</span><div><p class="eyebrow">OFFICER REQUEST</p>
        <h2 id="officer-request-title">Information needed</h2><p>${esc(app.needInfoReason || 'Please provide the requested supporting information.')}</p></div>
    </section>
    <form class="supplement-form" id="supplement-form" data-id="${app.id}">
      <section class="supplement-card">
        <div class="supplement-section-heading"><span class="supplement-step">1</span><div><h2>Add a note</h2><p>Briefly explain what you are providing.</p></div></div>
        <label class="f supplement-note"><span>Applicant note <small>Optional</small></span>
          <textarea name="supplementNote" placeholder="For example: Attached are my bank statements for the requested period.">${esc(app.supplementNote)}</textarea></label>
      </section>
      <section class="supplement-card">
        <div class="supplement-section-heading"><span class="supplement-step">2</span><div><h2>Add supporting documents</h2><p>Files are simulated in this educational prototype.</p></div></div>
        <div id="upload-list">${files ? `<ul class="upload-list">${files}</ul>` : `<div class="upload-empty"><span class="upload-empty-mark" aria-hidden="true"></span><b>No files added yet</b><p>Add at least one simulated document before submitting.</p></div>`}</div>
        ${button('Add simulated file', 'mock-upload', 'supplement-add')}
      </section>
      <div class="supplement-submit-bar"><div><b>Ready to send?</b><span>The case will return to officer review.</span></div>
        ${button('Submit information', 'submit-supplement', 'pri supplement-submit', files ? '' : 'disabled aria-disabled="true"')}</div>
    </form>
    <p class="supplement-prototype-note">Prototype note: document content is not uploaded or processed; only synthetic file metadata is recorded.</p>
  </section>`;
}

const OFFICER_ACTION_LABELS = {
  draft: 'View draft',
  submitted: 'Open case',
  reviewing: 'Continue review',
  need_info: 'View request',
  approved: 'View decision',
  rejected: 'View decision'
};

const RISK_TEXT = {
  income_consistency: 'Income consistency',
  debt_service_ratio: 'Debt service burden',
  employment_stability: 'Employment stability',
  vehicle_age_and_residual_value: 'Vehicle age and residual value',
  duplicate_application: 'Possible duplicate application',
  payment_history: 'Payment history',
  down_payment_ratio: 'Down payment strength',
  verify_undeclared_instalments_or_guarantees: 'Confirm any undeclared instalments or guarantees',
  request_three_month_bank_statements: 'Request the latest three months of bank statements',
  verify_employment_and_probation_status: 'Confirm employment and probation status',
  verify_duplicate_application: 'Confirm whether the related application is a duplicate'
};

const readableRiskText = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  if (RISK_TEXT[raw]) return RISK_TEXT[raw];
  const cleaned = raw
    .replace(/^verify_duplicate_application:/, 'Confirm related application ')
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const readableRule = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const [group, detail] = raw.split(':');
  if (!detail) return readableRiskText(raw);
  return `${group.toUpperCase()} · ${readableRiskText(detail)}`;
};

export function queueView(apps, query) {
  const assessed = apps.map(app => ({ app, result: query.assessments[app.id] })).filter(({ app, result }) => {
    const keyword = query.kw.toLowerCase();
    return (!keyword || app.id.toLowerCase().includes(keyword) || app.name.toLowerCase().includes(keyword))
      && (!query.status || app.status === query.status) && (!query.level || result.level === query.level);
  });
  const pending = apps.filter(app => ['submitted', 'reviewing', 'need_info'].includes(app.status)).length;
  const activeFilters = [query.kw, query.status, query.level].filter(Boolean).length;
  const rows = assessed.map(({ app, result }) => {
    const riskClass = result.level === 'Low' ? 't-ok' : result.level === 'High' ? 't-bad' : 't-warn';
    const priorityClass = ['submitted', 'reviewing'].includes(app.status) ? 'queue-row-active' : '';
    return `<tr class="${priorityClass}">
      <td data-label="Application"><b class="mono queue-id">${app.id}</b></td>
      <td data-label="Applicant"><b class="queue-applicant">${esc(app.name)}</b></td>
      <td data-label="Loan" class="mono">${money(app.loanAmount)}</td>
      <td data-label="Status">${tag(app.status)}</td>
      <td data-label="Risk"><span class="queue-risk"><span class="tag ${riskClass}">${result.level}</span><b class="mono">${result.score}</b></span></td>
      <td data-label="Action" class="queue-action">${button(OFFICER_ACTION_LABELS[app.status] || 'View case', 'navigate', 'sm pri', `data-route="#/case/${app.id}"`)}</td>
    </tr>`;
  }).join('');
  return `<section class="officer-page officer-queue-page" aria-labelledby="officer-queue-title">
    <header class="officer-page-header">
      <div><p class="eyebrow">LOAN OPERATIONS</p><h1 id="officer-queue-title">Officer queue</h1>
        <p>Prioritize applications, inspect risk evidence, and record accountable decisions.</p></div>
      ${button('Audit records', 'navigate', 'officer-secondary', 'data-route="#/audit"')}
    </header>
    <section class="officer-stats" aria-label="Case summary">
      <article class="officer-stat stat-all"><span class="officer-stat-mark" aria-hidden="true"></span><div><strong class="mono">${apps.length}</strong><b>All cases</b><span>Across every status</span></div></article>
      <article class="officer-stat stat-open"><span class="officer-stat-mark" aria-hidden="true"></span><div><strong class="mono">${pending}</strong><b>Open cases</b><span>Require follow-up</span></div></article>
      <article class="officer-stat stat-approved"><span class="officer-stat-mark" aria-hidden="true"></span><div><strong class="mono">${apps.filter(app => app.status === 'approved').length}</strong><b>Approved</b><span>Final decisions</span></div></article>
      <article class="officer-stat stat-rejected"><span class="officer-stat-mark" aria-hidden="true"></span><div><strong class="mono">${apps.filter(app => app.status === 'rejected').length}</strong><b>Rejected</b><span>Final decisions</span></div></article>
    </section>
    <section class="officer-workspace" aria-labelledby="case-list-title">
      <div class="officer-workspace-heading"><div><p class="eyebrow">REVIEW WORKSPACE</p><h2 id="case-list-title">Applications</h2>
        <p>${assessed.length} of ${apps.length} cases shown${activeFilters ? ` · ${activeFilters} active filter${activeFilters > 1 ? 's' : ''}` : ''}</p></div></div>
      <div class="queue-filters" role="search" aria-label="Filter officer queue">
        <label class="queue-search"><span class="sr">Search application ID or applicant</span>
          <input id="queue-keyword" placeholder="Search application ID or applicant" value="${esc(query.kw)}"></label>
        <label><span class="sr">Filter by status</span><select id="queue-status"><option value="">All statuses</option>${Object.entries(STATUS).map(([key, value]) => `<option value="${key}" ${query.status === key ? 'selected' : ''}>${value.label}</option>`).join('')}</select></label>
        <label><span class="sr">Filter by risk band</span><select id="queue-level"><option value="">All risk bands</option>${['Low', 'Medium', 'High'].map(level => `<option ${query.level === level ? 'selected' : ''}>${level}</option>`).join('')}</select></label>
        ${button('Apply filters', 'filter-queue', 'pri queue-filter-button')}
      </div>
      <div class="queue-table-wrap"><table class="queue-table"><thead><tr><th>Application</th><th>Applicant</th><th>Loan</th><th>Status</th><th>Risk / score</th><th>Action</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6"><div class="queue-empty"><b>No matching cases</b><span>Try changing the search term or filters.</span></div></td></tr>`}</tbody></table></div>
    </section>
  </section>`;
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
  const sourceState = source => {
    if (source === 'Applicant') return ['Self-declared', 'declared'];
    if (source === 'MyInfo') return [app.myinfoPulled ? 'Verified' : 'Not retrieved', app.myinfoPulled ? 'verified' : 'pending'];
    if (source === 'CPF Sandbox') return [(app.cpfPulled || n(app.incomeVerified) > 0) ? 'Verified' : 'Not retrieved', (app.cpfPulled || n(app.incomeVerified) > 0) ? 'verified' : 'pending'];
    if (source === 'Credit Sandbox') return [app.creditPulled ? 'Verified' : 'Not retrieved', app.creditPulled ? 'verified' : 'pending'];
    return ['Reference', 'pending'];
  };
  return `<div class="fgroup profile-group"><b>Applicant data and provenance</b>${PROFILE_FIELDS.map(([key, label, source, model]) => {
    const value = MONEY_FIELDS.has(key) ? money(app[key]) : key === 'tenureYears' ? `${esc(app[key])} years` : esc(app[key] || '—');
    const [stateLabel, stateClass] = sourceState(source);
    return `<div class="frow" id="f_${key}"><div class="k">${label}</div><div class="v ${MONEY_FIELDS.has(key) ? 'mono' : ''}">${value}</div>
      <div class="chips"><span class="chip">${source}</span><span class="chip ${stateClass}">${stateLabel}</span><span class="chip ${model ? 'model' : 'ref'}">${model ? 'Used in assessment' : 'Reference only'}</span></div></div>`;
  }).join('')}</div><div class="profile-actions">${button('View original submission', 'show-original', 'sm')}</div>`;
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
      ${result.hard.map(item => `<div class="note bad officer-rule"><b>${esc(readableRule(item.rule))}</b><span>${esc(item.text)}</span></div>`).join('')}
      ${result.rules.length ? result.rules.map(rule => `<div class="chk officer-rule-row"><span>${esc(readableRule(rule))}</span></div>`).join('') : '<div class="muted">No scoring rules were triggered.</div>'}</div>`;
}

function decisionHtml(app, result) {
  const max = Math.max(...result.factors.map(item => item.score), 1);
  const color = result.level === 'High' ? 'var(--bad)' : result.level === 'Medium' ? 'var(--warn)' : 'var(--ok)';
  const locked = ['approved', 'rejected'].includes(app.status);
  const canDecide = app.status === 'reviewing';
  const unavailableMessage = {
    draft: 'This draft has not been submitted for assessment.',
    submitted: 'This application has been submitted but is not yet under active review.',
    need_info: 'A request is with the applicant. Continue the decision after supplementary information is submitted.'
  }[app.status] || 'A human decision is not available for the current status.';
  return `<div class="assessment-summary"><div class="score"><span class="n" style="color:${color}">${result.score}</span><span class="sub">/ 100</span></div>
      <div><span class="assessment-band-label">Risk band</span><span class="tag ${result.level === 'Low' ? 't-ok' : result.level === 'High' ? 't-bad' : 't-warn'}">${result.level}</span></div></div>
    <p class="muted model-version">Model ${esc(result.modelVersion)} · Deterministic and reproducible</p><div class="hr"></div>
    <b class="section-label">Primary risk factors (select to inspect evidence)</b>
    <div class="risk-factors">${result.factors.length ? result.factors.map(item => `<button class="bar" data-action="highlight-fields" data-fields="${item.fields.join(',')}">
      <span class="lb"><span>${esc(readableRiskText(item.label))}</span><span class="mono">+${item.score}</span></span><span class="track"><span class="fill" style="width:${Math.round(item.score / max * 100)}%"></span></span></button>`).join('') : '<p class="muted">No risk factors were triggered beyond the base score.</p>'}</div>
    ${result.questions.length ? `<div class="fgroup verification-questions"><b>Questions to verify</b>${result.questions.map(question => `<div class="chk"><span>${esc(readableRiskText(question))}</span></div>`).join('')}</div>` : ''}
    <div class="note recommendation-note"><span class="recommendation-kicker">Model recommendation</span><b>${esc(result.recommendation)}</b><p>The model provides advice only. The loan officer remains responsible for the final decision.</p></div>
    <details style="margin:12px 0"><summary class="btn sm">Adjust parameters and rerun</summary><div style="margin-top:12px">
      <label class="f"><span>Down payment (S$)</span><input id="s-down" type="number" value="${n(app.downPayment)}"></label>
      <label class="f"><span>Verified monthly income (S$)</span><input id="s-income" type="number" value="${n(app.incomeVerified)}"></label>
      ${button('Recalculate', 'rerun-risk', 'sm', `data-id="${app.id}"`)}<div id="rerun-output" style="margin-top:10px"></div></div></details>
    <div class="hr thick"></div><div class="human-decision-heading"><div><b class="section-label">Human decision</b><span>Officer-owned outcome</span></div></div>
    ${locked ? `<div class="note ${app.status === 'rejected' ? 'bad' : ''}" style="margin-top:10px"><b>Completed: ${app.decision}</b><br>${esc(app.officerNote)}</div>` :
    canDecide ? `<div class="btnrow decision-options">${button('Approve', 'pick-decision', 'ok', 'data-decision="Approve"')}
      ${button('Request information', 'pick-decision', 'warn', 'data-decision="Request Info"')}${button('Reject', 'pick-decision', 'bad', 'data-decision="Reject"')}</div>
      <label class="f"><span>Officer rationale (required)</span><textarea id="officer-note" placeholder="Explain why you accept or adjust the model recommendation"></textarea></label>
      <p class="muted" id="decision-info">No action selected.</p>
      ${button('Submit final action', 'commit-decision', 'pri decision-submit', `data-id="${app.id}" disabled`)}` :
    `<div class="note warn decision-unavailable"><b>Decision controls unavailable</b><p>${esc(unavailableMessage)}</p></div>`}`;
}

export function caseView(app, result, allApps) {
  return `<section class="officer-page officer-case-page" aria-labelledby="case-review-title">
    <div class="officer-case-nav">${button('Back to queue', 'navigate', 'officer-back', 'data-route="#/queue"')}
      <div>${button('Audit records', 'navigate', 'officer-secondary', 'data-route="#/audit"')}</div></div>
    <header class="case-page-header"><div><p class="eyebrow">CASE REVIEW</p><h1 id="case-review-title">${esc(app.name)}</h1>
      <p><span class="mono">${app.id}</span> · Evidence-led assessment and human decision workspace</p></div>
      <div class="case-status">${tag(app.status)}</div></header>
    <div class="cols officer-case-cols">
      <section class="col officer-col officer-profile-col"><div class="colhd"><span class="col-step">1</span><div><b>Applicant profile</b><span>Facts, sources, and assessment use</span></div></div><div class="colbd">${profileHtml(app)}</div></section>
      <section class="col officer-col officer-checks-col"><div class="colhd"><span class="col-step">2</span><div><b>Automated checks</b><span>Completeness, consistency, and rules</span></div></div><div class="colbd">${checksHtml(app, result, allApps)}</div></section>
      <section class="col officer-col officer-decision-col"><div class="colhd"><span class="col-step">3</span><div><b>Assessment &amp; decision</b><span>Model advice separated from human judgment</span></div></div><div class="colbd">${decisionHtml(app, result)}</div></section>
    </div>
  </section>`;
}

const AUDIT_ACTIONS = {
  draft_created: ['Draft created', 't-gray'],
  draft_saved: ['Draft saved', 't-gray'],
  created: ['Application created', 't-gray'],
  submitted: ['Application submitted', 't-blue'],
  information_retrieved: ['Information retrieved', 't-blue'],
  risk_assessed: ['Risk assessed', 't-blue'],
  approved: ['Application approved', 't-ok'],
  rejected: ['Application rejected', 't-bad'],
  information_requested: ['Information requested', 't-warn'],
  information_submitted: ['Information submitted', 't-blue'],
  demo_reset: ['Demo reset', 't-gray']
};

export function auditView(logs) {
  const sorted = logs.slice().sort((a, b) => b.ts - a.ts);
  const applications = new Set(logs.map(item => item.appId).filter(Boolean)).size;
  const rows = sorted.map(item => {
    const actionKey = item.actionCode || item.action;
    const [label, className] = AUDIT_ACTIONS[actionKey] || [readableRiskText(item.action), 't-gray'];
    return `<tr>
      <td data-label="Time"><span class="mono audit-time">${fmtTime(item.ts)}</span></td>
      <td data-label="Application"><span class="mono audit-app">${esc(item.appId || '—')}</span></td>
      <td data-label="Event"><span class="tag ${className}">${esc(label)}</span></td>
      <td data-label="Actor">${esc(item.actor || 'System')}</td>
      <td data-label="Model"><span class="mono muted">${esc(item.modelVersion || '—')}</span></td>
      <td data-label="Details" class="audit-note">${esc(item.details || item.note || 'No additional details.')}</td>
    </tr>`;
  }).join('');
  return `<section class="audit-page" aria-labelledby="audit-title">
    <div class="audit-nav">${button('Back to queue', 'navigate', 'audit-back', 'data-route="#/queue"')}</div>
    <header class="audit-header"><div><p class="eyebrow">GOVERNANCE &amp; TRACEABILITY</p><h1 id="audit-title">Audit records</h1>
      <p>Chronological, versioned history of automated processing and human decisions.</p></div>
      ${button('Export CSV', 'export-audit', 'pri audit-export')}</header>
    <section class="audit-summary" aria-label="Audit summary">
      <div><span>Recorded events</span><b class="mono">${logs.length}</b></div>
      <div><span>Applications represented</span><b class="mono">${applications}</b></div>
      <div><span>Latest activity</span><b class="mono audit-latest">${sorted[0]?.ts ? fmtTime(sorted[0].ts) : '—'}</b></div>
    </section>
    <section class="audit-card" aria-labelledby="audit-history-title">
      <div class="audit-card-heading"><div><p class="eyebrow">EVENT HISTORY</p><h2 id="audit-history-title">Recorded activity</h2></div>
        <span>${logs.length} event${logs.length === 1 ? '' : 's'}</span></div>
      ${rows ? `<div class="audit-table-wrap"><table class="audit-table"><thead><tr><th>Time</th><th>Application</th><th>Event</th><th>Actor</th><th>Model</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="audit-empty"><span class="audit-empty-mark" aria-hidden="true"></span><h2>No audit records yet</h2><p>Activity will appear here after an application enters the workflow.</p></div>`}
    </section>
    <p class="audit-prototype-note">Synthetic demonstration records · Exported data is for educational use only.</p>
  </section>`;
}

export function notFoundView() {
  return `<section class="system-state" aria-labelledby="not-found-title"><span class="system-state-code mono">404</span>
    <div class="system-state-mark" aria-hidden="true"></div><p class="eyebrow">PAGE NOT FOUND</p><h1 id="not-found-title">This page is not available</h1>
    <p>The address may be incorrect, or the page may have moved within the demo.</p>${button('Return home', 'navigate', 'pri', 'data-route="#/"')}</section>`;
}

export function unauthorizedView() {
  return `<section class="system-state" aria-labelledby="sign-in-required-title"><span class="system-state-code mono">401</span>
    <div class="system-state-mark system-state-lock" aria-hidden="true"></div><p class="eyebrow">AUTHENTICATION REQUIRED</p><h1 id="sign-in-required-title">Sign in to continue</h1>
    <p>Choose the appropriate portal and use its demo account before opening this page.</p>${button('Choose a portal', 'navigate', 'pri', 'data-route="#/"')}</section>`;
}
