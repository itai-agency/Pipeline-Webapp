#!/usr/bin/env bash
set -euo pipefail

PROJECT="/home/ubuntu/pipeline-clientes-sinahi"
OUT_JSONL="$PROJECT/meta_daily_spend.jsonl"
OUT_JSON="$PROJECT/meta_daily_spend.json"
OUT_TS="$PROJECT/client/src/lib/metaSpendData.ts"
: > "$OUT_JSONL"

# client|accountName|accountId
ACCOUNTS=(
  "MANOS AL HOGAR|Manos al hogar Publicidad|act_1581946449839805"
  "INQ|inq inmobiliaria cp|act_1584938395981836"
  "HOGARES|CInmubles Bajio|act_349294690945338"
  "GRUPO ELIJO|GRUPO ELIJO CP|act_864948876563125"
  "INSPIRA|Inspira Bienes Raices CP|act_949679304398951"
  "DOS HOGARES|IIHogares GDL CP|act_2175146543225091"
)
DATES=(
  "2026-05-01" "2026-05-02" "2026-05-03" "2026-05-04" "2026-05-05"
  "2026-05-06" "2026-05-07" "2026-05-08" "2026-05-09" "2026-05-10"
)

for account in "${ACCOUNTS[@]}"; do
  IFS='|' read -r CLIENT ACCOUNT_NAME ACCOUNT_ID <<< "$account"
  for DAY in "${DATES[@]}"; do
    echo "Consultando $DAY | $CLIENT | $ACCOUNT_ID" >&2
    BEFORE=$(find /tmp/manus-mcp -maxdepth 1 -name 'mcp_result_*.json' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | awk '{print $2}' || true)
    manus-mcp-cli tool call meta_marketing_get_insights --server meta-marketing --input "{\"object_type\":\"ad_account\",\"object_id\":\"$ACCOUNT_ID\",\"time_range\":{\"since\":\"$DAY\",\"until\":\"$DAY\"},\"limit\":20}" >/tmp/meta_call_last.out
    RESULT=$(find /tmp/manus-mcp -maxdepth 1 -name 'mcp_result_*.json' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | awk '{print $2}')
    if [[ -z "$RESULT" || "$RESULT" == "$BEFORE" ]]; then
      echo "No se generó resultado nuevo para $CLIENT $DAY" >&2
      cat /tmp/meta_call_last.out >&2 || true
      exit 1
    fi
    python3.11 - "$RESULT" "$DAY" "$CLIENT" "$ACCOUNT_NAME" "$ACCOUNT_ID" "$OUT_JSONL" <<'PY'
import json, sys
from pathlib import Path
result_path, day, client, account_name, account_id, out_jsonl = sys.argv[1:]
data = json.loads(Path(result_path).read_text())
spend = 0.0
if data:
    spend = float(data[0].get('spend') or 0)
row = {
    'date': day,
    'client': client,
    'accountName': account_name,
    'accountId': account_id,
    'spend': round(spend, 2),
}
with open(out_jsonl, 'a', encoding='utf-8') as f:
    f.write(json.dumps(row, ensure_ascii=False) + '\n')
print(f"{day} | {client} | ${spend:,.2f}")
PY
  done
done

python3.11 - "$OUT_JSONL" "$OUT_JSON" "$OUT_TS" <<'PY'
import json, sys
from pathlib import Path
jsonl, out_json, out_ts = map(Path, sys.argv[1:])
rows = [json.loads(line) for line in jsonl.read_text(encoding='utf-8').splitlines() if line.strip()]
out_json.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
header = '''/**
 * Filosofía visual: Swiss International Typographic Style aplicado a un war room ejecutivo de ventas.
 * Este archivo conecta inversión publicitaria con citas para que la temporalidad elegida tenga lectura financiera inmediata.
 * Cuando se agreguen datos, preguntarse: ¿esto refuerza o diluye la capacidad de destrabar el pipeline hoy?
 */

export type MetaSpendRow = {
  date: string;
  client: string;
  accountName: string;
  accountId: string;
  spend: number;
};

export const metaSpendData = '''
out_ts.write_text(header + json.dumps(rows, ensure_ascii=False, indent=2) + ' as const satisfies readonly MetaSpendRow[];\n', encoding='utf-8')
print(f"Generadas {len(rows)} filas en {out_ts}")
PY
