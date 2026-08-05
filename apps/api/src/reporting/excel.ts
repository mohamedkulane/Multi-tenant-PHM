function xml(value: unknown) {
  let text = "";
  if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean")
    text = String(value);
  else if (value instanceof Date) text = value.toISOString();
  else if (value !== null && value !== undefined) text = JSON.stringify(value) ?? "";
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cell(value: unknown, header = false) {
  const type = typeof value === "number" || typeof value === "bigint" ? "Number" : "String";
  return (
    "<Cell" +
    (header ? ' ss:StyleID="Header"' : "") +
    '><Data ss:Type="' +
    type +
    '">' +
    xml(value) +
    "</Data></Cell>"
  );
}

export function recordsToExcel(records: Array<Record<string, unknown>>, sheetName = "Report") {
  const headers = records.length ? Object.keys(records[0]!) : ["No data"];
  const rows = records.length
    ? records.map(
        (record) => "<Row>" + headers.map((header) => cell(record[header])).join("") + "</Row>",
      )
    : ["<Row>" + cell("No records found") + "</Row>"];
  return (
    '<?xml version="1.0"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
    '<Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style><Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0D2926" ss:Pattern="Solid"/></Style></Styles>\n' +
    '<Worksheet ss:Name="' +
    xml(sheetName.slice(0, 31)) +
    '"><Table>\n' +
    "<Row>" +
    headers.map((header) => cell(header, true)).join("") +
    "</Row>\n" +
    rows.join("\n") +
    '\n</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet></Workbook>'
  );
}
