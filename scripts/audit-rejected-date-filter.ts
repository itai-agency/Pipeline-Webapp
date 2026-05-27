/**
 * ¿El HTML cuenta solo rechazados del periodo (mayo 2026)?
 */
import "../server/config/env.js";
import { getKommoClientMap } from "../server/config/env.js";
import { kommoGet } from "../server/lib/kommoApi.js";

const HTML_REJECTED: Record<string, number> = {
  HOGARES: 128,
  INQ: 350,
  INSPIRA: 41,
  "GRUPO ELIJO": 353,
  "DOS HOGARES": 81,
  "MANOS AL HOGAR": 183,
};

async function findRejectedStatusId(pipelineId: number): Promise<number | null> {
  const data = await kommoGet<{
    _embedded?: { pipelines?: Array<{ id: number; _embedded?: { statuses?: Array<{ id: number; name: string }> } }> };
  }>("/leads/pipelines");
  const p = data._embedded?.pipelines?.find((x) => x.id === pipelineId);
  const s = p?._embedded?.statuses?.find((st) => /rechaz/i.test(st.name));
  return s?.id ?? null;
}

async function countRejected(
  pipelineId: number,
  statusId: number,
  extra?: Record<string, number>,
): Promise<number> {
  let total = 0;
  let page = 1;
  while (true) {
    const params: Record<string, number> = {
      page,
      limit: 250,
      "filter[statuses][0][pipeline_id]": pipelineId,
      "filter[statuses][0][status_id]": statusId,
      ...extra,
    };
    const data = await kommoGet<{ _embedded?: { leads?: unknown[] } }>("/leads", { params });
    const rows = data._embedded?.leads ?? [];
    total += rows.length;
    if (rows.length < 250) break;
    page += 1;
  }
  return total;
}

function may2026Unix(): { from: number; to: number } {
  const from = Math.floor(new Date("2026-05-01T00:00:00-06:00").getTime() / 1000);
  const to = Math.floor(new Date("2026-05-26T23:59:59-06:00").getTime() / 1000);
  return { from, to };
}

async function main(): Promise<void> {
  const { from, to } = may2026Unix();
  const clientMap = getKommoClientMap();

  console.log("Cliente          | Rechazado ALL | created_at mayo | updated_at mayo | HTML\n");

  for (const [pid, client] of Object.entries(clientMap)) {
    const pipelineId = Number(pid);
    const statusId = await findRejectedStatusId(pipelineId);
    if (!statusId) {
      console.log(`${client}: sin etapa rechazado`);
      continue;
    }
    const all = await countRejected(pipelineId, statusId);
    const byCreated = await countRejected(pipelineId, statusId, {
      "filter[created_at][from]": from,
      "filter[created_at][to]": to,
    });
    const byUpdated = await countRejected(pipelineId, statusId, {
      "filter[updated_at][from]": from,
      "filter[updated_at][to]": to,
    });
    const html = HTML_REJECTED[client] ?? 0;
    console.log(
      `${client.padEnd(16)} | ${String(all).padStart(13)} | ${String(byCreated).padStart(15)} | ${String(byUpdated).padStart(15)} | ${html}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
