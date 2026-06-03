"""Compara pipelineData.before.ts vs Excel mayo 1-26."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
ts = (root / "data_backups/rerun_20260507_183624/pipelineData.before.ts").read_text(encoding="utf-8")
xlsx = json.loads((root / "reports/manual_xlsx_deep.json").read_text(encoding="utf-8"))["mayo_1_26_sum"]

clients = ["HOGARES", "INQ", "INSPIRA", "GRUPO ELIJO", "DOS HOGARES", "MANOS AL HOGAR"]
agg = {c: {"conv": 0, "mql": 0} for c in clients}

pat = re.compile(
    r'"FECHA": "2026-05-(\d{2})".*?"CLIENTE": "([^"]+)".*?"CONVERSACIONES": (\d+).*?"MQL": (\d+)',
    re.S,
)
for m in pat.finditer(ts):
    if int(m.group(1)) > 26:
        continue
    c = m.group(2)
    if c not in agg:
        continue
    agg[c]["conv"] += int(m.group(3))
    agg[c]["mql"] += int(m.group(4))

print("Cliente          | TS conv | XLS conv | TS mql | XLS mql | match?")
for c in clients:
    a, x = agg[c], xlsx[c]
    ok = a["conv"] == x["conv"] and a["mql"] == x["mql"]
    print(
        f"{c:16} | {a['conv']:7} | {x['conv']:8.0f} | {a['mql']:6} | {x['mql']:7.0f} | {'OK' if ok else 'DIFF'}"
    )
