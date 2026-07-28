import assert from 'node:assert/strict';

import {
  normalizeApplication,
  normalizeAuditLog,
  normalizeMockPersonas,
  normalizeMockRetrieval,
  serializeApplication
} from './api-mappers.js';
import {
  ApiError,
  createApplication,
  getRiskAssessment,
  listMockPersonas,
  retrieveCpf,
  retrieveCreditReport,
  retrieveMyInfo,
  submitSupplement,
  updateApplication
} from './api.js';

const patch = serializeApplication({
  age: '',
  empMonths: '   ',
  incomeDeclared: null,
  incomeVerified: undefined,
  existingMonthly: '0',
  latePayments: 0,
  consent: false,
  cpfPulled: false,
  unknownField: 'excluded'
}, { patch: true });

assert.deepEqual(patch, {
  consent: false,
  cpfPulled: false,
  existingMonthly: 0,
  latePayments: 0
});

const create = serializeApplication({
  age: '',
  incomeDeclared: null,
  existingMonthly: '0',
  consent: false,
  cpfPulled: true,
  unknownField: 'excluded'
});

assert.deepEqual(create, {
  consent: false,
  cpfPulled: true,
  age: null,
  incomeDeclared: null,
  existingMonthly: 0
});

const applicationResponse = {
  id: 'APP-1',
  cpfPulled: false,
  supplementNote: 'Latest income statement',
  supplementFiles: [{
    name: 'income.pdf',
    size: 321,
    contentType: 'application/pdf'
  }],
  createdAt: '2026-07-28T01:00:00Z',
  updatedAt: '2026-07-28T02:00:00Z',
  submittedAt: null,
  riskAssessment: null
};

const normalizedApplication = normalizeApplication(applicationResponse);
assert.equal(normalizedApplication.cpfPulled, false);
assert.equal(normalizedApplication.supplementNote, 'Latest income statement');
assert.deepEqual(normalizedApplication.supplementFiles, [{
  name: 'income.pdf',
  size: 321,
  contentType: 'application/pdf'
}]);

const mockResponse = {
  provider: 'cpf_sandbox',
  personaId: 'medium',
  snapshotVersion: '2026-07-01',
  label: 'Frozen synthetic dataset',
  retrievedAt: '2026-07-28T03:00:00Z',
  verified: true,
  application: applicationResponse
};
const normalizedMock = normalizeMockRetrieval(mockResponse);
assert.equal(normalizedMock.provider, 'cpf_sandbox');
assert.equal(normalizedMock.personaId, 'medium');
assert.equal(normalizedMock.snapshotVersion, '2026-07-01');
assert.equal(normalizedMock.label, 'Frozen synthetic dataset');
assert.equal(normalizedMock.verified, true);
assert.equal(normalizedMock.retrievedAt, Date.parse(mockResponse.retrievedAt));
assert.equal(normalizedMock.application.cpfPulled, false);
assert.deepEqual(normalizedMock.application.supplementFiles, applicationResponse.supplementFiles);

const personasResponse = {
  snapshotVersion: '2026-07-01',
  label: 'Frozen synthetic dataset',
  items: [{ personaId: 'low', displayName: 'Low risk' }]
};
assert.deepEqual(normalizeMockPersonas(personasResponse), personasResponse);

const audit = normalizeAuditLog({
  applicationId: 'legacy-id',
  appId: 'APP-1',
  action: 'CPF Retrieved',
  actionCode: 'cpf_retrieved',
  createdAt: '2026-07-28T01:00:00Z',
  ts: 123456,
  metadata: { provider: 'cpf_sandbox' },
  metadataJson: { legacy: true }
});
assert.equal(audit.appId, 'APP-1');
assert.equal(audit.action, 'CPF Retrieved');
assert.equal(audit.actionCode, 'cpf_retrieved');
assert.equal(audit.ts, 123456);
assert.deepEqual(audit.metadata, { provider: 'cpf_sandbox' });

