"""Exporta RESPALDO_DIARIO por cliente a reports/excel_daily_by_client.json"""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

XLSX = Path(r"c:\Users\calec\Downloads\Data_Clientes_2026.xlsx")
OUT = Path(__file__).resolve().parent.parent / "reports" / "excel_daily_by_client.json"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def text_of(el):
    if el is None:
        return ""
    parts = []
    for t in el.iter(f"{{{NS['m']}}}t"):
        if t.text:
            parts.append(t.text)
    return "".join(parts) if parts else "".join(el.itertext())


def col_to_num(ref):
    letters = re.sub(r"\d", "", ref)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def parse_daily():
    with zipfile.ZipFile(XLSX) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append(text_of(si))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        relroot = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rels = {rel.attrib["Id"]: rel.attrib["Target"] for rel in relroot.findall("rel:Relationship", NS)}
        for sh in wb.findall("m:sheets/m:sheet", NS):
            if sh.attrib["name"] != "RESPALDO_DIARIO":
                continue
            rid = sh.attrib[f"{{{NS['r']}}}id"]
            target = rels[rid].lstrip("/")
            if not target.startswith("xl/"):
                target = "xl/" + target
            root = ET.fromstring(z.read(target))
            grid = {}
            max_row = 0
            for row in root.findall("m:sheetData/m:row", NS):
                r_idx = int(row.attrib.get("r", 0))
                max_row = max(max_row, r_idx)
                for c in row.findall("m:c", NS):
                    ref = c.attrib.get("r", "")
                    col = col_to_num(ref)
                    t = c.attrib.get("t")
                    v = c.find("m:v", NS)
                    val = ""
                    if v is not None and v.text is not None:
                        val = shared[int(v.text)] if t == "s" else v.text
                    grid[(r_idx, col)] = val

            by_client = {}
            for r in range(2, max_row + 1):
                raw = grid.get((r, 1), "")
                cliente = str(grid.get((r, 2), "")).strip().upper()
                if not cliente:
                    continue
                dt = None
                if isinstance(raw, (int, float)) or str(raw).replace(".", "").isdigit():
                    serial = float(raw)
                    if 40000 < serial < 60000:
                        dt = (datetime(1899, 12, 30) + timedelta(days=serial)).date().isoformat()
                else:
                    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
                        try:
                            dt = datetime.strptime(str(raw).strip(), fmt).date().isoformat()
                            break
                        except ValueError:
                            pass
                if not dt:
                    continue

                def f(col):
                    try:
                        return float(str(grid.get((r, col), 0)).replace(",", "."))
                    except ValueError:
                        return 0.0

                row = {
                    "fecha": dt,
                    "conv": f(3),
                    "mql": f(4),
                    "sql": f(5),
                    "citas": f(6),
                    "firmas": f(7),
                }
                by_client.setdefault(cliente, []).append(row)
            return by_client
    return {}


def main():
    data = parse_daily()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exportado {sum(len(v) for v in data.values())} filas -> {OUT}")


if __name__ == "__main__":
    main()
