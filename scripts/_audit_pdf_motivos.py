"""One-off audit: parse PDF lead records and motivo prefixes."""
from pypdf import PdfReader
import re
import json
from collections import Counter

PDF = r"c:\Users\calec\Downloads\Auditoria_Kommo_Ene-Jun2026-1 completo.pdf"
r = PdfReader(PDF)
lines = "\n".join((p.extract_text() or "") for p in r.pages).split("\n")

records = []
i = 0
while i < len(lines) - 5:
    m = re.match(r"^\s*(\d{7,9})\s*$", lines[i])
    if m:
        lid = int(m.group(1))
        j = i + 1
        if j < len(lines) and ("Lead #" in lines[j] or len(lines[j].strip()) > 2):
            j += 1
        if j < len(lines) and re.match(r"\s*\d{2}/\d{2}/\d{4}\s*$", lines[j]):
            fecha = lines[j].strip()
            etapa = lines[j + 1].strip() if j + 1 < len(lines) else ""
            motivo = lines[j + 2].strip() if j + 2 < len(lines) else ""
            if etapa and not etapa.startswith("Expertiz"):
                records.append({"id": lid, "fecha": fecha, "etapa": etapa, "motivo": motivo})
                i = j + 3
                continue
    i += 1

rech = [x for x in records if "RECHAZ" in x["etapa"].upper()]
pref = Counter()
tier = Counter()
for x in rech:
    m = x["motivo"]
    if not m or m.lower() in ("sin especificar", "—", "-", ""):
        pref["UNKNOWN"] += 1
        tier["unknown"] += 1
    else:
        p = m.split("-")[0].strip().upper()
        pref[p] += 1
        if m.upper().startswith("MQL-"):
            tier["mql"] += 1
        elif m.upper().startswith("SQL-"):
            tier["sql"] += 1
        elif m.upper().startswith("CITA-"):
            tier["cita"] += 1
        elif m.upper().startswith("LXC-") or m.upper().startswith("LX-"):
            tier["entrada"] += 1
        else:
            tier["other"] += 1

out = {
    "total_records": len(records),
    "rechazados": len(rech),
    "prefijos": dict(pref.most_common()),
    "tier_inferido": dict(tier.most_common()),
    "samples_mql_sql_cita": [
        x for x in rech if x["motivo"].upper().startswith(("MQL-", "SQL-", "CITA-"))
    ][:20],
    "sin_especificar_count": pref.get("UNKNOWN", 0),
}
print(json.dumps(out, indent=2, ensure_ascii=False))
