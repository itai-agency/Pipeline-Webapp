import { currentMonthRange } from "../server/lib/dateRanges.js";
import { syncMetaSpend } from "../server/services/meta.service.js";
import { refreshAndBroadcast } from "../server/services/metrics.service.js";

const range = currentMonthRange();

async function main() {
  console.log(`Sync Meta ${range.since} → ${range.until}`);
  const n = await syncMetaSpend(range);
  console.log(`Upserted ${n} filas`);
  await refreshAndBroadcast();
  console.log("Métricas actualizadas");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
