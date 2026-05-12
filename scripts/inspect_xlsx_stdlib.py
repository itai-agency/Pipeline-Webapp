import zipfile, xml.etree.ElementTree as ET, json, re
from pathlib import Path

xlsx = Path('/home/ubuntu/pipeline-clientes-sinahi/sheets_work/data_clientes_2026_copia.xlsx')
out = Path('/home/ubuntu/pipeline-clientes-sinahi/sheets_work/sheet_structure_summary.json')
NS = {
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships'
}

def text_of(el):
    if el is None:
        return ''
    parts = []
    for t in el.iter('{%s}t' % NS['m']):
        if t.text:
            parts.append(t.text)
    if parts:
        return ''.join(parts)
    return ''.join(el.itertext())

def col_to_num(ref):
    letters = re.sub(r'\d', '', ref)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n

def cell_value(c, shared):
    t = c.attrib.get('t')
    f = c.find('m:f', NS)
    if f is not None and f.text:
        return '=' + f.text
    v = c.find('m:v', NS)
    if v is None or v.text is None:
        return ''
    if t == 's':
        idx = int(v.text)
        return shared[idx] if 0 <= idx < len(shared) else ''
    return v.text

with zipfile.ZipFile(xlsx) as z:
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', NS):
            shared.append(text_of(si))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    relroot = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    rels = {rel.attrib['Id']: rel.attrib['Target'] for rel in relroot.findall('rel:Relationship', NS)}
    result = {}
    for sh in wb.findall('m:sheets/m:sheet', NS):
        name = sh.attrib['name']
        rid = sh.attrib['{%s}id' % NS['r']]
        target = rels[rid].lstrip('/')
        if not target.startswith('xl/'):
            target = 'xl/' + target
        root = ET.fromstring(z.read(target))
        dim = root.find('m:dimension', NS).attrib.get('ref', '') if root.find('m:dimension', NS) is not None else ''
        rows = root.findall('m:sheetData/m:row', NS)
        sample = []
        for row in rows[:20]:
            vals = [''] * 25
            for c in row.findall('m:c', NS):
                ref = c.attrib.get('r', '')
                col = col_to_num(ref)
                if 1 <= col <= 25:
                    vals[col-1] = cell_value(c, shared)
            sample.append(vals)
        result[name] = {'dimension': dim, 'row_count': len(rows), 'sample': sample}

out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
Path('/home/ubuntu/pipeline-clientes-sinahi/sheets_work/inspect_ok.txt').write_text('ok', encoding='utf-8')
