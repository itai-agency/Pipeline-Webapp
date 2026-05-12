import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

const xlsxPath = '/home/ubuntu/pipeline-clientes-sinahi/sheets_work/validation_current/current_google_sheet.xlsx';
const outDir = '/home/ubuntu/pipeline-clientes-sinahi/sheets_work/validation_current/unzipped_final';
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
execFileSync('unzip', ['-q', xlsxPath, '-d', outDir]);

const read = p => fs.readFileSync(path.join(outDir, p.replace(/^\//, '')), 'utf8');
const workbook = read('xl/workbook.xml');
const rels = read('xl/_rels/workbook.xml.rels');
const sharedPath = path.join(outDir, 'xl/sharedStrings.xml');
let shared = [];
if (fs.existsSync(sharedPath)) {
  const xml = fs.readFileSync(sharedPath, 'utf8');
  const siMatches = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)];
  shared = siMatches.map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));
}
const relMap = Object.fromEntries([...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
const sheets = [...workbook.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(m => ({ name: m[1], sheetId: m[2], relId: m[3], target: relMap[m[3]].replace(/^\//,'') }));
function cellValue(sheetXml, ref) {
  const re = new RegExp(`<c[^>]*r="${ref}"([^>]*)>([\\s\\S]*?)<\\/c>`);
  const m = sheetXml.match(re);
  if (!m) return null;
  const attrs = m[1];
  const body = m[2];
  const f = body.match(/<f[^>]*>([\s\S]*?)<\/f>/)?.[1] ?? null;
  const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? null;
  const isShared = /t="s"/.test(attrs);
  let value = v;
  if (isShared && v != null) value = shared[Number(v)] ?? v;
  return { value, formula: f };
}
const result = { sheets: [], checks: {} };
for (const s of sheets) {
  const sheetPath = s.target.startsWith('xl/') ? s.target : `xl/${s.target}`;
  const xml = read(sheetPath);
  const cells = {};
  ['A1','H1','I1','Y1','Z1','AA1','Y2','Z2','AA2','A2','H2','I2','J2','K2','L2'].forEach(ref => cells[ref] = cellValue(xml, ref));
  result.sheets.push({ name: s.name, target: sheetPath, cells });
}
fs.writeFileSync('/home/ubuntu/pipeline-clientes-sinahi/sheets_work/validation_current/final_validation_summary.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
