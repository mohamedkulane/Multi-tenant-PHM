function safeCell(value: unknown) {
  let text: string;
  if (value === null || value === undefined) text = "";
  else if (value instanceof Date) text = value.toISOString();
  else if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "bigint") text = value.toString();
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else text = JSON.stringify(value);
  const formulaSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export function recordsToCsv(records: Array<Record<string, unknown>>) {
  if (records.length === 0) return "\uFEFF";
  const headers = Object.keys(records[0]!);
  const lines = [
    headers.map(safeCell).join(","),
    ...records.map((record) => headers.map((header) => safeCell(record[header])).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
