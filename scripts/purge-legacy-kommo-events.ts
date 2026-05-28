/**
 * Elimina filas antiguas (sync por estado actual) sin kommo_event_id.
 * Evita doble conteo al agregar timeline.
 */
import "../server/config/env.js";
import { getSupabaseAdmin } from "../server/lib/supabase.js";
import { isSupabaseConfigured } from "../server/config/env.js";

async function main(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error("Sin Supabase");
    process.exit(1);
  }
  const supabase = getSupabaseAdmin()!;
  const { count, error: countErr } = await supabase
    .from("kommo_lead_events")
    .select("id", { count: "exact", head: true })
    .is("kommo_event_id", null);

  if (countErr) {
    console.error(countErr.message);
    process.exit(1);
  }

  console.log(`Filas a borrar (sin kommo_event_id): ${count ?? 0}`);
  if (!count) {
    console.log("Nada que purgar.");
    return;
  }

  const { error } = await supabase.from("kommo_lead_events").delete().is("kommo_event_id", null);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log("Listo. Ejecuta rebuild: npm run rebuild:kommo-daily -- --since 2026-01-01 --until 2026-05-26");
}

main();
