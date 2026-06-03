import { currentMonthRange } from "../server/lib/dateRanges.js";
import { syncMetaSpend } from "../server/services/meta.service.js";
import { refreshAndBroadcast } from "../server/services/metrics.service.js";

const range = currentMonthRange();

async function main() {
  console.log(`Sync Meta ${range.since} → ${range.until}`);
  const result = await syncMetaSpend(range);
  console.log(`Upserted ${result.processed} filas`);
  if (result.skipped.length > 0) {
    for (const s of result.skipped) {
      console.warn(`  omitido ${s.client}: ${s.reason}`);
    }
  }
  await refreshAndBroadcast();
  console.log("Métricas actualizadas");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
