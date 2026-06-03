"""Analiza Data_Clientes_2026.xlsx y compara mayo 2026 vs referencia HTML."""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

XLSX = Path(r"c:\Users\calec\Downloads\Data_Clientes_2026.xlsx")
OUT = Path(__file__).resolve().parent.parent / "reports" / "manual_xlsx_analysis.json"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

HTML_REF = {
    "HOGARES": {"leads": 187, "mql": 65, "sql": 34, "cita": 9},
    "INQ": {"leads": 402, "mql": 32, "sql": 11, "cita": 9},
    "INSPIRA": {"leads": 80, "mql": 9, "sql": 5, "cita": 2},
    "GRUPO ELIJO": {"leads": 438, "mql": 7, "sql": 3, "cita": 2},
    "DOS HOGARES": {"leads": 99, "mql": 4, "sql": 1, "cita": 0},
    "MANOS AL HOGAR": {"leads": 287, "mql": 20, "sql": 8, "cita": 7},
}

CLIENTS = list(HTML_REF.keys())


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


def num_to_col(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


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
            dim = root.find("m:dimension", NS)
            dim_ref = dim.attrib.get("ref", "") if dim is not None else ""

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

            sheets[name] = {"dimension": dim_ref, "max_row": max_row, "max_col": max_col, "grid": grid}
        return sheets


def cell(grid, row, col):
    item = grid.get((row, col), {})
    return item.get("value", "")


def to_float(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def parse_date(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)) or (isinstance(v, str) and re.fullmatch(r"\d+(\.\d+)?", str(v))):
        serial = float(v)
        if 40000 < serial < 60000:
            return datetime(1899, 12, 30) + timedelta(days=serial)
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(str(v).strip(), fmt)
        except ValueError:
            pass
    return None


def normalize_client(name):
    return str(name or "").strip().upper()


def extract_respaldo_daily(grid, max_row):
    rows = []
    for r in range(2, max_row + 1):
        fecha_raw = cell(grid, r, 1)
        cliente = normalize_client(cell(grid, r, 2))
        if not cliente and not fecha_raw:
            continue
        dt = parse_date(fecha_raw)
        rows.append(
            {
                "row": r,
                "fecha": dt.date().isoformat() if dt else str(fecha_raw),
                "cliente": cliente,
                "conv": to_float(cell(grid, r, 3)),
                "mql": to_float(cell(grid, r, 4)),
                "sql": to_float(cell(grid, r, 5)),
                "citas": to_float(cell(grid, r, 6)),
                "firmas": to_float(cell(grid, r, 7)),
                "semana": cell(grid, r, 8),
                "mes": cell(grid, r, 9),
                "gasto_ads": to_float(cell(grid, r, 10)),
            }
        )
    return rows


def sum_by_client(rows, since=None, until=None):
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
        a["gasto"] += row["gasto_ads"]
        a["days"] += 1
    return dict(agg)


def extract_mensual(grid, max_row):
    """Hoja MENSUAL: col A=mes, B=cliente, C-G métricas."""
    rows = []
    for r in range(2, max_row + 1):
        mes_raw = cell(grid, r, 1)
        cliente = normalize_client(cell(grid, r, 2))
        if not cliente:
            continue
        dt = parse_date(mes_raw)
        rows.append(
            {
                "mes": dt.date().replace(day=1).isoformat() if dt else str(mes_raw),
                "cliente": cliente,
                "conv": to_float(cell(grid, r, 3)),
                "mql": to_float(cell(grid, r, 4)),
                "sql": to_float(cell(grid, r, 5)),
                "citas": to_float(cell(grid, r, 6)),
                "firmas": to_float(cell(grid, r, 7)),
                "gasto": to_float(cell(grid, r, 8)),
            }
        )
    return rows


def main():
    if not XLSX.exists():
        raise SystemExit(f"No existe: {XLSX}")

    sheets = parse_xlsx(XLSX)
    report = {
        "file": str(XLSX),
        "sheet_names": list(sheets.keys()),
        "sheets_meta": {k: {"dimension": v["dimension"], "max_row": v["max_row"], "max_col": v["max_col"]} for k, v in sheets.items()},
    }

    # Headers row 1 for each sheet
    headers = {}
    for name, sh in sheets.items():
        hdr = [cell(sh["grid"], 1, c) for c in range(1, min(sh["max_col"], 30) + 1)]
        headers[name] = hdr
    report["headers"] = headers

    daily = []
    if "RESPALDO_DIARIO" in sheets:
        sh = sheets["RESPALDO_DIARIO"]
        daily = extract_respaldo_daily(sh["grid"], sh["max_row"])
        report["respaldo_daily_rows"] = len(daily)
        report["respaldo_date_range"] = {
            "min": min((r["fecha"] for r in daily if re.match(r"\d{4}-\d{2}-\d{2}", r["fecha"])), default=None),
            "max": max((r["fecha"] for r in daily if re.match(r"\d{4}-\d{2}-\d{2}", r["fecha"])), default=None),
        }

    mayo_daily = sum_by_client(daily, "2026-05-01", "2026-05-26")
    mayo_full = sum_by_client(daily, "2026-05-01", "2026-05-31")
    report["mayo_01_26_daily_sum"] = mayo_daily
    report["mayo_full_daily_sum"] = mayo_full

    mensual = []
    if "MENSUAL" in sheets:
        sh = sheets["MENSUAL"]
        mensual = extract_mensual(sh["grid"], sh["max_row"])
        report["mensual_rows"] = len(mensual)
        mayo_mensual = {r["cliente"]: r for r in mensual if r["mes"].startswith("2026-05")}
        report["mayo_mensual_sheet"] = mayo_mensual

    if "HISTORICO-MENSUAL" in sheets:
        sh = sheets["HISTORICO-MENSUAL"]
        hist = extract_mensual(sh["grid"], sh["max_row"])
        mayo_hist = {r["cliente"]: r for r in hist if r["mes"].startswith("2026-05")}
        report["mayo_historico_mensual"] = mayo_hist

    # Compare vs HTML kommoPipeline (leads/reached*) vs daily sums (activity)
    compare = []
    for client in CLIENTS:
        html = HTML_REF[client]
        d = mayo_daily.get(client, {})
        m = report.get("mayo_mensual_sheet", {}).get(client, {})
        compare.append(
            {
                "cliente": client,
                "html_kommo_leads": html["leads"],
                "html_reached_mql": html["mql"],
                "sheet_daily_sum_conv_may1_26": d.get("conv", 0),
                "sheet_daily_sum_mql_may1_26": d.get("mql", 0),
                "sheet_mensual_conv": m.get("conv", 0),
                "sheet_mensual_mql": m.get("mql", 0),
                "delta_conv_vs_html_leads": round(d.get("conv", 0) - html["leads"], 1),
                "delta_mql_vs_html_reached": round(d.get("mql", 0) - html["mql"], 1),
            }
        )
    report["compare_mayo_vs_html"] = compare

    # Sample last 5 days per client in mayo
    last_days = defaultdict(list)
    for row in daily:
        if row["fecha"].startswith("2026-05") and row["cliente"] in CLIENTS:
            last_days[row["cliente"]].append(row)
    for c in last_days:
        last_days[c] = sorted(last_days[c], key=lambda x: x["fecha"])[-5:]
    report["mayo_last_5_days_sample"] = dict(last_days)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("=== Data_Clientes_2026.xlsx ===")
    print("Hojas:", ", ".join(report["sheet_names"]))
    print(f"RESPALDO_DIARIO filas: {report.get('respaldo_daily_rows', 0)}")
    print(f"Rango fechas: {report.get('respaldo_date_range')}")
    print("\n--- MENSUAL mayo (hoja MENSUAL) ---")
    for c in CLIENTS:
        m = report.get("mayo_mensual_sheet", {}).get(c, {})
        if m:
            print(f"  {c:16} conv={m.get('conv',0):.0f} mql={m.get('mql',0):.0f} sql={m.get('sql',0):.0f} citas={m.get('citas',0):.0f}")
    print("\n--- SUMA RESPALDO_DIARIO 2026-05-01 a 26 (actividad diaria) ---")
    print(f"{'Cliente':16} | {'conv':>6} | {'mql':>5} | {'sql':>4} | vs HTML leads | vs HTML mql")
    for row in compare:
        print(
            f"{row['cliente']:16} | {row['sheet_daily_sum_conv_may1_26']:6.0f} | {row['sheet_daily_sum_mql_may1_26']:5.0f} | "
            f"{mayo_daily.get(row['cliente'], {}).get('sql', 0):4.0f} | "
            f"Δconv {row['delta_conv_vs_html_leads']:+6.0f} | Δmql {row['delta_mql_vs_html_reached']:+5.0f}"
        )
    print(f"\nJSON completo: {OUT}")


if __name__ == "__main__":
    main()
