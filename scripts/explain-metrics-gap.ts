/**
 * Explica por qué API / BD / dashboard / HTML no cuadran (sin escribir en BD).
 */
import "../server/config/env.js";
import { env, getKommoClientMap, isKommoConfigured, isSupabaseConfigured } from "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import {
  classifyKommoStageTier,
  metricsFromClientSnapshot,
  newClientSnapshot,
} from "../server/config/kommoStageMap.js";
import { currentMonthRange } from "../server/lib/dateRanges.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { kommoGet } from "../server/lib/kommoApi.js";

const HTML_KOMMO_DATA: Record<string, { leads: number; stages: Record<string, number> }> = {
  HOGARES: { leads: 187, stages: { entrada: 29, mql: 24, sql: 3, cita: 3, rejected: 128 } },
  INQ: { leads: 402, stages: { entrada: 41, mql: 2, sql: 2, cita: 7, rejected: 350 } },
  INSPIRA: { leads: 80, stages: { entrada: 30, mql: 4, sql: 3, cita: 2, rejected: 41 } },
  "GRUPO ELIJO": { leads: 438, stages: { entrada: 80, mql: 4, sql: 1, rejected: 353 } },
  "DOS HOGARES": { leads: 99, stages: { entrada: 14, mql: 3, sql: 1, rejected: 81 } },
  "MANOS AL HOGAR": { leads: 287, stages: { entrada: 87, mql: 12, sql: 1, cita: 4, rejected: 183 } },
};

async function apiCensusForPipeline(pipelineId: number): Promise<{
  byTier: Record<string, number>;
  leads: number;
  reachedMql: number;
  rejectedInStatus: number;
}> {
  const snap = newClientSnapshot("_");
  const pipes = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string; type?: number }> } }> };
  }>("/leads/pipelines");
  const pipeline = pipes._embedded?.pipelines?.find((p) => p.id === pipelineId);
  let rejectedInStatus = 0;

  for (const status of pipeline?._embedded?.statuses ?? []) {
    if (status.type === 1) continue;
    if (classifyKommoStageTier(status.name) === "firmado") continue;

    let page = 1;
    let statusCount = 0;
    while (true) {
      const data = await kommoGet<{ _embedded?: { leads?: unknown[] } }>("/leads", {
        params: {
          page,
          limit: 250,
          "filter[statuses][0][pipeline_id]": pipelineId,
          "filter[statuses][0][status_id]": status.id,
        },
      });
      const n = data._embedded?.leads?.length ?? 0;
      statusCount += n;
      if (n < 250) break;
      page += 1;
    }

    const tier = classifyKommoStageTier(status.name);
    if (tier === "rejected") rejectedInStatus += statusCount;
    for (let i = 0; i < statusCount; i += 1) {
      snap.client = "_";
      const before = snap.leads;
      snap.leads += 1;
      snap.byTier[tier] += 1;
      if (tier === "mql" || tier === "sql" || tier === "cita" || tier === "ofertado" || tier === "firmado") {
        snap.reachedMql += tier === "mql" || tier === "sql" || tier === "cita" || tier === "ofertado" || tier === "firmado" ? 1 : 0;
      }
      void before;
    }
  }

  const m = metricsFromClientSnapshot(snap);
  return {
    byTier: snap.byTier as unknown as Record<string, number>,
    leads: snap.leads,
    reachedMql: m.mql,
    rejectedInStatus,
  };
}

