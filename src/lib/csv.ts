/** CSV helpers shared by the database viewer and the shop inventory. */

export interface CsvColumn<T> {
  key: string;
  label: string;
  value: (row: T) => unknown;
}

/** Spreadsheet apps treat a cell leading with one of these as a formula
 * (=, +, @), a potential formula (-), or a parsing trap (tab, CR). Prefixing
 * the single-quote text marker keeps exported data inert (CSV formula
 * injection — the payload is data, never code). */
const FORMULA_LEADING = /^[=+\-@\t\r]/;

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = FORMULA_LEADING.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((column) => escapeCell(column.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  // The BOM keeps Excel from mangling non-ASCII product names.
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
