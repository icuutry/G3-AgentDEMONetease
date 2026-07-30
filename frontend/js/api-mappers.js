export const APPLICATION_FIELDS = Object.freeze([
  'consent',
  'myinfoPulled',
  'cpfPulled',
  'creditPulled',
  'name',
  'nric',
  'age',
  'residency',
  'phone',
  'empType',
  'employer',
  'title',
  'empMonths',
  'incomeDeclared',
  'incomeVerified',
  'education',
  'marital',
  'existingMonthly',
  'outstanding',
  'latePayments',
  'otherLoans',
  'carModel',
  'carPrice',
  'omv',
  'carAge',
  'downPayment',
  'loanAmount',
  'tenureYears'
]);

const NUMERIC_APPLICATION_FIELDS = new Set([
  'age',
  'empMonths',
  'incomeDeclared',
  'incomeVerified',
  'existingMonthly',
  'outstanding',
  'latePayments',
  'otherLoans',
  'carPrice',
  'omv',
  'carAge',
  'downPayment',
  'loanAmount',
  'tenureYears'
]);

const NULLABLE_NUMERIC_APPLICATION_FIELDS = new Set(
  [...NUMERIC_APPLICATION_FIELDS].filter(field => field !== 'tenureYears')
);

const LEVELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High'
};

const RECOMMENDATIONS = {
  approve: 'Approve',
  manual_review: 'Manual Review',
  reject: 'Reject'
};

const HARD_RULE_ACTIONS = {
  reject: 'Reject',
  manual_review: 'Manual Review'
};

const AUDIT_ACTIONS = {
  draft_created: 'Draft Created',
  draft_saved: 'Draft Saved',
  submitted: 'Submitted',
  information_retrieved: 'Information Retrieved',
  risk_assessed: 'Risk Assessed',
  information_requested: 'Information Requested',
  information_submitted: 'Information Submitted',
  approved: 'Approved',
  rejected: 'Rejected'
};

function timestamp(value) {
  if (value == null || value === '') return value;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function numericValue(value) {
  if (typeof value !== 'string') return value;
  if (value.trim() === '') return null;
  const converted = Number(value);
  return Number.isNaN(converted) ? value : converted;
}

export function serializeApplication(payload = {}, { patch = false } = {}) {
  const serialized = {};

  for (const field of APPLICATION_FIELDS) {
    const value = payload[field];
    if (value === undefined) continue;
    if (
      NUMERIC_APPLICATION_FIELDS.has(field)
      && !NULLABLE_NUMERIC_APPLICATION_FIELDS.has(field)
      && (value === null || (typeof value === 'string' && value.trim() === ''))
    ) {
      continue;
    }
    serialized[field] = NUMERIC_APPLICATION_FIELDS.has(field)
      ? numericValue(value)
      : value;
  }

  return serialized;
}

export function normalizeRiskAssessment(assessment) {
  if (!assessment) return null;

  const levelKey = String(assessment.level ?? '').toLowerCase();
  const recommendationKey = String(assessment.recommendation ?? '').toLowerCase();
  const sourceMetrics = assessment.metrics || {};
  const sourceHardRules = Array.isArray(assessment.hardRules)
    ? assessment.hardRules
    : Array.isArray(assessment.hard)
      ? assessment.hard
      : [];

  return {
    ...assessment,
    createdAt: timestamp(assessment.createdAt),
    level: LEVELS[levelKey] || assessment.level,
    recommendation: RECOMMENDATIONS[recommendationKey] || assessment.recommendation,
    factors: Array.isArray(assessment.factors) ? assessment.factors : [],
    rules: Array.isArray(assessment.rules) ? assessment.rules : [],
    questions: Array.isArray(assessment.questions) ? assessment.questions : [],
    hard: sourceHardRules.map(rule => ({
      ...rule,
      action: HARD_RULE_ACTIONS[String(rule.action ?? '').toLowerCase()] || rule.action
    })),
    metrics: {
      ...sourceMetrics,
      dpRatio: sourceMetrics.downPaymentRatio ?? sourceMetrics.dpRatio ?? 0,
      gap: sourceMetrics.incomeGap ?? sourceMetrics.gap ?? 0,
      monthly: sourceMetrics.monthlyPayment ?? sourceMetrics.monthly ?? 0
    }
  };
}

export function normalizeApplication(application) {
  if (!application) return null;

  return {
    ...application,
    createdAt: timestamp(application.createdAt),
    updatedAt: timestamp(application.updatedAt),
    submittedAt: timestamp(application.submittedAt),
    supplementFiles: Array.isArray(application.supplementFiles)
      ? application.supplementFiles.map(normalizeSupplementFile)
      : [],
    riskAssessment: normalizeRiskAssessment(application.riskAssessment)
  };
}

export function normalizeSupplementFile(file) {
  if (!file) return null;

  return {
    ...file,
    name: file.name,
    size: file.size,
    contentType: file.contentType
  };
}

export function normalizeSupplement(supplement) {
  if (!supplement) return null;

  return {
    ...supplement,
    createdAt: timestamp(supplement.createdAt),
    files: Array.isArray(supplement.files)
      ? supplement.files.map(normalizeSupplementFile)
      : []
  };
}

export function serializeSupplementFile(file = {}) {
  const size = Number(file.size);
  return {
    name: String(file.name ?? ''),
    size: Number.isFinite(size) ? size : 0,
    contentType: String(file.contentType || file.type || 'application/octet-stream')
  };
}

export function normalizeAuditLog(record) {
  if (!record) return null;

  const actionCode = record.actionCode ?? record.action;
  const action = record.action ?? AUDIT_ACTIONS[actionCode] ?? actionCode;
  const metadata = record.metadata ?? record.metadataJson ?? {};

  return {
    ...record,
    appId: record.appId ?? record.applicationId,
    ts: timestamp(record.ts ?? record.createdAt),
    actionCode,
    action,
    role: record.role ?? record.actorRole,
    details: record.details ?? record.note,
    metadata
  };
}

export function normalizeMockRetrieval(response) {
  if (!response) return null;

  return {
    ...response,
    retrievedAt: timestamp(response.retrievedAt),
    application: normalizeApplication(response.application)
  };
}

export function normalizeMockPersonas(response) {
  if (!response) return null;

  return {
    ...response,
    items: Array.isArray(response.items) ? response.items : []
  };
}
