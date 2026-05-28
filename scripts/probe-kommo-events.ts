/**
 * Cuenta eventos lead_status_changed en Kommo para un rango (sin escribir en BD).
 */
import "../server/config/env.js";
import { isKommoConfigured } from "../server/config/env.js";
import { syncKommoStatusChangeEvents } from "../server/services/kommoTimeline.service.js";

const since = process.env.KOMMO_PROBE_SINCE ?? "2026-05-01";
const until = process.env.KOMMO_PROBE_UNTIL ?? "2026-05-26";
const dryRun = !process.argv.includes("--write");

async function main(): Promise<void> {
  if (!isKommoConfigured()) {
    console.error("Kommo no configurado");
    process.exit(1);
  }
  console.log(`Rango: ${since} → ${until}  dryRun=${dryRun}\n`);
  if (dryRun) {
    const { kommoGet } = await import("../server/lib/kommoApi.js");
    const from = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
    const to = Math.floor(new Date(`${until}T23:59:59`).getTime() / 1000);
    const data = await kommoGet<{ _embedded?: { events?: unknown[] } }>("/events", {
      params: {
        page: 1,
        limit: 250,
        "filter[type]": "lead_status_changed",
        "filter[entity]": "lead",
        "filter[created_at][from]": from,
        "filter[created_at][to]": to,
      },
    });
    const n = data._embedded?.events?.length ?? 0;
    console.log(`Primera página: ${n} eventos (máx 250 por página; hay más si n=250)`);
    console.log("Para importar: npm run backfill:kommo-year");
    return;
  }
  const { processed, skipped } = await syncKommoStatusChangeEvents({ since, until });
  console.log(`Importados: ${processed}  omitidos: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
