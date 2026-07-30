const FORMULA_PREFIX = /^\s*[=+\-@]/u;

export function serializeCsvCell(value) {
  const text = String(value ?? '');
  const safeText = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function serializeCsv(rows = []) {
  return rows
    .map(row => row.map(serializeCsvCell).join(','))
    .join('\n');
}
