import "../server/config/env.js";
import { KOMMO_CONTROL_REFERENCE } from "../server/config/kommoControlReference.js";
import { buildKommoMonthlyCohortSnapshots } from "../server/services/kommo.service.js";

const snaps = await buildKommoMonthlyCohortSnapshots("2026-05-01", "2026-05-26");
let exact = 0;
for (const s of snaps.sort((a, b) => a.client.localeCompare(b.client))) {
  const h = KOMMO_CONTROL_REFERENCE.clients[s.client];
  if (!h) continue;
  const ok =
    s.leads === h.leads &&
    s.reachedMql === h.reachedMql &&
    s.reachedSql === h.reachedSql &&
    s.reachedCita === h.reachedCita;
  if (ok) exact += 1;
  console.log(
    `${s.client.padEnd(16)} leads ${s.leads}/${h.leads}  mql ${s.reachedMql}/${h.reachedMql}  sql ${s.reachedSql}/${h.reachedSql}  cita ${s.reachedCita}/${h.reachedCita}  ${ok ? "✓✓✓" : ""}`,
  );
}
console.log(`\nExact: ${exact}/6`);
