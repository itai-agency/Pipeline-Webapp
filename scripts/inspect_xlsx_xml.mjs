import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const base = '/home/ubuntu/pipeline-clientes-sinahi/sheets_work/xlsx_unzip/xl';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
const readXml = (p) => parser.parse(fs.readFileSync(p, 'utf8'));
const workbook = readXml(path.join(base, 'workbook.xml'));
const rels = readXml(path.join(base, '_rels/workbook.xml.rels'));
const shared = readXml(path.join(base, 'sharedStrings.xml'));

const relMap = {};
const relArr = Array.isArray(rels.Relationships.Relationship) ? rels.Relationships.Relationship : [rels.Relationships.Relationship];
for (const rel of relArr) relMap[rel['@_Id']] = rel['@_Target'];

const siArr = shared.sst?.si ? (Array.isArray(shared.sst.si) ? shared.sst.si : [shared.sst.si]) : [];
function siText(si) {
  if (typeof si.t === 'string') return si.t;
  if (si.t?.['#text']) return si.t['#text'];
  if (si.r) {
    const runs = Array.isArray(si.r) ? si.r : [si.r];
    return runs.map(r => typeof r.t === 'string' ? r.t : (r.t?.['#text'] ?? '')).join('');
  }
  return '';
}
const sharedStrings = siArr.map(siText);

function colToNum(ref) {
  const letters = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function rowToNum(ref) { return Number(ref.replace(/[A-Z]/g, '')); }
function cellValue(c) {
  if (!c) return '';
  const type = c['@_t'];
  let v = c.v;
  if (v && typeof v === 'object') v = v['#text'];
  if (v === undefined || v === null) return c.f ? '=' + (typeof c.f === 'string' ? c.f : c.f['#text'] ?? '') : '';
  if (type === 's') return sharedStrings[Number(v)] ?? '';
  if (type === 'str') return String(v);
  return String(v);
}

const sheets = Array.isArray(workbook.workbook.sheets.sheet) ? workbook.workbook.sheets.sheet : [workbook.workbook.sheets.sheet];
const result = {};
for (const sh of sheets) {
  const name = sh['@_name'];
  const target = relMap[sh['@_r:id']];
  const xmlPath = path.join(base, target.replace(/^\//, ''));
  const ws = readXml(xmlPath);
  const rows = ws.worksheet.sheetData?.row ? (Array.isArray(ws.worksheet.sheetData.row) ? ws.worksheet.sheetData.row : [ws.worksheet.sheetData.row]) : [];
  const grid = [];
  let maxCol = 0;
  for (const row of rows.slice(0, 20)) {
    const rowIdx = Number(row['@_r']);
    if (!grid[rowIdx - 1]) grid[rowIdx - 1] = [];
    const cells = row.c ? (Array.isArray(row.c) ? row.c : [row.c]) : [];
    for (const c of cells) {
      const ref = c['@_r'];
      const col = colToNum(ref);
      maxCol = Math.max(maxCol, col);
      grid[rowIdx - 1][col - 1] = cellValue(c);
    }
  }
  const sample = [];
  for (let r = 0; r < Math.min(20, grid.length); r++) {
    const arr = [];
    for (let c = 0; c < Math.min(25, maxCol); c++) arr.push(grid[r]?.[c] ?? '');
    sample.push(arr);
  }
  result[name] = { dimension: ws.worksheet.dimension?.['@_ref'] ?? '', rowCount: rows.length, sample };
}
const out = '/home/ubuntu/pipeline-clientes-sinahi/sheets_work/sheet_structure_summary.json';
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(out);
