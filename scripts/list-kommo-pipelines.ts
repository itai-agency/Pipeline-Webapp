import axios from "axios";
import "../server/config/env.js";
import { env } from "../server/config/env.js";

async function main() {
  const url = `https://${env.KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/pipelines`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${env.KOMMO_ACCESS_TOKEN}` },
  });
  const pipelines = (res.data as { _embedded?: { pipelines?: Array<{ id: number; name: string }> } })
    ._embedded?.pipelines ?? [];
  console.log("Pipelines para KOMMO_CLIENT_MAP:\n");
  const map: Record<string, string> = {};
  for (const p of pipelines) {
    console.log(`  ${p.id} → ${p.name}`);
    map[String(p.id)] = p.name.toUpperCase();
  }
  console.log("\nJSON sugerido:\n", JSON.stringify(map, null, 2));
}

main().catch(console.error);
