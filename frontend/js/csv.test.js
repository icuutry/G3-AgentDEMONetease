import assert from 'node:assert/strict';

import { serializeCsv, serializeCsvCell } from './csv.js';

const ordinaryCells = [
  ['plain text', '"plain text"'],
  [42, '"42"'],
  [0, '"0"'],
  [false, '"false"'],
  [null, '""'],
  [undefined, '""'],
  ['', '""'],
  ['Hello, world', '"Hello, world"'],
  ['He said "approved"', '"He said ""approved"""'],
  ['line one\nline two', '"line one\nline two"'],
  ['line one\rline two', '"line one\rline two"']
];

for (const [value, expected] of ordinaryCells) {
  assert.equal(serializeCsvCell(value), expected);
}

const dangerousCells = [
  ['=SUM(A1:A2)', '"\'=SUM(A1:A2)"'],
  ['+cmd', '"\'+cmd"'],
  ['-1+2', '"\'-1+2"'],
  ['@SUM(A1)', '"\'@SUM(A1)"'],
  ['  =SUM(A1)', '"\'  =SUM(A1)"'],
  ['\t+cmd', '"\'\t+cmd"'],
  ['\n-1+2', '"\'\n-1+2"'],
  ['\r@SUM(A1)', '"\'\r@SUM(A1)"'],
  [' \t\r\n=SUM(A1)', '"\' \t\r\n=SUM(A1)"'],
  ['=He said "approved"', '"\'=He said ""approved"""']
];

for (const [value, expected] of dangerousCells) {
  const serialized = serializeCsvCell(value);
  assert.equal(serialized, expected);
  assert.ok(serialized.startsWith('"\''));
  assert.ok(serialized.includes(value.replaceAll('"', '""')));
}

for (const safeText of [
  'total = approved',
  'officer@example.com',
  'application-id',
  'ordinary + text'
]) {
  assert.equal(serializeCsvCell(safeText), `"${safeText}"`);
}

assert.equal(
  serializeCsv([
    ['A', 'B', 'C'],
    ['one', 'two, three', 'four\nfive'],
    [null, false, 0]
  ]),
  '"A","B","C"\n"one","two, three","four\nfive"\n"","false","0"'
);

const protectedAuditRow = serializeCsv([[
  '=time',
  '+application',
  '-action',
  '@actor',
  ' =model',
  '\t+note'
]]);
assert.equal(
  protectedAuditRow,
  '"\'=time","\'+application","\'-action","\'@actor","\' =model","\'\t+note"'
);

console.log('CSV_TEST_OK');
