import {
  normalizeApplication,
  normalizeAuditLog,
  normalizeRiskAssessment,
  normalizeSupplement,
  serializeApplication,
  serializeSupplementFile
} from './api-mappers.js';

export const API_BASE_URL = (
  typeof window !== 'undefined' && window.CAR_LOAN_API_BASE
    ? window.CAR_LOAN_API_BASE
    : 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

export const SESSION_TOKEN_KEY = 'car_loan_agent_access_token';

const DECISIONS = {
  Approve: 'approve',
  Reject: 'reject',
  'Request Info': 'request_info'
};

export class ApiError extends Error {
  constructor({ status = 0, code = 'api_error', message = 'API request failed', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getToken() {
  return sessionStorage.getItem(SESSION_TOKEN_KEY) || '';
}

function clearToken() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

async function request(path, { method = 'GET', json } = {}) {
  const headers = {};
  const token = getToken();

  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json)
    });
  } catch (error) {
    throw new ApiError({
      status: 0,
      code: 'network_error',
      message: error instanceof Error ? error.message : 'Unable to reach the API',
      details: error
    });
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401) clearToken();

    const detail = data && typeof data === 'object' ? data.detail : null;
    const structuredDetail = detail && typeof detail === 'object' && !Array.isArray(detail)
      ? detail
      : null;
    const message = structuredDetail?.message
      || (typeof detail === 'string' ? detail : null)
      || `HTTP ${response.status} ${response.statusText || 'request failed'}`;
    const code = structuredDetail?.code || `http_${response.status}`;

    throw new ApiError({
      status: response.status,
      code,
      message,
      details: data
    });
  }

  return data;
}

function applicationPath(applicationId, suffix = '') {
  return `/applications/${encodeURIComponent(applicationId)}${suffix}`;
}

function decisionNote(payload) {
  const note = typeof payload === 'string' ? payload : payload?.note;
  const normalized = String(note ?? '').trim();
  if (!normalized) {
    throw new ApiError({
      status: 0,
      code: 'decision_note_required',
      message: 'A nonblank decision note is required',
      details: payload
    });
  }
  return normalized;
}

async function decideApplication(applicationId, action, payload) {
  const decision = DECISIONS[action];
  if (!decision) {
    throw new ApiError({
      status: 0,
      code: 'invalid_decision',
      message: `Unsupported decision action: ${action}`,
      details: action
    });
  }

  const application = await request(applicationPath(applicationId, '/decision'), {
    method: 'POST',
    json: { decision, note: decisionNote(payload) }
  });
  return normalizeApplication(application);
}

export async function login(credentials) {
  const result = await request('/auth/login', { method: 'POST', json: credentials });
  sessionStorage.setItem(SESSION_TOKEN_KEY, result.accessToken);
  return result.user;
}

export async function getCurrentUser() {
  return request('/auth/me');
}

export function logout() {
  clearToken();
}

export function hasSession() {
  return Boolean(getToken());
}

export async function listApplications(filters = {}) {
  const query = new URLSearchParams();
  for (const key of ['status', 'riskLevel', 'search']) {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  }

  const suffix = query.size ? `?${query.toString()}` : '';
  const result = await request(`/applications${suffix}`);
  return (Array.isArray(result?.items) ? result.items : []).map(normalizeApplication);
}

export async function getApplication(applicationId) {
  return normalizeApplication(await request(applicationPath(applicationId)));
}

export async function createApplication(payload = {}) {
  const application = await request('/applications', {
    method: 'POST',
    json: serializeApplication(payload)
  });
  return normalizeApplication(application);
}

export async function updateApplication(applicationId, payload = {}) {
  const application = await request(applicationPath(applicationId), {
    method: 'PATCH',
    json: serializeApplication(payload, { patch: true })
  });
  return normalizeApplication(application);
}

export async function submitApplication(applicationId) {
  const application = await request(applicationPath(applicationId, '/submit'), {
    method: 'POST'
  });
  return normalizeApplication(application);
}

export async function getRiskAssessment(applicationId) {
  const assessment = await request(applicationPath(applicationId, '/risk-assessment'));
  return normalizeRiskAssessment(assessment);
}

export async function evaluateApplication(applicationId, overrides = {}, persist = false) {
  const assessment = await request(applicationPath(applicationId, '/evaluate'), {
    method: 'POST',
    json: {
      overrides: serializeApplication(overrides),
      persist: Boolean(persist)
    }
  });
  return normalizeRiskAssessment(assessment);
}

export async function approveApplication(applicationId, payload) {
  return decideApplication(applicationId, 'Approve', payload);
}

export async function rejectApplication(applicationId, payload) {
  return decideApplication(applicationId, 'Reject', payload);
}

export async function requestSupplement(applicationId, payload) {
  return decideApplication(applicationId, 'Request Info', payload);
}

export async function submitSupplement(applicationId, payload = {}) {
  const response = await request(applicationPath(applicationId, '/supplements'), {
    method: 'POST',
    json: {
      note: String(payload.note ?? ''),
      files: (Array.isArray(payload.files) ? payload.files : []).map(serializeSupplementFile)
    }
  });

  return {
    supplement: normalizeSupplement(response),
    application: null,
    requiresApplicationRefetch: true
  };
}

export async function getAuditLogs(applicationId) {
  const query = new URLSearchParams();
  if (applicationId !== undefined && applicationId !== null && String(applicationId).trim() !== '') {
    query.set('applicationId', String(applicationId));
  }
  const suffix = query.size ? `?${query.toString()}` : '';
  const result = await request(`/audit-logs${suffix}`);
  return (Array.isArray(result?.items) ? result.items : []).map(normalizeAuditLog);
}

export async function resetDemo() {
  return request('/demo/reset', { method: 'POST' });
}
