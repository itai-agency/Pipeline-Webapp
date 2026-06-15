"""Parse Auditoria_Kommo PDF: monthly totals and lead etapas per client."""
import json
import re
import sys
from collections import defaultdict

from pypdf import PdfReader

PDF = (
    sys.argv[1]
    if len(sys.argv) > 1
    else r"c:\Users\calec\Downloads\Auditoria_Kommo_Ene-Jun2026-1 completo.pdf"
)

MONTH_MAP = {
    "enero": "2026-01",
    "febrero": "2026-02",
    "marzo": "2026-03",
    "abril": "2026-04",
    "mayo": "2026-05",
    "junio": "2026-06",
}

CLIENT_ALIASES = sorted(
    [
        ("DOS HOGARES", "DOS HOGARES"),
        ("MANOS AL HOGAR", "MANOS AL HOGAR"),
        ("GRUPO ELIJO", "GRUPO ELIJO"),
        ("ELIJO INMO VILLAHERMOSA", "GRUPO ELIJO"),
        ("INSPIRA BIENES RAICES", "INSPIRA"),
        ("HOGARES", "HOGARES"),
        ("INSPIRA", "INSPIRA"),
        ("INQ", "INQ"),
    ],
    key=lambda x: len(x[0]),
    reverse=True,
)


def norm_client(name: str) -> str | None:
    u = name.upper().strip()
    for needle, client in CLIENT_ALIASES:
        if needle in u:
            return client
    return None


def norm_etapa(etapa: str) -> str:
    u = etapa.upper().strip()
    if "RECHAZ" in u:
        return "rejected"
    if "FIRM" in u:
        return "firmado"
    if "OFERT" in u:
        return "ofertado"
    if u == "SQL" or u.startswith("SQL "):
        return "sql"
    if u == "MQL" or u.startswith("MQL "):
        return "mql"
    if "CITA" in u:
        return "cita"
    return "entrada"


def tier_reached_mql(tier: str) -> bool:
    return tier in ("mql", "sql", "cita", "ofertado", "firmado")


HEADER_RE = re.compile(
    r"^(Enero|Febrero|Marzo|Abril|Mayo|Junio)\s+2026\s*.+?"
    r"(\d+)\s+leads\s*.+?"
    r"Activos:\s*(\d+)\s*.+?"
    r"Firmados:\s*(\d+)\s*.+?"
    r"Rechazados:\s*(\d+)",
    re.I,
)

lines = [ln.strip() for ln in "\n".join((p.extract_text() or "") for p in PdfReader(PDF).pages).split("\n")]

current_client: str | None = None
current_month: str | None = None
monthly: dict[str, dict[str, dict]] = defaultdict(dict)
leads_by_month_client: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))

i = 0
while i < len(lines):
    line = lines[i]
    client = norm_client(line)
    if client and len(line) < 40:
        current_client = client
        i += 1
        continue

    hm = HEADER_RE.search(line)
    if hm and current_client:
        mk = MONTH_MAP[hm.group(1).lower()]
        current_month = mk
        monthly[current_client][mk] = {
            "total": int(hm.group(2)),
            "activos": int(hm.group(3)),
            "firmados": int(hm.group(4)),
            "rechazados": int(hm.group(5)),
        }
        i += 1
        continue

    m_id = re.match(r"^(\d{7,9})$", line)
    if m_id and current_client and current_month:
        lid = int(m_id.group(1))
        j = i + 1
        if j < len(lines) and ("Lead #" in lines[j] or len(lines[j]) > 2):
            j += 1
        if j < len(lines) and re.match(r"^\d{2}/\d{2}/\d{4}$", lines[j]):
            etapa = lines[j + 1] if j + 1 < len(lines) else ""
            if etapa and not etapa.startswith("Expertiz"):
                tier = norm_etapa(etapa)
                leads_by_month_client[current_client][current_month].append(
                    {"id": lid, "etapa": etapa, "tier": tier}
                )
            i = j + 3
            continue
    i += 1

activos_mql_pdf: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
for client, months in leads_by_month_client.items():
    for month, leads in months.items():
        for lead in leads:
            if lead["tier"] != "rejected" and lead["tier"] != "firmado" and tier_reached_mql(
                lead["tier"]
            ):
                activos_mql_pdf[client][month] += 1

out = {
    "pdf_path": PDF,
    "monthly": monthly,
    "activos_mql_snapshot": {c: dict(m) for c, m in activos_mql_pdf.items()},
    "lead_counts_parsed": {
        c: {m: len(leads) for m, leads in months.items()}
        for c, months in leads_by_month_client.items()
    },
}
print(json.dumps(out, ensure_ascii=False, indent=2))
