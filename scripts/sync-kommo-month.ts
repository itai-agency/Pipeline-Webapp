import { currentMonthRange } from "../server/lib/dateRanges.js";
import { syncKommoSnapshotMetrics } from "../server/services/kommo.service.js";
import { refreshAndBroadcast } from "../server/services/metrics.service.js";

const range = currentMonthRange();

async function main() {
  console.log(`Sync Kommo snapshot (todos los clientes) ${range.since} → ${range.until}`);
  const { processed, snapshots } = await syncKommoSnapshotMetrics({
    snapshotDate: range.until,
    monthStart: range.since,
    monthEnd: range.until,
  });
  for (const s of snapshots.sort((a, b) => a.client.localeCompare(b.client))) {
    console.log(`  ${s.client}: leads=${s.leads} mql=${s.reachedMql} sql=${s.reachedSql}`);
  }
  await refreshAndBroadcast(range, { kommoMode: "meta_only" });
  console.log(`Métricas actualizadas (${processed} clientes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
