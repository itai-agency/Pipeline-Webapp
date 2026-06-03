"""Analisis profundo Data_Clientes_2026.xlsx vs app/Kommo/HTML."""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

XLSX = Path(r"c:\Users\calec\Downloads\Data_Clientes_2026.xlsx")
OUT = Path(__file__).resolve().parent.parent / "reports" / "manual_xlsx_deep.json"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

HTML_KOMMO = {
    "HOGARES": {"leads": 187, "mql": 65, "sql": 34, "cita": 9},
    "INQ": {"leads": 402, "mql": 32, "sql": 11, "cita": 9},
    "INSPIRA": {"leads": 80, "mql": 9, "sql": 5, "cita": 2},
    "GRUPO ELIJO": {"leads": 438, "mql": 7, "sql": 3, "cita": 2},
    "DOS HOGARES": {"leads": 99, "mql": 4, "sql": 1, "cita": 0},
    "MANOS AL HOGAR": {"leads": 287, "mql": 20, "sql": 8, "cita": 7},
}
CLIENTS = list(HTML_KOMMO.keys())


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


def parse_xlsx(path: Path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append(text_of(si))
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        relroot = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rels = {rel.attrib["Id"]: rel.attrib["Target"] for rel in relroot.findall("rel:Relationship", NS)}
        sheets = {}
        for sh in wb.findall("m:sheets/m:sheet", NS):
            name = sh.attrib["name"]
            rid = sh.attrib[f"{{{NS['r']}}}id"]
            target = rels[rid].lstrip("/")
            if not target.startswith("xl/"):
                target = "xl/" + target
            root = ET.fromstring(z.read(target))
            grid = {}
            max_row = 0
            max_col = 0
            for row in root.findall("m:sheetData/m:row", NS):
                r_idx = int(row.attrib.get("r", 0))
                max_row = max(max_row, r_idx)
                for c in row.findall("m:c", NS):
                    ref = c.attrib.get("r", "")
                    col = col_to_num(ref)
                    max_col = max(max_col, col)
                    t = c.attrib.get("t")
                    f = c.find("m:f", NS)
                    formula = "=" + f.text if f is not None and f.text else None
                    v = c.find("m:v", NS)
                    val = ""
                    if v is not None and v.text is not None:
                        if t == "s":
                            val = shared[int(v.text)]
                        elif t == "b":
                            val = v.text == "1"
                        else:
                            val = v.text
                    grid[(r_idx, col)] = {"value": val, "formula": formula}
            sheets[name] = {"max_row": max_row, "max_col": max_col, "grid": grid}
        return sheets


def cell(grid, row, col):
    return grid.get((row, col), {}).get("value", "")


def to_float(v):
    s = str(v).strip().replace("$", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_date(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)) or (isinstance(v, str) and re.fullmatch(r"\d+(\.\d+)?", str(v))):
        serial = float(v)
        if 40000 < serial < 60000:
            return datetime(1899, 12, 30) + timedelta(days=serial)
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(str(v).strip(), fmt)
        except ValueError:
            pass
    return None


def extract_daily(grid, max_row):
    rows = []
    for r in range(2, max_row + 1):
        dt = parse_date(cell(grid, r, 1))
        cliente = str(cell(grid, r, 2)).strip().upper()
        if not cliente:
            continue
        rows.append({
            "fecha": dt.date().isoformat() if dt else str(cell(grid, r, 1)),
            "cliente": cliente,
            "conv": to_float(cell(grid, r, 3)),
            "mql": to_float(cell(grid, r, 4)),
            "sql": to_float(cell(grid, r, 5)),
            "citas": to_float(cell(grid, r, 6)),
            "firmas": to_float(cell(grid, r, 7)),
            "gasto_diario": to_float(cell(grid, r, 8)),
            "semana_label": cell(grid, r, 9),
        })
    return rows


def extract_semanal(grid, max_row):
    rows = []
    for r in range(2, max_row + 1):
        semana = cell(grid, r, 1)
        cliente = str(cell(grid, r, 2)).strip().upper()
        if not cliente:
            continue
        rows.append({
            "semana": str(semana),
            "cliente": cliente,
            "conv": to_float(cell(grid, r, 3)),
            "mql": to_float(cell(grid, r, 4)),
            "sql": to_float(cell(grid, r, 5)),
            "citas": to_float(cell(grid, r, 6)),
            "firmas": to_float(cell(grid, r, 7)),
        })
    return rows


def sum_range(rows, since, until):
    agg = defaultdict(lambda: {"conv": 0, "mql": 0, "sql": 0, "citas": 0, "firmas": 0, "gasto": 0, "days": 0})
    for row in rows:
        if row["cliente"] not in CLIENTS:
            continue
        if since and row["fecha"] < since:
            continue
        if until and row["fecha"] > until:
            continue
        a = agg[row["cliente"]]
        a["conv"] += row["conv"]
        a["mql"] += row["mql"]
        a["sql"] += row["sql"]
        a["citas"] += row["citas"]
        a["firmas"] += row["firmas"]
        a["gasto"] += row["gasto_diario"]
        a["days"] += 1
    return dict(agg)


def main():
    sheets = parse_xlsx(XLSX)
    daily = extract_daily(sheets["RESPALDO_DIARIO"]["grid"], sheets["RESPALDO_DIARIO"]["max_row"])
    semanal = extract_semanal(sheets["SEMANAL"]["grid"], sheets["SEMANAL"]["max_row"])

    mayo_1_26 = sum_range(daily, "2026-05-01", "2026-05-26")
    mayo_26_only = sum_range(daily, "2026-05-26", "2026-05-26")
    mayo_1_25 = sum_range(daily, "2026-05-01", "2026-05-25")

    # SEMANAL rows with data in 2026
    sem_2026 = [r for r in semanal if "2026" in r["semana"] or re.search(r"may|mayo|05", r["semana"], re.I)]
    sem_may_sum = defaultdict(lambda: {"conv": 0, "mql": 0, "sql": 0, "citas": 0})
    for r in semanal:
        if r["cliente"] not in CLIENTS:
            continue
        if not re.search(r"2026|may|mayo|05", r["semana"], re.I):
            continue
        a = sem_may_sum[r["cliente"]]
        a["conv"] += r["conv"]
        a["mql"] += r["mql"]
        a["sql"] += r["sql"]
        a["citas"] += r["citas"]

    # Unique clients in sheet
    all_clients = sorted(set(r["cliente"] for r in daily if r["cliente"]))

    # MANOS: sheet says MANOS AL HOGAR - check typos
    typos = [c for c in all_clients if c not in CLIENTS and c]

    report = {
        "daily_rows_parsed": len(daily),
        "date_range": {"min": min(r["fecha"] for r in daily if re.match(r"\d{4}-\d{2}-\d{2}", r["fecha"])),
                       "max": max(r["fecha"] for r in daily if re.match(r"\d{4}-\d{2}-\d{2}", r["fecha"]))},
        "clients_in_sheet": all_clients,
        "unknown_clients": typos,
        "mayo_1_26_sum": mayo_1_26,
        "mayo_26_day_only": mayo_26_only,
        "mayo_1_25_sum": mayo_1_25,
        "semanal_may_like_sum": dict(sem_may_sum),
        "semanal_sample": sem_2026[:12],
    }

    # Three-way comparison table
    comparison = []
    for c in CLIENTS:
        d = mayo_1_26.get(c, {})
        d26 = mayo_26_only.get(c, {})
        h = HTML_KOMMO[c]
        comparison.append({
            "cliente": c,
            "xlsx_daily_sum_conv_1_26": d.get("conv", 0),
            "xlsx_daily_sum_mql_1_26": d.get("mql", 0),
            "xlsx_day_26_conv": d26.get("conv", 0),
            "xlsx_day_26_mql": d26.get("mql", 0),
            "html_kommo_leads": h["leads"],
            "html_reached_mql": h["mql"],
            "interpretacion": {
                "conv_es_actividad_diaria": True,
                "html_leads_es_censo_cohorte": True,
                "mql_sheet_es_movimientos_dia": True,
                "html_mql_es_reached_embudo": True,
            },
        })
    report["comparison"] = comparison

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== ANALISIS PROFUNDO Data_Clientes_2026.xlsx ===\n")
    print(f"Filas diarias: {len(daily)} | Rango: {report['date_range']}")
    print(f"Clientes en hoja: {', '.join(all_clients)}")
    if typos:
        print(f"Nombres no estandar: {typos}")

    print("\n--- CAPA 1: Excel RESPALDO_DIARIO (suma movimientos 1-26 mayo) ---")
    print(f"{'Cliente':16} | {'conv':>5} | {'mql':>4} | {'sql':>3} | {'citas':>4}")
    for c in CLIENTS:
        d = mayo_1_26[c]
        print(f"{c:16} | {d['conv']:5.0f} | {d['mql']:4.0f} | {d['sql']:3.0f} | {d['citas']:4.0f}")

    print("\n--- CAPA 2: HTML kommoPipeline (censo + reached*, corte 26/05) ---")
    print(f"{'Cliente':16} | {'leads':>5} | {'mql':>4} | {'sql':>3} | {'cita':>4}")
    for c in CLIENTS:
        h = HTML_KOMMO[c]
        print(f"{c:16} | {h['leads']:5} | {h['mql']:4} | {h['sql']:3} | {h['cita']:4}")

    print("\n--- CAPA 3: Solo dia 26/05 en Excel (actividad ese dia) ---")
    for c in CLIENTS:
        d = mayo_26_only.get(c, {})
        print(f"  {c:16} conv={d.get('conv',0):.0f} mql={d.get('mql',0):.0f}")

    print("\n--- INSIGHT: conv Excel vs leads HTML ---")
    for row in comparison:
        dc = row["xlsx_daily_sum_conv_1_26"] - row["html_kommo_leads"]
        dm = row["xlsx_daily_sum_mql_1_26"] - row["html_reached_mql"]
        print(f"  {row['cliente']:16} dConv={dc:+.0f}  dMql={dm:+.0f}")

    print(f"\nJSON: {OUT}")


if __name__ == "__main__":
    main()
