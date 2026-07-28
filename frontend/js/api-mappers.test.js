import assert from 'node:assert/strict';

import { serializeApplication } from './api-mappers.js';

const patch = serializeApplication({
  age: '',
  empMonths: '   ',
  incomeDeclared: null,
  incomeVerified: undefined,
  existingMonthly: '0',
  latePayments: 0,
  consent: false,
  unknownField: 'excluded'
}, { patch: true });

assert.deepEqual(patch, {
  consent: false,
  existingMonthly: 0,
  latePayments: 0
});

const create = serializeApplication({
  age: '',
  incomeDeclared: null,
  existingMonthly: '0',
  consent: false
});

assert.deepEqual(create, {
  consent: false,
  age: null,
  incomeDeclared: null,
  existingMonthly: 0
});

console.log('API_MAPPERS_TEST_OK');
