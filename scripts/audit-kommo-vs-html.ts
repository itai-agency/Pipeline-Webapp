/**
 * Diagnóstico: por qué la API ≠ HTML (conteo por etapa Kommo).
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { classifyKommoStageTier } from "../server/config/kommoStageMap.js";
import { kommoGet } from "../server/lib/kommoApi.js";

const HTML_STAGES: Record<string, Record<string, number>> = {
  HOGARES: {
    "Lead por Calificar": 29,
    MQL: 24,
    SQL: 3,
    Cita: 3,
    Rechazados: 128,
  },
  INQ: {
    "Lead por Calificar": 41,
    MQL: 2,
    SQL: 2,
    Cita: 7,
    Rechazados: 350,
  },
  INSPIRA: {
    "Lead por Calificar": 30,
    MQL: 4,
    SQL: 3,
    Cita: 2,
    Rechazados: 41,
  },
  "GRUPO ELIJO": {
    "Lead por Calificar": 80,
    MQL: 4,
    SQL: 1,
    Rechazados: 353,
  },
  "DOS HOGARES": {
    "Lead por Calificar": 14,
    MQL: 3,
    SQL: 1,
    Rechazados: 81,
  },
  "MANOS AL HOGAR": {
    "Lead por Calificar": 87,
    MQL: 12,
    SQL: 1,
    Cita: 4,
    Rechazados: 183,
  },
};

type StatusRow = { id: number; name: string; type?: number; sort?: number };

async function countLeadsInStatus(pipelineId: number, statusId: number): Promise<number> {
  let total = 0;
  let page = 1;
  while (true) {
    const data = await kommoGet<{ _embedded?: { leads?: unknown[] } }>("/leads", {
      params: {
        page,
        limit: 250,
        "filter[statuses][0][pipeline_id]": pipelineId,
        "filter[statuses][0][status_id]": statusId,
      },
    });
    const rows = data._embedded?.leads ?? [];
    total += rows.length;
    if (rows.length < 250) break;
    page += 1;
  }
  return total;
}

function normalizeStageName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mapToHtmlBucket(statusName: string): string {
  const n = normalizeStageName(statusName);
  if (/rechaz|perdid|lost|descart/.test(n)) return "Rechazados";
  if (/\bmql\b/.test(n)) return "MQL";
  if (/\bsql\b/.test(n)) return "SQL";
  if (/cita/.test(n)) return "Cita";
  if (/entrante/.test(n)) return "Leads Entrantes";
  if (/calificar/.test(n)) return "Lead por Calificar";
  if (/firmado|won/.test(n)) return "Firmado (excl.)";
  if (/ofertado/.test(n)) return "Ofertado";
  return `Otro: ${statusName}`;
}

async function main(): Promise<void> {
  const data = await kommoGet<{
    _embedded?: {
      pipelines?: Array<{
        id: number;
        name: string;
        is_archive?: boolean;
        _embedded?: { statuses?: StatusRow[] };
      }>;
    };
  }>("/leads/pipelines");

  const clientMap = getKommoClientMap();

  for (const [pid, client] of Object.entries(clientMap)) {
    const pipelineId = Number(pid);
    const pipeline = data._embedded?.pipelines?.find((p) => p.id === pipelineId);
    if (!pipeline) continue;

    console.log(`\n${"=".repeat(72)}`);
    console.log(`${client} (pipeline ${pipelineId} "${pipeline.name}") archive=${pipeline.is_archive ?? false}`);
    console.log("=".repeat(72));

    const html = HTML_STAGES[client] ?? {};
    const apiByBucket = new Map<string, number>();
    const apiByStatus: Array<{ name: string; type?: number; count: number; bucket: string }> = [];

    for (const status of pipeline._embedded?.statuses ?? []) {
      const count = await countLeadsInStatus(pipelineId, status.id);
      const bucket = mapToHtmlBucket(status.name);
      apiByBucket.set(bucket, (apiByBucket.get(bucket) ?? 0) + count);
      apiByStatus.push({ name: status.name, type: status.type, count, bucket });
    }

    apiByStatus.sort((a, b) => b.count - a.count);
    console.log("\n--- API: cada etapa Kommo (type 0=activo 1=ganado 2=perdido) ---");
    for (const row of apiByStatus) {
      if (row.count === 0) continue;
      console.log(
        `  [type ${row.type ?? "?"}] ${row.name}: ${row.count} → bucket "${row.bucket}"`,
      );
    }

    const apiTotal = apiByStatus.reduce((s, r) => s + r.count, 0);
    const apiExclWon = apiByStatus.filter((r) => r.type !== 1).reduce((s, r) => s + r.count, 0);

    console.log("\n--- API agrupado (buckets como HTML) vs HTML ---");
    const allBuckets = new Set([...Object.keys(html), ...apiByBucket.keys()]);
    for (const bucket of Array.from(allBuckets).sort()) {
      const api = apiByBucket.get(bucket) ?? 0;
      const ref = html[bucket] ?? 0;
      const delta = api - ref;
      const flag = delta === 0 ? "✓" : "≠";
      console.log(`  ${flag} ${bucket.padEnd(22)} API=${String(api).padStart(4)}  HTML=${String(ref).padStart(4)}  Δ=${delta >= 0 ? "+" : ""}${delta}`);
    }

    const htmlTotal = Object.values(html).reduce((a, b) => a + b, 0);
    console.log(`\n  TOTAL API (todas etapas): ${apiTotal}`);
    console.log(`  TOTAL API (sin type=ganado): ${apiExclWon}`);
    console.log(`  TOTAL HTML: ${htmlTotal}`);
    console.log(`  Δ total: ${apiTotal - htmlTotal}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
