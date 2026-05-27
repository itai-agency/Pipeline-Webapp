import { currentMonthRange } from "../server/lib/dateRanges.js";
import { syncKommoLeads } from "../server/services/kommo.service.js";
import { refreshAndBroadcast } from "../server/services/metrics.service.js";

const range = currentMonthRange();

async function main() {
  console.log(`Sync Kommo (updated_at) ${range.since} → ${range.until}`);
  const { processed, skipped } = await syncKommoLeads({
    since: range.since,
    until: range.until,
    dateFilter: "updated_at",
    eventDateField: "updated_at",
  });
  console.log(`  ${processed} leads, ${skipped} omitidos`);
  await refreshAndBroadcast(range);
  console.log("Métricas diarias reconstruidas desde kommo_lead_events");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
