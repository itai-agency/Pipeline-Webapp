#!/usr/bin/env python3
"""Consulta gasto diario de Meta Ads para el dashboard estático.

Filosofía visual/datos: Swiss war room operativo; los datos deben permitir cambiar temporalidad sin perder trazabilidad.
"""
from __future__ import annotations

import json
import subprocess
from datetime import date, timedelta
from pathlib import Path

PROJECT = Path('/home/ubuntu/pipeline-clientes-sinahi')
OUTPUT_JSON = PROJECT / 'meta_daily_spend.json'
OUTPUT_TS = PROJECT / 'client/src/lib/metaSpendData.ts'

CLIENT_ACCOUNTS = [
    {"client": "MANOS AL HOGAR", "accountName": "Manos al hogar Publicidad", "accountId": "act_1581946449839805"},
    {"client": "INQ", "accountName": "inq inmobiliaria cp", "accountId": "act_1584938395981836"},
    {"client": "HOGARES", "accountName": "CInmubles Bajio", "accountId": "act_349294690945338"},
    {"client": "GRUPO ELIJO", "accountName": "GRUPO ELIJO CP", "accountId": "act_864948876563125"},
    {"client": "INSPIRA", "accountName": "Inspira Bienes Raices CP", "accountId": "act_949679304398951"},
    {"client": "DOS HOGARES", "accountName": "IIHogares GDL CP", "accountId": "act_2175146543225091"},
]

START = date(2026, 5, 1)
END = date(2026, 5, 10)

def daterange(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def call_insights(account_id: str, day: date) -> float:
    payload = {
        "object_type": "ad_account",
        "object_id": account_id,
        "time_range": {"since": day.isoformat(), "until": day.isoformat()},
        "limit": 20,
    }
    cmd = [
        "manus-mcp-cli",
        "tool",
        "call",
        "meta_marketing_get_insights",
        "--server",
        "meta-marketing",
        "--input",
        json.dumps(payload),
    ]
    completed = subprocess.run(cmd, check=True, capture_output=True, text=True)
    marker = "MCP tool invocation result saved to:"
    result_path = None
    for idx, line in enumerate(completed.stdout.splitlines()):
        if marker in line and idx + 1 < len(completed.stdout.splitlines()):
            result_path = completed.stdout.splitlines()[idx + 1].strip()
            break
    if not result_path:
        for line in completed.stdout.splitlines():
            if line.strip().startswith('/tmp/manus-mcp/'):
                result_path = line.strip()
                break
    if not result_path:
        raise RuntimeError(f"No se pudo ubicar archivo de resultado para {account_id} {day}: {completed.stdout}")
    data = json.loads(Path(result_path).read_text())
    if not data:
        return 0.0
    first = data[0]
    return float(first.get('spend') or 0)


def main() -> None:
    rows = []
    for account in CLIENT_ACCOUNTS:
        for day in daterange(START, END):
            spend = call_insights(account['accountId'], day)
            rows.append({**account, "date": day.isoformat(), "spend": round(spend, 2)})
            print(f"{day.isoformat()} | {account['client']} | {spend:.2f}", flush=True)

    OUTPUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")

    ts = """/**\n * Filosofía visual: Swiss International Typographic Style aplicado a un war room ejecutivo de ventas.\n * Este archivo conecta inversión publicitaria con citas para que la temporalidad elegida tenga lectura financiera inmediata.\n * Cuando se agreguen datos, preguntarse: ¿esto refuerza o diluye la capacidad de destrabar el pipeline hoy?\n */\n\nexport type MetaSpendRow = {\n  date: string;\n  client: string;\n  accountName: string;\n  accountId: string;\n  spend: number;\n};\n\nexport const metaSpendData = """
    ts += json.dumps(rows, ensure_ascii=False, indent=2)
    ts += " as const satisfies readonly MetaSpendRow[];\n"
    OUTPUT_TS.write_text(ts)

if __name__ == '__main__':
    main()
