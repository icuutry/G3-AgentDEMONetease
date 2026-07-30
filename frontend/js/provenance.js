import { APPLICATION_FIELDS } from './api-mappers.js';

const providerGroup = (flag, label, fields) => Object.freeze({
  flag,
  label,
  fields: Object.freeze(fields)
});

export const PROVIDER_GROUPS = Object.freeze({
  myinfo: providerGroup('myinfoPulled', 'MyInfo', [
    'name',
    'nric',
    'age',
    'residency',
    'phone',
    'education',
    'marital'
  ]),
  cpf: providerGroup('cpfPulled', 'CPF', [
    'incomeVerified'
  ]),
  creditReport: providerGroup('creditPulled', 'Credit report', [
    'existingMonthly',
    'outstanding',
    'latePayments',
    'otherLoans'
  ])
});

const FIELD_PROVIDERS = new Map(
  Object.entries(PROVIDER_GROUPS).flatMap(([key, provider]) => (
    provider.fields.map(field => [field, { key, ...provider }])
  ))
);

const hasValue = value => (
  value !== null
  && value !== undefined
  && (typeof value !== 'string' || value.trim() !== '')
);

export function providerForField(field) {
  return FIELD_PROVIDERS.get(field) || null;
}

export function providerRetrieved(application, providerKey) {
  const provider = PROVIDER_GROUPS[providerKey];
  return Boolean(provider && application?.[provider.flag] === true);
}

export function invalidatedProviderFlags(application) {
  return Object.fromEntries(
    Object.values(PROVIDER_GROUPS)
      .filter(provider => application?.[provider.flag] === false)
      .map(provider => [provider.flag, false])
  );
}

export function fieldProvenance(application, field) {
  const provider = providerForField(field);
  const provided = hasValue(application?.[field]);
  const verified = Boolean(
    provider
    && provided
    && application?.[provider.flag] === true
  );

  return verified
    ? {
        sourceLabel: provider.label,
        stateLabel: 'Verified',
        stateClass: 'verified'
      }
    : {
        sourceLabel: 'Applicant',
        stateLabel: provided ? 'Self-declared' : 'Not provided',
        stateClass: provided ? 'declared' : 'pending'
      };
}

export function applyProvenanceAwareEdit(application, field, value) {
  const next = { ...application, [field]: value };
  const provider = providerForField(field);
  const previousValue = application?.[field];
  const changed = !Object.is(previousValue, value)
    && String(previousValue ?? '') !== String(value ?? '');
  if (provider && changed && application?.[provider.flag] === true) {
    next[provider.flag] = false;
  }
  return next;
}

export function applyProviderRetrieval(application, retrievedApplication, providerKey) {
  const provider = PROVIDER_GROUPS[providerKey];
  if (!provider) return { ...application };

  const next = { ...application, ...retrievedApplication };
  const retrievedFields = new Set(provider.fields);

  for (const field of APPLICATION_FIELDS) {
    if (field === provider.flag || retrievedFields.has(field)) continue;
    if (providerKey === 'myinfo' && field === 'consent') continue;
    if (Object.hasOwn(application, field)) next[field] = application[field];
  }

  next[provider.flag] = true;
  return next;
}
