"""Parse PDF audit for rechazados sin motivo especificado."""
import json
import re
import sys
from pypdf import PdfReader

PDF = sys.argv[1] if len(sys.argv) > 1 else r"c:\Users\calec\Downloads\Auditoria_Kommo_Ene-Jun2026-1 completo.pdf"

lines = "\n".join((p.extract_text() or "") for p in PdfReader(PDF).pages).split("\n")
current_client = None
records = []
i = 0
CLIENTS = {"HOGARES", "MANOS AL HOGAR", "DOS HOGARES", "INSPIRA", "GRUPO ELIJO", "INQ"}

while i < len(lines) - 5:
    line = lines[i].strip()
    if line in CLIENTS:
        current_client = line
    m = re.match(r"^\s*(\d{7,9})\s*$", lines[i])
    if m:
        lid = int(m.group(1))
        j = i + 1
        if j < len(lines) and ("Lead #" in lines[j] or len(lines[j].strip()) > 2):
            j += 1
        if j < len(lines) and re.match(r"\s*\d{2}/\d{2}/\d{4}\s*$", lines[j]):
            etapa = lines[j + 1].strip() if j + 1 < len(lines) else ""
            motivo = lines[j + 2].strip() if j + 2 < len(lines) else ""
            if etapa and "RECHAZ" in etapa.upper():
                u = motivo.upper()
                if not motivo or u in ("SIN ESPECIFICAR", "—", "-"):
                    records.append({"id": lid, "motivo": motivo, "client_hint": current_client})
            i = j + 3
            continue
    i += 1

print(json.dumps(records, ensure_ascii=False))
