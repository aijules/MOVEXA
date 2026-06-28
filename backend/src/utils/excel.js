const XLSX = require('xlsx');

function readWorkbook(filePath) {
  return XLSX.readFile(filePath, { cellText: true, cellDates: true });
}

function sheetToRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
}

function getCellValue(row, colIndex) {
  const val = row[colIndex];
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

module.exports = { readWorkbook, sheetToRows, getCellValue };