async function main(): Promise<void> {
  const month = currentMonthRange();
  const useRef = env.KOMMO_USE_CONTROL_REFERENCE !== false;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  POR QUÉ NO CUADRAN LOS NÚMEROS (4 capas distintas)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("A) HTML del jefe (index-1.html) mezcla DOS fuentes:");
  console.log("   · dailyRaw / RESPALDO_DIARIO → conversaciones por DÍA (actividad del mes)");
  console.log("   · kommoData → censo por ETAPA al corte (ej. 99 leads DOS HOGARES)");
  console.log("   · kommoPipeline → embudo reached* (histórico/manual, NO suma de etapas)\n");

  console.log("B) API Kommo (censo por filter[statuses]) cuenta TODOS los leads");
  console.log("   que HOY están en cada columna del pipeline (inventario acumulado).\n");

  console.log("C) dashboard_metrics_daily según cómo sincronices:");
  console.log("   · sync:kommo-snapshot → 1 fila/corte (borra mes, escribe fecha corte)");
  console.log(`   · KOMMO_USE_CONTROL_REFERENCE=${useRef} → embudo = HTML kommoPipeline, no API`);
  console.log("   · backfill created_at + aggregate → SUMA eventos por día (≠ snapshot)\n");

  console.log("D) Dashboard React (Home.tsx) → sumRows() SUMA todas las filas del filtro.");
  console.log("   Correcto para RESPALDO_DIARIO diario; INCORRECTO si mezclas días de backfill.\n");

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      console.log(`── Supabase dashboard_metrics_daily (${month.since} → ${month.until}) ──\n`);
      const { data, error } = await supabase
        .from("dashboard_metrics_daily")
        .select("metric_date, client, conversaciones, mql, sql, citas, firmas")
        .gte("metric_date", month.since)
        .lte("metric_date", month.until)
        .order("metric_date", { ascending: true });

      if (error) {
        console.log("  Error leyendo BD:", error.message);
      } else {
        const byClient = new Map<string, typeof data>();
        for (const row of data ?? []) {
          const c = row.client as string;
          if (!byClient.has(c)) byClient.set(c, []);
          byClient.get(c)!.push(row);
        }

        for (const [client, rows] of [...byClient.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
          const sum = rows.reduce(
            (acc, r) => ({
              conv: acc.conv + ((r.conversaciones as number) ?? 0),
              mql: acc.mql + ((r.mql as number) ?? 0),
              sql: acc.sql + ((r.sql as number) ?? 0),
              citas: acc.citas + ((r.citas as number) ?? 0),
            }),
            { conv: 0, mql: 0, sql: 0, citas: 0 },
          );
          const last = rows.filter((r) => (r.conversaciones as number) > 0 || (r.mql as number) > 0).at(-1);
          const ref = KOMMO_CONTROL_REFERENCE.clients[client];
          const html = HTML_KOMMO_DATA[client];
          console.log(`  ${client}:`);
          console.log(`    filas en mes: ${rows.length}  |  SUMA conv/mql (lo que ve el dashboard): ${sum.conv}/${sum.mql}`);
          console.log(
            `    última fila con embudo>0: ${last?.metric_date ?? "—"} → conv=${last?.conversaciones ?? 0} mql=${last?.mql ?? 0}`,
          );
          if (ref) {
            console.log(`    HTML kommoPipeline (control): conv=${ref.leads} mql=${ref.reachedMql}`);
          }
          if (html) {
            console.log(`    HTML kommoData (suma etapas):  leads=${html.leads}`);
          }
          if (ref && sum.conv !== ref.leads) {
            console.log(`    ⚠ SUMA del filtro ≠ HTML snapshot → ${sum.conv - ref.leads >= 0 ? "+" : ""}${sum.conv - ref.leads}`);
          }
        }
        console.log("");
      }
    }
  }

  if (!isKommoConfigured()) {
    console.log("Kommo no configurado o DNS caído — omitiendo censo API en vivo.\n");
    return;
  }

  console.log("── API en vivo vs HTML (solo DOS HOGARES, más rápido) ──\n");
  const clientMap = getKommoClientMap();
  const dosId = Object.entries(clientMap).find(([, c]) => c === "DOS HOGARES")?.[0];
  if (dosId) {
    try {
      const api = await apiCensusForPipeline(Number(dosId));
      const html = HTML_KOMMO_DATA["DOS HOGARES"];
      const ref = KOMMO_CONTROL_REFERENCE.clients["DOS HOGARES"];
      console.log(`  DOS HOGARES API: leads=${api.leads} reachedMql(actual)=${api.reachedMql} rechazados_en_columna=${api.rejectedInStatus}`);
      console.log(`  HTML kommoData:  leads=${html.leads} (rechazados etapa=${html.stages.rejected})`);
      console.log(`  HTML kommoPipeline: leads=${ref.leads} reachedMql=${ref.reachedMql}`);
      console.log(`  Δ leads API−HTML: ${api.leads - html.leads}`);
      console.log(`  Δ rechazados API−HTML: ${api.rejectedInStatus - html.stages.rejected}\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  Error API: ${msg}\n`);
    }
  }

  console.log("── Conclusión ──");
  console.log("  1. No compares SUMA mensual del dashboard con kommoData de un solo día.");
  console.log("  2. No compares API censo bruto con kommoData sin el mismo filtro de rechazados.");
  console.log("  3. reachedMql del HTML NO es conteo por etapa actual; la API no lo reproduce sin historial.");
  console.log("  4. Tras backfill, ejecuta sync:kommo-snapshot o la SUMA del mes se infla.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
