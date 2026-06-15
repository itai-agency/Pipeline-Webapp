"""One-off: compare PDF motivo prefix vs Supabase timeline max pre-reject tier."""
import json
import re
import subprocess
import sys
from collections import Counter

from pypdf import PdfReader

PDF = r"c:\Users\calec\Downloads\Auditoria_Kommo_Ene-Jun2026-1 completo.pdf"


def parse_pdf_rechazados() -> list[dict]:
    lines = "\n".join((p.extract_text() or "") for p in PdfReader(PDF).pages).split("\n")
    records: list[dict] = []
    i = 0
    while i < len(lines) - 5:
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
                    records.append({"id": lid, "motivo": motivo})
                i = j + 3
                continue
        i += 1
    return records


def motivo_tier(motivo: str) -> str:
    u = (motivo or "").upper().strip()
    if not motivo or u in ("SIN ESPECIFICAR", "—", "-", ""):
        return "unknown"
    if u.startswith("MQL-"):
        return "mql"
    if u.startswith("SQL-"):
        return "sql"
    if u.startswith("CITA-"):
        return "cita"
    if u.startswith("LXC-") or u.startswith("LX-"):
        return "entrada"
    return "other"


def main() -> None:
    rech = parse_pdf_rechazados()
    with_motivo = [r for r in rech if motivo_tier(r["motivo"]) != "unknown"]
    ids = [r["id"] for r in with_motivo]

    # Node fetches timeline max tier from Supabase
    node = r"""
import { getSupabaseAdmin } from './server/lib/supabase.js';
import { kommoGet } from './server/lib/kommoApi.js';
import { classifyKommoStageTier } from './server/config/kommoStageMap.js';

const ids = JSON.parse(process.argv[1]);
const TIER_RANK = { rejected:-1, entrada:0, mql:1, sql:2, cita:3, ofertado:4, firmado:5 };
const RANK_TIER = ['rejected','entrada','mql','sql','cita','ofertado','firmado'];

const pipes = await kommoGet('/leads/pipelines');
const statusTier = new Map();
for (const p of pipes._embedded?.pipelines ?? [])
  for (const s of p._embedded?.statuses ?? []) statusTier.set(s.id, classifyKommoStageTier(s.name));

const supabase = getSupabaseAdmin();
const out = {};
for (let i = 0; i < ids.length; i += 300) {
  const chunk = ids.slice(i, i + 300);
  const { data } = await supabase.from('kommo_lead_events')
    .select('kommo_lead_id,status_id,event_date,raw_payload')
    .in('kommo_lead_id', chunk).not('kommo_event_id','is',null);
  const byLead = new Map();
  for (const row of data ?? []) {
    const list = byLead.get(row.kommo_lead_id) ?? [];
    list.push(row);
    byLead.set(row.kommo_lead_id, list);
  }
  for (const id of chunk) {
    const events = (byLead.get(id) ?? []).sort((a,b) => {
      const ta = Number(a.raw_payload?.created_at ?? a.event_date);
      const tb = Number(b.raw_payload?.created_at ?? b.event_date);
      return ta - tb;
    });
    if (!events.length) { out[id] = { max: -2, label: 'sin_eventos', n: 0 }; continue; }
    let max = -2;
    for (const ev of events) {
      const tier = statusTier.get(ev.status_id ?? 0) ?? 'entrada';
      if (tier === 'rejected') break;
      max = Math.max(max, TIER_RANK[tier] ?? 0);
    }
    out[id] = { max, label: max >= 0 ? RANK_TIER[max + 1] : 'sin_eventos', n: events.length };
  }
}
console.log(JSON.stringify(out));
"""
    proc = subprocess.run(
        ["node", "--use-system-ca", "--import", "tsx", "-e", node, json.dumps(ids)],
        cwd=r"c:\Users\calec\OneDrive\Documentos\GitHub\Pipeline-Webapp",
        capture_output=True,
        text=True,
        timeout=300,
    )
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        sys.exit(proc.returncode)
    timeline = json.loads(proc.stdout.strip().split("\n")[-1])

    agree = disagree = no_events = no_tier = 0
    agree_mqlplus = disagree_mqlplus = 0
    mismatch_by = Counter()
    mismatches: list[dict] = []
    no_ev_by_tier = Counter()
    recoverable_mqlplus = 0

    no_tier_samples: list[dict] = []

    for r in with_motivo:
        mt = motivo_tier(r["motivo"])
        mr = {"entrada": 0, "mql": 1, "sql": 2, "cita": 3}.get(mt, -99)
        tl = timeline.get(str(r["id"]), timeline.get(r["id"], {}))
        n = tl.get("n", 0)
        if n == 0:
            no_events += 1
            no_ev_by_tier[mt] += 1
            if mt in ("mql", "sql", "cita"):
                recoverable_mqlplus += 1
            continue
        if tl.get("max") == -2:
            no_tier += 1
            if len(no_tier_samples) < 12:
                no_tier_samples.append(
                    {"id": r["id"], "motivo": r["motivo"], "motivo_tier": mt, "event_count": n}
                )
            continue
        if tl.get("max") == mr:
            agree += 1
            if mt in ("mql", "sql", "cita"):
                agree_mqlplus += 1
        else:
            disagree += 1
            if mt in ("mql", "sql", "cita"):
                disagree_mqlplus += 1
            key = f"{mt}->{tl.get('label')}"
            mismatch_by[key] += 1
            if len(mismatches) < 20:
                mismatches.append(
                    {"id": r["id"], "motivo": r["motivo"], "motivo_tier": mt, "timeline_max": tl.get("label")}
                )

    result = {
        "pdf_rechazados_total": len(rech),
        "con_motivo_util": len(with_motivo),
        "sin_especificar": len(rech) - len(with_motivo),
        "literal_sin_eventos": no_events,
        "con_eventos_sin_tier_inferible": no_tier,
        "con_timeline_util": agree + disagree,
        "recoverable_mql_sql_cita_sin_eventos": recoverable_mqlplus,
        "no_eventos_por_motivo_tier": dict(no_ev_by_tier),
        "agree": agree,
        "disagree": disagree,
        "agree_pct_mql_sql_cita": round(
            100 * agree_mqlplus / max(1, agree_mqlplus + disagree_mqlplus), 1
        ),
        "mismatch_patterns": dict(mismatch_by.most_common(15)),
        "no_tier_by_motivo": dict(
            Counter(
                motivo_tier(r["motivo"])
                for r in with_motivo
                if timeline.get(str(r["id"]), timeline.get(r["id"], {})).get("max") == -2
                and timeline.get(str(r["id"]), timeline.get(r["id"], {})).get("n", 0) > 0
            ).most_common()
        ),
        "sample_no_tier": no_tier_samples,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