const requests = [];
const responseQueue = [];
globalThis.sessionStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url, options });
  const response = responseQueue.shift();
  assert.ok(response, `Unexpected fetch: ${options.method || 'GET'} ${url}`);
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.statusText || '',
    async text() {
      return response.body === undefined ? '' : JSON.stringify(response.body);
    }
  };
};

function queueJson(body, status = 200) {
  responseQueue.push({ body, status });
}

function lastRequest() {
  const request = requests.at(-1);
  return {
    method: request.options.method || 'GET',
    path: new URL(request.url).pathname,
    body: request.options.body === undefined ? undefined : JSON.parse(request.options.body)
  };
}

queueJson(applicationResponse, 201);
await createApplication({ cpfPulled: true, consent: false, frontendOnly: 'excluded' });
assert.deepEqual(lastRequest(), {
  method: 'POST',
  path: '/applications',
  body: { consent: false, cpfPulled: true }
});

queueJson(applicationResponse);
await updateApplication('APP/1', {
  cpfPulled: false,
  incomeDeclared: ' ',
  existingMonthly: 0
});
assert.deepEqual(lastRequest(), {
  method: 'PATCH',
  path: '/applications/APP%2F1',
  body: { cpfPulled: false, existingMonthly: 0 }
});

queueJson(applicationResponse, 201);
const supplemented = await submitSupplement('APP-1', {
  note: 'Latest income statement',
  files: [{ name: 'income.pdf', size: 321, type: 'application/pdf' }]
});
assert.deepEqual(lastRequest(), {
  method: 'POST',
  path: '/applications/APP-1/supplements',
  body: {
    note: 'Latest income statement',
    files: [{ name: 'income.pdf', size: 321, contentType: 'application/pdf' }]
  }
});
assert.equal(supplemented.id, 'APP-1');
assert.equal(supplemented.supplementNote, 'Latest income statement');
assert.deepEqual(supplemented.supplementFiles, applicationResponse.supplementFiles);
assert.equal('requiresApplicationRefetch' in supplemented, false);

const mockCalls = [
  [retrieveMyInfo, 'myinfo', 'low'],
  [retrieveCpf, 'cpf', 'medium'],
  [retrieveCreditReport, 'credit-report', 'high']
];
for (const [retrieve, endpoint, personaId] of mockCalls) {
  queueJson({ ...mockResponse, personaId });
  const result = await retrieve('APP-1', personaId);
  assert.deepEqual(lastRequest(), {
    method: 'POST',
    path: `/applications/APP-1/mock/${endpoint}`,
    body: { personaId }
  });
  assert.equal(result.personaId, personaId);
  assert.equal(result.provider, 'cpf_sandbox');
  assert.equal(result.verified, true);
  assert.equal(result.application.id, 'APP-1');
}

queueJson({ ...mockResponse, personaId: 'low' });
await retrieveMyInfo('APP-1');
assert.deepEqual(lastRequest().body, { personaId: 'low' });

const requestCount = requests.length;
await assert.rejects(
  retrieveCpf('APP-1', 'unknown'),
  error => error instanceof ApiError
    && error.code === 'invalid_persona_id'
    && error.status === 0
);
assert.equal(requests.length, requestCount);

queueJson(personasResponse);
assert.deepEqual(await listMockPersonas(), personasResponse);
assert.deepEqual(lastRequest(), {
  method: 'GET',
  path: '/mock/personas',
  body: undefined
});

queueJson({
  detail: {
    code: 'risk_assessment_not_found',
    message: 'No saved risk assessment exists for this application'
  }
}, 404);
await assert.rejects(
  getRiskAssessment('APP-1'),
  error => error instanceof ApiError
    && error.status === 404
    && error.code === 'risk_assessment_not_found'
);
assert.deepEqual(lastRequest(), {
  method: 'GET',
  path: '/applications/APP-1/risk-assessment',
  body: undefined
});

assert.equal(responseQueue.length, 0);
console.log('API_MAPPERS_TEST_OK');
