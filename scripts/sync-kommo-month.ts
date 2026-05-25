import { currentMonthRange } from "../server/lib/dateRanges.js";
import { syncKommoLeads } from "../server/services/kommo.service.js";
import { refreshAndBroadcast } from "../server/services/metrics.service.js";

const range = currentMonthRange();

async function main() {
  console.log(`Sync Kommo ${range.since} → ${range.until}`);
  const n = await syncKommoLeads(range);
  console.log(`Leads procesados: ${n}`);
  await refreshAndBroadcast();
  console.log("Métricas y snapshot actualizados");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
