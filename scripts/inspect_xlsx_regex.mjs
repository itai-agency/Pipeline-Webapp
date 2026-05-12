import fs from 'fs';
import path from 'path';

const base = '/home/ubuntu/pipeline-clientes-sinahi/sheets_work/xlsx_unzip/xl';
const out = '/home/ubuntu/pipeline-clientes-sinahi/sheets_work/sheet_structure_summary.json';
const decode = (s='') => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
const strip = (s='') => s.replace(/<[^>]+>/g,'');
const read = (p) => fs.readFileSync(p, 'utf8');
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decode(m[1]) : '';
};
const colToNum = (ref) => {
  const letters = ref.replace(/[0-9]/g,'');
  let n=0; for (const ch of letters) n = n*26 + ch.charCodeAt(0)-64; return n;
};

const sharedXml = read(path.join(base, 'sharedStrings.xml'));
const shared = [...sharedXml.matchAll(/<si[\s\S]*?<\/si>/g)].map(m => decode([...m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => strip(x[1])).join('')));
const wb = read(path.join(base, 'workbook.xml'));
const relsXml = read(path.join(base, '_rels/workbook.xml.rels'));
const rels = {};
for (const m of relsXml.matchAll(/<Relationship[^>]*>/g)) rels[attr(m[0], 'Id')] = attr(m[0], 'Target');
const result = {};
for (const m of wb.matchAll(/<sheet\s[^>]*>/g)) {
  const tag = m[0];
  const name = attr(tag, 'name');
  const ridMatch = tag.match(/r:id="([^"]*)"/);
  const rid = ridMatch ? ridMatch[1] : '';
  let target = rels[rid] || '';
  if (!target.startsWith('/')) target = path.join('xl', target);
  target = target.replace(/^\//, '');
  const xml = read('/home/ubuntu/pipeline-clientes-sinahi/sheets_work/xlsx_unzip/' + target);
  const dimMatch = xml.match(/<dimension[^>]*ref="([^"]*)"/);
  const rows = [...xml.matchAll(/<row[^>]*>[\s\S]*?<\/row>/g)];
  const sample = [];
  for (const rowMatch of rows.slice(0, 20)) {
    const rowXml = rowMatch[0];
    const vals = Array(25).fill('');
    for (const cMatch of rowXml.matchAll(/<c[^>]*>[\s\S]*?<\/c>/g)) {
      const cXml = cMatch[0];
      const cTag = cXml.match(/<c[^>]*>/)?.[0] || '';
      const ref = attr(cTag, 'r');
      const col = colToNum(ref);
      if (col < 1 || col > 25) continue;
      const type = attr(cTag, 't');
      const f = cXml.match(/<f[^>]*>([\s\S]*?)<\/f>/);
      if (f) { vals[col-1] = '=' + decode(strip(f[1])); continue; }
      const v = cXml.match(/<v[^>]*>([\s\S]*?)<\/v>/);
      if (!v) continue;
      const raw = decode(strip(v[1]));
      vals[col-1] = type === 's' ? (shared[Number(raw)] || '') : raw;
    }
    sample.push(vals);
  }
  result[name] = { dimension: dimMatch ? dimMatch[1] : '', row_count: rows.length, sample };
}
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log('saved');
